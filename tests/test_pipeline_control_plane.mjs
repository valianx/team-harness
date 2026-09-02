#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  CONTROL_PLANE_SCHEMA_VERSION,
  acceptResultEnvelope,
  appendControlEvent,
  buildControlProjection,
  buildOperatorPlanMarkdown,
  canonicalControlBytes,
  controlIdentity,
  createCapabilityLease,
  createControlRecord,
  createResultEnvelope,
  closeWorkspaceWithoutControlLog,
  certifyCapabilityCapsule,
  cleanerEligibility,
  decideCausalRecovery,
  deriveCoherentBatch,
  issueCapabilityLease,
  independentTestRequirement,
  operatorPlanFresh,
  qualityRequirement,
  rebuildControlProjections,
  replayControlBytes,
  replayControlLog,
  requiredPreflightRoles,
  securityImpactFromFloor,
  verifyCapabilityCapsule,
  validateCapabilityLease,
  validateExecutionProfile,
  validationRequirements,
  validateResultEnvelope,
} from "../skills/pipeline/scripts/control-plane.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
const h = value => hash(Buffer.from(value));
const git = (repository, ...args) => execFileSync("git", args, { cwd: repository, encoding: "utf8" }).trim();
const temporary = await mkdtemp(path.join(tmpdir(), "th-control-plane-"));

try {
  const worktree = path.join(temporary, "worktree");
  const workspace = path.join(temporary, "workspace");
  const control = path.join(workspace, "control");
  await mkdir(path.join(worktree, "src"), { recursive: true });
  await mkdir(path.join(worktree, "evidence"), { recursive: true });
  await mkdir(control, { recursive: true });
  await writeFile(path.join(worktree, "input.md"), "immutable\n");
  await writeFile(path.join(worktree, "evidence", "test.txt"), "pass\n");
  git(worktree, "init", "-q", "-b", "main");
  git(worktree, "config", "user.name", "Team Harness Test");
  git(worktree, "config", "user.email", "test@example.invalid");
  git(worktree, "add", "input.md", "evidence/test.txt");
  git(worktree, "commit", "-q", "-m", "base");
  const baselineCommit = git(worktree, "rev-parse", "HEAD");
  const authorityPayload = {
    presentation_nonce: "gate-1-nonce", decision: "approve", intent_identity: h("intent"),
    scope_identity: h("scope"), security_identity: h("security"),
  };
  const logPath = path.join(control, "control.jsonl");
  assert.equal((await appendControlEvent({
    log_path: logPath, type: "transition",
    provenance: { actor: "main", authority_event_id: null },
    payload: { phase: "implementation", status: "active" },
  })).error_code, "CONTROL_WRITER_INVALID");
  const authority = await appendControlEvent({
    log_path: logPath, writer: "main", type: "operator_authority",
    provenance: { actor: "main", authority_event_id: null }, payload: authorityPayload,
  });
  assert.equal(authority.ok, true);

  const leaseInput = {
    schema_version: CONTROL_PLANE_SCHEMA_VERSION,
    kind: "capability_lease",
    role: "implementer",
    authority_event_id: authority.record.event_id,
    intent_identity: h("intent"),
    scope_identity: h("scope"),
    security_identity: h("security"),
    worktree,
    writable_paths: ["src"],
    immutable_inputs: [{ path: "input.md", sha256: h("immutable\n") }],
    baseline_commit: baselineCommit,
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
  await rm(path.join(worktree, "escape"));

  const duplicateAuthority = await appendControlEvent({
    log_path: logPath, writer: "main", type: "operator_authority",
    provenance: { actor: "main", authority_event_id: null }, payload: authorityPayload,
  });
  assert.equal(duplicateAuthority.duplicate, true);
  assert.equal(duplicateAuthority.record.event_id, authority.record.event_id);
  assert.equal((await issueCapabilityLease({ log_path: logPath, lease })).error_code, "CONTROL_WRITER_INVALID");
  const issued = await issueCapabilityLease({ log_path: logPath, lease, writer: "main" });
  assert.equal(issued.record.sequence, 2);

  await writeFile(path.join(worktree, "src", "change.mjs"), "export {};\n");
  git(worktree, "add", "src/change.mjs");
  git(worktree, "commit", "-q", "-m", "task");
  const taskCommit = git(worktree, "rev-parse", "HEAD");

  const resultInput = {
    schema_version: CONTROL_PLANE_SCHEMA_VERSION,
    kind: "result_envelope",
    lease_id: lease.lease_id,
    status: "completed",
    changed_paths: ["src/change.mjs"],
    evidence_paths: ["evidence/test.txt"],
    artifacts: [{ path: "evidence/test.txt", sha256: h("pass\n") }],
    commits: [taskCommit],
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

  assert.equal((await acceptResultEnvelope({ log_path: logPath, result })).error_code, "CONTROL_WRITER_INVALID");
  const accepted = await acceptResultEnvelope({ log_path: logPath, result, writer: "main" });
  assert.equal(accepted.ok, true);
  assert.equal((await acceptResultEnvelope({
    log_path: logPath, result, writer: "main",
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
  assert.equal(projected.accepted_results[result.result_id].status, "completed");
  assert.equal(projected.findings["F-1"].state, "resolved");

  assert.equal((await rebuildControlProjections({ log_path: logPath, workspace })).error_code, "CONTROL_WRITER_INVALID");
  const projectionWrite = await rebuildControlProjections({ log_path: logPath, workspace, writer: "main" });
  assert.equal(projectionWrite.ok, true);
  const firstState = await readFile(path.join(workspace, "00-state.md"), "utf8");
  assert.match(firstState, /Projection only/);
  assert.match(await readFile(path.join(workspace, "reviews", "findings-ledger.md"), "utf8"), /F-1/);
  assert.equal((await rebuildControlProjections({ log_path: logPath, workspace, writer: "main" })).ok, true);
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

  assert.deepEqual(requiredPreflightRoles({ phase: "activation", next_role: null }), ["core"]);
  assert.deepEqual(requiredPreflightRoles({ phase: "design", next_role: null, openspec_ready: true }), []);
  assert.deepEqual(requiredPreflightRoles({ phase: "design", next_role: null, openspec_ready: false }), ["architect"]);
  assert.deepEqual(requiredPreflightRoles({ phase: "design", next_role: null, openspec_ready: true, semantic_update: true }), ["architect"]);
  assert.deepEqual(requiredPreflightRoles({ phase: "dispatch", next_role: "security" }), ["security"]);
  assert.equal(validateExecutionProfile({
    role: "security", model: "gpt-5.6-sol", effort: "xhigh",
    instruction_identity: h("instruction"), projection_identity: h("projection"),
  }), true);
  assert.equal(cleanerEligibility({
    violations: [{ path: "src/a.mjs", pattern: "format", semantic: false }], safe_patterns: ["format"],
  }).dispatch, true);
  assert.equal(cleanerEligibility({ violations: [], safe_patterns: ["format"] }).dispatch, false);
  assert.deepEqual(independentTestRequirement({
    bug_reproduction: false, migration_or_data_safety: false, public_compatibility: false,
    security_control: false, stale_independent_evidence: false, operator_requested: false,
  }), { dispatch: false, reasons: [], error_code: null });
  assert.deepEqual(independentTestRequirement({
    bug_reproduction: true, migration_or_data_safety: false, public_compatibility: true,
    security_control: false, stale_independent_evidence: false, operator_requested: false,
  }).reasons, ["bug_reproduction", "public_compatibility"]);
  assert.equal(independentTestRequirement({ bug_reproduction: true }).error_code, "TEST_RISK_INVALID");
  const coherentBatch = deriveCoherentBatch([
    { task_id: "1.1", role: "implementer", worktree, writable_paths: ["src"], immutable_inputs: [{ path: "input.md", sha256: h("immutable\n") }] },
    { task_id: "1.2", role: "implementer", worktree, writable_paths: ["evidence"], immutable_inputs: [{ path: "input.md", sha256: h("immutable\n") }] },
  ]);
  assert.equal(coherentBatch.ok, true);
  assert.deepEqual(coherentBatch.batch.task_ids, ["1.1", "1.2"]);
  assert.equal(deriveCoherentBatch([
    { task_id: "1.1", role: "implementer", worktree, writable_paths: ["src"], immutable_inputs: [] },
    { task_id: "1.2", role: "tester", worktree, writable_paths: ["evidence"], immutable_inputs: [] },
  ]).error_code, "BATCH_OWNER_MISMATCH");
  const nonSensitiveFloor = {
    applies: false, reason: null, categories: [], ambiguous: false, unscannable_paths: [],
  };
  const ambiguousFloor = {
    applies: true, reason: "unscannable content in 1 path(s)", categories: [],
    ambiguous: true, unscannable_paths: ["assets/blob.bin"],
  };
  assert.deepEqual(securityImpactFromFloor(nonSensitiveFloor), {
    ok: true, security_impact: false, error_code: null,
  });
  assert.deepEqual(securityImpactFromFloor(ambiguousFloor), {
    ok: true, security_impact: "unknown", error_code: null,
  });
  assert.deepEqual(validationRequirements({
    candidate_changed: true, independent_test_required: false, security_floor: nonSensitiveFloor,
  }), { ok: true, verifier: true, tester: false, security: false, error_code: null });
  assert.deepEqual(validationRequirements({
    candidate_changed: true, independent_test_required: true, security_floor: ambiguousFloor,
  }), { ok: true, verifier: true, tester: true, security: true, error_code: null });
  assert.deepEqual(validationRequirements({
    candidate_changed: true, independent_test_required: false,
    security_floor: { applies: false, reason: null, categories: [], ambiguous: true, unscannable_paths: [] },
  }), { ok: false, verifier: false, tester: false, security: true, error_code: "VALIDATION_RISK_INVALID" });
  assert.deepEqual(qualityRequirement({ candidate_identity: h("candidate"), last_quality_identity: null, phase: "pre-implementation" }), {
    run: false, scope: "prerequisites-only", error_code: null,
  });
  assert.equal(qualityRequirement({ candidate_identity: h("candidate"), last_quality_identity: h("candidate"), phase: "freeze" }).run, false);

  const operatorPlan = buildOperatorPlanMarkdown({
    change: "small-change", openspec_identity: h("openspec"),
    outcome: "The operator can observe the requested behavior.",
    included_scope: ["src"], excluded_scope: ["release automation"],
    approach: "Implement the strict-valid OpenSpec change in one coherent batch.",
    work_batches: ["Implementation and owned tests"], risks: ["Public compatibility"],
    decisions: ["Keep Gate 1"], preserved_behavior: ["Native permissions"],
    links: ["openspec/changes/small-change/proposal.md"],
  });
  assert.equal(operatorPlan.ok, true);
  assert.deepEqual(buildOperatorPlanMarkdown({
    change: "small-change", openspec_identity: h("openspec"),
    outcome: "api_key=abcdefgh12345678",
    included_scope: [], excluded_scope: [], approach: "No secret persistence.",
    work_batches: [], risks: [], decisions: [], preserved_behavior: [], links: [],
  }), { ok: false, markdown: null, identity: null, error_code: "OPERATOR_PLAN_INPUT_INVALID" });
  const operatorPlanInput = {
    change: "small-change", openspec_identity: h("openspec"),
    outcome: "The operator can observe the requested behavior.",
    included_scope: ["src"], excluded_scope: ["release automation"],
    approach: "Implement the strict-valid OpenSpec change in one coherent batch.",
    work_batches: ["Implementation and owned tests"], risks: ["Public compatibility"],
    decisions: ["Keep Gate 1"], preserved_behavior: ["Native permissions"],
    links: ["openspec/changes/small-change/proposal.md"],
  };
  assert.equal(operatorPlanFresh({ markdown: operatorPlan.markdown, input: operatorPlanInput }), true);
  assert.equal(operatorPlanFresh({ markdown: `${operatorPlan.markdown}\nmanual semantic edit\n`, input: operatorPlanInput }), false);
  assert.equal(operatorPlanFresh({ markdown: operatorPlan.markdown, input: { ...operatorPlanInput, openspec_identity: h("changed") } }), false);
  assert.doesNotMatch(operatorPlan.markdown, /Acceptance Criteria|Technical Constraints|capability_lease/);

  const capsule = await certifyCapabilityCapsule({
    workspace,
    capability_lease: lease,
    objective: "Implement the assigned OpenSpec item.",
    helper_bundle: { manifest_path: "inputs/helpers/manifest.json", manifest_sha256: h("manifest"), bundle_identity_sha256: h("bundle") },
  });
  assert.equal(capsule.ok, true);
  assert.deepEqual(Object.keys(capsule.capsule).sort(), ["capability_lease", "helper_bundle", "kind", "objective", "schema_version"]);
  assert.equal((await verifyCapabilityCapsule({ workspace, reference: capsule.reference })).ok, true);

  await writeFile(path.join(worktree, "outside.txt"), "outside lease\n");
  git(worktree, "add", "outside.txt");
  git(worktree, "commit", "-q", "-m", "outside");
  const outsideCommit = git(worktree, "rev-parse", "HEAD");
  const omittedOutside = (await createResultEnvelope({
    ...resultInput,
    commits: [taskCommit, outsideCommit],
    observed_control_sequence: 3,
  }, { lease, currentSequence: 3 })).value;
  assert.equal((await acceptResultEnvelope({
    log_path: logPath, result: omittedOutside, writer: "main",
  })).error_code, "RESULT_SCOPE_VIOLATION");

  const orphanWorkspace = path.join(temporary, "orphan-workspace");
  await mkdir(orphanWorkspace, { recursive: true });
  const closed = await closeWorkspaceWithoutControlLog({ workspace: orphanWorkspace });
  assert.equal(closed.outcome, "closed-administratively", JSON.stringify(closed));
  assert.deepEqual(closed.offer, ["inline-continuation", "fresh-run"]);
  const orphanEvents = await readFile(path.join(orphanWorkspace, "00-execution-events.jsonl"), "utf8");
  assert.match(orphanEvents, /"terminal_state":"closed-administratively"/);
  assert.equal((await closeWorkspaceWithoutControlLog({ workspace })).error_code, "CONTROL_LOG_PRESENT");
  const linkedWorkspace = path.join(temporary, "linked-workspace");
  await mkdir(linkedWorkspace, { recursive: true });
  await symlink(path.join(workspace, "control"), path.join(linkedWorkspace, "control"), "dir");
  assert.equal((await closeWorkspaceWithoutControlLog({ workspace: linkedWorkspace })).error_code, "CONTROL_PATH_SYMLINK");
  const eventsLinkWorkspace = path.join(temporary, "events-link-workspace");
  await mkdir(eventsLinkWorkspace, { recursive: true });
  await symlink(path.join(orphanWorkspace, "00-execution-events.jsonl"), path.join(eventsLinkWorkspace, "00-execution-events.jsonl"));
  assert.equal((await closeWorkspaceWithoutControlLog({ workspace: eventsLinkWorkspace })).error_code, "EVENTS_PATH_INVALID");
  assert.equal((await readFile(path.join(orphanWorkspace, "00-execution-events.jsonl"), "utf8")).split("\n").filter(Boolean).length, 1);
} finally {
  await rm(temporary, { recursive: true, force: true });
}

console.log("pipeline v5 control plane: PASS");
