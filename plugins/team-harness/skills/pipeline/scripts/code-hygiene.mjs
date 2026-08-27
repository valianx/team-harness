#!/usr/bin/env node
/** Produce deterministic code-hygiene evidence for one clean Git candidate. */

import { randomUUID } from "node:crypto";
import { lstat, open, readFile, realpath, rename, unlink } from "node:fs/promises";
import path from "node:path";

import { isDirectExecution } from "./cli-entrypoint.mjs";
import { createGitRunners, isContained, sha256 } from "./quality-lib.mjs";

export const CODE_HYGIENE_SCHEMA_VERSION = 1;
export const CODE_HYGIENE_PATTERN_VERSION = 1;

const MAX_REF_BYTES = 256;
const MAX_VIOLATIONS = 256;
const GIT_SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;
const COMMENT_LINE = /^\+\s*(?:\/\/|\/\*|\*|#|<!--|--|;)/;
const PROSE_PATHS = [
  ":(exclude)*.md", ":(exclude)*.markdown", ":(exclude)*.rst",
  ":(exclude)*.txt", ":(exclude)*.adoc",
];
const PATTERNS = Object.freeze([
  ["workspace-path", /workspaces\//],
  ["phase-narration", /(?:Phase|Stage|Step) [0-9]|STAGE-GATE|per Step/],
  ["issue-narration", /added for issue|issue #[0-9]|task-[0-9]/i],
  ["session-narration", /per operator instruction|in this run|workspace note/i],
  ["plan-tag", /(?:^|[^A-Za-z])(?:AC|TC|SEC)-[0-9]/],
]);

class HygieneError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const hygieneError = code => new HygieneError(code);
const { gitText, gitBytes } = createGitRunners(hygieneError);

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

const canonicalBytes = value => Buffer.from(`${JSON.stringify(canonical(value), null, 2)}\n`, "utf8");

function result(verdict, errorCode, details = {}) {
  return {
    schema_version: CODE_HYGIENE_SCHEMA_VERSION,
    kind: "team_harness_code_hygiene_result",
    verdict,
    error_code: errorCode,
    pattern_version: CODE_HYGIENE_PATTERN_VERSION,
    repository: details.repository ?? null,
    base_sha: details.base_sha ?? null,
    candidate_sha: details.candidate_sha ?? null,
    diff_sha256: details.diff_sha256 ?? null,
    scanned_bytes: details.scanned_bytes ?? null,
    violations: details.violations ?? [],
  };
}

function validRef(value) {
  return typeof value === "string" && value.length > 0
    && Buffer.byteLength(value, "utf8") <= MAX_REF_BYTES
    && !value.startsWith("-") && !/[\u0000-\u001f\u007f]/.test(value);
}

async function canonicalDirectory(value, code) {
  if (typeof value !== "string" || !path.isAbsolute(value) || path.resolve(value) !== value) throw hygieneError(code);
  const resolved = await realpath(value);
  const stat = await lstat(resolved);
  if (resolved !== value || !stat.isDirectory() || stat.isSymbolicLink()) throw hygieneError(code);
  return resolved;
}

function scanDiff(bytes) {
  const violations = [];
  let currentPath = null;
  let candidateLine = null;
  for (const line of bytes.toString("utf8").split("\n")) {
    if (line.startsWith("+++ b/")) {
      currentPath = line.slice(6);
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      candidateLine = Number(hunk[1]);
      continue;
    }
    if (candidateLine === null) continue;
    if (line.startsWith("+") && !line.startsWith("+++")) {
      if (currentPath !== null && COMMENT_LINE.test(line)) {
        for (const [pattern, expression] of PATTERNS) {
          if (expression.test(line)) violations.push({ path: currentPath, line: candidateLine, pattern });
          if (violations.length >= MAX_VIOLATIONS) return violations;
        }
      }
      candidateLine += 1;
    } else if (line.startsWith(" ")) {
      candidateLine += 1;
    }
  }
  return violations;
}

export async function runCodeHygiene(input = {}) {
  const details = {};
  try {
    if (!input || typeof input !== "object" || Array.isArray(input)
      || Object.keys(input).length !== 3 || !Object.hasOwn(input, "repo")
      || !Object.hasOwn(input, "base") || !Object.hasOwn(input, "candidate")
      || !validRef(input.base) || !validRef(input.candidate)) throw hygieneError("ARGUMENT_INVALID");
    const repository = await canonicalDirectory(input.repo, "REPOSITORY_INVALID");
    details.repository = repository;
    const baseSha = await gitText(repository, ["rev-parse", "--verify", `${input.base}^{commit}`], "REF_INVALID");
    const candidateSha = await gitText(repository, ["rev-parse", "--verify", `${input.candidate}^{commit}`], "REF_INVALID");
    if (!GIT_SHA.test(baseSha) || !GIT_SHA.test(candidateSha)) throw hygieneError("REF_INVALID");
    details.base_sha = baseSha;
    details.candidate_sha = candidateSha;
    const headSha = await gitText(repository, ["rev-parse", "--verify", "HEAD^{commit}"], "REF_INVALID");
    if (candidateSha !== headSha) throw hygieneError("CANDIDATE_NOT_HEAD");
    if ((await gitText(repository, ["status", "--porcelain=v1", "--untracked-files=no"], "WORKTREE_DIRTY")) !== "") {
      throw hygieneError("WORKTREE_DIRTY");
    }
    await gitText(repository, ["merge-base", "--is-ancestor", baseSha, candidateSha], "BASE_NOT_ANCESTOR");
    const diff = await gitBytes(repository, [
      "diff", "--unified=0", `${baseSha}...${candidateSha}`, "--", ".", ...PROSE_PATHS,
    ], "DIFF_FAILED");
    details.diff_sha256 = sha256(diff);
    details.scanned_bytes = diff.length;
    details.violations = scanDiff(diff);
    return result(details.violations.length === 0 ? "pass" : "fail",
      details.violations.length === 0 ? null : "WORK_NARRATION_DETECTED", details);
  } catch (error) {
    return result("fail", error instanceof HygieneError ? error.code : "INTERNAL_ERROR", details);
  }
}

async function persistResult(workspaceValue, target, value) {
  const workspace = await canonicalDirectory(workspaceValue, "WORKSPACE_INVALID");
  if (typeof target !== "string" || !path.isAbsolute(target) || path.resolve(target) !== target
    || !isContained(workspace, target)) throw hygieneError("OUTPUT_WRITE_FAILED");
  const parent = path.dirname(target);
  if (await realpath(parent) !== parent) throw hygieneError("OUTPUT_WRITE_FAILED");
  const bytes = canonicalBytes(value);
  try {
    const existing = await lstat(target);
    if (!existing.isFile() || existing.isSymbolicLink() || !(await readFile(target)).equals(bytes)) {
      throw hygieneError("OUTPUT_WRITE_FAILED");
    }
  } catch (error) {
    if (error instanceof HygieneError) throw error;
    if (error?.code !== "ENOENT") throw hygieneError("OUTPUT_WRITE_FAILED");
    const temporary = path.join(parent, `.${path.basename(target)}.tmp-${process.pid}-${randomUUID()}`);
    let handle;
    try {
      handle = await open(temporary, "wx", 0o600);
      await handle.writeFile(bytes);
      await handle.sync();
      await handle.close();
      handle = null;
      await rename(temporary, target);
    } catch {
      if (handle) await handle.close().catch(() => {});
      await unlink(temporary).catch(() => {});
      throw hygieneError("OUTPUT_WRITE_FAILED");
    }
  }
  return {
    schema_version: CODE_HYGIENE_SCHEMA_VERSION,
    kind: "team_harness_code_hygiene_receipt",
    verdict: value.verdict,
    error_code: value.error_code,
    result_path: target,
    result_sha256: sha256(bytes),
    result_bytes: bytes.length,
    base_sha: value.base_sha,
    candidate_sha: value.candidate_sha,
  };
}

function parseCli(argv) {
  if (argv.length !== 10) return null;
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!["--repo", "--workspace", "--base", "--candidate", "--output"].includes(flag)
      || value === undefined || Object.hasOwn(values, flag)) return null;
    values[flag] = value;
  }
  return {
    workspace: values["--workspace"],
    output: values["--output"],
    input: { repo: values["--repo"], base: values["--base"], candidate: values["--candidate"] },
  };
}

if (isDirectExecution(import.meta.url)) {
  const parsed = parseCli(process.argv.slice(2));
  const hygiene = await runCodeHygiene(parsed?.input ?? null);
  let terminal = {
    schema_version: CODE_HYGIENE_SCHEMA_VERSION,
    kind: "team_harness_code_hygiene_receipt",
    verdict: "fail",
    error_code: "ARGUMENT_INVALID",
    result_path: null,
    result_sha256: null,
    result_bytes: null,
    base_sha: null,
    candidate_sha: null,
  };
  if (parsed !== null) {
    try {
      terminal = await persistResult(parsed.workspace, parsed.output, hygiene);
    } catch (error) {
      terminal = {
        schema_version: CODE_HYGIENE_SCHEMA_VERSION,
        kind: "team_harness_code_hygiene_receipt",
        verdict: "fail",
        error_code: error instanceof HygieneError ? error.code : "OUTPUT_WRITE_FAILED",
        result_path: null,
        result_sha256: null,
        result_bytes: null,
        base_sha: hygiene.base_sha,
        candidate_sha: hygiene.candidate_sha,
      };
    }
  }
  process.stdout.write(`${JSON.stringify(terminal)}\n`);
  if (terminal.verdict !== "pass") process.exitCode = 1;
}
