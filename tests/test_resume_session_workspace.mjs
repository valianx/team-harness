#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtemp, mkdir, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import * as resolver from "../skills/resume-session/scripts/resolve-workspace.mjs";

const { resolveWorkspace } = resolver;

const root = await mkdtemp(path.join(tmpdir(), "th-resume-session-"));
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
