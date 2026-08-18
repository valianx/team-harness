#!/usr/bin/env node
/**
 * Run repository-declared quality commands against one clean Git candidate.
 *
 * The manifest owns command selection. This runner owns immutable Git identity,
 * argv-only execution, bounded output, normalized CRAP calculation, and a
 * closed JSON evidence envelope. It never installs tools, invokes a shell, or
 * decides whether a behavioral assertion expresses the approved intent.
 */

import { randomUUID } from "node:crypto";
import { lstat, mkdtemp, open, realpath, rename, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { isBoundedCommandEnvelope, runBoundedCommand } from "./bounded-command.mjs";
import {
  MAX_DETAIL_CHARS,
  boundedDetail,
  canonicalHash,
  createBoundedJsonReader,
  createGitRunners,
  hasExactlyKeys,
  hasOnlyKeys,
  isBoundedDetail,
  isContained,
  isSafeRelativePath,
  sha256,
} from "./quality-lib.mjs";

export const QUALITY_MANIFEST_SCHEMA_VERSION = 1;
export const QUALITY_RESULT_SCHEMA_VERSION = 3;
export const QUALITY_RECEIPT_SCHEMA_VERSION = 1;
export const CRAP_REPORT_SCHEMA_VERSION = 1;
export const CRAP_REPORT_TOKEN = "${TH_QUALITY_REPORT}";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_TIMEOUT_MS = 60 * 60 * 1000;
const MAX_CHANGED_PATHS = 512;
const MAX_FUNCTIONS = 512;
const MAX_ARGV_ITEMS = 128;
const MAX_ARGV_ITEM_BYTES = 8 * 1024;
const MAX_ARGV_BYTES = 64 * 1024;
const SAFE_CHECKPOINT = /^[a-z][a-z0-9_-]{0,63}$/;
const SAFE_COMMAND_ID = /^[a-z][a-z0-9_]{0,31}$/;
const SAFE_COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;
const ACCEPTANCE_CRITICAL_COMMANDS = new Set(["test", "crap"]);
const COMMAND_FIELDS = ["command", "argv", "version_argv", "working_directory", "timeout_ms", "required_environment", "severity", "commands"];
const ERROR_CODES = new Set([
  null,
  "ARGUMENT_INVALID",
  "MANIFEST_ABSENT",
  "MANIFEST_INVALID",
  "REPOSITORY_INVALID",
  "REF_INVALID",
  "CANDIDATE_NOT_HEAD",
  "BASE_NOT_ANCESTOR",
  "WORKTREE_DIRTY",
  "WORKTREE_MUTATED",
  "SCOPE_TOO_LARGE",
  "COMMAND_FAILED",
  "TIMEOUT",
  "SPAWN_FAILED",
  "CRAP_REPORT_INVALID",
  "CRAP_REPORT_INCOMPLETE",
  "CRAP_POLICY_FAILED",
  "BASELINE_INVALID",
  "REQUIRED_CHECKS_MISSING",
  "PREREQUISITE_UNAVAILABLE",
  "NON_HERMETIC_COMMAND",
  "OUTPUT_WRITE_FAILED",
  "INTERNAL_ERROR",
]);
const RESULT_KEYS = [
  "schema_version",
  "kind",
  "checkpoint",
  "verdict",
  "error_code",
  "error_context",
  "detail",
  "duration_ms",
  "repository",
  "manifest",
  "baseline",
  "commands",
  "crap",
];
const REQUIRED_RESULT_KEYS = RESULT_KEYS.filter((key) => key !== "detail");

const COMMAND_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["argv"],
  properties: {
    argv: { type: "array", minItems: 1, maxItems: MAX_ARGV_ITEMS, items: { type: "string" } },
    working_directory: { type: "string" },
    timeout_ms: { type: "integer", minimum: 1, maximum: MAX_TIMEOUT_MS },
    version_argv: {
      type: "array",
      minItems: 1,
      maxItems: MAX_ARGV_ITEMS,
      items: { type: "string" },
    },
    required_environment: {
      type: "array",
      maxItems: 32,
      uniqueItems: true,
      items: { type: "string", pattern: "^[A-Z][A-Z0-9_]{0,127}$" },
    },
    severity: { enum: ["blocking", "advisory"] },
  },
};

export const QUALITY_MANIFEST_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "team-harness/quality-manifest/v1",
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "commands"],
  properties: {
    schema_version: { const: QUALITY_MANIFEST_SCHEMA_VERSION },
    commands: {
      type: "object",
      minProperties: 1,
      additionalProperties: false,
      patternProperties: { "^[a-z][a-z0-9_]{0,31}$": COMMAND_SCHEMA },
    },
    crap: {
      type: "object",
      additionalProperties: false,
      required: ["new_function_max", "changed_function_may_worsen"],
      properties: {
        new_function_max: { type: "number", minimum: 0 },
        changed_function_may_worsen: { type: "boolean" },
      },
    },
    test_contract: {
      type: "object",
      additionalProperties: false,
      required: ["path_rules"],
      properties: {
        path_rules: {
          type: "array",
          minItems: 1,
          maxItems: 32,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["type", "value"],
            properties: {
              type: { enum: ["prefix", "suffix", "segment"] },
              value: { type: "string" },
            },
          },
        },
      },
    },
  },
};

export const QUALITY_RESULT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "team-harness/quality-result/v3",
  type: "object",
  additionalProperties: false,
  required: REQUIRED_RESULT_KEYS,
  properties: {
    schema_version: { const: QUALITY_RESULT_SCHEMA_VERSION },
    kind: { const: "team_harness_quality" },
    checkpoint: { anyOf: [{ type: "null" }, { type: "string", pattern: "^[a-z][a-z0-9_-]{0,63}$" }] },
    verdict: { enum: ["pass", "fail"] },
    error_code: { anyOf: [{ type: "null" }, { enum: [...ERROR_CODES].filter((value) => value !== null) }] },
    error_context: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["command_id", "field"],
          properties: {
            command_id: { type: "string", pattern: "^[a-z][a-z0-9_]{0,31}$" },
            field: { enum: COMMAND_FIELDS },
          },
        },
      ],
    },
    detail: { anyOf: [{ type: "null" }, { type: "string", minLength: 1, maxLength: MAX_DETAIL_CHARS }] },
    duration_ms: { type: "integer", minimum: 0 },
    repository: { anyOf: [{ type: "null" }, { type: "object" }] },
    manifest: { anyOf: [{ type: "null" }, { type: "object" }] },
    baseline: { anyOf: [{ type: "null" }, { type: "object" }] },
    commands: { type: "array" },
    crap: { anyOf: [{ type: "null" }, { type: "object" }] },
  },
};

function boundedToken(value) {
  const text = typeof value === "string" ? value : String(value);
  return boundedDetail(text.slice(0, 64)) ?? "(unprintable)";
}

class QualityError extends Error {
  constructor(code, { detail = null, context = null } = {}) {
    super(code);
    this.code = code;
    this.detail = boundedDetail(detail);
    this.context = isErrorContext(context) ? context : null;
  }
}

function qualityError(code, detail = null) {
  return new QualityError(code, { detail });
}

const readBoundedJson = createBoundedJsonReader(qualityError);
const { gitText: gitTextWithCode, gitBytes: gitBytesWithCode } = createGitRunners(qualityError);

async function git(repo, args) {
  return gitBytesWithCode(repo, args, "REPOSITORY_INVALID");
}

async function gitText(repo, args) {
  return gitTextWithCode(repo, args, "REPOSITORY_INVALID");
}

function isErrorContext(value) {
  return hasExactlyKeys(value, ["command_id", "field"])
    && typeof value.command_id === "string"
    && SAFE_COMMAND_ID.test(value.command_id)
    && COMMAND_FIELDS.includes(value.field);
}

export function isQualityCommandId(value) {
  return typeof value === "string" && SAFE_COMMAND_ID.test(value);
}

const PACKAGE_MANAGERS = new Set(["npm", "pnpm", "yarn", "bun"]);
const LEADING_OPTIONS_WITH_VALUE = new Set([
  "--cache", "--config", "--cwd", "--dir", "--global-dir", "--globalconfig",
  "--install-directory", "--prefix", "--store-dir", "--userconfig",
]);
const LEADING_FLAGS = new Set([
  "--color", "--no-color", "--offline", "--prefer-offline", "--silent", "--verbose",
]);

function normalizeExecutable(value) {
  return path.basename(value).toLowerCase().replace(/\.(?:bat|cmd|exe|ps1)$/u, "");
}

function skipLeadingOptions(argv, offset) {
  while (offset < argv.length && argv[offset].startsWith("-")) {
    const option = argv[offset].toLowerCase();
    if (option === "--") return offset + 1;
    if (option.includes("=") || LEADING_FLAGS.has(option)) {
      offset += 1;
      continue;
    }
    if (LEADING_OPTIONS_WITH_VALUE.has(option) && typeof argv[offset + 1] === "string") {
      offset += 2;
      continue;
    }
    throw qualityError("NON_HERMETIC_COMMAND", "unsupported package-manager leading option");
  }
  return offset;
}

function packageManagerInvocation(argv) {
  let executable = normalizeExecutable(argv[0]);
  let offset = 1;
  if (executable === "corepack") {
    offset = skipLeadingOptions(argv, offset);
    executable = normalizeExecutable(argv[offset] ?? "");
    if (!PACKAGE_MANAGERS.has(executable)) {
      throw qualityError("NON_HERMETIC_COMMAND", "corepack may only wrap a known package manager");
    }
    offset += 1;
  }
  if (!PACKAGE_MANAGERS.has(executable)) return null;
  offset = skipLeadingOptions(argv, offset);
  return { executable, operation: argv[offset]?.toLowerCase() ?? null, operationOffset: offset };
}

function validateArgv(argv, { requireReportToken = false, allowLocalPnpmExec = false, enforceHermetic = true } = {}) {
  if (!Array.isArray(argv) || argv.length === 0 || argv.length > MAX_ARGV_ITEMS) {
    throw qualityError("MANIFEST_INVALID", "argv must be a non-empty string array with at most 128 items");
  }
  let bytes = 0;
  let reportTokens = 0;
  for (const argument of argv) {
    if (typeof argument !== "string" || argument.length === 0 || argument.includes("\u0000")) {
      throw qualityError("MANIFEST_INVALID", "argv items must be non-empty strings without NUL bytes");
    }
    const itemBytes = Buffer.byteLength(argument, "utf8");
    if (itemBytes > MAX_ARGV_ITEM_BYTES || bytes > MAX_ARGV_BYTES - itemBytes) {
      throw qualityError("MANIFEST_INVALID", "argv exceeds the per-item or total byte bound");
    }
    bytes += itemBytes;
    if (argument === CRAP_REPORT_TOKEN) reportTokens += 1;
  }
  if (requireReportToken ? reportTokens !== 1 : reportTokens !== 0) {
    throw qualityError("MANIFEST_INVALID", requireReportToken
      ? "crap argv must contain the report token exactly once"
      : "only the crap argv may contain the report token");
  }
  if (!enforceHermetic) return argv.slice();
  const executable = normalizeExecutable(argv[0]);
  const invocation = packageManagerInvocation(argv);
  const operation = invocation?.operation ?? null;
  const manager = invocation?.executable ?? null;
  const localPnpmExec = manager === "pnpm" && operation === "exec";
  const nonHermetic = ["npx", "pnpx", "bunx"].includes(executable)
    || (manager === "npm" && ["exec", "x"].includes(operation))
    || (manager === "pnpm" && operation === "dlx")
    || (manager === "yarn" && ["exec", "dlx"].includes(operation))
    || (manager === "bun" && operation === "x")
    || (localPnpmExec && !allowLocalPnpmExec);
  if (nonHermetic) throw qualityError("NON_HERMETIC_COMMAND", "package-manager exec/download shims are not hermetic");
  return argv.slice();
}

function commandError(code, id, field, detail = null) {
  return new QualityError(code, { detail, context: { command_id: id, field } });
}

function validateCommand(command, id, { enforceHermetic = true } = {}) {
  if (!hasOnlyKeys(command, ["argv", "working_directory", "timeout_ms", "version_argv", "required_environment", "severity"], ["argv"])) {
    throw commandError("MANIFEST_INVALID", id, "command",
      `command '${id}' must declare argv and only working_directory/timeout_ms/version_argv/required_environment/severity`);
  }
  const workingDirectory = Object.hasOwn(command, "working_directory") ? command.working_directory : ".";
  if (!isSafeRelativePath(workingDirectory) && workingDirectory !== ".") {
    throw commandError("MANIFEST_INVALID", id, "working_directory", `command '${id}' working_directory must be a safe relative path`);
  }
  const timeoutMs = Object.hasOwn(command, "timeout_ms") ? command.timeout_ms : DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMEOUT_MS) {
    throw commandError("MANIFEST_INVALID", id, "timeout_ms", `command '${id}' timeout_ms must be an integer between 1 and ${MAX_TIMEOUT_MS}`);
  }
  const severity = Object.hasOwn(command, "severity") ? command.severity : "blocking";
  if (!["blocking", "advisory"].includes(severity)) {
    throw commandError("MANIFEST_INVALID", id, "severity", `command '${id}' severity must be "blocking" or "advisory"`);
  }
  if (severity === "advisory" && ACCEPTANCE_CRITICAL_COMMANDS.has(id)) {
    throw commandError("MANIFEST_INVALID", id, "severity", `command '${id}' is acceptance-critical and may not be declared advisory`);
  }
  let argv;
  try {
    argv = validateArgv(command.argv, {
      requireReportToken: id === "crap",
      allowLocalPnpmExec: true,
      enforceHermetic,
    });
  } catch (error) {
    if (error instanceof QualityError) throw commandError(error.code, id, "argv", error.detail);
    throw error;
  }
  const normalized = {
    argv,
    working_directory: workingDirectory,
    timeout_ms: timeoutMs,
    severity,
    version_argv: null,
    required_environment: [],
  };
  if (Object.hasOwn(command, "version_argv")) {
    try {
      normalized.version_argv = validateArgv(command.version_argv, { enforceHermetic });
    } catch (error) {
      if (error instanceof QualityError) throw commandError(error.code, id, "version_argv", error.detail);
      throw error;
    }
  }
  if (Object.hasOwn(command, "required_environment")) {
    if (!Array.isArray(command.required_environment) || command.required_environment.length > 32 ||
      new Set(command.required_environment).size !== command.required_environment.length ||
      command.required_environment.some((name) => typeof name !== "string" || !/^[A-Z][A-Z0-9_]{0,127}$/.test(name))) {
      throw commandError("MANIFEST_INVALID", id, "required_environment",
        `command '${id}' required_environment must be at most 32 unique UPPER_SNAKE names`);
    }
    normalized.required_environment = command.required_environment.slice().sort();
  }
  return normalized;
}

function validateTestPathRule(rule) {
  if (!hasExactlyKeys(rule, ["type", "value"]) || !["prefix", "suffix", "segment"].includes(rule.type)) {
    throw qualityError("MANIFEST_INVALID", "test_contract path rules must declare type prefix/suffix/segment and value");
  }
  if (typeof rule.value !== "string" || rule.value.length === 0 || rule.value.includes("\u0000")) {
    throw qualityError("MANIFEST_INVALID", "test_contract path-rule value must be a non-empty string without NUL bytes");
  }
  if (rule.type === "prefix" && !isSafeRelativePath(rule.value)) {
    throw qualityError("MANIFEST_INVALID", "test_contract prefix rule value must be a safe relative path");
  }
  if (
    rule.type !== "prefix" &&
    (rule.value.includes("/") || rule.value.includes("\\") || rule.value === "." || rule.value === "..")
  ) {
    throw qualityError("MANIFEST_INVALID", "test_contract suffix/segment rule value may not contain path separators");
  }
  if (Buffer.byteLength(rule.value, "utf8") > 128) {
    throw qualityError("MANIFEST_INVALID", "test_contract path-rule value exceeds 128 bytes");
  }
  return { type: rule.type, value: rule.value };
}

function validateTestContractConfig(value) {
  if (
    !hasExactlyKeys(value, ["path_rules"]) ||
    !Array.isArray(value.path_rules) ||
    value.path_rules.length === 0 ||
    value.path_rules.length > 32
  ) {
    throw qualityError("MANIFEST_INVALID", "test_contract must declare between 1 and 32 path_rules");
  }
  return { path_rules: value.path_rules.map(validateTestPathRule) };
}

export function validateQualityManifest(value, { selectedChecks = null } = {}) {
  if (!hasOnlyKeys(value, ["schema_version", "commands", "crap", "test_contract"], ["schema_version", "commands"])) {
    throw qualityError("MANIFEST_INVALID", "manifest must declare schema_version and commands, plus only crap/test_contract");
  }
  if (value.schema_version !== QUALITY_MANIFEST_SCHEMA_VERSION) {
    throw qualityError("MANIFEST_INVALID", `manifest schema_version must be ${QUALITY_MANIFEST_SCHEMA_VERSION}`);
  }
  if (value.commands === null || typeof value.commands !== "object" || Array.isArray(value.commands)) {
    throw qualityError("MANIFEST_INVALID", "manifest commands must be an object of command declarations");
  }
  const commandIds = Object.keys(value.commands);
  if (commandIds.length === 0) throw qualityError("MANIFEST_INVALID", "manifest must declare at least one command");
  const invalidId = commandIds.find((id) => !SAFE_COMMAND_ID.test(id));
  if (invalidId !== undefined) {
    throw qualityError("MANIFEST_INVALID", `command id '${boundedToken(invalidId)}' must match ^[a-z][a-z0-9_]{0,31}$`);
  }
  if (
    selectedChecks !== null &&
    (!Array.isArray(selectedChecks) || new Set(selectedChecks).size !== selectedChecks.length ||
      selectedChecks.some((id) => !isQualityCommandId(id)))
  ) {
    throw qualityError("MANIFEST_INVALID", "selected checks must be unique command ids matching ^[a-z][a-z0-9_]{0,31}$");
  }
  const hermeticChecks = new Set(selectedChecks === null ? commandIds : selectedChecks);
  const commands = Object.fromEntries(commandIds.sort().map((id) => [
    id,
    validateCommand(value.commands[id], id, { enforceHermetic: hermeticChecks.has(id) }),
  ]));

  let crap = null;
  if (Object.hasOwn(value, "crap")) {
    if (
      !hasExactlyKeys(value.crap, ["new_function_max", "changed_function_may_worsen"]) ||
      typeof value.crap.new_function_max !== "number" ||
      !Number.isFinite(value.crap.new_function_max) ||
      value.crap.new_function_max < 0 ||
      typeof value.crap.changed_function_may_worsen !== "boolean" ||
      !Object.hasOwn(commands, "crap")
    ) {
      throw qualityError("MANIFEST_INVALID",
        "crap policy requires new_function_max >= 0, boolean changed_function_may_worsen, and a declared crap command");
    }
    crap = {
      new_function_max: value.crap.new_function_max,
      changed_function_may_worsen: value.crap.changed_function_may_worsen,
    };
  } else if (Object.hasOwn(commands, "crap")) {
    throw qualityError("MANIFEST_INVALID", "a declared crap command requires a crap policy block");
  }
  const testContract = Object.hasOwn(value, "test_contract")
    ? validateTestContractConfig(value.test_contract)
    : null;
  return { schema_version: QUALITY_MANIFEST_SCHEMA_VERSION, commands, crap, test_contract: testContract };
}

async function assertClean(repo, code, detail) {
  const status = await git(repo, ["status", "--porcelain=v1", "-z", "--untracked-files=no"]);
  if (status.length !== 0) throw qualityError(code, detail);
}

function validateRepositoryInputs(repoInput, baseInput, candidateInput) {
  if (
    typeof repoInput !== "string" ||
    repoInput.length === 0 ||
    !SAFE_COMMIT.test(baseInput ?? "") ||
    !(candidateInput === "HEAD" || SAFE_COMMIT.test(candidateInput ?? ""))
  ) {
    throw qualityError("ARGUMENT_INVALID", "repo must be a path and base/candidate full commit hashes (candidate may be HEAD)");
  }
}

async function resolveRepositoryRoot(repoInput) {
  let repo;
  try {
    repo = await realpath(path.resolve(repoInput));
  } catch {
    throw qualityError("REPOSITORY_INVALID", "repository path does not resolve");
  }
  const top = await gitText(repo, ["rev-parse", "--show-toplevel"]);
  let canonicalTop;
  try {
    canonicalTop = await realpath(top);
  } catch {
    throw qualityError("REPOSITORY_INVALID", "repository top-level does not resolve");
  }
  if (canonicalTop !== repo) throw qualityError("REPOSITORY_INVALID", "repo must be the repository root");
  await assertClean(repo, "WORKTREE_DIRTY", "tracked files are modified or staged before execution");
  return repo;
}

async function resolveCommitIdentity(repo, baseInput, candidateInput) {
  let baseCommit;
  let candidateCommit;
  let headCommit;
  try {
    baseCommit = await gitText(repo, ["rev-parse", "--verify", `${baseInput}^{commit}`]);
    candidateCommit = await gitText(repo, ["rev-parse", "--verify", `${candidateInput}^{commit}`]);
    headCommit = await gitText(repo, ["rev-parse", "--verify", "HEAD^{commit}"]);
  } catch {
    throw qualityError("REF_INVALID", "base or candidate does not resolve to a commit");
  }
  if (candidateCommit !== headCommit) throw qualityError("CANDIDATE_NOT_HEAD", "candidate must be the current HEAD commit");
  const mergeBase = await gitText(repo, ["merge-base", baseCommit, candidateCommit]);
  if (mergeBase !== baseCommit) throw qualityError("BASE_NOT_ANCESTOR", "base must be an ancestor of the candidate");
  const baseTree = await gitText(repo, ["rev-parse", "--verify", `${baseCommit}^{tree}`]);
  const candidateTree = await gitText(repo, ["rev-parse", "--verify", `${candidateCommit}^{tree}`]);
  return { baseCommit, candidateCommit, baseTree, candidateTree };
}

async function resolveChangedPaths(repo, identity) {
  const { baseCommit, candidateCommit } = identity;
  const rawPaths = await git(repo, ["diff", "--name-only", "-z", baseCommit, candidateCommit, "--"]);
  const changedPaths = rawPaths
    .toString("utf8")
    .split("\u0000")
    .filter(Boolean);
  if (changedPaths.length > MAX_CHANGED_PATHS) {
    throw qualityError("SCOPE_TOO_LARGE", `diff exceeds ${MAX_CHANGED_PATHS} changed paths`);
  }
  if (changedPaths.some((entry) => !isSafeRelativePath(entry))) {
    throw qualityError("REPOSITORY_INVALID", "diff contains an unsafe changed path");
  }
  return changedPaths;
}

async function resolveRepository(repoInput, baseInput, candidateInput) {
  validateRepositoryInputs(repoInput, baseInput, candidateInput);
  const repo = await resolveRepositoryRoot(repoInput);
  const identity = await resolveCommitIdentity(repo, baseInput, candidateInput);
  const changedPaths = await resolveChangedPaths(repo, identity);
  return {
    root: repo,
    base_commit: identity.baseCommit,
    base_tree: identity.baseTree,
    candidate_commit: identity.candidateCommit,
    candidate_tree: identity.candidateTree,
    changed_paths: changedPaths,
  };
}

async function resolveManifest(repo, manifestInput, selectedChecks) {
  if (typeof manifestInput !== "string" || manifestInput.length === 0 || manifestInput.includes("\u0000")) {
    throw qualityError("ARGUMENT_INVALID", "manifest path must be a non-empty string without NUL bytes");
  }
  const requested = path.resolve(repo, manifestInput);
  let requestedStat;
  try {
    requestedStat = await lstat(requested);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw qualityError("MANIFEST_ABSENT", `manifest not found: ${boundedToken(manifestInput)}`);
    }
    throw qualityError("MANIFEST_INVALID", `manifest is unreadable: ${boundedToken(manifestInput)}`);
  }
  let filePath;
  try {
    if (!requestedStat.isFile() || requestedStat.isSymbolicLink()) throw new Error("invalid manifest");
    filePath = await realpath(requested);
  } catch {
    throw qualityError("MANIFEST_INVALID", `manifest must be a regular non-symlink file: ${boundedToken(manifestInput)}`);
  }
  if (!isContained(repo, filePath)) throw qualityError("MANIFEST_INVALID", "manifest escapes the repository root");
  const loaded = await readBoundedJson(filePath, "MANIFEST_INVALID", "manifest is oversized or not valid JSON");
  const manifest = validateQualityManifest(loaded.value, { selectedChecks });
  return {
    value: manifest,
    evidence: {
      path: path.relative(repo, filePath).split(path.sep).join("/"),
      sha256: sha256(loaded.bytes),
      canonical_sha256: canonicalHash(loaded.value),
    },
  };
}

async function commandWorkingDirectory(repo, relative) {
  const requested = path.resolve(repo, relative);
  let resolved;
  try {
    resolved = await realpath(requested);
    const stat = await lstat(resolved);
    if (!stat.isDirectory()) throw new Error("not a directory");
  } catch {
    throw qualityError("MANIFEST_INVALID", `working_directory does not resolve to a directory: ${boundedToken(relative)}`);
  }
  if (!isContained(repo, resolved)) {
    throw qualityError("MANIFEST_INVALID", "working_directory escapes the repository root");
  }
  return resolved;
}

function pnpmExecParts(argv) {
  const invocation = packageManagerInvocation(argv);
  if (invocation?.executable !== "pnpm" || invocation.operation !== "exec") return null;
  let offset = invocation.operationOffset + 1;
  if (argv[offset] === "--") offset += 1;
  const tool = argv[offset];
  if (typeof tool !== "string" || !/^[A-Za-z0-9._-]+$/.test(tool)) {
    throw qualityError("NON_HERMETIC_COMMAND", "pnpm exec tool name is not a plain binary name");
  }
  return { tool, args: argv.slice(offset + 1) };
}

function pnpmScriptParts(argv) {
  const invocation = packageManagerInvocation(argv);
  if (invocation?.executable !== "pnpm") return null;
  let offset = invocation.operationOffset;
  if (["exec", "dlx"].includes(argv[offset]?.toLowerCase())) return null;
  if (argv[offset]?.toLowerCase() === "run") offset += 1;
  const script = argv[offset];
  if (typeof script !== "string" || !/^[A-Za-z0-9:_-]+$/.test(script)) {
    throw qualityError("NON_HERMETIC_COMMAND", "pnpm script name is not a plain script identifier");
  }
  if (["add", "approve-builds", "audit", "import", "install", "i", "link", "rebuild", "remove", "rm", "uninstall", "update", "up"].includes(script.toLowerCase())) {
    throw qualityError("NON_HERMETIC_COMMAND", "pnpm store-mutating operations are not hermetic");
  }
  const args = argv.slice(offset + 1);
  if (args[0] === "--") args.shift();
  return { script, args };
}

function parseSimplePackageScript(value) {
  if (typeof value !== "string" || value.length === 0 || Buffer.byteLength(value, "utf8") > MAX_ARGV_BYTES) {
    throw qualityError("NON_HERMETIC_COMMAND", "package script is empty or oversized");
  }
  const parts = value.split(" ");
  if (parts.some((part) => part.length === 0 || !/^[A-Za-z0-9_./:@%+=,-]+$/.test(part))) {
    throw qualityError("NON_HERMETIC_COMMAND", "package script uses shell syntax");
  }
  const tool = parts[0];
  if (!/^[A-Za-z0-9._-]+$/.test(tool)) {
    throw qualityError("NON_HERMETIC_COMMAND", "package script tool is not a plain binary name");
  }
  return { tool, args: parts.slice(1) };
}

function windowsShimInvocation(candidate, args) {
  return {
    argv: ["powershell.exe", "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", candidate, ...args],
  };
}

export async function resolveLinkedLocalBinary(tool, args, cwd, repository, resolution, platform = process.platform) {
  const normalizedTool = tool.replace(/\.(?:bat|cmd|exe|ps1)$/iu, "");
  let directory = cwd;
  while (isContained(repository, directory)) {
    const candidates = [
      path.join(directory, "node_modules", ".bin", normalizedTool),
      path.join(directory, "node_modules", ".bin", `${normalizedTool}.exe`),
      ...(platform === "win32" ? [path.join(directory, "node_modules", ".bin", `${normalizedTool}.ps1`)] : []),
    ];
    for (const candidate of candidates) {
      try {
        const stat = await lstat(candidate);
        if (!stat.isFile() && !stat.isSymbolicLink()) continue;
        const target = await realpath(candidate);
        const targetStat = await lstat(target);
        if (!targetStat.isFile() || !isContained(repository, target)) continue;
        const invocation = platform === "win32" && candidate.toLowerCase().endsWith(".ps1")
          ? windowsShimInvocation(candidate, args)
          : { argv: [candidate, ...args] };
        return {
          argv: invocation.argv,
          identity: [`${"${TH_LOCAL_BIN}"}/${normalizedTool}`, ...args],
          resolution,
        };
      } catch { /* try the next candidate/ancestor */ }
    }
    if (directory === repository) break;
    const parent = path.dirname(directory);
    if (parent === directory || !isContained(repository, parent)) break;
    directory = parent;
  }
  throw qualityError("PREREQUISITE_UNAVAILABLE", "no linked repository-local binary satisfies the command");
}

async function resolveDeclaredLocalBinary(argv, cwd, repository, platform = process.platform) {
  const coordinate = argv[0].replaceAll("\\", "/");
  const match = /^(?:\.\/)?node_modules\/\.bin\/([A-Za-z0-9._-]+)$/u.exec(coordinate);
  if (match === null) return null;
  if (!isSafeRelativePath(coordinate)) throw qualityError("NON_HERMETIC_COMMAND", "declared local binary path is unsafe");
  const requested = path.resolve(cwd, coordinate);
  if (!isContained(repository, requested)) {
    throw qualityError("NON_HERMETIC_COMMAND", "declared local binary escapes the repository");
  }
  try {
    const stat = await lstat(requested);
    if (!stat.isFile() && !stat.isSymbolicLink()) throw new Error("invalid local binary");
    const target = await realpath(requested);
    const targetStat = await lstat(target);
    if (!targetStat.isFile() || !isContained(repository, target)) {
      throw new Error("local binary escapes repository");
    }
    const args = argv.slice(1);
    const invocation = platform === "win32" && requested.toLowerCase().endsWith(".ps1")
      ? windowsShimInvocation(requested, args)
      : { argv: [requested, ...args] };
    return {
      argv: invocation.argv,
      identity: [`${"${TH_LOCAL_BIN}"}/${match[1]}`, ...args],
      resolution: "repository-local-bin",
    };
  } catch (error) {
    if (error instanceof QualityError) throw error;
    throw qualityError("PREREQUISITE_UNAVAILABLE", "declared local binary does not resolve inside the repository");
  }
}

async function resolveRepositoryNodeScript(args, cwd, repository, resolution) {
  const [script, ...scriptArgs] = args;
  if (!isSafeRelativePath(script) || !/\.(?:cjs|js|mjs)$/iu.test(script)) {
    throw qualityError("NON_HERMETIC_COMMAND", "node package script must target a repository script file");
  }
  const requested = path.resolve(cwd, script);
  try {
    const stat = await lstat(requested);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("invalid script");
    const canonical = await realpath(requested);
    if (!isContained(repository, canonical)) throw new Error("escaped script");
    const relative = path.relative(repository, canonical).split(path.sep).join("/");
    return {
      argv: [process.execPath, canonical, ...scriptArgs],
      identity: ["${TH_REPOSITORY_NODE}", relative, ...scriptArgs],
      resolution,
    };
  } catch (error) {
    if (error instanceof QualityError) throw error;
    throw qualityError("PREREQUISITE_UNAVAILABLE", "node package script does not resolve inside the repository");
  }
}

async function resolveExecutionArgv(argv, cwd, repository) {
  const declaredLocalBinary = await resolveDeclaredLocalBinary(argv, cwd, repository);
  if (declaredLocalBinary !== null) return declaredLocalBinary;
  const parts = pnpmExecParts(argv);
  if (parts !== null) {
    return resolveLinkedLocalBinary(parts.tool, parts.args, cwd, repository, "linked-local-bin");
  }
  const scriptParts = pnpmScriptParts(argv);
  if (scriptParts === null) return { argv, identity: argv, resolution: "manifest" };
  const packagePath = path.join(cwd, "package.json");
  let packageJson;
  try {
    const stat = await lstat(packagePath);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("invalid package.json");
    const canonical = await realpath(packagePath);
    if (!isContained(repository, canonical)) throw new Error("escaped package.json");
    packageJson = (await readBoundedJson(canonical, "PREREQUISITE_UNAVAILABLE", "package.json is unreadable or not valid JSON")).value;
  } catch (error) {
    if (error instanceof QualityError) throw error;
    throw qualityError("PREREQUISITE_UNAVAILABLE", "package.json does not resolve inside the repository");
  }
  const scriptValue = packageJson?.scripts?.[scriptParts.script];
  if (scriptValue === undefined) throw qualityError("PREREQUISITE_UNAVAILABLE", "package script is not declared in package.json");
  const simple = parseSimplePackageScript(scriptValue);
  if (normalizeExecutable(simple.tool) === "node") {
    return resolveRepositoryNodeScript(
      [...simple.args, ...scriptParts.args],
      cwd,
      repository,
      "repository-local-node-script",
    );
  }
  return resolveLinkedLocalBinary(
    simple.tool,
    [...simple.args, ...scriptParts.args],
    cwd,
    repository,
    "linked-local-script",
  );
}

function commandEvidence(id, command, version, execution, executionIdentity, executionResolution) {
  const versionFingerprint =
    version === null
      ? null
      : sha256(
          JSON.stringify({
            exit_code: version.exit_code,
            signal: version.signal,
            stdout: version.stdout,
            stderr: version.stderr,
          }),
        );
  return {
    id,
    severity: command.severity,
    command_sha256: canonicalHash(command),
    execution_argv_sha256: canonicalHash(executionIdentity),
    execution_resolution: executionResolution,
    version_sha256: command.version_argv === null ? null : canonicalHash(command.version_argv),
    version_fingerprint: versionFingerprint,
    version_result:
      version === null
        ? null
        : {
            outcome: version.outcome,
            exit_code: version.exit_code,
            signal: version.signal,
            duration_ms: version.duration_ms,
            error_code: version.error_code,
          },
    execution,
    verdict:
      execution.outcome === "completed" && execution.exit_code === 0 && execution.signal === null ? "pass" : "fail",
  };
}

function roundMetric(value) {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}

function computeCrap(complexity, coveragePercent) {
  const uncovered = 1 - coveragePercent / 100;
  return roundMetric(complexity ** 2 * uncovered ** 3 + complexity);
}

function validateCrapReport(value, changedPaths) {
  if (!hasExactlyKeys(value, ["schema_version", "functions"]) || value.schema_version !== CRAP_REPORT_SCHEMA_VERSION || !Array.isArray(value.functions) || value.functions.length > MAX_FUNCTIONS) {
    throw qualityError("CRAP_REPORT_INVALID", "crap report must declare schema_version 1 and at most 512 functions");
  }
  const changed = new Set(changedPaths);
  const seen = new Set();
  const functions = value.functions.map((entry) => {
    if (
      !hasExactlyKeys(entry, ["path", "symbol", "status", "complexity", "coverage_percent"]) ||
      !isSafeRelativePath(entry.path) ||
      !changed.has(entry.path) ||
      typeof entry.symbol !== "string" ||
      entry.symbol.length === 0 ||
      Buffer.byteLength(entry.symbol, "utf8") > 256 ||
      !["new", "changed"].includes(entry.status) ||
      !Number.isSafeInteger(entry.complexity) ||
      entry.complexity < 1 ||
      typeof entry.coverage_percent !== "number" ||
      !Number.isFinite(entry.coverage_percent) ||
      entry.coverage_percent < 0 ||
      entry.coverage_percent > 100
    ) {
      throw qualityError("CRAP_REPORT_INVALID", "crap report function entry is malformed or outside the changed paths");
    }
    const key = `${entry.path}\u0000${entry.symbol}`;
    if (seen.has(key)) throw qualityError("CRAP_REPORT_INVALID", "crap report repeats a path/symbol pair");
    seen.add(key);
    const coveragePercent = roundMetric(entry.coverage_percent);
    return {
      path: entry.path,
      symbol: entry.symbol,
      status: entry.status,
      complexity: entry.complexity,
      coverage_percent: coveragePercent,
      crap: computeCrap(entry.complexity, coveragePercent),
    };
  });
  return functions.sort((left, right) => left.path.localeCompare(right.path) || left.symbol.localeCompare(right.symbol));
}

function isRepositoryEvidence(value) {
  return (
    hasExactlyKeys(value, ["base_commit", "base_tree", "candidate_commit", "candidate_tree", "changed_paths"]) &&
    SAFE_COMMIT.test(value.base_commit) &&
    SAFE_COMMIT.test(value.base_tree) &&
    SAFE_COMMIT.test(value.candidate_commit) &&
    SAFE_COMMIT.test(value.candidate_tree) &&
    Array.isArray(value.changed_paths) &&
    value.changed_paths.length <= MAX_CHANGED_PATHS &&
    value.changed_paths.every(isSafeRelativePath)
  );
}

function isManifestEvidence(value) {
  return (
    hasExactlyKeys(value, ["path", "sha256", "canonical_sha256"]) &&
    isSafeRelativePath(value.path) &&
    /^[0-9a-f]{64}$/.test(value.sha256) &&
    /^[0-9a-f]{64}$/.test(value.canonical_sha256)
  );
}

function isBaselineEvidence(value) {
  return (
    hasExactlyKeys(value, ["sha256", "candidate_commit", "candidate_tree"]) &&
    /^[0-9a-f]{64}$/.test(value.sha256) &&
    SAFE_COMMIT.test(value.candidate_commit) &&
    SAFE_COMMIT.test(value.candidate_tree)
  );
}

function isVersionResult(value) {
  return (
    value === null ||
    (hasExactlyKeys(value, ["outcome", "exit_code", "signal", "duration_ms", "error_code"]) &&
      ["completed", "timed_out", "spawn_error", "argument_invalid", "internal_error"].includes(value.outcome) &&
      (value.exit_code === null || Number.isSafeInteger(value.exit_code)) &&
      (value.signal === null || /^SIG[A-Z0-9]+$/.test(value.signal)) &&
      Number.isSafeInteger(value.duration_ms) &&
      value.duration_ms >= 0 &&
      [null, "ARGUMENT_INVALID", "TIMEOUT", "SPAWN_FAILED", "INTERNAL_ERROR"].includes(value.error_code))
  );
}

function isCommandEvidence(value) {
  const keys = [
    "id",
    "severity",
    "command_sha256",
    "execution_argv_sha256",
    "execution_resolution",
    "version_sha256",
    "version_fingerprint",
    "version_result",
    "execution",
    "verdict",
  ];
  if (!hasExactlyKeys(value, keys)) return false;
  if (!SAFE_COMMAND_ID.test(value.id) || !["blocking", "advisory"].includes(value.severity)
    || !/^[0-9a-f]{64}$/.test(value.command_sha256)
    || !/^[0-9a-f]{64}$/.test(value.execution_argv_sha256)
    || !["manifest", "linked-local-bin", "linked-local-script", "repository-local-bin", "repository-local-node-script"].includes(value.execution_resolution)) return false;
  const hasVersion = value.version_result !== null;
  if (hasVersion !== (typeof value.version_sha256 === "string" && /^[0-9a-f]{64}$/.test(value.version_sha256))) return false;
  if (hasVersion !== (typeof value.version_fingerprint === "string" && /^[0-9a-f]{64}$/.test(value.version_fingerprint))) return false;
  if (!isVersionResult(value.version_result) || !isBoundedCommandEnvelope(value.execution)) return false;
  if (!["pass", "fail"].includes(value.verdict)) return false;
  const executionPassed = value.execution.outcome === "completed" && value.execution.exit_code === 0 && value.execution.signal === null;
  const versionPassed =
    value.version_result === null ||
    (value.version_result.outcome === "completed" &&
      value.version_result.exit_code === 0 &&
      value.version_result.signal === null &&
      value.version_result.error_code === null);
  return value.verdict === (executionPassed && versionPassed ? "pass" : "fail");
}

function isCrapFunction(value) {
  const keys = [
    "path",
    "symbol",
    "status",
    "complexity",
    "coverage_percent",
    "crap",
    "baseline_crap",
    "delta",
    "violations",
  ];
  if (!hasExactlyKeys(value, keys) || !isSafeRelativePath(value.path)) return false;
  if (typeof value.symbol !== "string" || value.symbol.length === 0 || Buffer.byteLength(value.symbol, "utf8") > 256) return false;
  if (!["new", "changed"].includes(value.status) || !Number.isSafeInteger(value.complexity) || value.complexity < 1) return false;
  if (!Number.isFinite(value.coverage_percent) || value.coverage_percent < 0 || value.coverage_percent > 100) return false;
  if (!Number.isFinite(value.crap) || (value.baseline_crap !== null && !Number.isFinite(value.baseline_crap))) return false;
  if (value.delta !== null && !Number.isFinite(value.delta)) return false;
  if (!Array.isArray(value.violations)) return false;
  if (!value.violations.every((entry) => ["new_function_max", "crap_worsened"].includes(entry))) return false;
  if (value.crap !== computeCrap(value.complexity, value.coverage_percent)) return false;
  if ((value.baseline_crap === null) !== (value.delta === null)) return false;
  if (value.baseline_crap !== null && value.delta !== roundMetric(value.crap - value.baseline_crap)) return false;
  return new Set(value.violations).size === value.violations.length;
}

function isCrapEvidence(value) {
  const keys = ["formula", "report_sha256", "policy_mode", "thresholds", "verdict", "functions"];
  if (!hasExactlyKeys(value, keys)) return false;
  if (
    value.formula !== "complexity^2*(1-coverage)^3+complexity" ||
    !/^[0-9a-f]{64}$/.test(value.report_sha256)
  ) return false;
  if (
    !["measure", "enforce"].includes(value.policy_mode) ||
    !["not_applied", "pass", "fail"].includes(value.verdict)
  ) return false;
  if (!hasExactlyKeys(value.thresholds, ["new_function_max", "changed_function_may_worsen"])) return false;
  if (
    !Number.isFinite(value.thresholds.new_function_max) ||
    value.thresholds.new_function_max < 0 ||
    typeof value.thresholds.changed_function_may_worsen !== "boolean"
  ) return false;
  if (!Array.isArray(value.functions) || value.functions.length > MAX_FUNCTIONS || !value.functions.every(isCrapFunction)) return false;
  if (value.policy_mode === "measure" && value.verdict !== "not_applied") return false;
  if (value.policy_mode === "enforce" && !["pass", "fail"].includes(value.verdict)) return false;
  const hasViolations = value.functions.some((entry) => entry.violations.length > 0);
  if (value.verdict === "pass" && hasViolations) return false;
  if (value.verdict === "fail" && !hasViolations) return false;
  const functionKeys = value.functions.map((entry) => `${entry.path}\u0000${entry.symbol}`);
  return new Set(functionKeys).size === functionKeys.length;
}

export function isQualityResult(value) {
  if (!hasOnlyKeys(value, RESULT_KEYS, REQUIRED_RESULT_KEYS)) return false;
  if (value.schema_version !== QUALITY_RESULT_SCHEMA_VERSION || value.kind !== "team_harness_quality") return false;
  if (value.checkpoint !== null && (typeof value.checkpoint !== "string" || !SAFE_CHECKPOINT.test(value.checkpoint))) return false;
  if (!["pass", "fail"].includes(value.verdict) || !ERROR_CODES.has(value.error_code)) return false;
  if (value.error_context !== null && !isErrorContext(value.error_context)) return false;
  const detail = Object.hasOwn(value, "detail") ? value.detail : null;
  if (!isBoundedDetail(detail)) return false;
  if (!Number.isSafeInteger(value.duration_ms) || value.duration_ms < 0) return false;
  if (value.repository !== null && !isRepositoryEvidence(value.repository)) return false;
  if (value.manifest !== null && !isManifestEvidence(value.manifest)) return false;
  if (value.baseline !== null && !isBaselineEvidence(value.baseline)) return false;
  if (!Array.isArray(value.commands) || !value.commands.every(isCommandEvidence)) return false;
  if (new Set(value.commands.map((entry) => entry.id)).size !== value.commands.length) return false;
  if (value.crap !== null && !isCrapEvidence(value.crap)) return false;
  if (value.verdict === "pass" && value.error_code !== null) return false;
  if (value.verdict === "pass" && value.error_context !== null) return false;
  if (value.verdict === "pass" && detail !== null) return false;
  if (value.verdict === "pass" && value.commands.some((entry) => entry.severity !== "advisory" && entry.verdict !== "pass")) return false;
  if (value.verdict === "pass" && value.crap?.verdict === "fail") return false;
  if (value.verdict === "fail" && value.error_code === null) return false;
  return true;
}

function elapsedMs(startedAt) {
  return Number((process.hrtime.bigint() - startedAt) / 1_000_000n);
}

function safeResult(state, startedAt) {
  const result = {
    schema_version: QUALITY_RESULT_SCHEMA_VERSION,
    kind: "team_harness_quality",
    checkpoint: state.checkpoint,
    verdict: state.error_code === null ? "pass" : "fail",
    error_code: state.error_code,
    error_context: state.error_context,
    detail: state.detail,
    duration_ms: elapsedMs(startedAt),
    repository: state.repository,
    manifest: state.manifest,
    baseline: state.baseline,
    commands: state.commands,
    crap: state.crap,
  };
  if (isQualityResult(result)) return result;
  return {
    schema_version: QUALITY_RESULT_SCHEMA_VERSION,
    kind: "team_harness_quality",
    checkpoint: null,
    verdict: "fail",
    error_code: "INTERNAL_ERROR",
    error_context: null,
    detail: null,
    duration_ms: 0,
    repository: null,
    manifest: null,
    baseline: null,
    commands: [],
    crap: null,
  };
}

function isCompatibleBaseline(result, context, bytes) {
  return (
    typeof context.expectedSha256 === "string" &&
    /^[0-9a-f]{64}$/.test(context.expectedSha256) &&
    sha256(bytes) === context.expectedSha256 &&
    isQualityResult(result) &&
    result.verdict === "pass" &&
    result.repository !== null &&
    result.manifest !== null &&
    result.crap !== null &&
    result.manifest.canonical_sha256 === context.manifestEvidence.canonical_sha256 &&
    result.repository.base_commit === context.repository.base_commit &&
    result.repository.base_tree === context.repository.base_tree
  );
}

async function loadBaseline(context) {
  const loaded = await readBoundedJson(context.filePath, "BASELINE_INVALID", "baseline evidence is unreadable or not valid JSON");
  const result = loaded.value;
  if (!isCompatibleBaseline(result, context, loaded.bytes)) {
    throw qualityError("BASELINE_INVALID", "baseline is not a passing quality result for this base and manifest");
  }
  const priorCrapCommand = result.commands.find((entry) => entry?.id === "crap");
  if (priorCrapCommand?.command_sha256 !== context.currentCrapCommandHash) {
    throw qualityError("BASELINE_INVALID", "baseline crap command differs from the current manifest");
  }
  if (result.repository.candidate_tree !== context.repository.candidate_tree) {
    const mergeBase = await gitText(context.repo, [
      "merge-base",
      result.repository.candidate_commit,
      context.repository.candidate_commit,
    ]);
    if (mergeBase !== result.repository.candidate_commit) {
      throw qualityError("BASELINE_INVALID", "baseline candidate is neither tree-identical to nor an ancestor of the current candidate");
    }
  }
  return {
    evidence: {
      sha256: sha256(loaded.bytes),
      candidate_commit: result.repository.candidate_commit,
      candidate_tree: result.repository.candidate_tree,
    },
    result,
  };
}

const RUN_OPTION_KEYS = [
  "repo",
  "manifest",
  "base",
  "candidate",
  "checkpoint",
  "checks",
  "policyMode",
  "baseline",
  "baselineSha256",
  "requiredChecks",
];

function normalizeRunOptions(options) {
  if (
    options === null ||
    typeof options !== "object" ||
    Array.isArray(options) ||
    !hasOnlyKeys(options, RUN_OPTION_KEYS, ["repo", "manifest", "base", "candidate", "checkpoint", "checks", "requiredChecks"])
  ) {
    throw qualityError("ARGUMENT_INVALID", "options must declare repo/manifest/base/candidate/checkpoint/checks/requiredChecks");
  }
  if (typeof options.checkpoint !== "string" || !SAFE_CHECKPOINT.test(options.checkpoint)) {
    throw qualityError("ARGUMENT_INVALID", "checkpoint must match ^[a-z][a-z0-9_-]{0,63}$");
  }
  if (
    !Array.isArray(options.checks) ||
    options.checks.length === 0 ||
    new Set(options.checks).size !== options.checks.length ||
    options.checks.some((id) => !isQualityCommandId(id))
  ) {
    throw qualityError("ARGUMENT_INVALID", "checks must be unique command ids matching ^[a-z][a-z0-9_]{0,31}$");
  }
  const policyMode = Object.hasOwn(options, "policyMode") ? options.policyMode : "measure";
  if (!["measure", "enforce"].includes(policyMode)) {
    throw qualityError("ARGUMENT_INVALID", "policyMode must be measure or enforce");
  }
  const requiredChecks = options.requiredChecks;
  if (!Array.isArray(requiredChecks) || new Set(requiredChecks).size !== requiredChecks.length ||
    requiredChecks.some((id) => !isQualityCommandId(id))) {
    throw qualityError("ARGUMENT_INVALID", "requiredChecks must be unique command ids matching ^[a-z][a-z0-9_]{0,31}$");
  }
  return { ...options, policyMode, requiredChecks };
}

function repositoryEvidence(repository) {
  return {
    base_commit: repository.base_commit,
    base_tree: repository.base_tree,
    candidate_commit: repository.candidate_commit,
    candidate_tree: repository.candidate_tree,
    changed_paths: repository.changed_paths,
  };
}

async function prepareRun(options, state) {
  const repository = await resolveRepository(options.repo, options.base, options.candidate);
  state.repository = repositoryEvidence(repository);
  const manifest = await resolveManifest(repository.root, options.manifest, options.checks);
  state.manifest = manifest.evidence;
  const missingRequired = options.requiredChecks.find((id) =>
    !Object.hasOwn(manifest.value.commands, id) || !options.checks.includes(id));
  if (missingRequired !== undefined) {
    throw new QualityError("REQUIRED_CHECKS_MISSING", {
      detail: `required check '${missingRequired}' is not declared and selected`,
      context: { command_id: missingRequired, field: "commands" },
    });
  }
  const missingSelected = options.checks.find((id) => !Object.hasOwn(manifest.value.commands, id));
  if (missingSelected !== undefined) {
    throw new QualityError("MANIFEST_INVALID", {
      detail: `selected check '${missingSelected}' is not declared in the manifest`,
      context: { command_id: missingSelected, field: "commands" },
    });
  }
  const usesCrap = options.checks.includes("crap");
  if (usesCrap && manifest.value.crap === null) {
    throw qualityError("MANIFEST_INVALID", "the crap check requires a crap policy block in the manifest");
  }
  if (
    usesCrap &&
    options.policyMode === "enforce" &&
    (typeof options.baseline !== "string" || typeof options.baselineSha256 !== "string")
  ) {
    throw qualityError("BASELINE_INVALID", "enforce mode requires baseline and baselineSha256");
  }
  return { options, state, repository, manifest, baselineResult: null, reportRoot: null };
}

async function prepareBaseline(context) {
  if (!context.options.checks.includes("crap") || context.options.policyMode !== "enforce") return;
  const commandHash = canonicalHash(context.manifest.value.commands.crap);
  const loaded = await loadBaseline({
    filePath: context.options.baseline,
    expectedSha256: context.options.baselineSha256,
    repository: context.state.repository,
    manifestEvidence: context.state.manifest,
    currentCrapCommandHash: commandHash,
    repo: context.repository.root,
  });
  context.state.baseline = loaded.evidence;
  context.baselineResult = loaded.result;
}

function executionFailure(id, command, execution) {
  if (execution.outcome === "timed_out") {
    return qualityError("TIMEOUT", `command '${id}' timed out after ${command.timeout_ms}ms`);
  }
  if (execution.outcome === "spawn_error") {
    return qualityError("SPAWN_FAILED", `command '${id}' failed to spawn`);
  }
  return qualityError("COMMAND_FAILED", `command '${id}' failed`);
}

async function runManifestCommand(context, id) {
  const command = context.manifest.value.commands[id];
  if (command.required_environment.some((name) => !Object.hasOwn(process.env, name) || process.env[name] === "")) {
    throw qualityError("PREREQUISITE_UNAVAILABLE", `command '${id}' is missing a required environment variable`);
  }
  const cwd = await commandWorkingDirectory(context.repository.root, command.working_directory);
  const resolved = await resolveExecutionArgv(command.argv, cwd, context.repository.root);
  let version = null;
  if (command.version_argv !== null) {
    const versionResolved = await resolveExecutionArgv(command.version_argv, cwd, context.repository.root);
    version = await runBoundedCommand({
      argv: versionResolved.argv,
      cwd,
      timeoutMs: command.timeout_ms,
      includeSuccessDiagnostic: true,
    });
    await assertClean(context.repository.root, "WORKTREE_MUTATED", `command '${id}' version probe mutated tracked files`);
    if (version.outcome !== "completed" || version.exit_code !== 0 || version.signal !== null) {
      context.state.commands.push(commandEvidence(id, command, version, version, resolved.identity, resolved.resolution));
      if (command.severity === "advisory") return null;
      throw executionFailure(id, command, version);
    }
  }
  const reportPath = id === "crap" ? path.join(context.reportRoot, "crap-report.json") : null;
  const argv = resolved.argv.map((argument) => (argument === CRAP_REPORT_TOKEN ? reportPath : argument));
  const identity = resolved.identity.map((argument) => (argument === CRAP_REPORT_TOKEN ? "${TH_QUALITY_REPORT}" : argument));
  const retainTransitionDiagnostic = id === "test" && /^test_contract_(?:red|green)$/.test(context.options.checkpoint);
  const execution = await runBoundedCommand({
    argv,
    cwd,
    timeoutMs: command.timeout_ms,
    includeSuccessDiagnostic: retainTransitionDiagnostic,
  });
  const evidence = commandEvidence(id, command, version, execution, identity, resolved.resolution);
  context.state.commands.push(evidence);
  await assertClean(context.repository.root, "WORKTREE_MUTATED", `command '${id}' mutated tracked files`);
  if (evidence.verdict !== "pass") {
    if (command.severity === "advisory") return null;
    throw executionFailure(id, command, execution);
  }
  if (id !== "crap") return null;
  const report = await readBoundedJson(reportPath, "CRAP_REPORT_INVALID", "crap report is unreadable or not valid JSON");
  return {
    functions: validateCrapReport(report.value, context.repository.changed_paths),
    reportSha256: sha256(report.bytes),
  };
}

async function executeSelectedCommands(context) {
  let crapData = null;
  for (const id of context.options.checks) {
    const result = await runManifestCommand(context, id);
    if (result !== null) crapData = result;
  }
  return crapData;
}

function recordCrapEvidence(context, crapData) {
  if (crapData === null) return;
  const policy = applyCrapPolicy(
    crapData.functions,
    context.manifest.value.crap,
    context.options.policyMode,
    context.baselineResult,
  );
  context.state.crap = {
    formula: "complexity^2*(1-coverage)^3+complexity",
    report_sha256: crapData.reportSha256,
    policy_mode: context.options.policyMode,
    thresholds: context.manifest.value.crap,
    verdict: policy.verdict,
    functions: policy.functions,
  };
  if (policy.verdict === "fail") throw qualityError("CRAP_POLICY_FAILED", "a changed or new function violates the crap policy");
}

function applyCrapPolicy(functions, config, policyMode, baselineResult) {
  const baselineFunctions = new Map(
    (baselineResult?.crap?.functions ?? []).map((entry) => [`${entry.path}\u0000${entry.symbol}`, entry]),
  );
  let failed = false;
  const evaluated = functions.map((entry) => {
    const prior = baselineFunctions.get(`${entry.path}\u0000${entry.symbol}`);
    if (policyMode === "enforce" && entry.status === "changed" && prior === undefined) {
      throw qualityError("CRAP_REPORT_INCOMPLETE", "a changed function has no baseline measurement");
    }
    const baselineCrap = prior?.crap ?? null;
    const delta = baselineCrap === null ? null : roundMetric(entry.crap - baselineCrap);
    const violations = [];
    if (policyMode === "enforce") {
      if (entry.status === "new" && entry.crap > config.new_function_max) violations.push("new_function_max");
      if (delta !== null && delta > 0 && !config.changed_function_may_worsen) violations.push("crap_worsened");
    }
    if (violations.length > 0) failed = true;
    return { ...entry, baseline_crap: baselineCrap, delta, violations };
  });
  if (policyMode === "enforce") {
    const currentKeys = new Set(functions.map((entry) => `${entry.path}\u0000${entry.symbol}`));
    if ([...baselineFunctions.keys()].some((key) => !currentKeys.has(key))) {
      throw qualityError("CRAP_REPORT_INCOMPLETE", "a baseline function is missing from the current crap report");
    }
  }
  return { functions: evaluated, verdict: policyMode === "measure" ? "not_applied" : failed ? "fail" : "pass" };
}

/** Execute one immutable quality checkpoint and return a closed result. */
export async function runQualityChecks(options) {
  const startedAt = process.hrtime.bigint();
  const state = {
    checkpoint: null,
    error_code: null,
    error_context: null,
    detail: null,
    repository: null,
    manifest: null,
    baseline: null,
    commands: [],
    crap: null,
  };
  let context = null;
  try {
    const normalized = normalizeRunOptions(options);
    state.checkpoint = normalized.checkpoint;
    context = await prepareRun(normalized, state);
    await prepareBaseline(context);
    if (normalized.checks.includes("crap")) {
      context.reportRoot = await mkdtemp(path.join(tmpdir(), "th-quality-report-"));
    }
    recordCrapEvidence(context, await executeSelectedCommands(context));
    await assertClean(context.repository.root, "WORKTREE_MUTATED", "a quality command mutated tracked files");
  } catch (error) {
    state.error_code = error instanceof QualityError && ERROR_CODES.has(error.code) ? error.code : "INTERNAL_ERROR";
    state.error_context = error instanceof QualityError ? error.context : null;
    state.detail = error instanceof QualityError ? error.detail : null;
  } finally {
    if (context?.reportRoot !== null && context?.reportRoot !== undefined) {
      try {
        await rm(context.reportRoot, { recursive: true, force: true });
      } catch {
        if (state.error_code === null) state.error_code = "INTERNAL_ERROR";
      }
    }
  }
  return safeResult(state, startedAt);
}

export async function persistQualityResult(outputPath, result) {
  if (typeof outputPath !== "string" || !path.isAbsolute(outputPath) || outputPath.includes("\u0000")) {
    throw qualityError("ARGUMENT_INVALID", "output path must be absolute and free of NUL bytes");
  }
  const target = path.resolve(outputPath);
  const parent = path.dirname(target);
  try {
    const parentStat = await lstat(parent);
    if (!parentStat.isDirectory() || parentStat.isSymbolicLink() || await realpath(parent) !== parent) {
      throw qualityError("ARGUMENT_INVALID", "output parent must be a real non-symlink directory");
    }
    try {
      const targetStat = await lstat(target);
      if (!targetStat.isFile() || targetStat.isSymbolicLink()) {
        throw qualityError("ARGUMENT_INVALID", "output target must be a regular non-symlink file");
      }
    } catch (error) {
      if (error instanceof QualityError) throw error;
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
      if (await realpath(parent) !== parent) {
        throw qualityError("ARGUMENT_INVALID", "output parent changed during the write");
      }
      try {
        const targetStat = await lstat(target);
        if (!targetStat.isFile() || targetStat.isSymbolicLink()) {
          throw qualityError("ARGUMENT_INVALID", "output target must be a regular non-symlink file");
        }
      } catch (error) {
        if (error instanceof QualityError) throw error;
        if (error?.code !== "ENOENT") throw error;
      }
      await rename(temporary, target);
      ownsTemporary = false;
    } catch (error) {
      if (handle) await handle.close().catch(() => {});
      if (ownsTemporary) await unlink(temporary).catch(() => {});
      if (error instanceof QualityError) throw error;
      throw qualityError("OUTPUT_WRITE_FAILED", "quality evidence could not be persisted");
    }
    return {
      schema_version: QUALITY_RECEIPT_SCHEMA_VERSION,
      kind: "team_harness_quality_receipt",
      verdict: result.verdict,
      error_code: result.error_code,
      checkpoint: result.checkpoint,
      result_path: target,
      result_sha256: sha256(bytes),
      result_bytes: bytes.length,
    };
  } catch (error) {
    if (error instanceof QualityError) throw error;
    throw qualityError("OUTPUT_WRITE_FAILED", "quality evidence could not be persisted");
  }
}

function parseCli(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (
      value === undefined ||
      !["--repo", "--manifest", "--base", "--candidate", "--checkpoint", "--checks", "--required-checks", "--policy-mode", "--baseline", "--baseline-sha256", "--output"].includes(flag) ||
      Object.hasOwn(values, flag)
    ) {
      return null;
    }
    values[flag] = value;
  }
  for (const required of ["--repo", "--manifest", "--base", "--candidate", "--checkpoint", "--checks", "--required-checks"]) {
    if (!Object.hasOwn(values, required)) return null;
  }
  const checks = values["--checks"].split(",");
  return {
    output: values["--output"] ?? null,
    options: {
      repo: values["--repo"],
      manifest: values["--manifest"],
      base: values["--base"],
      candidate: values["--candidate"],
      checkpoint: values["--checkpoint"],
      checks,
      requiredChecks: values["--required-checks"] === "" ? [] : values["--required-checks"].split(","),
      policyMode: values["--policy-mode"] ?? "measure",
      ...(Object.hasOwn(values, "--baseline") ? { baseline: values["--baseline"] } : {}),
      ...(Object.hasOwn(values, "--baseline-sha256") ? { baselineSha256: values["--baseline-sha256"] } : {}),
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const parsed = parseCli(process.argv.slice(2));
  const result = await runQualityChecks(parsed?.options ?? null);
  if (parsed?.output === null || parsed?.output === undefined) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else {
    try {
      process.stdout.write(`${JSON.stringify(await persistQualityResult(parsed.output, result))}\n`);
    } catch (error) {
      process.stdout.write(`${JSON.stringify({
        schema_version: QUALITY_RECEIPT_SCHEMA_VERSION,
        kind: "team_harness_quality_receipt",
        verdict: "fail",
        error_code: error instanceof QualityError && ERROR_CODES.has(error.code) ? error.code : "OUTPUT_WRITE_FAILED",
        checkpoint: result.checkpoint,
        result_path: null,
        result_sha256: null,
        result_bytes: null,
      })}\n`);
      process.exitCode = 1;
    }
  }
  if (result.verdict !== "pass") process.exitCode = 1;
}
