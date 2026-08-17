#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { recoverOpenSpecDesign } from "../plugins/team-harness/skills/pipeline/scripts/openspec-recovery.mjs";

const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const pass = async () => ({ verdict: "pass" });

async function fixture() {
  const workspace = await mkdtemp(path.join(tmpdir(), "th-openspec-recovery-"));
  await mkdir(path.join(workspace, "inputs"));
  await mkdir(path.join(workspace, "plan"));
  const snapshot = Buffer.from("snapshot\n");
  const overlay = Buffer.from("overlay\n");
  await writeFile(path.join(workspace, "inputs/openspec-snapshot.json"), snapshot);
  await writeFile(path.join(workspace, "plan/openspec-traceability.json"), overlay);
  const state = {
    openspec_change: "example-change",
    openspec_repository_root: "/repository",
    openspec_preflight: "ready",
    openspec_design_pass: "planning",
    openspec_snapshot_path: "inputs/openspec-snapshot.json",
    openspec_snapshot_sha256: digest(snapshot),
    openspec_overlay_path: "plan/openspec-traceability.json",
    openspec_overlay_sha256: digest(overlay),
  };
  return { workspace, state };
}

async function use(callback) {
  const value = await fixture();
  try { await callback(value); } finally { await rm(value.workspace, { recursive: true, force: true }); }
}

console.log("=== OpenSpec Design recovery ===");

await use(async ({ workspace, state }) => {
  state.openspec_design_pass = "provisioning";
  state.openspec_preflight = "provisionable";
  assert.equal((await recoverOpenSpecDesign({ state, workspace, snapshotVerifier: pass })).next_action, "resume approved OpenSpec provisioning");
  console.log("  [PASS] interruption before provisioning");
});

await use(async ({ workspace, state }) => {
  assert.equal((await recoverOpenSpecDesign({ state, workspace, snapshotVerifier: pass })).next_action, "resume upstream OpenSpec planning");
  console.log("  [PASS] interruption during upstream planning");
});

await use(async ({ workspace, state }) => {
  state.openspec_design_pass = "overlay";
  assert.equal((await recoverOpenSpecDesign({ state, workspace, snapshotVerifier: pass })).next_action, "resume OpenSpec execution-overlay generation");
  console.log("  [PASS] interruption after snapshot");
});

await use(async ({ workspace, state }) => {
  state.openspec_design_pass = "gate1-ready";
  await rm(path.join(workspace, "plan/openspec-traceability.json"));
  assert.equal((await recoverOpenSpecDesign({ state, workspace, snapshotVerifier: pass })).next_action, "resume OpenSpec execution-overlay generation");
  console.log("  [PASS] interruption during overlay generation");
});

await use(async ({ workspace, state }) => {
  state.openspec_design_pass = "gate1-ready";
  const changed = await recoverOpenSpecDesign({
    state, workspace, snapshotVerifier: async () => ({ verdict: "fail", error_code: "SOURCE_CHANGED" }),
  });
  assert.equal(changed.error_code, "CANONICAL_SOURCE_CHANGED");
  assert.equal(changed.next_action, "reconcile changed OpenSpec source");
  console.log("  [PASS] canonical intent change after snapshot");
});

await use(async ({ workspace, state }) => {
  state.openspec_design_pass = "gate1-ready";
  assert.equal((await recoverOpenSpecDesign({ state, workspace, snapshotVerifier: pass })).next_action, "present STAGE-GATE-1");
  console.log("  [PASS] complete Design resumes at the unchanged gate");
});
