#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  auditOpenSpecBindingDispatches,
  bindOpenSpecEvidenceDispatch,
  bindConsolidatedGate1,
  canonicalJsonBytes,
  createOpenSpecBindingsManifest,
  migrateLegacyV1ApprovedPlaceholderWorkspace,
  repairOpenSpecBindingDerivedArtifacts,
  sealOpenSpecBindingDispatch,
  verifyConsolidatedGate1,
  verifyLegacyV1CurrentBindings,
  verifyOpenSpecBindingDispatch,
  verifyOpenSpecEvidenceDispatch,
  verifyOpenSpecBindingsManifest,
} from "../skills/pipeline/scripts/openspec-bindings.mjs";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");

function snapshot({ repository, workspace, service }) {
  const artifact = {
    artifact_id: "tasks",
    path: `openspec/changes/${service}/tasks.md`,
    content_sha256: "a".repeat(64),
    intent_sha256: "b".repeat(64),
    coordinates: [{ kind: "task", id: "task:1.1", title: "Implement service", line: 1, complete: false }],
  };
  return {
    schema_version: 3,
    kind: "team_harness_openspec_snapshot",
    captured_at: "2026-08-24T12:00:00Z",
    repository: { root: repository, head_sha: "c".repeat(40) },
    workspace: { root: workspace, mode: "obsidian", navigation_kind: "repository-relative-coordinates" },
    toolchain: { runtime: "codex", node_version: "22.0.0", npm_version: "10.0.0", openspec_version: "1.9.0", generated_targets: [] },
    change: { name: service, schema: "spec-driven", root: path.join(repository, "openspec", "changes", service) },
    artifacts: [artifact],
    artifact_set_sha256: hash(Buffer.from(`${artifact.path}\0${artifact.content_sha256}`)),
  };
}

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "th-openspec-bindings-"));
  const workspace = path.join(root, "vault", "zippy", "2026-08-24_payment-flow");
  await mkdir(workspace, { recursive: true });
  const services = ["merchant-bridge", "payments-orchestrator", "transactions"];
  const bindings = [];
  for (const service of services) {
    const repository = path.join(root, "zippy", service);
    const planningRoot = path.join(repository, "openspec", "changes", service);
    await mkdir(planningRoot, { recursive: true });
    const snapshotPath = path.join(workspace, "inputs", "openspec", service, "snapshot.json");
    const overlayPath = path.join(workspace, "plan", "openspec", service, "traceability.json");
    await mkdir(path.dirname(snapshotPath), { recursive: true });
    await mkdir(path.dirname(overlayPath), { recursive: true });
    const snapshotValue = snapshot({ repository, workspace, service });
    await writeFile(snapshotPath, `${JSON.stringify(snapshotValue)}\n`);
    await writeFile(path.join(path.dirname(snapshotPath), "openspec-progress.json"), `${JSON.stringify({
      schema_version: 1,
      kind: "team_harness_openspec_progress",
      change_name: service,
      task_intent_sha256: snapshotValue.artifacts[0].intent_sha256,
      completed: [],
      events: [],
    }, null, 2)}\n`);
    const shardPath = `plan/openspec/${service}/tasks/Task-1.md`;
    await writeFile(overlayPath, `${JSON.stringify({
      service,
      valid: true,
      freeze: { quality_manifest_path: ".team-harness/quality.json" },
      execution_items: [{ shard_path: shardPath }],
    })}\n`);
    await mkdir(path.join(workspace, ".team-harness"), { recursive: true });
    await writeFile(path.join(workspace, ".team-harness", "quality.json"), "{\"commands\":{}}\n");
    await mkdir(path.join(workspace, "services", service), { recursive: true });
    await writeFile(path.join(workspace, "services", service, "01-plan.md"), `# ${service} plan\n`);
    await mkdir(path.dirname(path.join(workspace, shardPath)), { recursive: true });
    await writeFile(path.join(workspace, shardPath), `# ${service} Task 1\n`);
    bindings.push({
      service,
      repository_root: repository,
      repository_identity: `identity:${service}`,
      change_name: service,
      planning_root: planningRoot,
      schema: "spec-driven",
      cli_version: "1.9.0",
      generated_skill_identity: `openspec-1.9.0:${service}`,
    });
  }
  const evidenceRepository = path.join(root, "zippy", "payment-gateway");
  const evidenceRelativePath = "src/contracts/payment-request.ts";
  const evidenceBytes = Buffer.from("export const paymentRequestVersion = 1;\n");
  await mkdir(path.join(evidenceRepository, "src", "contracts"), { recursive: true });
  await writeFile(path.join(evidenceRepository, evidenceRelativePath), evidenceBytes);
  const evidenceRepositories = [{
    service: "payment-gateway",
    role: "evidence-only",
    repository_root: evidenceRepository,
    repository_identity: "identity:payment-gateway",
    purpose: "Read-only contract evidence.",
  }];
  const dependencies = [
    { from: "merchant-bridge", to: "payments-orchestrator", kind: "request-contract" },
    { from: "payments-orchestrator", to: "transactions", kind: "transaction-contract" },
  ];
  const executionOrder = services.slice();
  const repositoryIdentityReader = async repository => `identity:${path.basename(repository)}`;
  const overlayValidator = async () => ({ verdict: "pass" });
  return {
    root, workspace, services, bindings, evidenceRepositories, dependencies, executionOrder,
    repositoryIdentityReader, overlayValidator, evidenceRelativePath, evidenceSha256: hash(evidenceBytes),
  };
}

async function use(callback) {
  const value = await fixture();
  try { await callback(value); } finally { await rm(value.root, { recursive: true, force: true }); }
}

const executionContract = service => `# ${service}\n\n- [ ] 1.1 Implement service\n\n## Team Harness Execution Contract\n\n\`\`\`json\n{"service":"${service}"}\n\`\`\`\n`;

async function prepareCurrentTaskFiles(value, advancedServices = []) {
  const advanced = new Set(Array.isArray(advancedServices) ? advancedServices : [advancedServices]);
  for (const service of value.services) {
    const repository = path.join(value.root, "zippy", service);
    const taskPath = path.join(repository, "openspec", "changes", service, "tasks.md");
    const original = executionContract(service);
    await writeFile(taskPath, advanced.has(service) ? original.replace("- [ ] 1.1", "- [x] 1.1") : original);
    const snapshotPath = path.join(value.workspace, "inputs", "openspec", service, "snapshot.json");
    const snapshotValue = JSON.parse(await readFile(snapshotPath, "utf8"));
    snapshotValue.artifacts[0].content_sha256 = hash(Buffer.from(original));
    snapshotValue.artifact_set_sha256 = hash(Buffer.from(`${snapshotValue.artifacts[0].path}\0${snapshotValue.artifacts[0].content_sha256}`));
    await writeFile(snapshotPath, `${JSON.stringify(snapshotValue)}\n`);
    if (advanced.has(service)) {
      const progressPath = path.join(path.dirname(snapshotPath), "openspec-progress.json");
      const progress = JSON.parse(await readFile(progressPath, "utf8"));
      progress.completed = ["task:1.1"];
      progress.events = [{
        recorded_at: "2026-08-25T18:14:56.974Z",
        task_ids: ["task:1.1"],
        previous_progress_sha256: "1".repeat(64),
        task_content_sha256: hash(Buffer.from(original.replace("- [ ] 1.1", "- [x] 1.1"))),
      }];
      await writeFile(progressPath, `${JSON.stringify(progress, null, 2)}\n`);
    }
  }
}

async function legacyMigrationFixture(value) {
  await prepareCurrentTaskFiles(value, "transactions");
  const created = await createOpenSpecBindingsManifest(value);
  assert.equal(created.verdict, "pass");
  const approvedAggregateSha256 = "d".repeat(64);
  const gate = bindConsolidatedGate1({ manifest: created.manifest, aggregateSha256: approvedAggregateSha256, nonce: "legacy-gate-nonce" });
  await mkdir(path.join(value.workspace, "inputs"), { recursive: true });
  await writeFile(path.join(value.workspace, "inputs", "gate1-binding.json"), canonicalJsonBytes(gate));
  const prefixes = value.services.map(service => {
    const prefix = `# ${service}\n\n- [ ] 1.1 Implement service\n`;
    return {
      service,
      approved_task_intent_sha256: hash(Buffer.from(prefix)),
      current_normative_prefix_sha256: hash(Buffer.from(prefix)),
      identical: true,
    };
  });
  const evidence = {
    schema_version: 1,
    kind: "team_harness_openspec_derived_contract_repair",
    verdict: "pass",
    authority: "operator-live",
    finding_id: "IMPLEMENTATION-PACKET-PLACEHOLDER",
    gate1: { decision: "approved", approved_aggregate_sha256: approvedAggregateSha256, nonce: gate.nonce, preserved: true },
    before: {
      aggregate_sha256: approvedAggregateSha256,
      services: created.manifest.bindings.map(binding => ({ service: binding.service, snapshot_sha256: "2".repeat(64), overlay_sha256: "3".repeat(64) })),
    },
    after: {
      aggregate_sha256: created.aggregate_sha256,
      services: created.manifest.bindings.map(binding => ({ service: binding.service, snapshot_sha256: binding.snapshot_sha256, overlay_sha256: binding.overlay_sha256 })),
    },
    normative_task_prefix_proof: prefixes,
  };
  const evidencePath = path.join(value.workspace, "evidence", "plan-contract-auto-repair.json");
  await mkdir(path.dirname(evidencePath), { recursive: true });
  const evidenceBytes = canonicalJsonBytes(evidence);
  await writeFile(evidencePath, evidenceBytes);
  const events = [
    { event: "stage.gate.release", feature: "payment-flow", stage: 1, gate: "gate1", decision: "approved", origin: "operator-live", nonce: gate.nonce, aggregate_sha256: approvedAggregateSha256, gate_identity_sha256: gate.gate_identity_sha256, binding_services: gate.binding_services },
    { event: "operator.decision", feature: "payment-flow", decision: "auto-repair-derived-plan-contract", authority: "operator-live", finding_id: "IMPLEMENTATION-PACKET-PLACEHOLDER" },
    { event: "operation.success", feature: "payment-flow", operation: "herdr-report-fixes", message_id: "th-placeholder-autorepair-20260825" },
    { event: "operation.success", feature: "payment-flow", operation: "derived-plan-contract-auto-repair", finding_id: "IMPLEMENTATION-PACKET-PLACEHOLDER", before_aggregate_sha256: approvedAggregateSha256, after_aggregate_sha256: created.aggregate_sha256, repair_evidence_path: "evidence/plan-contract-auto-repair.json", repair_evidence_sha256: hash(evidenceBytes), gate1_preserved: true },
    { event: "agent.spawn", feature: "payment-flow", service: "transactions", agent_role: "tester", task: "Task-1" },
  ];
  await writeFile(path.join(value.workspace, "00-execution-events.jsonl"), `${events.map(event => JSON.stringify(event)).join("\n")}\n`);
  return { created, gate };
}

console.log("=== OpenSpec multi-service bindings ===");

await use(async value => {
  const created = await createOpenSpecBindingsManifest(value);
  assert.equal(created.verdict, "pass");
  assert.deepEqual(created.manifest.bindings.map(item => item.service), value.services);
  assert.deepEqual(created.manifest.evidence_repositories.map(item => item.service), ["payment-gateway"]);
  assert.equal(created.manifest.evidence_repositories[0].role, "evidence-only");
  assert.equal(created.manifest.bindings[0].task_intent_sha256, "b".repeat(64));
  assert.equal(created.manifest.bindings[0].strict_validation, "pass");
  assert.match(created.aggregate_sha256, /^[a-f0-9]{64}$/);
  console.log("  [PASS] three writable owners and one evidence-only repository");
});

await use(async value => {
  const created = await createOpenSpecBindingsManifest(value);
  const priorProgressPath = path.join(value.workspace, "inputs", "openspec", "payments-orchestrator", "openspec-progress.json");
  const priorProgress = JSON.parse(await readFile(priorProgressPath, "utf8"));
  priorProgress.completed = ["task:1.1"];
  priorProgress.events = [{
    recorded_at: "2026-08-25T18:14:56.974Z",
    task_ids: ["task:1.1"],
    previous_progress_sha256: "1".repeat(64),
    task_content_sha256: "2".repeat(64),
  }];
  await writeFile(priorProgressPath, `${JSON.stringify(priorProgress, null, 2)}\n`);
  const seen = [];
  const verified = await verifyOpenSpecBindingsManifest({
    workspace: value.workspace,
    aggregateSha256: created.aggregate_sha256,
    repositoryIdentityReader: value.repositoryIdentityReader,
    overlayValidator: value.overlayValidator,
    phase: "implementation",
    authorizedTasksByService: { transactions: ["1.1"] },
    snapshotVerifier: async options => { seen.push(options); return { verdict: "pass" }; },
  });
  assert.equal(verified.verdict, "pass");
  const transactions = seen.find(item => item.snapshotPath.includes("transactions"));
  const payments = seen.find(item => item.snapshotPath.includes("payments-orchestrator"));
  const merchant = seen.find(item => item.snapshotPath.includes("merchant-bridge"));
  assert.deepEqual({ phase: transactions.phase, authorizedTaskIds: transactions.authorizedTaskIds }, {
    phase: "implementation", authorizedTaskIds: ["1.1"],
  });
  assert.deepEqual({ phase: payments.phase, authorizedTaskIds: payments.authorizedTaskIds }, {
    phase: "implementation", authorizedTaskIds: ["task:1.1"],
  });
  assert.deepEqual({ phase: merchant.phase, authorizedTaskIds: merchant.authorizedTaskIds }, {
    phase: "pre-gate1", authorizedTaskIds: [],
  });
  console.log("  [PASS] aggregate freshness selects active, recorded, and untouched service modes independently");
});

await use(async value => {
  const mismatch = await createOpenSpecBindingsManifest({ ...value, repositoryIdentityReader: async () => "wrong" });
  assert.equal(mismatch.error_code, "REPOSITORY_IDENTITY_MISMATCH");
  assert.equal(mismatch.failed_binding, "merchant-bridge");
  console.log("  [PASS] repository identity mismatch fails closed");
});

await use(async value => {
  const created = await createOpenSpecBindingsManifest(value);
  const snapshotPath = path.join(value.workspace, "inputs", "openspec", "payments-orchestrator", "snapshot.json");
  await unlink(snapshotPath);
  const verified = await verifyOpenSpecBindingsManifest({
    workspace: value.workspace, aggregateSha256: created.aggregate_sha256,
    repositoryIdentityReader: value.repositoryIdentityReader, overlayValidator: value.overlayValidator,
    snapshotVerifier: async () => ({ verdict: "pass" }),
  });
  assert.equal(verified.verdict, "fail");
  assert.equal(verified.failed_binding, "payments-orchestrator");
  console.log("  [PASS] unreadable required artifact fails closed");
});

await use(async value => {
  const created = await createOpenSpecBindingsManifest(value);
  await writeFile(path.join(value.workspace, "plan", "openspec", "transactions", "traceability.json"), "changed\n");
  const verified = await verifyOpenSpecBindingsManifest({
    workspace: value.workspace, aggregateSha256: created.aggregate_sha256,
    repositoryIdentityReader: value.repositoryIdentityReader, overlayValidator: value.overlayValidator,
    snapshotVerifier: async () => ({ verdict: "pass" }),
  });
  assert.equal(verified.error_code, "BINDING_STALE");
  assert.equal(verified.failed_binding, "transactions");
  console.log("  [PASS] stale child hash fails closed");
});

await use(async value => {
  const created = await createOpenSpecBindingsManifest(value);
  const gate = bindConsolidatedGate1({ manifest: created.manifest, aggregateSha256: created.aggregate_sha256, nonce: "gate-1-nonce" });
  assert.equal(gate.scope, "initiative");
  assert.deepEqual(gate.binding_services, value.executionOrder);
  assert.equal(Object.hasOwn(gate, "child_gate"), false);
  assert.equal(verifyConsolidatedGate1({ gate, manifest: created.manifest, aggregateSha256: created.aggregate_sha256, nonce: "gate-1-nonce" }).verdict, "pass");
  const dependencyFree = { ...created.manifest, dependencies: [] };
  const dependencyFreeGate = bindConsolidatedGate1({ manifest: dependencyFree, aggregateSha256: hash(canonicalJsonBytes(dependencyFree)), nonce: "gate-1-nonce" });
  const reordered = { ...dependencyFree, execution_order: dependencyFree.execution_order.slice().reverse() };
  assert.equal(verifyConsolidatedGate1({ gate: dependencyFreeGate, manifest: reordered, aggregateSha256: hash(canonicalJsonBytes(reordered)), nonce: "gate-1-nonce" }).error_code, "GATE1_IDENTITY_STALE");
  console.log("  [PASS] one consolidated Gate 1 binds membership, order, hash, and nonce");
});

await use(async value => {
  const created = await createOpenSpecBindingsManifest(value);
  const gate = bindConsolidatedGate1({ manifest: created.manifest, aggregateSha256: created.aggregate_sha256, nonce: "gate-1-nonce" });
  const evidencePath = "plan/openspec/transactions/derived-repair.json";
  const evidenceBytes = Buffer.from("{\"repair\":true}\n");
  let repairCalls = 0;
  const repaired = await repairOpenSpecBindingDerivedArtifacts({
    workspace: value.workspace,
    aggregateSha256: created.aggregate_sha256,
    service: "transactions",
    gate,
    nonce: "gate-1-nonce",
    implementationStarted: false,
    repositoryIdentityReader: value.repositoryIdentityReader,
    snapshotVerifier: async () => ({ verdict: "pass" }),
    overlayValidator: value.overlayValidator,
    overlayRepairer: async input => {
      repairCalls += 1;
      assert.equal(input.approvedOverlaySha256, created.manifest.bindings.find(item => item.service === "transactions").overlay_sha256);
      assert.equal(input.approvedAggregateSha256, created.aggregate_sha256);
      assert.equal(input.approvedGateIdentitySha256, gate.gate_identity_sha256);
      await mkdir(path.dirname(path.join(value.workspace, evidencePath)), { recursive: true });
      await writeFile(path.join(value.workspace, evidencePath), evidenceBytes);
      return { verdict: "pass", changed: true, error_code: null, evidence_path: evidencePath, evidence_sha256: hash(evidenceBytes) };
    },
  });
  assert.equal(repaired.verdict, "pass", JSON.stringify(repaired));
  assert.equal(repairCalls, 1);
  assert.equal(repaired.gate_identity_sha256, gate.gate_identity_sha256);
  const verification = JSON.parse(await readFile(path.join(value.workspace, repaired.verification_path), "utf8"));
  assert.deepEqual(verification.post_validation, { consolidated_gate1: "pass", overlay_and_aggregate: "pass" });
  console.log("  [PASS] derived repair is bound to the same aggregate and consolidated Gate 1 before and after");
});

await use(async value => {
  const created = await createOpenSpecBindingsManifest(value);
  const gate = bindConsolidatedGate1({ manifest: created.manifest, aggregateSha256: created.aggregate_sha256, nonce: "gate-1-nonce" });
  let called = false;
  const repaired = await repairOpenSpecBindingDerivedArtifacts({
    workspace: value.workspace,
    aggregateSha256: created.aggregate_sha256,
    service: "transactions",
    gate: { ...gate, gate_identity_sha256: "f".repeat(64) },
    nonce: "gate-1-nonce",
    implementationStarted: false,
    repositoryIdentityReader: value.repositoryIdentityReader,
    overlayRepairer: async () => { called = true; },
  });
  assert.equal(repaired.error_code, "GATE1_IDENTITY_STALE");
  assert.equal(called, false);
  console.log("  [PASS] stale Gate-1 identity blocks derived repair before mutation");
});

await use(async value => {
  const created = await createOpenSpecBindingsManifest(value);
  const gate = bindConsolidatedGate1({ manifest: created.manifest, aggregateSha256: created.aggregate_sha256, nonce: "gate-1-nonce" });
  const progressPath = path.join(value.workspace, "inputs/openspec/transactions/openspec-progress.json");
  const progress = JSON.parse(await readFile(progressPath, "utf8"));
  progress.completed = ["task:1.1"];
  await writeFile(progressPath, `${JSON.stringify(progress, null, 2)}\n`);
  let called = false;
  const repaired = await repairOpenSpecBindingDerivedArtifacts({
    workspace: value.workspace,
    aggregateSha256: created.aggregate_sha256,
    service: "transactions",
    gate,
    nonce: "gate-1-nonce",
    overlayValidator: value.overlayValidator,
    implementationStarted: false,
    repositoryIdentityReader: value.repositoryIdentityReader,
    overlayRepairer: async () => { called = true; },
  });
  assert.equal(repaired.error_code, "DERIVED_REPAIR_INELIGIBLE");
  assert.equal(called, false);
  console.log("  [PASS] recorded implementation progress blocks derived repair independently of caller assertion");
});

await use(async value => {
  const created = await createOpenSpecBindingsManifest(value);
  const gate = bindConsolidatedGate1({ manifest: created.manifest, aggregateSha256: created.aggregate_sha256, nonce: "gate-1-nonce" });
  const options = {
    workspace: value.workspace,
    aggregateSha256: created.aggregate_sha256,
    service: "transactions",
    gate,
    nonce: "gate-1-nonce",
    overlayValidator: value.overlayValidator,
  };
  const sealed = await sealOpenSpecBindingDispatch(options);
  assert.equal(sealed.verdict, "pass", JSON.stringify(sealed));
  assert.equal(sealed.changed, true);
  const repeated = await sealOpenSpecBindingDispatch(options);
  assert.equal(repeated.verdict, "pass", JSON.stringify(repeated));
  assert.equal(repeated.changed, false);
  assert.equal(repeated.dispatch_binding_sha256, sealed.dispatch_binding_sha256);
  const binding = JSON.parse(await readFile(path.join(value.workspace, sealed.dispatch_binding_path), "utf8"));
  assert.deepEqual(binding.artifacts.map(item => item.kind), ["plan", "quality-manifest", "task-shard"]);
  assert.equal((await verifyOpenSpecBindingDispatch(options)).verdict, "pass");
  const shard = path.join(value.workspace, "plan/openspec/transactions/tasks/Task-1.md");
  await writeFile(shard, "# silently replaced Task 1\n");
  const stale = await verifyOpenSpecBindingDispatch(options);
  assert.equal(stale.error_code, "DISPATCH_BINDING_STALE");
  console.log("  [PASS] permanent dispatch seal is idempotent and detects post-preflight shard mutation");
});

await use(async value => {
  const created = await createOpenSpecBindingsManifest(value);
  const gate = bindConsolidatedGate1({ manifest: created.manifest, aggregateSha256: created.aggregate_sha256, nonce: "gate-1-nonce" });
  const dispatch = {
    workspace: value.workspace,
    aggregateSha256: created.aggregate_sha256,
    service: "transactions",
    gate,
    nonce: "gate-1-nonce",
    overlayValidator: value.overlayValidator,
  };
  const sealed = await sealOpenSpecBindingDispatch(dispatch);
  const sealBytes = await readFile(path.join(value.workspace, sealed.dispatch_binding_path));
  const mixedCasePath = "src/contracts/Payment.ts";
  const lowercasePath = "src/contracts/payment.ts";
  const mixedCaseBytes = Buffer.from("export const upper = true;\n");
  const lowercaseBytes = Buffer.from("export const lower = true;\n");
  await writeFile(path.join(value.evidenceRepositories[0].repository_root, mixedCasePath), mixedCaseBytes);
  await writeFile(path.join(value.evidenceRepositories[0].repository_root, lowercasePath), lowercaseBytes);
  const coordinates = [
    { service: "payment-gateway", path: lowercasePath, sha256: hash(lowercaseBytes) },
    { service: "payment-gateway", path: value.evidenceRelativePath, sha256: value.evidenceSha256 },
    { service: "payment-gateway", path: mixedCasePath, sha256: hash(mixedCaseBytes) },
  ];
  const initial = await bindOpenSpecEvidenceDispatch({
    ...dispatch,
    taskShardPath: "plan/openspec/transactions/tasks/Task-1.md",
    evidenceCoordinates: coordinates,
    repositoryIdentityReader: value.repositoryIdentityReader,
  });
  assert.equal(initial.verdict, "pass", JSON.stringify(initial));
  assert.equal(initial.generation, 1);
  assert.equal(initial.next_attempt, null);
  const initialBinding = JSON.parse(await readFile(path.join(value.workspace, initial.evidence_dispatch_path), "utf8"));
  assert.deepEqual(
    initialBinding.evidence_sources[0].coordinates.map(item => item.path),
    coordinates.map(item => item.path).sort((left, right) => (left < right ? -1 : left > right ? 1 : 0)),
  );
  const recoveryEvidencePath = "evidence/transactions/packet-scope-insufficient.json";
  const recoveryEvidence = canonicalJsonBytes({
    schema_version: 1,
    kind: "team_harness_packet_scope_insufficient",
    service: "transactions",
    task_shard_path: "plan/openspec/transactions/tasks/Task-1.md",
    role: "tester",
    error_code: "PACKET_SCOPE_INSUFFICIENT",
    exhausted_attempts: 2,
    owned_paths_changed: false,
    evidence_paths_changed: false,
  });
  await mkdir(path.dirname(path.join(value.workspace, recoveryEvidencePath)), { recursive: true });
  await writeFile(path.join(value.workspace, recoveryEvidencePath), recoveryEvidence);
  const bound = await bindOpenSpecEvidenceDispatch({
    ...dispatch,
    taskShardPath: "plan/openspec/transactions/tasks/Task-1.md",
    evidenceCoordinates: coordinates,
    recovery: {
      role: "tester",
      failure_code: "PACKET_SCOPE_INSUFFICIENT",
      exhausted_attempts: 2,
      evidence_path: recoveryEvidencePath,
      evidence_sha256: hash(recoveryEvidence),
    },
    repositoryIdentityReader: value.repositoryIdentityReader,
  });
  assert.equal(bound.verdict, "pass", JSON.stringify(bound));
  assert.equal(bound.generation, 2);
  assert.equal(bound.next_attempt, 1);
  assert.deepEqual(await readFile(path.join(value.workspace, sealed.dispatch_binding_path)), sealBytes);
  const verified = await verifyOpenSpecEvidenceDispatch({
    ...dispatch,
    evidenceDispatchPath: bound.evidence_dispatch_path,
    evidenceDispatchSha256: bound.evidence_dispatch_sha256,
    repositoryIdentityReader: value.repositoryIdentityReader,
  });
  assert.equal(verified.verdict, "pass", JSON.stringify(verified));
  const rollback = await bindOpenSpecEvidenceDispatch({
    ...dispatch,
    taskShardPath: "plan/openspec/transactions/tasks/Task-1.md",
    evidenceCoordinates: coordinates,
    repositoryIdentityReader: value.repositoryIdentityReader,
  });
  assert.equal(rollback.error_code, "EVIDENCE_DISPATCH_STALE");
  await writeFile(path.join(value.evidenceRepositories[0].repository_root, value.evidenceRelativePath), "changed evidence\n");
  const stale = await verifyOpenSpecEvidenceDispatch({
    ...dispatch,
    evidenceDispatchPath: bound.evidence_dispatch_path,
    evidenceDispatchSha256: bound.evidence_dispatch_sha256,
    repositoryIdentityReader: value.repositoryIdentityReader,
  });
  assert.equal(stale.error_code, "EVIDENCE_SOURCE_STALE");
  console.log("  [PASS] task-local evidence recovery pins read-only sources and resets only the corrected package");
});

await use(async value => {
  await prepareCurrentTaskFiles(value, ["payments-orchestrator", "transactions"]);
  const created = await createOpenSpecBindingsManifest(value);
  const gate = bindConsolidatedGate1({ manifest: created.manifest, aggregateSha256: created.aggregate_sha256, nonce: "gate-1-nonce" });
  const options = {
    workspace: value.workspace,
    aggregateSha256: created.aggregate_sha256,
    gate,
    nonce: "gate-1-nonce",
    repositoryIdentityReader: value.repositoryIdentityReader,
    snapshotVerifier: async () => ({ verdict: "pass" }),
    overlayValidator: value.overlayValidator,
  };
  const missing = await auditOpenSpecBindingDispatches(options);
  assert.equal(missing.verdict, "repair", JSON.stringify(missing));
  assert.equal(missing.error_code, "DISPATCH_BINDINGS_INCOMPLETE");
  assert.deepEqual(missing.bindings.filter(item => item.progressed).map(item => item.service), ["payments-orchestrator", "transactions"]);
  assert.deepEqual(missing.bindings.map(item => item.status), ["missing", "missing", "missing"]);
  for (const binding of missing.bindings) {
    const sealed = await sealOpenSpecBindingDispatch({ ...options, service: binding.service });
    assert.equal(sealed.verdict, "pass", JSON.stringify(sealed));
  }
  const complete = await auditOpenSpecBindingDispatches(options);
  assert.equal(complete.verdict, "pass", JSON.stringify(complete));
  assert.deepEqual(complete.bindings.map(item => item.status), ["verified", "verified", "verified"]);
  console.log("  [PASS] recovery audits and seals every writable binding, including services with durable progress");
});

await use(async value => {
  const created = await createOpenSpecBindingsManifest(value);
  const gate = bindConsolidatedGate1({ manifest: created.manifest, aggregateSha256: created.aggregate_sha256, nonce: "gate-1-nonce" });
  const dispatch = {
    workspace: value.workspace,
    aggregateSha256: created.aggregate_sha256,
    service: "transactions",
    gate,
    nonce: "gate-1-nonce",
    overlayValidator: value.overlayValidator,
  };
  assert.equal((await sealOpenSpecBindingDispatch(dispatch)).verdict, "pass");
  let called = false;
  const refused = await repairOpenSpecBindingDerivedArtifacts({
    ...dispatch,
    implementationStarted: false,
    repositoryIdentityReader: value.repositoryIdentityReader,
    overlayRepairer: async () => { called = true; },
  });
  assert.equal(refused.error_code, "DERIVED_REPAIR_INELIGIBLE");
  assert.equal(called, false);
  console.log("  [PASS] a dispatch seal permanently makes derived repair ineligible");
});

await use(async value => {
  const created = await createOpenSpecBindingsManifest(value);
  const gate = bindConsolidatedGate1({ manifest: created.manifest, aggregateSha256: created.aggregate_sha256, nonce: "gate-1-nonce" });
  const evidencePath = "plan/openspec/transactions/derived-repair.json";
  const evidenceBytes = Buffer.from("{\"repair\":true}\n");
  let releaseRepair;
  let repairEntered;
  const entered = new Promise(resolve => { repairEntered = resolve; });
  const release = new Promise(resolve => { releaseRepair = resolve; });
  const repair = repairOpenSpecBindingDerivedArtifacts({
    workspace: value.workspace,
    aggregateSha256: created.aggregate_sha256,
    service: "transactions",
    gate,
    nonce: "gate-1-nonce",
    implementationStarted: false,
    repositoryIdentityReader: value.repositoryIdentityReader,
    snapshotVerifier: async () => ({ verdict: "pass" }),
    overlayValidator: value.overlayValidator,
    overlayRepairer: async () => {
      repairEntered();
      await release;
      await writeFile(path.join(value.workspace, evidencePath), evidenceBytes);
      return { verdict: "pass", changed: true, error_code: null, evidence_path: evidencePath, evidence_sha256: hash(evidenceBytes) };
    },
  });
  await entered;
  const competingSeal = await sealOpenSpecBindingDispatch({
    workspace: value.workspace, aggregateSha256: created.aggregate_sha256,
    service: "transactions", gate, nonce: "gate-1-nonce", overlayValidator: value.overlayValidator,
  });
  assert.equal(competingSeal.error_code, "DERIVED_SET_BUSY");
  releaseRepair();
  assert.equal((await repair).verdict, "pass");
  assert.equal((await sealOpenSpecBindingDispatch({
    workspace: value.workspace, aggregateSha256: created.aggregate_sha256,
    service: "transactions", gate, nonce: "gate-1-nonce", overlayValidator: value.overlayValidator,
  })).verdict, "pass");
  console.log("  [PASS] repair and dispatch sealing share one atomic per-service exclusion lock");
});

await use(async value => {
  const created = await createOpenSpecBindingsManifest(value);
  const aggregateBytes = await readFile(created.aggregate_path);
  const changed = JSON.parse(aggregateBytes);
  changed.execution_order = changed.execution_order.slice(0, 2);
  await writeFile(created.aggregate_path, canonicalJsonBytes(changed));
  const verified = await verifyOpenSpecBindingsManifest({
    workspace: value.workspace, aggregateSha256: created.aggregate_sha256,
    repositoryIdentityReader: value.repositoryIdentityReader, overlayValidator: value.overlayValidator,
    snapshotVerifier: async () => ({ verdict: "pass" }),
  });
  assert.equal(verified.error_code, "AGGREGATE_STALE");
  console.log("  [PASS] aggregate membership or order drift invalidates freshness");
});

await use(async value => {
  const created = await createOpenSpecBindingsManifest({
    ...value, executionOrder: value.executionOrder.slice().reverse(),
  });
  assert.equal(created.verdict, "fail");
  assert.equal(created.error_code, "BINDING_INVALID");
  console.log("  [PASS] execution order must satisfy declared dependencies");
});

await use(async value => {
  value.evidenceRepositories[0].repository_root = null;
  const created = await createOpenSpecBindingsManifest(value);
  assert.equal(created.error_code, "BINDING_INVALID");
  console.log("  [PASS] missing evidence root never resolves to the process cwd");
});

await use(async value => {
  await writeFile(path.join(value.workspace, "inputs", "openspec", "merchant-bridge", "snapshot.json"), "{not-json\n");
  const created = await createOpenSpecBindingsManifest(value);
  assert.equal(created.error_code, "ARTIFACT_INVALID");
  assert.doesNotMatch(created.error_code, /Unexpected|position/i);
  console.log("  [PASS] parser failures map to a bounded error code");
});

await use(async value => {
  const { created } = await legacyMigrationFixture(value);
  const seen = [];
  const verified = await verifyLegacyV1CurrentBindings({
    root: value.workspace,
    manifest: created.manifest,
    repositoryIdentityReader: value.repositoryIdentityReader,
    overlayValidator: value.overlayValidator,
    snapshotVerifier: async options => { seen.push(options); return { verdict: "pass" }; },
  });
  assert.equal(verified.verdict, "pass", JSON.stringify(verified));
  const transactions = seen.find(item => item.snapshotPath.includes("/transactions/"));
  const payments = seen.find(item => item.snapshotPath.includes("/payments-orchestrator/"));
  assert.equal(transactions.phase, "implementation");
  assert.deepEqual(transactions.authorizedTaskIds, ["task:1.1"]);
  assert.equal(payments.phase, "pre-gate1");
  assert.deepEqual(payments.authorizedTaskIds, []);
  console.log("  [PASS] legacy adoption accepts only already-recorded monotonic checkbox progress");
});

await use(async value => {
  const { created, gate } = await legacyMigrationFixture(value);
  const derivedShard = path.join(value.workspace, "plan/openspec/transactions/tasks/Task-1.md");
  const derivedShardSha256 = hash(await readFile(derivedShard));
  const options = {
    workspace: value.workspace,
    incidentId: "th-placeholder-autorepair-20260825",
    repositoryIdentityReader: value.repositoryIdentityReader,
    overlayValidator: value.overlayValidator,
    snapshotVerifier: async () => ({ verdict: "pass" }),
  };
  const dryRun = await migrateLegacyV1ApprovedPlaceholderWorkspace({ ...options, mode: "dry-run" });
  assert.equal(dryRun.verdict, "pass", JSON.stringify(dryRun));
  assert.equal(dryRun.changed, false);
  assert.equal(dryRun.original_gate_identity_sha256, gate.gate_identity_sha256);
  assert.equal(dryRun.current_aggregate_sha256, created.aggregate_sha256);
  const applied = await migrateLegacyV1ApprovedPlaceholderWorkspace({ ...options, mode: "apply" });
  assert.equal(applied.verdict, "pass", JSON.stringify(applied));
  assert.equal(applied.changed, true);
  const repeated = await migrateLegacyV1ApprovedPlaceholderWorkspace({ ...options, mode: "apply" });
  assert.equal(repeated.verdict, "pass", JSON.stringify(repeated));
  assert.equal(repeated.changed, false);
  const verified = await migrateLegacyV1ApprovedPlaceholderWorkspace({ ...options, mode: "verify" });
  assert.equal(verified.verdict, "pass", JSON.stringify(verified));
  assert.equal(verified.certificate_sha256, applied.certificate_sha256);
  assert.equal(hash(await readFile(derivedShard)), derivedShardSha256);
  console.log("  [PASS] approved v1 repair adoption is atomic/idempotent and never rewrites derived shards");
});

await use(async value => {
  await legacyMigrationFixture(value);
  const taskPath = path.join(value.root, "zippy", "merchant-bridge", "openspec", "changes", "merchant-bridge", "tasks.md");
  await writeFile(taskPath, (await readFile(taskPath, "utf8")).replace("Implement service", "Change approved intent"));
  const rejected = await migrateLegacyV1ApprovedPlaceholderWorkspace({
    workspace: value.workspace,
    incidentId: "th-placeholder-autorepair-20260825",
    mode: "dry-run",
    repositoryIdentityReader: value.repositoryIdentityReader,
    overlayValidator: value.overlayValidator,
    snapshotVerifier: async () => ({ verdict: "pass" }),
  });
  assert.equal(rejected.verdict, "fail");
  assert.equal(rejected.error_code, "LEGACY_GATE_MIGRATION_INVALID");
  console.log("  [PASS] normative task-prefix drift blocks legacy Gate adoption");
});

console.log("OpenSpec multi-service bindings: PASS");
