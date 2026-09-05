#!/usr/bin/env node
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, mkdtemp, open, realpath, writeFile } from "node:fs/promises";
import { devNull } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { runBoundedCommand, isBoundedCommandEnvelope } from "../../pipeline/scripts/bounded-command.mjs";
import { isDirectExecution } from "../../pipeline/scripts/cli-entrypoint.mjs";

const exec = promisify(execFile);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const digest = (value) => hash(JSON.stringify(value));
const oid = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;
const text = (value) => typeof value === "string" && value.trim().length > 0 && value.length <= 8192;
const ensure = (condition, reason) => { if (!condition) throw new Error(reason); };

async function regular(inputPath, limit = 1024 * 1024) {
  const target = path.resolve(inputPath);
  ensure(await realpath(target) === target, "symlink input is not supported");
  const stat = await lstat(target);
  ensure(stat.isFile() && stat.size <= limit, "input must be a bounded regular file");
  const file = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const opened = await file.stat();
    ensure(opened.isFile() && opened.dev === stat.dev && opened.ino === stat.ino
      && opened.size === stat.size && opened.mtimeMs === stat.mtimeMs, "input changed before reading");
    const bytes = Buffer.alloc(stat.size + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await file.read(bytes, offset, bytes.length - offset, offset);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    const after = await file.stat();
    ensure(offset === stat.size && after.size === stat.size && after.mtimeMs === stat.mtimeMs,
      "input changed while reading");
    return bytes.subarray(0, offset);
  } finally { await file.close(); }
}

async function inputs(requestPath) {
  const request = JSON.parse(await regular(requestPath));
  ensure(request.schema_version === 1, "invalid request version");
  ensure(text(request.invariant) && text(request.consumer) && text(request.environment), "missing hypothesis or environment");
  ensure(/^[a-z0-9-]{1,80}$/.test(request.assertion_id), "invalid assertion identity");
  ensure(typeof request.comparable === "boolean", "explicit environment comparability is required");
  ensure(request.unavailable_reason === null || text(request.unavailable_reason), "invalid unavailable reason");
  ensure(Number.isInteger(request.timeout_ms) && request.timeout_ms > 0 && request.timeout_ms <= 300000, "invalid timeout");
  ensure(Array.isArray(request.argv) && request.argv.length > 1 && request.argv.length <= 128
    && request.argv.every((item) => text(item) && !item.includes("\0"))
    && path.isAbsolute(request.argv[0]) && request.argv.filter((item) => item === "{probe}").length === 1,
  "argv requires an absolute executable and one literal {probe} argument");
  const contextPath = path.resolve(request.context);
  const root = path.dirname(contextPath);
  ensure(path.basename(contextPath) === "pr-review-context.json", "use the captured review context");
  const context = JSON.parse(await regular(contextPath));
  const owner = JSON.parse(await regular(path.join(root, ".team-harness-review-owner.json")));
  ensure(owner.schema_version === 1 && owner.kind === "team_harness_pr_review_run_owner"
    && /^[a-f0-9]{32}$/.test(owner.owner_token) && path.basename(root) === `run-${owner.owner_token}`,
    "invalid review run ownership");
  ensure([context.head_oid, context.base_oid, context.merge_base_oid].every((value) => typeof value === "string" && oid.test(value)),
    "invalid captured commits");
  ensure(/^[a-f0-9]{64}$/.test(context.technical_hash), "missing technical identity");
  const probe = await regular(request.probe);
  const identity = {
    run: owner.owner_token, head_oid: context.head_oid, base_oid: context.base_oid,
    merge_base_oid: context.merge_base_oid, technical_hash: context.technical_hash,
    request_sha256: digest(request), probe_sha256: hash(probe), command_sha256: digest(request.argv),
  };
  return { request, root, probe, identity };
}

async function git(snapshot, args, maxBuffer = 4 * 1024 * 1024) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  Object.assign(env, {
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_COUNT: "0",
    GIT_NO_REPLACE_OBJECTS: "1", GIT_TERMINAL_PROMPT: "0", GIT_NO_LAZY_FETCH: "1",
    GIT_ALLOW_PROTOCOL: "", GIT_OPTIONAL_LOCKS: "0",
  });
  return (await exec("git", ["--no-replace-objects", "-c", "core.fsmonitor=false", "--git-dir", snapshot, ...args],
    { env, encoding: "buffer", timeout: 10000, maxBuffer })).stdout;
}

async function materialize(snapshot, revision, destination) {
  ensure(await realpath(snapshot) === path.resolve(snapshot), "symlink snapshot is not supported");
  const type = (await git(snapshot, ["cat-file", "-t", revision])).toString().trim();
  ensure(type === "commit", "captured object is not a commit");
  const listing = await git(snapshot, ["ls-tree", "-rz", "--full-tree", revision]);
  ensure(Buffer.from(listing.toString("utf8")).equals(listing), "unsupported non-UTF-8 execution copy path");
  const entries = listing.toString("utf8").split("\0").filter(Boolean);
  ensure(entries.length <= 10000, "execution copy exceeds file limit");
  const started = Date.now();
  let bytes = 0;
  await mkdir(destination);
  for (const entry of entries) {
    ensure(Date.now() - started < 60000, "execution copy exceeded preparation deadline");
    const match = /^(100644|100755) blob ([a-f0-9]+)\t(.+)$/s.exec(entry);
    ensure(match, "execution copy contains unsupported symlink or submodule entries");
    const [, mode, object, relative] = match;
    const parts = relative.split("/");
    ensure(!relative.includes("\\") && parts.every((part) => part && !/[. ]$/.test(part)
      && !/[\x00-\x1f<>:"|?*]/.test(part) && part.toLowerCase() !== ".git"
      && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)),
      "unsupported execution copy path");
    const file = path.join(destination, ...parts);
    const confined = path.relative(destination, file);
    ensure(confined && !path.isAbsolute(confined) && confined !== ".." && !confined.startsWith(`..${path.sep}`),
      "execution copy path escapes destination");
    const content = await git(snapshot, ["cat-file", "blob", object], 16 * 1024 * 1024);
    bytes += content.length;
    ensure(bytes <= 64 * 1024 * 1024, "execution copy exceeds byte limit");
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content, { flag: "wx", mode: mode === "100755" ? 0o755 : 0o644 });
  }
}

export function assertionOutcome(result, assertionId) {
  if (!isBoundedCommandEnvelope(result) || result.outcome !== "completed" || result.signal !== null || result.stdout.truncated) return "unknown";
  const output = result.stdout.tail?.replace(/(?:\\x0[AD])+$/g, "");
  if (result.exit_code === 0 && output === `TH_ASSERT:${assertionId}:PASS`) return "pass";
  if (result.exit_code === 1 && output === `TH_ASSERT:${assertionId}:FAIL`) return "fail";
  return "unknown";
}

export function classifyComparison(base, head, comparable) {
  if (!comparable || !["pass", "fail"].includes(base) || !["pass", "fail"].includes(head)) return "inconclusive";
  if (head === "pass") return "no-failure-observed";
  return base === "pass" ? "regression-candidate" : "preexisting-failure";
}

export async function captureRegression(requestPath) {
  const { request, root, probe, identity } = await inputs(requestPath);
  const directory = await mkdtemp(path.join(root, "regression-"));
  const probePath = path.join(directory, `probe${path.extname(request.probe)}`);
  await writeFile(probePath, probe, { flag: "wx", mode: 0o400 });
  const record = {
    schema_version: 1, kind: "pr_regression_evidence", identity,
    invariant: request.invariant, consumer: request.consumer, assertion_id: request.assertion_id,
    environment: { description: request.environment, platform: process.platform, arch: process.arch, node: process.version },
    comparable: request.comparable, argv: request.argv, timeout_ms: request.timeout_ms,
    probe: path.basename(probePath), base: null, head: null, reason: request.unavailable_reason,
  };
  if (!record.reason && request.comparable) {
    try {
      const snapshot = path.join(root, "pr-review-snapshot.git");
      await materialize(snapshot, identity.merge_base_oid, path.join(directory, "base"));
      await materialize(snapshot, identity.head_oid, path.join(directory, "head"));
      for (const side of ["base", "head"]) {
        ensure(hash(await regular(probePath)) === identity.probe_sha256, "probe changed during comparison");
        const execution = await runBoundedCommand({
          argv: request.argv.map((arg) => arg === "{probe}" ? probePath : arg),
          cwd: path.join(directory, side), timeoutMs: request.timeout_ms, includeSuccessDiagnostic: true,
        });
        record[side] = { execution, assertion: assertionOutcome(execution, request.assertion_id) };
      }
      ensure(hash(await regular(probePath)) === identity.probe_sha256, "probe changed during comparison");
    } catch (error) {
      record.reason = error.code ? `preparation or execution unavailable (${error.code})` : error.message;
    }
  }
  if (!request.comparable) record.reason ??= "environment is not comparable";
  if (!record.reason && [record.base, record.head].some((side) => side?.assertion === "unknown")) {
    record.reason = "assertion unavailable or ambiguous; inspect per-side execution diagnostics";
  }
  record.classification = classifyComparison(record.base?.assertion, record.head?.assertion, record.comparable && !record.reason);
  const bytes = Buffer.from(`${JSON.stringify(record, null, 2)}\n`);
  const evidence = path.join(directory, "evidence.json");
  await writeFile(evidence, bytes, { flag: "wx", mode: 0o600 });
  return { evidence, sha256: hash(bytes), classification: record.classification, reason: record.reason };
}

export async function validateRegression(requestPath, evidencePath, expectedHash) {
  const { root, request, identity } = await inputs(requestPath);
  const directory = path.dirname(path.resolve(evidencePath));
  ensure(path.dirname(directory) === root && path.basename(directory).startsWith("regression-") && path.basename(evidencePath) === "evidence.json",
    "evidence is outside the review run");
  const bytes = await regular(evidencePath);
  ensure(/^[a-f0-9]{64}$/.test(expectedHash) && hash(bytes) === expectedHash, "evidence digest mismatch");
  const record = JSON.parse(bytes);
  ensure(record.schema_version === 1 && record.kind === "pr_regression_evidence" && digest(record.identity) === digest(identity), "stale or mismatched evidence identity");
  ensure(record.probe === `probe${path.extname(request.probe)}`
    && hash(await regular(path.join(directory, record.probe))) === identity.probe_sha256, "probe digest mismatch");
  for (const side of [record.base, record.head]) {
    ensure(side === null || (isBoundedCommandEnvelope(side.execution)
      && assertionOutcome(side.execution, request.assertion_id) === side.assertion), "invalid assertion evidence");
  }
  ensure(record.classification === classifyComparison(record.base?.assertion, record.head?.assertion, record.comparable && !record.reason), "invalid comparison classification");
  return record;
}

if (isDirectExecution(import.meta.url)) {
  try {
    const [command, request, evidence, sha256, ...extra] = process.argv.slice(2);
    ensure(extra.length === 0 && request && ((command === "run" && !evidence) || (command === "validate" && evidence && sha256)),
      "usage: regression-evidence.mjs run REQUEST | validate REQUEST EVIDENCE SHA256");
    const result = command === "run" ? await captureRegression(request) : await validateRegression(request, evidence, sha256);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ error: error.code || error.message })}\n`);
    process.exitCode = 1;
  }
}
