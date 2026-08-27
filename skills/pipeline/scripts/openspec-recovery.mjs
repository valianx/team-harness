#!/usr/bin/env node
/** Derive the next recoverable action for an interrupted OpenSpec Design transaction. */

import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { verifySnapshot } from "./openspec-snapshot.mjs";
import { verifyOpenSpecBindingsManifest } from "./openspec-bindings.mjs";
import { isWorkspaceIdentity } from "./workspace-identity.mjs";

const SHA256 = /^[a-f0-9]{64}$/;
const CHANGE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PASSES = new Set(["preflight", "provisioning", "planning", "snapshot", "overlay", "gate1-ready"]);
const PREFLIGHT = new Set(["pending", "ready", "provisionable", "blocked-prerequisite", "invalid-project"]);
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const safeString = value => typeof value === "string" && value.length > 0 && !value.includes("\0");
const safeRelative = value => safeString(value) && !path.isAbsolute(value) && !value.replaceAll("\\", "/").split("/").includes("..");
const contained = (root, target) => {
  const relative = path.relative(root, target);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
};

async function readWorkspaceFile(workspace, relative) {
  if (!safeRelative(relative)) throw new Error("unsafe");
  const target = path.resolve(workspace, relative);
  if (!contained(workspace, target)) throw new Error("unsafe");
  const stat = await lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) throw new Error("unsafe");
  const canonical = await realpath(target);
  if (!contained(workspace, canonical)) throw new Error("unsafe");
  return readFile(canonical);
}

function result(verdict, actionCode, nextAction = null, errorCode = null) {
  return {
    schema_version: 2,
    kind: "team_harness_openspec_recovery",
    verdict,
    error_code: errorCode,
    action_code: actionCode,
    requires_agent_dispatch: false,
    next_action: nextAction,
  };
}

function correctionCounterResult(verdict, errorCode, details = {}) {
  return {
    schema_version: 1,
    kind: "team_harness_correction_counter_reconciliation",
    verdict,
    error_code: errorCode,
    action_code: details.action_code ?? null,
    autonomous_correction_count: details.autonomous_correction_count ?? null,
    operator_correction_count: details.operator_correction_count ?? null,
    state_patch: details.state_patch ?? null,
  };
}

function parseExecutionEvents(bytes) {
  const events = [];
  let inFence = false;
  for (const raw of bytes.toString("utf8").split("\n")) {
    const line = raw.trim();
    if (line === "```jsonl") { inFence = true; continue; }
    if (line === "```" && inFence) { inFence = false; continue; }
    if (line === "" || line.startsWith("#")) continue;
    let value;
    try { value = JSON.parse(raw); } catch { throw new Error("CORRECTION_COUNTER_EVENTS_INVALID"); }
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("CORRECTION_COUNTER_EVENTS_INVALID");
    events.push(value);
  }
  return events;
}

/** Project correction budgets from their append-only authority events. */
export async function reconcileCorrectionCounters({
  workspace,
  eventsPath = "00-execution-events.jsonl",
  autonomousCorrectionCount,
  operatorCorrectionCount,
} = {}) {
  if (!safeString(workspace) || !safeRelative(eventsPath)
    || !Number.isInteger(autonomousCorrectionCount) || autonomousCorrectionCount < 0
    || !Number.isInteger(operatorCorrectionCount) || operatorCorrectionCount < 0) {
    return correctionCounterResult("blocked", "CORRECTION_COUNTER_STATE_INVALID");
  }
  let root;
  let events;
  try {
    root = await realpath(path.resolve(workspace));
    if (!(await lstat(root)).isDirectory()) throw new Error("workspace");
    events = parseExecutionEvents(await readWorkspaceFile(root, eventsPath));
  } catch (error) {
    return correctionCounterResult("blocked", error?.message === "CORRECTION_COUNTER_EVENTS_INVALID"
      ? error.message : "CORRECTION_COUNTER_EVENTS_UNREADABLE");
  }
  const references = new Set();
  let autonomous = 0;
  let operator = 0;
  for (const event of events.filter(value => value.event === "correction.decision" && value.decision === "authorize")) {
    const authority = event.correction_authority;
    const reference = event.decision_ref;
    const gateNonce = event.correction_authority_gate_nonce;
    if (!["gate1-autonomous", "operator-live"].includes(authority)
      || !safeString(reference) || references.has(reference)
      || !event.correction_package || typeof event.correction_package !== "object" || Array.isArray(event.correction_package)
      || (authority === "gate1-autonomous" ? !safeString(gateNonce) : gateNonce !== null)) {
      return correctionCounterResult("blocked", "CORRECTION_COUNTER_EVENTS_INVALID");
    }
    references.add(reference);
    if (authority === "gate1-autonomous") autonomous += 1;
    else operator += 1;
  }
  if (autonomous > 3) {
    return correctionCounterResult("blocked", "AUTONOMOUS_CORRECTION_BUDGET_EXCEEDED", {
      autonomous_correction_count: autonomous,
      operator_correction_count: operator,
    });
  }
  const details = { autonomous_correction_count: autonomous, operator_correction_count: operator };
  if (autonomousCorrectionCount === autonomous && operatorCorrectionCount === operator) {
    return correctionCounterResult("pass", null, details);
  }
  return correctionCounterResult("repair", "CORRECTION_COUNTER_MISMATCH", {
    ...details,
    action_code: "REPAIR_CORRECTION_COUNTERS",
    state_patch: { autonomous_correction_count: autonomous, operator_correction_count: operator },
  });
}

function validV4Binding(value) {
  return value && typeof value === "object" && !Array.isArray(value) && CHANGE.test(value.service ?? "")
    && value.role === "writable-owner" && safeString(value.repository_root) && path.isAbsolute(value.repository_root)
    && safeString(value.repository_identity) && CHANGE.test(value.change_name ?? "")
    && safeString(value.planning_root) && path.isAbsolute(value.planning_root) && PREFLIGHT.has(value.preflight)
    && PASSES.has(value.design_pass) && safeRelative(value.snapshot_path) && SHA256.test(value.snapshot_sha256 ?? "")
    && safeRelative(value.overlay_path) && SHA256.test(value.overlay_sha256 ?? "")
    && SHA256.test(value.task_intent_sha256 ?? "") && value.strict_validation === "pass";
}

function sameServices(left, right) {
  if (left.length !== right.length) return false;
  const expected = right.slice().sort();
  return left.slice().sort().every((value, index) => value === expected[index]);
}

/** Normalize historical singular state in memory without mutating or relocating its workspace. */
export function normalizeOpenSpecRecoveryState(state) {
  if (!state || typeof state !== "object") return null;
  if (state.pipeline_version === 4) {
    if (!isWorkspaceIdentity(state.workspace_identity) || !Array.isArray(state.openspec_bindings)
      || state.openspec_bindings.length === 0 || !state.openspec_bindings.every(validV4Binding)
      || new Set(state.openspec_bindings.map(binding => binding.service)).size !== state.openspec_bindings.length
      || !Array.isArray(state.evidence_repositories)
      || state.evidence_repositories.some(value => !value || value.role !== "evidence-only" || !CHANGE.test(value.service ?? "")
        || !safeString(value.repository_root) || !path.isAbsolute(value.repository_root)
        || !safeString(value.repository_identity) || !safeString(value.purpose))
      || new Set([...state.openspec_bindings, ...state.evidence_repositories].map(value => value.service)).size
        !== state.openspec_bindings.length + state.evidence_repositories.length
      || !sameServices(state.openspec_bindings.map(value => value.service), state.workspace_identity.services.map(value => value.service))
      || !sameServices(state.evidence_repositories.map(value => value.service), state.workspace_identity.evidence_repositories.map(value => value.service))
      || state.openspec_bindings.some(value => {
        const identity = state.workspace_identity.services.find(entry => entry.service === value.service);
        return path.resolve(value.repository_root) !== path.resolve(identity.root) || value.repository_identity !== identity.identity;
      })
      || state.evidence_repositories.some(value => {
        const identity = state.workspace_identity.evidence_repositories.find(entry => entry.service === value.service);
        return path.resolve(value.repository_root) !== path.resolve(identity.root) || value.repository_identity !== identity.identity;
      })
      || state.openspec_aggregate_path !== "inputs/openspec-bindings.json"
      || !SHA256.test(state.openspec_aggregate_sha256 ?? "") || !PASSES.has(state.openspec_design_pass)) return null;
    return {
      version: 4,
      workspace_identity: state.workspace_identity,
      bindings: state.openspec_bindings.map(value => ({ ...value })),
      evidence_repositories: state.evidence_repositories.map(value => ({ ...value })),
      aggregate_path: state.openspec_aggregate_path,
      aggregate_sha256: state.openspec_aggregate_sha256,
      design_pass: state.openspec_design_pass,
    };
  }
  if (!CHANGE.test(state.openspec_change ?? "") || !safeString(state.openspec_repository_root)
    || !PREFLIGHT.has(state.openspec_preflight) || !PASSES.has(state.openspec_design_pass)) return null;
  return {
    version: 3,
    legacy: true,
    design_pass: state.openspec_design_pass,
    bindings: [{
      service: path.basename(state.openspec_repository_root),
      role: "writable-owner",
      repository_root: state.openspec_repository_root,
      repository_identity: null,
      change_name: state.openspec_change,
      planning_root: null,
      preflight: state.openspec_preflight,
      design_pass: state.openspec_design_pass,
      snapshot_path: state.openspec_snapshot_path,
      snapshot_sha256: state.openspec_snapshot_sha256,
      overlay_path: state.openspec_overlay_path,
      overlay_sha256: state.openspec_overlay_sha256,
    }],
  };
}

async function recoverV4({ normalized, workspace, bindingsVerifier }) {
  let coordinatorRoot;
  try { coordinatorRoot = await realpath(path.resolve(normalized.workspace_identity.coordinator_root)); }
  catch { return result("blocked", null, null, "WORKSPACE_IDENTITY_MISMATCH"); }
  if (coordinatorRoot !== workspace) {
    return result("blocked", null, null, "WORKSPACE_IDENTITY_MISMATCH");
  }
  const blockedBinding = normalized.bindings.find(binding => ["blocked-prerequisite", "invalid-project"].includes(binding.preflight));
  if (blockedBinding) return result("blocked", "RESOLVE_BINDING_PREFLIGHT", `resolve OpenSpec preflight blocker for ${blockedBinding.service}`, "PREFLIGHT_BLOCKED");
  if (normalized.design_pass === "preflight") return result("resume", "RUN_BINDING_PREFLIGHTS", "run OpenSpec preflight for every writable service");
  if (normalized.design_pass === "provisioning") {
    return normalized.bindings.every(binding => ["ready", "provisionable"].includes(binding.preflight))
      ? result("resume", "RESUME_BINDING_PROVISIONING", "resume approved service-owned OpenSpec provisioning")
      : result("blocked", null, null, "STATE_INVALID");
  }
  if (!normalized.bindings.every(binding => binding.preflight === "ready")) return result("blocked", null, null, "STATE_INVALID");
  if (normalized.design_pass === "planning") return result("resume", "RESUME_BINDING_PLANNING", "resume service-owned OpenSpec planning");
  if (normalized.design_pass === "snapshot") return result("resume", "CAPTURE_BINDING_SNAPSHOTS", "capture strict OpenSpec snapshots for every writable service");
  if (normalized.design_pass === "overlay") return result("resume", "DERIVE_BINDING_OVERLAYS", "derive each service overlay and rebuild the aggregate manifest");
  const aggregatePath = path.join(workspace, normalized.aggregate_path);
  let aggregateBytes;
  try { aggregateBytes = await readWorkspaceFile(workspace, normalized.aggregate_path); }
  catch { return result("resume", "BUILD_OPENSPEC_AGGREGATE", "rebuild the OpenSpec bindings aggregate", "AGGREGATE_MISSING"); }
  if (hash(aggregateBytes) !== normalized.aggregate_sha256) return result("blocked", "RECONCILE_BINDINGS", "reconcile changed OpenSpec bindings", "AGGREGATE_STALE");
  const verified = await bindingsVerifier({
    workspace,
    aggregatePath: normalized.aggregate_path,
    aggregateSha256: normalized.aggregate_sha256,
    phase: "pre-gate1",
  });
  if (verified?.verdict !== "pass") {
    const suffix = verified?.failed_binding ? ` for ${verified.failed_binding}` : "";
    return result("blocked", "RECONCILE_BINDINGS", `reconcile changed OpenSpec bindings${suffix}`, verified?.error_code ?? "BINDING_INVALID");
  }
  if (!safeString(verified.aggregate_path) || path.resolve(verified.aggregate_path) !== path.resolve(aggregatePath)) {
    return result("blocked", null, null, "AGGREGATE_IDENTITY_MISMATCH");
  }
  return result("resume", "PRESENT_CONSOLIDATED_GATE_1", "present consolidated STAGE-GATE-1");
}

export async function recoverOpenSpecDesign({ state, workspace, snapshotVerifier = verifySnapshot, bindingsVerifier = verifyOpenSpecBindingsManifest } = {}) {
  const normalized = normalizeOpenSpecRecoveryState(state);
  if (normalized === null || !safeString(workspace)) {
    return result("blocked", null, null, "STATE_INVALID");
  }
  let root;
  try {
    root = await realpath(path.resolve(workspace));
    if (!(await lstat(root)).isDirectory()) throw new Error("workspace");
  } catch { return result("blocked", null, null, "WORKSPACE_INVALID"); }

  if (normalized.version === 4) return recoverV4({ normalized, workspace: root, bindingsVerifier });

  if (state.openspec_preflight === "blocked-prerequisite" || state.openspec_preflight === "invalid-project") {
    return result("blocked", "RESOLVE_PREFLIGHT", "resolve OpenSpec preflight blocker", "PREFLIGHT_BLOCKED");
  }
  if (state.openspec_design_pass === "preflight") return result("resume", "RUN_PREFLIGHT", "run OpenSpec preflight");
  if (state.openspec_design_pass === "provisioning") {
    return state.openspec_preflight === "provisionable"
      ? result("resume", "RESUME_PROVISIONING", "resume approved OpenSpec provisioning")
      : result("blocked", null, null, "STATE_INVALID");
  }
  if (state.openspec_preflight !== "ready") return result("blocked", null, null, "STATE_INVALID");
  if (state.openspec_design_pass === "planning") return result("resume", "RESUME_PLANNING", "resume upstream OpenSpec planning");
  if (state.openspec_design_pass === "snapshot") return result("resume", "CAPTURE_SNAPSHOT", "capture strict OpenSpec snapshot");

  const snapshotPath = state.openspec_snapshot_path;
  if (snapshotPath !== "inputs/openspec-snapshot.json" || !SHA256.test(state.openspec_snapshot_sha256 ?? "")) {
    return result("blocked", null, null, "SNAPSHOT_STATE_INVALID");
  }
  let snapshotBytes;
  try { snapshotBytes = await readWorkspaceFile(root, snapshotPath); }
  catch { return result("resume", "CAPTURE_SNAPSHOT", "capture strict OpenSpec snapshot", "SNAPSHOT_MISSING"); }
  if (hash(snapshotBytes) !== state.openspec_snapshot_sha256) return result("blocked", "RECONCILE_SOURCE", "reconcile changed OpenSpec source", "SNAPSHOT_STALE");
  const freshness = await snapshotVerifier({ snapshotPath: path.join(root, snapshotPath), phase: "pre-gate1" });
  if (freshness?.verdict !== "pass") return result("blocked", "RECONCILE_SOURCE", "reconcile changed OpenSpec source", "CANONICAL_SOURCE_CHANGED");

  if (state.openspec_design_pass === "overlay") {
    return result("resume", "DERIVE_OVERLAY", "rerun the mechanical OpenSpec overlay derivation with overwrite authorized for this recovery event — no architect dispatch");
  }
  if (state.openspec_overlay_path !== "plan/openspec-traceability.json" || !SHA256.test(state.openspec_overlay_sha256 ?? "")) {
    return result("blocked", null, null, "OVERLAY_STATE_INVALID");
  }
  let overlayBytes;
  try { overlayBytes = await readWorkspaceFile(root, state.openspec_overlay_path); }
  catch {
    return result(
      "resume",
      "DERIVE_OVERLAY",
      "rerun the mechanical OpenSpec overlay derivation with overwrite authorized for this recovery event — no architect dispatch",
      "OVERLAY_MISSING",
    );
  }
  if (hash(overlayBytes) !== state.openspec_overlay_sha256) return result("blocked", "REVALIDATE_OVERLAY", "revalidate OpenSpec execution overlay", "OVERLAY_STALE");
  return result("resume", "PRESENT_GATE_1", "present STAGE-GATE-1");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [operation, raw] = process.argv.slice(2);
  if (operation !== "correction-counters" || !safeString(raw) || Buffer.byteLength(raw, "utf8") > 1024 * 1024) {
    process.stderr.write("openspec-recovery.mjs accepts correction-counters with one bounded JSON argument; Design recovery remains a library helper.\n");
    process.exitCode = 2;
  } else {
    let options;
    try { options = JSON.parse(raw); }
    catch { options = {}; }
    const output = await reconcileCorrectionCounters(options);
    process.stdout.write(`${JSON.stringify(output)}\n`);
    if (!["pass", "repair"].includes(output.verdict)) process.exitCode = 1;
  }
}
