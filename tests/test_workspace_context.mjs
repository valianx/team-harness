#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  selectWorkspacePreference,
  validateContextBinding,
  resolveContextBinding,
} from "../skills/workspace/scripts/workspace-context.mjs";
import { normalizeSourceAssociations } from "../skills/workspace/scripts/context-values.mjs";
import {
  WORKSPACE_IDENTITY_SCHEMA_VERSION,
  discoverWorkspaceIdentity,
  resolveWorkspaceIdentity,
} from "../skills/pipeline/scripts/workspace-identity.mjs";

const fixture = JSON.parse(await readFile(new URL("./fixtures/workspace-preferences.json", import.meta.url), "utf8"));
assert.equal(fixture.schema_version, 1);
for (const { name, config, expected } of fixture.cases) {
  const before = JSON.stringify(config);
  assert.deepEqual(selectWorkspacePreference(config), expected, name);
  assert.equal(JSON.stringify(config), before, `${name} must not repair configuration`);
}
assert.deepEqual(selectWorkspacePreference(Object.create({ "workspace-mode": "gpt-space", "logs-mode": "obsidian" })), {
  status: "selected", mode: "local", selected_from: "default", conflict: false, reason_code: null,
}, "only own selector keys select a preference");

const remote = {
  kind: "gpt-space",
  space_id: "space_example",
  container_page_id: "page_workspace",
  effort_page_id: "page_effort",
  url: "https://chatgpt.com/space/page_effort",
  source_associations: [
    { kind: "repository", identity: "repository:merchant", role: "writable-owner", verified: true,
      canonical_source: "https://github.example/org/merchant.git",
      host_paths: [{ host: "laptop", path: "/checkout/merchant" }] },
    { kind: "repository", identity: "repository:transactions", role: "writable-owner", verified: true,
      host_paths: [{ host: "build-host", path: "/different/parent/transactions" }] },
    { kind: "repository", identity: "repository:reference", role: "evidence-only", verified: true },
  ],
  created_date: "2026-10-17",
  slug: "payment-flow",
};
const remoteBinding = { context: remote, operational_directory: null };
const selectedRemote = selectWorkspacePreference({ "workspace-mode": "gpt-space" });
const selectedLocal = selectWorkspacePreference({ "workspace-mode": "local" });
const invalidPreference = selectWorkspacePreference({ "workspace-mode": null, "logs-mode": "local" });

const mismatchedFileIdentity = { kind: "file", mode: "local", path: "/tmp/th-wrong-kind", identity: null };
assert.deepEqual(resolveContextBinding({ preference: selectedRemote, remoteIdentity: mismatchedFileIdentity }), {
  status: "invalid", binding: null, reason_code: "remote_kind_mismatch",
}, "an unbound remote preference cannot accept a file context through remoteIdentity");
for (const mode of ["local", "obsidian"]) {
  const preference = selectWorkspacePreference({ "workspace-mode": mode });
  const mismatchedRemoteIdentity = { ...remote, mode };
  assert.deepEqual(resolveContextBinding({ preference, fileIdentity: mismatchedRemoteIdentity }), {
    status: "invalid", binding: null, reason_code: "file_kind_mismatch",
  }, `an unbound ${mode} preference cannot accept a remote context carrying a matching mode`);
  assert.deepEqual(resolveContextBinding({ boundContext: remoteBinding, preference, fileIdentity: mismatchedRemoteIdentity }).binding,
    remoteBinding, "a retained binding wins before inspecting irrelevant new identity inputs");
  assert.equal(resolveContextBinding({ preference, fileIdentity: null }).status, "pending");
}
const retainedFileBinding = { context: mismatchedFileIdentity, operational_directory: null };
assert.deepEqual(resolveContextBinding({ boundContext: retainedFileBinding, preference: selectedRemote,
  remoteIdentity: mismatchedFileIdentity }).binding, retainedFileBinding,
  "a retained file binding remains valid after a remote default is selected");
assert.equal(resolveContextBinding({ preference: selectedRemote, remoteIdentity: null }).status, "pending");

assert.deepEqual(validateContextBinding(remoteBinding), { status: "ready", binding: remoteBinding, reason_code: null });
for (const preference of [selectedLocal, invalidPreference]) {
  assert.deepEqual(resolveContextBinding({ boundContext: remoteBinding, preference }).binding, remoteBinding,
    "a bound remote effort wins before changed or invalid defaults");
}
const resumed = resolveContextBinding({ boundContext: remoteBinding, preference: selectedRemote }).binding;
resumed.context.source_associations[0].host_paths[0].path = "/renamed/worktree/merchant";
assert.equal(remote.source_associations[0].host_paths[0].path, "/checkout/merchant", "validation returns isolated context");
assert.equal(resumed.context.effort_page_id, remote.effort_page_id);
assert.equal(resumed.context.created_date, remote.created_date);
assert.equal(validateContextBinding(resumed).status, "ready", "host mappings do not impose sibling layout or Git access");
assert.equal(resumed.context.source_associations[2].role, "evidence-only", "evidence does not become an owner");

const portableHostPaths = [
  { host: "windows-workstation", path: "C:\\repos\\th" },
  { host: "windows-build", path: "D:/checkouts/th" },
  { host: "network-build", path: "\\\\server\\repos\\th" },
  { host: "posix-build", path: "/srv/repos/th" },
];
const portableBinding = { ...remoteBinding, context: { ...remote, source_associations: [
  { ...remote.source_associations[0], host_paths: portableHostPaths },
] } };
const portableResult = resolveContextBinding({ boundContext: portableBinding, preference: invalidPreference });
assert.equal(portableResult.status, "ready", "retained host mappings accept Windows drive, UNC and POSIX paths on every host");
assert.deepEqual(portableResult.binding.context.source_associations[0].host_paths, portableHostPaths,
  "foreign host paths retain their exact syntax without current-host reinterpretation");
assert.equal(portableResult.binding.context.effort_page_id, remote.effort_page_id);
assert.equal(validateContextBinding(portableBinding).status, "ready");
for (const hostPath of ["relative/repos/th", "C:repos\\th", "\\repos\\th", remote.url, "/", "C:\\"]) {
  const result = validateContextBinding({ ...remoteBinding, context: { ...remote, source_associations: [
    { ...remote.source_associations[0], host_paths: [{ host: "foreign-host", path: hostPath }] },
  ] } });
  assert.equal(result.status, "invalid", `host mapping requires scoped absolute syntax: ${hostPath}`);
}
if (process.platform !== "win32") {
  assert.equal(resolveContextBinding({ preference: selectedRemote, remoteIdentity: remote,
    operationalDirectory: portableHostPaths[0].path }).status, "invalid",
  "accepting Windows metadata does not authorize it as a current-host operational directory");
}

const projectless = { ...remote, source_associations: [
  { kind: "projectless", identity: "project:annual-review", role: "writable-owner", verified: true },
] };
assert.equal(resolveContextBinding({ preference: selectedRemote, remoteIdentity: projectless }).status, "ready",
  "established projectless context requires no repository");
assert.equal(resolveContextBinding({ preference: selectedRemote }).status, "pending");
assert.equal(resolveContextBinding({ preference: invalidPreference, remoteIdentity: remote }).status, "invalid");
assert.equal(resolveContextBinding({ boundContext: { context: { ...remote, effort_page_id: null }, operational_directory: null },
  preference: selectedLocal }).status, "invalid", "an invalid bound identity cannot fall back to a new home");

for (const operationalDirectory of [remote.url, "page_effort", "relative/output", "/", "C:\\", "C:relative"]) {
  assert.equal(resolveContextBinding({ preference: selectedRemote, remoteIdentity: remote, operationalDirectory }).status,
    "invalid", `reject operational destination ${operationalDirectory}`);
}
for (const field of ["coordinator_root", "path", "services", "root", "operational_directory"]) {
  assert.equal(validateContextBinding({ ...remoteBinding, context: { ...remote, [field]: "/tmp/wrong" } }).status,
    "invalid", `remote context cannot carry filesystem field ${field}`);
}
for (const identity of [
  { ...remote, space_id: remote.url },
  { ...remote, container_page_id: "/tmp/workspace" },
  { ...remote, url: "https://chatgpt.com/space/page_other" },
  { ...remote, url: "https://user:secret@chatgpt.com/space/page_effort" },
  { ...remote, source_associations: [{ ...remote.source_associations[0], verified: false }] },
  { ...remote, source_associations: [remote.source_associations[2]] },
  { ...remote, source_associations: [] },
]) {
  assert.equal(resolveContextBinding({ preference: selectedRemote, remoteIdentity: identity }).status, "invalid");
}
const credentialSource = { ...remote, source_associations: [{ ...remote.source_associations[0],
  canonical_source: "https://user:secret@github.example/org/merchant.git" }] };
const sanitized = resolveContextBinding({ preference: selectedRemote, remoteIdentity: credentialSource });
assert.equal(sanitized.binding.context.source_associations[0].canonical_source, "https://github.example/org/merchant.git");
assert.equal(credentialSource.source_associations[0].canonical_source.includes("secret"), true,
  "sanitization does not mutate source evidence");
const unprovenAlias = { ...remote, source_associations: [{ ...remote.source_associations[0],
  aliases: [{ identity: "repository:old-name", verified: false, evidence: "" }] }] };
assert.equal(resolveContextBinding({ preference: selectedRemote, remoteIdentity: unprovenAlias }).status, "invalid",
  "changed source identities need verified alias evidence");

const hostLocalIdentities = [
  "\\\\server\\repos\\th", "file:///srv/repos/th", "/srv/repos/th", "C:\\repos\\th", "C:/repos/th",
  "C:repo", "\\repos\\th", "//server/repos/th", "FiLe:///C:/repos/th", "file://server/repos/th",
];
for (const localIdentity of hostLocalIdentities) {
  for (const prefix of ["", "origin:", "ORIGIN:", "origin:origin:"]) {
    const identity = `${prefix}${localIdentity}`;
    for (const field of ["identity", "alias"]) {
      const association = { ...remote.source_associations[0], ...(field === "identity" ? { identity } : {
        aliases: [{ identity, verified: true, evidence: "verified source transfer" }],
      }) };
      const result = resolveContextBinding({ preference: selectedRemote,
        remoteIdentity: { ...remote, source_associations: [association] } });
      assert.equal(result.status, "invalid", `${field} cannot be a host-local coordinate: ${identity}`);
    }
  }
}

for (const [identity, expected] of [
  ["repository:merchant", "repository:merchant"],
  ["project:annual-review", "project:annual-review"],
  ["origin:merchant", "origin:merchant"],
  ["https://user:secret@github.example/org/merchant.git", "https://github.example/org/merchant.git"],
  ["ssh://git:secret@github.example/org/merchant.git", "ssh://github.example/org/merchant.git"],
  ["git@github.example:org/merchant.git", "github.example:org/merchant.git"],
  ["origin:https://user:secret@github.example/org/merchant.git", "origin:https://github.example/org/merchant.git"],
  ["origin:ssh://git:secret@github.example/org/merchant.git", "origin:ssh://github.example/org/merchant.git"],
  ["ORIGIN:https://user:secret@github.example/org/merchant.git", "ORIGIN:https://github.example/org/merchant.git"],
  ["origin:ORIGIN:ssh://git:secret@github.example/org/merchant.git", "origin:ORIGIN:ssh://github.example/org/merchant.git"],
]) {
  const association = { ...remote.source_associations[0], identity,
    aliases: [{ identity, verified: true, evidence: "verified source transfer" }] };
  const result = resolveContextBinding({ preference: selectedRemote,
    remoteIdentity: { ...remote, source_associations: [association] } });
  assert.equal(result.status, "ready", `portable identity remains supported: ${identity}`);
  assert.equal(result.binding.context.source_associations[0].identity, expected);
  assert.equal(result.binding.context.source_associations[0].aliases[0].identity, expected);
}

const credentialCanary = "synthetic-credential-canary";
const sourceReferenceLocations = [
  ["identity", reference => ({ ...remote.source_associations[0], identity: reference }), association => association.identity],
  ["canonical_source", reference => ({ ...remote.source_associations[0], canonical_source: reference }), association => association.canonical_source],
  ["alias_identity", reference => ({ ...remote.source_associations[0], aliases: [
    { identity: reference, verified: true, evidence: "verified source transfer" },
  ] }), association => association.aliases[0].identity],
  ["alias_evidence", reference => ({ ...remote.source_associations[0], aliases: [
    { identity: "repository:previous", verified: true, evidence: reference },
  ] }), association => association.aliases[0].evidence],
];
const originPrefixes = ["", "origin:", "ORIGIN:", "origin:ORIGIN:"];
const invalidSourceReferences = [
  `https://user:${credentialCanary}@[broken/owner/repo`,
  `https://user:${credentialCanary}@/owner/repo`,
  `ssh:///user:${credentialCanary}@broken/owner/repo`,
  `https://user:${credentialCanary}@host:notaport/owner/repo`,
  `https:user:${credentialCanary}@[broken/owner/repo`,
  `https:/user:${credentialCanary}@[broken/owner/repo`,
  `ssh:/user:${credentialCanary}@[broken/owner/repo`,
  `git+ssh:user:${credentialCanary}@[broken/repo`,
  `user:${credentialCanary}@host:path`,
  `first@user:${credentialCanary}@host:path`,
  `repository:owner/repo?auth=user:${credentialCanary}@host:path`,
  `project:annual-review#user:${credentialCanary}@host:path`,
  `git@host:owner/repo?auth=user:${credentialCanary}@other:path`,
  `git@host:owner/repo#user:${credentialCanary}@other:path`,
  `user:${credentialCanary}%40host:path`,
  `user%3A${credentialCanary}%40host:path`,
  `user:${credentialCanary}%2540host:path`,
  `user:${credentialCanary}%25%34%30host:path`,
  `git@host:owner/${credentialCanary}%40other:path`,
  "git@[broken]:owner/repo",
  "git@host:",
  `git@host:?token=${credentialCanary}`,
  `git@host:#${credentialCanary}`,
  `git/alias:${credentialCanary}@host:path`,
  `git\\alias:${credentialCanary}@host:path`,
  `host:owner/repo?token=${credentialCanary}`,
  `host:owner/repo#${credentialCanary}`,
  `repository:merchant?token=${credentialCanary}`,
  `project:annual-review#${credentialCanary}`,
  `git+ssh://user%3A${credentialCanary}%40example.test/owner/repo`,
  `git+ssh://user%253A${credentialCanary}%2540example.test/owner/repo`,
  `git+ssh://user%253A${credentialCanary}%25%34%30example.test/owner/repo`,
  `ssh://user%3A${credentialCanary}%40example.test/owner/repo`,
  `custom://user%3A${credentialCanary}%40example.test/owner/repo`,
  `https://user%3A${credentialCanary}%40example.test/owner/repo`,
  `git+ssh://git:${credentialCanary}@user%3A${credentialCanary}%2540example.test/owner/repo`,
];
for (const [index, invalidReference] of invalidSourceReferences.entries()) {
  for (const prefix of originPrefixes) {
    for (const [field, makeAssociation] of sourceReferenceLocations) {
      const association = makeAssociation(`${prefix}${invalidReference}`);
      const result = resolveContextBinding({ preference: selectedRemote,
        remoteIdentity: { ...remote, source_associations: [association] } });
      assert.equal(result.status, "invalid", `${field} rejects invalid source reference ${index}`);
      assert.equal(result.binding, null, "invalid source references cannot enter retained context");
      assert.throws(() => normalizeSourceAssociations([association]), {
        name: "Error", message: "source reference invalid",
      }, "source reference diagnostics omit supplied userinfo");
    }
  }
}
for (const [reference, expected] of [
  ["repository:merchant", "repository:merchant"],
  ["project:annual-review", "project:annual-review"],
  ["github.example:owner/repo.git", "github.example:owner/repo.git"],
  ["git@github.example:owner/repo.git", "github.example:owner/repo.git"],
  ["git@build_host-1:owner/repo.git", "build_host-1:owner/repo.git"],
  ["git@[2001:db8::1]:owner/repo.git", "[2001:db8::1]:owner/repo.git"],
  [`user%3A${credentialCanary}@github.example:owner/repo.git`, "github.example:owner/repo.git"],
  [`user%40${credentialCanary}@github.example:owner/repo.git`, "github.example:owner/repo.git"],
  [`git@github.example:owner/repo.git?token=${credentialCanary}#fragment`, "github.example:owner/repo.git"],
  [`git@github.example:owner/repo.git#${credentialCanary}`, "github.example:owner/repo.git"],
  [`https://user:${credentialCanary}@github.example/owner/repo.git?access=synthetic-query#fragment`, "https://github.example/owner/repo.git"],
  [`ssh://git:${credentialCanary}@github.example/owner/repo.git?access=synthetic-query#fragment`, "ssh://github.example/owner/repo.git"],
  [`https://first@user:${credentialCanary}@github.example/owner/repo.git`, "https://github.example/owner/repo.git"],
  [`ssh://user%3A${credentialCanary}%40extra@github.example/owner/repo.git`, "ssh://github.example/owner/repo.git"],
  [`git+ssh://user:${credentialCanary}@github.example/owner/repo.git?access=synthetic-query#fragment`, "git+ssh://github.example/owner/repo.git"],
  ["https://github.example/owner/user%3Aname%40example.test.git", "https://github.example/owner/user%3Aname%40example.test.git"],
  [`git+ssh://git:${credentialCanary}@github.example/owner/user%3Aname%40example.test.git?access=synthetic-query#fragment`, "git+ssh://github.example/owner/user%3Aname%40example.test.git"],
  ["git+ssh://github.example/owner/user%253Aname%2540example.test.git", "git+ssh://github.example/owner/user%253Aname%2540example.test.git"],
  [`https://git:${credentialCanary}@b\u00fccher.example/owner/repo.git`, "https://xn--bcher-kva.example/owner/repo.git"],
  [`ssh://git:${credentialCanary}@[2001:db8::1]/owner/repo.git`, "ssh://[2001:db8::1]/owner/repo.git"],
]) {
  for (const prefix of originPrefixes) {
    for (const [field, makeAssociation, readReference] of sourceReferenceLocations) {
      const association = makeAssociation(`${prefix}${reference}`);
      const result = resolveContextBinding({ preference: selectedRemote,
        remoteIdentity: { ...remote, source_associations: [association] } });
      assert.equal(result.status, "ready", `${field} retains valid opaque, URL and SCP references`);
      assert.equal(JSON.stringify(result.binding).includes(credentialCanary), false, "retained context excludes source credentials");
      assert.equal(readReference(result.binding.context.source_associations[0]), `${prefix}${expected}`);
    }
  }
}

const root = await realpath(await mkdtemp(path.join(tmpdir(), "th-workspace-context-")));
try {
  const first = path.join(root, "projects", "merchant");
  const second = path.join(root, "projects", "transactions");
  const vault = path.join(root, "vault");
  for (const directory of [first, second, vault]) await mkdir(directory, { recursive: true });
  const repositories = [
    { service: "merchant", root: first, identity: "origin:merchant", role: "writable-owner" },
    { service: "transactions", root: second, identity: "origin:transactions", role: "writable-owner" },
  ];
  const date = "2026-10-17";
  const identities = [
    await resolveWorkspaceIdentity({ repositories: [repositories[0]], feature: "refund-fix", date }),
    await resolveWorkspaceIdentity({ logsMode: "obsidian", logsPath: vault, repositories: [repositories[0]], feature: "refund-fix", date }),
    await resolveWorkspaceIdentity({ repositories, initiative: "payment-flow", date }),
    await resolveWorkspaceIdentity({ logsMode: "obsidian", logsPath: vault, repositories, initiative: "payment-flow", date }),
  ];
  assert.equal(WORKSPACE_IDENTITY_SCHEMA_VERSION, 1);
  assert.deepEqual(identities.map(identity => identity.coordinator_root), [
    path.join(first, "workspaces", `${date}_refund-fix`),
    path.join(vault, "work-logs", "merchant", `${date}_refund-fix`),
    path.join(root, "projects", `${date}_payment-flow`),
    path.join(vault, "work-logs", "projects", `${date}_payment-flow`),
  ], "all four v1 file formulas remain unchanged");
  for (const identity of identities) {
    const bytes = JSON.stringify(identity);
    for (const preference of [selectedRemote, invalidPreference]) {
      const result = resolveContextBinding({ boundContext: identity, preference });
      assert.equal(result.status, "ready");
      assert.equal(result.binding.context.kind, "file");
      assert.equal(result.binding.context.path, identity.coordinator_root);
      assert.equal(JSON.stringify(result.binding.context.identity), bytes, "the v1 machine identity round-trips unchanged");
      assert.equal(validateContextBinding(result.binding).status, "ready");
    }
  }
  const identity = identities[3];
  await mkdir(path.join(identity.coordinator_root, "inputs"), { recursive: true });
  await writeFile(path.join(identity.coordinator_root, "inputs", "workspace-identity.json"), JSON.stringify(identity));
  const found = await discoverWorkspaceIdentity({ searchRoot: path.dirname(identity.coordinator_root),
    slug: "payment-flow", repositoryIdentities: repositories });
  assert.equal(found.status, "found");
  assert.deepEqual(resolveContextBinding({ boundContext: found.identity }).binding.context.identity, identity);
  const created = resolveContextBinding({ preference: selectedLocal, fileIdentity: identities[0] });
  assert.equal(created.status, "ready");
  assert.equal(resolveContextBinding({ preference: selectedRemote, fileIdentity: identities[0] }).status, "pending",
    "a new remote selection cannot use a supplied file identity as fallback");
  assert.equal(resolveContextBinding({ preference: selectedLocal, fileIdentity: identities[1] }).status, "invalid");
  assert.equal(resolveContextBinding({ preference: selectedLocal }).status, "pending");
  const file = { context: { kind: "file", mode: "local", path: path.join(root, "artifacts"), identity: null },
    operational_directory: path.join(root, "artifacts") };
  assert.equal(validateContextBinding(file).status, "ready", "explicit projectless file context remains supported");
  assert.equal(validateContextBinding({ ...file, context: { ...file.context, path: remote.url } }).status, "invalid");
  assert.equal(validateContextBinding({ ...file, operational_directory: "/" }).status, "invalid");
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log(`workspace context: PASS (${fixture.cases.length} shared preference cases; file and remote binding scenarios)`);
