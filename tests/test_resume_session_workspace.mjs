#!/usr/bin/env node

import assert from "node:assert/strict";
import { chmod, lstat, mkdtemp, mkdir, readFile, readdir, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import * as resolver from "../skills/resume-session/scripts/resolve-workspace.mjs";
import { validateContextBinding } from "../skills/workspace/scripts/workspace-context.mjs";
import { resolveWorkspaceIdentity } from "../skills/pipeline/scripts/workspace-identity.mjs";

const { resolveWorkspace } = resolver;

const root = await realpath(await mkdtemp(path.join(tmpdir(), "th-resume-session-")));
try {
  const feature = "payin-orchestration-services";
  const dated = path.join(root, `2026-08-24_${feature}`);
  await mkdir(dated);
  await writeFile(path.join(dated, "00-session-handoff.md"), "### What Worked\n", "utf8");
  await writeFile(path.join(dated, "00-state.md"), "phase: design\n", "utf8");

  const logical = await resolveWorkspace({ basePath: root, feature });
  assert.equal(logical.status, "resolved");
  assert.equal(logical.workspace, dated);
  assert.equal(logical.workspace_name, `2026-08-24_${feature}`);
  assert.equal(logical.state_available, true);

  const exact = await resolveWorkspace({ basePath: root, feature: `2026-08-24_${feature}` });
  assert.equal(exact.status, "resolved");
  assert.equal(exact.workspace, dated);

  assert.equal(typeof resolver.resolveContextWorkspace, "function", "context-aware continuity is exported");
  const fileBinding = { context: { kind: "file", mode: "local", path: dated, identity: null }, operational_directory: dated };
  assert.deepEqual(await resolver.resolveContextWorkspace({ binding: fileBinding }), exact);

  const second = path.join(root, `2026-08-25_${feature}`);
  await mkdir(second);
  await writeFile(path.join(second, "00-session-handoff.md"), "### What Worked\n", "utf8");
  const ambiguous = await resolveWorkspace({ basePath: root, feature });
  assert.equal(ambiguous.status, "ambiguous");
  assert.deepEqual(ambiguous.candidates, [
    `2026-08-24_${feature}`,
    `2026-08-25_${feature}`,
  ]);

  const bindFile = workspace => ({ context: { kind: "file", mode: "local", path: workspace, identity: null },
    operational_directory: workspace });
  const retainedMissing = path.join(root, "retained-missing");
  const replacement = path.join(root, "2026-10-17_retained-missing");
  await mkdir(replacement);
  await writeFile(path.join(replacement, "00-session-handoff.md"), "Unrelated dated effort\n", "utf8");
  const missingBound = await resolver.resolveContextWorkspace({ binding: bindFile(retainedMissing) });
  assert.equal(missingBound.status, "not-found", "an absent retained path cannot discover a dated replacement");
  assert.equal(missingBound.reason_code, "WORKSPACE_NOT_FOUND");
  assert.deepEqual(missingBound.candidates, []);
  await assert.rejects(lstat(retainedMissing), { code: "ENOENT" }, "read-only lookup cannot create the missing bound path");

  const undated = path.join(root, feature);
  await mkdir(undated);
  await writeFile(path.join(undated, "00-session-handoff.md"), "Retained undated effort\n", "utf8");
  const exactBound = await resolver.resolveContextWorkspace({ binding: bindFile(undated) });
  assert.equal(exactBound.status, "resolved", "an existing retained undated path wins over dated siblings");
  assert.equal(exactBound.workspace, undated);
  assert.deepEqual(exactBound.candidates, [feature]);
  assert.equal((await resolveWorkspace({ basePath: root, feature })).status, "ambiguous",
    "unbound feature discovery still considers all matching directories");

  const unicodeWorkspace = path.join(root, "tarea con espacios ñ");
  await mkdir(unicodeWorkspace);
  await writeFile(path.join(unicodeWorkspace, "00-session-handoff.md"), "Retained Unicode effort\n", "utf8");
  const unicodeBinding = bindFile(unicodeWorkspace);
  assert.equal(validateContextBinding(unicodeBinding).status, "ready");
  const unicodeBound = await resolver.resolveContextWorkspace({ binding: unicodeBinding });
  assert.equal(unicodeBound.status, "resolved", "a valid bound path does not inherit feature-discovery name restrictions");
  assert.equal(unicodeBound.workspace, unicodeWorkspace);

  const emptyBound = path.join(root, "retained-empty");
  await mkdir(emptyBound);
  const emptyReplacement = path.join(root, "2026-10-17_retained-empty");
  await mkdir(emptyReplacement);
  await writeFile(path.join(emptyReplacement, "00-session-handoff.md"), "Another effort\n", "utf8");
  const emptyResult = await resolver.resolveContextWorkspace({ binding: bindFile(emptyBound) });
  assert.equal(emptyResult.status, "handoff-missing");
  assert.equal(emptyResult.workspace, emptyBound);
  assert.deepEqual(await readdir(emptyBound), [], "a missing handoff and state remain unwritten");

  const readOnlyBound = path.join(root, "retained-read-only");
  const readOnlyHandoff = path.join(readOnlyBound, "00-session-handoff.md");
  await mkdir(readOnlyBound);
  await writeFile(readOnlyHandoff, "Retained read-only effort\n", "utf8");
  await chmod(readOnlyHandoff, 0o444);
  await chmod(readOnlyBound, 0o555);
  try {
    const directoryMode = (await lstat(readOnlyBound)).mode;
    const handoffMode = (await lstat(readOnlyHandoff)).mode;
    const readOnly = await resolver.resolveContextWorkspace({ binding: bindFile(readOnlyBound) });
    assert.equal(readOnly.status, "resolved", "read-only retained context can be resumed without writes");
    assert.equal(readOnly.state_available, false);
    assert.deepEqual(await readdir(readOnlyBound), ["00-session-handoff.md"]);
    assert.equal(await readFile(readOnlyHandoff, "utf8"), "Retained read-only effort\n");
    assert.equal((await lstat(readOnlyBound)).mode, directoryMode);
    assert.equal((await lstat(readOnlyHandoff)).mode, handoffMode);
  } finally {
    await chmod(readOnlyBound, 0o755);
    await chmod(readOnlyHandoff, 0o644);
  }

  for (const nested of [[], ["nested", "deep"]]) {
    const caseRoot = path.join(root, nested.length === 0 ? "ancestor-redirect" : "nested-ancestor-redirect");
    const ancestor = path.join(caseRoot, "retained");
    const retainedWorkspace = path.join(ancestor, ...nested, "foo");
    await mkdir(retainedWorkspace, { recursive: true });
    await writeFile(path.join(retainedWorkspace, "00-session-handoff.md"), "Original retained context\n", "utf8");
    const retainedBinding = bindFile(retainedWorkspace);
    const unchanged = await resolver.resolveContextWorkspace({ binding: retainedBinding });
    assert.equal(unchanged.status, "resolved", "an unchanged physical ancestor chain remains reusable");
    assert.equal(unchanged.workspace, retainedWorkspace);

    const preservedAncestor = path.join(caseRoot, "preserved");
    await rename(ancestor, preservedAncestor);
    const redirectedAncestor = path.join(caseRoot, "elsewhere");
    const redirectedWorkspace = path.join(redirectedAncestor, ...nested, "foo");
    await mkdir(redirectedWorkspace, { recursive: true });
    await writeFile(path.join(redirectedWorkspace, "00-session-handoff.md"), "Different effort\n", "utf8");
    await symlink(redirectedAncestor, ancestor, process.platform === "win32" ? "junction" : "dir");
    const redirected = await resolver.resolveContextWorkspace({ binding: retainedBinding });
    assert.equal(redirected.status, "not-found", "a retained ancestor symlink or junction cannot redirect context, including through nested directories");
    assert.deepEqual(redirected.candidates, []);
    assert.equal(Object.hasOwn(redirected, "handoff"), false);
    assert.equal(retainedBinding.context.path, retainedWorkspace, "the bound locator is preserved instead of adopting its resolved target");
    assert.equal((await lstat(ancestor)).isSymbolicLink(), true);
    assert.equal(await readFile(path.join(preservedAncestor, ...nested, "foo", "00-session-handoff.md"), "utf8"),
      "Original retained context\n");
    assert.equal(await readFile(path.join(redirectedWorkspace, "00-session-handoff.md"), "utf8"), "Different effort\n");
    assert.deepEqual(await readdir(redirectedWorkspace), ["00-session-handoff.md"], "redirected destinations receive no state or handoff writes");
  }

  const canonicalSources = path.join(root, "canonical-sources");
  const canonicalRepository = path.join(canonicalSources, "service");
  await mkdir(canonicalRepository, { recursive: true });
  const hostAlias = path.join(root, "host-source-alias");
  await symlink(canonicalSources, hostAlias, process.platform === "win32" ? "junction" : "dir");
  const canonicalIdentity = await resolveWorkspaceIdentity({ repositories: [{ service: "service",
    root: path.join(hostAlias, "service"), identity: "origin:service", role: "writable-owner" }],
  feature: "canonical-resume", date: "2026-10-17" });
  assert.equal(canonicalIdentity.services[0].root, canonicalRepository, "v1 binding canonicalizes host aliases before retaining identity");
  await mkdir(canonicalIdentity.coordinator_root, { recursive: true });
  await writeFile(path.join(canonicalIdentity.coordinator_root, "00-session-handoff.md"), "Canonical v1 effort\n", "utf8");
  const canonicalBinding = bindFile(canonicalIdentity.coordinator_root);
  canonicalBinding.context.identity = canonicalIdentity;
  const canonicalBytes = JSON.stringify(canonicalBinding);
  const canonicalResult = await resolver.resolveContextWorkspace({ binding: canonicalBinding });
  assert.equal(canonicalResult.status, "resolved", "canonical v1 paths remain valid after being selected through a host alias");
  assert.equal(canonicalResult.workspace, canonicalIdentity.coordinator_root);
  assert.equal(JSON.stringify(canonicalBinding), canonicalBytes);
  if (process.platform === "win32") {
    const differentCase = canonicalIdentity.coordinator_root.toUpperCase();
    assert.equal((await resolver.resolveContextWorkspace({ binding: bindFile(differentCase) })).status, "resolved",
      "physical path comparison follows native Windows casing semantics");
  }

  const missingFeature = "missing-handoff";
  const missing = path.join(root, `2026-08-24_${missingFeature}`);
  await mkdir(missing);
  const handoffMissing = await resolveWorkspace({ basePath: root, feature: missingFeature });
  assert.equal(handoffMissing.status, "handoff-missing");
  assert.equal(handoffMissing.workspace, missing);

  const external = path.join(root, "external");
  await mkdir(external);
  await writeFile(path.join(external, "00-session-handoff.md"), "### What Worked\n", "utf8");
  await symlink(external, path.join(root, "2026-08-24_symlinked"), process.platform === "win32" ? "junction" : "dir");
  assert.equal((await resolveWorkspace({ basePath: root, feature: "symlinked" })).status, "not-found");
  assert.equal((await resolver.resolveContextWorkspace({ binding: bindFile(path.join(root, "2026-08-24_symlinked")) })).status,
    "not-found", "bound lookup does not follow a linked directory");
  const linkedDirectory = path.join(root, "retained-linked-directory");
  await symlink(external, linkedDirectory, process.platform === "win32" ? "junction" : "dir");
  const linkedReplacement = path.join(root, "2026-10-17_retained-linked-directory");
  await mkdir(linkedReplacement);
  await writeFile(path.join(linkedReplacement, "00-session-handoff.md"), "Another effort\n", "utf8");
  assert.equal((await resolver.resolveContextWorkspace({ binding: bindFile(linkedDirectory) })).status,
    "not-found", "a linked bound directory cannot be replaced by a dated sibling");
  assert.equal((await lstat(linkedDirectory)).isSymbolicLink(), true);
  const linkedHandoff = path.join(root, "retained-linked-handoff");
  await mkdir(linkedHandoff);
  await symlink(path.join(external, "00-session-handoff.md"), path.join(linkedHandoff, "00-session-handoff.md"), "file");
  const linkedResult = await resolver.resolveContextWorkspace({ binding: bindFile(linkedHandoff) });
  assert.equal(linkedResult.status, "handoff-missing", "bound lookup does not follow a linked handoff");
  assert.equal(linkedResult.workspace, linkedHandoff);
  assert.equal((await lstat(path.join(linkedHandoff, "00-session-handoff.md"))).isSymbolicLink(), true);
  assert.equal(await readFile(path.join(external, "00-session-handoff.md"), "utf8"), "### What Worked\n");

  for (const invalid of ["../escape", "a/b", "*", "..", ""]) {
    assert.equal((await resolveWorkspace({ basePath: root, feature: invalid })).status, "invalid");
  }

  const binding = {
    context: {
      kind: "gpt-space", space_id: "space-owner", container_page_id: "page-workspace",
      effort_page_id: "page-effort", url: "https://chatgpt.com/space/page-effort",
      created_date: "2026-08-24", slug: feature,
      source_associations: [{ kind: "repository", identity: "github.com/team/service", role: "writable-owner", verified: true }],
    },
    operational_directory: null,
  };
  const page = {
    page_id: "page-effort", title: "2026-08-24_payin-orchestration-services", deleted_at: null,
    parent: { page_id: "page-workspace" }, drive_scope: "space", drive_space_id: "space-owner",
    container_space_id: "space-owner", access: { can_read: true }, provenance_complete: true,
    source_associations: binding.context.source_associations,
  };
  const before = await readdir(root);
  const resolveRemote = (remoteCandidates, listingComplete = true, selectedBinding = binding) => resolver.resolveContextWorkspace({
    binding: selectedBinding, remoteCandidates, listingComplete,
  });
  const remote = await resolveRemote([page]);
  assert.equal(remote.status, "ready");
  assert.deepEqual(remote.binding, binding);
  assert.deepEqual(remote.handoff, {
    kind: "gpt-space", page_id: "page-effort", url: binding.context.url, section: "Session Handoff",
  });
  assert.equal(remote.create_allowed, false);
  assert.equal(Object.hasOwn(remote, "state"), false);
  assert.equal(Object.hasOwn(remote, "workspace"), false);
  assert.equal((await resolveRemote([page], false)).status, "ready", "verified exact binding does not depend on unrelated discovery");

  for (const [candidate, expected] of [
    [{ ...page, parent: { page_id: "page-moved" } }, "destination-conflict"],
    [{ ...page, drive_space_id: "space-other", container_space_id: "space-other" }, "destination-conflict"],
    [{ ...page, deleted_at: "2026-10-17T00:00:00Z" }, "unavailable"],
    [{ ...page, access: { can_read: false } }, "unavailable"],
    [{ ...page, provenance_complete: false }, "incomplete"],
    [{ ...page, source_associations: [{ kind: "repository", identity: "github.com/team/other", role: "writable-owner", verified: true }] }, "destination-conflict"],
    [{ ...page, title: "renamed", bound_title: page.title }, "destination-conflict"],
  ]) {
    const pending = await resolveRemote([candidate]);
    assert.equal(pending.status, expected);
    assert.deepEqual(pending.binding, binding);
    assert.equal(pending.create_allowed, false);
    assert.equal(Object.hasOwn(pending, "handoff"), false);
  }
  for (const [candidates, complete, expected] of [
    [undefined, false, "incomplete"],
    [[], false, "incomplete"],
    [[], true, "unavailable"],
    [[{ error: { code: "offline" } }], true, "unavailable"],
    [[page, { ...page, title: "conflicting metadata" }], true, "destination-conflict"],
    [[{ ...page, page_id: "page-other" }], true, "unavailable"],
  ]) {
    const pending = await resolveRemote(candidates, complete);
    assert.equal(pending.status, expected);
    assert.equal(pending.create_allowed, false);
    assert.deepEqual(pending.binding, binding);
  }
  const malformed = await resolveRemote([page], true, { ...binding, operational_directory: binding.context.url });
  assert.equal(malformed.status, "invalid");
  assert.equal(malformed.create_allowed, false);
  assert.deepEqual(await readdir(root), before, "remote lookup performs no local writes");

  const cli = spawnSync(process.execPath, [fileURLToPath(new URL("../skills/resume-session/scripts/resolve-workspace.mjs", import.meta.url)),
    "--base", binding.context.url, "--feature", feature], { encoding: "utf8" });
  assert.equal(cli.status, 2);
  assert.equal(JSON.parse(cli.stdout).reason_code, "ARGUMENT_INVALID");
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log("resume-session workspace resolver: PASS");
