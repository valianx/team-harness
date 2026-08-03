#!/usr/bin/env node
/**
 * Pre-measurement provenance attestation for the Codex pipeline-efficiency A/B
 * protocol. This intentionally does not invoke `codex exec`, make a quality
 * verdict, or remove anything it created. A PASS only permits a separately
 * operated live measurement with its own gates and quality receipts.
 */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { constants as fsConstants, createReadStream } from "node:fs";
import {
  access,
  copyFile,
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RECEIPT_SCHEMA_VERSION = 1;
export const RECEIPT_KIND = "codex_pipeline_efficiency_provenance_receipt";
export const EXPECTED_PIPELINE_ROSTER = Object.freeze([
  "architect.toml",
  "implementer.toml",
  "tester.toml",
  "qa.toml",
  "security.toml",
  "delivery.toml",
]);
export const MAX_TREE_FILES = 512;
export const MAX_TREE_BYTES = 512 * 1024 * 1024;
export const MAX_TREE_DEPTH = 64;
export const MAX_PROMPT_BYTES = 16 * 1024 * 1024;
export const MAX_COMMAND_STREAM_BYTES = 64 * 1024;
export const COMMAND_TIMEOUT_MS = 30_000;

const COMMAND_TERMINATION_GRACE_MS = 1_000;
const HOME_TREE_LIMITS = Object.freeze({
  maxFiles: 1024,
  maxBytes: MAX_TREE_BYTES,
  maxDepth: MAX_TREE_DEPTH,
});
const TREE_LIMITS = Object.freeze({
  maxFiles: MAX_TREE_FILES,
  maxBytes: MAX_TREE_BYTES,
  maxDepth: MAX_TREE_DEPTH,
});
const RECEIPT_KEYS = Object.freeze([
  "codex_version",
  "distinct",
  "explicit_pipeline",
  "installed_tree_hashes",
  "kind",
  "plugin_versions",
  "prompt_digest",
  "reason_code",
  "schema_version",
  "source_tree_hashes",
  "status",
]);
const FAILURE_CODES = new Set([
  "ARGUMENT_INVALID",
  "CODEX_COMMAND_FAILED",
  "CODEX_INVALID",
  "CODEX_TIMEOUT",
  "HOME_UNEXPECTED_CONTENT",
  "INSTALLED_PATH_INVALID",
  "INSTALLED_TREE_MISMATCH",
  "INTERNAL_FAILURE",
  "PATH_ESCAPE",
  "PATH_INVALID",
  "PLUGIN_ADD_MALFORMED",
  "PLUGIN_LIST_MALFORMED",
  "PLUGIN_PROVENANCE_MISMATCH",
  "PROMPT_INVALID",
  "PROMPT_NOT_PIPELINE",
  "RESOURCE_LIMIT",
  "ROSTER_INVALID",
  "RUN_ROOT_NOT_EMPTY",
  "RUN_ROOT_UNSAFE",
  "SOURCE_LAYOUT_INVALID",
  "SOURCE_ROOT_SAME",
  "SOURCE_TREE_NOT_DISTINCT",
  "TREE_INVALID",
  "TREE_MUTATED",
]);

class ReceiptFailure extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function fail(code) {
  throw new ReceiptFailure(code);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function containsExplicitPipelineInvocation(text) {
  return typeof text === "string"
    && /(?:^|[\s"'`([{])@Team-Harness[\t ]+pipeline(?=$|[\s:.,;!?)}\]])/m.test(text);
}

export function isStrictDescendant(root, candidate) {
  if (typeof root !== "string" || typeof candidate !== "string") return false;
  const relative = path.relative(root, candidate);
  return relative !== ""
    && relative !== ".."
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
}

export function isSafeRunRootPath(value) {
  if (typeof value !== "string" || value.includes("\0") || !path.isAbsolute(value)) return false;
  if (path.resolve(value) !== value) return false;
  return /^\/tmp\/team-harness-codex-efficiency-ab\.[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value);
}

export function isSafeVersion(value) {
  return typeof value === "string"
    && /^(?:v)?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value);
}

function normalizedVersion(value) {
  return isSafeVersion(value) ? value.replace(/^v/, "") : null;
}

function isDigest(value) {
  return value === null || (typeof value === "string" && /^[a-f0-9]{64}$/.test(value));
}

function isVersionOrNull(value) {
  return value === null || isSafeVersion(value);
}

function isSideMap(value, predicate) {
  return isPlainObject(value)
    && Object.keys(value).sort().join(",") === "baseline,candidate"
    && predicate(value.baseline)
    && predicate(value.candidate);
}

/** A pure, closed-shape guard for the only artifact this runner emits. */
export function isProvenanceReceipt(value) {
  if (!isPlainObject(value) || Object.keys(value).sort().join(",") !== RECEIPT_KEYS.join(",")) return false;
  if (value.schema_version !== RECEIPT_SCHEMA_VERSION || value.kind !== RECEIPT_KIND) return false;
  if (value.status !== "PASS" && value.status !== "FAIL") return false;
  if (value.status === "PASS" && value.reason_code !== "MEASUREMENT_PERMITTED") return false;
  if (value.status === "FAIL" && !FAILURE_CODES.has(value.reason_code)) return false;
  return isVersionOrNull(value.codex_version)
    && isSideMap(value.plugin_versions, isVersionOrNull)
    && isSideMap(value.source_tree_hashes, isDigest)
    && isSideMap(value.installed_tree_hashes, isDigest)
    && isDigest(value.prompt_digest)
    && typeof value.distinct === "boolean"
    && typeof value.explicit_pipeline === "boolean";
}

function blankReceipt() {
  return {
    schema_version: RECEIPT_SCHEMA_VERSION,
    kind: RECEIPT_KIND,
    status: "FAIL",
    reason_code: "INTERNAL_FAILURE",
    codex_version: null,
    plugin_versions: { baseline: null, candidate: null },
    source_tree_hashes: { baseline: null, candidate: null },
    installed_tree_hashes: { baseline: null, candidate: null },
    distinct: false,
    prompt_digest: null,
    explicit_pipeline: false,
  };
}

/** Parse the intentionally small, explicit CLI surface without echoing inputs. */
export function parseRunnerArguments(argv) {
  const known = new Set([
    "--baseline-source-root",
    "--candidate-source-root",
    "--run-root",
    "--prompt-file",
    "--codex",
  ]);
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!known.has(flag) || Object.hasOwn(result, flag)) fail("ARGUMENT_INVALID");
    const value = argv[index + 1];
    if (typeof value !== "string" || value === "" || value.startsWith("--")) fail("ARGUMENT_INVALID");
    result[flag] = value;
    index += 1;
  }
  for (const flag of known) {
    if (!Object.hasOwn(result, flag)) fail("ARGUMENT_INVALID");
  }
  return {
    baselineSourceRoot: result["--baseline-source-root"],
    candidateSourceRoot: result["--candidate-source-root"],
    runRoot: result["--run-root"],
    promptFile: result["--prompt-file"],
    codexExecutable: result["--codex"],
  };
}

function isCanonicalAbsolutePath(value) {
  return typeof value === "string"
    && value !== ""
    && !value.includes("\0")
    && path.isAbsolute(value)
    && path.resolve(value) === value;
}

async function existingPath(value, expectedKind, invalidCode = "PATH_INVALID") {
  if (!isCanonicalAbsolutePath(value)) fail(invalidCode);
  let resolved;
  let information;
  try {
    resolved = await realpath(value);
    information = await lstat(value);
  } catch {
    fail(invalidCode);
  }
  if (resolved !== value || information.isSymbolicLink()) fail("PATH_ESCAPE");
  if (expectedKind === "directory" && !information.isDirectory()) fail(invalidCode);
  if (expectedKind === "file" && !information.isFile()) fail(invalidCode);
  return { path: value, stat: information };
}

async function existingDirectory(value, invalidCode) {
  return existingPath(value, "directory", invalidCode);
}

async function existingFile(value, invalidCode) {
  return existingPath(value, "file", invalidCode);
}

async function listDirectory(target, code) {
  try {
    return await readdir(target);
  } catch {
    fail(code);
  }
}

function sameFileStats(before, after) {
  return before.dev === after.dev
    && before.ino === after.ino
    && before.size === after.size
    && before.mtimeMs === after.mtimeMs
    && before.ctimeMs === after.ctimeMs;
}

async function verifiedFileBytes(filePath, invalidCode, maxBytes = MAX_TREE_BYTES) {
  const before = await existingFile(filePath, invalidCode);
  if (before.stat.size > maxBytes) fail("RESOURCE_LIMIT");
  let bytes;
  let after;
  let resolved;
  try {
    bytes = await readFile(filePath);
    after = await lstat(filePath);
    resolved = await realpath(filePath);
  } catch {
    fail(invalidCode);
  }
  if (resolved !== filePath || after.isSymbolicLink()) fail("PATH_ESCAPE");
  if (!sameFileStats(before.stat, after)) fail("TREE_MUTATED");
  return { bytes, stat: before.stat };
}

function decodeUtf8(bytes, code) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail(code);
  }
}

async function readJsonFile(filePath, code) {
  const { bytes } = await verifiedFileBytes(filePath, code);
  try {
    return JSON.parse(decodeUtf8(bytes, code));
  } catch {
    fail(code);
  }
}

async function updateHashFromFile(hash, filePath) {
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", () => reject(new ReceiptFailure("TREE_INVALID")));
    stream.on("end", resolve);
  });
}

/**
 * Deterministically hashes a regular-file-only tree. It rejects symlinks,
 * special files, tree escapes, mutation while reading, and bounded-resource
 * violations before returning a digest.
 */
export async function hashDirectoryTree(root, limits = TREE_LIMITS) {
  const directory = await existingDirectory(root, "TREE_INVALID");
  const hash = createHash("sha256");
  let files = 0;
  let bytes = 0;
  hash.update("team-harness-tree-v1\0");

  async function visit(current, relative, depth) {
    if (depth > limits.maxDepth) fail("RESOURCE_LIMIT");
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      fail("TREE_INVALID");
    }
    entries.sort((left, right) => Buffer.compare(Buffer.from(left.name), Buffer.from(right.name)));
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      const childRelative = relative === "" ? entry.name : `${relative}/${entry.name}`;
      let information;
      let resolved;
      try {
        information = await lstat(absolute);
        resolved = await realpath(absolute);
      } catch {
        fail("TREE_INVALID");
      }
      if (resolved !== absolute || information.isSymbolicLink()) fail("PATH_ESCAPE");
      if (information.isDirectory()) {
        hash.update(`D\0${childRelative}\0`);
        await visit(absolute, childRelative, depth + 1);
        continue;
      }
      if (!information.isFile()) fail("TREE_INVALID");
      files += 1;
      bytes += information.size;
      if (files > limits.maxFiles || bytes > limits.maxBytes) fail("RESOURCE_LIMIT");
      hash.update(`F\0${childRelative}\0${information.size}\0`);
      await updateHashFromFile(hash, absolute);
      let after;
      let afterResolved;
      try {
        after = await lstat(absolute);
        afterResolved = await realpath(absolute);
      } catch {
        fail("TREE_MUTATED");
      }
      if (afterResolved !== absolute || after.isSymbolicLink()) fail("PATH_ESCAPE");
      if (!sameFileStats(information, after)) fail("TREE_MUTATED");
    }
  }

  await visit(directory.path, "", 0);
  return { hash: hash.digest("hex"), files, bytes };
}

/**
 * Checks a directory's containment and resource shape without opening regular
 * files. This lets the runner reject stray home content without inspecting a
 * freshly created Codex home's possible credential payloads.
 */
async function validateDirectoryShape(root, limits = HOME_TREE_LIMITS) {
  const directory = await existingDirectory(root, "HOME_UNEXPECTED_CONTENT");
  let files = 0;
  let bytes = 0;
  async function visit(current, depth) {
    if (depth > limits.maxDepth) fail("RESOURCE_LIMIT");
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      fail("HOME_UNEXPECTED_CONTENT");
    }
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      let information;
      let resolved;
      try {
        information = await lstat(absolute);
        resolved = await realpath(absolute);
      } catch {
        fail("HOME_UNEXPECTED_CONTENT");
      }
      if (resolved !== absolute || information.isSymbolicLink()) fail("PATH_ESCAPE");
      if (information.isDirectory()) {
        await visit(absolute, depth + 1);
      } else if (information.isFile()) {
        files += 1;
        bytes += information.size;
        if (files > limits.maxFiles || bytes > limits.maxBytes) fail("RESOURCE_LIMIT");
      } else {
        fail("HOME_UNEXPECTED_CONTENT");
      }
    }
  }
  await visit(directory.path, 0);
}

function isLocalTeamHarnessMarketplace(catalog) {
  if (!isPlainObject(catalog) || !Array.isArray(catalog.plugins)) return false;
  const entries = catalog.plugins.filter((entry) => isPlainObject(entry) && entry.name === "team-harness");
  if (entries.length !== 1) return false;
  const source = entries[0].source;
  return isPlainObject(source)
    && source.source === "local"
    && source.path === "./plugins/team-harness";
}

async function inspectRoster(rosterRoot) {
  const root = await existingDirectory(rosterRoot, "ROSTER_INVALID");
  const files = [];
  for (const name of EXPECTED_PIPELINE_ROSTER) {
    const filePath = path.join(root.path, name);
    const { bytes, stat } = await verifiedFileBytes(filePath, "ROSTER_INVALID", MAX_PROMPT_BYTES);
    files.push({ name, path: filePath, hash: sha256Hex(bytes), stat });
  }
  return { root: root.path, files };
}

async function inspectSourceRoot(sourceRoot) {
  const root = await existingDirectory(sourceRoot, "SOURCE_LAYOUT_INVALID");
  const pluginRoot = path.join(root.path, "plugins", "team-harness");
  const plugin = await existingDirectory(pluginRoot, "SOURCE_LAYOUT_INVALID");
  const manifest = await readJsonFile(
    path.join(plugin.path, ".codex-plugin", "plugin.json"),
    "SOURCE_LAYOUT_INVALID",
  );
  if (!isPlainObject(manifest) || manifest.name !== "team-harness" || !isSafeVersion(manifest.version)) {
    fail("SOURCE_LAYOUT_INVALID");
  }
  const catalog = await readJsonFile(
    path.join(root.path, ".agents", "plugins", "marketplace.json"),
    "SOURCE_LAYOUT_INVALID",
  );
  if (!isLocalTeamHarnessMarketplace(catalog)) fail("SOURCE_LAYOUT_INVALID");
  const tree = await hashDirectoryTree(plugin.path);
  const roster = await inspectRoster(path.join(root.path, ".codex", "agents"));
  return {
    root: root.path,
    pluginRoot: plugin.path,
    version: normalizedVersion(manifest.version),
    treeHash: tree.hash,
    roster,
  };
}

async function inspectPrompt(promptFile) {
  const { bytes } = await verifiedFileBytes(promptFile, "PROMPT_INVALID", MAX_PROMPT_BYTES);
  const text = decodeUtf8(bytes, "PROMPT_INVALID");
  return {
    digest: sha256Hex(bytes),
    explicitPipeline: containsExplicitPipelineInvocation(text),
  };
}

async function validateRunRoot(runRoot) {
  if (!isSafeRunRootPath(runRoot)) fail("RUN_ROOT_UNSAFE");
  let root;
  try {
    root = await existingDirectory(runRoot, "RUN_ROOT_UNSAFE");
  } catch (error) {
    if (error instanceof ReceiptFailure) throw error;
    fail("RUN_ROOT_UNSAFE");
  }
  let entries;
  try {
    entries = await readdir(root.path);
  } catch {
    fail("RUN_ROOT_UNSAFE");
  }
  if (entries.length !== 0) fail("RUN_ROOT_NOT_EMPTY");
  return root.path;
}

async function validateCodexExecutable(executable) {
  const file = await existingFile(executable, "CODEX_INVALID");
  try {
    await access(file.path, fsConstants.X_OK);
  } catch {
    fail("CODEX_INVALID");
  }
  return file.path;
}

async function createIsolatedHomes(runRoot) {
  const baseline = path.join(runRoot, "codex-home-baseline");
  const candidate = path.join(runRoot, "codex-home-candidate");
  for (const home of [baseline, candidate]) {
    try {
      await mkdir(home, { mode: 0o700 });
      await mkdir(path.join(home, "tmp"), { mode: 0o700 });
    } catch {
      fail("HOME_UNEXPECTED_CONTENT");
    }
    await existingDirectory(home, "HOME_UNEXPECTED_CONTENT");
  }
  return { baseline, candidate };
}

function isolatedEnvironment(home) {
  const temporary = path.join(home, "tmp");
  return {
    PATH: process.env.PATH || "/usr/bin:/bin",
    HOME: home,
    CODEX_HOME: home,
    TMPDIR: temporary,
    TMP: temporary,
    TEMP: temporary,
    LANG: "C",
    LC_ALL: "C",
  };
}

async function captureCommand(executable, args, home) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(executable, args, {
        cwd: home,
        env: isolatedEnvironment(home),
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch {
      reject(new ReceiptFailure("CODEX_COMMAND_FAILED"));
      return;
    }

    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let exceeded = false;
    let timedOut = false;
    let spawnFailed = false;
    let settled = false;
    let settlementGrace;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearTimeout(settlementGrace);
      resolve(result);
    };
    const stop = () => {
      if (!child.killed) child.kill("SIGKILL");
      if (settlementGrace === undefined) {
        settlementGrace = setTimeout(() => {
          finish({
            exitCode: null,
            timedOut,
            exceeded,
            spawnFailed,
            stdout: Buffer.concat(stdout),
            stderr: Buffer.concat(stderr),
          });
        }, COMMAND_TERMINATION_GRACE_MS);
      }
    };
    const append = (target, chunk, stream) => {
      const size = Buffer.byteLength(chunk);
      if (stream === "stdout") stdoutBytes += size;
      else stderrBytes += size;
      if (stdoutBytes > MAX_COMMAND_STREAM_BYTES || stderrBytes > MAX_COMMAND_STREAM_BYTES) {
        exceeded = true;
        stop();
        return;
      }
      target.push(Buffer.from(chunk));
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      stop();
    }, COMMAND_TIMEOUT_MS);
    child.stdout.on("data", (chunk) => append(stdout, chunk, "stdout"));
    child.stderr.on("data", (chunk) => append(stderr, chunk, "stderr"));
    child.on("error", () => {
      spawnFailed = true;
    });
    child.on("close", (exitCode) => {
      finish({
        exitCode,
        timedOut,
        exceeded,
        spawnFailed,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr),
      });
    });
  });
}

async function runCodex(executable, args, home) {
  const result = await captureCommand(executable, args, home);
  if (result.exceeded) fail("RESOURCE_LIMIT");
  if (result.timedOut) fail("CODEX_TIMEOUT");
  if (result.spawnFailed || result.exitCode !== 0) fail("CODEX_COMMAND_FAILED");
  return result.stdout;
}

/** Decodes the plugin-add receipt, the sole authority for an installed path. */
export function decodePluginAdd(bytes) {
  let document;
  try {
    document = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return { state: "malformed" };
  }
  if (!isPlainObject(document)) return { state: "malformed" };
  if (document.pluginId !== "team-harness@team-harness"
    || document.name !== "team-harness"
    || document.marketplaceName !== "team-harness"
    || !isSafeVersion(document.version)
    || typeof document.installedPath !== "string"
    || !Object.hasOwn(document, "authPolicy")) {
    return { state: "provenance_invalid" };
  }
  return {
    state: "ok",
    entry: {
      pluginId: document.pluginId,
      name: document.name,
      marketplaceName: document.marketplaceName,
      version: normalizedVersion(document.version),
      installedPath: document.installedPath,
    },
  };
}

/** Extracts local-source provenance from the real `plugin list --json` shape. */
export function decodePluginList(bytes) {
  let document;
  try {
    document = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return { state: "malformed" };
  }
  if (!isPlainObject(document) || !Array.isArray(document.installed) || !Array.isArray(document.available)) {
    return { state: "malformed" };
  }
  if (document.available.length !== 0) return { state: "provenance_invalid" };
  const entries = document.installed.filter((entry) => isPlainObject(entry)
    && (entry.pluginId === "team-harness@team-harness"
      || entry.name === "team-harness"
      || entry.marketplaceName === "team-harness"));
  if (entries.length !== 1) return { state: "provenance_invalid" };
  const entry = entries[0];
  if (entry.pluginId !== "team-harness@team-harness"
    || entry.name !== "team-harness"
    || entry.marketplaceName !== "team-harness"
    || entry.installed !== true
    || entry.enabled !== true
    || !isSafeVersion(entry.version)
    || !isPlainObject(entry.source)
    || entry.source.source !== "local"
    || typeof entry.source.path !== "string"
    || !isPlainObject(entry.marketplaceSource)
    || entry.marketplaceSource.sourceType !== "local"
    || typeof entry.marketplaceSource.source !== "string") {
    return { state: "provenance_invalid" };
  }
  return {
    state: "ok",
    entry: {
      pluginId: entry.pluginId,
      name: entry.name,
      marketplaceName: entry.marketplaceName,
      version: normalizedVersion(entry.version),
      sourcePath: entry.source.path,
      marketplaceSource: entry.marketplaceSource.source,
    },
  };
}

export function parseCodexVersion(bytes) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
  const matches = [...text.matchAll(/(?:^|[^0-9A-Za-z])(v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)(?=$|[^0-9A-Za-z])/g)];
  return matches.length === 1 ? normalizedVersion(matches[0][1]) : null;
}

async function verifiedDirectoryFromPluginList(value, code) {
  try {
    return await existingDirectory(value, code);
  } catch (error) {
    if (error instanceof ReceiptFailure) throw error;
    fail(code);
  }
}

async function validateInstalledPlugin(addReceipt, listEntry, source, home) {
  if (addReceipt.pluginId !== listEntry.pluginId
    || addReceipt.name !== listEntry.name
    || addReceipt.marketplaceName !== listEntry.marketplaceName
    || addReceipt.version !== listEntry.version
    || addReceipt.version !== source.version) fail("PLUGIN_PROVENANCE_MISMATCH");
  const listedSource = await verifiedDirectoryFromPluginList(listEntry.sourcePath, "PLUGIN_PROVENANCE_MISMATCH");
  const listedMarketplace = await verifiedDirectoryFromPluginList(
    listEntry.marketplaceSource,
    "PLUGIN_PROVENANCE_MISMATCH",
  );
  if (listedSource.path !== source.pluginRoot || listedMarketplace.path !== source.root) {
    fail("PLUGIN_PROVENANCE_MISMATCH");
  }
  const installed = await verifiedDirectoryFromPluginList(addReceipt.installedPath, "INSTALLED_PATH_INVALID");
  const cacheRoot = path.join(home, "plugins", "cache", "team-harness", "team-harness");
  if (!isStrictDescendant(home, installed.path) || !isStrictDescendant(cacheRoot, installed.path)) {
    fail("INSTALLED_PATH_INVALID");
  }
  const manifest = await readJsonFile(
    path.join(installed.path, ".codex-plugin", "plugin.json"),
    "PLUGIN_PROVENANCE_MISMATCH",
  );
  if (!isPlainObject(manifest)
    || manifest.name !== "team-harness"
    || normalizedVersion(manifest.version) !== source.version) {
    fail("PLUGIN_PROVENANCE_MISMATCH");
  }
  const installedTree = await hashDirectoryTree(installed.path);
  if (installedTree.hash !== source.treeHash) fail("INSTALLED_TREE_MISMATCH");
  return installedTree.hash;
}

async function copyAndVerifyRoster(source, home) {
  const agents = path.join(home, "agents");
  try {
    await mkdir(agents, { mode: 0o700 });
  } catch {
    fail("ROSTER_INVALID");
  }
  for (const sourceFile of source.roster.files) {
    const before = await verifiedFileBytes(sourceFile.path, "ROSTER_INVALID", MAX_PROMPT_BYTES);
    if (!sameFileStats(sourceFile.stat, before.stat) || sha256Hex(before.bytes) !== sourceFile.hash) {
      fail("TREE_MUTATED");
    }
    const destination = path.join(agents, sourceFile.name);
    try {
      await copyFile(sourceFile.path, destination, fsConstants.COPYFILE_EXCL);
    } catch {
      fail("ROSTER_INVALID");
    }
    const after = await verifiedFileBytes(sourceFile.path, "ROSTER_INVALID", MAX_PROMPT_BYTES);
    const copied = await verifiedFileBytes(destination, "ROSTER_INVALID", MAX_PROMPT_BYTES);
    if (!sameFileStats(sourceFile.stat, after.stat) || sha256Hex(after.bytes) !== sourceFile.hash) {
      fail("TREE_MUTATED");
    }
    if (sha256Hex(copied.bytes) !== sourceFile.hash) fail("ROSTER_INVALID");
  }
  let names;
  try {
    names = await readdir(agents);
  } catch {
    fail("ROSTER_INVALID");
  }
  if (names.sort().join(",") !== [...EXPECTED_PIPELINE_ROSTER].sort().join(",")) fail("ROSTER_INVALID");
}

async function assertHomeLayout(home) {
  let names;
  try {
    names = await readdir(home);
  } catch {
    fail("HOME_UNEXPECTED_CONTENT");
  }
  if (names.sort().join(",") !== ".tmp,agents,config.toml,plugins,tmp") fail("HOME_UNEXPECTED_CONTENT");
  const config = await existingFile(path.join(home, "config.toml"), "HOME_UNEXPECTED_CONTENT");
  if (config.stat.size > MAX_PROMPT_BYTES) fail("RESOURCE_LIMIT");
  const plugins = path.join(home, "plugins");
  const temporary = path.join(home, "tmp");
  const codexTemporary = path.join(home, ".tmp");
  await existingDirectory(plugins, "HOME_UNEXPECTED_CONTENT");
  await existingDirectory(temporary, "HOME_UNEXPECTED_CONTENT");
  await existingDirectory(codexTemporary, "HOME_UNEXPECTED_CONTENT");
  const pluginEntries = await listDirectory(plugins, "HOME_UNEXPECTED_CONTENT");
  if (pluginEntries.some((name) => name !== "cache" && name !== "marketplaces")) fail("HOME_UNEXPECTED_CONTENT");
  await validateDirectoryShape(plugins, HOME_TREE_LIMITS);
  const temporaryEntries = await listDirectory(temporary, "HOME_UNEXPECTED_CONTENT");
  if (temporaryEntries.length !== 1 || temporaryEntries[0] !== "arg0") {
    fail("HOME_UNEXPECTED_CONTENT");
  }
  const temporaryArg0 = path.join(temporary, "arg0");
  await existingDirectory(temporaryArg0, "HOME_UNEXPECTED_CONTENT");
  const temporaryArg0Entries = await listDirectory(temporaryArg0, "HOME_UNEXPECTED_CONTENT");
  if (temporaryArg0Entries.length !== 0) fail("HOME_UNEXPECTED_CONTENT");
  const codexTemporaryEntries = await listDirectory(codexTemporary, "HOME_UNEXPECTED_CONTENT");
  if (codexTemporaryEntries.length !== 1 || codexTemporaryEntries[0] !== "marketplaces") {
    fail("HOME_UNEXPECTED_CONTENT");
  }
  const marketplaces = path.join(codexTemporary, "marketplaces");
  await existingDirectory(marketplaces, "HOME_UNEXPECTED_CONTENT");
  const marketplaceEntries = await listDirectory(marketplaces, "HOME_UNEXPECTED_CONTENT");
  if (marketplaceEntries.length !== 0) fail("HOME_UNEXPECTED_CONTENT");
}

async function assertRunRootLayout(runRoot) {
  let names;
  try {
    names = await readdir(runRoot);
  } catch {
    fail("HOME_UNEXPECTED_CONTENT");
  }
  if (names.sort().join(",") !== "codex-home-baseline,codex-home-candidate") {
    fail("HOME_UNEXPECTED_CONTENT");
  }
}

async function installAndAttest({ executable, source, home }) {
  await runCodex(executable, ["plugin", "marketplace", "add", source.root, "--json"], home);
  const addReceipt = decodePluginAdd(await runCodex(
    executable,
    ["plugin", "add", "team-harness@team-harness", "--json"],
    home,
  ));
  if (addReceipt.state === "malformed") fail("PLUGIN_ADD_MALFORMED");
  if (addReceipt.state !== "ok") fail("PLUGIN_PROVENANCE_MISMATCH");
  const listing = decodePluginList(await runCodex(executable, ["plugin", "list", "--json"], home));
  if (listing.state === "malformed") fail("PLUGIN_LIST_MALFORMED");
  if (listing.state !== "ok") fail("PLUGIN_PROVENANCE_MISMATCH");
  const hash = await validateInstalledPlugin(addReceipt.entry, listing.entry, source, home);
  await copyAndVerifyRoster(source, home);
  await assertHomeLayout(home);
  return hash;
}

async function populateReceipt(options, receipt) {
  const baseline = await inspectSourceRoot(options.baselineSourceRoot);
  receipt.plugin_versions.baseline = baseline.version;
  receipt.source_tree_hashes.baseline = baseline.treeHash;
  const candidate = await inspectSourceRoot(options.candidateSourceRoot);
  receipt.plugin_versions.candidate = candidate.version;
  receipt.source_tree_hashes.candidate = candidate.treeHash;
  if (baseline.root === candidate.root) fail("SOURCE_ROOT_SAME");
  if (baseline.treeHash === candidate.treeHash) fail("SOURCE_TREE_NOT_DISTINCT");
  receipt.distinct = true;

  const prompt = await inspectPrompt(options.promptFile);
  receipt.prompt_digest = prompt.digest;
  receipt.explicit_pipeline = prompt.explicitPipeline;
  if (!prompt.explicitPipeline) fail("PROMPT_NOT_PIPELINE");

  const runRoot = await validateRunRoot(options.runRoot);
  const executable = await validateCodexExecutable(options.codexExecutable);
  const homes = await createIsolatedHomes(runRoot);
  const version = parseCodexVersion(await runCodex(executable, ["--version"], homes.baseline));
  if (version === null) fail("CODEX_COMMAND_FAILED");
  receipt.codex_version = version;
  receipt.installed_tree_hashes.baseline = await installAndAttest({
    executable,
    source: baseline,
    home: homes.baseline,
  });
  receipt.installed_tree_hashes.candidate = await installAndAttest({
    executable,
    source: candidate,
    home: homes.candidate,
  });
  await assertRunRootLayout(runRoot);
  receipt.status = "PASS";
  receipt.reason_code = "MEASUREMENT_PERMITTED";
}

/**
 * Returns an allowlisted receipt for every outcome; callers never receive a
 * path, command, prompt, environment value, raw CLI stream, or error text.
 */
export async function runProvenancePreflight(options) {
  const receipt = blankReceipt();
  try {
    await populateReceipt(options, receipt);
  } catch (error) {
    receipt.status = "FAIL";
    receipt.reason_code = error instanceof ReceiptFailure && FAILURE_CODES.has(error.code)
      ? error.code
      : "INTERNAL_FAILURE";
  }
  return isProvenanceReceipt(receipt) ? receipt : blankReceipt();
}

async function main() {
  let receipt;
  try {
    receipt = await runProvenancePreflight(parseRunnerArguments(process.argv.slice(2)));
  } catch {
    receipt = blankReceipt();
    receipt.reason_code = "ARGUMENT_INVALID";
  }
  if (!isProvenanceReceipt(receipt)) receipt = blankReceipt();
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
  process.exitCode = receipt.status === "PASS" ? 0 : 1;
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) await main();
