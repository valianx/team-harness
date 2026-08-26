#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { resolveWorkspace } from "../skills/resume-session/scripts/resolve-workspace.mjs";

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
  await symlink(external, path.join(root, "2026-08-24_symlinked"));
  assert.equal((await resolveWorkspace({ basePath: root, feature: "symlinked" })).status, "not-found");

  for (const invalid of ["../escape", "a/b", "*", "..", ""]) {
    assert.equal((await resolveWorkspace({ basePath: root, feature: invalid })).status, "invalid");
  }
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log("resume-session workspace resolver: PASS");
