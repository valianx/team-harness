#!/usr/bin/env node
/**
 * Run repository-declared quality commands against one clean Git candidate.
 *
 * The manifest owns command selection. This runner owns immutable Git identity,
 * argv-only execution, bounded output, normalized CRAP calculation, and a
 * closed JSON evidence envelope. It never installs tools, invokes a shell, or
 * decides whether a behavioral assertion expresses the approved intent.
 */

import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdtemp, open, readFile, realpath, rename, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

import { isBoundedCommandEnvelope, runBoundedCommand } from "./bounded-command.mjs";

const execFileAsync = promisify(execFile);

export const QUALITY_MANIFEST_SCHEMA_VERSION = 1;
export const QUALITY_RESULT_SCHEMA_VERSION = 2;
export const QUALITY_RECEIPT_SCHEMA_VERSION = 1;
export const CRAP_REPORT_SCHEMA_VERSION = 1;
export const CRAP_REPORT_TOKEN = "${TH_QUALITY_REPORT}";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_TIMEOUT_MS = 60 * 60 * 1000;
const MAX_JSON_BYTES = 1024 * 1024;
const MAX_CHANGED_PATHS = 512;
const MAX_FUNCTIONS = 512;
const MAX_ARGV_ITEMS = 128;
const MAX_ARGV_ITEM_BYTES = 8 * 1024;
const MAX_ARGV_BYTES = 64 * 1024;
const SAFE_CHECKPOINT = /^[a-z][a-z0-9_-]{0,63}$/;
const SAFE_COMMAND_ID = /^[a-z][a-z0-9_]{0,63}$/;
const SAFE_COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;
export const KNOWN_COMMANDS = [
  "test", "build", "typecheck", "format_check", "lint", "coverage", "crap",
  "invariants", "permissions", "accessibility", "contract", "integration", "database",
];
const ERROR_CODES = new Set([
  null,
  "ARGUMENT_INVALID",
  "MANIFEST_INVALID",
  "REPOSITORY_INVALID",
  "REF_INVALID",
  "CANDIDATE_NOT_HEAD",
  "BASE_NOT_ANCESTOR",
  "WORKTREE_DIRTY",
  "WORKTREE_MUTATED",
  "SCOPE_TOO_LARGE",
  "COMMAND_FAILED",
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
  "duration_ms",
  "repository",
  "manifest",
  "baseline",
  "commands",
  "crap",
];

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
      properties: Object.fromEntries(
        KNOWN_COMMANDS.map((id) => [
          id,
          {
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
            },
          },
        ]),
      ),
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
  $id: "team-harness/quality-result/v2",
  type: "object",
  additionalProperties: false,
  required: RESULT_KEYS,
  properties: {
    schema_version: { const: QUALITY_RESULT_SCHEMA_VERSION },
    kind: { const: "team_harness_quality" },
    checkpoint: { anyOf: [{ type: "null" }, { type: "string", pattern: "^[a-z][a-z0-9_-]{0,63}$" }] },
    verdict: { enum: ["pass", "fail"] },
    error_code: { anyOf: [{ type: "null" }, { enum: [...ERROR_CODES].filter((value) => value !== null) }] },
    duration_ms: { type: "integer", minimum: 0 },
    repository: { anyOf: [{ type: "null" }, { type: "object" }] },
    manifest: { anyOf: [{ type: "null" }, { type: "object" }] },
    baseline: { anyOf: [{ type: "null" }, { type: "object" }] },
    commands: { type: "array" },
    crap: { anyOf: [{ type: "null" }, { type: "object" }] },
  },
};

class QualityError extends Error {
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

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function canonicalHash(value) {
  return sha256(JSON.stringify(canonicalize(value)));
}

function isContained(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function isSafeRelativePath(value) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\u0000") || path.isAbsolute(value)) return false;
  const normalized = value.replaceAll("\\", "/");
  if (normalized.startsWith("/") || normalized.split("/").includes("..")) return false;
  return Buffer.byteLength(value, "utf8") <= 512;
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
    throw new QualityError("NON_HERMETIC_COMMAND");
  }
  return offset;
}

function packageManagerInvocation(argv) {
  let executable = normalizeExecutable(argv[0]);
  let offset = 1;
  if (executable === "corepack") {
    offset = skipLeadingOptions(argv, offset);
    executable = normalizeExecutable(argv[offset] ?? "");
    if (!PACKAGE_MANAGERS.has(executable)) throw new QualityError("NON_HERMETIC_COMMAND");
    offset += 1;
  }
  if (!PACKAGE_MANAGERS.has(executable)) return null;
  offset = skipLeadingOptions(argv, offset);
  return { executable, operation: argv[offset]?.toLowerCase() ?? null, operationOffset: offset };
}

function validateArgv(argv, { requireReportToken = false, allowLocalPnpmExec = false } = {}) {
  if (!Array.isArray(argv) || argv.length === 0 || argv.length > MAX_ARGV_ITEMS) throw new QualityError("MANIFEST_INVALID");
  let bytes = 0;
  let reportTokens = 0;
  for (const argument of argv) {
    if (typeof argument !== "string" || argument.length === 0 || argument.includes("\u0000")) {
      throw new QualityError("MANIFEST_INVALID");
    }
    const itemBytes = Buffer.byteLength(argument, "utf8");
    if (itemBytes > MAX_ARGV_ITEM_BYTES || bytes > MAX_ARGV_BYTES - itemBytes) {
      throw new QualityError("MANIFEST_INVALID");
    }
    bytes += itemBytes;
    if (argument === CRAP_REPORT_TOKEN) reportTokens += 1;
  }
  if (requireReportToken ? reportTokens !== 1 : reportTokens !== 0) throw new QualityError("MANIFEST_INVALID");
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
  if (nonHermetic) throw new QualityError("NON_HERMETIC_COMMAND");
  return argv.slice();
}

function validateCommand(command, id) {
  if (!hasOnlyKeys(command, ["argv", "working_directory", "timeout_ms", "version_argv", "required_environment"], ["argv"])) {
    throw new QualityError("MANIFEST_INVALID");
  }
  const workingDirectory = Object.hasOwn(command, "working_directory") ? command.working_directory : ".";
  if (!isSafeRelativePath(workingDirectory) && workingDirectory !== ".") throw new QualityError("MANIFEST_INVALID");
  const timeoutMs = Object.hasOwn(command, "timeout_ms") ? command.timeout_ms : DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new QualityError("MANIFEST_INVALID");
  }
  const normalized = {
    argv: validateArgv(command.argv, { requireReportToken: id === "crap", allowLocalPnpmExec: true }),
    working_directory: workingDirectory,
    timeout_ms: timeoutMs,
    version_argv: null,
    required_environment: [],
  };
  if (Object.hasOwn(command, "version_argv")) normalized.version_argv = validateArgv(command.version_argv);
  if (Object.hasOwn(command, "required_environment")) {
    if (!Array.isArray(command.required_environment) || command.required_environment.length > 32 ||
      new Set(command.required_environment).size !== command.required_environment.length ||
      command.required_environment.some((name) => typeof name !== "string" || !/^[A-Z][A-Z0-9_]{0,127}$/.test(name))) {
      throw new QualityError("MANIFEST_INVALID");
    }
    normalized.required_environment = command.required_environment.slice().sort();
  }
  return normalized;
}

function validateTestPathRule(rule) {
  if (!hasExactlyKeys(rule, ["type", "value"]) || !["prefix", "suffix", "segment"].includes(rule.type)) {
    throw new QualityError("MANIFEST_INVALID");
  }
  if (typeof rule.value !== "string" || rule.value.length === 0 || rule.value.includes("\u0000")) {
    throw new QualityError("MANIFEST_INVALID");
  }
  if (rule.type === "prefix" && !isSafeRelativePath(rule.value)) throw new QualityError("MANIFEST_INVALID");
  if (
    rule.type !== "prefix" &&
    (rule.value.includes("/") || rule.value.includes("\\") || rule.value === "." || rule.value === "..")
  ) {
    throw new QualityError("MANIFEST_INVALID");
  }
  if (Buffer.byteLength(rule.value, "utf8") > 128) throw new QualityError("MANIFEST_INVALID");
  return { type: rule.type, value: rule.value };
}

function validateTestContractConfig(value) {
  if (
    !hasExactlyKeys(value, ["path_rules"]) ||
    !Array.isArray(value.path_rules) ||
    value.path_rules.length === 0 ||
    value.path_rules.length > 32
  ) {
    throw new QualityError("MANIFEST_INVALID");
  }
  return { path_rules: value.path_rules.map(validateTestPathRule) };
}

export function validateQualityManifest(value) {
  if (!hasOnlyKeys(value, ["schema_version", "commands", "crap", "test_contract"], ["schema_version", "commands"])) {
    throw new QualityError("MANIFEST_INVALID");
  }
  if (value.schema_version !== QUALITY_MANIFEST_SCHEMA_VERSION) throw new QualityError("MANIFEST_INVALID");
  if (value.commands === null || typeof value.commands !== "object" || Array.isArray(value.commands)) {
    throw new QualityError("MANIFEST_INVALID");
  }
  const commandIds = Object.keys(value.commands);
  if (commandIds.length === 0 || commandIds.some((id) => !SAFE_COMMAND_ID.test(id) || !KNOWN_COMMANDS.includes(id))) {
    throw new QualityError("MANIFEST_INVALID");
  }
  const commands = Object.fromEntries(commandIds.sort().map((id) => [id, validateCommand(value.commands[id], id)]));

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
      throw new QualityError("MANIFEST_INVALID");
    }
    crap = {
      new_function_max: value.crap.new_function_max,
      changed_function_may_worsen: value.crap.changed_function_may_worsen,
    };
  } else if (Object.hasOwn(commands, "crap")) {
    throw new QualityError("MANIFEST_INVALID");
  }
  const testContract = Object.hasOwn(value, "test_contract")
    ? validateTestContractConfig(value.test_contract)
    : null;
  return { schema_version: QUALITY_MANIFEST_SCHEMA_VERSION, commands, crap, test_contract: testContract };
}

async function readBoundedJson(filePath, errorCode) {
  let stat;
  let bytes;
  try {
    stat = await lstat(filePath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_JSON_BYTES) throw new Error("invalid file");
    bytes = await readFile(filePath);
  } catch {
    throw new QualityError(errorCode);
  }
  if (bytes.length > MAX_JSON_BYTES) throw new QualityError(errorCode);
  try {
    return { value: JSON.parse(bytes.toString("utf8")), bytes };
  } catch {
    throw new QualityError(errorCode);
  }
}

async function git(repo, args) {
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
    throw new QualityError("REPOSITORY_INVALID");
  }
}

async function gitText(repo, args) {
  return (await git(repo, args)).toString("utf8").trim();
}

async function assertClean(repo, code) {
  const status = await git(repo, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  if (status.length !== 0) throw new QualityError(code);
}

function validateRepositoryInputs(repoInput, baseInput, candidateInput) {
  if (
    typeof repoInput !== "string" ||
    repoInput.length === 0 ||
    !SAFE_COMMIT.test(baseInput ?? "") ||
    !(candidateInput === "HEAD" || SAFE_COMMIT.test(candidateInput ?? ""))
  ) {
    throw new QualityError("ARGUMENT_INVALID");
  }
}

async function resolveRepositoryRoot(repoInput) {
  let repo;
  try {
    repo = await realpath(path.resolve(repoInput));
  } catch {
    throw new QualityError("REPOSITORY_INVALID");
  }
  const top = await gitText(repo, ["rev-parse", "--show-toplevel"]);
  let canonicalTop;
  try {
    canonicalTop = await realpath(top);
  } catch {
    throw new QualityError("REPOSITORY_INVALID");
  }
  if (canonicalTop !== repo) throw new QualityError("REPOSITORY_INVALID");
  await assertClean(repo, "WORKTREE_DIRTY");
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
    throw new QualityError("REF_INVALID");
  }
  if (candidateCommit !== headCommit) throw new QualityError("CANDIDATE_NOT_HEAD");
  const mergeBase = await gitText(repo, ["merge-base", baseCommit, candidateCommit]);
  if (mergeBase !== baseCommit) throw new QualityError("BASE_NOT_ANCESTOR");
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
  if (changedPaths.length > MAX_CHANGED_PATHS) throw new QualityError("SCOPE_TOO_LARGE");
  if (changedPaths.some((entry) => !isSafeRelativePath(entry))) throw new QualityError("REPOSITORY_INVALID");
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

async function resolveManifest(repo, manifestInput) {
  if (typeof manifestInput !== "string" || manifestInput.length === 0 || manifestInput.includes("\u0000")) {
    throw new QualityError("ARGUMENT_INVALID");
  }
  const requested = path.resolve(repo, manifestInput);
  let filePath;
  try {
    const requestedStat = await lstat(requested);
    if (!requestedStat.isFile() || requestedStat.isSymbolicLink()) throw new Error("invalid manifest");
    filePath = await realpath(requested);
  } catch {
    throw new QualityError("MANIFEST_INVALID");
  }
  if (!isContained(repo, filePath)) throw new QualityError("MANIFEST_INVALID");
  const loaded = await readBoundedJson(filePath, "MANIFEST_INVALID");
  const manifest = validateQualityManifest(loaded.value);
  return {
    value: manifest,
    evidence: {
      path: path.relative(repo, filePath).split(path.sep).join("/"),
      sha256: sha256(loaded.bytes),
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
    throw new QualityError("MANIFEST_INVALID");
  }
  if (!isContained(repo, resolved)) throw new QualityError("MANIFEST_INVALID");
  return resolved;
}

function pnpmExecParts(argv) {
  const invocation = packageManagerInvocation(argv);
  if (invocation?.executable !== "pnpm" || invocation.operation !== "exec") return null;
  let offset = invocation.operationOffset + 1;
  if (argv[offset] === "--") offset += 1;
  const tool = argv[offset];
  if (typeof tool !== "string" || !/^[A-Za-z0-9._-]+$/.test(tool)) throw new QualityError("NON_HERMETIC_COMMAND");
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
    throw new QualityError("NON_HERMETIC_COMMAND");
  }
  if (["add", "approve-builds", "audit", "import", "install", "i", "link", "rebuild", "remove", "rm", "uninstall", "update", "up"].includes(script.toLowerCase())) {
    throw new QualityError("NON_HERMETIC_COMMAND");
  }
  const args = argv.slice(offset + 1);
  if (args[0] === "--") args.shift();
  return { script, args };
}

function parseSimplePackageScript(value) {
  if (typeof value !== "string" || value.length === 0 || Buffer.byteLength(value, "utf8") > MAX_ARGV_BYTES) {
    throw new QualityError("NON_HERMETIC_COMMAND");
  }
  const parts = value.split(" ");
  if (parts.some((part) => part.length === 0 || !/^[A-Za-z0-9_./:@%+=,-]+$/.test(part))) {
    throw new QualityError("NON_HERMETIC_COMMAND");
  }
  const tool = parts[0];
  if (!/^[A-Za-z0-9._-]+$/.test(tool)) throw new QualityError("NON_HERMETIC_COMMAND");
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
  throw new QualityError("PREREQUISITE_UNAVAILABLE");
}

async function resolveDeclaredLocalBinary(argv, cwd, repository, platform = process.platform) {
  const coordinate = argv[0].replaceAll("\\", "/");
  const match = /^(?:\.\/)?node_modules\/\.bin\/([A-Za-z0-9._-]+)$/u.exec(coordinate);
  if (match === null) return null;
  if (!isSafeRelativePath(coordinate)) throw new QualityError("NON_HERMETIC_COMMAND");
  const requested = path.resolve(cwd, coordinate);
  if (!isContained(repository, requested)) throw new QualityError("NON_HERMETIC_COMMAND");
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
    throw new QualityError("PREREQUISITE_UNAVAILABLE");
  }
}

async function resolveRepositoryNodeScript(args, cwd, repository, resolution) {
  const [script, ...scriptArgs] = args;
  if (!isSafeRelativePath(script) || !/\.(?:cjs|js|mjs)$/iu.test(script)) {
    throw new QualityError("NON_HERMETIC_COMMAND");
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
    throw new QualityError("PREREQUISITE_UNAVAILABLE");
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
    packageJson = (await readBoundedJson(canonical, "PREREQUISITE_UNAVAILABLE")).value;
  } catch (error) {
    if (error instanceof QualityError) throw error;
    throw new QualityError("PREREQUISITE_UNAVAILABLE");
  }
  const scriptValue = packageJson?.scripts?.[scriptParts.script];
  if (scriptValue === undefined) throw new QualityError("PREREQUISITE_UNAVAILABLE");
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
    throw new QualityError("CRAP_REPORT_INVALID");
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
      throw new QualityError("CRAP_REPORT_INVALID");
    }
    const key = `${entry.path}\u0000${entry.symbol}`;
    if (seen.has(key)) throw new QualityError("CRAP_REPORT_INVALID");
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
  return hasExactlyKeys(value, ["path", "sha256"]) && isSafeRelativePath(value.path) && /^[0-9a-f]{64}$/.test(value.sha256);
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
      ["completed", "spawn_error", "argument_invalid", "internal_error"].includes(value.outcome) &&
      (value.exit_code === null || Number.isSafeInteger(value.exit_code)) &&
      (value.signal === null || /^SIG[A-Z0-9]+$/.test(value.signal)) &&
      Number.isSafeInteger(value.duration_ms) &&
      value.duration_ms >= 0 &&
      [null, "ARGUMENT_INVALID", "SPAWN_FAILED", "INTERNAL_ERROR"].includes(value.error_code))
  );
}

function isCommandEvidence(value) {
  const keys = [
    "id",
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
  if (!SAFE_COMMAND_ID.test(value.id) || !/^[0-9a-f]{64}$/.test(value.command_sha256)
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
  if (!hasExactlyKeys(value, RESULT_KEYS)) return false;
  if (value.schema_version !== QUALITY_RESULT_SCHEMA_VERSION || value.kind !== "team_harness_quality") return false;
  if (value.checkpoint !== null && (typeof value.checkpoint !== "string" || !SAFE_CHECKPOINT.test(value.checkpoint))) return false;
  if (!["pass", "fail"].includes(value.verdict) || !ERROR_CODES.has(value.error_code)) return false;
  if (!Number.isSafeInteger(value.duration_ms) || value.duration_ms < 0) return false;
  if (value.repository !== null && !isRepositoryEvidence(value.repository)) return false;
  if (value.manifest !== null && !isManifestEvidence(value.manifest)) return false;
  if (value.baseline !== null && !isBaselineEvidence(value.baseline)) return false;
  if (!Array.isArray(value.commands) || !value.commands.every(isCommandEvidence)) return false;
  if (new Set(value.commands.map((entry) => entry.id)).size !== value.commands.length) return false;
  if (value.crap !== null && !isCrapEvidence(value.crap)) return false;
  if (value.verdict === "pass" && value.error_code !== null) return false;
  if (value.verdict === "pass" && value.commands.some((entry) => entry.verdict !== "pass")) return false;
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
    result.manifest.sha256 === context.manifestEvidence.sha256 &&
    result.repository.base_commit === context.repository.base_commit &&
    result.repository.base_tree === context.repository.base_tree
  );
}

async function loadBaseline(context) {
  const loaded = await readBoundedJson(context.filePath, "BASELINE_INVALID");
  const result = loaded.value;
  if (!isCompatibleBaseline(result, context, loaded.bytes)) throw new QualityError("BASELINE_INVALID");
  const priorCrapCommand = result.commands.find((entry) => entry?.id === "crap");
  if (priorCrapCommand?.command_sha256 !== context.currentCrapCommandHash) throw new QualityError("BASELINE_INVALID");
  const mergeBase = await gitText(context.repo, [
    "merge-base",
    result.repository.candidate_commit,
    context.repository.candidate_commit,
  ]);
  if (mergeBase !== result.repository.candidate_commit) throw new QualityError("BASELINE_INVALID");
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
    throw new QualityError("ARGUMENT_INVALID");
  }
  if (typeof options.checkpoint !== "string" || !SAFE_CHECKPOINT.test(options.checkpoint)) {
    throw new QualityError("ARGUMENT_INVALID");
  }
  if (
    !Array.isArray(options.checks) ||
    options.checks.length === 0 ||
    new Set(options.checks).size !== options.checks.length ||
    options.checks.some((id) => typeof id !== "string" || !SAFE_COMMAND_ID.test(id) || !KNOWN_COMMANDS.includes(id))
  ) {
    throw new QualityError("ARGUMENT_INVALID");
  }
  const policyMode = Object.hasOwn(options, "policyMode") ? options.policyMode : "measure";
  if (!["measure", "enforce"].includes(policyMode)) throw new QualityError("ARGUMENT_INVALID");
  const requiredChecks = options.requiredChecks;
  if (!Array.isArray(requiredChecks) || new Set(requiredChecks).size !== requiredChecks.length ||
    requiredChecks.some((id) => typeof id !== "string" || !KNOWN_COMMANDS.includes(id))) {
    throw new QualityError("ARGUMENT_INVALID");
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
  const manifest = await resolveManifest(repository.root, options.manifest);
  state.manifest = manifest.evidence;
  if (options.requiredChecks.some((id) =>
    !Object.hasOwn(manifest.value.commands, id) || !options.checks.includes(id))) {
    throw new QualityError("REQUIRED_CHECKS_MISSING");
  }
  if (options.checks.some((id) => !Object.hasOwn(manifest.value.commands, id))) {
    throw new QualityError("MANIFEST_INVALID");
  }
  const usesCrap = options.checks.includes("crap");
  if (usesCrap && manifest.value.crap === null) throw new QualityError("MANIFEST_INVALID");
  if (
    usesCrap &&
    options.policyMode === "enforce" &&
    (typeof options.baseline !== "string" || typeof options.baselineSha256 !== "string")
  ) {
    throw new QualityError("BASELINE_INVALID");
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

async function runVersionCheck(context, id, command, cwd, resolved) {
  if (command.version_argv === null) return null;
  const versionResolved = await resolveExecutionArgv(command.version_argv, cwd, context.repository.root);
  const version = await runBoundedCommand({
    argv: versionResolved.argv,
    cwd,
    timeoutMs: command.timeout_ms,
    includeSuccessDiagnostic: true,
  });
  await assertClean(context.repository.root, "WORKTREE_MUTATED");
  if (version.outcome !== "completed" || version.exit_code !== 0 || version.signal !== null) {
    context.state.commands.push(commandEvidence(id, command, version, version, resolved.identity, resolved.resolution));
    throw new QualityError("COMMAND_FAILED");
  }
  return version;
}

async function runManifestCommand(context, id) {
  const command = context.manifest.value.commands[id];
  if (command.required_environment.some((name) => !Object.hasOwn(process.env, name) || process.env[name] === "")) {
    throw new QualityError("PREREQUISITE_UNAVAILABLE");
  }
  const cwd = await commandWorkingDirectory(context.repository.root, command.working_directory);
  const resolved = await resolveExecutionArgv(command.argv, cwd, context.repository.root);
  const version = await runVersionCheck(context, id, command, cwd, resolved);
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
  await assertClean(context.repository.root, "WORKTREE_MUTATED");
  if (evidence.verdict !== "pass") throw new QualityError("COMMAND_FAILED");
  if (id !== "crap") return null;
  const report = await readBoundedJson(reportPath, "CRAP_REPORT_INVALID");
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
  if (policy.verdict === "fail") throw new QualityError("CRAP_POLICY_FAILED");
}

function applyCrapPolicy(functions, config, policyMode, baselineResult) {
  const baselineFunctions = new Map(
    (baselineResult?.crap?.functions ?? []).map((entry) => [`${entry.path}\u0000${entry.symbol}`, entry]),
  );
  let failed = false;
  const evaluated = functions.map((entry) => {
    const prior = baselineFunctions.get(`${entry.path}\u0000${entry.symbol}`);
    if (policyMode === "enforce" && entry.status === "changed" && prior === undefined) {
      throw new QualityError("CRAP_REPORT_INCOMPLETE");
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
      throw new QualityError("CRAP_REPORT_INCOMPLETE");
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
    await assertClean(context.repository.root, "WORKTREE_MUTATED");
  } catch (error) {
    state.error_code = error instanceof QualityError && ERROR_CODES.has(error.code) ? error.code : "INTERNAL_ERROR";
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
    throw new QualityError("ARGUMENT_INVALID");
  }
  const target = path.resolve(outputPath);
  const parent = path.dirname(target);
  try {
    const parentStat = await lstat(parent);
    if (!parentStat.isDirectory() || parentStat.isSymbolicLink() || await realpath(parent) !== parent) {
      throw new QualityError("ARGUMENT_INVALID");
    }
    try {
      const targetStat = await lstat(target);
      if (!targetStat.isFile() || targetStat.isSymbolicLink()) throw new QualityError("ARGUMENT_INVALID");
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
      if (await realpath(parent) !== parent) throw new QualityError("ARGUMENT_INVALID");
      try {
        const targetStat = await lstat(target);
        if (!targetStat.isFile() || targetStat.isSymbolicLink()) throw new QualityError("ARGUMENT_INVALID");
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
      throw new QualityError("OUTPUT_WRITE_FAILED");
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
    throw new QualityError("OUTPUT_WRITE_FAILED");
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
