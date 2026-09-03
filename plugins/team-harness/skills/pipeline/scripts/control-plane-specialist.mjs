#!/usr/bin/env node
/** Non-authoritative v5 primitives safe to freeze inside specialist capsules. */

import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";

export const CONTROL_PLANE_SCHEMA_VERSION = 5;
export const MAX_CONTROL_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_ARRAY_ITEMS = 128;
export const MAX_DIAGNOSTIC_BYTES = 4096;

const SHA256 = /^[a-f0-9]{64}$/;
const GIT_COMMIT = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const SECRET = /(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]\s*[^\s,;]{8,}|\b(?:ghp|github_pat|sk-[A-Za-z0-9])[_A-Za-z0-9-]{16,})/i;
const LEASE_STATES = new Set(["active", "revoked", "closed"]);
const RESULT_STATUSES = new Set(["progress", "completed", "blocked", "failed"]);
const FINDING_CLASSES = new Set(["acceptance", "correctness", "quality", "security", "scope"]);
const FINDING_SEVERITIES = new Set(["info", "low", "medium", "high", "critical"]);
const FINDING_STATES = new Set(["open", "resolved", "accepted"]);
const LEASE_KEYS = [
  "schema_version", "kind", "lease_id", "role", "authority_event_id", "intent_identity",
  "scope_identity", "security_identity", "worktree", "writable_paths", "immutable_inputs",
  "baseline_commit", "context_identity", "lifecycle",
];
const LEASE_CREATE_KEYS = LEASE_KEYS.filter(key => key !== "lease_id");
const RESULT_KEYS = [
  "schema_version", "kind", "result_id", "lease_id", "status", "changed_paths",
  "evidence_paths", "artifacts", "commits", "findings", "closure_evidence",
  "diagnostics", "next_prerequisites", "observed_control_sequence", "context_identity",
];
const RESULT_CREATE_KEYS = RESULT_KEYS.filter(key => key !== "result_id");
const CAPSULE_KEYS = ["schema_version", "kind", "capability_lease", "objective", "helper_bundle"];

function exactKeys(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

export function canonicalControlBytes(value) {
  return Buffer.from(`${JSON.stringify(canonical(value))}\n`, "utf8");
}

export function controlIdentity(value) {
  return createHash("sha256").update(canonicalControlBytes(value)).digest("hex");
}

function boundedString(value, maximum = 1024, { empty = false } = {}) {
  return typeof value === "string" && !value.includes("\0") && (empty || value.length > 0)
    && Buffer.byteLength(value, "utf8") <= maximum && !SECRET.test(value);
}

function safeRelative(value) {
  if (!boundedString(value, 512) || path.isAbsolute(value)) return false;
  const normalized = value.replaceAll("\\", "/");
  return normalized !== "." && !normalized.startsWith("/")
    && !normalized.split("/").some(part => part === "" || part === "." || part === "..");
}

function boundedArray(value, validator, maximum = MAX_ARRAY_ITEMS) {
  return Array.isArray(value) && value.length <= maximum && value.every(validator);
}

function validReference(value) {
  return exactKeys(value, ["path", "sha256"]) && safeRelative(value.path) && SHA256.test(value.sha256 ?? "");
}

function validFinding(value) {
  return exactKeys(value, ["id", "class", "severity", "state", "summary", "evidence_paths"])
    && SAFE_ID.test(value.id ?? "") && FINDING_CLASSES.has(value.class)
    && FINDING_SEVERITIES.has(value.severity) && FINDING_STATES.has(value.state)
    && boundedString(value.summary, 512) && boundedArray(value.evidence_paths, safeRelative, 32);
}

async function canonicalDirectory(value, code) {
  if (typeof value !== "string" || !path.isAbsolute(value) || path.resolve(value) !== value) throw new Error(code);
  const resolved = await realpath(value);
  const stat = await lstat(value);
  if (resolved !== value || !stat.isDirectory() || stat.isSymbolicLink()) throw new Error(code);
  return resolved;
}

async function pathContainedWithoutSymlink(root, relative, { allowMissing = true } = {}) {
  if (!safeRelative(relative)) return false;
  let current = root;
  for (const part of relative.replaceAll("\\", "/").split("/")) {
    current = path.join(current, part);
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink()) return false;
      const resolved = await realpath(current);
      const relation = path.relative(root, resolved);
      if (relation === ".." || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation)) return false;
    } catch (error) {
      if (error?.code !== "ENOENT" || !allowMissing) return false;
      break;
    }
  }
  return true;
}

function leaseBodyValid(value, keys) {
  return exactKeys(value, keys) && value.schema_version === CONTROL_PLANE_SCHEMA_VERSION
    && value.kind === "capability_lease" && SAFE_ID.test(value.role ?? "")
    && SHA256.test(value.authority_event_id ?? "") && SHA256.test(value.intent_identity ?? "")
    && SHA256.test(value.scope_identity ?? "") && SHA256.test(value.security_identity ?? "")
    && typeof value.worktree === "string" && path.isAbsolute(value.worktree)
    && boundedArray(value.writable_paths, safeRelative) && new Set(value.writable_paths).size === value.writable_paths.length
    && boundedArray(value.immutable_inputs, validReference)
    && new Set(value.immutable_inputs.map(item => item.path)).size === value.immutable_inputs.length
    && GIT_COMMIT.test(value.baseline_commit ?? "")
    && SHA256.test(value.context_identity ?? "") && LEASE_STATES.has(value.lifecycle);
}

export async function validateCapabilityLease(value, { requireActive = false } = {}) {
  try {
    if (!leaseBodyValid(value, LEASE_KEYS) || !SHA256.test(value.lease_id ?? "")) throw new Error("LEASE_SCHEMA_INVALID");
    const { lease_id: leaseId, ...body } = value;
    if (controlIdentity(body) !== leaseId) throw new Error("LEASE_IDENTITY_MISMATCH");
    if (requireActive && value.lifecycle !== "active") throw new Error("LEASE_NOT_ACTIVE");
    const worktree = await canonicalDirectory(value.worktree, "LEASE_WORKTREE_INVALID");
    for (const relative of value.writable_paths) {
      if (!await pathContainedWithoutSymlink(worktree, relative)) throw new Error("LEASE_PATH_INVALID");
    }
    for (const reference of value.immutable_inputs) {
      if (!await pathContainedWithoutSymlink(worktree, reference.path, { allowMissing: false })) throw new Error("LEASE_PATH_INVALID");
      const stat = await lstat(path.join(worktree, reference.path));
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("LEASE_PATH_INVALID");
      const bytes = await readFile(path.join(worktree, reference.path));
      if (createHash("sha256").update(bytes).digest("hex") !== reference.sha256) {
        throw new Error("LEASE_INPUT_MISMATCH");
      }
    }
    return { ok: true, value: canonical(value), error_code: null };
  } catch (error) {
    const known = new Set([
      "LEASE_SCHEMA_INVALID", "LEASE_IDENTITY_MISMATCH", "LEASE_NOT_ACTIVE",
      "LEASE_WORKTREE_INVALID", "LEASE_PATH_INVALID", "LEASE_INPUT_MISMATCH",
    ]);
    return { ok: false, value: null, error_code: known.has(error?.message) ? error.message : "LEASE_SCHEMA_INVALID" };
  }
}

function resultBodyValid(value, keys, { unique_findings: uniqueFindings = true } = {}) {
  return exactKeys(value, keys) && value.schema_version === CONTROL_PLANE_SCHEMA_VERSION
    && value.kind === "result_envelope" && SHA256.test(value.lease_id ?? "")
    && RESULT_STATUSES.has(value.status)
    && boundedArray(value.changed_paths, safeRelative) && new Set(value.changed_paths).size === value.changed_paths.length
    && boundedArray(value.evidence_paths, safeRelative) && new Set(value.evidence_paths).size === value.evidence_paths.length
    && boundedArray(value.artifacts, validReference)
    && boundedArray(value.commits, item => GIT_COMMIT.test(item), 32)
    && boundedArray(value.findings, validFinding, 64)
    && (!uniqueFindings || new Set(value.findings.map(item => item.id)).size === value.findings.length)
    && boundedArray(value.closure_evidence, validReference, 64)
    && boundedArray(value.diagnostics, item => boundedString(item, MAX_DIAGNOSTIC_BYTES, { empty: true }), 32)
    && boundedArray(value.next_prerequisites, item => boundedString(item, 512), 32)
    && Number.isSafeInteger(value.observed_control_sequence) && value.observed_control_sequence >= 0
    && SHA256.test(value.context_identity ?? "");
}

export async function validateResultEnvelope(value, { lease, currentSequence } = {}) {
  try {
    if (!resultBodyValid(value, RESULT_KEYS) || !SHA256.test(value.result_id ?? "")) throw new Error("RESULT_SCHEMA_INVALID");
    const { result_id: resultId, ...body } = value;
    if (controlIdentity(body) !== resultId) throw new Error("RESULT_IDENTITY_MISMATCH");
    const leaseResult = await validateCapabilityLease(lease, { requireActive: true });
    if (!leaseResult.ok || value.lease_id !== lease.lease_id || value.context_identity !== lease.context_identity) {
      throw new Error("RESULT_PROVENANCE_MISMATCH");
    }
    if (value.observed_control_sequence !== currentSequence) throw new Error("RESULT_SEQUENCE_STALE");
    for (const relative of [...value.changed_paths, ...value.evidence_paths, ...value.artifacts.map(item => item.path), ...value.closure_evidence.map(item => item.path)]) {
      if (!await pathContainedWithoutSymlink(lease.worktree, relative)) throw new Error("RESULT_PATH_INVALID");
    }
    for (const reference of [...value.artifacts, ...value.closure_evidence]) {
      if (!await pathContainedWithoutSymlink(lease.worktree, reference.path, { allowMissing: false })) throw new Error("RESULT_PATH_INVALID");
      const bytes = await readFile(path.join(lease.worktree, reference.path));
      if (createHash("sha256").update(bytes).digest("hex") !== reference.sha256) throw new Error("RESULT_ARTIFACT_MISMATCH");
    }
    const allowed = lease.writable_paths;
    if (!value.changed_paths.every(candidate => allowed.some(prefix => candidate === prefix || candidate.startsWith(`${prefix}/`)))) {
      throw new Error("RESULT_SCOPE_VIOLATION");
    }
    return { ok: true, value: canonical(value), error_code: null };
  } catch (error) {
    const known = new Set([
      "RESULT_SCHEMA_INVALID", "RESULT_IDENTITY_MISMATCH", "RESULT_PROVENANCE_MISMATCH",
      "RESULT_SEQUENCE_STALE", "RESULT_PATH_INVALID", "RESULT_SCOPE_VIOLATION", "RESULT_ARTIFACT_MISMATCH",
    ]);
    return { ok: false, value: null, error_code: known.has(error?.message) ? error.message : "RESULT_SCHEMA_INVALID" };
  }
}

export async function createResultEnvelope(input, options) {
  if (!resultBodyValid(input, RESULT_CREATE_KEYS)) return { ok: false, value: null, error_code: "RESULT_SCHEMA_INVALID" };
  return validateResultEnvelope({ ...input, result_id: controlIdentity(input) }, options);
}

export async function verifyCapabilityCapsule({ workspace, reference }) {
  try {
    const root = await canonicalDirectory(workspace, "WORKSPACE_INVALID");
    if (!exactKeys(reference, ["path", "sha256"]) || !safeRelative(reference.path)
      || !SHA256.test(reference.sha256 ?? "")) throw new Error();
    const target = path.join(root, reference.path);
    if (!await pathContainedWithoutSymlink(root, reference.path, { allowMissing: false })) throw new Error();
    const bytes = await readFile(target);
    if (createHash("sha256").update(bytes).digest("hex") !== reference.sha256) throw new Error();
    const capsule = JSON.parse(bytes.toString("utf8"));
    if (!exactKeys(capsule, CAPSULE_KEYS) || capsule.schema_version !== CONTROL_PLANE_SCHEMA_VERSION
      || capsule.kind !== "team_harness_capability_capsule" || !canonicalControlBytes(capsule).equals(bytes)
      || !(await validateCapabilityLease(capsule.capability_lease, { requireActive: true })).ok) throw new Error();
    return { ok: true, capsule, error_code: null };
  } catch {
    return { ok: false, capsule: null, error_code: "CAPSULE_INVALID" };
  }
}

export const controlPlaneSpecialistInternals = Object.freeze({
  SHA256, GIT_COMMIT, SAFE_ID, SECRET, LEASE_KEYS, LEASE_CREATE_KEYS, RESULT_KEYS, RESULT_CREATE_KEYS,
  exactKeys, canonical, boundedString, safeRelative, boundedArray, validReference,
  canonicalDirectory, pathContainedWithoutSymlink, leaseBodyValid, resultBodyValid,
});
