#!/usr/bin/env node
/** Build the anchored inline review package and summarize advisory lens evidence. */

import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
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
const MAX_OPENSPEC_TREE_ENTRIES = 10000;
const MAX_OPENSPEC_TREE_LIST_BYTES = 16 * 1024 * 1024;
const MAX_OPENSPEC_TREE_BYTES = 64 * 1024 * 1024;
const SHA = /^[0-9a-f]{7,40}$/;
const CHANGE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ARCHIVED_CHANGE_NAME = /^archive\/\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RANGE = /^([^\s.]+(?:\.[^\s.]+)*)\.{2,3}([^\s.]+(?:\.[^\s.]+)*)$/;

export const LENSES = ["tester", "qa", "security", "adversary"];
const RISK_LENSES = ["security", "adversary"];

export const ERROR_CODES = new Set([
  "ARGUMENT_INVALID",
  "REPOSITORY_UNRESOLVED",
  "WORKTREE_NOT_CLEAN",
  "RANGE_NOT_COMMITTED",
  "CHANGED_SURFACE_EMPTY",
  "CHANGED_SURFACE_TOO_LARGE",
  "CHANGE_NOT_VALIDATED",
  "OPENSPEC_RUNTIME_UNAVAILABLE",
  "CHANGE_NOT_FOUND",
  "CRITERIA_TOO_MANY",
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

/** Content signals: matched against every line the change touches, added and removed alike. */
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

async function gitBytes(root, args, maxBuffer) {
  const { stdout } = await run("git", ["-C", root, ...args], {
    maxBuffer,
    windowsHide: true,
    encoding: "buffer",
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
  const status = await git(root, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (status.trim().length > 0) fail("WORKTREE_NOT_CLEAN");
}

function splitRange(range) {
  const match = RANGE.exec(range ?? "");
  if (!match) fail("ARGUMENT_INVALID");
  return [match[1], match[2]];
}

function validChangeRef(value) {
  return CHANGE_NAME.test(value) || ARCHIVED_CHANGE_NAME.test(value);
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
        excluded: result.excluded,
        pathspec: result.pathspec,
        fully_verified: result.fully_verified,
        reviewed_head: result.reviewed_head ?? null,
        checkers: result.checkers,
        withheld_by: result.withheld_by,
      },
    };
  } catch {
    return { paths: new Set(), surface: null };
  }
}

/**
 * Every line a change touches, per file, so a content signal is attributed to its own file.
 *
 * Removals count as much as additions: removing an authentication check changes the security
 * posture exactly as adding one does, and a scan that reads only `+` lines fails open on
 * control removal — the case a benign-looking path would otherwise hide entirely.
 *
 * Header recognition is positional, never a match on the line's text. A removed line whose own
 * content is a `--`-style comment produces the diff line `--- foo`, byte-identical to a real
 * `--- a/path` header; no single-line pattern separates them. Tracking position instead closes
 * that collision structurally: `---`/`+++` count as headers only between a `diff --git` line and
 * that file's first `@@`, and after the first `@@` every `+`/`-` line is content.
 */
export async function readChangedContentByFile(root, range) {
  const diff = await git(root, ["diff", "--unified=0", "--no-color", range]);
  const changed = new Map();
  let current = null;
  let previousPath = null;
  let inHunks = false;
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      current = null;
      previousPath = null;
      inHunks = false;
      continue;
    }
    if (line.startsWith("@@")) {
      inHunks = true;
      continue;
    }
    if (!inHunks) {
      if (line.startsWith("--- ")) {
        previousPath = line.startsWith("--- a/") ? line.slice("--- a/".length).trim() : null;
      } else if (line.startsWith("+++ ")) {
        // A whole-file deletion reads `+++ /dev/null`. Attributing its removed lines to the path
        // the file had is what keeps deleting a control from being quieter than editing it out.
        current = line.startsWith("+++ b/") ? line.slice("+++ b/".length).trim() : previousPath;
      }
      continue;
    }
    if (current !== null && (line.startsWith("+") || line.startsWith("-"))) {
      changed.set(current, `${changed.get(current) ?? ""}\n${line}`);
    }
  }
  return changed;
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
export async function readSpecRequirements(specsRoot, reader) {
  const criteria = [];
  let capabilities = [];
  try {
    capabilities = await reader.list(specsRoot);
  } catch {
    return criteria;
  }
  for (const name of capabilities) {
    const specPath = `${specsRoot}/${name}/spec.md`;
    const text = await reader.read(specPath);
    if (text === null) continue;
    for (const heading of requirementHeaders(text)) {
      criteria.push({ text: heading, provenance: "written-intent", source: specPath });
    }
  }
  return criteria;
}

/**
 * Criteria are read out of the reviewed head, never the working checkout: a package must not
 * bind requirements that are absent from its own immutable target.
 */
export function headTreeReader(root, head) {
  return {
    async list(prefix) {
      const stdout = await git(root, ["ls-tree", "--name-only", `${head}:${prefix}`]);
      return stdout.split("\n").map((line) => line.trim().replace(/\/$/, "")).filter(Boolean);
    },
    async read(relative) {
      try {
        return await git(root, ["show", `${head}:${relative}`]);
      } catch {
        return null;
      }
    },
  };
}

export async function openSpecInvocation(change, {
  platform = process.platform, node = process.execPath, env = process.env,
} = {}) {
  if (!validChangeRef(change)) fail("ARGUMENT_INVALID");
  const args = ["--yes", "@fission-ai/openspec@1.9.0", "validate", change, "--type", "change", "--strict"];
  if (platform !== "win32") return { command: "npx", args };

  // Windows npx.cmd is a batch shim, not an execFile executable. Run npm's
  // JavaScript entrypoint with Node so paths and arguments never enter a shell.
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path");
  const directories = [...(env[pathKey] ?? "").split(path.delimiter), path.dirname(node)];
  for (const directory of new Set(directories)) {
    if (!path.isAbsolute(directory)) continue;
    try {
      const cli = await realpath(path.join(directory, "node_modules/npm/bin/npx-cli.js"));
      if ((await stat(cli)).isFile()) return { command: node, args: [cli, ...args] };
    } catch (error) {
      if (!["ENOENT", "ENOTDIR"].includes(error.code)) throw error;
    }
  }
  return fail("OPENSPEC_RUNTIME_UNAVAILABLE");
}

export async function validateOpenSpec(root, change, options) {
  const invocation = await openSpecInvocation(change, options);
  try {
    await run(invocation.command, invocation.args, {
      cwd: root, maxBuffer: 1024 * 1024, windowsHide: true, timeout: 120000,
    });
  } catch (error) {
    return fail(error.code === "ENOENT" ? "OPENSPEC_RUNTIME_UNAVAILABLE" : "CHANGE_NOT_VALIDATED");
  }
}

function openSpecTreePath(relative) {
  if (!relative.startsWith("openspec/") || relative.includes("\\") || path.isAbsolute(relative)) {
    throw new Error("unsupported OpenSpec tree path");
  }
  const parts = relative.split("/");
  if (parts.length < 2 || parts.some((part) => part.length === 0 || part === "." || part === ".."
    || /[\x00-\x1f<>:\"|?*]/.test(part) || /[. ]$/.test(part)
    || part.toLowerCase() === ".git"
    || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
    throw new Error("unsupported OpenSpec tree path");
  }
  return { parts };
}

/** Validate the reviewed head's complete OpenSpec tree in an isolated execution root. */
async function materializeOpenSpec(root, head, destination) {
  const listing = await gitBytes(root,
    ["ls-tree", "-rz", "--full-tree", head, "--", "openspec"],
    MAX_OPENSPEC_TREE_LIST_BYTES);
  const decoded = listing.toString("utf8");
  if (!Buffer.from(decoded, "utf8").equals(listing)) throw new Error("unsupported OpenSpec tree encoding");
  const entries = decoded.split("\0").filter(Boolean);
  if (entries.length > MAX_OPENSPEC_TREE_ENTRIES) throw new Error("OpenSpec tree is too large");

  const seen = new Map();
  let bytes = 0;
  for (const entry of entries) {
    const match = /^(100644|100755) blob ([a-f0-9]{40,64})\t(.+)$/s.exec(entry);
    if (!match) throw new Error("OpenSpec tree contains a symlink or gitlink");
    const [, mode, object, relative] = match;
    const { parts } = openSpecTreePath(relative);
    let prefix = "";
    for (let index = 0; index < parts.length; index += 1) {
      prefix = prefix.length === 0 ? parts[index] : `${prefix}/${parts[index]}`;
      const alias = prefix.toLowerCase();
      const kind = index === parts.length - 1 ? "file" : "directory";
      const previous = seen.get(alias);
      if (previous && (previous.path !== prefix || previous.kind === "file" || kind === "file")) {
        throw new Error("OpenSpec tree contains an alias path");
      }
      seen.set(alias, { path: prefix, kind });
    }

    const file = path.join(destination, ...parts);
    const confined = path.relative(destination, file);
    if (!confined || path.isAbsolute(confined) || confined === ".." || confined.startsWith(`..${path.sep}`)) {
      throw new Error("OpenSpec tree path escapes its execution root");
    }
    const content = await gitBytes(root, ["cat-file", "blob", object], MAX_OPENSPEC_TREE_BYTES);
    bytes += content.length;
    if (bytes > MAX_OPENSPEC_TREE_BYTES) throw new Error("OpenSpec tree is too large");
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content, { flag: "wx", mode: mode === "100755" ? 0o755 : 0o644 });
  }
}

async function validateChange(root, head, change) {
  if (!validChangeRef(change)) fail("ARGUMENT_INVALID");
  const changeRoot = `openspec/changes/${change}`;
  const present = await git(root, ["ls-tree", "--name-only", `${head}:${changeRoot}`])
    .then((stdout) => stdout.trim().length > 0)
    .catch(() => false);
  if (!present) fail("CHANGE_NOT_FOUND");
  let executionRoot;
  try {
    executionRoot = await mkdtemp(path.join(tmpdir(), "th-review-openspec-"));
    await materializeOpenSpec(root, head, executionRoot);
    await validateOpenSpec(executionRoot, change);
  } catch (error) {
    if (error?.message === "CHANGE_NOT_VALIDATED" || error?.message === "OPENSPEC_RUNTIME_UNAVAILABLE") {
      throw error;
    }
    fail("CHANGE_NOT_VALIDATED");
  } finally {
    if (executionRoot !== undefined) {
      try {
        await rm(executionRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      } catch {
        fail("CHANGE_NOT_VALIDATED");
      }
    }
  }
  return changeRoot;
}

async function bindWrittenIntent(root, head, change) {
  if (change === undefined) return [];
  const changeRoot = await validateChange(root, head, change);
  const criteria = await readSpecRequirements(`${changeRoot}/specs`, headTreeReader(root, head));
  if (criteria.length > MAX_CRITERIA) fail("CRITERIA_TOO_MANY");
  return criteria;
}

function normalizeLenses(value) {
  const requested = (value ?? "").split(",").map((entry) => entry.trim()).filter(Boolean);
  if (requested.length === 0 || requested.some((lens) => !LENSES.includes(lens))) fail("ARGUMENT_INVALID");
  return [...new Set(requested)].sort();
}

function resolveRecommendedLenses(requested, floorApplies) {
  const recommended = new Set(requested);
  if (floorApplies) for (const lens of RISK_LENSES) recommended.add(lens);
  return [...recommended].sort();
}

function resolveScope(priorAnchor, requestedScope) {
  if (requestedScope !== undefined && !["full", "delta"].includes(requestedScope)) fail("ARGUMENT_INVALID");
  if (priorAnchor === undefined) {
    // A delta needs an anchor to bound it; honouring the word alone would emit a full package
    // under a delta label, which is the opposite of what the caller asked for.
    if (requestedScope === "delta") fail("ARGUMENT_INVALID");
    return { kind: "full", prior_anchor: null };
  }
  if (!SHA.test(priorAnchor)) fail("ARGUMENT_INVALID");
  if (requestedScope === "full") return { kind: "full", prior_anchor: null };
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
    await readChangedContentByFile(root, range),
    await readUnscannablePaths(root, range),
  );
  const requested = normalizeLenses(input.lens);
  const coordinateBlock = { commit_or_range: range, base: coordinates.base, head: coordinates.head, source: "derived" };
  const recommended = resolveRecommendedLenses(requested, floor.applies);
  const draft = {
    mode: "inline-review",
    repository_root: root,
    coordinates: coordinateBlock,
    scope: {
      kind: scope.kind,
      prior_anchor: scope.prior_anchor,
      paths: changedSurface.map((entry) => entry.path),
      // Every path the range touched, exclusions included: a blocker naming an excluded path is
      // still inside the reviewed range and must not be demoted for being off the review surface.
      range_paths: allChanged.map((entry) => entry.path),
    },
    criteria: await bindWrittenIntent(root, coordinates.head, input.change),
    changed_surface: changedSurface,
    requested_lenses: requested,
    recommended_lenses: recommended,
    security_floor: floor,
    review_surface: verified.surface,
    read_only: true,
  };
  return {
    ...draft,
    // Every changed path proven by a green checker: a real state, not an empty change set, and
    // not a surface to dispatch lenses over.
    fully_verified: allChanged.length > 0 && changedSurface.length === 0,
  };
}

/** The verdict vocabulary is the shared contract's, not a local one. */
const VERDICTS = ["pass", "concerns", "fail", "not-run"];

/**
 * A return needs only what carries the lens's judgment: which lens, what it concluded, and
 * whether it finished. Nothing here correlates the return to a dispatch — that is the
 * coordinator's own bookkeeping, and requiring an agent to echo it back would let a missing
 * identifier discard findings the lens actually produced.
 */
function validReturn(value) {
  return object(value) &&
    LENSES.includes(value.lens) &&
    VERDICTS.includes(value.verdict) &&
    (value.findings === undefined || Array.isArray(value.findings));
}

function findingFiles(entry) {
  const files = Array.isArray(entry?.files) ? entry.files : [entry?.file];
  return files.filter((file) => typeof file === "string" && file.length > 0);
}

/**
 * Classify the shared contract's severity vocabulary for Main. `blocker` and `high` are blocker
 * candidates; the rest ride as concerns. An absent or unrecognized severity remains a blocker
 * candidate, so a malformed return cannot demote itself below the review floor.
 */
const BLOCKING_SEVERITIES = new Set(["blocker", "high"]);
const SUB_FLOOR_SEVERITIES = new Set(["medium", "low", "info"]);

export function belowFloor(entry) {
  return typeof entry?.severity === "string" && SUB_FLOOR_SEVERITIES.has(entry.severity);
}

/** A finding below the floor, or outside a delta package's range, is reported as a concern. */
export function partitionFindings(pkg, findings) {
  const inScope = new Set(pkg.scope.range_paths ?? pkg.scope.paths);
  const blockers = [];
  const concerns = [];
  for (const entry of findings) {
    const files = findingFiles(entry);
    const outside = pkg.scope.kind === "delta" && files.length > 0 && files.every((file) => !inScope.has(file));
    if (outside || belowFloor(entry)) concerns.push(entry);
    else blockers.push(entry);
  }
  return { blockers, concerns, blocking_severities: [...BLOCKING_SEVERITIES] };
}

/**
 * A finding the authored criteria anticipated closes by executing that criterion's oracle.
 * One the criteria did not anticipate is a defect in the spec, never another review pass.
 */
export function classifyCoverage(pkg, finding) {
  const criteria = Array.isArray(pkg.criteria) ? pkg.criteria : [];
  const declared = typeof finding?.criterion === "string" ? finding.criterion.toLowerCase() : null;
  if (declared === null) return { coverage: "uncovered", criterion: null, source: null };
  const texts = criteria.map((entry) => ({ entry, text: String(entry?.text ?? "").toLowerCase() })).filter((item) => item.text.length > 0);
  const exact = texts.filter((item) => item.text === declared);
  // Containment is a fallback, and only when it picks out exactly one criterion: binding a
  // finding to the first criterion that happens to share a substring names the wrong requirement.
  const candidates = exact.length > 0
    ? exact
    : texts.filter((item) => item.text.includes(declared) || declared.includes(item.text));
  if (candidates.length !== 1) return { coverage: "uncovered", criterion: null, source: null };
  const match = candidates[0].entry;
  return { coverage: "covered", criterion: match.text, source: match.source ?? null };
}

/** Disagreements a lens marked blocking. The contract makes an unresolved one non-pass. */
function blockingDisagreements(entry) {
  return (entry.disagreements ?? []).filter((item) => item?.blocking === true);
}

/**
 * Two returns for one lens do not contend: the worse outcome wins. A later benign return can
 * therefore never bury an earlier failure, and no return is ever discarded to achieve that —
 * which is what keying on identity would have cost.
 */
function worseOf(left, right) {
  if (left === null) return right;
  const rank = (entry) => {
    // An omitted lens_status is not a completed one: a lens that did not finish and simply
    // left the field out must not outrank a lens that said so.
    if (entry.lens_status !== "complete") return 3;
    if (entry.verdict !== "pass") return 2;
    if (blockingDisagreements(entry).length > 0) return 2;
    return (entry.findings ?? []).length > 0 ? 1 : 0;
  };
  return rank(right) > rank(left) ? right : left;
}

/**
 * Summarize lens evidence without deciding whether the work is ready to publish.
 *
 * Lens selection is advisory: a package can recommend risk lenses, while Main decides which
 * evidence is useful for the objective and how findings are closed. Every return remains in a
 * lens group so a later benign result cannot erase an earlier finding.
 */
export function reviewSummary(pkg, returns) {
  const observations = [];
  const byLens = new Map();
  const extra = [];
  const selected = new Set([
    ...(Array.isArray(pkg.requested_lenses) ? pkg.requested_lenses : []),
    ...(Array.isArray(pkg.recommended_lenses) ? pkg.recommended_lenses : []),
  ]);
  for (const entry of returns) {
    if (!selected.has(entry.lens)) extra.push(entry);
    const entries = byLens.get(entry.lens) ?? [];
    entries.push(entry);
    byLens.set(entry.lens, entries);
  }

  const concerns = [];
  const covered = [];
  const specDefects = [];
  const lensResults = [];
  for (const [lens, entries] of byLens) {
    const outcome = entries.reduce((current, entry) => worseOf(current, entry), null);
    const findings = entries.flatMap((entry) => entry.findings ?? []);
    const split = partitionFindings(pkg, findings);
    concerns.push(...split.concerns);
    for (const blocker of split.blockers) {
      const classified = { ...classifyCoverage(pkg, blocker), lens, finding: blocker };
      (classified.coverage === "covered" ? covered : specDefects).push(classified);
    }
    lensResults.push({ lens, outcome, returns: entries });
    for (const entry of entries) {
      // These observations describe evidence for Main; they do not hold publication by
      // themselves. An absent status is still recorded as an incomplete response.
      if (entry.lens_status !== "complete") {
        observations.push(`lens ${lens} did not finish (${entry.lens_status ?? "no lens_status"})`);
      }
      const disputed = blockingDisagreements(entry);
      if (disputed.length > 0) {
        observations.push(`lens ${lens} left ${disputed.length} blocking disagreement(s) unresolved`);
      }
      if (entry.verdict !== "pass") observations.push(`lens ${lens} returned ${entry.verdict}`);
    }
    if (split.blockers.length > 0) observations.push(`lens ${lens} returned ${split.blockers.length} blocker(s)`);
  }
  const missing = [...selected]
    .filter((lens) => !byLens.has(lens));
  for (const lens of missing) observations.push(`recommended lens ${lens} returned nothing`);
  return {
    lens_results: lensResults,
    missing,
    observations,
    concerns,
    covered,
    spec_defects: specDefects,
    unrequested: extra,
  };
}

async function readJson(target, code) {
  try {
    return JSON.parse(await readFile(target, "utf8"));
  } catch {
    return fail(code);
  }
}

async function runSummary(input) {
  const pkg = await readJson(input.package, "PACKAGE_INVALID");
  if (!object(pkg) || !Array.isArray(pkg.requested_lenses)
    || !Array.isArray(pkg.recommended_lenses) || !object(pkg.scope)) fail("PACKAGE_INVALID");
  const returns = await readJson(input.returns, "RETURNS_INVALID");
  if (!Array.isArray(returns) || returns.length > MAX_RETURNS || !returns.every(validReturn)) fail("RETURNS_INVALID");
  return { summary: reviewSummary(pkg, returns) };
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
    if (subcommand === "gate" || subcommand === "summary") {
      return result("team_harness_inline_review_summary", await runSummary(input));
    }
    return fail("ARGUMENT_INVALID");
  } catch (error) {
    const code = ERROR_CODES.has(error?.message) ? error.message : "INTERNAL_ERROR";
    const kind = subcommand === "gate" || subcommand === "summary"
      ? "team_harness_inline_review_summary"
      : "team_harness_inline_review_package";
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
  if (!["package", "gate", "summary"].includes(subcommand) || rest.length % 2 !== 0) return null;
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
  if (output.verdict !== "pass") process.exitCode = 1;
}
