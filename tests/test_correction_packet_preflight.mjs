#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  certifyCorrectionPacket,
  preflightCorrectionPacket,
  repairTestContractCoverage,
  verifyDispatchReference,
} from "../skills/pipeline/scripts/correction-packet-preflight.mjs";

const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const bytes = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
    : value;
const canonicalBytes = value => bytes(canonical(value));
const taskRecord = (taskId, status = "pending", evidence = {}) => ({
  task_id: taskId,
  status,
  not_applicable_reason: null,
  contract_path: evidence.contract_path ?? null,
  contract_sha256: evidence.contract_sha256 ?? null,
  red_evidence_path: evidence.red_evidence_path ?? null,
  red_evidence_sha256: evidence.red_evidence_sha256 ?? null,
  red_commit_sha: evidence.red_commit_sha ?? null,
  red_tree_sha: evidence.red_tree_sha ?? null,
  green_evidence_path: evidence.green_evidence_path ?? null,
  green_evidence_sha256: evidence.green_evidence_sha256 ?? null,
});

function stateSummary(indexBytes, tasks, requiredCount, includeCoverage = false) {
  const statusCounts = { pending: 0, red: 0, green: 0, not_applicable: 0 };
  for (const task of tasks) statusCounts[task.status] += 1;
  const statuses = Object.entries(statusCounts).filter(([, count]) => count > 0).map(([status]) => status);
  const value = {
    status: statusCounts.pending > 0 ? "pending" : statuses.length === 1 ? statuses[0].replace("_", "-") : "mixed",
    index_path: "evidence/test-contracts.json",
    index_sha256: sha(indexBytes),
    task_count: tasks.length,
    status_counts: statusCounts,
  };
  if (includeCoverage) Object.assign(value, {
    required_task_count: requiredCount,
    required_covered_count: tasks.length,
    required_missing_count: requiredCount - tasks.length,
  });
  return value;
}

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "th-correction-preflight-"));
  const workspace = path.join(root, "workspace");
  const repository = path.join(root, "payments-orchestrator");
  await mkdir(path.join(workspace, "inputs", "openspec", "payments-orchestrator"), { recursive: true });
  await mkdir(path.join(workspace, "plan", "openspec", "payments-orchestrator"), { recursive: true });
  await mkdir(path.join(workspace, "plan", "tasks"), { recursive: true });
  await mkdir(path.join(workspace, "services", "payments-orchestrator"), { recursive: true });
  await mkdir(path.join(workspace, "evidence"), { recursive: true });
  await mkdir(path.join(workspace, ".team-harness"), { recursive: true });
  await mkdir(path.join(repository, "openspec", "changes", "payin"), { recursive: true });
  await mkdir(path.join(repository, "src"), { recursive: true });

  const sourcePath = "openspec/changes/payin/tasks.md";
  const approvedSource = "# Tasks\n\n- [ ] 3.1 Card type correction\n- [ ] 3.5 Contract correction\n";
  const liveSource = approvedSource.replace("- [ ] 3.1", "- [x] 3.1");
  await writeFile(path.join(repository, sourcePath), liveSource);
  const intentSha = sha(Buffer.from(approvedSource));
  const artifact = {
    artifact_id: "tasks",
    path: sourcePath,
    content_sha256: intentSha,
    intent_sha256: intentSha,
    coordinates: [
      { kind: "task", id: "task:3.1", title: "Card type correction", line: 3, complete: false },
      { kind: "task", id: "task:3.5", title: "Contract correction", line: 4, complete: false },
    ],
  };
  const snapshot = {
    schema_version: 3,
    kind: "team_harness_openspec_snapshot",
    captured_at: "2026-08-27T12:00:00.000Z",
    repository: { root: repository, head_sha: "a".repeat(40) },
    workspace: { root: workspace, mode: "local", navigation_kind: "repository-relative-coordinates" },
    toolchain: { runtime: "codex", node_version: "22", npm_version: "10", openspec_version: "1", generated_targets: [] },
    change: { name: "payin", schema: "spec-driven", root: path.join(repository, "openspec", "changes", "payin") },
    artifacts: [artifact],
    artifact_set_sha256: sha(Buffer.from(`${sourcePath}\0${intentSha}`)),
  };
  const snapshotBytes = bytes(snapshot);
  const snapshotPath = "inputs/openspec/payments-orchestrator/snapshot.json";
  await writeFile(path.join(workspace, snapshotPath), snapshotBytes);

  const overlay = {
    execution_items: [
      {
        id: "Task-9", pre_implementation_test: "required", sources: ["task:3.1"],
        shard_path: "plan/tasks/Task-9.md", files: ["src/task-9.ts"],
        discovery_scope: { directories: ["src"], globs: ["**/*.ts"] },
        required_invariants: [], required_seams: [], quality_command_ids: ["test"],
      },
      {
        id: "Task-13", pre_implementation_test: "required", sources: ["task:3.5"],
        shard_path: "plan/tasks/Task-13.md", files: ["src/task-13.ts"],
        discovery_scope: { directories: ["src"], globs: ["**/*.ts"] },
        required_invariants: [], required_seams: [], quality_command_ids: ["test"],
      },
    ],
  };
  const overlayBytes = bytes(overlay);
  const overlayPath = "plan/openspec/payments-orchestrator/traceability.json";
  await writeFile(path.join(workspace, overlayPath), overlayBytes);

  const task9Path = "plan/tasks/Task-9.md";
  const task13Path = "plan/tasks/Task-13.md";
  const servicePlanPath = "services/payments-orchestrator/01-plan.md";
  const task9Bytes = Buffer.from("# Task-9\n\nContract recovery.\n");
  const task13Bytes = Buffer.from("# Task-13\n\nContract correction.\n");
  const servicePlanBytes = Buffer.from("# Service plan\n\nPayments orchestration.\n");
  await writeFile(path.join(workspace, task9Path), task9Bytes);
  await writeFile(path.join(workspace, task13Path), task13Bytes);
  await writeFile(path.join(workspace, servicePlanPath), servicePlanBytes);

  const qualityBytes = Buffer.from("{\"commands\":{\"test\":[\"npm\",\"test\"]}}\n");
  const qualityPath = path.join(workspace, ".team-harness", "quality.json");
  await writeFile(qualityPath, qualityBytes);

  const dispatch = {
    schema_version: 1,
    kind: "team_harness_openspec_dispatch_binding",
    service: "payments-orchestrator",
    aggregate: { path: "inputs/openspec-bindings.json", sha256: "d".repeat(64) },
    gate_identity_sha256: "9".repeat(64),
    continuation_identity_sha256: null,
    snapshot: { path: snapshotPath, sha256: sha(snapshotBytes) },
    overlay: { path: overlayPath, sha256: sha(overlayBytes) },
    artifacts: [
      { kind: "plan", path: servicePlanPath, sha256: sha(servicePlanBytes) },
      { kind: "quality-manifest", path: ".team-harness/quality.json", sha256: sha(qualityBytes) },
      { kind: "task-shard", path: task9Path, sha256: sha(task9Bytes) },
      { kind: "task-shard", path: task13Path, sha256: sha(task13Bytes) },
    ],
  };
  const dispatchBytes = canonicalBytes(dispatch);
  const dispatchPath = path.join(workspace, "inputs", "openspec", "payments-orchestrator", "dispatch-binding.json");
  await writeFile(dispatchPath, dispatchBytes);

  const helperRoot = path.join(workspace, "inputs", "runtime", "team-harness", "helper-bundles", "a".repeat(64));
  await mkdir(helperRoot, { recursive: true });
  const boundedCommandPath = path.join(helperRoot, "bounded-command.mjs");
  const writeScopePath = path.join(helperRoot, "specialist-write-scope.mjs");
  await writeFile(boundedCommandPath, "export {};\n");
  await writeFile(writeScopePath, "export {};\n");

  const contractPath = "evidence/task-13-contract.json";
  const redPath = "evidence/task-13-red.json";
  const contractBytes = Buffer.from("{\"contract\":13}\n");
  const redBytes = Buffer.from("{\"red\":13}\n");
  await writeFile(path.join(workspace, contractPath), contractBytes);
  await writeFile(path.join(workspace, redPath), redBytes);
  const tasks = [taskRecord("payments-orchestrator:Task-13", "red", {
    contract_path: contractPath,
    contract_sha256: sha(contractBytes),
    red_evidence_path: redPath,
    red_evidence_sha256: sha(redBytes),
    red_commit_sha: "b".repeat(40),
    red_tree_sha: "c".repeat(40),
  })];
  const indexPath = path.join(workspace, "evidence", "test-contracts.json");
  const indexBytes = bytes({ schema_version: 1, kind: "team_harness_test_contract_index", tasks });
  await writeFile(indexPath, indexBytes);

  const binding = {
    service: "payments-orchestrator",
    repository_root: repository,
    snapshot_path: snapshotPath,
    snapshot_sha256: sha(snapshotBytes),
    overlay_path: overlayPath,
    overlay_sha256: sha(overlayBytes),
    task_intent_sha256: intentSha,
  };
  const input = {
    workspace,
    aggregate_path: "inputs/openspec-bindings.json",
    aggregate_sha256: "d".repeat(64),
    service: "payments-orchestrator",
    task_ids: ["Task-13", "Task-9"],
    test_contract_evidence: stateSummary(indexBytes, tasks, 2),
    dispatch_request: {
      schema_version: 1,
      kind: "team_harness_dispatch_request",
      role: "implementer",
      mode: "implementation",
      evidence_dispatch_binding: null,
      helper_bundle: {
        manifest_path: `inputs/runtime/team-harness/helper-bundles/${"a".repeat(64)}/manifest.json`,
        manifest_sha256: "b".repeat(64),
      },
      workspace_write_coordinates: [],
      bounded_result_path: null,
      git_metadata_write_mode: "normal",
      scope_paths: [],
    },
  };
  const dependencies = {
    bindingsVerifier: async () => ({ verdict: "pass", manifest: { bindings: [binding], evidence_repositories: [] } }),
    helperBundleVerifier: async () => ({
      verdict: "pass",
      compatibility_epoch: "team-harness-pipeline-helper-api-v3",
      bundle_identity_sha256: "a".repeat(64),
      helper_paths: {
        "bounded-command.mjs": boundedCommandPath,
        "specialist-write-scope.mjs": writeScopePath,
        "test-transition.mjs": boundedCommandPath,
      },
    }),
  };
  return { root, workspace, indexPath, dispatchPath, input, dependencies, liveSource, intentSha };
}

const value = await fixture();
try {
  const incomplete = await preflightCorrectionPacket(value.input, value.dependencies);
  assert.equal(incomplete.verdict, "repair");
  assert.equal(incomplete.error_code, "TEST_CONTRACT_COVERAGE_INCOMPLETE");
  assert.deepEqual(incomplete.missing_required_tasks, ["payments-orchestrator:Task-9"]);
  assert.deepEqual(incomplete.task_ids, ["Task-9", "Task-13"]);
  assert.equal(incomplete.task_intent_sha256, value.intentSha);
  assert.equal(incomplete.source_coordinates[0].content_sha256, sha(Buffer.from(value.liveSource)));
  assert.notEqual(incomplete.source_coordinates[0].content_sha256, incomplete.task_intent_sha256);

  const repaired = await repairTestContractCoverage(value.input, value.dependencies);
  assert.equal(repaired.verdict, "pass");
  assert.equal(repaired.action, "repair-state-summary-before-presentation");
  assert.equal(repaired.test_contract_summary.required_task_count, 2);
  assert.equal(repaired.test_contract_summary.required_covered_count, 2);
  assert.equal(repaired.test_contract_summary.required_missing_count, 0);
  const repairedIndex = JSON.parse(await readFile(value.indexPath, "utf8"));
  assert.equal(repairedIndex.tasks.find(task => task.task_id.endsWith("Task-9")).status, "pending");

  const pending = await preflightCorrectionPacket({
    ...value.input,
    test_contract_evidence: repaired.test_contract_summary,
  }, value.dependencies);
  assert.equal(pending.verdict, "repair");
  assert.equal(pending.error_code, "TEST_CONTRACT_TASK_PENDING");
  assert.equal(pending.action, "complete-required-test-contracts-before-presentation");
  assert.deepEqual(pending.pending_required_tasks, ["payments-orchestrator:Task-9"]);

  const pretest = await certifyCorrectionPacket({
    ...value.input,
    task_ids: ["Task-9"],
    test_contract_evidence: repaired.test_contract_summary,
    dispatch_request: {
      ...value.input.dispatch_request,
      role: "tester",
      mode: "pre-implementation-contract",
    },
  }, value.dependencies);
  assert.equal(pretest.verdict, "pass", JSON.stringify(pretest));
  const pretestCapsule = JSON.parse(await readFile(pretest.dispatch_reference.path));
  assert.deepEqual(pretestCapsule.scope.task_ids, ["Task-9"]);
  assert.equal(pretestCapsule.acceptance_evidence.test_contracts[0].status, "pending");
  assert.equal(pretestCapsule.helpers.test_transition_path.endsWith("bounded-command.mjs"), true);

  const task9ContractPath = "evidence/task-9-contract.json";
  const task9RedPath = "evidence/task-9-red.json";
  const task9ContractBytes = Buffer.from("{\"contract\":9}\n");
  const task9RedBytes = Buffer.from("{\"red\":9}\n");
  await writeFile(path.join(value.workspace, task9ContractPath), task9ContractBytes);
  await writeFile(path.join(value.workspace, task9RedPath), task9RedBytes);
  const completedIndex = JSON.parse(await readFile(value.indexPath, "utf8"));
  Object.assign(completedIndex.tasks.find(task => task.task_id.endsWith("Task-9")), taskRecord(
    "payments-orchestrator:Task-9",
    "red",
    {
      contract_path: task9ContractPath,
      contract_sha256: sha(task9ContractBytes),
      red_evidence_path: task9RedPath,
      red_evidence_sha256: sha(task9RedBytes),
      red_commit_sha: "e".repeat(40),
      red_tree_sha: "f".repeat(40),
    },
  ));
  const completedBytes = bytes(completedIndex);
  await writeFile(value.indexPath, completedBytes);
  const completeInput = {
    ...value.input,
    test_contract_evidence: stateSummary(completedBytes, completedIndex.tasks, 2, true),
  };
  assert.equal(Object.hasOwn(completeInput.dispatch_request, "bounded_command_path"), false);
  assert.equal(Object.hasOwn(completeInput.dispatch_request, "artifact_coordinates"), false);
  assert.equal(Object.hasOwn(completeInput.dispatch_request, "derived_dispatch_binding"), false);
  const { helper_bundle: omittedBundle, ...requestWithoutBundle } = completeInput.dispatch_request;
  assert.ok(omittedBundle);
  const missingBundleReference = await certifyCorrectionPacket({
    ...completeInput,
    dispatch_request: requestWithoutBundle,
  }, value.dependencies);
  assert.equal(missingBundleReference.verdict, "fail");
  assert.equal(missingBundleReference.error_code, "PACKET_CONTRACT_INVALID");

  const certified = await certifyCorrectionPacket({
    ...completeInput,
  }, value.dependencies);
  assert.equal(certified.verdict, "pass", JSON.stringify(certified));
  assert.equal(certified.action, "dispatch-ready-before-authority");
  assert.deepEqual(Object.keys(certified.dispatch_reference).sort(), [
    "kind", "path", "schema_version", "scope_identity_sha256", "sha256",
  ]);
  assert.match(certified.dispatch_reference.path, /inputs\/dispatches\/[a-f0-9]{64}\.json$/);
  const capsuleBytes = await readFile(certified.dispatch_reference.path);
  assert.equal(sha(capsuleBytes), certified.dispatch_reference.sha256);
  const capsule = JSON.parse(capsuleBytes);
  assert.equal(capsule.kind, "team_harness_dispatch_capsule");
  assert.equal(capsule.scope.scope_identity_sha256, certified.scope_identity_sha256);
  assert.deepEqual(capsule.ownership.owned_paths, ["src/task-13.ts", "src/task-9.ts"]);
  assert.equal(capsule.helpers.bounded_command_path.endsWith("bounded-command.mjs"), true);
  assert.equal(capsule.openspec.task_shards.length, 2);
  assert.equal(capsule.openspec.source_coordinates[0].content_sha256, sha(Buffer.from(value.liveSource)));
  assert.notEqual(capsule.openspec.source_coordinates[0].content_sha256, capsule.openspec.task_intent_sha256);

  const ownerDerived = await certifyCorrectionPacket({
    ...completeInput,
    task_ids: ["Task-13"],
    dispatch_request: { ...completeInput.dispatch_request, scope_paths: ["src/task-9.ts"] },
  }, value.dependencies);
  assert.equal(ownerDerived.verdict, "pass", JSON.stringify(ownerDerived));
  const ownerCapsule = JSON.parse(await readFile(ownerDerived.dispatch_reference.path));
  assert.deepEqual(ownerCapsule.scope.task_ids, ["Task-9", "Task-13"]);
  assert.deepEqual(ownerCapsule.scope.target_paths, ["src/task-9.ts"]);
  assert.deepEqual(ownerCapsule.openspec.execution_items.map(item => item.task_id), ["Task-9", "Task-13"]);
  assert.equal(ownerCapsule.openspec.source_coordinates.length, 2);

  const verifiedReference = await verifyDispatchReference({
    workspace: value.workspace,
    dispatch_reference: certified.dispatch_reference,
  });
  assert.equal(verifiedReference.verdict, "pass");
  assert.equal(verifiedReference.action, "ack-dispatch-ready");
  const mistypedReference = await verifyDispatchReference({
    workspace: value.workspace,
    dispatch_reference: { ...certified.dispatch_reference, sha256: `0${certified.dispatch_reference.sha256.slice(1)}` },
  });
  assert.equal(mistypedReference.verdict, "fail");
  assert.equal(mistypedReference.action, "repair-before-attempt");

  const sealedDispatch = JSON.parse(await readFile(value.dispatchPath));
  await writeFile(value.dispatchPath, canonicalBytes({
    ...sealedDispatch,
    aggregate: { ...sealedDispatch.aggregate, sha256: "0".repeat(64) },
  }));
  const staleSeal = await certifyCorrectionPacket(completeInput, value.dependencies);
  assert.equal(staleSeal.verdict, "fail");
  assert.equal(staleSeal.error_code, "PACKET_ARTIFACT_INVALID");
  await writeFile(value.dispatchPath, canonicalBytes(sealedDispatch));

  const staleLegacyState = await preflightCorrectionPacket(value.input, value.dependencies);
  assert.equal(staleLegacyState.error_code, "TEST_CONTRACT_INDEX_STALE");
} finally {
  await rm(value.root, { recursive: true, force: true });
}

console.log("correction packet preflight: PASS");
