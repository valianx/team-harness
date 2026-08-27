#!/usr/bin/env node
/** Materialize and verify an immutable workspace-local pipeline-helper bundle. */

import { createHash, randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const HELPER_BUNDLE_SCHEMA_VERSION = 1;
export const HELPER_COMPATIBILITY_EPOCH = "team-harness-pipeline-helper-api-v2";
export const PIPELINE_HELPERS = Object.freeze([
  "bounded-command.mjs",
  "commit-integrity.mjs",
  "correction-packet-preflight.mjs",
  "helper-bundle.mjs",
  "herdr-message.mjs",
  "openspec-adapter.mjs",
  "openspec-bindings.mjs",
  "openspec-events.mjs",
  "openspec-overlay.mjs",
  "openspec-recovery.mjs",
  "openspec-snapshot.mjs",
  "plan-contract-repair.mjs",
  "plan-contract.mjs",
  "quality-lib.mjs",
  "quality-runner.mjs",
  "review-surface.mjs",
  "specialist-liveness.mjs",
  "specialist-write-scope.mjs",
  "test-transition.mjs",
  "workspace-identity.mjs",
  "workspace-preflight.mjs",
  "worktree-dependencies.mjs",
]);

const MAX_FILE_BYTES = 1024 * 1024;
const MAX_INPUT_BYTES = 64 * 1024;
const SHA256 = /^[a-f0-9]{64}$/;
const MANIFEST_KEYS = new Set([
  "schema_version", "kind", "compatibility_epoch", "bundle_identity_sha256", "helpers",
]);
const HELPER_KEYS = new Set(["name", "sha256", "size"]);
const MATERIALIZE_KEYS = new Set(["workspace", "source_root"]);
const VERIFY_KEYS = new Set(["workspace", "manifest_path", "manifest_sha256"]);

const hash = value => createHash("sha256").update(value).digest("hex");
const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.size && Object.keys(value).every(key => keys.has(key));
const contained = (root, target) => {
  const relative = path.relative(root, target);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
};

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

function canonicalBytes(value) {
  return Buffer.from(`${JSON.stringify(canonical(value), null, 2)}\n`, "utf8");
}

function output(verdict, errorCode, action, details = {}) {
  return {
    schema_version: HELPER_BUNDLE_SCHEMA_VERSION,
    kind: "team_harness_pipeline_helper_bundle_action",
    verdict,
    error_code: errorCode,
    action,
    compatibility_epoch: details.compatibility_epoch ?? null,
    bundle_root: details.bundle_root ?? null,
    bundle_identity_sha256: details.bundle_identity_sha256 ?? null,
    manifest_path: details.manifest_path ?? null,
    manifest_sha256: details.manifest_sha256 ?? null,
    helper_paths: details.helper_paths ?? {},
  };
}

async function canonicalDirectory(value, errorCode) {
  if (typeof value !== "string" || !path.isAbsolute(value) || path.resolve(value) !== value) throw new Error(errorCode);
  const resolved = await realpath(value);
  const stat = await lstat(resolved);
  if (resolved !== value || !stat.isDirectory() || stat.isSymbolicLink()) throw new Error(errorCode);
  return resolved;
}

async function regularFile(root, target, errorCode) {
  if (!path.isAbsolute(target) || !contained(root, target)) throw new Error(errorCode);
  const stat = await lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_FILE_BYTES) throw new Error(errorCode);
  const resolved = await realpath(target);
  if (resolved !== target || !contained(root, resolved)) throw new Error(errorCode);
  const value = await readFile(resolved);
  if (value.length > MAX_FILE_BYTES) throw new Error(errorCode);
  return value;
}

async function ensureDirectory(root, target) {
  if (!path.isAbsolute(target) || !contained(root, target)) throw new Error("BUNDLE_WRITE_FAILED");
  const relative = path.relative(root, target);
  let current = root;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try { await mkdir(current, { mode: 0o700 }); }
    catch (error) { if (error?.code !== "EEXIST") throw error; }
    const stat = await lstat(current);
    const resolved = await realpath(current);
    if (!stat.isDirectory() || stat.isSymbolicLink() || resolved !== current) throw new Error("BUNDLE_WRITE_FAILED");
  }
}

function validManifest(value) {
  if (!exactKeys(value, MANIFEST_KEYS) || value.schema_version !== HELPER_BUNDLE_SCHEMA_VERSION
    || value.kind !== "team_harness_pipeline_helper_bundle"
    || value.compatibility_epoch !== HELPER_COMPATIBILITY_EPOCH
    || !SHA256.test(value.bundle_identity_sha256 ?? "") || !Array.isArray(value.helpers)
    || value.helpers.length !== PIPELINE_HELPERS.length) return false;
  const expected = [...PIPELINE_HELPERS].sort();
  const actual = value.helpers.map(item => item?.name);
  return actual.every((name, index) => name === expected[index])
    && value.helpers.every(item => exactKeys(item, HELPER_KEYS) && PIPELINE_HELPERS.includes(item.name)
      && SHA256.test(item.sha256 ?? "") && Number.isSafeInteger(item.size)
      && item.size > 0 && item.size <= MAX_FILE_BYTES);
}

function manifestIdentity(manifest) {
  return hash(canonicalBytes({
    compatibility_epoch: manifest.compatibility_epoch,
    helpers: manifest.helpers,
  }));
}

function safeManifestPath(value) {
  return typeof value === "string"
    && /^inputs\/runtime\/team-harness\/helper-bundles\/[a-f0-9]{64}\/manifest\.json$/.test(value);
}

async function verifyAt(workspace, manifestPath, expectedManifestSha = null) {
  if (!safeManifestPath(manifestPath)) throw new Error("BUNDLE_COORDINATE_INVALID");
  const absoluteManifest = path.resolve(workspace, manifestPath);
  const manifestBytes = await regularFile(workspace, absoluteManifest, "BUNDLE_INVALID");
  const manifestSha = hash(manifestBytes);
  if (expectedManifestSha !== null && manifestSha !== expectedManifestSha) throw new Error("BUNDLE_STALE");
  let manifest;
  try { manifest = JSON.parse(manifestBytes.toString("utf8")); } catch { throw new Error("BUNDLE_INVALID"); }
  if (!validManifest(manifest) || manifestIdentity(manifest) !== manifest.bundle_identity_sha256
    || path.basename(path.dirname(absoluteManifest)) !== manifest.bundle_identity_sha256) throw new Error("BUNDLE_INVALID");
  const bundleRoot = path.dirname(absoluteManifest);
  const helperPaths = {};
  for (const helper of manifest.helpers) {
    const target = path.join(bundleRoot, helper.name);
    const helperBytes = await regularFile(bundleRoot, target, "BUNDLE_INVALID");
    if (helperBytes.length !== helper.size || hash(helperBytes) !== helper.sha256) throw new Error("BUNDLE_STALE");
    helperPaths[helper.name] = target;
  }
  return output("pass", null, "use-workspace-helper-bundle", {
    compatibility_epoch: manifest.compatibility_epoch,
    bundle_root: path.relative(workspace, bundleRoot).replaceAll("\\", "/"),
    bundle_identity_sha256: manifest.bundle_identity_sha256,
    manifest_path: manifestPath,
    manifest_sha256: manifestSha,
    helper_paths: helperPaths,
  });
}

/** Copy the closed helper set before any operator/autonomous correction authority is consumed. */
export async function materializeHelperBundle(input = {}) {
  try {
    if (!exactKeys(input, MATERIALIZE_KEYS)) throw new Error("ARGUMENT_INVALID");
    const workspace = await canonicalDirectory(input.workspace, "WORKSPACE_INVALID");
    const sourceRoot = await canonicalDirectory(input.source_root, "SOURCE_ROOT_INVALID");
    const sourceFiles = [];
    for (const name of [...PIPELINE_HELPERS].sort()) {
      const value = await regularFile(sourceRoot, path.join(sourceRoot, name), "SOURCE_HELPER_INVALID");
      sourceFiles.push({ name, bytes: value, sha256: hash(value), size: value.length });
    }
    const manifest = {
      schema_version: HELPER_BUNDLE_SCHEMA_VERSION,
      kind: "team_harness_pipeline_helper_bundle",
      compatibility_epoch: HELPER_COMPATIBILITY_EPOCH,
      bundle_identity_sha256: null,
      helpers: sourceFiles.map(({ name, sha256, size }) => ({ name, sha256, size })),
    };
    manifest.bundle_identity_sha256 = manifestIdentity(manifest);
    const bundleRoot = path.join(workspace, "inputs", "runtime", "team-harness", "helper-bundles", manifest.bundle_identity_sha256);
    const manifestPath = path.relative(workspace, path.join(bundleRoot, "manifest.json")).replaceAll("\\", "/");
    try {
      return await verifyAt(workspace, manifestPath);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    const parent = path.dirname(bundleRoot);
    await ensureDirectory(workspace, parent);
    const canonicalParent = await realpath(parent);
    if (canonicalParent !== parent || !contained(workspace, canonicalParent)) throw new Error("BUNDLE_WRITE_FAILED");
    const temporary = path.join(parent, `.tmp-${manifest.bundle_identity_sha256}-${randomUUID()}`);
    try {
      await mkdir(temporary, { mode: 0o700 });
      for (const file of sourceFiles) {
        const target = path.join(temporary, file.name);
        await writeFile(target, file.bytes, { flag: "wx", mode: 0o400 });
        await chmod(target, 0o400);
      }
      const manifestBytes = canonicalBytes(manifest);
      await writeFile(path.join(temporary, "manifest.json"), manifestBytes, { flag: "wx", mode: 0o400 });
      await chmod(path.join(temporary, "manifest.json"), 0o400);
      if (await realpath(parent) !== parent) throw new Error("BUNDLE_WRITE_FAILED");
      await rename(temporary, bundleRoot);
    } catch (error) {
      await rm(temporary, { recursive: true, force: true }).catch(() => {});
      if (error?.code === "EEXIST" || error?.code === "ENOTEMPTY") return verifyAt(workspace, manifestPath);
      throw error;
    }
    return verifyAt(workspace, manifestPath);
  } catch (error) {
    const known = new Set([
      "ARGUMENT_INVALID", "WORKSPACE_INVALID", "SOURCE_ROOT_INVALID", "SOURCE_HELPER_INVALID",
      "BUNDLE_COORDINATE_INVALID", "BUNDLE_INVALID", "BUNDLE_STALE", "BUNDLE_WRITE_FAILED",
    ]);
    return output("fail", known.has(error?.message) ? error.message : "BUNDLE_WRITE_FAILED", "block-before-authority");
  }
}

/** Verify an already materialized bundle without consulting the plugin cache. */
export async function verifyHelperBundle(input = {}) {
  try {
    if (!exactKeys(input, VERIFY_KEYS) || !SHA256.test(input.manifest_sha256 ?? "")) throw new Error("ARGUMENT_INVALID");
    const workspace = await canonicalDirectory(input.workspace, "WORKSPACE_INVALID");
    return await verifyAt(workspace, input.manifest_path, input.manifest_sha256);
  } catch (error) {
    const known = new Set([
      "ARGUMENT_INVALID", "WORKSPACE_INVALID", "BUNDLE_COORDINATE_INVALID", "BUNDLE_INVALID", "BUNDLE_STALE",
    ]);
    return output("fail", known.has(error?.message) ? error.message : "BUNDLE_INVALID", "block-before-authority");
  }
}

function parseInput(raw) {
  if (typeof raw !== "string" || Buffer.byteLength(raw, "utf8") > MAX_INPUT_BYTES) return null;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch { return null; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [operation, raw, ...rest] = process.argv.slice(2);
  const input = rest.length === 0 ? parseInput(raw) : null;
  const result = operation === "materialize" ? await materializeHelperBundle(input)
    : operation === "verify" ? await verifyHelperBundle(input)
      : output("fail", "ARGUMENT_INVALID", "block-before-authority");
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.verdict !== "pass") process.exitCode = 1;
}
