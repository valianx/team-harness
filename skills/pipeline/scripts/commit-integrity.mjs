#!/usr/bin/env node
/** Deterministically verify the six Git-backed commit-integrity conjuncts. */

import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { lstat, open, realpath, rename, unlink } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { isDirectExecution } from "./cli-entrypoint.mjs";

export const COMMIT_INTEGRITY_SCHEMA_VERSION = 1;
export const COMMIT_INTEGRITY_RECEIPT_SCHEMA_VERSION = 1;

const SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const MAX_PATHS = 4096;
const MAX_PATH_BYTES = 1024;
const MAX_GIT_OUTPUT_BYTES = 1024 * 1024;
const GIT_TIMEOUT_MS = 30_000;
const CHECK_VALUES = new Set(["pass", "fail", "skipped", "external"]);
const ERROR_CODES = new Set([
  null,
  "ARGUMENT_INVALID",
  "GIT_FAILED",
  "GIT_OUTPUT_LIMIT",
  "GIT_TIMEOUT",
  "INTEGRITY_FAILED",
  "OUTPUT_WRITE_FAILED",
  "INTERNAL_ERROR",
]);

class IntegrityError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function exactlyKeys(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }

function safeString(value, maximum = 4096) {
  return typeof value === "string" && value.length > 0 && !value.includes("\0")
    && Buffer.byteLength(value, "utf8") <= maximum;
}

function normalizeRelative(value) {
  if (!safeString(value, MAX_PATH_BYTES) || path.isAbsolute(value) || path.win32.isAbsolute(value)) {
    throw new IntegrityError("ARGUMENT_INVALID");
  }
  const normalized = value.replaceAll("\\", "/");
  const parts = normalized.split("/");
  if (parts.some(part => part === "" || part === "." || part === "..")) {
    throw new IntegrityError("ARGUMENT_INVALID");
  }
  return normalized;
}

function normalizePaths(values) {
  if (!Array.isArray(values) || values.length > MAX_PATHS) throw new IntegrityError("ARGUMENT_INVALID");
  const normalized = values.map(normalizeRelative);
  if (new Set(normalized).size !== normalized.length) throw new IntegrityError("ARGUMENT_INVALID");
  return normalized;
}

async function canonicalDirectory(value) {
  if (!safeString(value) || !path.isAbsolute(value)) throw new IntegrityError("ARGUMENT_INVALID");
  try {
    const canonical = await realpath(value);
    const stat = await lstat(canonical);
    if (!stat.isDirectory()) throw new Error("not a directory");
    return canonical;
  } catch {
    throw new IntegrityError("ARGUMENT_INVALID");
  }
}

async function normalizeOptions(options) {
  const keys = ["repository", "reported_commit", "base_sha", "working_branch", "worktree", "allowed_paths", "scope_drift_paths"];
  if (!exactlyKeys(options, keys) || !safeString(options.working_branch, 1024)) {
    throw new IntegrityError("ARGUMENT_INVALID");
  }
  if (options.reported_commit !== "none" && !SHA.test(options.reported_commit)) {
    throw new IntegrityError("ARGUMENT_INVALID");
  }
  if (!SHA.test(options.base_sha)) throw new IntegrityError("ARGUMENT_INVALID");
  return {
    repository: await canonicalDirectory(options.repository),
    reportedCommit: options.reported_commit,
    baseSha: options.base_sha,
    workingBranch: options.working_branch,
    worktree: await canonicalDirectory(options.worktree),
    allowedPaths: normalizePaths(options.allowed_paths),
    scopeDriftPaths: normalizePaths(options.scope_drift_paths),
  };
}

function runGit(repository, argv) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["-c", "core.pager=cat", "-c", "diff.external=", ...argv], {
      cwd: repository,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      detached: process.platform !== "win32",
    });
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let overflow = false;
    let timedOut = false;
    let settled = false;
    const stop = () => {
      if (child.pid && process.platform !== "win32") {
        try { process.kill(-child.pid, "SIGKILL"); return; } catch { /* fall back to the child */ }
      }
      child.kill("SIGKILL");
    };
    const timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, GIT_TIMEOUT_MS);
    timer.unref();
    const collect = (target, chunk, stream) => {
      if (overflow) return;
      if (stream === "stdout") stdoutBytes += chunk.length;
      else stderrBytes += chunk.length;
      if (stdoutBytes > MAX_GIT_OUTPUT_BYTES || stderrBytes > MAX_GIT_OUTPUT_BYTES) {
        overflow = true;
        stop();
        return;
      }
      target.push(chunk);
    };
    child.stdout.on("data", chunk => collect(stdout, chunk, "stdout"));
    child.stderr.on("data", chunk => collect(stderr, chunk, "stderr"));
    child.once("error", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new IntegrityError(timedOut ? "GIT_TIMEOUT" : "GIT_FAILED"));
    });
    child.once("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (timedOut) reject(new IntegrityError("GIT_TIMEOUT"));
      else if (overflow) reject(new IntegrityError("GIT_OUTPUT_LIMIT"));
      else resolve({ code, signal, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) });
    });
  });
}

function requireGitSuccess(result) {
  if (result.code !== 0 || result.signal !== null) throw new IntegrityError("GIT_FAILED");
  return result.stdout;
}

function textOutput(result) {
  const bytes = requireGitSuccess(result);
  if (bytes.includes(0)) throw new IntegrityError("GIT_FAILED");
  return bytes.toString("utf8").trim();
}

function nulPaths(result) {
  const bytes = requireGitSuccess(result);
  if (bytes.length === 0) return [];
  if (bytes[bytes.length - 1] !== 0) throw new IntegrityError("GIT_FAILED");
  return bytes.subarray(0, -1).toString("utf8").split("\0").map(normalizeRelative);
}

function nulRecordCount(result) {
  const bytes = requireGitSuccess(result);
  if (bytes.length === 0) return 0;
  if (bytes[bytes.length - 1] !== 0) throw new IntegrityError("GIT_FAILED");
  const records = bytes.subarray(0, -1).toString("utf8").split("\0");
  let count = 0;
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (record.length < 4 || record[2] !== " ") throw new IntegrityError("GIT_FAILED");
    count += 1;
    if (/[RC]/.test(record.slice(0, 2))) {
      index += 1;
      if (index >= records.length || records[index].length === 0) throw new IntegrityError("GIT_FAILED");
    }
  }
  return count;
}

function initialResult() {
  return {
    schema_version: COMMIT_INTEGRITY_SCHEMA_VERSION,
    kind: "team_harness_git_commit_integrity",
    verdict: "fail",
    error_code: "INTERNAL_ERROR",
    head_sha: null,
    tree_sha: null,
    checks: {
      tree_clean: "fail",
      ancestry: "fail",
      baseline_movement: "fail",
      lane_coverage: "external",
      branch: "fail",
      worktree: "fail",
      staging_scope: "fail",
    },
    counts: { dirty_entries: 0, changed_paths: 0, out_of_scope_paths: 0 },
    changed_paths_sha256: null,
    out_of_scope_paths_sha256: null,
  };
}

export function isCommitIntegrityResult(value) {
  if (!exactlyKeys(value, ["schema_version", "kind", "verdict", "error_code", "head_sha", "tree_sha", "checks", "counts", "changed_paths_sha256", "out_of_scope_paths_sha256"])) return false;
  if (value.schema_version !== 1 || value.kind !== "team_harness_git_commit_integrity" || !["pass", "fail"].includes(value.verdict) || !ERROR_CODES.has(value.error_code)) return false;
  if (value.head_sha !== null && !SHA.test(value.head_sha)) return false;
  if (value.tree_sha !== null && !SHA.test(value.tree_sha)) return false;
  if (!exactlyKeys(value.checks, ["tree_clean", "ancestry", "baseline_movement", "lane_coverage", "branch", "worktree", "staging_scope"]) || !Object.values(value.checks).every(item => CHECK_VALUES.has(item)) || value.checks.lane_coverage !== "external") return false;
  if (!exactlyKeys(value.counts, ["dirty_entries", "changed_paths", "out_of_scope_paths"]) || !Object.values(value.counts).every(item => Number.isSafeInteger(item) && item >= 0)) return false;
  for (const hash of [value.changed_paths_sha256, value.out_of_scope_paths_sha256]) if (hash !== null && !/^[a-f0-9]{64}$/.test(hash)) return false;
  return true;
}

export async function runCommitIntegrity(options) {
  const result = initialResult();
  try {
    const normalized = await normalizeOptions(options);
    const head = textOutput(await runGit(normalized.repository, ["rev-parse", "--verify", "HEAD^{commit}"]));
    const tree = textOutput(await runGit(normalized.repository, ["rev-parse", "--verify", "HEAD^{tree}"]));
    if (!SHA.test(head) || !SHA.test(tree)) throw new IntegrityError("GIT_FAILED");
    result.head_sha = head;
    result.tree_sha = tree;

    const dirtyEntries = nulRecordCount(await runGit(normalized.repository, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]));
    result.counts.dirty_entries = dirtyEntries;
    result.checks.tree_clean = dirtyEntries === 0 ? "pass" : "fail";

    const branchResult = await runGit(normalized.repository, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
    if (branchResult.signal !== null || ![0, 1].includes(branchResult.code)) throw new IntegrityError("GIT_FAILED");
    const branch = branchResult.code === 0 ? branchResult.stdout.toString("utf8").trim() : null;
    result.checks.branch = branch === normalized.workingBranch ? "pass" : "fail";

    const actualWorktree = await canonicalDirectory(textOutput(await runGit(normalized.repository, ["rev-parse", "--show-toplevel"])));
    result.checks.worktree = actualWorktree === normalized.worktree && actualWorktree === normalized.repository ? "pass" : "fail";

    if (normalized.reportedCommit === "none") {
      result.checks.ancestry = head === normalized.baseSha ? "skipped" : "fail";
      result.checks.baseline_movement = "skipped";
      result.checks.staging_scope = "skipped";
    } else {
      const ancestry = await runGit(normalized.repository, ["merge-base", "--is-ancestor", normalized.baseSha, "HEAD"]);
      if (ancestry.signal !== null || ![0, 1].includes(ancestry.code)) throw new IntegrityError("GIT_FAILED");
      result.checks.ancestry = ancestry.code === 0 && normalized.reportedCommit === head ? "pass" : "fail";

      const movement = await runGit(normalized.repository, ["diff", "--quiet", normalized.baseSha, "HEAD"]);
      if (movement.signal !== null || ![0, 1].includes(movement.code)) throw new IntegrityError("GIT_FAILED");
      result.checks.baseline_movement = normalized.reportedCommit !== normalized.baseSha && movement.code === 1 ? "pass" : "fail";

      const changed = nulPaths(await runGit(normalized.repository, ["diff", "--name-only", "--no-renames", "-z", normalized.baseSha, "HEAD", "--"]));
      const allowed = new Set([...normalized.allowedPaths, ...normalized.scopeDriftPaths]);
      const outOfScope = changed.filter(item => !allowed.has(item));
      result.counts.changed_paths = changed.length;
      result.counts.out_of_scope_paths = outOfScope.length;
      result.changed_paths_sha256 = sha256(`${changed.slice().sort().join("\n")}\n`);
      result.out_of_scope_paths_sha256 = sha256(`${outOfScope.slice().sort().join("\n")}\n`);
      result.checks.staging_scope = outOfScope.length === 0 ? "pass" : "fail";
    }

    const failed = Object.entries(result.checks).some(([name, value]) => name !== "lane_coverage" && value === "fail");
    result.verdict = failed ? "fail" : "pass";
    result.error_code = failed ? "INTEGRITY_FAILED" : null;
  } catch (error) {
    result.error_code = error instanceof IntegrityError && ERROR_CODES.has(error.code) ? error.code : "INTERNAL_ERROR";
  }
  return result;
}

async function persistResult(output, result) {
  if (!safeString(output) || !path.isAbsolute(output)) throw new IntegrityError("OUTPUT_WRITE_FAILED");
  const parent = await realpath(path.dirname(output));
  const stat = await lstat(parent);
  if (!stat.isDirectory()) throw new IntegrityError("OUTPUT_WRITE_FAILED");
  const target = path.join(parent, path.basename(output));
  const bytes = Buffer.from(`${JSON.stringify(result)}\n`, "utf8");
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, target);
  } catch {
    await handle?.close().catch(() => {});
    await unlink(temporary).catch(() => {});
    throw new IntegrityError("OUTPUT_WRITE_FAILED");
  }
  return {
    schema_version: COMMIT_INTEGRITY_RECEIPT_SCHEMA_VERSION,
    kind: "team_harness_commit_integrity_receipt",
    verdict: result.verdict,
    error_code: result.error_code,
    result_path: target,
    result_sha256: sha256(bytes),
    result_bytes: bytes.length,
  };
}

function parseCli(argv) {
  const single = new Map([
    ["--repository", "repository"],
    ["--commit", "reported_commit"],
    ["--base-sha", "base_sha"],
    ["--branch", "working_branch"],
    ["--worktree", "worktree"],
    ["--output", "output"],
  ]);
  const result = { allowed_paths: [], scope_drift_paths: [] };
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (value === undefined) return null;
    if (flag === "--allowed-path") result.allowed_paths.push(value);
    else if (flag === "--scope-drift-path") result.scope_drift_paths.push(value);
    else {
      const key = single.get(flag);
      if (key === undefined || Object.hasOwn(result, key)) return null;
      result[key] = value;
    }
  }
  return result;
}

if (isDirectExecution(import.meta.url)) {
  const parsed = parseCli(process.argv.slice(2));
  const output = parsed?.output;
  if (parsed && Object.hasOwn(parsed, "output")) delete parsed.output;
  const result = await runCommitIntegrity(parsed);
  let emitted = result;
  if (output !== undefined) {
    try { emitted = await persistResult(output, result); }
    catch {
      emitted = {
        schema_version: COMMIT_INTEGRITY_RECEIPT_SCHEMA_VERSION,
        kind: "team_harness_commit_integrity_receipt",
        verdict: "fail",
        error_code: "OUTPUT_WRITE_FAILED",
        result_path: null,
        result_sha256: null,
        result_bytes: null,
      };
    }
  }
  process.stdout.write(`${JSON.stringify(emitted)}\n`);
  if (emitted.verdict !== "pass") process.exitCode = 1;
}
