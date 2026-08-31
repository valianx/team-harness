#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  CONTROL_PLANE_SCHEMA_VERSION,
  appendControlEvent,
  buildControlProjection,
  canonicalControlBytes,
  controlIdentity,
  createCapabilityLease,
  createControlRecord,
  createResultEnvelope,
  convertLegacyWorkspace,
  certifyCapabilityCapsule,
  cleanerEligibility,
  decideCausalRecovery,
  qualityRequirement,
  rebuildControlProjections,
  replayControlBytes,
  replayControlLog,
  requiredPreflightRoles,
  verifyCapabilityCapsule,
  validateCapabilityLease,
  validateExecutionProfile,
  validateResultEnvelope,
} from "../skills/pipeline/scripts/control-plane.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
const h = value => hash(Buffer.from(value));
const temporary = await mkdtemp(path.join(tmpdir(), "th-control-plane-"));

try {
  const worktree = path.join(temporary, "worktree");
  const workspace = path.join(temporary, "workspace");
  const control = path.join(workspace, "control");
  await mkdir(path.join(worktree, "src"), { recursive: true });
  await mkdir(path.join(worktree, "evidence"), { recursive: true });
  await mkdir(control, { recursive: true });
  await writeFile(path.join(worktree, "input.md"), "immutable\n");
  await writeFile(path.join(worktree, "src", "change.mjs"), "export {};\n");
  await writeFile(path.join(worktree, "evidence", "test.txt"), "pass\n");

  const leaseInput = {
    schema_version: CONTROL_PLANE_SCHEMA_VERSION,
    kind: "capability_lease",
    role: "implementer",
    authority_event_id: h("authority"),
    intent_identity: h("intent"),
    scope_identity: h("scope"),
    security_identity: h("security"),
    worktree,
    writable_paths: ["src"],
    immutable_inputs: [{ path: "input.md", sha256: h("immutable\n") }],
    context_identity: h("context"),
    lifecycle: "active",
  };
  const leaseCreated = await createCapabilityLease(leaseInput);
  assert.equal(leaseCreated.ok, true);
  const lease = leaseCreated.value;
  assert.equal((await validateCapabilityLease(lease, { requireActive: true })).ok, true);
  assert.equal(controlIdentity(leaseInput), lease.lease_id);
  assert.deepEqual(canonicalControlBytes({ z: 1, a: 2 }), canonicalControlBytes({ a: 2, z: 1 }));

  assert.equal((await validateCapabilityLease({ ...lease, surprise: true })).error_code, "LEASE_SCHEMA_INVALID");
  assert.equal((await validateCapabilityLease({ ...lease, lease_id: h("forged") })).error_code, "LEASE_IDENTITY_MISMATCH");
  assert.equal((await createCapabilityLease({ ...leaseInput, writable_paths: ["../escape"] })).error_code, "LEASE_SCHEMA_INVALID");
  assert.equal((await createCapabilityLease({ ...leaseInput, role: "api_key=0123456789abcdef" })).error_code, "LEASE_SCHEMA_INVALID");
  await writeFile(path.join(worktree, "input.md"), "changed\n");
  assert.equal((await validateCapabilityLease(lease)).error_code, "LEASE_INPUT_MISMATCH");
  await writeFile(path.join(worktree, "input.md"), "immutable\n");
  await symlink(temporary, path.join(worktree, "escape"));
  assert.equal((await createCapabilityLease({ ...leaseInput, writable_paths: ["escape/file"] })).error_code, "LEASE_PATH_INVALID");

  const resultInput = {
    schema_version: CONTROL_PLANE_SCHEMA_VERSION,
    kind: "result_envelope",
    lease_id: lease.lease_id,
    status: "completed",
    changed_paths: ["src/change.mjs"],
    evidence_paths: ["evidence/test.txt"],
    artifacts: [{ path: "evidence/test.txt", sha256: h("pass\n") }],
    commits: [h("commit")],
    findings: [{
      id: "F-1", class: "correctness", severity: "low", state: "resolved",
      summary: "Covered by focused test", evidence_paths: ["evidence/test.txt"],
    }],
    closure_evidence: [{ path: "evidence/test.txt", sha256: h("pass\n") }],
    diagnostics: ["bounded"],
    next_prerequisites: [],
    observed_control_sequence: 2,
    context_identity: lease.context_identity,
  };
  const resultCreated = await createResultEnvelope(resultInput, { lease, currentSequence: 2 });
  assert.equal(resultCreated.ok, true);
  const result = resultCreated.value;
  assert.equal((await validateResultEnvelope(result, { lease, currentSequence: 2 })).ok, true);
  assert.equal((await validateResultEnvelope({ ...result, lease_id: h("other") }, { lease, currentSequence: 2 })).error_code, "RESULT_IDENTITY_MISMATCH");
  assert.equal((await createResultEnvelope({ ...resultInput, changed_paths: ["outside.txt"] }, { lease, currentSequence: 2 })).error_code, "RESULT_SCOPE_VIOLATION");
  assert.equal((await createResultEnvelope({ ...resultInput, diagnostics: ["token=github_pat_0123456789abcdef"] }, { lease, currentSequence: 2 })).error_code, "RESULT_SCHEMA_INVALID");
  assert.equal((await createResultEnvelope(resultInput, { lease, currentSequence: 3 })).error_code, "RESULT_SEQUENCE_STALE");

  const authorityPayload = {
    presentation_nonce: "gate-1-nonce", decision: "approve", intent_identity: h("intent"),
    scope_identity: h("scope"), security_identity: h("security"),
  };
  const logPath = path.join(control, "control.jsonl");
  const authority = await appendControlEvent({
    log_path: logPath, type: "operator_authority",
    provenance: { actor: "main", authority_event_id: null }, payload: authorityPayload,
  });
  assert.equal(authority.ok, true);
  const duplicateAuthority = await appendControlEvent({
    log_path: logPath, type: "operator_authority",
    provenance: { actor: "main", authority_event_id: null }, payload: authorityPayload,
  });
  assert.equal(duplicateAuthority.duplicate, true);
  assert.equal(duplicateAuthority.record.event_id, authority.record.event_id);
  const issued = await appendControlEvent({
    log_path: logPath, type: "lease_issued",
    provenance: { actor: "main", authority_event_id: authority.record.event_id },
    payload: { lease },
  });
  assert.equal(issued.record.sequence, 2);
  const acceptedResultInput = { ...resultInput, observed_control_sequence: 2 };
  const acceptedResult = (await createResultEnvelope(acceptedResultInput, { lease, currentSequence: 2 })).value;
  const accepted = await appendControlEvent({
    log_path: logPath, type: "result_accepted",
    provenance: { actor: "main", authority_event_id: authority.record.event_id },
    payload: { result: acceptedResult },
  });
  assert.equal(accepted.ok, true);
  assert.equal((await appendControlEvent({
    log_path: logPath, type: "result_accepted",
    provenance: { actor: "main", authority_event_id: authority.record.event_id },
    payload: { result: acceptedResult },
  })).duplicate, true);
  assert.equal((await appendControlEvent({
    log_path: logPath, type: "transition", writer: "specialist",
    provenance: { actor: "main", authority_event_id: authority.record.event_id },
    payload: { phase: "implementation", status: "active" },
  })).error_code, "CONTROL_WRITER_INVALID");

  const replay = await replayControlLog(logPath);
  assert.equal(replay.ok, true);
  assert.equal(replay.sequence, 3);
  assert.equal(replay.records[1].previous_hash, replay.records[0].event_id);
  const projected = buildControlProjection(replay.records);
  assert.equal(projected.authority.decision, "approve");
  assert.equal(projected.accepted_results[acceptedResult.result_id].status, "completed");
  assert.equal(projected.findings["F-1"].state, "resolved");

  const projectionWrite = await rebuildControlProjections({ log_path: logPath, workspace });
  assert.equal(projectionWrite.ok, true);
  const firstState = await readFile(path.join(workspace, "00-state.md"), "utf8");
  assert.match(firstState, /Projection only/);
  assert.match(await readFile(path.join(workspace, "reviews", "findings-ledger.md"), "utf8"), /F-1/);
  assert.equal((await rebuildControlProjections({ log_path: logPath, workspace })).ok, true);
  assert.equal(await readFile(path.join(workspace, "00-state.md"), "utf8"), firstState);

  const bytes = await readFile(logPath);
  const corrupt = replayControlBytes(Buffer.concat([bytes, Buffer.from('{"partial":')]));
  assert.equal(corrupt.ok, false);
  assert.equal(corrupt.sequence, 3);
  assert.equal(corrupt.invalid_line, 4);
  const wrongLink = createControlRecord({
    schema_version: 5, kind: "control_event", sequence: 4, previous_hash: h("wrong"),
    type: "transition", provenance: { actor: "main", authority_event_id: authority.record.event_id },
    payload: { phase: "validation", status: "active" },
  }).value;
  const brokenChain = replayControlBytes(Buffer.concat([bytes, canonicalControlBytes(wrongLink)]));
  assert.equal(brokenChain.ok, false);
  assert.equal(brokenChain.sequence, 3);

  const recoveryFacts = {
    authority_valid: true, identities_unchanged: true, context_verifiable: true,
    ownership_safe: true, independent_lens_changed: false, progress_preserved: true,
    prerequisite_available: true, semantic_change: false, candidate_changed: true,
    security_impact: "unknown", failed_action_identity: h("failed"), safe_action_identity: h("repaired"),
  };
  assert.equal(decideCausalRecovery(recoveryFacts).route, "continue_same_session");
  assert.equal(decideCausalRecovery(recoveryFacts).validation.fresh_security, true);
  assert.equal(decideCausalRecovery({ ...recoveryFacts, context_verifiable: false }).route, "replace_session");
  assert.equal(decideCausalRecovery({ ...recoveryFacts, semantic_change: true }).route, "require_live_decision");
  assert.equal(decideCausalRecovery({ ...recoveryFacts, safe_action_identity: h("failed") }).route, "pause");
  assert.equal(decideCausalRecovery({ ...recoveryFacts, attempt: 2 }).error_code, "RECOVERY_EVIDENCE_INVALID");

  assert.deepEqual(requiredPreflightRoles({ phase: "activation", next_role: null }), ["core", "architect"]);
  assert.deepEqual(requiredPreflightRoles({ phase: "dispatch", next_role: "security" }), ["security"]);
  assert.equal(validateExecutionProfile({
    role: "security", model: "gpt-5.6-sol", effort: "xhigh",
    instruction_identity: h("instruction"), projection_identity: h("projection"),
  }), true);
  assert.equal(cleanerEligibility({
    violations: [{ path: "src/a.mjs", pattern: "format", semantic: false }], safe_patterns: ["format"],
  }).dispatch, true);
  assert.equal(cleanerEligibility({ violations: [], safe_patterns: ["format"] }).dispatch, false);
  assert.equal(qualityRequirement({ candidate_identity: h("candidate"), last_quality_identity: null, phase: "pre-implementation" }).scope, "prerequisites-and-red");
  assert.equal(qualityRequirement({ candidate_identity: h("candidate"), last_quality_identity: h("candidate"), phase: "freeze" }).run, false);

  const capsule = await certifyCapabilityCapsule({
    workspace,
    capability_lease: lease,
    objective: "Implement the assigned OpenSpec item.",
    helper_bundle: { manifest_path: "inputs/helpers/manifest.json", manifest_sha256: h("manifest"), bundle_identity_sha256: h("bundle") },
  });
  assert.equal(capsule.ok, true);
  assert.deepEqual(Object.keys(capsule.capsule).sort(), ["capability_lease", "helper_bundle", "kind", "objective", "schema_version"]);
  assert.equal((await verifyCapabilityCapsule({ workspace, reference: capsule.reference })).ok, true);

  const legacyWorkspace = path.join(temporary, "legacy-workspace");
  await mkdir(path.join(legacyWorkspace, "inputs"), { recursive: true });
  await writeFile(path.join(legacyWorkspace, "inputs", "snapshot.json"), "{}\n");
  const legacy = {
    schema_version: 4,
    kind: "team_harness_legacy_control_state",
    authority: authorityPayload,
    bindings: [{ service: "team-harness", verdict: "pass", error_code: null }],
    immutable_inputs: [{ path: "inputs/snapshot.json", sha256: h("{}\n") }],
    dirty_progress: [],
    phase: "implementation",
    status: "active",
    original_gate_identity: h("legacy-gate"),
    continuation: null,
  };
  const bindingFailure = await convertLegacyWorkspace({
    workspace: legacyWorkspace,
    legacy: { ...legacy, bindings: [{ service: "team-harness", verdict: "fail", error_code: "OVERLAY_INVALID" }] },
  });
  assert.equal(bindingFailure.error_code, "OVERLAY_INVALID");
  assert.equal(bindingFailure.service, "team-harness");
  const converted = await convertLegacyWorkspace({ workspace: legacyWorkspace, legacy });
  assert.equal(converted.outcome, "converted", JSON.stringify(converted));
  assert.equal((await convertLegacyWorkspace({ workspace: legacyWorkspace, legacy })).outcome, "already-v5");
} finally {
  await rm(temporary, { recursive: true, force: true });
}

console.log("pipeline v5 control plane: PASS");
