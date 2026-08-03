#!/usr/bin/env node
/**
 * Collect a privacy-safe Codex token-usage snapshot from local rollout JSONL
 * files. This script never writes pipeline state: callers persist the
 * allowlisted JSON written to stdout if they need a checkpoint.
 *
 * Native Codex JSONL records are read directly:
 *   {"type":"session_meta","payload":{"id":"…", "session_id":"…", …}}
 *   {"type":"event_msg","payload":{"type":"token_count","info":{…}}}
 *
 * `total_token_usage` and `last_token_usage` contain every RAW_COMPONENT.
 * `uncached_input_tokens` is derived and is never accepted from rollout input.
 * The output schema is versioned; raw Codex rollouts are not required to carry
 * a synthetic schema_version field.
 */

import { constants as fsConstants } from "node:fs";
import { lstat, open, readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const USAGE_SCHEMA_VERSION = 1;
export const MAX_ROLLOUT_FILES = 512;
export const MAX_SESSIONS = 512;
export const MAX_THREAD_DEPTH = 64;
export const MAX_TOTAL_BYTES = 512 * 1024 * 1024;
export const MAX_LINE_BYTES = 16 * 1024 * 1024;

const RAW_COMPONENTS = Object.freeze([
  "input_tokens",
  "cached_input_tokens",
  "cache_write_input_tokens",
  "output_tokens",
  "reasoning_output_tokens",
  "total_tokens",
]);
const OUTPUT_COMPONENTS = Object.freeze([
  ...RAW_COMPONENTS.slice(0, 2),
  "uncached_input_tokens",
  ...RAW_COMPONENTS.slice(2),
]);
const RENDERABLE_AGENT_ROLES = new Set([
  "architect",
  "implementer",
  "tester",
  "qa",
  "security",
  "delivery",
  "worker",
  "explorer",
  "default",
]);

const USAGE_RESULT_KEYS = Object.freeze([
  "schema_version",
  "kind",
  "usage_status",
  "reason_code",
  "session_count",
  "components",
  "sessions",
]);
const CHECKPOINT_KEYS = Object.freeze([
  "schema_version",
  "kind",
  "usage_status",
  "reason_code",
  "components",
]);
const SAFE_REASON_CODES = new Set([
  "ARGUMENT_INVALID",
  "CHECKPOINT_INVALID",
  "CHECKPOINT_REGRESSION",
  "CHECKPOINT_UNAVAILABLE",
  "COUNTER_INVALID",
  "COUNTER_REGRESSION",
  "CYCLE_DETECTED",
  "DUPLICATE_CONFLICT",
  "FILE_MUTATED",
  "FS_UNSAFE",
  "IO_FAILURE",
  "JSONL_INVALID",
  "JSONL_PARTIAL",
  "LINE_TOO_LONG",
  "RESOURCE_LIMIT",
  "ROOT_NOT_FOUND",
  "SCHEMA_INVALID",
]);

class CollectorFailure extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function fail(code) {
  throw new CollectorFailure(code);
}

function reasonFor(error) {
  return error instanceof CollectorFailure ? error.code : "IO_FAILURE";
}

function isSafeReasonCode(value) {
  return typeof value === "string" && SAFE_REASON_CODES.has(value);
}

function unavailable(reasonCode, kind = "codex_usage") {
  if (kind === "codex_usage_delta" || kind === "codex_usage_checkpoint") {
    return {
      schema_version: USAGE_SCHEMA_VERSION,
      kind,
      usage_status: "unavailable",
      reason_code: reasonCode,
      components: null,
    };
  }

  return {
    schema_version: USAGE_SCHEMA_VERSION,
    kind: "codex_usage",
    usage_status: "unavailable",
    reason_code: reasonCode,
    session_count: 0,
    components: null,
    sessions: [],
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactlyKeys(value, expected) {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

function isSafeCounter(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function cloneRawComponents(components) {
  const copy = {};
  for (const component of RAW_COMPONENTS) copy[component] = components[component];
  return copy;
}

function zeroRawComponents() {
  return Object.fromEntries(RAW_COMPONENTS.map((component) => [component, 0]));
}

function asOutputComponents(raw) {
  const output = {
    input_tokens: raw.input_tokens,
    cached_input_tokens: raw.cached_input_tokens,
    uncached_input_tokens: Math.max(0, raw.input_tokens - raw.cached_input_tokens),
    cache_write_input_tokens: raw.cache_write_input_tokens,
    output_tokens: raw.output_tokens,
    reasoning_output_tokens: raw.reasoning_output_tokens,
    total_tokens: raw.total_tokens,
  };

  if (!OUTPUT_COMPONENTS.every((component) => isSafeCounter(output[component]))) {
    fail("COUNTER_INVALID");
  }
  return output;
}

function addRawComponents(left, right) {
  const result = {};
  for (const component of RAW_COMPONENTS) {
    const value = left[component] + right[component];
    if (!isSafeCounter(value)) fail("COUNTER_INVALID");
    result[component] = value;
  }
  return result;
}

function subtractRawComponents(end, start) {
  const result = {};
  for (const component of RAW_COMPONENTS) {
    if (end[component] < start[component]) fail("CHECKPOINT_REGRESSION");
    const value = end[component] - start[component];
    if (!isSafeCounter(value)) fail("COUNTER_INVALID");
    result[component] = value;
  }
  return result;
}

function validateRawComponents(value, code = "SCHEMA_INVALID") {
  if (!hasExactlyKeys(value, RAW_COMPONENTS)) fail(code);
  for (const component of RAW_COMPONENTS) {
    if (!isSafeCounter(value[component])) fail("COUNTER_INVALID");
  }
  // Cached input is a subset of input in a native cumulative counter. The
  // output clamp is only for a valid zero uncached delta, never a repair for
  // an internally inconsistent native pair.
  if (value.cached_input_tokens > value.input_tokens) fail("COUNTER_INVALID");
  return cloneRawComponents(value);
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function optionalString(value, key) {
  if (!hasOwn(value, key)) return { present: false, value: null };
  const candidate = value[key];
  if (typeof candidate !== "string" || candidate.length === 0 || candidate.length > 4096) {
    fail("SCHEMA_INVALID");
  }
  return { present: true, value: candidate };
}

function optionalParent(value, key) {
  if (!hasOwn(value, key)) return { present: false, value: null };
  const candidate = value[key];
  if (candidate !== null && (typeof candidate !== "string" || candidate.length === 0 || candidate.length > 4096)) {
    fail("SCHEMA_INVALID");
  }
  return { present: true, value: candidate };
}

function reconcileMetadataField(candidates, required = false) {
  const supplied = candidates.filter((candidate) => candidate.present);
  if (required && supplied.length === 0) fail("SCHEMA_INVALID");
  if (supplied.length === 0) return null;
  const value = supplied[0].value;
  if (supplied.some((candidate) => candidate.value !== value)) fail("DUPLICATE_CONFLICT");
  return value;
}

function threadSpawnFromPayload(payload) {
  if (!hasOwn(payload, "source")) return null;
  const source = payload.source;
  if (typeof source === "string") return null;
  if (!isPlainObject(source)) fail("SCHEMA_INVALID");
  if (!hasOwn(source, "subagent")) return null;
  if (!isPlainObject(source.subagent)) fail("SCHEMA_INVALID");
  if (!hasOwn(source.subagent, "thread_spawn")) return null;
  if (!isPlainObject(source.subagent.thread_spawn)) fail("SCHEMA_INVALID");
  return source.subagent.thread_spawn;
}

function sameMetadata(left, right) {
  return (
    left.id === right.id &&
    left.parentId === right.parentId &&
    left.agentRole === right.agentRole &&
    left.agentPath === right.agentPath
  );
}

function sameIdentityMetadata(left, right) {
  return left.id === right.id && left.parentId === right.parentId;
}

function validateSessionIdentity(payload) {
  const threadSpawn = threadSpawnFromPayload(payload);
  const threadId = optionalString(payload, "id");
  if (!threadId.present) fail("SCHEMA_INVALID");
  return {
    id: threadId.value,
    parentId: reconcileMetadataField(
      [optionalParent(payload, "parent_thread_id"), ...(threadSpawn ? [optionalParent(threadSpawn, "parent_thread_id")] : [])],
    ),
  };
}

function validateSessionMeta(record, state) {
  if (!isPlainObject(record.payload)) fail("SCHEMA_INVALID");
  const payload = record.payload;
  const threadSpawn = threadSpawnFromPayload(payload);
  // `session_id` groups related Codex threads. It is deliberately validated
  // for a reachable rollout but never used for identity, traversal,
  // de-duplication, or output.
  optionalString(payload, "session_id");
  const identity = validateSessionIdentity(payload);
  const metadata = {
    ...identity,
    agentRole: reconcileMetadataField(
      [optionalString(payload, "agent_role"), ...(threadSpawn ? [optionalString(threadSpawn, "agent_role")] : [])],
    ),
    agentPath: reconcileMetadataField(
      [optionalString(payload, "agent_path"), ...(threadSpawn ? [optionalString(threadSpawn, "agent_path")] : [])],
    ),
  };

  if (state.metadata === null) {
    state.metadata = metadata;
  } else if (!sameMetadata(state.metadata, metadata)) {
    fail("DUPLICATE_CONFLICT");
  }
}

function validateTokenCount(record, state) {
  if (state.metadata === null || !isPlainObject(record.payload.info)) fail("SCHEMA_INVALID");
  const info = record.payload.info;
  if (!hasOwn(info, "total_token_usage") || !hasOwn(info, "last_token_usage")) fail("SCHEMA_INVALID");

  const total = validateRawComponents(info.total_token_usage);
  const last = validateRawComponents(info.last_token_usage);
  for (const component of RAW_COMPONENTS) {
    if (last[component] > total[component]) fail("COUNTER_INVALID");
  }
  if (state.previousTotal !== null) {
    for (const component of RAW_COMPONENTS) {
      if (total[component] < state.previousTotal[component]) fail("COUNTER_REGRESSION");
    }
  }
  state.previousTotal = total;
  state.usages.push({ total, last });
}

function parseRecord(record, state) {
  if (!isPlainObject(record) || typeof record.type !== "string") fail("SCHEMA_INVALID");
  if (record.type === "session_meta") {
    validateSessionMeta(record, state);
    return;
  }
  if (record.type !== "event_msg") return;
  if (!isPlainObject(record.payload) || typeof record.payload.type !== "string") fail("SCHEMA_INVALID");
  if (record.payload.type === "token_count") validateTokenCount(record, state);
}

function finalizeSession(state) {
  if (state.metadata === null || state.usages.length === 0) fail("SCHEMA_INVALID");

  const first = state.usages[0];
  const final = state.usages.at(-1);
  const rawUsage = {};
  for (const component of RAW_COMPONENTS) {
    // The first cumulative total already includes prior inherited usage. Add
    // its last-turn delta back after subtraction to count this session only.
    const value = final.total[component] - first.total[component] + first.last[component];
    if (!isSafeCounter(value)) fail("COUNTER_INVALID");
    rawUsage[component] = value;
  }

  return {
    id: state.metadata.id,
    parentId: state.metadata.parentId,
    agentRole: state.metadata.agentRole,
    agentPath: state.metadata.agentPath,
    usages: state.usages,
    rawUsage,
  };
}

function sameRawComponents(left, right) {
  return RAW_COMPONENTS.every((component) => left[component] === right[component]);
}

function sameSession(left, right) {
  if (
    left.parentId !== right.parentId ||
    left.agentRole !== right.agentRole ||
    left.agentPath !== right.agentPath ||
    left.usages.length !== right.usages.length
  ) {
    return false;
  }
  for (let index = 0; index < left.usages.length; index += 1) {
    const a = left.usages[index];
    const b = right.usages[index];
    if (!sameRawComponents(a.total, b.total) || !sameRawComponents(a.last, b.last)) {
      return false;
    }
  }
  return true;
}

function isContained(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function sameFileIdentity(left, right) {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs
  );
}

async function assertSafeDirectory(candidate, canonicalRoot) {
  const metadata = await lstat(candidate, { bigint: true });
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) fail("FS_UNSAFE");
  const canonical = await realpath(candidate);
  if (!isContained(canonicalRoot, canonical)) fail("FS_UNSAFE");
  return canonical;
}

async function discoverRolloutFiles(canonicalRoot) {
  const files = [];
  let totalBytes = 0n;

  async function walk(directory) {
    await assertSafeDirectory(directory, canonicalRoot);
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const candidate = path.join(directory, entry.name);
      const metadata = await lstat(candidate, { bigint: true });
      const isRollout = path.extname(entry.name) === ".jsonl";

      if (metadata.isSymbolicLink()) fail("FS_UNSAFE");
      if (isRollout && !metadata.isFile()) fail("FS_UNSAFE");
      if (metadata.isDirectory()) {
        await walk(candidate);
        continue;
      }
      if (!isRollout) continue;

      const canonical = await realpath(candidate);
      if (!isContained(canonicalRoot, canonical)) fail("FS_UNSAFE");
      files.push({ candidate, canonical, metadata });
      if (files.length > MAX_ROLLOUT_FILES) fail("RESOURCE_LIMIT");
      totalBytes += metadata.size;
      if (totalBytes > BigInt(MAX_TOTAL_BYTES)) fail("RESOURCE_LIMIT");
    }
  }

  await walk(canonicalRoot);
  return files;
}

function appendLineChunk(chunks, byteLength, chunk) {
  const nextLength = byteLength + chunk.length;
  if (nextLength > MAX_LINE_BYTES) fail("LINE_TOO_LONG");
  if (chunk.length > 0) chunks.push(Buffer.from(chunk));
  return nextLength;
}

async function* jsonLines(fileHandle) {
  const buffer = Buffer.allocUnsafe(64 * 1024);
  let chunks = [];
  let byteLength = 0;

  while (true) {
    const { bytesRead } = await fileHandle.read(buffer, 0, buffer.length, null);
    if (bytesRead === 0) break;

    let start = 0;
    for (let index = 0; index < bytesRead; index += 1) {
      if (buffer[index] !== 0x0a) continue;
      byteLength = appendLineChunk(chunks, byteLength, buffer.subarray(start, index));
      let line = Buffer.concat(chunks, byteLength);
      if (line.at(-1) === 0x0d) line = line.subarray(0, -1);
      chunks = [];
      byteLength = 0;
      start = index + 1;
      yield line;
    }
    if (start < bytesRead) {
      byteLength = appendLineChunk(chunks, byteLength, buffer.subarray(start, bytesRead));
    }
  }

  if (byteLength !== 0) fail("JSONL_PARTIAL");
}

async function firstJsonLine(fileHandle) {
  const buffer = Buffer.allocUnsafe(64 * 1024);
  const chunks = [];
  let byteLength = 0;

  while (true) {
    const { bytesRead } = await fileHandle.read(buffer, 0, buffer.length, null);
    if (bytesRead === 0) fail("JSONL_PARTIAL");
    for (let index = 0; index < bytesRead; index += 1) {
      if (buffer[index] !== 0x0a) continue;
      byteLength = appendLineChunk(chunks, byteLength, buffer.subarray(0, index));
      let line = Buffer.concat(chunks, byteLength);
      if (line.at(-1) === 0x0d) line = line.subarray(0, -1);
      return line;
    }
    byteLength = appendLineChunk(chunks, byteLength, buffer.subarray(0, bytesRead));
  }
}

function decodeJsonLine(line) {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(line);
    return JSON.parse(text);
  } catch {
    fail("JSONL_INVALID");
  }
}

async function openStableRollout(file, canonicalRoot) {
  const preRead = await lstat(file.candidate, { bigint: true });
  if (
    preRead.isSymbolicLink() ||
    !preRead.isFile() ||
    !sameFileIdentity(file.metadata, preRead) ||
    !isContained(canonicalRoot, await realpath(file.candidate))
  ) {
    fail("FILE_MUTATED");
  }

  const noFollow = typeof fsConstants.O_NOFOLLOW === "number" ? fsConstants.O_NOFOLLOW : 0;
  const fileHandle = await open(file.candidate, fsConstants.O_RDONLY | noFollow);
  try {
    const opened = await fileHandle.stat({ bigint: true });
    if (!opened.isFile() || !sameFileIdentity(preRead, opened)) fail("FILE_MUTATED");
    return { fileHandle, preRead };
  } catch (error) {
    await fileHandle.close();
    throw error;
  }
}

async function assertStableRollout(file, canonicalRoot, preRead, fileHandle) {
  const postRead = await lstat(file.candidate, { bigint: true });
  const postCanonical = await realpath(file.candidate);
  const finalHandleStat = await fileHandle.stat({ bigint: true });
  if (
    postRead.isSymbolicLink() ||
    !postRead.isFile() ||
    postCanonical !== file.canonical ||
    !isContained(canonicalRoot, postCanonical) ||
    !sameFileIdentity(preRead, postRead) ||
    !sameFileIdentity(preRead, finalHandleStat)
  ) {
    fail("FILE_MUTATED");
  }
}

async function readSessionMetadata(file, canonicalRoot) {
  const { fileHandle, preRead } = await openStableRollout(file, canonicalRoot);
  try {
    const record = decodeJsonLine(await firstJsonLine(fileHandle));
    if (!isPlainObject(record) || record.type !== "session_meta") fail("SCHEMA_INVALID");
    if (!isPlainObject(record.payload)) fail("SCHEMA_INVALID");
    const metadata = validateSessionIdentity(record.payload);
    await assertStableRollout(file, canonicalRoot, preRead, fileHandle);
    return metadata;
  } finally {
    await fileHandle.close();
  }
}

async function readSessionFile(file, canonicalRoot, testHooks) {
  if (typeof testHooks?.beforeRead === "function") await testHooks.beforeRead();
  const { fileHandle, preRead } = await openStableRollout(file, canonicalRoot);
  try {
    const state = { metadata: null, usages: [], previousTotal: null };
    for await (const line of jsonLines(fileHandle)) {
      parseRecord(decodeJsonLine(line), state);
    }

    // These hooks exist only to deterministically exercise the pre/post-read
    // TOCTOU validation; they are not reachable from the command-line interface.
    if (typeof testHooks?.afterRead === "function") await testHooks.afterRead();
    await assertStableRollout(file, canonicalRoot, preRead, fileHandle);

    const session = finalizeSession(state);
    if (!sameIdentityMetadata(session, file.sessionMetadata)) fail("FILE_MUTATED");
    return session;
  } finally {
    await fileHandle.close();
  }
}

async function indexSessionMetadata(files, canonicalRoot) {
  const filesById = new Map();
  for (const file of files) {
    file.sessionMetadata = await readSessionMetadata(file, canonicalRoot);
    const group = filesById.get(file.sessionMetadata.id) ?? [];
    group.push(file);
    filesById.set(file.sessionMetadata.id, group);
    if (filesById.size > MAX_SESSIONS) fail("RESOURCE_LIMIT");
  }
  return filesById;
}

function consistentIdentityMetadata(files) {
  const metadata = files[0].sessionMetadata;
  if (files.some((file) => !sameIdentityMetadata(metadata, file.sessionMetadata))) fail("DUPLICATE_CONFLICT");
  return metadata;
}

function reachableSessionGroups(filesById, rootThreadId) {
  if (!filesById.has(rootThreadId)) fail("ROOT_NOT_FOUND");
  const children = new Map();
  for (const [sessionId, files] of filesById) {
    for (const file of files) {
      const { parentId } = file.sessionMetadata;
      if (parentId === null) continue;
      const siblings = children.get(parentId) ?? new Set();
      siblings.add(sessionId);
      children.set(parentId, siblings);
    }
  }

  const active = new Set();
  const visited = new Set();
  const ordered = [];
  function visit(sessionId, depth) {
    if (depth > MAX_THREAD_DEPTH || ordered.length >= MAX_SESSIONS) fail("RESOURCE_LIMIT");
    if (active.has(sessionId)) fail("CYCLE_DETECTED");
    if (visited.has(sessionId)) return;
    const files = filesById.get(sessionId);
    const metadata = consistentIdentityMetadata(files);
    active.add(sessionId);
    visited.add(sessionId);
    ordered.push({ files, metadata });
    const childIds = [...(children.get(sessionId) ?? [])].sort((left, right) => left.localeCompare(right));
    for (const childId of childIds) visit(childId, depth + 1);
    active.delete(sessionId);
  }

  visit(rootThreadId, 0);
  return ordered;
}

async function readReachableSessions(groups, canonicalRoot, testHooks) {
  const sessions = [];
  for (const group of groups) {
    let session = null;
    for (const file of group.files) {
      const candidate = await readSessionFile(file, canonicalRoot, testHooks);
      if (session === null) {
        session = candidate;
      } else if (!sameSession(session, candidate)) {
        fail("DUPLICATE_CONFLICT");
      }
    }
    sessions.push(session);
  }
  return sessions;
}

function availableUsage(orderedSessions) {
  let aggregate = zeroRawComponents();
  const aliases = new Map();
  orderedSessions.forEach((session, index) => aliases.set(session.id, `S${index + 1}`));
  const sessions = orderedSessions.map((session, index) => {
    aggregate = addRawComponents(aggregate, session.rawUsage);
    return {
      session: `S${index + 1}`,
      parent_session: index === 0 ? null : aliases.get(session.parentId) ?? null,
      role: index === 0 ? "root" : RENDERABLE_AGENT_ROLES.has(session.agentRole) ? session.agentRole : "other",
      components: asOutputComponents(session.rawUsage),
    };
  });

  return {
    schema_version: USAGE_SCHEMA_VERSION,
    kind: "codex_usage",
    usage_status: "available",
    reason_code: null,
    session_count: sessions.length,
    components: asOutputComponents(aggregate),
    sessions,
  };
}

/**
 * Returns a fully allowlisted usage snapshot. All errors are represented as a
 * reason code so callers never receive a local path, rollout content, or raw
 * thread/session identifier.
 */
export async function collectCodexUsage(options) {
  try {
    if (!isPlainObject(options)) fail("ARGUMENT_INVALID");
    const { rolloutsRoot, rootThreadId, testHooks } = options;
    if (
      typeof rolloutsRoot !== "string" ||
      rolloutsRoot.length === 0 ||
      typeof rootThreadId !== "string" ||
      rootThreadId.length === 0
    ) {
      fail("ARGUMENT_INVALID");
    }

    const canonicalRoot = await realpath(rolloutsRoot);
    await assertSafeDirectory(canonicalRoot, canonicalRoot);
    const files = await discoverRolloutFiles(canonicalRoot);
    const filesById = await indexSessionMetadata(files, canonicalRoot);
    const reachableGroups = reachableSessionGroups(filesById, rootThreadId);
    return availableUsage(await readReachableSessions(reachableGroups, canonicalRoot, testHooks));
  } catch (error) {
    return unavailable(reasonFor(error));
  }
}

function validateOutputComponents(components) {
  if (!hasExactlyKeys(components, OUTPUT_COMPONENTS)) fail("CHECKPOINT_INVALID");
  for (const component of OUTPUT_COMPONENTS) {
    if (!isSafeCounter(components[component])) fail("CHECKPOINT_INVALID");
  }
  if (components.uncached_input_tokens !== Math.max(0, components.input_tokens - components.cached_input_tokens)) {
    fail("CHECKPOINT_INVALID");
  }
  return {
    input_tokens: components.input_tokens,
    cached_input_tokens: components.cached_input_tokens,
    cache_write_input_tokens: components.cache_write_input_tokens,
    output_tokens: components.output_tokens,
    reasoning_output_tokens: components.reasoning_output_tokens,
    total_tokens: components.total_tokens,
  };
}

/** Build a persistable checkpoint from an allowlisted collector result. */
export function checkpointFromUsage(usage) {
  try {
    if (!hasExactlyKeys(usage, USAGE_RESULT_KEYS) || usage.schema_version !== USAGE_SCHEMA_VERSION || usage.kind !== "codex_usage") {
      fail("CHECKPOINT_INVALID");
    }
    if (usage.usage_status === "unavailable") {
      if (
        !isSafeReasonCode(usage.reason_code) ||
        usage.session_count !== 0 ||
        usage.components !== null ||
        !Array.isArray(usage.sessions) ||
        usage.sessions.length !== 0
      ) {
        fail("CHECKPOINT_INVALID");
      }
      return unavailable(usage.reason_code, "codex_usage_checkpoint");
    }
    if (usage.usage_status !== "available" || usage.reason_code !== null) fail("CHECKPOINT_INVALID");
    const raw = validateOutputComponents(usage.components);
    return {
      schema_version: USAGE_SCHEMA_VERSION,
      kind: "codex_usage_checkpoint",
      usage_status: "available",
      reason_code: null,
      components: asOutputComponents(raw),
    };
  } catch (error) {
    return unavailable(reasonFor(error), "codex_usage_checkpoint");
  }
}

function validateCheckpoint(checkpoint) {
  if (!hasExactlyKeys(checkpoint, CHECKPOINT_KEYS)) fail("CHECKPOINT_INVALID");
  if (checkpoint.schema_version !== USAGE_SCHEMA_VERSION || checkpoint.kind !== "codex_usage_checkpoint") {
    fail("CHECKPOINT_INVALID");
  }
  if (checkpoint.usage_status === "unavailable") {
    if (!isSafeReasonCode(checkpoint.reason_code) || checkpoint.components !== null) fail("CHECKPOINT_INVALID");
    fail("CHECKPOINT_UNAVAILABLE");
  }
  if (checkpoint.usage_status !== "available" || checkpoint.reason_code !== null) fail("CHECKPOINT_INVALID");
  return validateOutputComponents(checkpoint.components);
}

/**
 * Compare two checkpoints. Only `end - start` is reported; no cumulative or
 * session subtotal is carried into a phase result.
 */
export function compareCheckpoints(start, end) {
  try {
    const startRaw = validateCheckpoint(start);
    const endRaw = validateCheckpoint(end);
    return {
      schema_version: USAGE_SCHEMA_VERSION,
      kind: "codex_usage_delta",
      usage_status: "available",
      reason_code: null,
      components: asOutputComponents(subtractRawComponents(endRaw, startRaw)),
    };
  } catch (error) {
    return unavailable(reasonFor(error), "codex_usage_delta");
  }
}

async function loadCheckpoint(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    fail("CHECKPOINT_INVALID");
  }
}

function parseCli(argv) {
  const options = {};
  let checkpoint = false;
  let compareStart = null;
  let compareEnd = null;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--checkpoint") {
      if (checkpoint) fail("ARGUMENT_INVALID");
      checkpoint = true;
      continue;
    }
    if (!["--rollouts-root", "--root-thread-id", "--compare-start", "--compare-end"].includes(argument)) {
      fail("ARGUMENT_INVALID");
    }
    const value = argv[index + 1];
    if (typeof value !== "string" || value.length === 0) fail("ARGUMENT_INVALID");
    index += 1;
    if (argument === "--rollouts-root") {
      if (options.rolloutsRoot !== undefined) fail("ARGUMENT_INVALID");
      options.rolloutsRoot = value;
    } else if (argument === "--root-thread-id") {
      if (options.rootThreadId !== undefined) fail("ARGUMENT_INVALID");
      options.rootThreadId = value;
    } else if (argument === "--compare-start") {
      if (compareStart !== null) fail("ARGUMENT_INVALID");
      compareStart = value;
    } else {
      if (compareEnd !== null) fail("ARGUMENT_INVALID");
      compareEnd = value;
    }
  }
  const comparing = compareStart !== null || compareEnd !== null;
  if (comparing && (checkpoint || compareStart === null || compareEnd === null || Object.keys(options).length !== 0)) {
    fail("ARGUMENT_INVALID");
  }
  if (!comparing && (typeof options.rolloutsRoot !== "string" || typeof options.rootThreadId !== "string")) {
    fail("ARGUMENT_INVALID");
  }
  return { options, checkpoint, compareStart, compareEnd };
}

async function main(argv) {
  const failureKind = argv.includes("--compare-start") || argv.includes("--compare-end")
    ? "codex_usage_delta"
    : argv.includes("--checkpoint")
      ? "codex_usage_checkpoint"
      : "codex_usage";
  try {
    const parsed = parseCli(argv);
    if (parsed.compareStart !== null) {
      return compareCheckpoints(await loadCheckpoint(parsed.compareStart), await loadCheckpoint(parsed.compareEnd));
    }
    const usage = await collectCodexUsage(parsed.options);
    return parsed.checkpoint ? checkpointFromUsage(usage) : usage;
  } catch (error) {
    return unavailable(reasonFor(error), failureKind);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await main(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
