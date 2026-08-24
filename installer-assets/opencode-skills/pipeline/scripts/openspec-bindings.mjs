#!/usr/bin/env node
/** Compose and verify service-owned OpenSpec bindings for one coordinator workspace. */

import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { runBoundedCommand } from "./bounded-command.mjs";
import { validateOpenSpecOverlay } from "./openspec-overlay.mjs";
import { isOpenSpecSnapshot, verifySnapshot } from "./openspec-snapshot.mjs";

export const OPENSPEC_BINDINGS_SCHEMA_VERSION = 1;
export const CONSOLIDATED_GATE1_SCHEMA_VERSION = 1;
const MAX_BYTES = 1024 * 1024;
const SHA256 = /^[a-f0-9]{64}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ERROR_CODES = new Set([
  "WORKSPACE_INVALID", "ARTIFACT_INVALID", "ARGUMENT_INVALID", "BINDING_INVALID", "BINDING_STALE",
  "AGGREGATE_STALE", "AGGREGATE_INVALID", "OVERLAY_INVALID", "REPOSITORY_IDENTITY_MISMATCH",
  "REPOSITORY_IDENTITY_UNREADABLE", "SNAPSHOT_INVALID", "SOURCE_CHANGED", "TASK_INTENT_CHANGED",
  "TASK_PROGRESS_INVALID", "PROGRESS_INVALID", "ATOMIC_TRANSITION_REQUIRED",
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
      const verified = await snapshotVerifier({
        snapshotPath: snapshot.path,
        phase,
        authorizedTaskIds: authorizedTasksByService[binding.service] ?? [],
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stderr.write("openspec-bindings.mjs is a library helper; Main supplies bounded binding data.\n");
  process.exitCode = 2;
}
