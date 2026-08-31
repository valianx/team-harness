#!/usr/bin/env node
/** Team Harness v5 capability, result, control-log, and projection primitives. */

import { createHash, randomUUID } from "node:crypto";
import {
  lstat, mkdir, open, readFile, realpath, rename, rm, unlink, writeFile,
} from "node:fs/promises";
import path from "node:path";

export const CONTROL_PLANE_SCHEMA_VERSION = 5;
export const MAX_CONTROL_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_ARRAY_ITEMS = 128;
export const MAX_DIAGNOSTIC_BYTES = 4096;

const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const SECRET = /(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]\s*[^\s,;]{8,}|\b(?:ghp|github_pat|sk-[A-Za-z0-9])[_A-Za-z0-9-]{16,})/i;
const LEASE_STATES = new Set(["active", "revoked", "closed"]);
const RESULT_STATUSES = new Set(["progress", "completed", "blocked", "failed"]);
const FINDING_CLASSES = new Set(["acceptance", "correctness", "quality", "security", "scope"]);
const FINDING_SEVERITIES = new Set(["info", "low", "medium", "high", "critical"]);
const FINDING_STATES = new Set(["open", "resolved", "accepted"]);
const EVENT_TYPES = new Set([
  "operator_authority", "lease_issued", "lease_revoked", "lease_closed",
  "result_accepted", "transition", "mechanical_release",
]);

const LEASE_KEYS = [
  "schema_version", "kind", "lease_id", "role", "authority_event_id", "intent_identity",
  "scope_identity", "security_identity", "worktree", "writable_paths", "immutable_inputs",
  "context_identity", "lifecycle",
];
const LEASE_CREATE_KEYS = LEASE_KEYS.filter(key => key !== "lease_id");
const RESULT_KEYS = [
  "schema_version", "kind", "result_id", "lease_id", "status", "changed_paths",
  "evidence_paths", "artifacts", "commits", "findings", "closure_evidence",
  "diagnostics", "next_prerequisites", "observed_control_sequence", "context_identity",
];
const RESULT_CREATE_KEYS = RESULT_KEYS.filter(key => key !== "result_id");
const RECORD_KEYS = [
  "schema_version", "kind", "event_id", "sequence", "previous_hash", "type", "provenance", "payload",
];
const RECORD_CREATE_KEYS = RECORD_KEYS.filter(key => key !== "event_id");

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

export async function createCapabilityLease(input) {
  if (!leaseBodyValid(input, LEASE_CREATE_KEYS)) return { ok: false, value: null, error_code: "LEASE_SCHEMA_INVALID" };
  return validateCapabilityLease({ ...input, lease_id: controlIdentity(input) });
}

function resultBodyValid(value, keys) {
  return exactKeys(value, keys) && value.schema_version === CONTROL_PLANE_SCHEMA_VERSION
    && value.kind === "result_envelope" && SHA256.test(value.lease_id ?? "")
    && RESULT_STATUSES.has(value.status)
    && boundedArray(value.changed_paths, safeRelative) && new Set(value.changed_paths).size === value.changed_paths.length
    && boundedArray(value.evidence_paths, safeRelative) && new Set(value.evidence_paths).size === value.evidence_paths.length
    && boundedArray(value.artifacts, validReference)
    && boundedArray(value.commits, item => SHA256.test(item), 32)
    && boundedArray(value.findings, validFinding, 64)
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

function validProvenance(value) {
  return exactKeys(value, ["actor", "authority_event_id"])
    && value.actor === "main" && (value.authority_event_id === null || SHA256.test(value.authority_event_id));
}

function validPayload(type, payload) {
  if (type === "operator_authority") {
    return exactKeys(payload, ["presentation_nonce", "decision", "intent_identity", "scope_identity", "security_identity"])
      && SAFE_ID.test(payload.presentation_nonce ?? "") && ["approve", "reject", "abort"].includes(payload.decision)
      && SHA256.test(payload.intent_identity ?? "") && SHA256.test(payload.scope_identity ?? "")
      && SHA256.test(payload.security_identity ?? "");
  }
  if (type === "lease_issued") {
    return exactKeys(payload, ["lease"]) && leaseBodyValid(payload.lease, LEASE_KEYS)
      && SHA256.test(payload.lease.lease_id ?? "")
      && controlIdentity((({ lease_id: _, ...body }) => body)(payload.lease)) === payload.lease.lease_id;
  }
  if (["lease_revoked", "lease_closed"].includes(type)) {
    return exactKeys(payload, ["lease_id"]) && SHA256.test(payload.lease_id ?? "");
  }
  if (type === "result_accepted") {
    if (!exactKeys(payload, ["result"]) || !resultBodyValid(payload.result, RESULT_KEYS)
      || !SHA256.test(payload.result.result_id ?? "")) return false;
    const { result_id: resultId, ...body } = payload.result;
    return controlIdentity(body) === resultId;
  }
  if (type === "transition") {
    return exactKeys(payload, ["phase", "status"]) && SAFE_ID.test(payload.phase ?? "") && SAFE_ID.test(payload.status ?? "");
  }
  return type === "mechanical_release" && exactKeys(payload, ["name", "identity"])
    && SAFE_ID.test(payload.name ?? "") && SHA256.test(payload.identity ?? "");
}

function recordBodyValid(value, keys) {
  return exactKeys(value, keys) && value.schema_version === CONTROL_PLANE_SCHEMA_VERSION
    && value.kind === "control_event" && Number.isSafeInteger(value.sequence) && value.sequence >= 1
    && (value.previous_hash === null || SHA256.test(value.previous_hash)) && EVENT_TYPES.has(value.type)
    && validProvenance(value.provenance) && validPayload(value.type, value.payload)
    && !SECRET.test(JSON.stringify(value));
}

export function createControlRecord(input) {
  if (!recordBodyValid(input, RECORD_CREATE_KEYS)) return { ok: false, value: null, error_code: "CONTROL_RECORD_INVALID" };
  const value = { ...input, event_id: controlIdentity(input) };
  return { ok: true, value: canonical(value), error_code: null };
}

export function replayControlBytes(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? "", "utf8");
  if (buffer.length > MAX_CONTROL_FILE_BYTES) return { ok: false, records: [], sequence: 0, head: null, error_code: "CONTROL_LOG_TOO_LARGE", invalid_line: 1 };
  const lines = buffer.toString("utf8").split("\n");
  if (lines.at(-1) === "") lines.pop();
  const records = [];
  let head = null;
  for (let index = 0; index < lines.length; index += 1) {
    try {
      const value = JSON.parse(lines[index]);
      if (!recordBodyValid(value, RECORD_KEYS) || !SHA256.test(value.event_id ?? "")) throw new Error();
      const { event_id: eventId, ...body } = value;
      if (controlIdentity(body) !== eventId || value.sequence !== records.length + 1 || value.previous_hash !== head) throw new Error();
      records.push(canonical(value));
      head = eventId;
    } catch {
      return { ok: false, records, sequence: records.length, head, error_code: "CONTROL_LOG_CORRUPT", invalid_line: index + 1 };
    }
  }
  return { ok: true, records, sequence: records.length, head, error_code: null, invalid_line: null };
}

export async function replayControlLog(logPath) {
  try {
    const stat = await lstat(logPath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_CONTROL_FILE_BYTES) throw new Error("CONTROL_LOG_INVALID");
    return replayControlBytes(await readFile(logPath));
  } catch (error) {
    if (error?.code === "ENOENT") return replayControlBytes(Buffer.alloc(0));
    return { ok: false, records: [], sequence: 0, head: null, error_code: "CONTROL_LOG_INVALID", invalid_line: 1 };
  }
}

async function atomicWrite(target, bytes) {
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${randomUUID()}`;
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temporary, target);
    const directory = await open(path.dirname(target), "r");
    await directory.sync().catch(() => {});
    await directory.close();
  } finally {
    await handle?.close().catch(() => {});
    await rm(temporary, { force: true }).catch(() => {});
  }
}

export async function appendControlEvent({ log_path: logPath, type, provenance, payload, writer = "main" }) {
  if (writer !== "main" || typeof logPath !== "string" || !path.isAbsolute(logPath)) {
    return { ok: false, record: null, error_code: "CONTROL_WRITER_INVALID" };
  }
  const parent = await canonicalDirectory(path.dirname(logPath), "CONTROL_LOG_INVALID").catch(() => null);
  if (!parent) return { ok: false, record: null, error_code: "CONTROL_LOG_INVALID" };
  const lockPath = `${logPath}.lock`;
  let lock;
  try {
    lock = await open(lockPath, "wx", 0o600);
    const replay = await replayControlLog(logPath);
    if (!replay.ok) return { ok: false, record: null, error_code: replay.error_code };
    const projection = buildControlProjection(replay.records);
    const duplicate = replay.records.find(record => record.type === type
      && controlIdentity(record.payload) === controlIdentity(payload));
    if (["operator_authority", "result_accepted"].includes(type) && duplicate) {
      return { ok: true, record: duplicate, duplicate: true, error_code: null };
    }
    if (provenance?.authority_event_id !== null && !replay.records.some(record =>
      record.type === "operator_authority" && record.event_id === provenance?.authority_event_id
      && record.payload.decision === "approve")) {
      return { ok: false, record: null, error_code: "CONTROL_AUTHORITY_MISSING" };
    }
    if (type === "lease_issued") {
      const leaseValidation = await validateCapabilityLease(payload?.lease, { requireActive: true });
      if (!leaseValidation.ok) return { ok: false, record: null, error_code: leaseValidation.error_code };
      if (Object.values(projection.active_leases).some(active => active.worktree === payload.lease.worktree
        && active.lease_id !== payload.lease.lease_id)) {
        return { ok: false, record: null, error_code: "LEASE_OWNERSHIP_CONFLICT" };
      }
    }
    if (["lease_revoked", "lease_closed"].includes(type)
      && !projection.active_leases[payload?.lease_id]) {
      return { ok: false, record: null, error_code: "LEASE_NOT_ACTIVE" };
    }
    if (type === "result_accepted") {
      const lease = projection.active_leases[payload?.result?.lease_id];
      const resultValidation = await validateResultEnvelope(payload?.result, { lease, currentSequence: replay.sequence });
      if (!resultValidation.ok) return { ok: false, record: null, error_code: resultValidation.error_code };
    }
    const created = createControlRecord({
      schema_version: CONTROL_PLANE_SCHEMA_VERSION,
      kind: "control_event",
      sequence: replay.sequence + 1,
      previous_hash: replay.head,
      type,
      provenance,
      payload,
    });
    if (!created.ok) return { ok: false, record: null, error_code: created.error_code };
    const nextBytes = Buffer.concat([
      ...replay.records.map(canonicalControlBytes), canonicalControlBytes(created.value),
    ]);
    if (nextBytes.length > MAX_CONTROL_FILE_BYTES) return { ok: false, record: null, error_code: "CONTROL_LOG_TOO_LARGE" };
    await atomicWrite(logPath, nextBytes);
    return { ok: true, record: created.value, duplicate: false, error_code: null };
  } catch (error) {
    return { ok: false, record: null, error_code: error?.code === "EEXIST" ? "CONTROL_LOG_BUSY" : "CONTROL_APPEND_FAILED" };
  } finally {
    await lock?.close().catch(() => {});
    if (lock) await unlink(lockPath).catch(() => {});
  }
}

export function buildControlProjection(records) {
  const projection = {
    sequence: 0, head: null, phase: "intake", status: "active", authority: null,
    active_leases: {}, accepted_results: {}, findings: {}, releases: {},
  };
  for (const record of records) {
    projection.sequence = record.sequence;
    projection.head = record.event_id;
    if (record.type === "operator_authority") projection.authority = { event_id: record.event_id, ...record.payload };
    if (record.type === "lease_issued") projection.active_leases[record.payload.lease.lease_id] = record.payload.lease;
    if (record.type === "lease_revoked") delete projection.active_leases[record.payload.lease_id];
    if (record.type === "lease_closed") delete projection.active_leases[record.payload.lease_id];
    if (record.type === "result_accepted") {
      const result = record.payload.result;
      projection.accepted_results[result.result_id] = result;
      for (const finding of result.findings) projection.findings[finding.id] = finding;
    }
    if (record.type === "transition") ({ phase: projection.phase, status: projection.status } = record.payload);
    if (record.type === "mechanical_release") projection.releases[record.payload.name] = record.payload.identity;
  }
  return projection;
}

const RECOVERY_KEYS = [
  "authority_valid", "identities_unchanged", "context_verifiable", "ownership_safe",
  "independent_lens_changed", "progress_preserved", "prerequisite_available",
  "semantic_change", "candidate_changed", "security_impact", "failed_action_identity",
  "safe_action_identity",
];

/** Choose recovery only from causal and retained-floor evidence, never counters or time. */
export function decideCausalRecovery(input) {
  if (!exactKeys(input, RECOVERY_KEYS)
    || !RECOVERY_KEYS.slice(0, 9).every(key => typeof input[key] === "boolean")
    || ![true, false, "unknown"].includes(input.security_impact)
    || !SHA256.test(input.failed_action_identity ?? "")
    || (input.safe_action_identity !== null && !SHA256.test(input.safe_action_identity))) {
    return { ok: false, route: "pause", error_code: "RECOVERY_EVIDENCE_INVALID" };
  }
  const validation = {
    fresh_qa: input.candidate_changed,
    fresh_security: input.candidate_changed && input.security_impact !== false,
  };
  if (!input.authority_valid || !input.identities_unchanged || input.semantic_change) {
    return { ok: true, route: "require_live_decision", validation, error_code: null };
  }
  if (!input.ownership_safe || !input.progress_preserved || !input.prerequisite_available
    || input.safe_action_identity === null || input.safe_action_identity === input.failed_action_identity) {
    return { ok: true, route: "pause", validation, error_code: null };
  }
  if (!input.context_verifiable || input.independent_lens_changed) {
    return { ok: true, route: "replace_session", validation, error_code: null };
  }
  return { ok: true, route: "continue_same_session", validation, error_code: null };
}

/** Persisted execution profile is metadata; it carries no authority or routing fields. */
export function validateExecutionProfile(value) {
  const keys = ["role", "model", "effort", "instruction_identity", "projection_identity"];
  const efforts = new Set(["low", "medium", "high", "xhigh", "max", "ultra"]);
  return exactKeys(value, keys) && SAFE_ID.test(value.role ?? "") && boundedString(value.model, 128)
    && efforts.has(value.effort) && SHA256.test(value.instruction_identity ?? "")
    && SHA256.test(value.projection_identity ?? "") && !SECRET.test(JSON.stringify(value));
}

/** Activation checks core+architect; later roles are checked immediately before dispatch. */
export function requiredPreflightRoles({ phase, next_role: nextRole }) {
  if (phase === "activation") return ["core", "architect"];
  if (phase === "dispatch" && SAFE_ID.test(nextRole ?? "")) return [nextRole];
  return [];
}

/** Cleaner receives only a deterministic non-empty allowlist from hygiene evidence. */
export function cleanerEligibility({ violations, safe_patterns: safePatterns }) {
  if (!Array.isArray(violations) || !Array.isArray(safePatterns)
    || !safePatterns.every(item => boundedString(item, 128))) return { dispatch: false, allowlist: [], error_code: "HYGIENE_EVIDENCE_INVALID" };
  const allowed = [...new Set(violations.filter(item => exactKeys(item, ["path", "pattern", "semantic"])
    && safeRelative(item.path) && safePatterns.includes(item.pattern) && item.semantic === false)
    .map(item => item.path))].sort();
  return { dispatch: allowed.length > 0, allowlist: allowed, error_code: null };
}

/** Full quality is one memoized operation per immutable candidate identity. */
export function qualityRequirement({ candidate_identity: candidateIdentity, last_quality_identity: lastIdentity, phase }) {
  if (!SHA256.test(candidateIdentity ?? "") || (lastIdentity !== null && !SHA256.test(lastIdentity))
    || !["pre-implementation", "freeze"].includes(phase)) return { run: false, scope: null, error_code: "QUALITY_IDENTITY_INVALID" };
  if (phase === "pre-implementation") return { run: true, scope: "prerequisites-and-red", error_code: null };
  return { run: candidateIdentity !== lastIdentity, scope: "complete-freeze-quality", error_code: null };
}

export async function issueCapabilityLease({ log_path: logPath, lease, writer = "main" }) {
  const validated = await validateCapabilityLease(lease, { requireActive: true });
  if (!validated.ok) return { ok: false, record: null, error_code: validated.error_code };
  const replay = await replayControlLog(logPath);
  if (!replay.ok) return { ok: false, record: null, error_code: replay.error_code };
  const projection = buildControlProjection(replay.records);
  if (Object.values(projection.active_leases).some(active => active.worktree === lease.worktree
    && active.lease_id !== lease.lease_id)) {
    return { ok: false, record: null, error_code: "LEASE_OWNERSHIP_CONFLICT" };
  }
  if (!replay.records.some(record => record.event_id === lease.authority_event_id
    && record.type === "operator_authority" && record.payload.decision === "approve")) {
    return { ok: false, record: null, error_code: "LEASE_AUTHORITY_MISSING" };
  }
  return appendControlEvent({
    log_path: logPath, writer, type: "lease_issued",
    provenance: { actor: "main", authority_event_id: lease.authority_event_id }, payload: { lease },
  });
}

export async function acceptResultEnvelope({ log_path: logPath, result, writer = "main" }) {
  const replay = await replayControlLog(logPath);
  if (!replay.ok) return { ok: false, record: null, error_code: replay.error_code };
  const lease = buildControlProjection(replay.records).active_leases[result?.lease_id];
  return appendControlEvent({
    log_path: logPath, writer, type: "result_accepted",
    provenance: { actor: "main", authority_event_id: lease?.authority_event_id ?? null }, payload: { result },
  });
}

export async function continueCapabilityLease({ log_path: logPath, lease }) {
  const validated = await validateCapabilityLease(lease, { requireActive: true });
  if (!validated.ok) return { ok: false, error_code: validated.error_code };
  const replay = await replayControlLog(logPath);
  if (!replay.ok) return { ok: false, error_code: replay.error_code };
  const active = buildControlProjection(replay.records).active_leases[lease.lease_id];
  return active && controlIdentity(active) === controlIdentity(lease)
    ? { ok: true, lease: active, error_code: null }
    : { ok: false, lease: null, error_code: "LEASE_NOT_ACTIVE" };
}

const CAPSULE_KEYS = ["schema_version", "kind", "capability_lease", "objective", "helper_bundle"];
const BUNDLE_REF_KEYS = ["manifest_path", "manifest_sha256", "bundle_identity_sha256"];

/** Certify the current capsule without prompt-level authority/scope copies. */
export async function certifyCapabilityCapsule({ workspace, capability_lease: lease, objective, helper_bundle: bundle }) {
  try {
    const root = await canonicalDirectory(workspace, "WORKSPACE_INVALID");
    const validated = await validateCapabilityLease(lease, { requireActive: true });
    if (!validated.ok || !boundedString(objective, 1024)
      || !exactKeys(bundle, BUNDLE_REF_KEYS) || !safeRelative(bundle.manifest_path)
      || !SHA256.test(bundle.manifest_sha256 ?? "") || !SHA256.test(bundle.bundle_identity_sha256 ?? "")) {
      throw new Error("CAPSULE_INVALID");
    }
    const capsule = canonical({
      schema_version: CONTROL_PLANE_SCHEMA_VERSION,
      kind: "team_harness_capability_capsule",
      capability_lease: lease,
      objective,
      helper_bundle: bundle,
    });
    const bytes = canonicalControlBytes(capsule);
    const identity = createHash("sha256").update(bytes).digest("hex");
    const relative = `inputs/capability-capsules/${identity}.json`;
    const target = path.join(root, relative);
    try {
      const existing = await readFile(target);
      if (!existing.equals(bytes)) throw new Error("CAPSULE_COLLISION");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      await atomicWrite(target, bytes);
    }
    return { ok: true, reference: { path: relative, sha256: identity }, capsule, error_code: null };
  } catch (error) {
    return { ok: false, reference: null, capsule: null, error_code: error?.message === "CAPSULE_COLLISION" ? "CAPSULE_COLLISION" : "CAPSULE_INVALID" };
  }
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

const LEGACY_KEYS = [
  "schema_version", "kind", "authority", "bindings", "immutable_inputs", "dirty_progress",
  "phase", "status", "original_gate_identity", "continuation",
];

function legacyReferenceSetValid(value) {
  return boundedArray(value, validReference) && new Set(value.map(item => item.path)).size === value.length;
}

async function validateReferenceBytes(root, references) {
  for (const reference of references) {
    if (!await pathContainedWithoutSymlink(root, reference.path, { allowMissing: false })) return false;
    const stat = await lstat(path.join(root, reference.path));
    if (!stat.isFile() || stat.isSymbolicLink()) return false;
    if (createHash("sha256").update(await readFile(path.join(root, reference.path))).digest("hex") !== reference.sha256) return false;
  }
  return true;
}

function offlineRecord(records, type, provenance, payload) {
  const created = createControlRecord({
    schema_version: CONTROL_PLANE_SCHEMA_VERSION, kind: "control_event",
    sequence: records.length + 1, previous_hash: records.at(-1)?.event_id ?? null,
    type, provenance, payload,
  });
  if (!created.ok) throw new Error("LEGACY_STATE_INVALID");
  records.push(created.value);
  return created.value;
}

/** Deterministic create-then-switch converter for normalized supported v1-v4 evidence. */
export async function convertLegacyWorkspace({ workspace, legacy }) {
  let target = null;
  try {
    const root = await canonicalDirectory(workspace, "WORKSPACE_INVALID");
    const pointerPath = path.join(root, "control", "current.json");
    try {
      const pointerBytes = await readFile(pointerPath);
      const pointer = JSON.parse(pointerBytes.toString("utf8"));
      if (exactKeys(pointer, ["schema_version", "kind", "path", "log_sha256"])
        && pointer.schema_version === 5 && pointer.kind === "team_harness_control_pointer"
        && safeRelative(pointer.path) && SHA256.test(pointer.log_sha256 ?? "")) {
        const logBytes = await readFile(path.join(root, pointer.path));
        const replay = replayControlBytes(logBytes);
        if (replay.ok && createHash("sha256").update(logBytes).digest("hex") === pointer.log_sha256) {
          return { ok: true, outcome: "already-v5", pointer, error_code: null, service: null };
        }
      }
      return { ok: false, outcome: "blocked", pointer: null, error_code: "V5_POINTER_INVALID", service: null };
    } catch (error) {
      if (error?.code !== "ENOENT") return { ok: false, outcome: "blocked", pointer: null, error_code: "V5_POINTER_INVALID", service: null };
    }

    if (!exactKeys(legacy, LEGACY_KEYS) || ![1, 2, 3, 4].includes(legacy.schema_version)
      || legacy.kind !== "team_harness_legacy_control_state" || SECRET.test(JSON.stringify(legacy))
      || !exactKeys(legacy.authority, ["presentation_nonce", "decision", "intent_identity", "scope_identity", "security_identity"])
      || !SAFE_ID.test(legacy.authority.presentation_nonce ?? "") || legacy.authority.decision !== "approve"
      || !SHA256.test(legacy.authority.intent_identity ?? "") || !SHA256.test(legacy.authority.scope_identity ?? "")
      || !SHA256.test(legacy.authority.security_identity ?? "") || !SHA256.test(legacy.original_gate_identity ?? "")
      || !SAFE_ID.test(legacy.phase ?? "") || !SAFE_ID.test(legacy.status ?? "")
      || !Array.isArray(legacy.bindings) || legacy.bindings.length > 64
      || !legacy.bindings.every(item => exactKeys(item, ["service", "verdict", "error_code"])
        && SAFE_ID.test(item.service ?? "") && ["pass", "fail"].includes(item.verdict)
        && (item.error_code === null || SAFE_ID.test(item.error_code)))
      || !legacyReferenceSetValid(legacy.immutable_inputs) || !legacyReferenceSetValid(legacy.dirty_progress)) {
      return { ok: false, outcome: "blocked", pointer: null, error_code: "LEGACY_AUTHORITY_INVALID", service: null };
    }
    const failedBinding = legacy.bindings.find(item => item.verdict === "fail");
    if (failedBinding) return { ok: false, outcome: "blocked", pointer: null, error_code: failedBinding.error_code, service: failedBinding.service };
    if (!await validateReferenceBytes(root, [...legacy.immutable_inputs, ...legacy.dirty_progress])) {
      return { ok: false, outcome: "blocked", pointer: null, error_code: "LEGACY_INPUT_INVALID", service: null };
    }
    if (legacy.continuation !== null) {
      if (!exactKeys(legacy.continuation, ["identity", "repaired_aggregate", "repair_evidence"])
        || !SHA256.test(legacy.continuation.identity ?? "") || !validReference(legacy.continuation.repaired_aggregate)
        || !legacyReferenceSetValid(legacy.continuation.repair_evidence)) {
        return { ok: false, outcome: "blocked", pointer: null, error_code: "LEGACY_CONTINUATION_INVALID", service: null };
      }
      const { identity, ...continuationBody } = legacy.continuation;
      if (controlIdentity(continuationBody) !== identity
        || !await validateReferenceBytes(root, [legacy.continuation.repaired_aggregate, ...legacy.continuation.repair_evidence])) {
        return { ok: false, outcome: "blocked", pointer: null, error_code: "LEGACY_CONTINUATION_INVALID", service: null };
      }
    }

    const records = [];
    const authority = offlineRecord(records, "operator_authority", { actor: "main", authority_event_id: null }, legacy.authority);
    offlineRecord(records, "transition", { actor: "main", authority_event_id: authority.event_id }, { phase: legacy.phase, status: legacy.status });
    if (legacy.continuation) offlineRecord(records, "mechanical_release", { actor: "main", authority_event_id: authority.event_id }, {
      name: "legacy-continuation", identity: legacy.continuation.identity,
    });
    const logBytes = Buffer.concat(records.map(canonicalControlBytes));
    const replay = replayControlBytes(logBytes);
    if (!replay.ok) throw new Error("LEGACY_STATE_INVALID");
    const conversionIdentity = controlIdentity({
      legacy_schema_version: legacy.schema_version,
      original_gate_identity: legacy.original_gate_identity,
      head: replay.head,
    });
    const relativeRoot = `control/v5-${conversionIdentity}`;
    target = path.join(root, relativeRoot);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await mkdir(target, { recursive: false, mode: 0o700 });
    const logRelative = `${relativeRoot}/control.jsonl`;
    await atomicWrite(path.join(root, logRelative), logBytes);
    const projection = buildControlProjection(records);
    await atomicWrite(path.join(target, "00-state.md"), Buffer.from(stateMarkdown(projection)));
    await mkdir(path.join(target, "reviews"), { mode: 0o700 });
    await atomicWrite(path.join(target, "reviews", "findings-ledger.md"), Buffer.from(findingsMarkdown(projection)));
    const pointer = {
      schema_version: 5, kind: "team_harness_control_pointer", path: logRelative,
      log_sha256: createHash("sha256").update(logBytes).digest("hex"),
    };
    await mkdir(path.dirname(pointerPath), { recursive: true, mode: 0o700 });
    await atomicWrite(pointerPath, canonicalControlBytes(pointer));
    return { ok: true, outcome: "converted", pointer, error_code: null, service: null };
  } catch (error) {
    if (target) await rm(target, { recursive: true, force: true }).catch(() => {});
    return { ok: false, outcome: "blocked", pointer: null, error_code: error?.message === "WORKSPACE_INVALID" ? "WORKSPACE_INVALID" : "LEGACY_CONVERSION_FAILED", service: null };
  }
}

function stateMarkdown(value) {
  return `# Team Harness v5 State\n\n> Projection only. Authority is the hash-linked control log.\n\n- sequence: ${value.sequence}\n- head: ${value.head ?? "none"}\n- phase: ${value.phase}\n- status: ${value.status}\n- authority_event: ${value.authority?.event_id ?? "none"}\n- active_leases: ${Object.keys(value.active_leases).length}\n- accepted_results: ${Object.keys(value.accepted_results).length}\n`;
}

function findingsMarkdown(value) {
  const rows = Object.values(value.findings).sort((left, right) => left.id.localeCompare(right.id));
  return `# Findings ledger\n\n> Projection only. Rebuild from the v5 control log.\n\n| ID | Class | Severity | State | Summary |\n|---|---|---|---|---|\n${rows.map(item => `| ${item.id} | ${item.class} | ${item.severity} | ${item.state} | ${item.summary.replaceAll("|", "\\|")} |`).join("\n")}${rows.length ? "\n" : ""}`;
}

export async function rebuildControlProjections({ log_path: logPath, workspace, writer = "main" }) {
  if (writer !== "main") return { ok: false, projection: null, error_code: "CONTROL_WRITER_INVALID" };
  try {
    const root = await canonicalDirectory(workspace, "WORKSPACE_INVALID");
    const replay = await replayControlLog(logPath);
    if (!replay.ok) return { ok: false, projection: null, error_code: replay.error_code };
    const projection = buildControlProjection(replay.records);
    await mkdir(path.join(root, "reviews"), { recursive: true, mode: 0o700 });
    await atomicWrite(path.join(root, "00-state.md"), Buffer.from(stateMarkdown(projection)));
    await atomicWrite(path.join(root, "reviews", "findings-ledger.md"), Buffer.from(findingsMarkdown(projection)));
    await atomicWrite(path.join(root, "control-projection.json"), canonicalControlBytes(projection));
    return { ok: true, projection, error_code: null };
  } catch {
    return { ok: false, projection: null, error_code: "PROJECTION_WRITE_FAILED" };
  }
}
