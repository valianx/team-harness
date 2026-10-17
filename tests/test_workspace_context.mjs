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
