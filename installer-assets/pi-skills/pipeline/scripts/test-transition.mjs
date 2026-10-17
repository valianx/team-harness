#!/usr/bin/env node
/**
 * Prove a pre-implementation test transition from red to green.
 *
 * This companion keeps semantic judgment with the tester while mechanically
 * proving test-only red scope, immutable test inputs, and the same exact test
 * command succeeding after implementation.
 */

import { randomUUID } from "node:crypto";
import { lstat, open, realpath, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { isDirectExecution } from "./cli-entrypoint.mjs";

import {
  isQualityResult,
  runQualityChecks,
  validateQualityManifest,
} from "./quality-runner.mjs";
import {
  boundedDetail,
  canonicalHash,
  createBlobResolver,
  createBoundedJsonReader,
  createGitRunners,
  hasExactlyKeys,
  hasOnlyKeys,
  isBoundedDetail,
  isContained,
  isSafeRelativePath,
  pathMatchesRule,
  sha256,
} from "./quality-lib.mjs";

export const TEST_CONTRACT_SCHEMA_VERSION = 1;
export const TEST_TRANSITION_SCHEMA_VERSION = 3;
export const TEST_CONTRACT_VALIDATION_SCHEMA_VERSION = 1;
export const TEST_TRANSITION_RECEIPT_SCHEMA_VERSION = 3;

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
  "REPOSITORY_INVALID",
  "QUALITY_RUNNER_FAILED",
  "OUTPUT_WRITE_FAILED",
  "INTERNAL_ERROR",
]);
const RECEIPT_ERROR_CODES = new Set(ERROR_CODES);
const RESULT_KEYS = [
  "schema_version",
  "kind",
  "transition",
  "verdict",
  "error_code",
  "detail",
  "duration_ms",
  "diagnostic",
  "contract",
  "red_evidence",
  "quality",
];
const REQUIRED_RESULT_KEYS = RESULT_KEYS.filter((key) => key !== "detail");
const DIAGNOSTIC_KEYS = [
  "stage",
  "quality_error_code",
  "command_id",
  "command_verdict",
  "execution_outcome",
  "exit_code",
  "signal",
  "stdout_bytes",
  "stdout_truncated",
  "stdout_tail_available",
  "stderr_bytes",
  "stderr_truncated",
  "stderr_tail_available",
];

class TransitionError extends Error {
  constructor(code, detail = null) {
    super(code);
    this.code = code;
    this.detail = boundedDetail(detail);
  }
}

const transitionError = (code, detail = null) => new TransitionError(code, detail);
const readBoundedJson = createBoundedJsonReader(transitionError);
const { gitText, gitBytes } = createGitRunners(transitionError);
const resolveBlobsAtCommit = createBlobResolver(gitBytes, transitionError);

async function persistResult(outputPath, result) {
  if (typeof outputPath !== "string" || !path.isAbsolute(outputPath) || outputPath.includes("\u0000")) {
    throw new TransitionError("ARGUMENT_INVALID");
  }
  const target = path.resolve(outputPath);
  const parent = path.dirname(target);
  const parentStat = await lstat(parent);
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink() || await realpath(parent) !== parent) {
    throw new TransitionError("ARGUMENT_INVALID");
  }
  try {
    const targetStat = await lstat(target);
    if (!targetStat.isFile() || targetStat.isSymbolicLink()) throw new TransitionError("ARGUMENT_INVALID");
  } catch (error) {
    if (error instanceof TransitionError) throw error;
    if (error?.code !== "ENOENT") throw error;
  }
  const bytes = Buffer.from(`${JSON.stringify(result)}\n`);
  const temporary = path.join(parent, `.${path.basename(target)}.tmp-${process.pid}-${Date.now()}-${randomUUID()}`);
  let handle;
  let ownsTemporary = false;
  try {
    handle = await open(temporary, "wx", 0o600);
    ownsTemporary = true;
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = null;
    const currentParent = await realpath(parent);
    if (currentParent !== parent) throw new TransitionError("ARGUMENT_INVALID");
    try {
      const targetStat = await lstat(target);
      if (!targetStat.isFile() || targetStat.isSymbolicLink()) throw new TransitionError("ARGUMENT_INVALID");
    } catch (error) {
      if (error instanceof TransitionError) throw error;
      if (error?.code !== "ENOENT") throw error;
    }
    await rename(temporary, target);
    ownsTemporary = false;
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    if (ownsTemporary) await unlink(temporary).catch(() => {});
    if (error instanceof TransitionError) throw error;
    throw new TransitionError("OUTPUT_WRITE_FAILED");
  }
  return {
    schema_version: TEST_TRANSITION_RECEIPT_SCHEMA_VERSION,
    kind: "team_harness_test_transition_receipt",
    verdict: result.verdict,
    error_code: result.error_code,
    transition: result.transition,
    diagnostic: result.diagnostic,
    result_path: target,
    result_sha256: sha256(bytes),
    result_bytes: bytes.length,
  };
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

/** Validate one tester-authored contract with the transition's exact schema. */
export async function validateTestContractFile(contractPath, context = null) {
  const startedAt = process.hrtime.bigint();
  let errorCode = null;
  let contractSha256 = null;
  try {
    if (typeof contractPath !== "string" || contractPath.length === 0) throw new TransitionError("ARGUMENT_INVALID");
    const file = await realpath(path.resolve(contractPath));
    const loaded = await readBoundedJson(file, "CONTRACT_INVALID");
    const contract = validateContract(loaded.value);
    contractSha256 = sha256(loaded.bytes);
    if (context !== null) {
      if (
        typeof context !== "object" || Array.isArray(context) ||
        !hasExactlyKeys(context, ["repo", "workspace", "manifest", "base", "candidate"]) ||
        Object.values(context).some((entry) => typeof entry !== "string" || entry.length === 0)
      ) {
        throw new TransitionError("ARGUMENT_INVALID");
      }
      if (!SAFE_COMMIT.test(context.base) || !(context.candidate === "HEAD" || SAFE_COMMIT.test(context.candidate))) {
        throw new TransitionError("ARGUMENT_INVALID");
      }
      let repo;
      try {
        repo = await realpath(path.resolve(context.repo));
        const stat = await lstat(repo);
        if (!stat.isDirectory()) throw new Error("not a repository");
      } catch {
        throw new TransitionError("ARGUMENT_INVALID");
      }
      const manifest = await loadManifest(repo, context.workspace, context.manifest);
      const baseCommit = await gitText(repo, ["rev-parse", "--verify", `${context.base}^{commit}`], "TEST_SCOPE_INVALID");
      const candidateCommit = await gitText(repo, ["rev-parse", "--verify", `${context.candidate}^{commit}`], "TEST_SCOPE_INVALID");
      const mergeBase = await gitText(repo, ["merge-base", baseCommit, candidateCommit], "TEST_SCOPE_INVALID");
      if (mergeBase !== baseCommit) throw new TransitionError("TEST_SCOPE_INVALID");
      const changed = await gitBytes(
        repo,
        ["diff", "--name-only", "-z", baseCommit, candidateCommit, "--"],
        "TEST_SCOPE_INVALID",
      );
      const changedPaths = changed.toString("utf8").split("\u0000").filter(Boolean).sort();
      if (!changedPaths.every(isSafeRelativePath) || new Set(changedPaths).size !== changedPaths.length) {
        throw new TransitionError("TEST_SCOPE_INVALID");
      }
      assertTestOnlyScope(contract, { repository: { changed_paths: changedPaths } }, manifest.value);
    }
  } catch (error) {
    errorCode = error instanceof TransitionError && ["ARGUMENT_INVALID", "MANIFEST_INVALID", "CONTRACT_INVALID", "TEST_SCOPE_INVALID"].includes(error.code)
      ? error.code
      : "INTERNAL_ERROR";
  }
  return {
    schema_version: TEST_CONTRACT_VALIDATION_SCHEMA_VERSION,
    kind: "team_harness_test_contract_validation",
    verdict: errorCode === null ? "pass" : "fail",
    error_code: errorCode,
    duration_ms: Number((process.hrtime.bigint() - startedAt) / 1_000_000n),
    contract_sha256: contractSha256,
  };
}

async function resolveWorkspaceManifest(repoInput, workspaceInput, manifestInput) {
  if (
    typeof repoInput !== "string" ||
    typeof workspaceInput !== "string" ||
    typeof manifestInput !== "string" ||
    workspaceInput.length === 0 ||
    manifestInput.length === 0 ||
    workspaceInput.includes("\u0000") ||
    manifestInput.includes("\u0000") ||
    !path.isAbsolute(workspaceInput) ||
    !path.isAbsolute(manifestInput)
  ) {
    throw new TransitionError("ARGUMENT_INVALID");
  }
  let repo;
  let workspace;
  let manifest;
  try {
    const repoStat = await lstat(repoInput);
    if (!repoStat.isDirectory() || repoStat.isSymbolicLink()) throw new Error("invalid repository");
    repo = await realpath(path.resolve(repoInput));
    const workspaceStat = await lstat(workspaceInput);
    if (!workspaceStat.isDirectory() || workspaceStat.isSymbolicLink()) throw new Error("invalid workspace");
    workspace = await realpath(workspaceInput);
    const manifestStat = await lstat(manifestInput);
    if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) throw new Error("invalid manifest");
    manifest = await realpath(manifestInput);
  } catch {
    throw new TransitionError("MANIFEST_INVALID");
  }
  if (
    workspace === repo ||
    !isContained(workspace, manifest)
  ) {
    throw new TransitionError("MANIFEST_INVALID");
  }
  if (isContained(repo, manifest)) {
    const repositoryRelative = path.relative(repo, manifest).split(path.sep).join("/");
    try {
      await gitBytes(repo, ["check-ignore", "-q", "--", repositoryRelative], "MANIFEST_INVALID");
    } catch {
      throw new TransitionError("MANIFEST_INVALID");
    }
  }
  return manifest;
}

async function loadContract(repo, contractPath) {
  if (typeof repo !== "string" || typeof contractPath !== "string" || contractPath.length === 0) {
    throw new TransitionError("ARGUMENT_INVALID");
  }
  // Coordinator-owned contract evidence may live outside the repository;
  // it is deliberately resolved independently from the workspace-bound manifest.
  let file;
  try {
    file = await realpath(path.resolve(contractPath));
  } catch {
    throw new TransitionError("CONTRACT_INVALID");
  }
  const loaded = await readBoundedJson(file, "CONTRACT_INVALID");
  return {
    value: validateContract(loaded.value),
    sha256: sha256(loaded.bytes),
    canonical_sha256: canonicalHash(loaded.value),
  };
}

async function loadManifest(repo, workspace, manifestPath) {
  const resolved = await resolveWorkspaceManifest(repo, workspace, manifestPath);
  const loaded = await readBoundedJson(resolved, "MANIFEST_INVALID");
  let value;
  try {
    value = validateQualityManifest(loaded.value, { selectedChecks: ["test"] });
  } catch {
    throw new TransitionError("MANIFEST_INVALID");
  }
  if (value.test_contract === null || !Object.hasOwn(value.commands, "test")) {
    throw new TransitionError("MANIFEST_INVALID");
  }
  return { value, sha256: sha256(loaded.bytes) };
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
  if (!isQualityResult(quality)) throw new TransitionError("QUALITY_RUNNER_FAILED");
  const testCommand = quality.commands.length === 1 && quality.commands[0]?.id === "test"
    ? quality.commands[0]
    : null;
  if (quality.verdict === "fail") {
    if (quality.error_code === "COMMAND_FAILED" && testCommand?.verdict === "fail") {
      throw new TransitionError("GREEN_NOT_OBSERVED");
    }
    throw new TransitionError("QUALITY_RUNNER_FAILED");
  }
  if (quality.verdict !== "pass" || testCommand?.verdict !== "pass") {
    throw new TransitionError("QUALITY_RUNNER_FAILED");
  }
}

async function resolveTestInputs(repo, candidateCommit, testPaths) {
  if (testPaths.length === 0) return [];
  const blobs = await resolveBlobsAtCommit(repo, candidateCommit, testPaths, "TEST_SCOPE_INVALID");
  return testPaths.map((testPath) => ({ path: testPath, blob_sha: blobs.get(testPath) }));
}

function manifestTestBinding(manifest) {
  return canonicalHash({
    schema_version: manifest.schema_version,
    test_command: manifest.commands.test,
    test_contract: manifest.test_contract,
  });
}

function contractEvidence(contract, testInputs, testBindingSha256) {
  return {
    sha256: contract.sha256,
    canonical_sha256: contract.canonical_sha256,
    test_binding_sha256: testBindingSha256,
    requirements: contract.value.requirements,
    test_identifiers: contract.value.test_identifiers,
    test_inputs: testInputs,
  };
}

function isTestInput(value) {
  return hasExactlyKeys(value, ["path", "blob_sha"]) && isSafeRelativePath(value.path) && SAFE_COMMIT.test(value.blob_sha);
}

function isContractEvidence(value) {
  return (
    hasExactlyKeys(value, ["sha256", "canonical_sha256", "test_binding_sha256", "requirements", "test_identifiers", "test_inputs"]) &&
    SAFE_SHA256.test(value.sha256) &&
    SAFE_SHA256.test(value.canonical_sha256) &&
    SAFE_SHA256.test(value.test_binding_sha256) &&
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

function isTransitionDiagnostic(value) {
  if (value === null) return true;
  if (!hasExactlyKeys(value, DIAGNOSTIC_KEYS)) return false;
  if (!["transition-input", "quality-precondition", "test-command", "quality-postcondition", "transition-proof"].includes(value.stage)) return false;
  if (value.quality_error_code !== null && typeof value.quality_error_code !== "string") return false;
  if (value.command_id !== null && typeof value.command_id !== "string") return false;
  if (value.command_verdict !== null && !["pass", "fail"].includes(value.command_verdict)) return false;
  if (value.execution_outcome !== null && !["completed", "timed_out", "spawn_error", "argument_invalid", "internal_error"].includes(value.execution_outcome)) return false;
  if (value.exit_code !== null && !Number.isSafeInteger(value.exit_code)) return false;
  if (value.signal !== null && !/^SIG[A-Z0-9]+$/.test(value.signal)) return false;
  for (const key of ["stdout_bytes", "stderr_bytes"]) {
    if (value[key] !== null && (!Number.isSafeInteger(value[key]) || value[key] < 0)) return false;
  }
  for (const key of ["stdout_truncated", "stdout_tail_available", "stderr_truncated", "stderr_tail_available"]) {
    if (value[key] !== null && typeof value[key] !== "boolean") return false;
  }
  return true;
}

function transitionDiagnostic(state) {
  if (state.error_code === null) return null;
  const quality = isQualityResult(state.quality) ? state.quality : null;
  const command = quality?.commands.find((entry) => entry.id === "test") ?? quality?.commands[0] ?? null;
  const execution = command?.execution ?? null;
  let stage = "transition-input";
  if (quality !== null) {
    if (command?.verdict === "fail") stage = "test-command";
    else if (quality.verdict === "fail") stage = command === null ? "quality-precondition" : "quality-postcondition";
    else stage = "transition-proof";
  }
  return {
    stage,
    quality_error_code: quality?.error_code ?? null,
    command_id: command?.id ?? null,
    command_verdict: command?.verdict ?? null,
    execution_outcome: execution?.outcome ?? null,
    exit_code: execution?.exit_code ?? null,
    signal: execution?.signal ?? null,
    stdout_bytes: execution?.stdout?.bytes ?? null,
    stdout_truncated: execution?.stdout?.truncated ?? null,
    stdout_tail_available: execution?.stdout ? execution.stdout.tail !== null : null,
    stderr_bytes: execution?.stderr?.bytes ?? null,
    stderr_truncated: execution?.stderr?.truncated ?? null,
    stderr_tail_available: execution?.stderr ? execution.stderr.tail !== null : null,
  };
}

export function isTestTransitionResult(value) {
  if (!hasOnlyKeys(value, RESULT_KEYS, REQUIRED_RESULT_KEYS)) return false;
  if (value.schema_version !== TEST_TRANSITION_SCHEMA_VERSION || value.kind !== "team_harness_test_transition") {
    return false;
  }
  if (![null, "red", "green"].includes(value.transition) || !["pass", "fail"].includes(value.verdict)) return false;
  if (!ERROR_CODES.has(value.error_code) || !Number.isSafeInteger(value.duration_ms) || value.duration_ms < 0) return false;
  const detail = Object.hasOwn(value, "detail") ? value.detail : null;
  if (!isBoundedDetail(detail)) return false;
  if (value.verdict === "pass" && detail !== null) return false;
  if (!isTransitionDiagnostic(value.diagnostic)) return false;
  if (value.contract !== null && !isContractEvidence(value.contract)) return false;
  if (!isRedEvidence(value.red_evidence) || (value.quality !== null && !isQualityResult(value.quality))) return false;
  if (value.verdict === "pass" && (value.error_code !== null || value.transition === null || value.contract === null)) return false;
  if (value.verdict === "fail" && value.error_code === null) return false;
  if ((value.verdict === "pass") !== (value.diagnostic === null)) return false;
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

export function isTestTransitionReceipt(value) {
  const keys = [
    "schema_version", "kind", "verdict", "error_code", "transition", "diagnostic",
    "result_path", "result_sha256", "result_bytes",
  ];
  if (!hasExactlyKeys(value, keys)) return false;
  if (value.schema_version !== TEST_TRANSITION_RECEIPT_SCHEMA_VERSION
    || value.kind !== "team_harness_test_transition_receipt"
    || !["pass", "fail"].includes(value.verdict)
    || !RECEIPT_ERROR_CODES.has(value.error_code)
    || ![null, "red", "green"].includes(value.transition)
    || !isTransitionDiagnostic(value.diagnostic)) return false;
  const persisted = typeof value.result_path === "string" && path.isAbsolute(value.result_path)
    && SAFE_SHA256.test(value.result_sha256)
    && Number.isSafeInteger(value.result_bytes) && value.result_bytes > 0;
  const unavailable = value.result_path === null && value.result_sha256 === null && value.result_bytes === null;
  if (!persisted && !unavailable) return false;
  if (value.verdict === "pass") return value.error_code === null && persisted && value.diagnostic === null;
  return value.error_code !== null;
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
    detail: state.detail,
    duration_ms: elapsedMs(startedAt),
    diagnostic: transitionDiagnostic(state),
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
    detail: null,
    duration_ms: 0,
    diagnostic: {
      stage: "transition-input",
      quality_error_code: null,
      command_id: null,
      command_verdict: null,
      execution_outcome: null,
      exit_code: null,
      signal: null,
      stdout_bytes: null,
      stdout_truncated: null,
      stdout_tail_available: null,
      stderr_bytes: null,
      stderr_truncated: null,
      stderr_tail_available: null,
    },
    contract: null,
    red_evidence: null,
    quality: null,
  };
}

const OPTION_KEYS = [
  "transition",
  "repo",
  "workspace",
  "manifest",
  "base",
  "candidate",
  "contract",
  "contractSha256",
  "redEvidence",
  "redEvidenceSha256",
];

function normalizeOptions(options) {
  const required = ["transition", "repo", "workspace", "manifest", "base", "candidate", "contract"];
  if (!hasOnlyKeys(options, OPTION_KEYS, required) || !["red", "green"].includes(options.transition)) {
    throw new TransitionError("ARGUMENT_INVALID");
  }
  const strings = ["repo", "workspace", "manifest", "base", "candidate", "contract"];
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
    workspace: options.workspace,
    manifest: options.manifest,
    base: options.base,
    candidate: options.candidate,
    checkpoint: `test_contract_${options.transition}`,
    checks: ["test"],
    requiredChecks: ["test"],
  });
}

async function executeRed(options, state, contract) {
  const manifest = await loadManifest(options.repo, options.workspace, options.manifest);
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
  state.contract = contractEvidence(contract, inputs, manifestTestBinding(manifest.value));
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

async function assertCompatibleGreen(options, state, contract, red, manifest) {
  if (
    contract.sha256 !== options.contractSha256 ||
    contract.sha256 !== red.result.contract.sha256 ||
    contract.canonical_sha256 !== red.result.contract.canonical_sha256
  ) {
    throw new TransitionError("TEST_INPUT_CHANGED", "the test contract differs from the red-checkpoint contract");
  }
  const priorQuality = red.result.quality;
  const currentQuality = state.quality;
  if (
    red.result.contract.test_binding_sha256 !== manifestTestBinding(manifest.value) ||
    priorQuality.repository.base_commit !== currentQuality.repository.base_commit ||
    priorQuality.repository.base_tree !== currentQuality.repository.base_tree ||
    priorQuality.commands[0].command_sha256 !== currentQuality.commands[0].command_sha256 ||
    priorQuality.commands[0].execution_argv_sha256 !== currentQuality.commands[0].execution_argv_sha256 ||
    priorQuality.commands[0].execution_resolution !== currentQuality.commands[0].execution_resolution ||
    priorQuality.commands[0].version_fingerprint !== currentQuality.commands[0].version_fingerprint
  ) {
    throw new TransitionError("TEST_INPUT_CHANGED", "the test binding, base, or effective test runtime changed after red");
  }
  const mergeBase = await gitText(
    options.repo,
    ["merge-base", priorQuality.repository.candidate_commit, currentQuality.repository.candidate_commit],
    "REPOSITORY_INVALID",
  );
  if (mergeBase !== priorQuality.repository.candidate_commit) {
    throw new TransitionError("RED_EVIDENCE_INVALID", "the red candidate is not an ancestor of the green candidate");
  }
  const inputs = await resolveTestInputs(
    options.repo,
    currentQuality.repository.candidate_commit,
    contract.value.test_paths,
  );
  if (JSON.stringify(inputs) !== JSON.stringify(red.result.contract.test_inputs)) {
    throw new TransitionError("TEST_INPUT_CHANGED", "test file blobs changed between red and green");
  }
  state.contract = contractEvidence(contract, inputs, manifestTestBinding(manifest.value));
  state.red_evidence = {
    sha256: red.sha256,
    candidate_commit: priorQuality.repository.candidate_commit,
    candidate_tree: priorQuality.repository.candidate_tree,
  };
}

async function executeGreen(options, state, contract) {
  const manifest = await loadManifest(options.repo, options.workspace, options.manifest);
  const red = await loadRedEvidence(options);
  state.quality = await runQuality(options);
  if (state.quality.repository === null || state.quality.manifest === null) {
    throw new TransitionError("QUALITY_RUNNER_FAILED");
  }
  if (manifest.sha256 !== state.quality.manifest.sha256) throw new TransitionError("MANIFEST_INVALID");
  assertGreenQuality(state.quality);
  await assertCompatibleGreen(options, state, contract, red, manifest);
}

/** Run one red or green transition checkpoint and return closed JSON evidence. */
export async function runTestTransition(options) {
  const startedAt = process.hrtime.bigint();
  const state = { transition: null, error_code: null, detail: null, contract: null, red_evidence: null, quality: null };
  try {
    const normalized = normalizeOptions(options);
    state.transition = normalized.transition;
    const contract = await loadContract(normalized.repo, normalized.contract);
    if (normalized.transition === "red") await executeRed(normalized, state, contract);
    else await executeGreen(normalized, state, contract);
  } catch (error) {
    state.error_code = error instanceof TransitionError && ERROR_CODES.has(error.code) ? error.code : "INTERNAL_ERROR";
    state.detail = error instanceof TransitionError ? error.detail : null;
  }
  return safeResult(state, startedAt);
}

function parseCli(argv) {
  const flags = new Map([
    ["--transition", "transition"],
    ["--repo", "repo"],
    ["--workspace", "workspace"],
    ["--manifest", "manifest"],
    ["--base", "base"],
    ["--candidate", "candidate"],
    ["--contract", "contract"],
    ["--contract-sha256", "contractSha256"],
    ["--red-evidence", "redEvidence"],
    ["--red-evidence-sha256", "redEvidenceSha256"],
    ["--output", "output"],
  ]);
  if (argv.length === 1 || (argv.length === 2 && ["red", "green"].includes(argv[0]))) {
    const raw = argv.length === 1 ? argv[0] : argv[1];
    if (typeof raw !== "string" || Buffer.byteLength(raw, "utf8") > 64 * 1024) return null;
    try {
      const value = JSON.parse(raw);
      if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
      if (argv.length === 2) {
        if (Object.hasOwn(value, "transition")) return null;
        value.transition = argv[0];
      }
      return value;
    } catch { return null; }
  }
  const values = {};
  if (argv.length % 2 !== 0) return null;
  for (let index = 0; index < argv.length; index += 2) {
    const key = flags.get(argv[index]);
    if (key === undefined || Object.hasOwn(values, key)) return null;
    values[key] = argv[index + 1];
  }
  return values;
}

if (isDirectExecution(import.meta.url)) {
  const argv = process.argv.slice(2);
  let result;
  if (argv[0] === "--validate-contract") {
    if (argv.length === 2) {
      result = await validateTestContractFile(argv[1]);
    } else {
      const flags = new Map([
        ["--repo", "repo"],
        ["--workspace", "workspace"],
        ["--manifest", "manifest"],
        ["--base", "base"],
        ["--candidate", "candidate"],
      ]);
      const context = {};
      if (argv.length !== 12) result = await validateTestContractFile("", null);
      else {
        for (let index = 2; index < argv.length; index += 2) {
          const key = flags.get(argv[index]);
          if (key === undefined || Object.hasOwn(context, key)) {
            result = await validateTestContractFile("", null);
            break;
          }
          context[key] = argv[index + 1];
        }
        if (result === undefined) result = await validateTestContractFile(argv[1], context);
      }
    }
  } else {
    const parsed = parseCli(argv);
    const output = parsed?.output;
    if (parsed && Object.hasOwn(parsed, "output")) delete parsed.output;
    const transition = await runTestTransition(parsed);
    if (output === undefined) result = transition;
    else {
      try { result = await persistResult(output, transition); }
      catch (error) {
        result = {
          schema_version: TEST_TRANSITION_RECEIPT_SCHEMA_VERSION,
          kind: "team_harness_test_transition_receipt",
          verdict: "fail",
          error_code: error instanceof TransitionError ? error.code : "OUTPUT_WRITE_FAILED",
          transition: transition.transition,
          diagnostic: transition.diagnostic,
          result_path: null,
          result_sha256: null,
          result_bytes: null,
        };
      }
    }
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.verdict !== "pass") process.exitCode = 1;
}
