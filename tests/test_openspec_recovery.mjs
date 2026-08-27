#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  normalizeOpenSpecRecoveryState,
  reconcileCorrectionCounters,
  reconcileCorrectionWaitState,
  recoverOpenSpecDesign,
} from "../skills/pipeline/scripts/openspec-recovery.mjs";

const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const pass = async () => ({ verdict: "pass" });

async function fixture() {
  const workspace = await realpath(await mkdtemp(path.join(tmpdir(), "th-openspec-recovery-")));
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
  const resumed = await recoverOpenSpecDesign({ state, workspace, snapshotVerifier: pass });
  assert.equal(resumed.action_code, "RESUME_PROVISIONING");
  assert.equal(resumed.requires_agent_dispatch, false);
  console.log("  [PASS] interruption before provisioning");
});

await use(async ({ workspace, state }) => {
  assert.equal((await recoverOpenSpecDesign({ state, workspace, snapshotVerifier: pass })).action_code, "RESUME_PLANNING");
  console.log("  [PASS] interruption during upstream planning");
});

await use(async ({ workspace, state }) => {
  state.openspec_design_pass = "overlay";
  const resumed = await recoverOpenSpecDesign({ state, workspace, snapshotVerifier: pass });
  assert.equal(resumed.action_code, "DERIVE_OVERLAY");
  assert.equal(resumed.requires_agent_dispatch, false);
  console.log("  [PASS] interruption after snapshot reruns the mechanical derivation, not an architect dispatch");
});

await use(async ({ workspace, state }) => {
  state.openspec_design_pass = "gate1-ready";
  await rm(path.join(workspace, "plan/openspec-traceability.json"));
  const resumed = await recoverOpenSpecDesign({ state, workspace, snapshotVerifier: pass });
  assert.equal(resumed.action_code, "DERIVE_OVERLAY");
  console.log("  [PASS] interruption during overlay derivation reruns mechanically");
});

await use(async ({ workspace, state }) => {
  state.openspec_design_pass = "gate1-ready";
  const changed = await recoverOpenSpecDesign({
    state, workspace, snapshotVerifier: async () => ({ verdict: "fail", error_code: "SOURCE_CHANGED" }),
  });
  assert.equal(changed.error_code, "CANONICAL_SOURCE_CHANGED");
  assert.equal(changed.action_code, "RECONCILE_SOURCE");
  console.log("  [PASS] canonical intent change after snapshot");
});

await use(async ({ workspace, state }) => {
  state.openspec_design_pass = "gate1-ready";
  assert.equal((await recoverOpenSpecDesign({ state, workspace, snapshotVerifier: pass })).action_code, "PRESENT_GATE_1");
  console.log("  [PASS] complete Design resumes at the unchanged gate");
});

await use(async ({ state }) => {
  const normalized = normalizeOpenSpecRecoveryState(state);
  assert.equal(normalized.version, 3);
  assert.equal(normalized.legacy, true);
  assert.equal(normalized.bindings.length, 1);
  assert.equal(normalized.bindings[0].change_name, "example-change");
  console.log("  [PASS] v3 singular state maps to one in-memory binding without mutation");
});

async function v4Fixture() {
  const workspace = await realpath(await mkdtemp(path.join(tmpdir(), "th-openspec-recovery-v4-")));
  await mkdir(path.join(workspace, "inputs"));
  const aggregate = Buffer.from("aggregate\n");
  await writeFile(path.join(workspace, "inputs/openspec-bindings.json"), aggregate);
  const services = ["merchant-bridge", "payments-orchestrator", "transactions"];
  const state = {
    pipeline_version: 4,
    workspace_identity: {
      schema_version: 1, kind: "team_harness_workspace_identity", workspace_kind: "initiative", logs_mode: "obsidian",
      coordinator_root: workspace, repo_base: "zippy", date: "2026-08-24", feature: null, initiative: "payment-flow",
      services: services.map(service => ({ service, root: `/repos/${service}`, identity: `id:${service}`, role: "writable-owner", workspace: path.join(workspace, service) })),
      evidence_repositories: [{ service: "payment-gateway", root: "/repos/payment-gateway", identity: "id:payment-gateway", role: "evidence-only" }],
    },
    openspec_design_pass: "gate1-ready",
    openspec_bindings: services.map(service => ({
      service, role: "writable-owner", repository_root: `/repos/${service}`, repository_identity: `id:${service}`,
      change_name: service, planning_root: `/repos/${service}/openspec/changes/${service}`, preflight: "ready", design_pass: "gate1-ready",
      snapshot_path: `inputs/openspec/${service}/snapshot.json`, snapshot_sha256: "a".repeat(64),
      overlay_path: `plan/openspec/${service}/traceability.json`, overlay_sha256: "b".repeat(64),
      task_intent_sha256: "c".repeat(64), strict_validation: "pass",
    })),
    evidence_repositories: [{ service: "payment-gateway", role: "evidence-only", repository_root: "/repos/payment-gateway", repository_identity: "id:payment-gateway", purpose: "Read-only evidence." }],
    openspec_aggregate_path: "inputs/openspec-bindings.json",
    openspec_aggregate_sha256: digest(aggregate),
  };
  return { workspace, state };
}

{
  const { workspace, state } = await v4Fixture();
  try {
    const recovered = await recoverOpenSpecDesign({
      state, workspace,
      bindingsVerifier: async ({ aggregatePath }) => ({ verdict: "pass", aggregate_path: path.join(workspace, aggregatePath) }),
    });
    assert.equal(recovered.action_code, "PRESENT_CONSOLIDATED_GATE_1");
    assert.match(recovered.next_action, /consolidated/);
    console.log("  [PASS] v4 resumes at one consolidated Gate 1");
  } finally { await rm(workspace, { recursive: true, force: true }); }
}

await use(async ({ workspace }) => {
  const decision = {
    event: "correction.decision",
    decision: "authorize",
    decision_ref: "5c8fc2636b2ac54d4242e19712add31b",
    correction_authority: "gate1-autonomous",
    correction_authority_gate_nonce: "gate-1-nonce",
    correction_package: { anchor: "freeze-1", findings: ["PAYIN-AUD-001"] },
  };
  await writeFile(path.join(workspace, "00-execution-events.jsonl"), `${JSON.stringify(decision)}\n`);
  const repaired = await reconcileCorrectionCounters({
    workspace,
    autonomousCorrectionCount: 3,
    operatorCorrectionCount: 0,
  });
  assert.equal(repaired.verdict, "repair");
  assert.equal(repaired.error_code, "CORRECTION_COUNTER_MISMATCH");
  assert.deepEqual(repaired.state_patch, { autonomous_correction_count: 1, operator_correction_count: 0 });
  const verified = await reconcileCorrectionCounters({
    workspace,
    autonomousCorrectionCount: 1,
    operatorCorrectionCount: 0,
  });
  assert.equal(verified.verdict, "pass");
  console.log("  [PASS] recovery projects correction budgets exactly from durable authority decisions");
});

{
  const liveChoice = {
    correction_pending: true,
    correction_nonce: "90580e70623f731fd448824e2955607e",
    correction_decision: null,
    correction_decision_ref: null,
    status: "in_progress",
    next_action: "await live choice",
    active_specialist_count: 0,
  };
  const repaired = reconcileCorrectionWaitState(liveChoice);
  assert.equal(repaired.verdict, "repair");
  assert.equal(repaired.error_code, "CORRECTION_WAIT_STATUS_MISMATCH");
  assert.deepEqual(repaired.state_patch, { status: "paused" });
  const verified = reconcileCorrectionWaitState({ ...liveChoice, ...repaired.state_patch });
  assert.equal(verified.verdict, "pass");
  assert.equal(verified.state_patch, null);
  const active = reconcileCorrectionWaitState({ ...liveChoice, active_specialist_count: 1 });
  assert.equal(active.verdict, "blocked");
  assert.equal(active.error_code, "CORRECTION_WAIT_SPECIALIST_ACTIVE");
  console.log("  [PASS] recovery repairs only status for a live unconsumed correction choice");
}

await use(async ({ workspace }) => {
  const decisions = Array.from({ length: 4 }, (_, index) => ({
    event: "correction.decision",
    decision: "authorize",
    decision_ref: `autonomous-${index + 1}`,
    correction_authority: "gate1-autonomous",
    correction_authority_gate_nonce: "gate-1-nonce",
    correction_package: { anchor: "freeze-1", findings: [`finding-${index + 1}`] },
  }));
  await writeFile(path.join(workspace, "00-execution-events.jsonl"), `${decisions.map(value => JSON.stringify(value)).join("\n")}\n`);
  const blocked = await reconcileCorrectionCounters({
    workspace,
    autonomousCorrectionCount: 3,
    operatorCorrectionCount: 0,
  });
  assert.equal(blocked.verdict, "blocked");
  assert.equal(blocked.error_code, "AUTONOMOUS_CORRECTION_BUDGET_EXCEEDED");
  console.log("  [PASS] recovery blocks an invalid fourth autonomous authority event instead of truncating it");
});

{
  const { workspace, state } = await v4Fixture();
  try {
    state.evidence_repositories[0].repository_identity = "wrong-identity";
    const blocked = await recoverOpenSpecDesign({ state, workspace });
    assert.equal(blocked.error_code, "STATE_INVALID");
    console.log("  [PASS] v4 evidence identity must match the workspace binding");
  } finally { await rm(workspace, { recursive: true, force: true }); }
}

{
  const { workspace, state } = await v4Fixture();
  try {
    state.workspace_identity.services = state.workspace_identity.services.slice(0, 2);
    const blocked = await recoverOpenSpecDesign({ state, workspace });
    assert.equal(blocked.error_code, "STATE_INVALID");
    console.log("  [PASS] v4 workspace and binding service membership must match exactly");
  } finally { await rm(workspace, { recursive: true, force: true }); }
}

{
  const { workspace, state } = await v4Fixture();
  try {
    const blocked = await recoverOpenSpecDesign({
      state, workspace,
      bindingsVerifier: async () => ({ verdict: "pass" }),
    });
    assert.equal(blocked.error_code, "AGGREGATE_IDENTITY_MISMATCH");
    console.log("  [PASS] v4 verifier must return the required aggregate identity");
  } finally { await rm(workspace, { recursive: true, force: true }); }
}

{
  const { workspace, state } = await v4Fixture();
  try {
    const blocked = await recoverOpenSpecDesign({
      state, workspace,
      bindingsVerifier: async () => ({ verdict: "fail", error_code: "BINDING_STALE", failed_binding: "transactions" }),
    });
    assert.equal(blocked.action_code, "RECONCILE_BINDINGS");
    assert.equal(blocked.error_code, "BINDING_STALE");
    assert.match(blocked.next_action, /transactions/);
    console.log("  [PASS] v4 reports the stale owning service without centralizing it");
  } finally { await rm(workspace, { recursive: true, force: true }); }
}

{
  const { workspace, state } = await v4Fixture();
  try {
    state.evidence_repositories[0].service = "transactions";
    const blocked = await recoverOpenSpecDesign({ state, workspace });
    assert.equal(blocked.error_code, "STATE_INVALID");
    console.log("  [PASS] evidence-only repository cannot overlap a writable binding");
  } finally { await rm(workspace, { recursive: true, force: true }); }
}
