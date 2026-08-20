#!/usr/bin/env node
/** Build the anchored inline review package from repository state, and decide its ship join. */

import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

export const REVIEW_FAN_SCHEMA_VERSION = 1;

const run = promisify(execFile);

const MAX_DIFF_BYTES = 4 * 1024 * 1024;
const MAX_CHANGED_PATHS = 4096;
const MAX_CRITERIA = 256;
const MAX_RETURNS = 32;
const SHA = /^[0-9a-f]{7,40}$/;
const CHANGE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RANGE = /^([^\s.]+(?:\.[^\s.]+)*)\.{2,3}([^\s.]+(?:\.[^\s.]+)*)$/;

export const LENSES = ["tester", "qa", "security", "adversary"];
const FLOOR_LENSES = ["security", "adversary"];

export const ERROR_CODES = new Set([
  "ARGUMENT_INVALID",
  "REPOSITORY_UNRESOLVED",
  "WORKTREE_NOT_CLEAN",
  "RANGE_NOT_COMMITTED",
  "CHANGED_SURFACE_EMPTY",
  "CHANGED_SURFACE_TOO_LARGE",
  "CHANGE_NOT_VALIDATED",
  "CHANGE_NOT_FOUND",
  "SCOPE_FULL_REFUSED",
  "PACKAGE_INVALID",
  "RETURNS_INVALID",
  "INTERNAL_ERROR",
]);

/**
 * Identifier-aware boundaries: `_` is a word character, so `\b` fails to see `jwt` inside
 * `issue_jwt`. Separator classes also admit the spaced spelling contract prose actually uses.
 */
const OPEN = "(?<![a-z0-9])";
const CLOSE = "(?![a-z0-9])";
const SEP = "[\\s_-]?";

function signal(alternatives) {
  return new RegExp(`${OPEN}(?:${alternatives.join("|")})${CLOSE}`, "i");
}

/** Path signals: a changed path under these matches a security floor category outright. */
const FLOOR_PATHS = [
  [/(^|\/)\.github\/workflows\//i, "executable-code handling"],
  [/(^|\/)(auth|authn|authz|oauth|permission)[^/]*\.[a-z]+$/i, "authentication, authorization or permissions"],
  [/(^|\/)(session|login|identity)[^/]*\.[a-z]+$/i, "identity or session handling"],
  [/(^|\/)(crypto|tls|ssl|cert)[^/]*\.[a-z]+$/i, "cryptography or transport security"],
  [/(^|\/)(secrets?|credentials?|keystore)[^/]*(\.[a-z]+)?$/i, "credentials or secrets"],
  [/(^|\/)hooks\//i, "security policy/audit enforcement"],
  [/(^|\/)(Dockerfile|entrypoint\.sh)$/i, "executable-code handling"],
];

/** Content signals: matched against added diff lines only. */
const FLOOR_CONTENT = [
  [signal(["authenticate", "authoriz\\w*", "permission", "rbac", `access${SEP}control`]), "authentication, authorization or permissions"],
  [signal(["session", "jwt", "bearer", `cookie${SEP}secret`]), "identity or session handling"],
  [signal([`api${SEP}key`, "secret", "credential", "password", "token"]), "credentials or secrets"],
  [signal(["encrypt\\w*", "decrypt\\w*", "cipher", "hmac", "tls", "certificate"]), "cryptography or transport security"],
  [signal(["deserializ\\w*", "unpickle", "sanitiz\\w*", "untrusted"]), "untrusted-input validation or deserialization"],
  [signal(["upload"]), "file upload"],
  [signal([`(?:export|download|dump)${SEP}(?:data|table|records)`]), "data access or export"],
  [signal(["subprocess", `child${SEP}process`, "os\\.system"]), "executable-code handling"],
  [signal([`security${SEP}floor`, "adversary", `audit${SEP}trail`, `policy${SEP}block`, `dev${SEP}guard`]), "security policy/audit enforcement"],
];

function fail(code) {
  throw new Error(ERROR_CODES.has(code) ? code : "INTERNAL_ERROR");
}

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function git(root, args) {
  const { stdout } = await run("git", ["-C", root, ...args], {
    maxBuffer: MAX_DIFF_BYTES,
    windowsHide: true,
  });
  return stdout;
}

async function resolveRepositoryRoot(candidate) {
  const base = candidate ?? process.cwd();
  try {
    const top = (await git(base, ["rev-parse", "--show-toplevel"])).trim();
    if (!top) fail("REPOSITORY_UNRESOLVED");
    return top;
  } catch {
    return fail("REPOSITORY_UNRESOLVED");
  }
}

async function assertCleanTree(root) {
  const status = await git(root, ["status", "--porcelain", "--untracked-files=no"]);
  if (status.trim().length > 0) fail("WORKTREE_NOT_CLEAN");
}

function splitRange(range) {
  const match = RANGE.exec(range ?? "");
  if (!match) fail("ARGUMENT_INVALID");
  return [match[1], match[2]];
}

async function resolveCommitted(root, range) {
  const [left, right] = splitRange(range);
  const resolved = [];
  for (const endpoint of [left, right]) {
    try {
      resolved.push((await git(root, ["rev-parse", "--verify", `${endpoint}^{commit}`])).trim());
    } catch {
      return fail("RANGE_NOT_COMMITTED");
    }
  }
  return { base: resolved[0], head: resolved[1] };
}

function parseNameStatus(stdout) {
  const surface = [];
  for (const line of stdout.split("\n")) {
    if (line.trim().length === 0) continue;
    const [status, ...rest] = line.split("\t");
    const target = rest.at(-1);
    if (!status || !target) continue;
    surface.push({ path: target, change: status[0].toLowerCase() });
  }
  return surface;
}

async function readChangedSurface(root, range) {
  const surface = parseNameStatus(await git(root, ["diff", "--name-status", range]));
  if (surface.length === 0) fail("CHANGED_SURFACE_EMPTY");
  if (surface.length > MAX_CHANGED_PATHS) fail("CHANGED_SURFACE_TOO_LARGE");
  return surface;
}

/**
 * A path a green checker proves byte-identical to its canonical source carries no information the
 * source does not, so reviewing it twice buys nothing. Withheld eligibility keeps everything.
 */
async function readVerifiedExclusions(root, range) {
  const script = path.join(root, "skills", "pipeline", "scripts", "review-surface.mjs");
  try {
    const { stdout } = await run("node", [script, "--repo-root", root, "--range", range], {
      cwd: root,
      maxBuffer: MAX_DIFF_BYTES,
      windowsHide: true,
    });
    const result = JSON.parse(stdout);
    if (result?.verdict !== "pass") return { paths: new Set(), surface: null };
    return {
      paths: new Set(result.excluded.map((entry) => entry.path)),
      surface: {
        excluded_file_count: result.excluded.length,
        excluded_line_count: result.excluded_line_count,
        checkers: result.checkers,
        withheld_by: result.withheld_by,
      },
    };
  } catch {
    return { paths: new Set(), surface: null };
  }
}

/** Added lines per file, so a content signal is attributed to the file that carries it. */
export async function readAddedByFile(root, range) {
  const diff = await git(root, ["diff", "--unified=0", "--no-color", range]);
  const added = new Map();
  let current = null;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ b/")) current = line.slice("+++ b/".length).trim();
    else if (line.startsWith("+++ ")) current = null;
    else if (current !== null && line.startsWith("+")) {
      added.set(current, `${added.get(current) ?? ""}\n${line}`);
    }
  }
  return added;
}

/**
 * Prose files carry contract text, so a code-level lexicon hit inside one is a word, not a control.
 * Only the policy category is derivable from prose; every other category needs a non-prose file.
 */
const PROSE = /\.(md|markdown|txt|rst|adoc)$/i;
const PROSE_CATEGORY = "security policy/audit enforcement";

function contentCategories(filePath, addedText) {
  const prose = PROSE.test(filePath);
  const found = [];
  for (const [pattern, category] of FLOOR_CONTENT) {
    if (prose && category !== PROSE_CATEGORY) continue;
    if (pattern.test(addedText)) found.push(category);
  }
  return found;
}

/** Paths whose content cannot be scanned, so no content signal can be ruled out for them. */
export async function readUnscannablePaths(root, range) {
  const numstat = await git(root, ["diff", "--numstat", range]);
  const unscannable = [];
  for (const line of numstat.split("\n")) {
    const [added, deleted, ...rest] = line.split("\t");
    const target = rest.at(-1);
    if (added === "-" && deleted === "-" && target) unscannable.push(target);
  }
  return unscannable;
}

/**
 * Classify the security floor from changed paths and added content.
 * An unscannable path leaves the classification ambiguous, and ambiguous resolves sensitive.
 */
export function classifyFloor(changedSurface, addedByFile, unscannable = []) {
  const categories = new Set();
  for (const entry of changedSurface) {
    for (const [pattern, category] of FLOOR_PATHS) {
      if (pattern.test(entry.path)) categories.add(category);
    }
  }
  for (const [filePath, addedText] of addedByFile) {
    for (const category of contentCategories(filePath, addedText)) categories.add(category);
  }
  const reasons = [...categories].sort();
  const ambiguous = unscannable.length > 0;
  const parts = ambiguous
    ? [...reasons, `unscannable content in ${unscannable.length} path(s)`]
    : reasons;
  return {
    applies: parts.length > 0,
    reason: parts.length > 0 ? parts.join("; ") : null,
    categories: reasons,
    ambiguous,
    unscannable_paths: unscannable.slice(0, 32),
  };
}

function requirementHeaders(text) {
  return text
    .split("\n")
    .filter((line) => line.startsWith("### Requirement:"))
    .map((line) => line.slice("### Requirement:".length).trim())
    .filter((name) => name.length > 0);
}

/** Bind each authored requirement header as a criterion carried by its anchored path. */
export async function readSpecRequirements(specsRoot) {
  const criteria = [];
  let capabilities = [];
  try {
    capabilities = await readdir(specsRoot, { withFileTypes: true });
  } catch {
    return criteria;
  }
  for (const entry of capabilities) {
    if (!entry.isDirectory()) continue;
    const specPath = path.join(specsRoot, entry.name, "spec.md");
    const text = await readFile(specPath, "utf8").catch(() => null);
    if (text === null) continue;
    for (const name of requirementHeaders(text)) {
      criteria.push({ text: name, provenance: "written-intent", source: specPath });
    }
  }
  return criteria;
}

async function validateChange(root, change) {
  if (!CHANGE_NAME.test(change)) fail("ARGUMENT_INVALID");
  const changeRoot = path.join(root, "openspec", "changes", change);
  const present = await stat(changeRoot).then((entry) => entry.isDirectory()).catch(() => false);
  if (!present) fail("CHANGE_NOT_FOUND");
  try {
    await run("npx", ["--yes", "@fission-ai/openspec@1.9.0", "validate", change, "--strict"], {
      cwd: root,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    });
  } catch {
    return fail("CHANGE_NOT_VALIDATED");
  }
  return changeRoot;
}

async function bindWrittenIntent(root, change) {
  if (change === undefined) return [];
  const changeRoot = await validateChange(root, change);
  const criteria = await readSpecRequirements(path.join(changeRoot, "specs"));
  return criteria.slice(0, MAX_CRITERIA);
}

function normalizeLenses(value) {
  const requested = (value ?? "").split(",").map((entry) => entry.trim()).filter(Boolean);
  if (requested.length === 0 || requested.some((lens) => !LENSES.includes(lens))) fail("ARGUMENT_INVALID");
  return [...new Set(requested)].sort();
}

function resolveRequiredLenses(requested, floorApplies) {
  const required = new Set(requested);
  if (floorApplies) for (const lens of FLOOR_LENSES) required.add(lens);
  return [...required].sort();
}

function resolveScope(priorAnchor, requestedScope) {
  if (priorAnchor === undefined) return { kind: "full", prior_anchor: null };
  if (!SHA.test(priorAnchor)) fail("ARGUMENT_INVALID");
  if (requestedScope === "full") fail("SCOPE_FULL_REFUSED");
  return { kind: "delta", prior_anchor: priorAnchor };
}

async function buildPackage(input) {
  const root = await resolveRepositoryRoot(input.repoRoot);
  await assertCleanTree(root);
  const scope = resolveScope(input.priorAnchor, input.scope);
  const range = scope.kind === "delta" ? `${scope.prior_anchor}..${splitRange(input.range)[1]}` : input.range;
  const coordinates = await resolveCommitted(root, range);
  const allChanged = await readChangedSurface(root, range);
  const verified = await readVerifiedExclusions(root, range);
  const changedSurface = allChanged.filter((entry) => !verified.paths.has(entry.path));
  const floor = classifyFloor(
    allChanged,
    await readAddedByFile(root, range),
    await readUnscannablePaths(root, range),
  );
  const requested = normalizeLenses(input.lens);
  return {
    mode: "inline-review",
    repository_root: root,
    coordinates: { commit_or_range: range, base: coordinates.base, head: coordinates.head, source: "derived" },
    scope: { kind: scope.kind, prior_anchor: scope.prior_anchor, paths: changedSurface.map((entry) => entry.path) },
    criteria: await bindWrittenIntent(root, input.change),
    changed_surface: changedSurface,
    requested_lenses: requested,
    required_lenses: resolveRequiredLenses(requested, floor.applies),
    security_floor: floor,
    review_surface: verified.surface,
    read_only: true,
  };
}

function validReturn(value) {
  return object(value) &&
    LENSES.includes(value.lens) &&
    ["pass", "concerns", "fail", "blocked"].includes(value.verdict) &&
    (value.findings === undefined || Array.isArray(value.findings));
}

function findingFiles(entry) {
  const files = Array.isArray(entry?.files) ? entry.files : [entry?.file];
  return files.filter((file) => typeof file === "string" && file.length > 0);
}

/** A finding whose files all fall outside a delta package's range is a concern, never a blocker. */
export function partitionFindings(pkg, findings) {
  const inScope = new Set(pkg.scope.paths);
  const blockers = [];
  const concerns = [];
  for (const entry of findings) {
    const files = findingFiles(entry);
    const outside = pkg.scope.kind === "delta" && files.length > 0 && files.every((file) => !inScope.has(file));
    if (outside || entry?.severity === "concern") concerns.push(entry);
    else blockers.push(entry);
  }
  return { blockers, concerns };
}

/**
 * A finding the authored criteria anticipated closes by executing that criterion's oracle.
 * One the criteria did not anticipate is a defect in the spec, never another review pass.
 */
export function classifyCoverage(pkg, finding) {
  const criteria = Array.isArray(pkg.criteria) ? pkg.criteria : [];
  const declared = typeof finding?.criterion === "string" ? finding.criterion.toLowerCase() : null;
  const match = criteria.find((entry) => {
    const text = String(entry?.text ?? "").toLowerCase();
    if (text.length === 0) return false;
    return declared !== null ? text === declared || text.includes(declared) || declared.includes(text) : false;
  });
  if (match) return { coverage: "covered", criterion: match.text, source: match.source ?? null };
  return { coverage: "uncovered", criterion: null, source: null };
}

/** Fail-closed join: an absent required return is never a pass. */
export function gateDecision(pkg, returns) {
  const reasons = [];
  const byLens = new Map(returns.map((entry) => [entry.lens, entry]));
  const concerns = [];
  const covered = [];
  const specDefects = [];
  for (const lens of pkg.required_lenses) {
    const entry = byLens.get(lens);
    if (entry === undefined) {
      reasons.push(`required lens ${lens} returned nothing`);
      continue;
    }
    const split = partitionFindings(pkg, entry.findings ?? []);
    concerns.push(...split.concerns);
    for (const blocker of split.blockers) {
      const classified = { ...classifyCoverage(pkg, blocker), lens, finding: blocker };
      (classified.coverage === "covered" ? covered : specDefects).push(classified);
    }
    if (entry.verdict !== "pass") reasons.push(`required lens ${lens} returned ${entry.verdict}`);
    else if (split.blockers.length > 0) reasons.push(`required lens ${lens} returned ${split.blockers.length} blocker(s)`);
  }
  return { ready: reasons.length === 0, reasons, concerns, covered, spec_defects: specDefects };
}

async function readJson(target, code) {
  try {
    return JSON.parse(await readFile(target, "utf8"));
  } catch {
    return fail(code);
  }
}

async function runGate(input) {
  const pkg = await readJson(input.package, "PACKAGE_INVALID");
  if (!object(pkg) || !Array.isArray(pkg.required_lenses) || !object(pkg.scope)) fail("PACKAGE_INVALID");
  const returns = await readJson(input.returns, "RETURNS_INVALID");
  if (!Array.isArray(returns) || returns.length > MAX_RETURNS || !returns.every(validReturn)) fail("RETURNS_INVALID");
  return { decision: gateDecision(pkg, returns) };
}

function result(kind, payload, error = null) {
  return {
    schema_version: REVIEW_FAN_SCHEMA_VERSION,
    kind,
    verdict: error === null ? "pass" : "fail",
    error_code: error,
    ...payload,
  };
}

export async function runReviewFan(input) {
  const subcommand = input?.subcommand;
  try {
    if (subcommand === "package") {
      return result("team_harness_inline_review_package", { package: await buildPackage(input) });
    }
    if (subcommand === "gate") {
      return result("team_harness_inline_review_gate", await runGate(input));
    }
    return fail("ARGUMENT_INVALID");
  } catch (error) {
    const code = ERROR_CODES.has(error?.message) ? error.message : "INTERNAL_ERROR";
    const kind = subcommand === "gate" ? "team_harness_inline_review_gate" : "team_harness_inline_review_package";
    return result(kind, {}, code);
  }
}

const KEYS = {
  "--repo-root": "repoRoot",
  "--range": "range",
  "--lens": "lens",
  "--change": "change",
  "--prior-anchor": "priorAnchor",
  "--scope": "scope",
  "--package": "package",
  "--returns": "returns",
};

function parseCli(argv) {
  const [subcommand, ...rest] = argv;
  if (!["package", "gate"].includes(subcommand) || rest.length % 2 !== 0) return null;
  const parsed = { subcommand };
  for (let index = 0; index < rest.length; index += 2) {
    const key = KEYS[rest[index]];
    if (key === undefined || Object.hasOwn(parsed, key) || !rest[index + 1]) return null;
    parsed[key] = rest[index + 1];
  }
  return parsed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const parsed = parseCli(process.argv.slice(2));
  const output = await runReviewFan(parsed ?? {});
  process.stdout.write(`${JSON.stringify(output)}\n`);
  if (output.verdict !== "pass" || output.decision?.ready === false) process.exitCode = 1;
}
