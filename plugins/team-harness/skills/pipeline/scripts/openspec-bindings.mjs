#!/usr/bin/env node
/** Compose and verify service-owned OpenSpec bindings for one coordinator workspace. */

import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { runBoundedCommand } from "./bounded-command.mjs";
import { repairDerivedOpenSpecArtifacts, validateOpenSpecOverlay } from "./openspec-overlay.mjs";
import { isOpenSpecProgress, isOpenSpecSnapshot, verifySnapshot } from "./openspec-snapshot.mjs";

export const OPENSPEC_BINDINGS_SCHEMA_VERSION = 1;
export const CONSOLIDATED_GATE1_SCHEMA_VERSION = 1;
export const OPENSPEC_BINDING_REPAIR_SCHEMA_VERSION = 1;
export const OPENSPEC_DISPATCH_BINDING_SCHEMA_VERSION = 1;
export const LEGACY_V1_GATE_MIGRATION_SCHEMA_VERSION = 1;
const MAX_BYTES = 1024 * 1024;
const SHA256 = /^[a-f0-9]{64}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ERROR_CODES = new Set([
  "WORKSPACE_INVALID", "ARTIFACT_INVALID", "ARGUMENT_INVALID", "BINDING_INVALID", "BINDING_STALE",
  "AGGREGATE_STALE", "AGGREGATE_INVALID", "OVERLAY_INVALID", "REPOSITORY_IDENTITY_MISMATCH",
  "REPOSITORY_IDENTITY_UNREADABLE", "SNAPSHOT_INVALID", "SOURCE_CHANGED", "TASK_INTENT_CHANGED",
  "TASK_PROGRESS_INVALID", "PROGRESS_INVALID", "ATOMIC_TRANSITION_REQUIRED",
  "DERIVED_SET_BUSY", "DERIVED_REPAIR_INELIGIBLE", "DISPATCH_BINDING_INVALID", "DISPATCH_BINDING_STALE",
  "GATE1_IDENTITY_STALE",
]);

const safeString = (value, maximum = 4096) => typeof value === "string" && value.length > 0
  && !value.includes("\0") && Buffer.byteLength(value, "utf8") <= maximum;
const safeRelative = value => safeString(value, 1024) && !path.isAbsolute(value)
  && !value.replaceAll("\\", "/").split("/").includes("..");
const contained = (root, target) => {
  const relative = path.relative(root, target);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
};
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const errorCode = (error, fallback) => ERROR_CODES.has(error?.message) ? error.message : fallback;
const exactlyKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

export function canonicalJsonBytes(value) {
  return Buffer.from(`${JSON.stringify(canonical(value), null, 2)}\n`, "utf8");
}

async function workspaceRoot(value) {
  if (!safeString(value) || !path.isAbsolute(value)) throw new Error("WORKSPACE_INVALID");
  const root = await realpath(path.resolve(value));
  const stat = await lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("WORKSPACE_INVALID");
  return root;
}

async function readWorkspaceFile(root, relative) {
  if (!safeRelative(relative)) throw new Error("ARTIFACT_INVALID");
  const target = path.resolve(root, relative);
  if (!contained(root, target)) throw new Error("ARTIFACT_INVALID");
  const stat = await lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES) throw new Error("ARTIFACT_INVALID");
  const canonicalPath = await realpath(target);
  if (!contained(root, canonicalPath)) throw new Error("ARTIFACT_INVALID");
  const bytes = await readFile(canonicalPath);
  if (bytes.length > MAX_BYTES) throw new Error("ARTIFACT_INVALID");
  return { path: canonicalPath, bytes };
}

async function readRepositoryFile(root, relative) {
  if (!safeString(root) || !path.isAbsolute(root) || !safeRelative(relative)) throw new Error("ARTIFACT_INVALID");
  const canonicalRoot = await realpath(path.resolve(root));
  const target = path.resolve(canonicalRoot, relative);
  if (!contained(canonicalRoot, target)) throw new Error("ARTIFACT_INVALID");
  const stat = await lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES) throw new Error("ARTIFACT_INVALID");
  const canonicalPath = await realpath(target);
  if (!contained(canonicalRoot, canonicalPath)) throw new Error("ARTIFACT_INVALID");
  const bytes = await readFile(canonicalPath);
  if (bytes.length > MAX_BYTES) throw new Error("ARTIFACT_INVALID");
  return { path: canonicalPath, bytes };
}

async function atomicWrite(target, bytes) {
  await mkdir(path.dirname(target), { recursive: true });
  let existing;
  try { existing = await lstat(target); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  if (existing && (!existing.isFile() || existing.isSymbolicLink())) throw new Error("ARTIFACT_INVALID");
  const temporary = `${target}.tmp-${randomUUID()}`;
  try {
    await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

function expectedSnapshotPath(service) { return `inputs/openspec/${service}/snapshot.json`; }
function expectedOverlayPath(service) { return `plan/openspec/${service}/traceability.json`; }
function expectedDispatchBindingPath(service) { return `inputs/openspec/${service}/dispatch-binding.json`; }
function expectedDerivedLockPath(service) { return `.team-harness/locks/openspec-${service}-derived.lock`; }

async function withDerivedSetLock(root, service, callback) {
  const relative = expectedDerivedLockPath(service);
  const target = path.resolve(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  try {
    await writeFile(target, canonicalJsonBytes({ owner: randomUUID(), service }), { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error?.code === "EEXIST") throw new Error("DERIVED_SET_BUSY");
    throw error;
  }
  try { return await callback(); }
  finally { await rm(target, { force: true }); }
}

function validBindingShape(binding) {
  return binding && typeof binding === "object" && !Array.isArray(binding)
    && SLUG.test(binding.service ?? "") && binding.role === "writable-owner"
    && safeString(binding.repository_root) && path.isAbsolute(binding.repository_root)
    && safeString(binding.repository_identity, 2048) && SLUG.test(binding.change_name ?? "")
    && safeString(binding.planning_root) && path.isAbsolute(binding.planning_root)
    && safeString(binding.schema, 128) && safeString(binding.cli_version, 128)
    && safeString(binding.generated_skill_identity, 2048)
    && SHA256.test(binding.task_intent_sha256 ?? "") && binding.strict_validation === "pass"
    && binding.snapshot_path === expectedSnapshotPath(binding.service) && SHA256.test(binding.snapshot_sha256 ?? "")
    && binding.overlay_path === expectedOverlayPath(binding.service) && SHA256.test(binding.overlay_sha256 ?? "");
}

function validEvidenceShape(value) {
  return value && typeof value === "object" && !Array.isArray(value) && SLUG.test(value.service ?? "")
    && value.role === "evidence-only" && safeString(value.repository_root) && path.isAbsolute(value.repository_root)
    && safeString(value.repository_identity, 2048) && safeString(value.purpose, 2048);
}

function validDependency(value, services) {
  return value && typeof value === "object" && !Array.isArray(value)
    && services.has(value.from) && services.has(value.to) && value.from !== value.to && safeString(value.kind, 128);
}

export function isOpenSpecBindingsManifest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || value.schema_version !== OPENSPEC_BINDINGS_SCHEMA_VERSION
    || value.kind !== "team_harness_openspec_bindings"
    || !Array.isArray(value.bindings) || value.bindings.length === 0
    || !value.bindings.every(validBindingShape)
    || !Array.isArray(value.evidence_repositories) || !value.evidence_repositories.every(validEvidenceShape)
    || !Array.isArray(value.dependencies) || !Array.isArray(value.execution_order)) return false;
  const services = value.bindings.map(binding => binding.service);
  const evidence = value.evidence_repositories.map(binding => binding.service);
  if (new Set(services).size !== services.length || new Set([...services, ...evidence]).size !== services.length + evidence.length
    || value.execution_order.length !== services.length || new Set(value.execution_order).size !== services.length
    || value.execution_order.some(service => !services.includes(service))) return false;
  const serviceSet = new Set(services);
  if (!value.dependencies.every(dependency => validDependency(dependency, serviceSet))) return false;
  if (new Set(value.dependencies.map(item => `${item.from}\0${item.to}\0${item.kind}`)).size !== value.dependencies.length) return false;
  const positions = new Map(value.execution_order.map((service, index) => [service, index]));
  if (value.dependencies.some(dependency => positions.get(dependency.from) >= positions.get(dependency.to))) return false;
  return true;
}

function result(operation, verdict, errorCode = null, details = {}) {
  return {
    schema_version: 1,
    kind: "team_harness_openspec_bindings_action",
    operation,
    verdict,
    error_code: errorCode,
    aggregate_path: details.aggregate_path ?? null,
    aggregate_sha256: details.aggregate_sha256 ?? null,
    failed_binding: details.failed_binding ?? null,
    manifest: details.manifest ?? null,
  };
}

export async function readRepositoryIdentity(repositoryRoot, commandRunner) {
  const runner = commandRunner ?? (options => runBoundedCommand({ ...options, includeSuccessDiagnostic: true, timeoutMs: 30_000 }));
  const common = await runner({ argv: ["git", "-C", repositoryRoot, "rev-parse", "--git-common-dir"] });
  const remote = await runner({ argv: ["git", "-C", repositoryRoot, "remote", "get-url", "origin"] });
  if (common?.outcome !== "completed" || common.exit_code !== 0 || remote?.outcome !== "completed" || remote.exit_code !== 0) {
    throw new Error("REPOSITORY_IDENTITY_UNREADABLE");
  }
  const commonValue = common.stdout?.tail?.trim();
  const remoteValue = remote.stdout?.tail?.trim();
  if (!safeString(commonValue) || !safeString(remoteValue)) throw new Error("REPOSITORY_IDENTITY_UNREADABLE");
  return digest(Buffer.from(`${path.resolve(repositoryRoot, commonValue)}\n${remoteValue}\n`));
}

export async function createOpenSpecBindingsManifest({
  workspace,
  bindings,
  evidenceRepositories = [],
  dependencies = [],
  executionOrder,
  repositoryIdentityReader = readRepositoryIdentity,
  overlayValidator = validateOpenSpecOverlay,
  target = "inputs/openspec-bindings.json",
} = {}) {
  let root;
  try { root = await workspaceRoot(workspace); } catch (error) { return result("create", "fail", errorCode(error, "WORKSPACE_INVALID")); }
  if (!Array.isArray(bindings) || bindings.length === 0 || !Array.isArray(evidenceRepositories)
    || !Array.isArray(dependencies) || !Array.isArray(executionOrder)) return result("create", "fail", "ARGUMENT_INVALID");
  const normalized = [];
  for (const supplied of bindings) {
    const service = supplied?.service;
    if (!SLUG.test(service ?? "")) return result("create", "fail", "BINDING_INVALID", { failed_binding: service ?? null });
    const snapshotPath = expectedSnapshotPath(service);
    const overlayPath = expectedOverlayPath(service);
    try {
      const snapshotFile = await readWorkspaceFile(root, snapshotPath);
      const overlayFile = await readWorkspaceFile(root, overlayPath);
      const snapshot = JSON.parse(snapshotFile.bytes.toString("utf8"));
      const taskArtifact = snapshot?.artifacts?.find(item => item.artifact_id === "tasks");
      if (!isOpenSpecSnapshot(snapshot) || path.resolve(snapshot.repository.root) !== path.resolve(supplied.repository_root)
        || snapshot.change.name !== supplied.change_name || path.resolve(snapshot.change.root) !== path.resolve(supplied.planning_root)
        || snapshot.change.schema !== supplied.schema || snapshot.toolchain.openspec_version !== supplied.cli_version) {
        throw new Error("BINDING_INVALID");
      }
      const currentIdentity = await repositoryIdentityReader(path.resolve(supplied.repository_root));
      if (currentIdentity !== supplied.repository_identity) throw new Error("REPOSITORY_IDENTITY_MISMATCH");
      const overlayResult = await overlayValidator({
        workspace: root, snapshot: snapshotPath, traceability: overlayPath,
        writableRoots: [path.resolve(supplied.repository_root), root],
      });
      if (overlayResult?.verdict !== "pass") throw new Error("OVERLAY_INVALID");
      normalized.push({
        service,
        role: "writable-owner",
        repository_root: path.resolve(supplied.repository_root),
        repository_identity: supplied.repository_identity,
        change_name: supplied.change_name,
        planning_root: path.resolve(supplied.planning_root),
        schema: supplied.schema,
        cli_version: supplied.cli_version,
        generated_skill_identity: supplied.generated_skill_identity,
        task_intent_sha256: taskArtifact.intent_sha256,
        strict_validation: "pass",
        snapshot_path: snapshotPath,
        snapshot_sha256: digest(snapshotFile.bytes),
        overlay_path: overlayPath,
        overlay_sha256: digest(overlayFile.bytes),
      });
    } catch (error) {
      return result("create", "fail", errorCode(error, "ARTIFACT_INVALID"), { failed_binding: service });
    }
  }
  if (evidenceRepositories.some(value => !safeString(value?.repository_root) || !path.isAbsolute(value.repository_root))) {
    return result("create", "fail", "BINDING_INVALID");
  }
  const evidence = evidenceRepositories.map(value => ({ ...value, repository_root: path.resolve(value.repository_root) }));
  const manifest = { schema_version: OPENSPEC_BINDINGS_SCHEMA_VERSION, kind: "team_harness_openspec_bindings", bindings: normalized, evidence_repositories: evidence, dependencies, execution_order: executionOrder };
  if (!isOpenSpecBindingsManifest(manifest)) return result("create", "fail", "BINDING_INVALID");
  const bytes = canonicalJsonBytes(manifest);
  const aggregatePath = path.resolve(root, target);
  if (!safeRelative(target) || !contained(root, aggregatePath)) return result("create", "fail", "ARGUMENT_INVALID");
  try { await atomicWrite(aggregatePath, bytes); }
  catch { return result("create", "fail", "ARTIFACT_INVALID"); }
  return result("create", "pass", null, { aggregate_path: aggregatePath, aggregate_sha256: digest(bytes), manifest });
}

async function bindingSnapshotVerificationRequest({ root, binding, snapshotFile, phase, authorizedTaskIds }) {
  if (phase !== "implementation" || !Array.isArray(authorizedTaskIds) || authorizedTaskIds.length > 0) {
    return { phase, authorizedTaskIds };
  }
  const snapshot = JSON.parse(snapshotFile.bytes.toString("utf8"));
  if (!isOpenSpecSnapshot(snapshot)) throw new Error("SNAPSHOT_INVALID");
  const progressFile = await readWorkspaceFile(root, `${path.posix.dirname(binding.snapshot_path)}/openspec-progress.json`);
  const progress = JSON.parse(progressFile.bytes.toString("utf8"));
  if (!isOpenSpecProgress(progress, snapshot)) throw new Error("PROGRESS_INVALID");
  const latest = progress.events.at(-1);
  return latest === undefined
    ? { phase: "pre-gate1", authorizedTaskIds: [] }
    : { phase: "implementation", authorizedTaskIds: latest.task_ids };
}

export async function verifyOpenSpecBindingsManifest({
  workspace,
  aggregatePath = "inputs/openspec-bindings.json",
  aggregateSha256,
  phase = "pre-gate1",
  authorizedTasksByService = {},
  repositoryIdentityReader = readRepositoryIdentity,
  snapshotVerifier = verifySnapshot,
  overlayValidator = validateOpenSpecOverlay,
} = {}) {
  let root;
  try { root = await workspaceRoot(workspace); } catch (error) { return result("verify", "fail", errorCode(error, "WORKSPACE_INVALID")); }
  let aggregateFile;
  let manifest;
  try {
    aggregateFile = await readWorkspaceFile(root, aggregatePath);
    if (!SHA256.test(aggregateSha256 ?? "") || digest(aggregateFile.bytes) !== aggregateSha256) throw new Error("AGGREGATE_STALE");
    manifest = JSON.parse(aggregateFile.bytes.toString("utf8"));
    if (!isOpenSpecBindingsManifest(manifest) || !canonicalJsonBytes(manifest).equals(aggregateFile.bytes)) throw new Error("AGGREGATE_INVALID");
  } catch (error) { return result("verify", "fail", errorCode(error, "AGGREGATE_INVALID")); }
  for (const binding of manifest.bindings) {
    try {
      if (await repositoryIdentityReader(binding.repository_root) !== binding.repository_identity) throw new Error("REPOSITORY_IDENTITY_MISMATCH");
      const snapshot = await readWorkspaceFile(root, binding.snapshot_path);
      const overlay = await readWorkspaceFile(root, binding.overlay_path);
      if (digest(snapshot.bytes) !== binding.snapshot_sha256 || digest(overlay.bytes) !== binding.overlay_sha256) throw new Error("BINDING_STALE");
      const verificationRequest = await bindingSnapshotVerificationRequest({
        root,
        binding,
        snapshotFile: snapshot,
        phase,
        authorizedTaskIds: authorizedTasksByService[binding.service] ?? [],
      });
      const verified = await snapshotVerifier({
        snapshotPath: snapshot.path,
        ...verificationRequest,
      });
      if (verified?.verdict !== "pass") throw new Error(verified?.error_code ?? "SNAPSHOT_INVALID");
      const overlayResult = await overlayValidator({
        workspace: root, snapshot: binding.snapshot_path, traceability: binding.overlay_path,
        writableRoots: [binding.repository_root, root],
      });
      if (overlayResult?.verdict !== "pass") throw new Error(overlayResult?.error_code ?? "OVERLAY_INVALID");
    } catch (error) {
      return result("verify", "fail", errorCode(error, "BINDING_INVALID"), {
        aggregate_path: aggregateFile.path, aggregate_sha256: digest(aggregateFile.bytes), failed_binding: binding.service,
      });
    }
  }
  return result("verify", "pass", null, { aggregate_path: aggregateFile.path, aggregate_sha256: digest(aggregateFile.bytes), manifest });
}

export function bindConsolidatedGate1({ manifest, aggregateSha256, nonce } = {}) {
  if (!isOpenSpecBindingsManifest(manifest) || !SHA256.test(aggregateSha256 ?? "") || !safeString(nonce, 256)) return null;
  const bindingServices = manifest.execution_order.slice();
  const identity = { scope: "initiative", aggregate_sha256: aggregateSha256, binding_services: bindingServices, nonce };
  return {
    schema_version: CONSOLIDATED_GATE1_SCHEMA_VERSION,
    kind: "team_harness_consolidated_gate1",
    ...identity,
    gate_identity_sha256: digest(canonicalJsonBytes(identity)),
  };
}

export function verifyConsolidatedGate1({ gate, manifest, aggregateSha256, nonce } = {}) {
  const expected = bindConsolidatedGate1({ manifest, aggregateSha256, nonce });
  return expected !== null && canonicalJsonBytes(gate).equals(canonicalJsonBytes(expected))
    ? { verdict: "pass", error_code: null }
    : { verdict: "fail", error_code: "GATE1_IDENTITY_STALE" };
}

function dispatchBindingResult(operation, verdict, errorCodeValue, details = {}) {
  return {
    schema_version: OPENSPEC_DISPATCH_BINDING_SCHEMA_VERSION,
    kind: "team_harness_openspec_dispatch_binding_action",
    operation,
    verdict,
    error_code: errorCodeValue,
    changed: details.changed ?? false,
    service: details.service ?? null,
    dispatch_binding_path: details.dispatch_binding_path ?? null,
    dispatch_binding_sha256: details.dispatch_binding_sha256 ?? null,
  };
}

function validDispatchArtifact(value) {
  return exactlyKeys(value, ["kind", "path", "sha256"])
    && ["plan", "quality-manifest", "task-shard"].includes(value.kind)
    && safeRelative(value.path) && SHA256.test(value.sha256 ?? "");
}

function isOpenSpecDispatchBinding(value) {
  return exactlyKeys(value, [
    "schema_version", "kind", "service", "aggregate", "gate_identity_sha256",
    "continuation_identity_sha256", "snapshot", "overlay", "artifacts",
  ]) && value.schema_version === OPENSPEC_DISPATCH_BINDING_SCHEMA_VERSION
    && value.kind === "team_harness_openspec_dispatch_binding" && SLUG.test(value.service ?? "")
    && exactlyKeys(value.aggregate, ["path", "sha256"]) && safeRelative(value.aggregate.path)
    && SHA256.test(value.aggregate.sha256 ?? "") && SHA256.test(value.gate_identity_sha256 ?? "")
    && (value.continuation_identity_sha256 === null || SHA256.test(value.continuation_identity_sha256 ?? ""))
    && exactlyKeys(value.snapshot, ["path", "sha256"]) && safeRelative(value.snapshot.path)
    && SHA256.test(value.snapshot.sha256 ?? "")
    && exactlyKeys(value.overlay, ["path", "sha256"]) && safeRelative(value.overlay.path)
    && SHA256.test(value.overlay.sha256 ?? "")
    && Array.isArray(value.artifacts) && value.artifacts.length >= 3
    && value.artifacts.every(validDispatchArtifact)
    && new Set(value.artifacts.map(item => item.path)).size === value.artifacts.length;
}

async function expectedOpenSpecDispatchBinding({
  root, aggregatePath, aggregateSha256, service, gate, nonce, continuationIdentitySha256,
  overlayValidator = validateOpenSpecOverlay,
}) {
  const aggregateFile = await readWorkspaceFile(root, aggregatePath);
  if (!SHA256.test(aggregateSha256 ?? "") || digest(aggregateFile.bytes) !== aggregateSha256) throw new Error("AGGREGATE_STALE");
  const manifest = JSON.parse(aggregateFile.bytes.toString("utf8"));
  if (!isOpenSpecBindingsManifest(manifest) || !canonicalJsonBytes(manifest).equals(aggregateFile.bytes)) throw new Error("AGGREGATE_INVALID");
  if (verifyConsolidatedGate1({ gate, manifest, aggregateSha256, nonce }).verdict !== "pass") throw new Error("GATE1_IDENTITY_STALE");
  if (continuationIdentitySha256 !== null && !SHA256.test(continuationIdentitySha256 ?? "")) throw new Error("ARGUMENT_INVALID");
  const matches = manifest.bindings.filter(item => item.service === service);
  if (matches.length !== 1) throw new Error("BINDING_INVALID");
  const binding = matches[0];
  const snapshotFile = await readWorkspaceFile(root, binding.snapshot_path);
  const overlayFile = await readWorkspaceFile(root, binding.overlay_path);
  if (digest(snapshotFile.bytes) !== binding.snapshot_sha256 || digest(overlayFile.bytes) !== binding.overlay_sha256) throw new Error("BINDING_STALE");
  const overlay = JSON.parse(overlayFile.bytes.toString("utf8"));
  const overlayValidation = await overlayValidator({
    workspace: root,
    snapshot: binding.snapshot_path,
    traceability: binding.overlay_path,
    writableRoots: [binding.repository_root, root],
  });
  if (overlayValidation?.verdict !== "pass") throw new Error(overlayValidation?.error_code ?? "OVERLAY_INVALID");
  const shardPaths = Array.isArray(overlay.execution_items) ? overlay.execution_items.map(item => item?.shard_path) : [];
  const qualityPath = overlay.freeze?.quality_manifest_path;
  if (shardPaths.length === 0 || !shardPaths.every(safeRelative) || new Set(shardPaths).size !== shardPaths.length
    || qualityPath !== ".team-harness/quality.json") throw new Error("DISPATCH_BINDING_INVALID");
  const descriptions = [
    { kind: "plan", path: `services/${service}/01-plan.md` },
    { kind: "quality-manifest", path: qualityPath },
    ...shardPaths.sort().map(itemPath => ({ kind: "task-shard", path: itemPath })),
  ];
  const artifacts = [];
  for (const description of descriptions) {
    const artifact = await readWorkspaceFile(root, description.path);
    artifacts.push({ ...description, sha256: digest(artifact.bytes) });
  }
  const value = {
    schema_version: OPENSPEC_DISPATCH_BINDING_SCHEMA_VERSION,
    kind: "team_harness_openspec_dispatch_binding",
    service,
    aggregate: { path: aggregatePath, sha256: aggregateSha256 },
    gate_identity_sha256: gate.gate_identity_sha256,
    continuation_identity_sha256: continuationIdentitySha256,
    snapshot: { path: binding.snapshot_path, sha256: binding.snapshot_sha256 },
    overlay: { path: binding.overlay_path, sha256: binding.overlay_sha256 },
    artifacts,
  };
  if (!isOpenSpecDispatchBinding(value)) throw new Error("DISPATCH_BINDING_INVALID");
  return value;
}

async function readOptionalWorkspaceFile(root, relative) {
  try { return await readWorkspaceFile(root, relative); }
  catch (error) { if (error?.code === "ENOENT") return null; throw error; }
}

/** Atomically freezes one service's derived dispatch set before any specialist packet is built. */
export async function sealOpenSpecBindingDispatch({
  workspace,
  aggregatePath = "inputs/openspec-bindings.json",
  aggregateSha256,
  service,
  gate,
  nonce,
  continuationIdentitySha256 = null,
  overlayValidator = validateOpenSpecOverlay,
} = {}) {
  const common = { service: SLUG.test(service ?? "") ? service : null };
  let root;
  try { root = await workspaceRoot(workspace); }
  catch (error) { return dispatchBindingResult("seal-dispatch", "fail", errorCode(error, "WORKSPACE_INVALID"), common); }
  if (!SLUG.test(service ?? "")) return dispatchBindingResult("seal-dispatch", "fail", "ARGUMENT_INVALID", common);
  try {
    return await withDerivedSetLock(root, service, async () => {
      const value = await expectedOpenSpecDispatchBinding({
        root, aggregatePath, aggregateSha256, service, gate, nonce, continuationIdentitySha256, overlayValidator,
      });
      const bytes = canonicalJsonBytes(value);
      const relative = expectedDispatchBindingPath(service);
      const existing = await readOptionalWorkspaceFile(root, relative);
      if (existing !== null) {
        if (!existing.bytes.equals(bytes)) throw new Error("DISPATCH_BINDING_STALE");
        return dispatchBindingResult("seal-dispatch", "pass", null, {
          ...common, changed: false, dispatch_binding_path: relative, dispatch_binding_sha256: digest(bytes),
        });
      }
      const target = path.resolve(root, relative);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, bytes, { flag: "wx", mode: 0o600 });
      return dispatchBindingResult("seal-dispatch", "pass", null, {
        ...common, changed: true, dispatch_binding_path: relative, dispatch_binding_sha256: digest(bytes),
      });
    });
  } catch (error) {
    return dispatchBindingResult("seal-dispatch", "fail", errorCode(error, "DISPATCH_BINDING_INVALID"), common);
  }
}

/** Recompute and compare the permanent derived dispatch seal before each fresh dispatch. */
export async function verifyOpenSpecBindingDispatch(options = {}) {
  const service = options.service;
  const common = { service: SLUG.test(service ?? "") ? service : null };
  let root;
  try { root = await workspaceRoot(options.workspace); }
  catch (error) { return dispatchBindingResult("verify-dispatch", "fail", errorCode(error, "WORKSPACE_INVALID"), common); }
  if (!SLUG.test(service ?? "")) return dispatchBindingResult("verify-dispatch", "fail", "ARGUMENT_INVALID", common);
  try {
    return await withDerivedSetLock(root, service, async () => {
      const relative = expectedDispatchBindingPath(service);
      const existing = await readWorkspaceFile(root, relative);
      const parsed = JSON.parse(existing.bytes.toString("utf8"));
      if (!isOpenSpecDispatchBinding(parsed) || !canonicalJsonBytes(parsed).equals(existing.bytes)) throw new Error("DISPATCH_BINDING_INVALID");
      const expected = await expectedOpenSpecDispatchBinding({
        root,
        aggregatePath: options.aggregatePath ?? "inputs/openspec-bindings.json",
        aggregateSha256: options.aggregateSha256,
        service,
        gate: options.gate,
        nonce: options.nonce,
        continuationIdentitySha256: options.continuationIdentitySha256 ?? null,
        overlayValidator: options.overlayValidator ?? validateOpenSpecOverlay,
      });
      const expectedBytes = canonicalJsonBytes(expected);
      if (!existing.bytes.equals(expectedBytes)) throw new Error("DISPATCH_BINDING_STALE");
      return dispatchBindingResult("verify-dispatch", "pass", null, {
        ...common, changed: false, dispatch_binding_path: relative, dispatch_binding_sha256: digest(expectedBytes),
      });
    });
  } catch (error) {
    return dispatchBindingResult("verify-dispatch", "fail", errorCode(error, "DISPATCH_BINDING_INVALID"), common);
  }
}

function bindingRepairResult(verdict, errorCode, details = {}) {
  return {
    schema_version: OPENSPEC_BINDING_REPAIR_SCHEMA_VERSION,
    kind: "team_harness_openspec_binding_derived_repair",
    verdict,
    error_code: errorCode,
    service: details.service ?? null,
    aggregate_sha256: details.aggregate_sha256 ?? null,
    gate_identity_sha256: details.gate_identity_sha256 ?? null,
    repair_evidence_path: details.repair_evidence_path ?? null,
    repair_evidence_sha256: details.repair_evidence_sha256 ?? null,
    verification_path: details.verification_path ?? null,
    verification_sha256: details.verification_sha256 ?? null,
  };
}

/** Coordinator-owned wrapper that proves aggregate and Gate-1 identity before and after derived repair. */
async function repairOpenSpecBindingDerivedArtifactsUnlocked({
  workspace,
  aggregatePath = "inputs/openspec-bindings.json",
  aggregateSha256,
  service,
  gate,
  nonce,
  implementationStarted,
  repositoryIdentityReader = readRepositoryIdentity,
  snapshotVerifier = verifySnapshot,
  overlayValidator = validateOpenSpecOverlay,
  overlayRepairer = repairDerivedOpenSpecArtifacts,
} = {}) {
  const common = {
    service: SLUG.test(service ?? "") ? service : null,
    aggregate_sha256: SHA256.test(aggregateSha256 ?? "") ? aggregateSha256 : null,
    gate_identity_sha256: SHA256.test(gate?.gate_identity_sha256 ?? "") ? gate.gate_identity_sha256 : null,
  };
  let root;
  let aggregateFile;
  let manifest;
  try {
    root = await workspaceRoot(workspace);
    aggregateFile = await readWorkspaceFile(root, aggregatePath);
    if (!SHA256.test(aggregateSha256 ?? "") || digest(aggregateFile.bytes) !== aggregateSha256) throw new Error("AGGREGATE_STALE");
    manifest = JSON.parse(aggregateFile.bytes.toString("utf8"));
    if (!isOpenSpecBindingsManifest(manifest) || !canonicalJsonBytes(manifest).equals(aggregateFile.bytes)) throw new Error("AGGREGATE_INVALID");
  } catch (error) {
    return bindingRepairResult("fail", errorCode(error, "AGGREGATE_INVALID"), common);
  }
  if (implementationStarted !== false || verifyConsolidatedGate1({ gate, manifest, aggregateSha256, nonce }).verdict !== "pass") {
    return bindingRepairResult("fail", implementationStarted === false ? "GATE1_IDENTITY_STALE" : "DERIVED_REPAIR_INELIGIBLE", common);
  }
  const binding = manifest.bindings.find(item => item.service === service);
  if (!binding || manifest.bindings.filter(item => item.service === service).length !== 1) {
    return bindingRepairResult("fail", "BINDING_INVALID", common);
  }
  try {
    const existingSeal = await readOptionalWorkspaceFile(root, expectedDispatchBindingPath(service));
    if (existingSeal !== null) return bindingRepairResult("fail", "DERIVED_REPAIR_INELIGIBLE", common);
  } catch (error) {
    return bindingRepairResult("fail", errorCode(error, "ARTIFACT_INVALID"), common);
  }
  try {
    if (await repositoryIdentityReader(binding.repository_root) !== binding.repository_identity) throw new Error("REPOSITORY_IDENTITY_MISMATCH");
    const snapshotFile = await readWorkspaceFile(root, binding.snapshot_path);
    if (digest(snapshotFile.bytes) !== binding.snapshot_sha256) throw new Error("BINDING_STALE");
    const snapshotValue = JSON.parse(snapshotFile.bytes.toString("utf8"));
    const progressPath = `${path.posix.dirname(binding.snapshot_path)}/openspec-progress.json`;
    const progressFile = await readWorkspaceFile(root, progressPath);
    const progressValue = JSON.parse(progressFile.bytes.toString("utf8"));
    if (!isOpenSpecProgress(progressValue, snapshotValue) || progressValue.completed.length !== 0 || progressValue.events.length !== 0) {
      return bindingRepairResult("fail", "DERIVED_REPAIR_INELIGIBLE", common);
    }
  } catch (error) {
    return bindingRepairResult("fail", errorCode(error, "BINDING_INVALID"), common);
  }
  for (const sibling of manifest.bindings.filter(item => item.service !== service)) {
    try {
      if (await repositoryIdentityReader(sibling.repository_root) !== sibling.repository_identity) throw new Error("REPOSITORY_IDENTITY_MISMATCH");
      const snapshotFile = await readWorkspaceFile(root, sibling.snapshot_path);
      const overlayFile = await readWorkspaceFile(root, sibling.overlay_path);
      if (digest(snapshotFile.bytes) !== sibling.snapshot_sha256 || digest(overlayFile.bytes) !== sibling.overlay_sha256) throw new Error("BINDING_STALE");
      const source = await snapshotVerifier({ snapshotPath: snapshotFile.path, phase: "pre-gate1", authorizedTaskIds: [] });
      if (source?.verdict !== "pass") throw new Error(source?.error_code ?? "SNAPSHOT_INVALID");
      const overlay = await overlayValidator({
        workspace: root,
        snapshot: sibling.snapshot_path,
        traceability: sibling.overlay_path,
        writableRoots: [sibling.repository_root, root],
      });
      if (overlay?.verdict !== "pass") throw new Error(overlay?.error_code ?? "OVERLAY_INVALID");
    } catch (error) {
      return bindingRepairResult("fail", errorCode(error, "BINDING_INVALID"), { ...common, service: sibling.service });
    }
  }

  const repaired = await overlayRepairer({
    workspace: root,
    snapshot: binding.snapshot_path,
    traceability: binding.overlay_path,
    plan: `services/${service}/01-plan.md`,
    writableRoots: [binding.repository_root, root],
    approvedSnapshotSha256: binding.snapshot_sha256,
    approvedOverlaySha256: binding.overlay_sha256,
    approvedAggregateSha256: aggregateSha256,
    approvedGateIdentitySha256: gate.gate_identity_sha256,
    implementationStarted: false,
  });
  if (repaired?.verdict !== "pass" || repaired.changed !== true || !safeRelative(repaired.evidence_path)
    || !SHA256.test(repaired.evidence_sha256 ?? "")) {
    return bindingRepairResult("fail", repaired?.error_code ?? "DERIVED_REPAIR_INELIGIBLE", common);
  }

  const post = await verifyOpenSpecBindingsManifest({
    workspace: root,
    aggregatePath,
    aggregateSha256,
    phase: "pre-gate1",
    repositoryIdentityReader,
    snapshotVerifier,
    overlayValidator,
  });
  const gatePost = verifyConsolidatedGate1({ gate, manifest, aggregateSha256, nonce });
  if (post.verdict !== "pass" || gatePost.verdict !== "pass") {
    return bindingRepairResult("fail", post.verdict !== "pass" ? post.error_code : gatePost.error_code, common);
  }
  let repairEvidence;
  try {
    repairEvidence = await readWorkspaceFile(root, repaired.evidence_path);
    if (digest(repairEvidence.bytes) !== repaired.evidence_sha256) throw new Error("ARTIFACT_INVALID");
  } catch {
    return bindingRepairResult("fail", "ARTIFACT_INVALID", common);
  }
  const verificationPath = `${path.posix.dirname(binding.overlay_path)}/derived-repair-verification.json`;
  const verification = {
    schema_version: OPENSPEC_BINDING_REPAIR_SCHEMA_VERSION,
    kind: "team_harness_openspec_binding_derived_repair_verification",
    service,
    repair_evidence_path: repaired.evidence_path,
    repair_evidence_sha256: repaired.evidence_sha256,
    approved_snapshot_sha256: binding.snapshot_sha256,
    approved_overlay_sha256: binding.overlay_sha256,
    aggregate_sha256: aggregateSha256,
    gate_identity_sha256: gate.gate_identity_sha256,
    post_validation: { overlay_and_aggregate: "pass", consolidated_gate1: "pass" },
  };
  const verificationBytes = canonicalJsonBytes(verification);
  try { await atomicWrite(path.resolve(root, verificationPath), verificationBytes); }
  catch { return bindingRepairResult("fail", "ARTIFACT_INVALID", common); }
  return bindingRepairResult("pass", null, {
    ...common,
    repair_evidence_path: repaired.evidence_path,
    repair_evidence_sha256: repaired.evidence_sha256,
    verification_path: verificationPath,
    verification_sha256: digest(verificationBytes),
  });
}

/** Serialize repair against the permanent pre-dispatch seal to close the repair/dispatch TOCTOU window. */
export async function repairOpenSpecBindingDerivedArtifacts(options = {}) {
  const common = {
    service: SLUG.test(options.service ?? "") ? options.service : null,
    aggregate_sha256: SHA256.test(options.aggregateSha256 ?? "") ? options.aggregateSha256 : null,
    gate_identity_sha256: SHA256.test(options.gate?.gate_identity_sha256 ?? "") ? options.gate.gate_identity_sha256 : null,
  };
  let root;
  try { root = await workspaceRoot(options.workspace); }
  catch (error) { return bindingRepairResult("fail", errorCode(error, "WORKSPACE_INVALID"), common); }
  if (!SLUG.test(options.service ?? "")) return bindingRepairResult("fail", "ARGUMENT_INVALID", common);
  try { return await withDerivedSetLock(root, options.service, () => repairOpenSpecBindingDerivedArtifactsUnlocked(options)); }
  catch (error) { return bindingRepairResult("fail", errorCode(error, "ARTIFACT_INVALID"), common); }
}

function validStandaloneGate(gate) {
  if (!exactlyKeys(gate, ["schema_version", "kind", "scope", "aggregate_sha256", "binding_services", "nonce", "gate_identity_sha256"])
    || gate.schema_version !== CONSOLIDATED_GATE1_SCHEMA_VERSION || gate.kind !== "team_harness_consolidated_gate1"
    || gate.scope !== "initiative" || !SHA256.test(gate.aggregate_sha256 ?? "") || !safeString(gate.nonce, 256)
    || !Array.isArray(gate.binding_services) || gate.binding_services.length === 0
    || new Set(gate.binding_services).size !== gate.binding_services.length || !gate.binding_services.every(service => SLUG.test(service))) return false;
  const identity = { scope: gate.scope, aggregate_sha256: gate.aggregate_sha256, binding_services: gate.binding_services, nonce: gate.nonce };
  return gate.gate_identity_sha256 === digest(canonicalJsonBytes(identity));
}

function normalizedLegacyTaskPrefix(text) {
  const marker = "\n## Team Harness Execution Contract\n";
  const first = text.indexOf(marker);
  if (first < 0 || text.indexOf(marker, first + marker.length) >= 0) return null;
  return text.slice(0, first).replaceAll("\r\n", "\n")
    .replace(/^- \[[ xX]\] (\d+\.\d+) /gm, "- [ ] $1 ");
}

function parseEvents(bytes) {
  const lines = bytes.toString("utf8").split("\n");
  const events = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() === "") continue;
    let value;
    try { value = JSON.parse(lines[index]); } catch { throw new Error("LEGACY_GATE_MIGRATION_INVALID"); }
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("LEGACY_GATE_MIGRATION_INVALID");
    events.push({ line: index + 1, sha256: digest(Buffer.from(lines[index], "utf8")), value });
  }
  return events;
}

function oneEvent(events, predicate) {
  const matches = events.filter(event => predicate(event.value));
  return matches.length === 1 ? matches[0] : null;
}

function timelineEntry(event) {
  return event === null ? null : { line: event.line, sha256: event.sha256 };
}

function legacyMigrationResult(operation, verdict, errorCodeValue, details = {}) {
  return {
    schema_version: LEGACY_V1_GATE_MIGRATION_SCHEMA_VERSION,
    kind: "team_harness_legacy_v1_gate_migration_action",
    operation,
    verdict,
    error_code: errorCodeValue,
    changed: details.changed ?? false,
    certificate_path: details.certificate_path ?? null,
    certificate_sha256: details.certificate_sha256 ?? null,
    continuation_identity_sha256: details.continuation_identity_sha256 ?? null,
    original_gate_identity_sha256: details.original_gate_identity_sha256 ?? null,
    original_aggregate_sha256: details.original_aggregate_sha256 ?? null,
    current_aggregate_sha256: details.current_aggregate_sha256 ?? null,
  };
}

export function verifyLegacyV1GateMigration({ certificate, gate, manifest, aggregateSha256 } = {}) {
  if (!exactlyKeys(certificate, [
    "schema_version", "kind", "migration_class", "feature", "incident_id", "original_gate", "repair_evidence",
    "current_aggregate", "binding_services", "normative_task_prefixes", "timeline", "continuation_identity_sha256",
  ]) || certificate.schema_version !== LEGACY_V1_GATE_MIGRATION_SCHEMA_VERSION
    || certificate.kind !== "team_harness_legacy_v1_gate_migration"
    || certificate.migration_class !== "approved-placeholder-overlay"
    || !safeString(certificate.feature, 256) || !safeString(certificate.incident_id, 256)
    || !validStandaloneGate(gate) || !isOpenSpecBindingsManifest(manifest)
    || !SHA256.test(aggregateSha256 ?? "") || !SHA256.test(certificate.continuation_identity_sha256 ?? "")
    || !exactlyKeys(certificate.original_gate, ["path", "sha256", "gate_identity_sha256", "aggregate_sha256"])
    || !safeRelative(certificate.original_gate.path) || !SHA256.test(certificate.original_gate.sha256 ?? "")
    || certificate.original_gate.gate_identity_sha256 !== gate.gate_identity_sha256
    || certificate.original_gate.aggregate_sha256 !== gate.aggregate_sha256
    || !exactlyKeys(certificate.repair_evidence, ["path", "sha256"])
    || !safeRelative(certificate.repair_evidence.path) || !SHA256.test(certificate.repair_evidence.sha256 ?? "")
    || !exactlyKeys(certificate.current_aggregate, ["path", "sha256"])
    || !safeRelative(certificate.current_aggregate.path) || !SHA256.test(certificate.current_aggregate.sha256 ?? "")
    || certificate.current_aggregate.sha256 !== aggregateSha256
    || !Array.isArray(certificate.binding_services)
    || JSON.stringify(certificate.binding_services) !== JSON.stringify(gate.binding_services)
    || JSON.stringify(certificate.binding_services) !== JSON.stringify(manifest.execution_order)
    || !Array.isArray(certificate.normative_task_prefixes)
    || certificate.normative_task_prefixes.length !== manifest.bindings.length
    || certificate.normative_task_prefixes.some(prefix => !exactlyKeys(prefix, ["service", "approved_sha256", "current_sha256"])
      || !SLUG.test(prefix.service ?? "") || !SHA256.test(prefix.approved_sha256 ?? "")
      || prefix.current_sha256 !== prefix.approved_sha256)
    || !exactlyKeys(certificate.timeline, ["gate_release", "operator_decision", "incident_report", "repair_success", "first_dispatch"])
    || !exactlyKeys(certificate.timeline.operator_decision, ["line", "sha256"])
    || !Number.isInteger(certificate.timeline.operator_decision.line) || certificate.timeline.operator_decision.line < 1
    || !SHA256.test(certificate.timeline.operator_decision.sha256 ?? "")) {
    return { verdict: "fail", error_code: "LEGACY_GATE_MIGRATION_INVALID" };
  }
  const continuation = {
    original_gate_identity_sha256: certificate.original_gate.gate_identity_sha256,
    original_aggregate_sha256: certificate.original_gate.aggregate_sha256,
    repair_evidence_sha256: certificate.repair_evidence.sha256,
    current_aggregate_sha256: certificate.current_aggregate.sha256,
    binding_services: certificate.binding_services,
    authority_event_sha256: certificate.timeline.operator_decision.sha256,
  };
  return certificate.continuation_identity_sha256 === digest(canonicalJsonBytes(continuation))
    ? { verdict: "pass", error_code: null }
    : { verdict: "fail", error_code: "LEGACY_GATE_MIGRATION_INVALID" };
}

/** Verify current bindings without treating already-recorded task checkbox progress as Gate drift. */
export async function verifyLegacyV1CurrentBindings({
  root,
  manifest,
  repositoryIdentityReader = readRepositoryIdentity,
  snapshotVerifier = verifySnapshot,
  overlayValidator = validateOpenSpecOverlay,
} = {}) {
  if (!safeString(root) || !path.isAbsolute(root) || !isOpenSpecBindingsManifest(manifest)) {
    return { verdict: "fail", error_code: "LEGACY_GATE_MIGRATION_INVALID", failed_binding: null };
  }
  for (const binding of manifest.bindings) {
    try {
      if (await repositoryIdentityReader(binding.repository_root) !== binding.repository_identity) {
        throw new Error("REPOSITORY_IDENTITY_MISMATCH");
      }
      const snapshotFile = await readWorkspaceFile(root, binding.snapshot_path);
      const overlayFile = await readWorkspaceFile(root, binding.overlay_path);
      if (digest(snapshotFile.bytes) !== binding.snapshot_sha256 || digest(overlayFile.bytes) !== binding.overlay_sha256) {
        throw new Error("BINDING_STALE");
      }
      const snapshot = JSON.parse(snapshotFile.bytes.toString("utf8"));
      if (!isOpenSpecSnapshot(snapshot)) throw new Error("SNAPSHOT_INVALID");
      const taskArtifact = snapshot.artifacts.find(artifact => artifact.artifact_id === "tasks");
      if (!taskArtifact) throw new Error("SNAPSHOT_INVALID");
      const taskFile = await readRepositoryFile(binding.repository_root, taskArtifact.path);
      let phase = "pre-gate1";
      let authorizedTaskIds = [];
      if (digest(taskFile.bytes) !== taskArtifact.content_sha256) {
        const progressFile = await readWorkspaceFile(root, `${path.posix.dirname(binding.snapshot_path)}/openspec-progress.json`);
        const progress = JSON.parse(progressFile.bytes.toString("utf8"));
        const latest = progress.events?.at(-1);
        if (!isOpenSpecProgress(progress, snapshot) || !latest || !Array.isArray(latest.task_ids) || latest.task_ids.length === 0) {
          throw new Error("TASK_PROGRESS_INVALID");
        }
        phase = "implementation";
        authorizedTaskIds = latest.task_ids;
      }
      const verified = await snapshotVerifier({ snapshotPath: snapshotFile.path, phase, authorizedTaskIds });
      if (verified?.verdict !== "pass") throw new Error(verified?.error_code ?? "SNAPSHOT_INVALID");
      const overlay = await overlayValidator({
        workspace: root,
        snapshot: binding.snapshot_path,
        traceability: binding.overlay_path,
        writableRoots: [binding.repository_root, root],
      });
      if (overlay?.verdict !== "pass") throw new Error(overlay?.error_code ?? "OVERLAY_INVALID");
    } catch (error) {
      return {
        verdict: "fail",
        error_code: errorCode(error, "LEGACY_GATE_MIGRATION_INVALID"),
        failed_binding: binding.service,
      };
    }
  }
  return { verdict: "pass", error_code: null, failed_binding: null };
}

/** Adopt or verify a live-operator-authorized repair of an already approved v1 placeholder overlay. */
export async function migrateLegacyV1ApprovedPlaceholderWorkspace({
  workspace,
  aggregatePath = "inputs/openspec-bindings.json",
  gatePath = "inputs/gate1-binding.json",
  repairEvidencePath = "evidence/plan-contract-auto-repair.json",
  eventsPath = "00-execution-events.jsonl",
  target = "inputs/gate1-v1-migration.json",
  incidentId,
  mode = "dry-run",
  repositoryIdentityReader = readRepositoryIdentity,
  snapshotVerifier = verifySnapshot,
  overlayValidator = validateOpenSpecOverlay,
  currentBindingsVerifier = verifyLegacyV1CurrentBindings,
} = {}) {
  const operation = mode === "verify" ? "verify-v1-migration" : "migrate-v1";
  if (!safeString(incidentId, 256) || !["dry-run", "apply", "verify"].includes(mode)
    || !safeRelative(aggregatePath) || !safeRelative(gatePath) || !safeRelative(repairEvidencePath)
    || !safeRelative(eventsPath) || !safeRelative(target)) {
    return legacyMigrationResult(operation, "fail", "ARGUMENT_INVALID");
  }
  let root;
  let aggregateFile;
  let gateFile;
  let evidenceFile;
  let eventsFile;
  let manifest;
  let gate;
  let evidence;
  try {
    root = await workspaceRoot(workspace);
    [aggregateFile, gateFile, evidenceFile, eventsFile] = await Promise.all([
      readWorkspaceFile(root, aggregatePath),
      readWorkspaceFile(root, gatePath),
      readWorkspaceFile(root, repairEvidencePath),
      readWorkspaceFile(root, eventsPath),
    ]);
    manifest = JSON.parse(aggregateFile.bytes.toString("utf8"));
    gate = JSON.parse(gateFile.bytes.toString("utf8"));
    evidence = JSON.parse(evidenceFile.bytes.toString("utf8"));
    if (!isOpenSpecBindingsManifest(manifest) || !canonicalJsonBytes(manifest).equals(aggregateFile.bytes)
      || !validStandaloneGate(gate) || !evidence || typeof evidence !== "object" || Array.isArray(evidence)
      || evidence.schema_version !== 1 || evidence.kind !== "team_harness_openspec_derived_contract_repair"
      || evidence.verdict !== "pass" || evidence.authority !== "operator-live"
      || evidence.finding_id !== "IMPLEMENTATION-PACKET-PLACEHOLDER"
      || evidence.gate1?.decision !== "approved" || evidence.gate1?.preserved !== true
      || evidence.gate1?.approved_aggregate_sha256 !== gate.aggregate_sha256 || evidence.gate1?.nonce !== gate.nonce
      || evidence.before?.aggregate_sha256 !== gate.aggregate_sha256
      || evidence.after?.aggregate_sha256 !== digest(aggregateFile.bytes)
      || JSON.stringify(gate.binding_services) !== JSON.stringify(manifest.execution_order)) {
      throw new Error("LEGACY_GATE_MIGRATION_INVALID");
    }
  } catch {
    return legacyMigrationResult(operation, "fail", "LEGACY_GATE_MIGRATION_INVALID");
  }

  const events = (() => { try { return parseEvents(eventsFile.bytes); } catch { return null; } })();
  if (events === null) return legacyMigrationResult(operation, "fail", "LEGACY_GATE_MIGRATION_INVALID");
  const feature = events.find(event => safeString(event.value?.feature, 256))?.value.feature ?? null;
  const release = oneEvent(events, value => value.event === "stage.gate.release" && value.stage === 1 && value.gate === "gate1"
    && value.decision === "approved" && value.origin === "operator-live" && value.nonce === gate.nonce
    && value.aggregate_sha256 === gate.aggregate_sha256 && value.gate_identity_sha256 === gate.gate_identity_sha256
    && JSON.stringify(value.binding_services) === JSON.stringify(gate.binding_services));
  const decision = oneEvent(events, value => value.event === "operator.decision" && value.decision === "auto-repair-derived-plan-contract"
    && value.authority === "operator-live" && value.finding_id === "IMPLEMENTATION-PACKET-PLACEHOLDER");
  const report = oneEvent(events, value => value.event === "operation.success" && value.operation === "herdr-report-fixes"
    && value.message_id === incidentId);
  const repaired = oneEvent(events, value => value.event === "operation.success" && value.operation === "derived-plan-contract-auto-repair"
    && value.finding_id === "IMPLEMENTATION-PACKET-PLACEHOLDER" && value.before_aggregate_sha256 === gate.aggregate_sha256
    && value.after_aggregate_sha256 === digest(aggregateFile.bytes) && value.repair_evidence_path === repairEvidencePath
    && value.repair_evidence_sha256 === digest(evidenceFile.bytes) && value.gate1_preserved === true);
  const implementationRoles = new Set(["implementer", "tester", "cleaner", "qa", "security", "delivery"]);
  const firstDispatch = events.find(event => event.value.event === "agent.spawn"
    && gate.binding_services.includes(event.value.service) && implementationRoles.has(event.value.agent_role)) ?? null;
  if (!safeString(feature, 256) || release === null || decision === null || report === null || repaired === null
    || !(release.line < decision.line && decision.line <= report.line && report.line < repaired.line)
    || (firstDispatch !== null && repaired.line >= firstDispatch.line)) {
    return legacyMigrationResult(operation, "fail", "LEGACY_GATE_MIGRATION_INVALID");
  }

  const proofByService = new Map((evidence.normative_task_prefix_proof ?? []).map(proof => [proof?.service, proof]));
  const afterByService = new Map((evidence.after?.services ?? []).map(binding => [binding?.service, binding]));
  const beforeByService = new Map((evidence.before?.services ?? []).map(binding => [binding?.service, binding]));
  const prefixes = [];
  try {
    if (proofByService.size !== manifest.bindings.length || afterByService.size !== manifest.bindings.length
      || beforeByService.size !== manifest.bindings.length) throw new Error("LEGACY_GATE_MIGRATION_INVALID");
    for (const binding of manifest.bindings) {
      const proof = proofByService.get(binding.service);
      const after = afterByService.get(binding.service);
      const before = beforeByService.get(binding.service);
      if (!proof || proof.identical !== true || !SHA256.test(proof.approved_task_intent_sha256 ?? "")
        || proof.current_normative_prefix_sha256 !== proof.approved_task_intent_sha256
        || !before || !SHA256.test(before.snapshot_sha256 ?? "") || !SHA256.test(before.overlay_sha256 ?? "")
        || !after || after.snapshot_sha256 !== binding.snapshot_sha256 || after.overlay_sha256 !== binding.overlay_sha256) {
        throw new Error("LEGACY_GATE_MIGRATION_INVALID");
      }
      const snapshot = JSON.parse((await readWorkspaceFile(root, binding.snapshot_path)).bytes.toString("utf8"));
      if (!isOpenSpecSnapshot(snapshot) || path.resolve(snapshot.repository.root) !== path.resolve(binding.repository_root)) {
        throw new Error("LEGACY_GATE_MIGRATION_INVALID");
      }
      const taskArtifact = snapshot.artifacts.find(artifact => artifact.artifact_id === "tasks");
      if (!taskArtifact) throw new Error("LEGACY_GATE_MIGRATION_INVALID");
      const taskFile = await readRepositoryFile(binding.repository_root, taskArtifact.path);
      const prefix = normalizedLegacyTaskPrefix(taskFile.bytes.toString("utf8"));
      const prefixSha256 = prefix === null ? null : digest(Buffer.from(prefix, "utf8"));
      if (prefixSha256 !== proof.approved_task_intent_sha256) throw new Error("LEGACY_GATE_MIGRATION_INVALID");
      prefixes.push({ service: binding.service, approved_sha256: proof.approved_task_intent_sha256, current_sha256: prefixSha256 });
    }
  } catch {
    return legacyMigrationResult(operation, "fail", "LEGACY_GATE_MIGRATION_INVALID");
  }

  const currentAggregateSha256 = digest(aggregateFile.bytes);
  const currentValidation = await currentBindingsVerifier({
    root,
    manifest,
    repositoryIdentityReader,
    snapshotVerifier,
    overlayValidator,
  });
  if (currentValidation.verdict !== "pass") {
    return legacyMigrationResult(operation, "fail", "LEGACY_GATE_MIGRATION_INVALID");
  }
  const continuation = {
    original_gate_identity_sha256: gate.gate_identity_sha256,
    original_aggregate_sha256: gate.aggregate_sha256,
    repair_evidence_sha256: digest(evidenceFile.bytes),
    current_aggregate_sha256: currentAggregateSha256,
    binding_services: gate.binding_services,
    authority_event_sha256: decision.sha256,
  };
  const certificate = {
    schema_version: LEGACY_V1_GATE_MIGRATION_SCHEMA_VERSION,
    kind: "team_harness_legacy_v1_gate_migration",
    migration_class: "approved-placeholder-overlay",
    feature,
    incident_id: incidentId,
    original_gate: { path: gatePath, sha256: digest(gateFile.bytes), gate_identity_sha256: gate.gate_identity_sha256, aggregate_sha256: gate.aggregate_sha256 },
    repair_evidence: { path: repairEvidencePath, sha256: digest(evidenceFile.bytes) },
    current_aggregate: { path: aggregatePath, sha256: currentAggregateSha256 },
    binding_services: gate.binding_services,
    normative_task_prefixes: prefixes,
    timeline: {
      gate_release: timelineEntry(release),
      operator_decision: timelineEntry(decision),
      incident_report: timelineEntry(report),
      repair_success: timelineEntry(repaired),
      first_dispatch: timelineEntry(firstDispatch),
    },
    continuation_identity_sha256: digest(canonicalJsonBytes(continuation)),
  };
  if (verifyLegacyV1GateMigration({ certificate, gate, manifest, aggregateSha256: currentAggregateSha256 }).verdict !== "pass") {
    return legacyMigrationResult(operation, "fail", "LEGACY_GATE_MIGRATION_INVALID");
  }
  const certificateBytes = canonicalJsonBytes(certificate);
  let existing = null;
  try { existing = await readWorkspaceFile(root, target); } catch (error) { if (error.message !== "ARTIFACT_INVALID" && error.code !== "ENOENT") return legacyMigrationResult(operation, "fail", "ARTIFACT_INVALID"); }
  if (mode === "verify") {
    if (existing === null || !existing.bytes.equals(certificateBytes)) return legacyMigrationResult(operation, "fail", "LEGACY_GATE_MIGRATION_INVALID");
  } else if (mode === "apply" && existing === null) {
    try { await atomicWrite(path.resolve(root, target), certificateBytes); }
    catch { return legacyMigrationResult(operation, "fail", "ARTIFACT_INVALID"); }
  } else if (mode === "apply" && !existing.bytes.equals(certificateBytes)) {
    return legacyMigrationResult(operation, "fail", "LEGACY_GATE_MIGRATION_INVALID");
  }
  return legacyMigrationResult(operation, "pass", null, {
    changed: mode === "apply" && existing === null,
    certificate_path: target,
    certificate_sha256: digest(certificateBytes),
    continuation_identity_sha256: certificate.continuation_identity_sha256,
    original_gate_identity_sha256: gate.gate_identity_sha256,
    original_aggregate_sha256: gate.aggregate_sha256,
    current_aggregate_sha256: currentAggregateSha256,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [operation, raw] = process.argv.slice(2);
  if (!["repair-derived", "seal-dispatch", "verify-dispatch", "migrate-v1", "verify-v1-migration"].includes(operation) || !safeString(raw, MAX_BYTES)) {
    process.stderr.write("openspec-bindings.mjs accepts repair-derived, seal-dispatch, verify-dispatch, migrate-v1, or verify-v1-migration with one bounded JSON argument; other operations are library helpers.\n");
    process.exitCode = 2;
  } else {
    let options;
    try { options = JSON.parse(raw); }
    catch { options = {}; }
    const output = operation === "repair-derived" ? await repairOpenSpecBindingDerivedArtifacts(options)
      : operation === "seal-dispatch" ? await sealOpenSpecBindingDispatch(options)
        : operation === "verify-dispatch" ? await verifyOpenSpecBindingDispatch(options)
          : await migrateLegacyV1ApprovedPlaceholderWorkspace({
        ...options,
        mode: operation === "verify-v1-migration" ? "verify" : options.mode,
      });
    process.stdout.write(`${JSON.stringify(output)}\n`);
    if (output.verdict !== "pass") process.exitCode = 1;
  }
}
