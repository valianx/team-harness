#!/usr/bin/env node
/** Certify OpenSpec source coordinates and pre-test coverage before correction authority is consumed. */

import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, realpath, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  OPENSPEC_DISPATCH_BINDING_SCHEMA_VERSION,
  verifyOpenSpecBindingsManifest,
} from "./openspec-bindings.mjs";
import { verifyHelperBundle } from "./helper-bundle.mjs";
import { isOpenSpecSnapshot } from "./openspec-snapshot.mjs";
import { validateSpecialistWorkspaceWriteScope } from "./specialist-write-scope.mjs";

export const CORRECTION_PACKET_PREFLIGHT_SCHEMA_VERSION = 3;

const MAX_BYTES = 1024 * 1024;
const MAX_TASKS = 128;
const SHA256 = /^[a-f0-9]{64}$/;
const GIT_SHA = /^[a-f0-9]{40}$/;
const SERVICE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TASK_ID = /^Task-[1-9][0-9]*$/;
const INDEX_TASK_ID = /^([a-z0-9]+(?:-[a-z0-9]+)*):(Task-[1-9][0-9]*)$/;
const STATUSES = new Set(["pending", "red", "green", "not_applicable"]);
const INDEX_KEYS = new Set(["schema_version", "kind", "tasks"]);
const INDEX_TASK_KEYS = new Set([
  "task_id", "status", "not_applicable_reason", "contract_path", "contract_sha256",
  "red_evidence_path", "red_evidence_sha256", "red_commit_sha", "red_tree_sha",
  "green_evidence_path", "green_evidence_sha256",
]);
const SUMMARY_KEYS = new Set([
  "status", "index_path", "index_sha256", "task_count", "status_counts",
  "required_task_count", "required_covered_count", "required_missing_count",
]);
const LEGACY_SUMMARY_KEYS = new Set([
  "status", "index_path", "index_sha256", "task_count", "status_counts",
]);
const STATUS_COUNT_KEYS = new Set(["pending", "red", "green", "not_applicable"]);
const BASE_INPUT_KEYS = new Set([
  "workspace", "aggregate_path", "aggregate_sha256", "service", "task_ids",
  "test_contract_evidence",
]);
const CERTIFY_INPUT_KEYS = new Set([...BASE_INPUT_KEYS, "dispatch_request"]);
const DISPATCH_REQUEST_KEYS = new Set([
  "schema_version", "kind", "role", "mode", "helper_bundle",
  "evidence_dispatch_binding", "workspace_write_coordinates",
  "bounded_result_path", "git_metadata_write_mode", "scope_paths",
]);
const EVIDENCE_BINDING_KEYS = new Set(["path", "sha256", "dispatch_identity_sha256"]);
const HELPER_BUNDLE_REF_KEYS = new Set(["manifest_path", "manifest_sha256"]);
const DISPATCH_REFERENCE_KEYS = new Set([
  "schema_version", "kind", "path", "sha256", "scope_identity_sha256",
]);
const DISPATCH_BINDING_KEYS = new Set([
  "schema_version", "kind", "service", "aggregate", "gate_identity_sha256",
  "continuation_identity_sha256", "snapshot", "overlay", "artifacts",
]);
const DISPATCH_ARTIFACT_KEYS = new Set(["kind", "path", "sha256"]);
const PACKET_ROLES = new Set(["implementer", "tester"]);
const PACKET_MODES = new Set(["implementation", "pre-implementation-contract", "validation"]);
const ERROR_CODES = new Set([
  "ARGUMENT_INVALID", "WORKSPACE_INVALID", "BINDINGS_INVALID", "SNAPSHOT_INVALID",
  "OVERLAY_INVALID", "SOURCE_COORDINATE_INVALID", "SOURCE_ARTIFACT_INVALID",
  "TEST_CONTRACT_INDEX_INVALID", "TEST_CONTRACT_INDEX_STALE", "TEST_CONTRACT_STATE_STALE",
  "TEST_CONTRACT_COVERAGE_INCOMPLETE", "TEST_CONTRACT_TASK_PENDING",
  "TEST_CONTRACT_EVIDENCE_INVALID", "PACKET_CONTRACT_INVALID", "PACKET_ARTIFACT_INVALID",
  "OUTPUT_WRITE_FAILED", "INTERNAL_ERROR",
]);

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.size && Object.keys(value).every(key => keys.has(key));
const safeRelative = value => typeof value === "string" && value.length > 0 && value.length <= 1024
  && !value.includes("\0") && !path.isAbsolute(value)
  && !value.replaceAll("\\", "/").split("/").includes("..");
const contained = (root, target) => {
  const relative = path.relative(root, target);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
};

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

function canonicalBytes(value) {
  return Buffer.from(`${JSON.stringify(canonical(value), null, 2)}\n`, "utf8");
}

function result(verdict, errorCode, action, details = {}) {
  return {
    schema_version: CORRECTION_PACKET_PREFLIGHT_SCHEMA_VERSION,
    kind: "team_harness_correction_packet_preflight",
    verdict,
    error_code: errorCode,
    action,
    service: details.service ?? null,
    task_ids: details.task_ids ?? [],
    task_intent_sha256: details.task_intent_sha256 ?? null,
    source_coordinates: details.source_coordinates ?? [],
    test_contracts: details.test_contracts ?? [],
    test_contract_summary: details.test_contract_summary ?? null,
    missing_required_tasks: details.missing_required_tasks ?? [],
    pending_required_tasks: details.pending_required_tasks ?? [],
    pending_selected_tasks: details.pending_selected_tasks ?? [],
    scope_identity_sha256: details.scope_identity_sha256 ?? null,
    dispatch_reference: details.dispatch_reference ?? null,
  };
}

function failure(errorCode, action = "block", details = {}) {
  return result("fail", errorCode, action, details);
}

async function canonicalDirectory(value) {
  if (typeof value !== "string" || !path.isAbsolute(value) || path.resolve(value) !== value) throw new Error("WORKSPACE_INVALID");
  const resolved = await realpath(value);
  const stat = await lstat(resolved);
  if (resolved !== value || !stat.isDirectory() || stat.isSymbolicLink()) throw new Error("WORKSPACE_INVALID");
  return resolved;
}

async function readContainedFile(root, relative) {
  if (!safeRelative(relative)) throw new Error("ARGUMENT_INVALID");
  const target = path.resolve(root, relative);
  if (!contained(root, target)) throw new Error("ARGUMENT_INVALID");
  const stat = await lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES) throw new Error("SOURCE_ARTIFACT_INVALID");
  const resolved = await realpath(target);
  if (!contained(root, resolved) || resolved !== target) throw new Error("SOURCE_ARTIFACT_INVALID");
  const bytes = await readFile(resolved);
  if (bytes.length > MAX_BYTES) throw new Error("SOURCE_ARTIFACT_INVALID");
  return { path: resolved, bytes };
}

function validNullableHash(value) {
  return value === null || SHA256.test(value ?? "");
}

function validNullablePath(value) {
  return value === null || safeRelative(value);
}

function validIndexTask(value) {
  if (!exactKeys(value, INDEX_TASK_KEYS) || !INDEX_TASK_ID.test(value.task_id ?? "")
    || !STATUSES.has(value.status) || !validNullablePath(value.contract_path)
    || !validNullableHash(value.contract_sha256) || !validNullablePath(value.red_evidence_path)
    || !validNullableHash(value.red_evidence_sha256)
    || (value.red_commit_sha !== null && !GIT_SHA.test(value.red_commit_sha ?? ""))
    || (value.red_tree_sha !== null && !GIT_SHA.test(value.red_tree_sha ?? ""))
    || !validNullablePath(value.green_evidence_path) || !validNullableHash(value.green_evidence_sha256)) return false;
  const evidenceFields = [
    value.contract_path, value.contract_sha256, value.red_evidence_path, value.red_evidence_sha256,
    value.red_commit_sha, value.red_tree_sha, value.green_evidence_path, value.green_evidence_sha256,
  ];
  if (value.status === "pending") return value.not_applicable_reason === null && evidenceFields.every(item => item === null);
  if (value.status === "not_applicable") {
    return typeof value.not_applicable_reason === "string" && value.not_applicable_reason.trim().length > 0
      && evidenceFields.every(item => item === null);
  }
  const redComplete = value.not_applicable_reason === null
    && [value.contract_path, value.contract_sha256, value.red_evidence_path, value.red_evidence_sha256,
      value.red_commit_sha, value.red_tree_sha].every(item => item !== null);
  if (!redComplete) return false;
  return value.status === "red"
    ? value.green_evidence_path === null && value.green_evidence_sha256 === null
    : value.green_evidence_path !== null && value.green_evidence_sha256 !== null;
}

function validIndex(value) {
  return exactKeys(value, INDEX_KEYS) && value.schema_version === 1
    && value.kind === "team_harness_test_contract_index" && Array.isArray(value.tasks)
    && value.tasks.length <= MAX_TASKS && value.tasks.every(validIndexTask)
    && new Set(value.tasks.map(item => item.task_id)).size === value.tasks.length;
}

function emptyPending(taskId) {
  return {
    task_id: taskId,
    status: "pending",
    not_applicable_reason: null,
    contract_path: null,
    contract_sha256: null,
    red_evidence_path: null,
    red_evidence_sha256: null,
    red_commit_sha: null,
    red_tree_sha: null,
    green_evidence_path: null,
    green_evidence_sha256: null,
  };
}

function summary(indexPath, indexSha256, tasks, requiredTasks) {
  const counts = { pending: 0, red: 0, green: 0, not_applicable: 0 };
  for (const task of tasks) counts[task.status] += 1;
  const covered = new Set(tasks.map(item => item.task_id));
  const requiredCovered = requiredTasks.filter(taskId => covered.has(taskId)).length;
  const nonzero = Object.entries(counts).filter(([, count]) => count > 0).map(([status]) => status);
  const aggregateStatus = counts.pending > 0 ? "pending"
    : nonzero.length === 1 ? nonzero[0].replace("_", "-") : "mixed";
  return {
    status: aggregateStatus,
    index_path: indexPath,
    index_sha256: indexSha256,
    task_count: tasks.length,
    status_counts: counts,
    required_task_count: requiredTasks.length,
    required_covered_count: requiredCovered,
    required_missing_count: requiredTasks.length - requiredCovered,
  };
}

function validStateSummary(value) {
  const extended = exactKeys(value, SUMMARY_KEYS);
  if ((!extended && !exactKeys(value, LEGACY_SUMMARY_KEYS))
    || !["pending", "red", "green", "not-applicable", "mixed"].includes(value.status)
    || value.index_path !== "evidence/test-contracts.json" || !SHA256.test(value.index_sha256 ?? "")
    || !Number.isInteger(value.task_count) || value.task_count < 0 || value.task_count > MAX_TASKS
    || !exactKeys(value.status_counts, STATUS_COUNT_KEYS)) return false;
  const counts = [...Object.values(value.status_counts)];
  if (extended) counts.push(value.required_task_count, value.required_covered_count, value.required_missing_count);
  return counts.every(count => Number.isInteger(count) && count >= 0 && count <= MAX_TASKS);
}

function equalJson(left, right) {
  return canonicalBytes(left).equals(canonicalBytes(right));
}

async function ensureDirectory(root, target) {
  if (!path.isAbsolute(target) || !contained(root, target)) throw new Error("OUTPUT_WRITE_FAILED");
  const relative = path.relative(root, target);
  let current = root;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try { await mkdir(current, { mode: 0o700 }); }
    catch (error) { if (error?.code !== "EEXIST") throw error; }
    const stat = await lstat(current);
    const resolved = await realpath(current);
    if (!stat.isDirectory() || stat.isSymbolicLink() || resolved !== current) throw new Error("OUTPUT_WRITE_FAILED");
  }
}

async function loadModel(input, dependencies) {
  if (!(exactKeys(input, BASE_INPUT_KEYS) || exactKeys(input, CERTIFY_INPUT_KEYS)) || !SERVICE.test(input.service ?? "")
    || !SHA256.test(input.aggregate_sha256 ?? "") || !safeRelative(input.aggregate_path)
    || !Array.isArray(input.task_ids) || input.task_ids.length === 0 || input.task_ids.length > MAX_TASKS
    || !input.task_ids.every(taskId => TASK_ID.test(taskId)) || new Set(input.task_ids).size !== input.task_ids.length
    || !validStateSummary(input.test_contract_evidence)) throw new Error("ARGUMENT_INVALID");
  const workspace = await canonicalDirectory(input.workspace);
  const bindingsVerifier = dependencies.bindingsVerifier ?? verifyOpenSpecBindingsManifest;
  const verified = await bindingsVerifier({
    workspace,
    aggregatePath: input.aggregate_path,
    aggregateSha256: input.aggregate_sha256,
    phase: "implementation",
  });
  if (verified?.verdict !== "pass" || !verified.manifest) throw new Error("BINDINGS_INVALID");
  const bindings = verified.manifest.bindings;
  const expectedTasks = new Map();
  const overlays = new Map();
  for (const binding of bindings) {
    const overlayFile = await readContainedFile(workspace, binding.overlay_path);
    if (hash(overlayFile.bytes) !== binding.overlay_sha256) throw new Error("OVERLAY_INVALID");
    let overlay;
    try { overlay = JSON.parse(overlayFile.bytes.toString("utf8")); } catch { throw new Error("OVERLAY_INVALID"); }
    if (!Array.isArray(overlay.execution_items)) throw new Error("OVERLAY_INVALID");
    overlays.set(binding.service, overlay);
    for (const item of overlay.execution_items) {
      if (!TASK_ID.test(item?.id ?? "") || !["required", "not-applicable"].includes(item?.pre_implementation_test)
        || !Array.isArray(item.sources) || item.sources.length === 0 || item.sources.some(source => typeof source !== "string")) {
        throw new Error("OVERLAY_INVALID");
      }
      const key = `${binding.service}:${item.id}`;
      if (expectedTasks.has(key)) throw new Error("OVERLAY_INVALID");
      expectedTasks.set(key, { ...item, service: binding.service, binding });
    }
  }
  const requested = input.task_ids.map(taskId => expectedTasks.get(`${input.service}:${taskId}`));
  if (requested.some(item => item === undefined)) throw new Error("SOURCE_COORDINATE_INVALID");
  const scopePaths = input.dispatch_request?.scope_paths ?? [];
  if (!validRelativeList(scopePaths)) throw new Error("ARGUMENT_INVALID");
  const overlay = overlays.get(input.service);
  const ownerItems = scopePaths.map(scopePath => {
    const owners = overlay.execution_items.filter(item => Array.isArray(item.files) && item.files.includes(scopePath));
    if (owners.length !== 1) throw new Error("PACKET_CONTRACT_INVALID");
    return owners[0];
  });
  const selected = [...new Map([...requested, ...ownerItems].map(item => [item.id, item])).values()]
    .sort((left, right) => left.id.localeCompare(right.id, "en", { numeric: true }));
  const indexFile = await readContainedFile(workspace, input.test_contract_evidence.index_path);
  if (hash(indexFile.bytes) !== input.test_contract_evidence.index_sha256) throw new Error("TEST_CONTRACT_INDEX_STALE");
  let index;
  try { index = JSON.parse(indexFile.bytes.toString("utf8")); } catch { throw new Error("TEST_CONTRACT_INDEX_INVALID"); }
  if (!validIndex(index) || index.tasks.some(task => !expectedTasks.has(task.task_id))) throw new Error("TEST_CONTRACT_INDEX_INVALID");
  const requiredTasks = [...expectedTasks.entries()]
    .filter(([, task]) => task.pre_implementation_test === "required")
    .map(([taskId]) => taskId)
    .sort();
  const computedSummary = summary(input.test_contract_evidence.index_path, hash(indexFile.bytes), index.tasks, requiredTasks);
  return {
    workspace,
    manifest: verified.manifest,
    bindings,
    overlays,
    expectedTasks,
    selected,
    index,
    indexFile,
    requiredTasks,
    computedSummary,
  };
}

async function canonicalRegularFile(root, target, errorCode) {
  if (typeof target !== "string" || !path.isAbsolute(target) || path.resolve(target) !== target || !contained(root, target)) {
    throw new Error(errorCode);
  }
  const stat = await lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES || await realpath(target) !== target) {
    throw new Error(errorCode);
  }
  const bytes = await readFile(target);
  if (bytes.length > MAX_BYTES) throw new Error(errorCode);
  return bytes;
}

function validRelativeList(value) {
  return Array.isArray(value) && value.length <= 128 && new Set(value).size === value.length
    && value.every(item => safeRelative(item));
}

function anchorCount(bytes, anchor) {
  if (typeof anchor !== "string" || anchor.length === 0 || anchor.length > 128) return 0;
  return bytes.toString("utf8").split(anchor).length - 1;
}

async function workspaceCoordinate(workspace, value, errorCode) {
  const target = typeof value === "string" && path.isAbsolute(value) ? value : path.resolve(workspace, value ?? "");
  return { path: target, bytes: await canonicalRegularFile(workspace, target, errorCode) };
}

function validDispatchItem(item) {
  return TASK_ID.test(item?.id ?? "") && safeRelative(item?.shard_path)
    && validRelativeList(item?.files) && item.files.length > 0
    && item.discovery_scope && validRelativeList(item.discovery_scope.directories)
    && item.discovery_scope.directories.length > 0 && validRelativeList(item.discovery_scope.globs)
    && item.discovery_scope.globs.length > 0
    && Array.isArray(item.required_invariants) && item.required_invariants.every(value => typeof value === "string" && value.length > 0)
    && Array.isArray(item.required_seams)
    && Array.isArray(item.quality_command_ids) && item.quality_command_ids.length > 0
    && item.quality_command_ids.every(value => typeof value === "string" && value.length > 0);
}

async function deriveEvidenceDispatch(request, model, dispatchBinding, selectedShardPaths) {
  const reference = request.evidence_dispatch_binding;
  if (reference === null) return { binding: null, roots: {}, sources: [] };
  if (!exactKeys(reference, EVIDENCE_BINDING_KEYS) || !SHA256.test(reference.sha256 ?? "")
    || !SHA256.test(reference.dispatch_identity_sha256 ?? "")) throw new Error("PACKET_CONTRACT_INVALID");
  const file = await workspaceCoordinate(model.workspace, reference.path, "PACKET_ARTIFACT_INVALID");
  if (hash(file.bytes) !== reference.sha256) throw new Error("PACKET_ARTIFACT_INVALID");
  let value;
  try { value = JSON.parse(file.bytes.toString("utf8")); } catch { throw new Error("PACKET_ARTIFACT_INVALID"); }
  const { dispatch_identity_sha256: ignored, ...identity } = value ?? {};
  if (value?.kind !== "team_harness_openspec_evidence_dispatch" || value.service !== dispatchBinding.service
    || value.dispatch_identity_sha256 !== reference.dispatch_identity_sha256
    || hash(canonicalBytes(identity)) !== reference.dispatch_identity_sha256
    || value.base_dispatch_binding?.path !== dispatchBinding.path
    || value.base_dispatch_binding?.sha256 !== dispatchBinding.sha256
    || !selectedShardPaths.includes(value.task_shard?.path)
    || !Array.isArray(value.evidence_sources) || value.evidence_sources.length === 0) {
    throw new Error("PACKET_ARTIFACT_INVALID");
  }
  const roots = {};
  const sources = [];
  for (const source of value.evidence_sources) {
    const approved = model.manifest.evidence_repositories?.find(item => item.service === source?.service);
    if (!approved || approved.repository_root !== source.repository_root
      || approved.repository_identity !== source.repository_identity || !Array.isArray(source.coordinates)
      || source.coordinates.length === 0) throw new Error("PACKET_ARTIFACT_INVALID");
    const root = await canonicalDirectory(source.repository_root);
    roots[source.service] = root;
    for (const coordinate of source.coordinates) {
      if (!safeRelative(coordinate?.path) || !SHA256.test(coordinate?.sha256 ?? "")) throw new Error("PACKET_ARTIFACT_INVALID");
      const artifact = await readContainedFile(root, coordinate.path);
      if (hash(artifact.bytes) !== coordinate.sha256) throw new Error("PACKET_ARTIFACT_INVALID");
    }
    sources.push({ service: source.service, coordinates: source.coordinates });
  }
  return {
    binding: { path: file.path, sha256: reference.sha256, dispatch_identity_sha256: reference.dispatch_identity_sha256 },
    roots,
    sources,
  };
}

function capsuleScopeIdentity(capsule) {
  return {
    service: capsule.scope.service,
    task_ids: capsule.scope.task_ids,
    role: capsule.scope.role,
    mode: capsule.scope.mode,
    target_paths: capsule.scope.target_paths,
    repository_root: capsule.scope.repository_root,
    owned_paths: capsule.ownership.owned_paths,
    task_intent_sha256: capsule.openspec.task_intent_sha256,
    source_coordinates: capsule.openspec.source_coordinates,
    dispatch_binding: capsule.openspec.dispatch_binding,
    task_shards: capsule.openspec.task_shards,
    test_contract_index: capsule.acceptance_evidence.test_contract_index,
    test_contracts: capsule.acceptance_evidence.test_contracts,
  };
}

async function deriveDispatchCapsule(input, model, source, testContracts, dependencies) {
  const request = input.dispatch_request;
  if (!exactKeys(request, DISPATCH_REQUEST_KEYS) || request.schema_version !== 1
    || request.kind !== "team_harness_dispatch_request" || !PACKET_ROLES.has(request.role)
    || !PACKET_MODES.has(request.mode) || request.role === "implementer" && request.mode !== "implementation"
    || !["normal", "native-escalation-required"].includes(request.git_metadata_write_mode)
    || !exactKeys(request.helper_bundle, HELPER_BUNDLE_REF_KEYS)
    || !validRelativeList(request.scope_paths)
    || !safeRelative(request.helper_bundle.manifest_path)
    || !SHA256.test(request.helper_bundle.manifest_sha256 ?? "")) throw new Error("PACKET_CONTRACT_INVALID");

  const binding = model.bindings.find(item => item.service === input.service);
  if (!binding || await canonicalDirectory(binding.repository_root) !== binding.repository_root) {
    throw new Error("PACKET_CONTRACT_INVALID");
  }
  const bundleVerifier = dependencies.helperBundleVerifier ?? verifyHelperBundle;
  const bundle = await bundleVerifier({
    workspace: model.workspace,
    manifest_path: request.helper_bundle.manifest_path,
    manifest_sha256: request.helper_bundle.manifest_sha256,
  });
  const boundedCommand = bundle?.helper_paths?.["bounded-command.mjs"];
  const writeScope = bundle?.helper_paths?.["specialist-write-scope.mjs"];
  const testTransition = request.role === "tester" && request.mode === "pre-implementation-contract"
    ? bundle?.helper_paths?.["test-transition.mjs"] : null;
  if (bundle?.verdict !== "pass" || !SHA256.test(bundle.bundle_identity_sha256 ?? "")
    || typeof bundle.compatibility_epoch !== "string" || !boundedCommand || !writeScope || testTransition === undefined) {
    throw new Error("PACKET_CONTRACT_INVALID");
  }
  await canonicalRegularFile(model.workspace, boundedCommand, "PACKET_CONTRACT_INVALID");
  await canonicalRegularFile(model.workspace, writeScope, "PACKET_CONTRACT_INVALID");
  if (testTransition !== null) await canonicalRegularFile(model.workspace, testTransition, "PACKET_CONTRACT_INVALID");

  const overlay = model.overlays.get(input.service);
  const selected = model.selected.map(item => {
    const index = overlay.execution_items.findIndex(candidate => candidate.id === item.id);
    if (index < 0 || !validDispatchItem(item)) throw new Error("PACKET_CONTRACT_INVALID");
    return { item, index };
  });
  const dispatchRelative = `inputs/openspec/${input.service}/dispatch-binding.json`;
  const dispatchFile = await readContainedFile(model.workspace, dispatchRelative);
  let dispatch;
  try { dispatch = JSON.parse(dispatchFile.bytes.toString("utf8")); } catch { throw new Error("PACKET_ARTIFACT_INVALID"); }
  if (!canonicalBytes(dispatch).equals(dispatchFile.bytes) || !exactKeys(dispatch, DISPATCH_BINDING_KEYS)
    || dispatch.schema_version !== OPENSPEC_DISPATCH_BINDING_SCHEMA_VERSION
    || dispatch.kind !== "team_harness_openspec_dispatch_binding" || dispatch.service !== input.service
    || !exactKeys(dispatch.aggregate, new Set(["path", "sha256"]))
    || dispatch.aggregate.path !== input.aggregate_path || dispatch.aggregate.sha256 !== input.aggregate_sha256
    || !SHA256.test(dispatch.gate_identity_sha256 ?? "")
    || !(dispatch.continuation_identity_sha256 === null || SHA256.test(dispatch.continuation_identity_sha256 ?? ""))
    || !exactKeys(dispatch.snapshot, new Set(["path", "sha256"]))
    || dispatch.snapshot.path !== binding.snapshot_path || dispatch.snapshot.sha256 !== binding.snapshot_sha256
    || !exactKeys(dispatch.overlay, new Set(["path", "sha256"]))
    || dispatch.overlay.path !== binding.overlay_path || dispatch.overlay.sha256 !== binding.overlay_sha256
    || !Array.isArray(dispatch.artifacts)) throw new Error("PACKET_ARTIFACT_INVALID");
  const dispatchBinding = { path: dispatchRelative, sha256: hash(dispatchFile.bytes) };

  const expectedArtifacts = [
    { kind: "plan", path: `services/${input.service}/01-plan.md` },
    { kind: "quality-manifest", path: ".team-harness/quality.json" },
    ...overlay.execution_items.map(item => ({ kind: "task-shard", path: item.shard_path }))
      .sort((left, right) => left.path.localeCompare(right.path)),
  ];
  if (dispatch.artifacts.length !== expectedArtifacts.length
    || dispatch.artifacts.some(artifact => !exactKeys(artifact, DISPATCH_ARTIFACT_KEYS)
      || !SHA256.test(artifact.sha256 ?? ""))) throw new Error("PACKET_ARTIFACT_INVALID");
  const artifactByPath = new Map();
  for (const expected of expectedArtifacts) {
    const matches = dispatch.artifacts.filter(artifact => artifact.kind === expected.kind && artifact.path === expected.path);
    if (matches.length !== 1) throw new Error("PACKET_ARTIFACT_INVALID");
    const file = await readContainedFile(model.workspace, expected.path);
    if (hash(file.bytes) !== matches[0].sha256) throw new Error("PACKET_ARTIFACT_INVALID");
    artifactByPath.set(expected.path, matches[0]);
  }

  const taskShards = [];
  for (const { item } of selected) {
    taskShards.push({ path: item.shard_path, sha256: artifactByPath.get(item.shard_path).sha256 });
  }
  const planArtifact = artifactByPath.get(`services/${input.service}/01-plan.md`);
  const planArtifacts = [{ path: `services/${input.service}/01-plan.md`, sha256: planArtifact.sha256 }];
  const qualityArtifact = artifactByPath.get(".team-harness/quality.json");
  const qualityPath = path.join(model.workspace, ".team-harness/quality.json");

  const invariantIds = [...new Set(selected.flatMap(({ item }) => item.required_invariants))].sort();
  const invariants = [];
  if (invariantIds.length > 0) {
    const invariantFile = await readContainedFile(model.workspace, "plan/invariants.md");
    for (const anchor of invariantIds) {
      if (anchorCount(invariantFile.bytes, anchor) !== 1) throw new Error("PACKET_ARTIFACT_INVALID");
      invariants.push({ path: "plan/invariants.md", anchor, sha256: hash(invariantFile.bytes) });
    }
  }
  const snapshotPath = path.resolve(model.workspace, binding.snapshot_path);
  if (hash(await canonicalRegularFile(model.workspace, snapshotPath, "PACKET_ARTIFACT_INVALID")) !== binding.snapshot_sha256) {
    throw new Error("PACKET_ARTIFACT_INVALID");
  }
  const ownedPaths = [...new Set(selected.flatMap(({ item }) => item.files))].sort();
  const discoveryScope = {
    directories: [...new Set(selected.flatMap(({ item }) => item.discovery_scope.directories))].sort(),
    globs: [...new Set(selected.flatMap(({ item }) => item.discovery_scope.globs))].sort(),
  };
  const requiredSeams = selected.flatMap(({ item }) => item.required_seams);
  const commandIds = [...new Set(selected.flatMap(({ item }) => item.quality_command_ids))].sort();
  const executionItems = selected.map(({ item, index }) => ({
    task_id: item.id,
    json_pointer: `/execution_items/${index}`,
    item_sha256: hash(canonicalBytes(item)),
    sources: item.sources,
  }));
  const evidence = await deriveEvidenceDispatch(request, model, dispatchBinding, taskShards.map(item => item.path));
  const scope = validateSpecialistWorkspaceWriteScope({
    role: request.role,
    workspace_artifact_root: model.workspace,
    workspace_write_coordinates: request.workspace_write_coordinates,
  });
  if (scope.verdict !== "pass") throw new Error("PACKET_CONTRACT_INVALID");
  if (request.bounded_result_path !== null
    && (typeof request.bounded_result_path !== "string" || !path.isAbsolute(request.bounded_result_path)
      || !request.workspace_write_coordinates.some(coordinate => coordinate.path === request.bounded_result_path
        && coordinate.operations.includes("create") && coordinate.purpose === "bounded-command-result"))) {
    throw new Error("PACKET_CONTRACT_INVALID");
  }

  const capsule = {
    schema_version: 1,
    kind: "team_harness_dispatch_capsule",
    scope: {
      service: input.service,
      task_ids: selected.map(({ item }) => item.id),
      role: request.role,
      mode: request.mode,
      target_paths: request.scope_paths,
      repository_root: binding.repository_root,
      scope_identity_sha256: null,
    },
    roots: { repository_root: binding.repository_root, workspace_artifact_root: model.workspace, evidence_roots: evidence.roots },
    ownership: { owned_paths: ownedPaths, discovery_scope: discoveryScope, required_seams: requiredSeams },
    openspec: {
      aggregate: { path: input.aggregate_path, sha256: input.aggregate_sha256 },
      snapshot: { path: snapshotPath, sha256: binding.snapshot_sha256 },
      execution_items: executionItems,
      dispatch_binding: { path: path.resolve(model.workspace, dispatchRelative), sha256: dispatchBinding.sha256 },
      task_shards: taskShards,
      plan_artifacts: planArtifacts,
      invariants,
      source_coordinates: source.sourceCoordinates,
      task_intent_sha256: source.taskIntentSha256,
    },
    acceptance_evidence: {
      test_contract_index: { path: model.computedSummary.index_path, sha256: model.computedSummary.index_sha256 },
      test_contracts: testContracts,
    },
    quality: { manifest: { path: qualityPath, sha256: qualityArtifact.sha256 }, command_ids: commandIds },
    helpers: {
      bundle: {
        manifest_path: request.helper_bundle.manifest_path,
        manifest_sha256: request.helper_bundle.manifest_sha256,
        bundle_identity_sha256: bundle.bundle_identity_sha256,
        compatibility_epoch: bundle.compatibility_epoch,
      },
      bounded_command_path: boundedCommand,
      workspace_write_scope_path: writeScope,
      test_transition_path: testTransition,
    },
    workspace_writes: { coordinates: request.workspace_write_coordinates, bounded_result_path: request.bounded_result_path },
    evidence_dispatch: evidence.binding === null ? null : { binding: evidence.binding, sources: evidence.sources },
    git_metadata_write_mode: request.git_metadata_write_mode,
  };
  capsule.scope.scope_identity_sha256 = hash(canonicalBytes(capsuleScopeIdentity(capsule)));
  return canonical(capsule);
}

async function deriveSourceCoordinates(model, service) {
  const binding = model.bindings.find(item => item.service === service);
  if (!binding) throw new Error("SOURCE_COORDINATE_INVALID");
  const snapshotFile = await readContainedFile(model.workspace, binding.snapshot_path);
  if (hash(snapshotFile.bytes) !== binding.snapshot_sha256) throw new Error("SNAPSHOT_INVALID");
  let snapshot;
  try { snapshot = JSON.parse(snapshotFile.bytes.toString("utf8")); } catch { throw new Error("SNAPSHOT_INVALID"); }
  if (!isOpenSpecSnapshot(snapshot)) throw new Error("SNAPSHOT_INVALID");
  const taskArtifact = snapshot.artifacts.find(artifact => artifact.artifact_id === "tasks");
  if (!taskArtifact || taskArtifact.intent_sha256 !== binding.task_intent_sha256) throw new Error("SNAPSHOT_INVALID");
  const coordinates = snapshot.artifacts.flatMap(artifact => artifact.coordinates.map(coordinate => ({ artifact, coordinate })));
  const selectedSourceIds = [...new Set(model.selected.flatMap(item => item.sources))];
  const sourceCoordinates = [];
  const artifactHashes = new Map();
  for (const sourceId of selectedSourceIds) {
    const matches = coordinates.filter(entry => entry.coordinate.id === sourceId);
    if (matches.length !== 1) throw new Error("SOURCE_COORDINATE_INVALID");
    const { artifact, coordinate } = matches[0];
    let liveSha = artifactHashes.get(artifact.path);
    if (liveSha === undefined) {
      const live = await readContainedFile(binding.repository_root, artifact.path);
      liveSha = hash(live.bytes);
      artifactHashes.set(artifact.path, liveSha);
    }
    sourceCoordinates.push({
      source_id: coordinate.id,
      kind: coordinate.kind,
      path: artifact.path,
      line: coordinate.line,
      content_sha256: liveSha,
    });
  }
  return {
    taskIntentSha256: binding.task_intent_sha256,
    sourceCoordinates: sourceCoordinates.sort((left, right) => left.source_id < right.source_id ? -1 : left.source_id > right.source_id ? 1 : 0),
  };
}

async function verifyEvidence(workspace, task) {
  for (const [artifactPath, artifactSha] of [
    [task.contract_path, task.contract_sha256],
    [task.red_evidence_path, task.red_evidence_sha256],
    [task.green_evidence_path, task.green_evidence_sha256],
  ]) {
    if (artifactPath === null) continue;
    const artifact = await readContainedFile(workspace, artifactPath);
    if (hash(artifact.bytes) !== artifactSha) throw new Error("TEST_CONTRACT_EVIDENCE_INVALID");
  }
}

/** Audit the exact correction-packet prerequisites without consuming a nonce or authority. */
export async function preflightCorrectionPacket(input = {}, dependencies = {}) {
  const taskIds = Array.isArray(input?.task_ids) ? [...input.task_ids].sort() : [];
  const normalizedInput = { ...input, task_ids: taskIds };
  const base = { service: SERVICE.test(input?.service ?? "") ? input.service : null, task_ids: taskIds };
  try {
    const model = await loadModel(normalizedInput, dependencies);
    const source = await deriveSourceCoordinates(model, input.service);
    const preImplementationTester = input.dispatch_request?.role === "tester"
      && input.dispatch_request?.mode === "pre-implementation-contract";
    const indexed = new Map(model.index.tasks.map(task => [task.task_id, task]));
    const missingRequiredTasks = model.requiredTasks.filter(taskId => !indexed.has(taskId));
    const details = {
      ...base,
      task_ids: model.selected.map(item => item.id),
      task_intent_sha256: source.taskIntentSha256,
      source_coordinates: source.sourceCoordinates,
      test_contract_summary: model.computedSummary,
      missing_required_tasks: missingRequiredTasks,
    };
    if (missingRequiredTasks.length > 0) {
      return result("repair", "TEST_CONTRACT_COVERAGE_INCOMPLETE", "repair-index-before-presentation", details);
    }
    if (!equalJson(input.test_contract_evidence, model.computedSummary)) {
      return result("repair", "TEST_CONTRACT_STATE_STALE", "repair-state-summary-before-presentation", details);
    }
    const pendingRequiredTasks = [];
    const verifiedRequiredTasks = new Set();
    for (const taskId of model.requiredTasks) {
      const evidence = indexed.get(taskId);
      if (!evidence || evidence.status === "pending") {
        pendingRequiredTasks.push(taskId);
        continue;
      }
      if (!["red", "green"].includes(evidence.status)) throw new Error("TEST_CONTRACT_EVIDENCE_INVALID");
      await verifyEvidence(model.workspace, evidence);
      verifiedRequiredTasks.add(taskId);
    }
    details.pending_required_tasks = pendingRequiredTasks;
    if (pendingRequiredTasks.length > 0 && !preImplementationTester) {
      return result("repair", "TEST_CONTRACT_TASK_PENDING", "complete-required-test-contracts-before-presentation", details);
    }
    const testContracts = [];
    const pendingSelectedTasks = [];
    for (const item of model.selected) {
      const taskId = `${input.service}:${item.id}`;
      if (item.pre_implementation_test === "not-applicable") {
        testContracts.push({ task_id: taskId, status: "not-applicable", contract_path: null, contract_sha256: null, red_evidence_path: null, red_evidence_sha256: null, red_commit_sha: null, red_tree_sha: null });
        continue;
      }
      const evidence = indexed.get(taskId);
      if (!evidence || evidence.status === "pending") {
        pendingSelectedTasks.push(taskId);
        if (preImplementationTester) {
          testContracts.push({
            task_id: taskId,
            status: "pending",
            contract_path: null,
            contract_sha256: null,
            red_evidence_path: null,
            red_evidence_sha256: null,
            red_commit_sha: null,
            red_tree_sha: null,
          });
        }
        continue;
      }
      if (!["red", "green"].includes(evidence.status)) throw new Error("TEST_CONTRACT_EVIDENCE_INVALID");
      if (!verifiedRequiredTasks.has(taskId)) await verifyEvidence(model.workspace, evidence);
      testContracts.push({
        task_id: taskId,
        status: evidence.status,
        contract_path: evidence.contract_path,
        contract_sha256: evidence.contract_sha256,
        red_evidence_path: evidence.red_evidence_path,
        red_evidence_sha256: evidence.red_evidence_sha256,
        red_commit_sha: evidence.red_commit_sha,
        red_tree_sha: evidence.red_tree_sha,
      });
    }
    details.test_contracts = testContracts;
    details.pending_selected_tasks = pendingSelectedTasks;
    if (pendingSelectedTasks.length > 0 && !preImplementationTester) {
      return result("repair", "TEST_CONTRACT_TASK_PENDING", "run-preimplementation-tester-before-presentation", details);
    }
    let dispatchCapsule = null;
    if (Object.hasOwn(input, "dispatch_request")) {
      dispatchCapsule = await deriveDispatchCapsule(normalizedInput, model, source, testContracts, dependencies);
      details.scope_identity_sha256 = dispatchCapsule.scope.scope_identity_sha256;
    }
    return result("pass", null, "bind-preflight-before-presentation", details);
  } catch (error) {
    const code = ERROR_CODES.has(error?.message) ? error.message : "INTERNAL_ERROR";
    return failure(code, "block-before-presentation", base);
  }
}

async function atomicCreate(target, bytes, workspace) {
  const parent = path.dirname(target);
  await ensureDirectory(workspace, parent);
  const canonicalParent = await realpath(parent);
  if (canonicalParent !== parent || !contained(workspace, canonicalParent)) throw new Error("OUTPUT_WRITE_FAILED");
  try {
    const existing = await readContainedFile(workspace, path.relative(workspace, target));
    if (!existing.bytes.equals(bytes)) throw new Error("OUTPUT_WRITE_FAILED");
    return;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const temporary = `${target}.tmp-${randomUUID()}`;
  try {
    await writeFile(temporary, bytes, { flag: "wx", mode: 0o400 });
    if (await realpath(parent) !== parent) throw new Error("OUTPUT_WRITE_FAILED");
    await rename(temporary, target);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    if (error?.code === "EEXIST") {
      const existing = await readContainedFile(workspace, path.relative(workspace, target));
      if (existing.bytes.equals(bytes)) return;
    }
    throw error;
  }
}

/** Resolve and persist the only specialist-facing artifact: one immutable dispatch reference. */
export async function certifyCorrectionPacket(input = {}, dependencies = {}) {
  if (!exactKeys(input, CERTIFY_INPUT_KEYS)) {
    return failure("PACKET_CONTRACT_INVALID", "block-before-presentation", {
      service: SERVICE.test(input?.service ?? "") ? input.service : null,
      task_ids: Array.isArray(input?.task_ids) ? [...input.task_ids].sort() : [],
    });
  }
  const audited = await preflightCorrectionPacket(input, dependencies);
  if (audited.verdict !== "pass") return audited;
  try {
    const workspace = await canonicalDirectory(input.workspace);
    const model = await loadModel({ ...input, task_ids: [...input.task_ids].sort() }, dependencies);
    const source = await deriveSourceCoordinates(model, input.service);
    const capsule = await deriveDispatchCapsule(input, model, source, audited.test_contracts, dependencies);
    if (capsule.scope.scope_identity_sha256 !== audited.scope_identity_sha256) throw new Error("INTERNAL_ERROR");
    const capsuleBytes = canonicalBytes(capsule);
    const capsuleSha = hash(capsuleBytes);
    const relative = `inputs/dispatches/${capsuleSha}.json`;
    const absolute = path.resolve(workspace, relative);
    await atomicCreate(absolute, capsuleBytes, workspace);
    const dispatchReference = {
      schema_version: 1,
      kind: "team_harness_dispatch_reference",
      path: absolute,
      sha256: capsuleSha,
      scope_identity_sha256: capsule.scope.scope_identity_sha256,
    };
    return {
      ...audited,
      action: "dispatch-ready-before-authority",
      dispatch_reference: dispatchReference,
    };
  } catch (error) {
    const code = ERROR_CODES.has(error?.message) ? error.message : "OUTPUT_WRITE_FAILED";
    return failure(code, "block-before-presentation", { service: audited.service, task_ids: audited.task_ids });
  }
}

/** Verify one minimal reference before Main counts an attempt or the specialist reads the repository. */
export async function verifyDispatchReference(input = {}) {
  try {
    if (!exactKeys(input, new Set(["workspace", "dispatch_reference"]))
      || !exactKeys(input.dispatch_reference, DISPATCH_REFERENCE_KEYS)
      || input.dispatch_reference.schema_version !== 1
      || input.dispatch_reference.kind !== "team_harness_dispatch_reference"
      || !SHA256.test(input.dispatch_reference.sha256 ?? "")
      || !SHA256.test(input.dispatch_reference.scope_identity_sha256 ?? "")) {
      throw new Error("PACKET_CONTRACT_INVALID");
    }
    const workspace = await canonicalDirectory(input.workspace);
    const file = await workspaceCoordinate(workspace, input.dispatch_reference.path, "PACKET_ARTIFACT_INVALID");
    if (hash(file.bytes) !== input.dispatch_reference.sha256) throw new Error("PACKET_ARTIFACT_INVALID");
    let capsule;
    try { capsule = JSON.parse(file.bytes.toString("utf8")); } catch { throw new Error("PACKET_ARTIFACT_INVALID"); }
    if (!canonicalBytes(capsule).equals(file.bytes) || capsule?.schema_version !== 1
      || capsule.kind !== "team_harness_dispatch_capsule"
      || capsule.scope?.scope_identity_sha256 !== input.dispatch_reference.scope_identity_sha256) {
      throw new Error("PACKET_ARTIFACT_INVALID");
    }
    if (hash(canonicalBytes(capsuleScopeIdentity(capsule))) !== input.dispatch_reference.scope_identity_sha256) {
      throw new Error("PACKET_ARTIFACT_INVALID");
    }
    return result("pass", null, "ack-dispatch-ready", {
      service: capsule.scope.service,
      task_ids: capsule.scope.task_ids,
      scope_identity_sha256: capsule.scope.scope_identity_sha256,
      dispatch_reference: input.dispatch_reference,
    });
  } catch (error) {
    const code = ERROR_CODES.has(error?.message) ? error.message : "INTERNAL_ERROR";
    return failure(code, "repair-before-attempt");
  }
}

async function atomicWrite(target, bytes) {
  const parent = path.dirname(target);
  const canonicalParent = await realpath(parent);
  if (canonicalParent !== parent) throw new Error("OUTPUT_WRITE_FAILED");
  let existing;
  try { existing = await lstat(target); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  if (!existing || !existing.isFile() || existing.isSymbolicLink()) throw new Error("OUTPUT_WRITE_FAILED");
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.tmp-${process.pid}-${randomUUID()}`);
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = null;
    const beforeRename = await lstat(target);
    if (!beforeRename.isFile() || beforeRename.isSymbolicLink()) throw new Error("OUTPUT_WRITE_FAILED");
    await rename(temporary, target);
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

/** Add only missing required tasks as pending; never manufacture RED/GREEN evidence. */
export async function repairTestContractCoverage(input = {}, dependencies = {}) {
  const base = { service: SERVICE.test(input?.service ?? "") ? input.service : null, task_ids: Array.isArray(input?.task_ids) ? input.task_ids : [] };
  try {
    const model = await loadModel(input, dependencies);
    const indexed = new Set(model.index.tasks.map(task => task.task_id));
    const missingRequiredTasks = model.requiredTasks.filter(taskId => !indexed.has(taskId));
    if (missingRequiredTasks.length === 0) {
      return result("pass", null, "no-repair-needed", { ...base, test_contract_summary: model.computedSummary });
    }
    if (model.index.tasks.length + missingRequiredTasks.length > MAX_TASKS) throw new Error("TEST_CONTRACT_INDEX_INVALID");
    const repaired = {
      ...model.index,
      tasks: [...model.index.tasks, ...missingRequiredTasks.map(emptyPending)]
        .sort((left, right) => left.task_id < right.task_id ? -1 : left.task_id > right.task_id ? 1 : 0),
    };
    const bytes = canonicalBytes(repaired);
    await atomicWrite(model.indexFile.path, bytes);
    const repairedSummary = summary(input.test_contract_evidence.index_path, hash(bytes), repaired.tasks, model.requiredTasks);
    return result("pass", null, "repair-state-summary-before-presentation", {
      ...base,
      test_contract_summary: repairedSummary,
      missing_required_tasks: missingRequiredTasks,
    });
  } catch (error) {
    const code = ERROR_CODES.has(error?.message) ? error.message : "INTERNAL_ERROR";
    return failure(code, "block-before-presentation", base);
  }
}

function parseInput(raw) {
  if (typeof raw !== "string" || Buffer.byteLength(raw, "utf8") > 64 * 1024) return null;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch { return null; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [operation, raw, ...rest] = process.argv.slice(2);
  const input = rest.length === 0 ? parseInput(raw) : null;
  const output = operation === "audit"
    ? await preflightCorrectionPacket(input)
    : operation === "certify"
      ? await certifyCorrectionPacket(input)
    : operation === "verify-reference"
      ? await verifyDispatchReference(input)
    : operation === "repair-index"
      ? await repairTestContractCoverage(input)
      : failure("ARGUMENT_INVALID");
  process.stdout.write(`${JSON.stringify(output)}\n`);
  if (output.verdict !== "pass") process.exitCode = 1;
}
