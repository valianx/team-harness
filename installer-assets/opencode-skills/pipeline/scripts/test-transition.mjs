#!/usr/bin/env node
/**
 * Prove a pre-implementation test transition from red to green.
 *
 * This companion keeps semantic judgment with the tester while mechanically
 * proving test-only red scope, immutable test inputs, and the same exact test
 * command succeeding after implementation.
 */

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

import {
  isQualityResult,
  runQualityChecks,
  validateQualityManifest,
} from "./quality-runner.mjs";

const execFileAsync = promisify(execFile);

export const TEST_CONTRACT_SCHEMA_VERSION = 1;
export const TEST_TRANSITION_SCHEMA_VERSION = 1;

const MAX_JSON_BYTES = 1024 * 1024;
const MAX_ITEMS = 256;
const SAFE_COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;
const SAFE_SHA256 = /^[0-9a-f]{64}$/;
const SAFE_REQUIREMENT = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ERROR_CODES = new Set([
  null,
  "ARGUMENT_INVALID",
  "MANIFEST_INVALID",
  "CONTRACT_INVALID",
  "TEST_SCOPE_INVALID",
  "RED_NOT_OBSERVED",
  "GREEN_NOT_OBSERVED",
  "RED_EVIDENCE_INVALID",
  "TEST_INPUT_CHANGED",
  "QUALITY_RUNNER_FAILED",
  "INTERNAL_ERROR",
]);
const RESULT_KEYS = [
  "schema_version",
  "kind",
  "transition",
  "verdict",
  "error_code",
  "duration_ms",
  "contract",
  "red_evidence",
  "quality",
];

class TransitionError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function hasOnlyKeys(value, allowed, required = []) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value);
  return actual.every((key) => allowed.includes(key)) && required.every((key) => Object.hasOwn(value, key));
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

function uniqueStrings(values, validator) {
  return (
    Array.isArray(values) &&
    values.length > 0 &&
    values.length <= MAX_ITEMS &&
    values.every(validator) &&
    new Set(values).size === values.length
  );
}

function validateContract(value) {
  const keys = ["schema_version", "requirements", "test_identifiers", "test_paths"];
  if (!hasExactlyKeys(value, keys) || value.schema_version !== TEST_CONTRACT_SCHEMA_VERSION) {
    throw new TransitionError("CONTRACT_INVALID");
  }
  if (!uniqueStrings(value.requirements, (entry) => typeof entry === "string" && SAFE_REQUIREMENT.test(entry))) {
    throw new TransitionError("CONTRACT_INVALID");
  }
  if (
    !uniqueStrings(
      value.test_identifiers,
      (entry) =>
        typeof entry === "string" &&
        entry.trim() === entry &&
        entry.length > 0 &&
        !entry.includes("\u0000") &&
        Buffer.byteLength(entry, "utf8") <= 512,
    )
  ) {
    throw new TransitionError("CONTRACT_INVALID");
  }
  if (!uniqueStrings(value.test_paths, isSafeRelativePath)) throw new TransitionError("CONTRACT_INVALID");
  return {
    schema_version: TEST_CONTRACT_SCHEMA_VERSION,
    requirements: value.requirements.slice(),
    test_identifiers: value.test_identifiers.slice(),
    test_paths: value.test_paths.slice().sort(),
  };
}

async function readBoundedJson(filePath, code) {
  try {
    const stat = await lstat(filePath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_JSON_BYTES) throw new Error("invalid file");
    const bytes = await readFile(filePath);
    if (bytes.length > MAX_JSON_BYTES) throw new Error("file too large");
    return { value: JSON.parse(bytes.toString("utf8")), bytes };
  } catch (error) {
    if (error instanceof TransitionError) throw error;
    throw new TransitionError(code);
  }
}

async function resolveContainedFile(repoInput, fileInput, code) {
  if (typeof repoInput !== "string" || typeof fileInput !== "string" || fileInput.length === 0) {
    throw new TransitionError("ARGUMENT_INVALID");
  }
  let repo;
  let file;
  try {
    repo = await realpath(path.resolve(repoInput));
    const requested = path.resolve(repo, fileInput);
    const stat = await lstat(requested);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("invalid file");
    file = await realpath(requested);
  } catch {
    throw new TransitionError(code);
  }
  if (!isContained(repo, file)) throw new TransitionError(code);
  return { repo, file };
}

async function loadContract(repo, contractPath) {
  if (typeof repo !== "string" || typeof contractPath !== "string" || contractPath.length === 0) {
    throw new TransitionError("ARGUMENT_INVALID");
  }
  // Coordinator-owned contract evidence may live outside the repository;
  // unlike the manifest, this path is deliberately resolved independently.
  let file;
  try {
    file = await realpath(path.resolve(contractPath));
  } catch {
    throw new TransitionError("CONTRACT_INVALID");
  }
  const loaded = await readBoundedJson(file, "CONTRACT_INVALID");
  return { value: validateContract(loaded.value), sha256: sha256(loaded.bytes) };
}

async function loadManifest(repo, manifestPath) {
  const resolved = await resolveContainedFile(repo, manifestPath, "MANIFEST_INVALID");
  const loaded = await readBoundedJson(resolved.file, "MANIFEST_INVALID");
  let value;
  try {
    value = validateQualityManifest(loaded.value);
  } catch {
    throw new TransitionError("MANIFEST_INVALID");
  }
  if (value.test_contract === null || !Object.hasOwn(value.commands, "test")) {
    throw new TransitionError("MANIFEST_INVALID");
  }
  return { value, sha256: sha256(loaded.bytes) };
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
    throw new TransitionError(code);
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
    throw new TransitionError(code);
  }
}

function pathMatchesRule(testPath, rule) {
  const normalized = testPath.replaceAll("\\", "/");
  if (rule.type === "prefix") return normalized.startsWith(rule.value.replaceAll("\\", "/"));
  if (rule.type === "suffix") return normalized.endsWith(rule.value);
  return normalized.split("/").includes(rule.value);
}

function assertTestOnlyScope(contract, quality, manifest) {
  const actual = quality.repository?.changed_paths?.slice().sort() ?? [];
  if (JSON.stringify(actual) !== JSON.stringify(contract.test_paths)) {
    throw new TransitionError("TEST_SCOPE_INVALID");
  }
  const rules = manifest.test_contract.path_rules;
  if (!contract.test_paths.every((testPath) => rules.some((rule) => pathMatchesRule(testPath, rule)))) {
    throw new TransitionError("TEST_SCOPE_INVALID");
  }
}

function isCompletedFailure(command) {
  const execution = command?.execution;
  const versionPassed =
    command?.version_result === null ||
    (command?.version_result?.outcome === "completed" &&
      command.version_result.exit_code === 0 &&
      command.version_result.signal === null &&
      command.version_result.error_code === null);
  return (
    command?.id === "test" &&
    versionPassed &&
    execution?.outcome === "completed" &&
    Number.isSafeInteger(execution.exit_code) &&
    execution.exit_code !== 0 &&
    execution.signal === null
  );
}

function assertRedQuality(quality) {
  if (
    !isQualityResult(quality) ||
    quality.verdict !== "fail" ||
    quality.error_code !== "COMMAND_FAILED" ||
    quality.commands.length !== 1 ||
    !isCompletedFailure(quality.commands[0])
  ) {
    throw new TransitionError("RED_NOT_OBSERVED");
  }
}

function assertGreenQuality(quality) {
  if (
    !isQualityResult(quality) ||
    quality.verdict !== "pass" ||
    quality.commands.length !== 1 ||
    quality.commands[0]?.id !== "test" ||
    quality.commands[0]?.verdict !== "pass"
  ) {
    throw new TransitionError("GREEN_NOT_OBSERVED");
  }
}

async function resolveTestInputs(repo, candidateCommit, testPaths) {
  if (testPaths.length === 0) return [];
  const bytes = await gitBytes(repo, ["ls-tree", "-z", "--full-tree", candidateCommit, "--", ...testPaths], "TEST_SCOPE_INVALID");
  const requested = new Set(testPaths);
  const blobs = new Map();
  for (const record of bytes.toString("utf8").split("\u0000").filter(Boolean)) {
    const separator = record.indexOf("\t");
    const [mode, type, object, ...extra] = record.slice(0, separator).split(" ");
    const testPath = record.slice(separator + 1);
    if (
      separator < 0 || extra.length !== 0 || !/^[0-7]{6}$/.test(mode) || type !== "blob" ||
      !SAFE_COMMIT.test(object) || !requested.has(testPath) || blobs.has(testPath)
    ) {
      throw new TransitionError("TEST_SCOPE_INVALID");
    }
    blobs.set(testPath, object);
  }
  if (blobs.size !== requested.size) throw new TransitionError("TEST_SCOPE_INVALID");
  return testPaths.map((testPath) => ({ path: testPath, blob_sha: blobs.get(testPath) }));
}

function contractEvidence(contract, contractSha256, testInputs) {
  return {
    sha256: contractSha256,
    requirements: contract.requirements,
    test_identifiers: contract.test_identifiers,
    test_inputs: testInputs,
  };
}

function isTestInput(value) {
  return hasExactlyKeys(value, ["path", "blob_sha"]) && isSafeRelativePath(value.path) && SAFE_COMMIT.test(value.blob_sha);
}

function isContractEvidence(value) {
  return (
    hasExactlyKeys(value, ["sha256", "requirements", "test_identifiers", "test_inputs"]) &&
    SAFE_SHA256.test(value.sha256) &&
    uniqueStrings(value.requirements, (entry) => typeof entry === "string" && SAFE_REQUIREMENT.test(entry)) &&
    uniqueStrings(
      value.test_identifiers,
      (entry) =>
        typeof entry === "string" &&
        entry.trim() === entry &&
        entry.length > 0 &&
        !entry.includes("\u0000") &&
        Buffer.byteLength(entry, "utf8") <= 512,
    ) &&
    Array.isArray(value.test_inputs) &&
    value.test_inputs.length > 0 &&
    value.test_inputs.length <= MAX_ITEMS &&
    value.test_inputs.every(isTestInput) &&
    new Set(value.test_inputs.map((entry) => entry.path)).size === value.test_inputs.length
  );
}

function isRedEvidence(value) {
  return (
    value === null ||
    (hasExactlyKeys(value, ["sha256", "candidate_commit", "candidate_tree"]) &&
      SAFE_SHA256.test(value.sha256) &&
      SAFE_COMMIT.test(value.candidate_commit) &&
      SAFE_COMMIT.test(value.candidate_tree))
  );
}

export function isTestTransitionResult(value) {
  if (!hasExactlyKeys(value, RESULT_KEYS)) return false;
  if (value.schema_version !== TEST_TRANSITION_SCHEMA_VERSION || value.kind !== "team_harness_test_transition") {
    return false;
  }
  if (![null, "red", "green"].includes(value.transition) || !["pass", "fail"].includes(value.verdict)) return false;
  if (!ERROR_CODES.has(value.error_code) || !Number.isSafeInteger(value.duration_ms) || value.duration_ms < 0) return false;
  if (value.contract !== null && !isContractEvidence(value.contract)) return false;
  if (!isRedEvidence(value.red_evidence) || (value.quality !== null && !isQualityResult(value.quality))) return false;
  if (value.verdict === "pass" && (value.error_code !== null || value.transition === null || value.contract === null)) return false;
  if (value.verdict === "fail" && value.error_code === null) return false;
  if (value.transition === "red" && value.red_evidence !== null) return false;
  if (value.transition === "green" && value.verdict === "pass" && value.red_evidence === null) return false;
  if (
    value.verdict === "pass" &&
    (value.quality === null || value.quality.repository === null || value.quality.manifest === null)
  ) {
    return false;
  }
  if (value.verdict === "pass" && value.transition === "red" && !isCompletedFailure(value.quality.commands[0])) {
    return false;
  }
  if (
    value.verdict === "pass" &&
    value.transition === "red" &&
    (value.quality.verdict !== "fail" || value.quality.error_code !== "COMMAND_FAILED" || value.quality.commands.length !== 1)
  ) {
    return false;
  }
  if (
    value.verdict === "pass" &&
    value.transition === "green" &&
    (value.quality.verdict !== "pass" || value.quality.commands.length !== 1 || value.quality.commands[0]?.id !== "test")
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
    schema_version: TEST_TRANSITION_SCHEMA_VERSION,
    kind: "team_harness_test_transition",
    transition: state.transition,
    verdict: state.error_code === null ? "pass" : "fail",
    error_code: state.error_code,
    duration_ms: elapsedMs(startedAt),
    contract: state.contract,
    red_evidence: state.red_evidence,
    quality: state.quality,
  };
  if (isTestTransitionResult(result)) return result;
  return {
    schema_version: TEST_TRANSITION_SCHEMA_VERSION,
    kind: "team_harness_test_transition",
    transition: null,
    verdict: "fail",
    error_code: "INTERNAL_ERROR",
    duration_ms: 0,
    contract: null,
    red_evidence: null,
    quality: null,
  };
}

const OPTION_KEYS = [
  "transition",
  "repo",
  "manifest",
  "base",
  "candidate",
  "contract",
  "contractSha256",
  "redEvidence",
  "redEvidenceSha256",
];

function normalizeOptions(options) {
  const required = ["transition", "repo", "manifest", "base", "candidate", "contract"];
  if (!hasOnlyKeys(options, OPTION_KEYS, required) || !["red", "green"].includes(options.transition)) {
    throw new TransitionError("ARGUMENT_INVALID");
  }
  const strings = ["repo", "manifest", "base", "candidate", "contract"];
  if (strings.some((key) => typeof options[key] !== "string" || options[key].length === 0)) {
    throw new TransitionError("ARGUMENT_INVALID");
  }
  const greenFields = ["contractSha256", "redEvidence", "redEvidenceSha256"];
  const hasGreenFields = greenFields.every((key) => typeof options[key] === "string" && options[key].length > 0);
  if (options.transition === "green" && !hasGreenFields) throw new TransitionError("ARGUMENT_INVALID");
  if (options.transition === "red" && greenFields.some((key) => Object.hasOwn(options, key))) {
    throw new TransitionError("ARGUMENT_INVALID");
  }
  if (options.transition === "green" && (!SAFE_SHA256.test(options.contractSha256) || !SAFE_SHA256.test(options.redEvidenceSha256))) {
    throw new TransitionError("ARGUMENT_INVALID");
  }
  return options;
}

async function runQuality(options) {
  return runQualityChecks({
    repo: options.repo,
    manifest: options.manifest,
    base: options.base,
    candidate: options.candidate,
    checkpoint: `test_contract_${options.transition}`,
    checks: ["test"],
    requiredChecks: ["test"],
  });
}

async function executeRed(options, state, contract) {
  const manifest = await loadManifest(options.repo, options.manifest);
  state.quality = await runQuality(options);
  if (state.quality.repository === null || state.quality.manifest === null) {
    throw new TransitionError("QUALITY_RUNNER_FAILED");
  }
  if (manifest.sha256 !== state.quality.manifest.sha256) throw new TransitionError("MANIFEST_INVALID");
  assertRedQuality(state.quality);
  assertTestOnlyScope(contract.value, state.quality, manifest.value);
  const inputs = await resolveTestInputs(
    options.repo,
    state.quality.repository.candidate_commit,
    contract.value.test_paths,
  );
  state.contract = contractEvidence(contract.value, contract.sha256, inputs);
}

async function loadRedEvidence(options) {
  const loaded = await readBoundedJson(options.redEvidence, "RED_EVIDENCE_INVALID");
  if (sha256(loaded.bytes) !== options.redEvidenceSha256 || !isTestTransitionResult(loaded.value)) {
    throw new TransitionError("RED_EVIDENCE_INVALID");
  }
  const result = loaded.value;
  if (result.transition !== "red" || result.verdict !== "pass" || result.quality?.repository === null) {
    throw new TransitionError("RED_EVIDENCE_INVALID");
  }
  return { result, sha256: sha256(loaded.bytes) };
}

async function assertCompatibleGreen(options, state, contract, red) {
  if (contract.sha256 !== options.contractSha256 || contract.sha256 !== red.result.contract.sha256) {
    throw new TransitionError("TEST_INPUT_CHANGED");
  }
  const priorQuality = red.result.quality;
  const currentQuality = state.quality;
  if (
    priorQuality.manifest.sha256 !== currentQuality.manifest.sha256 ||
    priorQuality.repository.base_commit !== currentQuality.repository.base_commit ||
    priorQuality.repository.base_tree !== currentQuality.repository.base_tree ||
    priorQuality.commands[0].command_sha256 !== currentQuality.commands[0].command_sha256
  ) {
    throw new TransitionError("TEST_INPUT_CHANGED");
  }
  const mergeBase = await gitText(
    options.repo,
    ["merge-base", priorQuality.repository.candidate_commit, currentQuality.repository.candidate_commit],
    "RED_EVIDENCE_INVALID",
  );
  if (mergeBase !== priorQuality.repository.candidate_commit) throw new TransitionError("RED_EVIDENCE_INVALID");
  const inputs = await resolveTestInputs(
    options.repo,
    currentQuality.repository.candidate_commit,
    contract.value.test_paths,
  );
  if (JSON.stringify(inputs) !== JSON.stringify(red.result.contract.test_inputs)) {
    throw new TransitionError("TEST_INPUT_CHANGED");
  }
  state.contract = contractEvidence(contract.value, contract.sha256, inputs);
  state.red_evidence = {
    sha256: red.sha256,
    candidate_commit: priorQuality.repository.candidate_commit,
    candidate_tree: priorQuality.repository.candidate_tree,
  };
}

async function executeGreen(options, state, contract) {
  const manifest = await loadManifest(options.repo, options.manifest);
  const red = await loadRedEvidence(options);
  state.quality = await runQuality(options);
  if (state.quality.repository === null || state.quality.manifest === null) {
    throw new TransitionError("QUALITY_RUNNER_FAILED");
  }
  if (manifest.sha256 !== state.quality.manifest.sha256) throw new TransitionError("MANIFEST_INVALID");
  assertGreenQuality(state.quality);
  await assertCompatibleGreen(options, state, contract, red);
}

/** Run one red or green transition checkpoint and return closed JSON evidence. */
export async function runTestTransition(options) {
  const startedAt = process.hrtime.bigint();
  const state = { transition: null, error_code: null, contract: null, red_evidence: null, quality: null };
  try {
    const normalized = normalizeOptions(options);
    state.transition = normalized.transition;
    const contract = await loadContract(normalized.repo, normalized.contract);
    if (normalized.transition === "red") await executeRed(normalized, state, contract);
    else await executeGreen(normalized, state, contract);
  } catch (error) {
    state.error_code = error instanceof TransitionError && ERROR_CODES.has(error.code) ? error.code : "INTERNAL_ERROR";
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
    ["--contract", "contract"],
    ["--contract-sha256", "contractSha256"],
    ["--red-evidence", "redEvidence"],
    ["--red-evidence-sha256", "redEvidenceSha256"],
  ]);
  const values = {};
  if (argv.length % 2 !== 0) return null;
  for (let index = 0; index < argv.length; index += 2) {
    const key = flags.get(argv[index]);
    if (key === undefined || Object.hasOwn(values, key)) return null;
    values[key] = argv[index + 1];
  }
  return values;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runTestTransition(parseCli(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.verdict !== "pass") process.exitCode = 1;
}
