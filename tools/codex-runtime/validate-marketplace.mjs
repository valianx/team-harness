#!/usr/bin/env node

import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import process from "node:process";

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const strictSemver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function fail(message) {
  throw new Error(`codex-marketplace: ${message}`);
}

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`);
  return value;
}

function exact(value, expected, label) {
  if (value !== expected) fail(`${label} must be ${JSON.stringify(expected)}`);
}

function strictVersion(value, label) {
  if (typeof value !== "string" || !strictSemver.test(value)) {
    fail(`${label} must be a strict Semantic Version (X.Y.Z)`);
  }
}

function isStrictDescendant(candidate, base) {
  const rel = relative(base, candidate);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

// Check every existing component before resolving the path. This rejects a
// symlink at the source itself or in any ancestor, rather than relying only on
// the final realpath comparison (which is still performed below as a
// defense-in-depth containment check).
async function rejectSymlinkComponents(candidate, label) {
  const components = [];
  let cursor = resolve(candidate);
  while (true) {
    components.push(cursor);
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  for (const component of components.reverse()) {
    let info;
    try {
      info = await lstat(component);
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    if (info.isSymbolicLink()) fail(`${label} contains a symbolic link at ${component}`);
  }
}

// A local plugin source is copied into Codex's cache and then loaded as code.
// Checking only the source root and the manifest's ancestors would allow a
// nested skill, hook, or other asset to escape that trust boundary through a
// descendant symlink. Walk the complete tree and lstat every entry; never use
// Dirent's type bits as a substitute because they can be unknown on some file
// systems.
async function rejectSymlinksRecursively(root, label) {
  const rootAbsolute = resolve(root);
  await rejectSymlinkComponents(rootAbsolute, label);
  const pending = [rootAbsolute];
  while (pending.length > 0) {
    const current = pending.pop();
    let entries;
    try {
      entries = await readdir(current);
    } catch (error) {
      if (error?.code === "ENOENT") fail(`${label} disappeared while validating at ${current}`);
      throw error;
    }
    for (const entry of entries) {
      const child = resolve(current, entry);
      const info = await lstat(child);
      if (info.isSymbolicLink()) fail(`${label} contains a symbolic link at ${child}`);
      if (info.isDirectory()) pending.push(child);
    }
  }
}

async function requireContainedRealpath(candidate, base, label) {
  const candidateReal = await realpath(candidate);
  if (!isStrictDescendant(candidateReal, base)) {
    fail(`${label} realpath escapes its trusted root`);
  }
  return candidateReal;
}

/**
 * Validate the repository-local Codex marketplace and plugin source.
 * `root`/`catalogPath` are injectable for isolated fixture tests.
 */
export async function validateMarketplace({ root = defaultRoot, catalogPath = resolve(root, ".agents/plugins/marketplace.json") } = {}) {
  const repositoryRoot = resolve(root);
  await rejectSymlinkComponents(repositoryRoot, "repository root");
  const repositoryReal = await realpath(repositoryRoot);
  const catalogAbsolute = resolve(catalogPath);
  if (!isStrictDescendant(catalogAbsolute, repositoryRoot)) {
    fail("marketplace catalog must be a strict repository-local descendant");
  }
  await rejectSymlinkComponents(catalogAbsolute, "marketplace catalog");
  const catalogReal = await realpath(catalogAbsolute);
  if (!isStrictDescendant(catalogReal, repositoryReal)) {
    fail("marketplace catalog realpath escapes the repository root");
  }

  const catalog = object(JSON.parse(await readFile(catalogAbsolute, "utf8")), "marketplace");
  exact(catalog.name, "team-harness", "marketplace.name");
  exact(object(catalog.interface, "marketplace.interface").displayName, "Team Harness", "marketplace.interface.displayName");
  if (!Array.isArray(catalog.plugins) || catalog.plugins.length !== 1) fail("marketplace.plugins must contain exactly one plugin");

  const plugin = object(catalog.plugins[0], "marketplace.plugins[0]");
  exact(plugin.name, "team-harness", "plugin.name");
  exact(plugin.category, "Developer Tools", "plugin.category");
  const source = object(plugin.source, "plugin.source");
  exact(source.source, "local", "plugin.source.source");
  if (typeof source.path !== "string" || source.path.length === 0) fail("plugin.source.path must be a non-empty relative path");
  if (source.path.startsWith("/") || source.path.startsWith("\\") || /^[A-Za-z]:[\\/]/.test(source.path)) {
    fail("plugin.source.path must be relative");
  }
  const policy = object(plugin.policy, "plugin.policy");
  exact(policy.installation, "AVAILABLE", "plugin.policy.installation");
  exact(policy.authentication, "ON_INSTALL", "plugin.policy.authentication");

  const pluginRoot = resolve(repositoryRoot, source.path);
  if (!isStrictDescendant(pluginRoot, repositoryRoot)) fail("plugin source must be a strict repository-local descendant");
  await rejectSymlinkComponents(pluginRoot, "plugin source");
  const pluginReal = await realpath(pluginRoot);
  if (!isStrictDescendant(pluginReal, repositoryReal)) {
    fail("plugin source realpath escapes the repository root");
  }
  const pluginStat = await lstat(pluginRoot);
  if (!pluginStat.isDirectory()) fail("plugin source must be a directory");
  await rejectSymlinksRecursively(pluginRoot, "plugin source");

  const manifestPath = resolve(pluginRoot, ".codex-plugin/plugin.json");
  const manifestReal = await requireContainedRealpath(manifestPath, pluginReal, "plugin manifest");
  const manifest = object(JSON.parse(await readFile(manifestPath, "utf8")), "plugin manifest");
  exact(manifest.name, plugin.name, "plugin manifest name");
  strictVersion(manifest.version, "plugin manifest version");
  process.stdout.write("codex marketplace structure: PASS\n");
  return { repositoryRoot, pluginRoot, manifest, manifestReal };
}

const invokedDirectly = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) {
  validateMarketplace().catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
