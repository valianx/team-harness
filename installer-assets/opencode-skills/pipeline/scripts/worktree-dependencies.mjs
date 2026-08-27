#!/usr/bin/env node
/** Inspect and provision self-contained Node dependencies for a pipeline worktree. */

import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, realpath, unlink } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { isDirectExecution } from "./cli-entrypoint.mjs";
import { promisify } from "node:util";

export const WORKTREE_DEPENDENCIES_SCHEMA_VERSION = 1;
const MAX_PACKAGE_BYTES = 1024 * 1024;
const INSTALL_TIMEOUT_MS = 15 * 60 * 1000;
const execFileAsync = promisify(execFile);
const LOCKFILES = new Map([
  ["pnpm-lock.yaml", ["pnpm", "install", "--frozen-lockfile"]],
  ["package-lock.json", ["npm", "ci"]],
  ["yarn.lock", ["yarn", "install", "--immutable"]],
  ["bun.lock", ["bun", "install", "--frozen-lockfile"]],
  ["bun.lockb", ["bun", "install", "--frozen-lockfile"]],
]);

function digest(hash, bytes) {
  return bytes === 0 ? null : hash.digest("hex");
}

export function runDependencyCommand(argv, cwd) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const stdoutHash = createHash("sha256");
    const stderrHash = createHash("sha256");
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    let timer;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({
        duration_ms: Math.max(0, Date.now() - startedAt),
        stdout_bytes: stdoutBytes,
        stderr_bytes: stderrBytes,
        stdout_sha256: digest(stdoutHash, stdoutBytes),
        stderr_sha256: digest(stderrHash, stderrBytes),
        ...value,
      });
    };
    let child;
    try {
      child = spawn(argv[0], argv.slice(1), {
        cwd,
        env: process.env,
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      finish({ ok: false, exit_code: null, signal: null, error_code: error?.code ?? "SPAWN_FAILED" });
      return;
    }
    child.stdout.on("data", (chunk) => {
      stdoutBytes += chunk.length;
      stdoutHash.update(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderrBytes += chunk.length;
      stderrHash.update(chunk);
    });
    child.once("error", (error) => {
      finish({ ok: false, exit_code: null, signal: null, error_code: error?.code ?? "SPAWN_FAILED" });
    });
    child.once("close", (code, signal) => {
      finish({ ok: code === 0, exit_code: code, signal, error_code: code === 0 ? null : "COMMAND_FAILED" });
    });
    timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish({ ok: false, exit_code: null, signal: "SIGTERM", error_code: "COMMAND_TIMEOUT" });
    }, INSTALL_TIMEOUT_MS);
  });
}

function result(operation, outcome, errorCode, details = {}) {
  return {
    schema_version: WORKTREE_DEPENDENCIES_SCHEMA_VERSION,
    kind: "team_harness_worktree_dependencies",
    operation,
    outcome,
    error_code: errorCode,
    repository: details.repository ?? null,
    package_manager: details.package_manager ?? null,
    lockfile: details.lockfile ?? null,
    node_modules_state: details.node_modules_state ?? null,
    required_action: details.required_action ?? null,
    command: details.command ?? null,
    diagnostic: details.diagnostic ?? null,
  };
}

async function gitText(repository, args) {
  const { stdout } = await execFileAsync("git", args, {
    cwd: repository,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 64 * 1024,
  });
  return stdout.trim();
}

async function canonicalRepository(input) {
  if (typeof input !== "string" || !path.isAbsolute(input) || input.includes("\0")) throw new Error("invalid repository");
  const requested = path.resolve(input);
  const stat = await lstat(requested);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("invalid repository");
  const canonical = await realpath(requested);
  if (canonical !== requested) throw new Error("repository must be canonical");
  const top = await gitText(canonical, ["rev-parse", "--show-toplevel"]);
  if (path.resolve(top) !== canonical) throw new Error("repository must be the worktree root");
  return canonical;
}

async function regularFile(file, maxBytes = null) {
  try {
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || (maxBytes !== null && stat.size > maxBytes)) return false;
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function dependencyState(repository) {
  const packagePath = path.join(repository, "package.json");
  if (!(await regularFile(packagePath, MAX_PACKAGE_BYTES))) {
    return { error_code: "PACKAGE_MANIFEST_UNAVAILABLE", diagnostic: "Restore a regular package.json at the worktree root before dispatch." };
  }
  try { JSON.parse(await readFile(packagePath, "utf8")); }
  catch { return { error_code: "PACKAGE_MANIFEST_INVALID", diagnostic: "Repair package.json before dependency provisioning." }; }

  const lockfiles = [];
  for (const [name, argv] of LOCKFILES) {
    if (await regularFile(path.join(repository, name))) lockfiles.push({ name, argv });
  }
  if (lockfiles.length === 0) {
    return { error_code: "LOCKFILE_UNAVAILABLE", diagnostic: "Restore one supported lockfile; mutable dependency resolution is not allowed." };
  }
  if (lockfiles.length > 1) {
    return { error_code: "LOCKFILE_AMBIGUOUS", diagnostic: "Keep exactly one supported root lockfile before automatic provisioning." };
  }

  const selected = lockfiles[0];
  const nodeModules = path.join(repository, "node_modules");
  let nodeModulesState = "absent";
  try {
    const stat = await lstat(nodeModules);
    nodeModulesState = stat.isSymbolicLink() ? "symlink" : stat.isDirectory() ? "local-directory" : "invalid";
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return {
    package_manager: selected.argv[0],
    lockfile: selected.name,
    install_argv: selected.argv,
    node_modules_state: nodeModulesState,
  };
}

function action(repository) {
  return {
    cwd: repository,
    argv: [process.execPath, fileURLToPath(import.meta.url), "provision", "--repository", repository],
  };
}

export async function inspectWorktreeDependencies({ repository } = {}) {
  let root;
  try { root = await canonicalRepository(repository); }
  catch { return result("inspect", "unavailable", "REPOSITORY_INVALID", { diagnostic: "Supply the absolute canonical Git worktree root." }); }
  let state;
  try { state = await dependencyState(root); }
  catch { return result("inspect", "unavailable", "INSPECTION_FAILED", { repository: root, diagnostic: "Dependency topology inspection failed." }); }
  if (state.error_code) return result("inspect", "unavailable", state.error_code, { repository: root, diagnostic: state.diagnostic });
  const details = {
    repository: root,
    package_manager: state.package_manager,
    lockfile: state.lockfile,
    node_modules_state: state.node_modules_state,
    required_action: action(root),
  };
  if (state.node_modules_state === "local-directory") {
    return result("inspect", "ready", null, { ...details, required_action: null, diagnostic: "Worktree dependencies are self-contained." });
  }
  if (!["absent", "symlink"].includes(state.node_modules_state)) {
    return result("inspect", "unavailable", "NODE_MODULES_INVALID", { ...details, diagnostic: "Replace the non-directory node_modules entry through the recorded provisioning action." });
  }
  return result("inspect", "provision-required", null, { ...details, diagnostic: "Run the recorded frozen-lockfile action before the first specialist dispatch." });
}

export async function provisionWorktreeDependencies({ repository, executor = runDependencyCommand } = {}) {
  const inspected = await inspectWorktreeDependencies({ repository });
  if (inspected.outcome === "ready") return { ...inspected, operation: "provision" };
  if (inspected.outcome !== "provision-required") return { ...inspected, operation: "provision" };

  const installArgv = LOCKFILES.get(inspected.lockfile);
  if (!installArgv || installArgv[0] !== inspected.package_manager) {
    return result("provision", "unavailable", "LOCKFILE_UNAVAILABLE", {
      ...inspected,
      diagnostic: "The inspected lockfile no longer maps to a supported frozen installation.",
    });
  }

  const version = await executor([inspected.package_manager, "--version"], inspected.repository);
  if (!version?.ok) {
    return result("provision", "unavailable", "PACKAGE_MANAGER_UNAVAILABLE", {
      ...inspected,
      required_action: inspected.required_action,
      diagnostic: `Make ${inspected.package_manager} available, then run the recorded frozen-lockfile action.`,
    });
  }

  if (inspected.node_modules_state === "symlink") {
    let tracked;
    try { tracked = await gitText(inspected.repository, ["ls-files", "--stage", "--", "node_modules"]); }
    catch { return result("provision", "unavailable", "GIT_INSPECTION_FAILED", { ...inspected }); }
    if (tracked !== "") {
      return result("provision", "unavailable", "TRACKED_NODE_MODULES", {
        ...inspected,
        diagnostic: "The top-level node_modules symlink is tracked; resolve it as a repository change before provisioning.",
      });
    }
    try { await unlink(path.join(inspected.repository, "node_modules")); }
    catch (error) {
      return result("provision", "failed", ["EACCES", "EPERM", "EROFS"].includes(error?.code) ? "WORKTREE_NOT_WRITABLE" : "SYMLINK_REMOVAL_FAILED", {
        ...inspected,
        diagnostic: "Remove only the untracked top-level node_modules symlink, then run the recorded frozen-lockfile action.",
      });
    }
  }

  const execution = await executor(installArgv, inspected.repository);
  if (!execution?.ok) {
    return result("provision", "failed", "PROVISION_FAILED", {
      ...inspected,
      command: execution ?? null,
      diagnostic: "The recorded frozen-lockfile action failed; repair the reported environment prerequisite and retry that exact action.",
    });
  }
  let verified = false;
  try {
    const stat = await lstat(path.join(inspected.repository, "node_modules"));
    verified = stat.isDirectory() && !stat.isSymbolicLink();
  } catch {}
  if (!verified) {
    return result("provision", "failed", "PROVISION_VERIFICATION_FAILED", {
      ...inspected,
      command: execution,
      diagnostic: "Provisioning completed without a real worktree-local node_modules directory.",
    });
  }
  return result("provision", "provisioned", null, {
    ...inspected,
    node_modules_state: "local-directory",
    required_action: null,
    command: execution,
    diagnostic: "Frozen-lockfile dependencies are self-contained in the worktree.",
  });
}

function parseArgs(argv) {
  if (argv.length !== 3 || !["inspect", "provision"].includes(argv[0]) || argv[1] !== "--repository") {
    throw new Error("usage: worktree-dependencies.mjs inspect|provision --repository ABSOLUTE_WORKTREE");
  }
  return { operation: argv[0], repository: argv[2] };
}

async function main() {
  let output;
  try {
    const options = parseArgs(process.argv.slice(2));
    output = options.operation === "inspect"
      ? await inspectWorktreeDependencies(options)
      : await provisionWorktreeDependencies(options);
  } catch (error) {
    output = result("unknown", "unavailable", "ARGUMENT_INVALID", { diagnostic: String(error?.message ?? error) });
  }
  process.stdout.write(`${JSON.stringify(output)}\n`);
  if (!new Set(["ready", "provisioned"]).has(output.outcome)) process.exitCode = 2;
}

if (isDirectExecution(import.meta.url)) await main();
