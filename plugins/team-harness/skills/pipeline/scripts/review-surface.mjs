#!/usr/bin/env node
/** Derive which changed paths a green deterministic checker already proves, and exclude only those. */

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

export const REVIEW_SURFACE_SCHEMA_VERSION = 1;

const run = promisify(execFile);

const MAX_BUFFER = 8 * 1024 * 1024;
const CHECKER_TIMEOUT_MS = 300_000;

export const ERROR_CODES = new Set([
  "ARGUMENT_INVALID",
  "REPOSITORY_UNRESOLVED",
  "RANGE_NOT_COMMITTED",
  "INTERNAL_ERROR",
]);

/**
 * Each checker proves a class of mirrored paths. `--check` is run, never the writing mode:
 * a checker that repairs drift instead of reporting it would manufacture its own evidence.
 */
export const CHECKERS = [
  { name: "sync-skills", argv: ["tools/codex-runtime/sync-skills.mjs", "--check"] },
  { name: "sync-hooks", argv: ["tools/codex-runtime/sync-hooks.mjs", "--check"] },
];

/**
 * A projection path maps to exactly one canonical source. Only byte-identical mirrors are
 * excludable: a derived artifact (an adapter, a generated TOML) is not byte-equal to any source,
 * so it stays in review even though a checker regenerates it.
 */
const MIRRORS = [
  [/^plugins\/team-harness\/(agents\/.+)$/, (m) => m[1]],
  [/^plugins\/team-harness\/(hooks\/.+)$/, (m) => m[1]],
  [/^plugins\/team-harness\/(docs\/.+)$/, (m) => m[1]],
  [/^plugins\/team-harness\/(\.claude-plugin\/.+)$/, (m) => m[1]],
  [/^plugins\/team-harness\/skills\/([^/]+)\/(scripts\/.+)$/, (m) => `skills/${m[1]}/${m[2]}`],
  [/^installer-assets\/opencode-skills\/([^/]+)\/(scripts\/.+)$/, (m) => `skills/${m[1]}/${m[2]}`],
];

function fail(code) {
  throw new Error(ERROR_CODES.has(code) ? code : "INTERNAL_ERROR");
}

/** The canonical source a projection path mirrors, or null when the path is not a mirror. */
export function canonicalSourceFor(projectionPath) {
  for (const [pattern, resolve] of MIRRORS) {
    const match = pattern.exec(projectionPath);
    if (match) return resolve(match);
  }
  return null;
}

async function git(root, args) {
  const { stdout } = await run("git", ["-C", root, ...args], { maxBuffer: MAX_BUFFER, windowsHide: true });
  return stdout;
}

async function resolveRoot(candidate) {
  try {
    const top = (await git(candidate ?? process.cwd(), ["rev-parse", "--show-toplevel"])).trim();
    return top || fail("REPOSITORY_UNRESOLVED");
  } catch {
    return fail("REPOSITORY_UNRESOLVED");
  }
}

async function runChecker(root, checker) {
  try {
    await run("node", [path.join(root, ...checker.argv[0].split("/")), ...checker.argv.slice(1)], {
      cwd: root,
      maxBuffer: MAX_BUFFER,
      timeout: CHECKER_TIMEOUT_MS,
      windowsHide: true,
    });
    return { name: checker.name, status: "pass" };
  } catch (error) {
    const missingRuntime = error?.code === "ENOENT";
    return { name: checker.name, status: missingRuntime ? "skip" : "fail" };
  }
}

async function changedPaths(root, range) {
  try {
    const stdout = await git(root, ["diff", "--name-only", range]);
    return stdout.split("\n").map((line) => line.trim()).filter(Boolean);
  } catch {
    return fail("RANGE_NOT_COMMITTED");
  }
}

async function bytesEqual(root, left, right) {
  try {
    const [a, b] = await Promise.all([
      readFile(path.join(root, left)),
      readFile(path.join(root, right)),
    ]);
    return a.equals(b);
  } catch {
    return false;
  }
}

async function countedLines(root, range, paths) {
  if (paths.length === 0) return 0;
  const stdout = await git(root, ["diff", "--numstat", range, "--", ...paths]);
  let total = 0;
  for (const line of stdout.split("\n")) {
    const [added, deleted] = line.split("\t");
    if (added === "-" || deleted === "-") continue;
    total += (Number.parseInt(added, 10) || 0) + (Number.parseInt(deleted, 10) || 0);
  }
  return total;
}

/** A changed path is excludable only when it is byte-identical to the source it mirrors. */
async function provenMirrors(root, paths) {
  const proven = [];
  for (const candidate of paths) {
    const source = canonicalSourceFor(candidate);
    if (source === null) continue;
    if (await bytesEqual(root, candidate, source)) proven.push({ path: candidate, source });
  }
  return proven;
}

export async function computeReviewSurface(input) {
  try {
    if (typeof input?.range !== "string" || input.range.length === 0) fail("ARGUMENT_INVALID");
    const root = await resolveRoot(input.repoRoot);
    const results = await Promise.all(CHECKERS.map((checker) => runChecker(root, checker)));
    const withholding = results.filter((result) => result.status !== "pass");
    const paths = await changedPaths(root, input.range);

    if (withholding.length > 0) {
      return {
        schema_version: REVIEW_SURFACE_SCHEMA_VERSION,
        kind: "team_harness_review_surface",
        verdict: "pass",
        error_code: null,
        checkers: results,
        excluded: [],
        pathspec: [],
        excluded_line_count: 0,
        changed_path_count: paths.length,
        fully_verified: false,
        withheld_by: withholding.map((result) => `${result.name}:${result.status}`),
      };
    }

    const proven = await provenMirrors(root, paths);
    const excludedPaths = proven.map((entry) => entry.path);
    return {
      schema_version: REVIEW_SURFACE_SCHEMA_VERSION,
      kind: "team_harness_review_surface",
      verdict: "pass",
      error_code: null,
      checkers: results,
      excluded: proven.map((entry) => ({ ...entry, checker: "sync-skills", provenance: "byte-identical-mirror" })),
      pathspec: excludedPaths.map((value) => `:(exclude)${value}`),
      excluded_line_count: await countedLines(root, input.range, excludedPaths),
      changed_path_count: paths.length,
      fully_verified: paths.length > 0 && excludedPaths.length === paths.length,
      withheld_by: [],
    };
  } catch (error) {
    return {
      schema_version: REVIEW_SURFACE_SCHEMA_VERSION,
      kind: "team_harness_review_surface",
      verdict: "fail",
      error_code: ERROR_CODES.has(error?.message) ? error.message : "INTERNAL_ERROR",
      checkers: [],
      excluded: [],
      pathspec: [],
      excluded_line_count: 0,
      changed_path_count: 0,
      fully_verified: false,
      withheld_by: [],
    };
  }
}

function parseCli(argv) {
  if (argv.length % 2 !== 0) return null;
  const keys = { "--repo-root": "repoRoot", "--range": "range" };
  const parsed = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = keys[argv[index]];
    if (key === undefined || Object.hasOwn(parsed, key) || !argv[index + 1]) return null;
    parsed[key] = argv[index + 1];
  }
  return parsed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await computeReviewSurface(parseCli(process.argv.slice(2)) ?? {});
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.verdict !== "pass") process.exitCode = 1;
}
