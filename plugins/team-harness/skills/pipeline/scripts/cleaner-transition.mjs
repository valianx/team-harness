#!/usr/bin/env node
/** Prove one bounded cleaner transition without trusting agent prose. */

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

import {
  isQualityResult,
  runQualityChecks,
  validateQualityManifest,
} from "./quality-runner.mjs";

const execFileAsync = promisify(execFile);

export const CLEANER_ALLOWLIST_SCHEMA_VERSION = 1;
export const CLEANER_TRANSITION_SCHEMA_VERSION = 1;

const MAX_JSON_BYTES = 1024 * 1024;
const MAX_PATHS = 512;
const SAFE_SHA256 = /^[0-9a-f]{64}$/;
const SAFE_GIT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;
const ERROR_CODES = new Set([
  null,
  "ARGUMENT_INVALID",
  "MANIFEST_INVALID",
  "ALLOWLIST_INVALID",
  "BASELINE_INVALID",
  "CLEANER_SCOPE_INVALID",
  "QUALITY_FAILED",
  "INTERNAL_ERROR",
]);
const RESULT_KEYS = [
  "schema_version",
  "kind",
  "transition",
  "verdict",
  "error_code",
  "duration_ms",
  "allowlist",
  "baseline",
  "quality",
];

class CleanerError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function hasOnlyKeys(value, allowed, required = []) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.every((key) => allowed.includes(key)) && required.every((key) => Object.hasOwn(value, key));
}

function hasExactlyKeys(value, keys) {
  return hasOnlyKeys(value, keys, keys) && Object.keys(value).length === keys.length;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function isSafeRelativePath(value) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\u0000") || path.isAbsolute(value)) {
    return false;
  }
  const normalized = value.replaceAll("\\", "/");
  return (
    !normalized.startsWith("/") &&
    !normalized.split("/").includes("..") &&
    Buffer.byteLength(value, "utf8") <= 512
  );
}

function isContained(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

async function readBoundedJson(filePath, code) {
  try {
    const stat = await lstat(filePath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_JSON_BYTES) throw new Error("invalid file");
    const bytes = await readFile(filePath);
    if (bytes.length > MAX_JSON_BYTES) throw new Error("file too large");
    return { value: JSON.parse(bytes.toString("utf8")), bytes };
  } catch {
    throw new CleanerError(code);
  }
}

async function resolveRepository(repoInput) {
  if (typeof repoInput !== "string" || repoInput.length === 0) throw new CleanerError("ARGUMENT_INVALID");
  try {
    const repo = await realpath(path.resolve(repoInput));
    const top = await gitText(repo, ["rev-parse", "--show-toplevel"], "ARGUMENT_INVALID");
    const canonicalTop = await realpath(top);
    if (canonicalTop !== repo) throw new Error("not repository root");
    return repo;
  } catch (error) {
    if (error instanceof CleanerError) throw error;
    throw new CleanerError("ARGUMENT_INVALID");
  }
}

async function resolveManifest(repo, manifestInput) {
  if (typeof manifestInput !== "string" || manifestInput.length === 0) throw new CleanerError("ARGUMENT_INVALID");
  let file;
  try {
    const requested = path.resolve(repo, manifestInput);
    const stat = await lstat(requested);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("invalid manifest");
    file = await realpath(requested);
  } catch {
    throw new CleanerError("MANIFEST_INVALID");
  }
  if (!isContained(repo, file)) throw new CleanerError("MANIFEST_INVALID");
  const loaded = await readBoundedJson(file, "MANIFEST_INVALID");
  let value;
  try {
    value = validateQualityManifest(loaded.value);
  } catch {
    throw new CleanerError("MANIFEST_INVALID");
  }
  if (value.test_contract === null || !Object.hasOwn(value.commands, "test")) {
    throw new CleanerError("MANIFEST_INVALID");
  }
  return { value, sha256: sha256(loaded.bytes) };
}

function cleanerChecks(manifest, transition) {
  const checks = ["test"];
  if (transition === "post") {
    for (const id of ["format_check", "lint"]) {
      if (Object.hasOwn(manifest.value.commands, id)) checks.push(id);
    }
  }
  if (manifest.value.crap !== null) checks.push("crap");
  return checks;
}

function validateAllowlist(value) {
  if (
    !hasExactlyKeys(value, ["schema_version", "paths"]) ||
    value.schema_version !== CLEANER_ALLOWLIST_SCHEMA_VERSION ||
    !Array.isArray(value.paths) ||
    value.paths.length > MAX_PATHS ||
    value.paths.some((entry) => !isSafeRelativePath(entry)) ||
    new Set(value.paths).size !== value.paths.length
  ) {
    throw new CleanerError("ALLOWLIST_INVALID");
  }
  return { schema_version: CLEANER_ALLOWLIST_SCHEMA_VERSION, paths: value.paths.slice().sort() };
}

async function resolveExternalJson(fileInput, code) {
  if (typeof fileInput !== "string" || fileInput.length === 0) throw new CleanerError("ARGUMENT_INVALID");
  let file;
  try {
    file = await realpath(path.resolve(fileInput));
  } catch {
    throw new CleanerError(code);
  }
  return readBoundedJson(file, code);
}

async function loadAllowlist(fileInput) {
  const loaded = await resolveExternalJson(fileInput, "ALLOWLIST_INVALID");
  return { value: validateAllowlist(loaded.value), sha256: sha256(loaded.bytes) };
}

async function gitText(repo, args, code) {
  try {
    const result = await execFileAsync("git", args, {
      cwd: repo,
      encoding: "utf8",
      maxBuffer: MAX_JSON_BYTES,
      timeout: 30_000,
      windowsHide: true,
    });
    return result.stdout.trim();
  } catch {
    throw new CleanerError(code);
  }
}

async function gitBytes(repo, args, code) {
  try {
    const result = await execFileAsync("git", args, {
      cwd: repo,
      encoding: null,
      maxBuffer: MAX_JSON_BYTES,
      timeout: 30_000,
      windowsHide: true,
    });
    return result.stdout;
  } catch {
    throw new CleanerError(code);
  }
}

function pathMatchesRule(candidate, rule) {
  const normalized = candidate.replaceAll("\\", "/");
  if (rule.type === "prefix") return normalized.startsWith(rule.value.replaceAll("\\", "/"));
  if (rule.type === "suffix") return normalized.endsWith(rule.value);
  return normalized.split("/").includes(rule.value);
}

async function resolveBlobsAtCommit(repo, commit, paths, code) {
  if (paths.length === 0) return new Map();
  const bytes = await gitBytes(repo, ["ls-tree", "-z", "--full-tree", commit, "--", ...paths], code);
  const requested = new Set(paths);
  const blobs = new Map();
  for (const record of bytes.toString("utf8").split("\u0000").filter(Boolean)) {
    const separator = record.indexOf("\t");
    const [mode, type, object, ...extra] = record.slice(0, separator).split(" ");
    const candidate = record.slice(separator + 1);
    if (
      separator < 0 || extra.length !== 0 || !/^[0-7]{6}$/.test(mode) || type !== "blob" ||
      !SAFE_GIT_ID.test(object) || !requested.has(candidate) || blobs.has(candidate)
    ) {
      throw new CleanerError(code);
    }
    blobs.set(candidate, object);
  }
  if (blobs.size !== requested.size) throw new CleanerError(code);
  return blobs;
}

async function assertBaselineAllowlist(repo, allowlist, quality, manifest) {
  const changed = new Set(quality.repository.changed_paths);
  const testRules = manifest.value.test_contract.path_rules;
  const blobs = await resolveBlobsAtCommit(
    repo,
    quality.repository.candidate_commit,
    allowlist.paths,
    "ALLOWLIST_INVALID",
  );
  for (const candidate of allowlist.paths) {
    if (!changed.has(candidate) || testRules.some((rule) => pathMatchesRule(candidate, rule))) {
      throw new CleanerError("ALLOWLIST_INVALID");
    }
    if (!blobs.has(candidate)) throw new CleanerError("ALLOWLIST_INVALID");
  }
}

function allowlistEvidence(allowlist) {
  return { sha256: allowlist.sha256, paths: allowlist.value.paths };
}

function isAllowlistEvidence(value) {
  return (
    hasExactlyKeys(value, ["sha256", "paths"]) &&
    SAFE_SHA256.test(value.sha256) &&
    Array.isArray(value.paths) &&
    value.paths.length <= MAX_PATHS &&
    value.paths.every(isSafeRelativePath) &&
    new Set(value.paths).size === value.paths.length
  );
}

function isBaselineEvidence(value) {
  return (
    value === null ||
    (hasExactlyKeys(value, ["sha256", "candidate_commit", "candidate_tree"]) &&
      SAFE_SHA256.test(value.sha256) &&
      SAFE_GIT_ID.test(value.candidate_commit) &&
      SAFE_GIT_ID.test(value.candidate_tree))
  );
}

export function isCleanerTransitionResult(value) {
  if (!hasExactlyKeys(value, RESULT_KEYS)) return false;
  if (value.schema_version !== CLEANER_TRANSITION_SCHEMA_VERSION || value.kind !== "team_harness_cleaner_transition") {
    return false;
  }
  if (![null, "pre", "post"].includes(value.transition) || !["pass", "fail"].includes(value.verdict)) return false;
  if (!ERROR_CODES.has(value.error_code) || !Number.isSafeInteger(value.duration_ms) || value.duration_ms < 0) return false;
  if (value.allowlist !== null && !isAllowlistEvidence(value.allowlist)) return false;
  if (!isBaselineEvidence(value.baseline) || (value.quality !== null && !isQualityResult(value.quality))) return false;
  if (value.verdict === "pass" && (value.error_code !== null || value.transition === null || value.allowlist === null)) return false;
  if (value.verdict === "fail" && value.error_code === null) return false;
  if (value.transition === "pre" && value.baseline !== null) return false;
  if (value.transition === "post" && value.verdict === "pass" && value.baseline === null) return false;
  if (
    value.verdict === "pass" &&
    (value.quality?.verdict !== "pass" || value.quality.repository === null || value.quality.manifest === null)
  ) {
    return false;
  }
  const allowedCommands = new Set(value.transition === "pre"
    ? ["test", "crap"]
    : ["test", "format_check", "lint", "crap"]);
  const actualCommands = value.quality?.commands.map((entry) => entry.id) ?? [];
  const actualCommandSet = new Set(actualCommands);
  const hasCrap = actualCommandSet.has("crap");
  if (
    value.verdict === "pass" &&
    (actualCommandSet.size !== actualCommands.length ||
      !actualCommandSet.has("test") ||
      actualCommands.some((id) => !allowedCommands.has(id)) ||
      hasCrap !== (value.quality?.crap !== null) ||
      (hasCrap && value.quality?.crap?.policy_mode !== (value.transition === "pre" ? "measure" : "enforce")))
  ) {
    return false;
  }
  return true;
}

function elapsedMs(startedAt) {
  return Number((process.hrtime.bigint() - startedAt) / 1_000_000n);
}

function safeResult(state, startedAt) {
  const result = {
    schema_version: CLEANER_TRANSITION_SCHEMA_VERSION,
    kind: "team_harness_cleaner_transition",
    transition: state.transition,
    verdict: state.error_code === null ? "pass" : "fail",
    error_code: state.error_code,
    duration_ms: elapsedMs(startedAt),
    allowlist: state.allowlist,
    baseline: state.baseline,
    quality: state.quality,
  };
  if (isCleanerTransitionResult(result)) return result;
  return {
    schema_version: CLEANER_TRANSITION_SCHEMA_VERSION,
    kind: "team_harness_cleaner_transition",
    transition: null,
    verdict: "fail",
    error_code: "INTERNAL_ERROR",
    duration_ms: 0,
    allowlist: null,
    baseline: null,
    quality: null,
  };
}

const OPTION_KEYS = [
  "transition",
  "repo",
  "manifest",
  "base",
  "candidate",
  "allowlist",
  "allowlistSha256",
  "baseline",
  "baselineSha256",
];

function normalizeOptions(options) {
  const required = ["transition", "repo", "manifest", "base", "candidate", "allowlist"];
  if (!hasOnlyKeys(options, OPTION_KEYS, required) || !["pre", "post"].includes(options.transition)) {
    throw new CleanerError("ARGUMENT_INVALID");
  }
  if (required.slice(1).some((key) => typeof options[key] !== "string" || options[key].length === 0)) {
    throw new CleanerError("ARGUMENT_INVALID");
  }
  const postFields = ["allowlistSha256", "baseline", "baselineSha256"];
  if (options.transition === "pre" && postFields.some((key) => Object.hasOwn(options, key))) {
    throw new CleanerError("ARGUMENT_INVALID");
  }
  if (
    options.transition === "post" &&
    (!postFields.every((key) => typeof options[key] === "string" && options[key].length > 0) ||
      !SAFE_SHA256.test(options.allowlistSha256) ||
      !SAFE_SHA256.test(options.baselineSha256))
  ) {
    throw new CleanerError("ARGUMENT_INVALID");
  }
  return options;
}

async function runPreQuality(options, manifest) {
  return runQualityChecks({
    repo: options.repo,
    manifest: options.manifest,
    base: options.base,
    candidate: options.candidate,
    checkpoint: "pre_cleaner",
    checks: cleanerChecks(manifest, "pre"),
    policyMode: "measure",
  });
}

async function loadBaseline(options) {
  const loaded = await resolveExternalJson(options.baseline, "BASELINE_INVALID");
  if (sha256(loaded.bytes) !== options.baselineSha256 || !isCleanerTransitionResult(loaded.value)) {
    throw new CleanerError("BASELINE_INVALID");
  }
  if (loaded.value.transition !== "pre" || loaded.value.verdict !== "pass") {
    throw new CleanerError("BASELINE_INVALID");
  }
  return { result: loaded.value, sha256: sha256(loaded.bytes) };
}

async function withQualityBaseline(baselineResult, callback) {
  const directory = await mkdtemp(path.join(tmpdir(), "th-cleaner-baseline-"));
  const file = path.join(directory, "quality.json");
  try {
    const bytes = Buffer.from(`${JSON.stringify(baselineResult.quality)}\n`, "utf8");
    await writeFile(file, bytes);
    return await callback({ file, sha256: sha256(bytes) });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function runPostQuality(options, baseline, manifest) {
  return withQualityBaseline(baseline.result, ({ file, sha256: baselineSha256 }) =>
    runQualityChecks({
      repo: options.repo,
      manifest: options.manifest,
      base: options.base,
      candidate: options.candidate,
      checkpoint: "post_cleaner",
      checks: cleanerChecks(manifest, "post"),
      policyMode: "enforce",
      baseline: file,
      baselineSha256,
    }),
  );
}

async function changedPaths(repo, baselineCommit, candidateCommit) {
  const bytes = await gitBytes(repo, ["diff", "--name-only", "-z", baselineCommit, candidateCommit, "--"], "CLEANER_SCOPE_INVALID");
  return bytes.toString("utf8").split("\u0000").filter(Boolean);
}

async function currentRepositoryIdentity(repo) {
  const candidate_commit = await gitText(repo, ["rev-parse", "--verify", "HEAD^{commit}"], "CLEANER_SCOPE_INVALID");
  const candidate_tree = await gitText(repo, ["rev-parse", "--verify", "HEAD^{tree}"], "CLEANER_SCOPE_INVALID");
  if (!SAFE_GIT_ID.test(candidate_commit) || !SAFE_GIT_ID.test(candidate_tree)) {
    throw new CleanerError("CLEANER_SCOPE_INVALID");
  }
  return { candidate_commit, candidate_tree };
}

async function assertPostScope(repo, allowlist, baseline, current) {
  const prior = baseline.result.quality.repository;
  const mergeBase = await gitText(repo, ["merge-base", prior.candidate_commit, current.candidate_commit], "BASELINE_INVALID");
  if (mergeBase !== prior.candidate_commit) throw new CleanerError("BASELINE_INVALID");
  const structural = await gitBytes(
    repo,
    ["diff", "--diff-filter=ADRTUXB", "--name-only", "-z", prior.candidate_commit, current.candidate_commit, "--"],
    "CLEANER_SCOPE_INVALID",
  );
  if (structural.length !== 0) throw new CleanerError("CLEANER_SCOPE_INVALID");
  const allowed = new Set(allowlist.value.paths);
  const changed = await changedPaths(repo, prior.candidate_commit, current.candidate_commit);
  if (changed.some((entry) => !allowed.has(entry))) throw new CleanerError("CLEANER_SCOPE_INVALID");
}

async function executePre(options, state, repo, manifest, allowlist) {
  state.quality = await runPreQuality(options, manifest);
  if (!isQualityResult(state.quality) || state.quality.verdict !== "pass") throw new CleanerError("QUALITY_FAILED");
  if (state.quality.manifest.sha256 !== manifest.sha256) throw new CleanerError("MANIFEST_INVALID");
  await assertBaselineAllowlist(repo, allowlist.value, state.quality, manifest);
  state.allowlist = allowlistEvidence(allowlist);
}

async function executePost(options, state, repo, manifest, allowlist) {
  if (allowlist.sha256 !== options.allowlistSha256) throw new CleanerError("ALLOWLIST_INVALID");
  const baseline = await loadBaseline(options);
  if (
    baseline.result.allowlist.sha256 !== allowlist.sha256 ||
    baseline.result.quality.manifest.sha256 !== manifest.sha256
  ) {
    throw new CleanerError("BASELINE_INVALID");
  }
  const current = await currentRepositoryIdentity(repo);
  await assertPostScope(repo, allowlist, baseline, current);
  state.quality = await runPostQuality(options, baseline, manifest);
  if (!isQualityResult(state.quality) || state.quality.verdict !== "pass") throw new CleanerError("QUALITY_FAILED");
  if (state.quality.manifest.sha256 !== manifest.sha256) throw new CleanerError("MANIFEST_INVALID");
  if (
    state.quality.repository.candidate_commit !== current.candidate_commit ||
    state.quality.repository.candidate_tree !== current.candidate_tree
  ) {
    throw new CleanerError("CLEANER_SCOPE_INVALID");
  }
  state.allowlist = allowlistEvidence(allowlist);
  state.baseline = {
    sha256: baseline.sha256,
    candidate_commit: baseline.result.quality.repository.candidate_commit,
    candidate_tree: baseline.result.quality.repository.candidate_tree,
  };
}

/** Execute a pre-cleaner baseline or post-cleaner proof. */
export async function runCleanerTransition(options) {
  const startedAt = process.hrtime.bigint();
  const state = { transition: null, error_code: null, allowlist: null, baseline: null, quality: null };
  try {
    const normalized = normalizeOptions(options);
    state.transition = normalized.transition;
    const repo = await resolveRepository(normalized.repo);
    const manifest = await resolveManifest(repo, normalized.manifest);
    const allowlist = await loadAllowlist(normalized.allowlist);
    if (normalized.transition === "pre") await executePre(normalized, state, repo, manifest, allowlist);
    else await executePost(normalized, state, repo, manifest, allowlist);
  } catch (error) {
    state.error_code = error instanceof CleanerError && ERROR_CODES.has(error.code) ? error.code : "INTERNAL_ERROR";
  }
  return safeResult(state, startedAt);
}

function parseCli(argv) {
  const flags = new Map([
    ["--transition", "transition"],
    ["--repo", "repo"],
    ["--manifest", "manifest"],
    ["--base", "base"],
    ["--candidate", "candidate"],
    ["--allowlist", "allowlist"],
    ["--allowlist-sha256", "allowlistSha256"],
    ["--baseline", "baseline"],
    ["--baseline-sha256", "baselineSha256"],
  ]);
  if (argv.length % 2 !== 0) return null;
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = flags.get(argv[index]);
    if (key === undefined || Object.hasOwn(values, key)) return null;
    values[key] = argv[index + 1];
  }
  return values;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runCleanerTransition(parseCli(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.verdict !== "pass") process.exitCode = 1;
}
