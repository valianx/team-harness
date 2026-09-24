#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import process from "node:process";

const VERSION_SITES = [
  { path: ".claude-plugin/plugin.json", required: true, kind: "json", select: (value) => value?.version },
  { path: ".claude-plugin/marketplace.json", required: true, kind: "json", select: (value) => value?.plugins?.[0]?.version },
  { path: "plugins/team-harness/.codex-plugin/plugin.json", required: false, kind: "json", select: (value) => value?.version },
  { path: "cmd/install/main.go", required: false, kind: "go" },
];

const DISTRIBUTED_PREFIXES = [
  "agents/",
  "skills/",
  "hooks/",
  "plugins/team-harness/",
  ".agents/",
  ".codex/",
  "runtime/schema/",
  "runtime/codex/",
  "tools/codex-runtime/",
];
const CHANGELOG_PATH = "CHANGELOG.md";

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv, env) {
  const values = { base: env.BASE_SHA, head: env.HEAD_SHA };
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option !== "--base" && option !== "--head") fail(`Unknown argument: ${option}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) fail(`${option} requires a git ref`);
    values[option.slice(2)] = value;
    index += 1;
  }
  if (!values.base || !values.head) fail("Both base and head refs are required (use --base/--head or BASE_SHA/HEAD_SHA).");
  return values;
}

function git(args, options = {}) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    ...options,
  });
  if (result.error) fail(`Unable to run git ${args[0]}: ${result.error.message}`);
  return result;
}

function resolveCommit(ref, label) {
  const result = git(["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`]);
  if (result.status !== 0) fail(`${label} ref does not resolve to a commit: ${ref}`);
  return result.stdout.trim();
}

function getDiff(base, head) {
  // Disable rename detection so a move out of a distributed path still
  // exposes the source deletion and cannot evade classification.
  const result = git(["diff", "--no-renames", "--name-only", "-z", base, head, "--"]);
  if (result.status !== 0) fail(`Unable to diff base and head commits: ${result.stderr.trim() || result.status}`);
  return result.stdout.split("\0").filter(Boolean);
}

function readAt(commit, file, label) {
  const result = git(["show", `${commit}:${file}`]);
  if (result.status !== 0) fail(`${label} is missing or unreadable at ${commit}: ${file}`);
  return result.stdout;
}

function existsAt(commit, file) {
  return git(["cat-file", "-e", `${commit}:${file}`]).status === 0;
}

function parseSemver(value, label) {
  if (typeof value !== "string") fail(`${label} is missing; expected valid SemVer.`);
  const match = value.match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/);
  if (!match) fail(`${label} must be valid SemVer: ${String(value)}`);
  return {
    text: value,
    core: match.slice(1, 4).map(BigInt),
    prerelease: match[4] ? match[4].split(".") : null,
  };
}

function compareSemver(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left.core[index] < right.core[index]) return -1;
    if (left.core[index] > right.core[index]) return 1;
  }
  if (left.prerelease === null && right.prerelease === null) return 0;
  if (left.prerelease === null) return 1;
  if (right.prerelease === null) return -1;
  const count = Math.min(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < count; index += 1) {
    const leftId = left.prerelease[index];
    const rightId = right.prerelease[index];
    if (leftId === rightId) continue;
    const leftNumeric = /^(0|[1-9]\d*)$/.test(leftId);
    const rightNumeric = /^(0|[1-9]\d*)$/.test(rightId);
    if (leftNumeric && rightNumeric) return BigInt(leftId) < BigInt(rightId) ? -1 : 1;
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftId < rightId ? -1 : 1;
  }
  return Math.sign(left.prerelease.length - right.prerelease.length);
}

function parseSiteVersion(site, source, label) {
  let value;
  if (site.kind === "json") {
    let parsed;
    try {
      parsed = JSON.parse(source);
    } catch (error) {
      fail(`${label} contains invalid JSON: ${error.message}`);
    }
    value = site.select(parsed);
  } else {
    const matches = [...source.matchAll(/^\s*var\s+version\s*=\s*"([^"]+)"\s*$/gm)];
    if (matches.length !== 1) fail(`${label} must contain exactly one var version string.`);
    value = matches[0][1];
  }
  return parseSemver(value, label);
}

function isDistributedChange(file) {
  if (file === "assets.go") return true;
  if (DISTRIBUTED_PREFIXES.some((prefix) => file.startsWith(prefix))) return true;
  return file.startsWith("cmd/install/") && !file.endsWith("_test.go");
}

function escapedRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function checkVersionContract(base, head, changedFiles) {
  const changedSet = new Set(changedFiles);
  const distributed = changedFiles.some(isDistributedChange);
  const explicitVersionEdit = VERSION_SITES.some((site) => changedSet.has(site.path));
  if (!distributed && !explicitVersionEdit) {
    process.stdout.write("No release metadata change required.\n");
    return;
  }

  const sitePresence = VERSION_SITES.map((site) => ({
    ...site,
    presentAtBase: existsAt(base, site.path),
    presentAtHead: existsAt(head, site.path),
  }));
  for (const site of sitePresence) {
    if (site.required && (!site.presentAtBase || !site.presentAtHead)) {
      fail(`Required version site ${site.path} must exist at both base and head.`);
    }
    if (site.presentAtBase && !site.presentAtHead) {
      fail(`Version site ${site.path} exists at base and must remain present at head.`);
    }
  }
  const activeSites = sitePresence.filter((site) => site.presentAtBase || site.presentAtHead);
  const canonicalSite = VERSION_SITES[0];
  const baseVersion = parseSiteVersion(canonicalSite, readAt(base, canonicalSite.path, "Base version site"), `Base ${canonicalSite.path}`);
  const newVersion = parseSiteVersion(canonicalSite, readAt(head, canonicalSite.path, "Head version site"), `Head ${canonicalSite.path}`);
  const baseVersions = activeSites
    .filter((site) => site.presentAtBase)
    .map((site) => parseSiteVersion(site, readAt(base, site.path, "Base version site"), `Base ${site.path}`));
  const headVersions = activeSites
    .filter((site) => site.presentAtHead)
    .map((site) => parseSiteVersion(site, readAt(head, site.path, "Head version site"), `Head ${site.path}`));
  if (baseVersions.some((version) => version.text !== baseVersion.text)) {
    fail(`Base version sites disagree: ${baseVersions.map((version) => version.text).join(", ")}`);
  }
  if (headVersions.some((version) => version.text !== newVersion.text)) {
    fail(`Head version sites disagree; all present version sites must match: ${headVersions.map((version) => version.text).join(", ")}`);
  }
  if (compareSemver(newVersion, baseVersion) <= 0) {
    fail(`Head version ${newVersion.text} must be strictly greater than base version ${baseVersion.text}.`);
  }
  for (const site of activeSites) {
    const result = git(["diff", "--quiet", base, head, "--", site.path]);
    if (result.status === 0) fail(`${site.path} was not changed; every present version site must be updated for a distributed change.`);
    if (result.status !== 1) fail(`Unable to compare version site ${site.path}: ${result.stderr.trim() || result.status}`);
  }

  const changelog = readAt(head, CHANGELOG_PATH, "Head changelog");
  const heading = new RegExp(`^## \\[${escapedRegex(newVersion.text)}\\] - \\d{4}-\\d{2}-\\d{2}$`, "m");
  if (!changedSet.has(CHANGELOG_PATH) || !heading.test(changelog)) {
    fail(`${CHANGELOG_PATH} must change in this PR and contain a heading matching ${newVersion.text} (## [${newVersion.text}] - YYYY-MM-DD).`);
  }
  process.stdout.write(`Release preflight passed: ${baseVersion.text} -> ${newVersion.text}; ${activeSites.length} present version sites and CHANGELOG.md agree.\n`);
}

function main() {
  const refs = parseArgs(process.argv.slice(2), process.env);
  const base = resolveCommit(refs.base, "Base");
  const head = resolveCommit(refs.head, "Head");
  const changedFiles = getDiff(base, head);
  checkVersionContract(base, head, changedFiles);
}

try {
  main();
} catch (error) {
  process.stderr.write(`Version preflight failed: ${error.message}\n`);
  process.exitCode = 1;
}
