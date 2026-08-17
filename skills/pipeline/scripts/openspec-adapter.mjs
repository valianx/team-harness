#!/usr/bin/env node
/**
 * Thin, bounded driver for the upstream OpenSpec toolchain.
 *
 * The driver discovers and provisions dependencies but never changes Team
 * Harness state, releases a gate, or treats an OpenSpec result as authority.
 */

import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { runBoundedCommand } from "./bounded-command.mjs";

export const OPENSPEC_ADAPTER_SCHEMA_VERSION = 2;
export const DEFAULT_TIMEOUT_MS = 30_000;
export const MAX_FILE_BYTES = 1024 * 1024;
export const MAX_TARGETS = 32;

const SKILL_NAMES = ["apply-change", "archive-change", "explore", "propose", "sync-specs", "update-change"];
const COMMAND_NAMES = ["apply", "archive", "explore", "propose", "sync", "update"];
const SAFE_RUNTIME = /^[a-z][a-z0-9-]{0,31}$/;
const SAFE_NONCE = /^[A-Za-z0-9_-]{8,128}$/;
const SAFE_VERSION = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const OUTCOMES = new Set(["ready", "provisionable", "blocked-prerequisite", "invalid-project", "provisioned", "declined", "failed"]);
const ERROR_CODES = new Set([
  null,
  "ARGUMENT_INVALID",
  "NODE_MISSING",
  "NODE_INCOMPATIBLE",
  "NPM_MISSING",
  "OPENSPEC_MISSING",
  "OPENSPEC_INCOMPATIBLE",
  "PROJECT_INVALID",
  "PROJECT_UNINITIALIZED",
  "TARGET_MISSING",
  "TARGET_STALE",
  "TARGET_INVALID",
  "TARGET_COLLISION",
  "APPROVAL_REQUIRED",
  "INSTALL_FAILED",
  "INIT_FAILED",
  "INIT_SANDBOX_DENIED",
  "UPDATE_FAILED",
  "VERIFICATION_FAILED",
  "OUTPUT_LIMIT",
]);

function exactlyKeys(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function safeString(value, maximum = 1024) {
  return typeof value === "string" && value.length > 0 && !value.includes("\0")
    && Buffer.byteLength(value, "utf8") <= maximum;
}

function safeRelative(value) {
  if (!safeString(value, 512) || path.isAbsolute(value)) return false;
  const normalized = value.replaceAll("\\", "/");
  return !normalized.startsWith("/") && !normalized.split("/").includes("..");
}

function evidence(overrides = {}) {
  return {
    timestamp: new Date().toISOString(),
    node_version: null,
    npm_version: null,
    openspec_version: null,
    executable: null,
    runtime: null,
    project_root: null,
    targets: [],
    diagnostic: null,
    ...overrides,
  };
}

function result(operation, outcome, errorCode = null, details = {}) {
  return {
    schema_version: OPENSPEC_ADAPTER_SCHEMA_VERSION,
    kind: "team_harness_openspec_adapter",
    operation,
    outcome,
    error_code: errorCode,
    evidence: evidence(details),
  };
}

export function isOpenSpecAdapterResult(value) {
  if (!exactlyKeys(value, ["schema_version", "kind", "operation", "outcome", "error_code", "evidence"])) return false;
  if (value.schema_version !== OPENSPEC_ADAPTER_SCHEMA_VERSION || value.kind !== "team_harness_openspec_adapter"
    || !safeString(value.operation, 64) || !OUTCOMES.has(value.outcome) || !ERROR_CODES.has(value.error_code)) return false;
  const proof = value.evidence;
  if (!exactlyKeys(proof, ["timestamp", "node_version", "npm_version", "openspec_version", "executable", "runtime", "project_root", "targets", "diagnostic"])) return false;
  if (Number.isNaN(Date.parse(proof.timestamp))) return false;
  for (const version of [proof.node_version, proof.npm_version, proof.openspec_version]) {
    if (version !== null && parseSemver(version) === null) return false;
  }
  if (proof.executable !== null && !safeString(proof.executable)) return false;
  if (proof.runtime !== null && !SAFE_RUNTIME.test(proof.runtime)) return false;
  if (proof.project_root !== null && !safeString(proof.project_root, 4096)) return false;
  if (!Array.isArray(proof.targets) || proof.targets.length > MAX_TARGETS) return false;
  if (!proof.targets.every(target => exactlyKeys(target, ["path", "sha256"])
    && safeRelative(target.path) && /^[a-f0-9]{64}$/.test(target.sha256))) return false;
  return proof.diagnostic === null || safeString(proof.diagnostic, 160);
}

export function parseSemver(value) {
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") > 128) return null;
  const match = SAFE_VERSION.exec(value.trim());
  if (!match) return null;
  return {
    major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]),
    prerelease: value.includes("-"), normalized: `${match[1]}.${match[2]}.${match[3]}`,
  };
}

export function semverAtLeast(value, minimum) {
  const actual = parseSemver(value);
  const required = parseSemver(minimum);
  if (!actual || !required || actual.prerelease) return false;
  for (const key of ["major", "minor", "patch"]) {
    if (actual[key] !== required[key]) return actual[key] > required[key];
  }
  return true;
}

export function isOpenSpecPolicy(value) {
  return exactlyKeys(value, ["schema_version", "node", "npm", "openspec", "runtime_targets"])
    && value.schema_version === 1
    && exactlyKeys(value.node, ["range"]) && value.node.range === ">=20.19.0"
    && exactlyKeys(value.npm, ["required"]) && value.npm.required === true
    && exactlyKeys(value.openspec, ["package", "version"])
    && value.openspec.package === "@fission-ai/openspec" && value.openspec.version === "1.9.0"
    && Array.isArray(value.runtime_targets) && value.runtime_targets.length === 3
    && new Set(value.runtime_targets).size === value.runtime_targets.length
    && value.runtime_targets.every(target => SAFE_RUNTIME.test(target));
}

export async function loadOpenSpecPolicy(policyPath = new URL("../openspec-policy.json", import.meta.url)) {
  const bytes = await readFile(policyPath);
  if (bytes.length > MAX_FILE_BYTES) throw new Error("policy too large");
  const policy = JSON.parse(bytes.toString("utf8"));
  if (!isOpenSpecPolicy(policy)) throw new Error("invalid OpenSpec policy");
  return policy;
}

function runtimePaths(runtime) {
  const skills = SKILL_NAMES.map(name => {
    const root = runtime === "codex" ? ".agents" : `.${runtime}`;
    return `${root}/skills/openspec-${name}/SKILL.md`;
  });
  if (runtime === "codex") return [".agents/skills/.openspec-target", ...skills];
  const commands = COMMAND_NAMES.map(name => runtime === "claude"
    ? `.claude/commands/opsx/${name}.md`
    : `.opencode/commands/opsx-${name}.md`);
  return [...skills, ...commands];
}

function contained(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function canonicalProjectRoot(projectRoot) {
  if (!safeString(projectRoot, 4096)) throw new Error("invalid root");
  const canonical = await realpath(projectRoot);
  const stat = await lstat(canonical);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("invalid root");
  return canonical;
}

async function readCandidate(root, relativePath) {
  if (!safeRelative(relativePath)) throw new Error("invalid target");
  const requested = path.resolve(root, relativePath);
  const stat = await lstat(requested);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_FILE_BYTES) throw new Error("invalid target");
  const canonical = await realpath(requested);
  if (!contained(root, canonical)) throw new Error("invalid target");
  return readFile(canonical);
}

function hasOpenSpecOwnership(relativePath, bytes, runtime, version) {
  const text = bytes.toString("utf8");
  if (relativePath.endsWith(".openspec-target")) return text.trim() === runtime;
  if (relativePath.endsWith("SKILL.md")) {
    return /\n\s*author:\s*openspec\s*(?:\n|$)/.test(`\n${text}`)
      && new RegExp(`\\n\\s*generatedBy:\\s*["']?${version.replaceAll(".", "\\.")}["']?\\s*(?:\\n|$)`).test(`\n${text}`);
  }
  return text.includes("openspec") || text.includes("OpenSpec");
}

/** Inspect the complete upstream-generated surface for one runtime. */
export async function inspectRuntimeIntegration({ projectRoot, runtime, policy } = {}) {
  let activePolicy;
  try { activePolicy = policy ?? await loadOpenSpecPolicy(); } catch { return result("integration", "invalid-project", "ARGUMENT_INVALID"); }
  if (!isOpenSpecPolicy(activePolicy) || !activePolicy.runtime_targets.includes(runtime)) {
    return result("integration", "invalid-project", "ARGUMENT_INVALID");
  }
  let root;
  try { root = await canonicalProjectRoot(projectRoot); } catch { return result("integration", "invalid-project", "PROJECT_INVALID"); }
  const targets = [];
  try {
    const config = await readCandidate(root, "openspec/config.yaml");
    if (!/^\s*schema:\s*[a-z0-9-]+\s*$/m.test(config.toString("utf8"))) {
      return result("integration", "invalid-project", "PROJECT_INVALID", { runtime, project_root: root });
    }
    targets.push({ path: "openspec/config.yaml", sha256: createHash("sha256").update(config).digest("hex") });
  } catch (error) {
    if (error?.code === "ENOENT") {
      return result("integration", "provisionable", "PROJECT_UNINITIALIZED", { runtime, project_root: root });
    }
    return result("integration", "invalid-project", "PROJECT_INVALID", { runtime, project_root: root });
  }
  let missing = false;
  for (const relativePath of runtimePaths(runtime)) {
    let bytes;
    try {
      bytes = await readCandidate(root, relativePath);
    } catch (error) {
      if (error?.code === "ENOENT") { missing = true; continue; }
      return result("integration", "invalid-project", "TARGET_INVALID", { runtime, project_root: root });
    }
    if (!hasOpenSpecOwnership(relativePath, bytes, runtime, activePolicy.openspec.version)) {
      const staleSkill = relativePath.endsWith("SKILL.md")
        && /\n\s*author:\s*openspec\s*(?:\n|$)/.test(`\n${bytes.toString("utf8")}`);
      return result("integration", staleSkill ? "provisionable" : "invalid-project",
        staleSkill ? "TARGET_STALE" : "TARGET_COLLISION", { runtime, project_root: root });
    }
    targets.push({ path: relativePath, sha256: createHash("sha256").update(bytes).digest("hex") });
  }
  targets.sort((a, b) => a.path.localeCompare(b.path));
  return missing
    ? result("integration", "provisionable", "TARGET_MISSING", { runtime, project_root: root, targets })
    : result("integration", "ready", null, { runtime, project_root: root, targets });
}

function commandRunnerOrDefault(commandRunner) {
  return commandRunner ?? (options => runBoundedCommand({
    ...options, includeSuccessDiagnostic: true, timeoutMs: DEFAULT_TIMEOUT_MS,
  }));
}

function commandVersion(command) {
  if (command?.outcome !== "completed" || command.exit_code !== 0) return null;
  if (command.stdout?.truncated || command.stderr?.truncated) return "truncated";
  const output = `${command.stdout?.tail ?? ""} ${command.stderr?.tail ?? ""}`;
  const match = /v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)/.exec(output);
  return match?.[1] ?? null;
}

async function getVersion(runner, argv) {
  const command = await runner({ argv });
  return { command, version: commandVersion(command) };
}

function commandFailed(command) {
  return command?.outcome !== "completed" || command.exit_code !== 0;
}

function publicProof(base, overrides = {}) {
  return { ...base, ...overrides };
}

/** Discovery only: it performs no install, init, update, or state mutation. */
export async function preflight({
  projectRoot,
  runtime,
  policy,
  commandRunner,
  executables = { node: "node", npm: "npm", openspec: "openspec" },
} = {}) {
  let activePolicy;
  try { activePolicy = policy ?? await loadOpenSpecPolicy(); } catch { return result("preflight", "invalid-project", "ARGUMENT_INVALID"); }
  if (!isOpenSpecPolicy(activePolicy) || !activePolicy.runtime_targets.includes(runtime)
    || !exactlyKeys(executables, ["node", "npm", "openspec"])
    || !Object.values(executables).every(value => safeString(value, 1024))) {
    return result("preflight", "invalid-project", "ARGUMENT_INVALID");
  }
  let root;
  try { root = await canonicalProjectRoot(projectRoot); } catch { return result("preflight", "invalid-project", "PROJECT_INVALID"); }
  const runner = commandRunnerOrDefault(commandRunner);
  const base = { runtime, project_root: root };
  const node = await getVersion(runner, [executables.node, "--version"]);
  if (node.version === "truncated") return result("preflight", "blocked-prerequisite", "OUTPUT_LIMIT", base);
  if (!parseSemver(node.version ?? "")) return result("preflight", "blocked-prerequisite", "NODE_MISSING", base);
  const proof = publicProof(base, { node_version: parseSemver(node.version).normalized });
  if (!semverAtLeast(node.version, activePolicy.node.range.slice(2))) {
    return result("preflight", "blocked-prerequisite", "NODE_INCOMPATIBLE", proof);
  }
  const npm = await getVersion(runner, [executables.npm, "--version"]);
  if (npm.version === "truncated") return result("preflight", "blocked-prerequisite", "OUTPUT_LIMIT", proof);
  if (!parseSemver(npm.version ?? "")) return result("preflight", "blocked-prerequisite", "NPM_MISSING", proof);
  proof.npm_version = parseSemver(npm.version).normalized;
  const cli = await getVersion(runner, [executables.openspec, "--version"]);
  if (cli.version === "truncated") return result("preflight", "provisionable", "OUTPUT_LIMIT", proof);
  if (!parseSemver(cli.version ?? "")) return result("preflight", "provisionable", "OPENSPEC_MISSING", proof);
  proof.openspec_version = parseSemver(cli.version).normalized;
  proof.executable = executables.openspec;
  if (proof.openspec_version !== activePolicy.openspec.version) {
    return result("preflight", "provisionable", "OPENSPEC_INCOMPATIBLE", proof);
  }
  const integration = await inspectRuntimeIntegration({ projectRoot: root, runtime, policy: activePolicy });
  return result("preflight", integration.outcome, integration.error_code, publicProof(proof, {
    targets: integration.evidence.targets,
  }));
}

function validApproval(approval) {
  return exactlyKeys(approval, ["decision", "nonce", "decided_at"])
    && approval.decision === "approved" && SAFE_NONCE.test(approval.nonce)
    && typeof approval.decided_at === "string" && !Number.isNaN(Date.parse(approval.decided_at));
}

async function runMutation(runner, argv, cwd) {
  const command = await runner({ argv, cwd });
  if (command?.stdout?.truncated || command?.stderr?.truncated) return { ok: false, limit: true, command };
  return { ok: !commandFailed(command), limit: false, command };
}

function initFailure(command) {
  const output = `${command?.stderr?.tail ?? ""}\n${command?.stdout?.tail ?? ""}`;
  const protectedTarget = /(?:^|[\\/])\.(?:agents|codex)(?:[\\/]|$)/im.test(output);
  const writeDenied = /\b(?:EACCES|EPERM|EROFS|ENOENT)\b|permission denied|read-only file system|operation not permitted/im.test(output);
  if (protectedTarget && writeDenied) {
    return {
      errorCode: "INIT_SANDBOX_DENIED",
      diagnostic: "OpenSpec init could not write protected .agents/.codex paths; retry the exact init command once with sandbox escalation and login:false.",
    };
  }
  return {
    errorCode: "INIT_FAILED",
    diagnostic: "OpenSpec init failed; inspect the bounded command output before retrying.",
  };
}

async function initializeFromPreflight({ before, runner, executables, operation, policy }) {
  const base = {
    node_version: before.evidence.node_version,
    npm_version: before.evidence.npm_version,
    openspec_version: before.evidence.openspec_version,
    executable: before.evidence.executable,
    runtime: before.evidence.runtime,
    project_root: before.evidence.project_root,
    targets: before.evidence.targets,
  };
  const initialized = await runMutation(runner, [
    executables.openspec, "init", "--tools", before.evidence.runtime,
    "--no-animation", "--no-copilot-cloud", before.evidence.project_root,
  ], before.evidence.project_root);
  if (!initialized.ok) {
    if (initialized.limit) return result(operation, "failed", "OUTPUT_LIMIT", base);
    const failure = initFailure(initialized.command);
    return result(operation, "failed", failure.errorCode, { ...base, diagnostic: failure.diagnostic });
  }
  const verified = await preflight({
    projectRoot: before.evidence.project_root,
    runtime: before.evidence.runtime,
    policy,
    commandRunner: runner,
    executables,
  });
  if (verified.outcome !== "ready") {
    return result(operation, "failed", "VERIFICATION_FAILED", {
      ...base,
      targets: verified.evidence.targets,
      diagnostic: "OpenSpec init completed but the generated integration did not pass preflight verification.",
    });
  }
  return result(operation, "ready", null, verified.evidence);
}

/** Initialize a compatible but uninitialized repository without an install/upgrade approval. */
export async function initializeProject({
  projectRoot,
  runtime,
  policy,
  commandRunner,
  executables = { node: "node", npm: "npm", openspec: "openspec" },
} = {}) {
  let activePolicy;
  try { activePolicy = policy ?? await loadOpenSpecPolicy(); } catch { return result("initialize", "invalid-project", "ARGUMENT_INVALID"); }
  const runner = commandRunnerOrDefault(commandRunner);
  const before = await preflight({ projectRoot, runtime, policy: activePolicy, commandRunner: runner, executables });
  if (before.error_code !== "PROJECT_UNINITIALIZED") return { ...before, operation: "initialize" };
  return initializeFromPreflight({ before, runner, executables, operation: "initialize", policy: activePolicy });
}

/**
 * Execute only the policy-pinned installation and upstream init/update after
 * Main has persisted a live approval decision.
 */
export async function provision({
  approval,
  projectRoot,
  runtime,
  policy,
  commandRunner,
  executables = { node: "node", npm: "npm", openspec: "openspec" },
} = {}) {
  if (!validApproval(approval)) return result("provision", "declined", "APPROVAL_REQUIRED");
  let activePolicy;
  try { activePolicy = policy ?? await loadOpenSpecPolicy(); } catch { return result("provision", "failed", "ARGUMENT_INVALID"); }
  const runner = commandRunnerOrDefault(commandRunner);
  const before = await preflight({ projectRoot, runtime, policy: activePolicy, commandRunner: runner, executables });
  if (["blocked-prerequisite", "invalid-project"].includes(before.outcome)) return { ...before, operation: "provision" };
  const base = {
    node_version: before.evidence.node_version,
    npm_version: before.evidence.npm_version,
    openspec_version: before.evidence.openspec_version,
    executable: before.evidence.executable,
    runtime: before.evidence.runtime,
    project_root: before.evidence.project_root,
    targets: before.evidence.targets,
  };
  if (["OPENSPEC_MISSING", "OPENSPEC_INCOMPATIBLE", "OUTPUT_LIMIT"].includes(before.error_code)) {
    const install = await runMutation(runner, [
      executables.npm, "install", "--global", `${activePolicy.openspec.package}@${activePolicy.openspec.version}`,
    ], before.evidence.project_root);
    if (!install.ok) return result("provision", "failed", install.limit ? "OUTPUT_LIMIT" : "INSTALL_FAILED", base);
  }
  const afterInstall = await preflight({ projectRoot, runtime, policy: activePolicy, commandRunner: runner, executables });
  if (["blocked-prerequisite", "invalid-project"].includes(afterInstall.outcome)
    || ["OPENSPEC_MISSING", "OPENSPEC_INCOMPATIBLE", "OUTPUT_LIMIT"].includes(afterInstall.error_code)) {
    return result("provision", "failed", "VERIFICATION_FAILED", base);
  }
  if (["PROJECT_UNINITIALIZED", "TARGET_MISSING"].includes(afterInstall.error_code)) {
    const initialized = await initializeFromPreflight({
      before: afterInstall, runner, executables, operation: "provision", policy: activePolicy,
    });
    if (initialized.outcome !== "ready") return initialized;
  } else if (afterInstall.error_code === "TARGET_STALE") {
    const updated = await runMutation(runner, [executables.openspec, "update", afterInstall.evidence.project_root], afterInstall.evidence.project_root);
    if (!updated.ok) return result("provision", "failed", updated.limit ? "OUTPUT_LIMIT" : "UPDATE_FAILED", base);
  }
  const verified = await preflight({ projectRoot, runtime, policy: activePolicy, commandRunner: runner, executables });
  if (verified.outcome !== "ready") {
    return result("provision", "failed", "VERIFICATION_FAILED", {
      ...base, targets: verified.evidence.targets,
    });
  }
  return result("provision", "provisioned", null, verified.evidence);
}

function cliError(operation) { return result(operation, "invalid-project", "ARGUMENT_INVALID"); }

async function runCli() {
  const [operation, raw] = process.argv.slice(2);
  if (!new Set(["preflight", "initialize", "provision", "integration"]).has(operation)) return cliError(operation ?? "unknown");
  let options;
  try { options = raw ? JSON.parse(raw) : {}; } catch { return cliError(operation); }
  if (options === null || typeof options !== "object" || Array.isArray(options)) return cliError(operation);
  if (operation === "preflight") return preflight(options);
  if (operation === "initialize") return initializeProject(options);
  if (operation === "provision") return provision(options);
  return inspectRuntimeIntegration(options);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const output = await runCli().catch(() => cliError("unknown"));
  process.stdout.write(`${JSON.stringify(output)}\n`);
  if (!isOpenSpecAdapterResult(output) || !["ready", "provisionable", "provisioned", "declined"].includes(output.outcome)) process.exitCode = 1;
}
