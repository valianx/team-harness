// hooks/ts/bodies/prepublish-guard.ts
// Canonical body — verbatim port of hooks/prepublish-guard.sh decision logic.
// Runtime-pure: imports no runtime symbol; reads only NormalizedInput;
// returns only NormalizedDecision. Never branches on `input.runtime`.
//
// Fail mode: FAIL-OPEN on every evaluation fault; NEVER emits allow.
// This is a block-on-condition / open-on-fault gate.
//
// Enforcement class: papercut gate (version-bump + tests-before-PR).
// NEVER imports hook-profile helper (enforcement floor).
//
// The body requires filesystem access (git, config reads) and stderr
// advisory writes (bump-floor WARN messages). These are abstracted
// behind a PrepublishReader interface.

import type { NormalizedInput, NormalizedDecision } from "../shim/normalized-v1.js";

// ---------------------------------------------------------------------------
// Decision helpers
// ---------------------------------------------------------------------------

function deny(reason: string): NormalizedDecision {
  return { decision: "deny", reason, mutations: null };
}

function none(): NormalizedDecision {
  return { decision: "none", reason: "", mutations: null };
}

// ---------------------------------------------------------------------------
// PrepublishReader interface — injected by the entry module.
// ---------------------------------------------------------------------------

export interface PrepublishReader {
  /** Read a local file; returns null on any error. */
  readFile(path: string): string | null;
  /** Run a command and return { stdout, exitCode }; timeout in ms. */
  runCommand(cmd: string, args: string[], timeoutMs: number): { stdout: string; exitCode: number };
  /** Check if a file exists. */
  fileExists(path: string): boolean;
  /** Read ~/.claude/.team-harness.json; returns null on any error. */
  readConfig(): Record<string, unknown> | null;
  /** git diff --name-status origin/main...HEAD; returns null on any error.
   *  For rename lines, `path` is the destination (new) path and `oldPath` is
   *  the source (old) path — both are evaluated against the shipped-asset
   *  surface (see touchesShippedPath). */
  gitDiffNameStatus(): Array<{ status: string; path: string; oldPath?: string }> | null;
  /** git show <ref>; returns null on any error. */
  gitShow(ref: string): string | null;
  /** Read a process environment variable (bump-override token sources). */
  readEnv(name: string): string | undefined;
  /** Emit a one-line advisory to stderr (never affects the decision). */
  warn(msg: string): void;
  /** JSON-escape a string (for embedding in deny reason). */
  jsonEscape(s: string): string;
}

// ---------------------------------------------------------------------------
// Regex — mirrors prepublish-guard.sh route detection and constants
// ---------------------------------------------------------------------------

// Routers are case-insensitive so this tests-before-PR floor stays in sync
// with dev-guard's case-insensitive routers — a mixed-case `GH pr create`
// (Windows/Git Bash) is enforced here too, never silently skipped. The
// boundaries around the verb also admit a glued shell metacharacter — leading
// ([\s|;&<>()`]) and trailing ([;&|<>()`"'$]) — to stay in sync with
// dev-guard: without them a metacharacter fused to the verb on either side
// (`(git push origin main)`, `true&&git push`, `git push>/dev/null`,
// `git push$(evil)`, `( git push)`) would skip this floor while dev-guard's
// own widened routers still ask — desyncing the two-hook "deny > allow"
// contract.
const GIT_PUSH_RE = /(^|[\s|;&<>()`])git(\s+-C\s+\S+|\s+\S+=\S+)*\s+push(\s|$|[;&|<>()`"'$])/i;
const GH_PR_CREATE_RE = /(^|[\s|;&<>()`])gh\s+pr\s+create(\s|$|[;&|<>()`"'$])/i;
const SHIPPED_PATH_RE = /^(agents|skills|hooks)\//;
const CLAUDE_VERSION_RE = /\*\*Current version:\*\* `([0-9]+\.[0-9]+\.[0-9]+)`/;

// Token format: bump-override: minor — <reason> (em dash, matches the Bash oracle literally).
const OVERRIDE_TOKEN_RE = /^bump-override: (minor|major) — .+$/m;

// SEC-DR-A control-char guard: reject values containing any control character.
// Excludes \x0a (newline) deliberately: the Bash oracle detects control chars
// via `grep -P '[[:cntrl:]]'`, which is line-oriented — an embedded newline is
// consumed as the line separator and is never "seen" as in-line content, so a
// value built by joining multiple sources with \n (bump-override token: commit
// message + GIT_PUSH_OPTION_* joined by \n) never trips the Bash guard on the
// join separator itself. A literal \x0a is still rejected if it appears WITHIN
// a single source value (matches grep's per-line scan of that value).
export const CONTROL_CHAR_RE = /[\x00-\x09\x0b-\x1f\x7f]/;

type SemverDelta = "major" | "minor" | "patch" | "none" | "unknown";
type ChangedFile = { status: string; path: string; oldPath?: string };

// A rename record (R*) only carries the destination path in `path`; the
// source lives in `oldPath`. A rename FROM a shipped path (agents/|skills/|
// hooks/) INTO a non-shipped location removes a public surface just as a
// plain delete does, so both sides of a rename must be checked (CodeRabbit #6).
function touchesShippedPath(c: ChangedFile): boolean {
  return SHIPPED_PATH_RE.test(c.path) || (c.oldPath !== undefined && SHIPPED_PATH_RE.test(c.oldPath));
}

// ---------------------------------------------------------------------------
// semver_delta — verbatim port of prepublish-guard.sh's awk-based comparator.
// ---------------------------------------------------------------------------

function semverDelta(oldVer: string, newVer: string): SemverDelta {
  const SEMVER_RE = /^[0-9]+\.[0-9]+\.[0-9]+$/;
  if (!SEMVER_RE.test(oldVer) || !SEMVER_RE.test(newVer)) return "unknown";

  const [oM, oMin, oP] = oldVer.split(".").map(Number);
  const [nM, nMin, nP] = newVer.split(".").map(Number);

  if (nM > oM) return "major";
  if (nM === oM && nMin > oMin) return "minor";
  if (nM === oM && nMin === oMin && nP > oP) return "patch";
  if (nM === oM && nMin === oMin && nP === oP) return "none";
  return "unknown";
}

function rankOf(level: string): number {
  switch (level) {
    case "none":
      return 0;
    case "patch":
      return 1;
    case "minor":
      return 2;
    case "major":
      return 3;
    default:
      return -1;
  }
}

// ---------------------------------------------------------------------------
// Version-site extraction — each field read is independently fail-open
// (a parse fault on one site yields "", never aborts the whole check).
// ---------------------------------------------------------------------------

function extractJsonVersion(content: string | null): string {
  if (!content) return "";
  try {
    const obj = JSON.parse(content) as Record<string, unknown>;
    return typeof obj["version"] === "string" ? obj["version"] : "";
  } catch {
    return "";
  }
}

function extractMarketVersion(content: string | null): string {
  if (!content) return "";
  try {
    const obj = JSON.parse(content) as Record<string, unknown>;
    const plugins = obj["plugins"];
    if (Array.isArray(plugins) && plugins.length > 0) {
      const first = plugins[0] as Record<string, unknown>;
      return typeof first["version"] === "string" ? first["version"] : "";
    }
    return "";
  } catch {
    return "";
  }
}

function extractClaudeVersion(content: string | null): string {
  if (!content) return "";
  const m = CLAUDE_VERSION_RE.exec(content);
  return m ? m[1] : "";
}

function isBumped(head: string, origin: string): boolean {
  if (head && origin) return head !== origin;
  if (head && !origin) return true; // new file in this branch — treat as bumped
  return false;
}

interface VersionSites {
  pluginHead: string;
  pluginOrigin: string;
  pluginBumped: boolean;
  marketHead: string;
  marketOrigin: string;
  marketBumped: boolean;
  claudeHead: string;
  claudeOrigin: string;
  claudeBumped: boolean;
}

function readVersionSites(reader: PrepublishReader): VersionSites {
  const pluginHead = extractJsonVersion(reader.readFile(".claude-plugin/plugin.json"));
  const marketHead = extractMarketVersion(reader.readFile(".claude-plugin/marketplace.json"));
  const claudeHead = extractClaudeVersion(reader.readFile("CLAUDE.md"));

  const pluginOrigin = extractJsonVersion(reader.gitShow("origin/main:.claude-plugin/plugin.json"));
  const marketOrigin = extractMarketVersion(reader.gitShow("origin/main:.claude-plugin/marketplace.json"));
  const claudeOrigin = extractClaudeVersion(reader.gitShow("origin/main:CLAUDE.md"));

  return {
    pluginHead,
    pluginOrigin,
    pluginBumped: isBumped(pluginHead, pluginOrigin),
    marketHead,
    marketOrigin,
    marketBumped: isBumped(marketHead, marketOrigin),
    claudeHead,
    claudeOrigin,
    claudeBumped: isBumped(claudeHead, claudeOrigin),
  };
}

// ---------------------------------------------------------------------------
// Bump-floor derivation — mechanical SemVer floor from the shipped-path diff.
// D/R shipped path → major; A shipped path → minor; M-only → patch.
// ---------------------------------------------------------------------------

function deriveFloor(changed: ChangedFile[]): "major" | "minor" | "patch" | "none" {
  let sawAdded = false;
  let sawRemovedOrRenamed = false;
  let sawModified = false;

  for (const c of changed) {
    if (!touchesShippedPath(c)) continue;
    const kind = c.status.charAt(0);
    if (kind === "A") sawAdded = true;
    else if (kind === "D" || kind === "R") sawRemovedOrRenamed = true;
    else sawModified = true;
  }

  if (sawRemovedOrRenamed) return "major";
  if (sawAdded) return "minor";
  if (sawModified) return "patch";
  return "none";
}

// ---------------------------------------------------------------------------
// bump-override token — read from GIT_COMMIT_MSG or GIT_PUSH_OPTION_* env vars.
// ---------------------------------------------------------------------------

function findOverrideToken(reader: PrepublishReader): boolean {
  let src = "";
  const commitMsg = reader.readEnv("GIT_COMMIT_MSG");
  if (commitMsg) src += commitMsg;

  const count = parseInt(reader.readEnv("GIT_PUSH_OPTION_COUNT") ?? "0", 10);
  if (Number.isFinite(count) && count > 0) {
    for (let i = 0; i < count; i++) {
      const opt = reader.readEnv(`GIT_PUSH_OPTION_${i}`);
      if (opt) src += `\n${opt}`;
    }
  }

  if (!src) return false;

  if (CONTROL_CHAR_RE.test(src)) {
    reader.warn(
      "prepublish-guard: bump-override source contains control characters; treating as absent (SEC-DR-A). Over-bump check proceeds."
    );
    return false;
  }

  return OVERRIDE_TOKEN_RE.test(src);
}

// ---------------------------------------------------------------------------
// No-shipped-asset early-exit path — over-bump advisory only, never blocks.
// ---------------------------------------------------------------------------

function runNoAssetAdvisory(reader: PrepublishReader, pluginOrigin: string, pluginHead: string): void {
  if (!pluginOrigin || !pluginHead) return; // fault or absent → fail-open, silent
  const actual = semverDelta(pluginOrigin, pluginHead);
  if (actual === "unknown") return;
  if (rankOf(actual) >= rankOf("minor")) {
    reader.warn(
      `prepublish-guard: WARN — no distributed asset (agents/|skills/|hooks/) changed in this diff, but the version bump is ${actual} (>= MINOR). A docs/tests/CI-only change is typically none or PATCH. Confirm the level is intentional. (advisory; push not blocked)`
    );
  }
}

// ---------------------------------------------------------------------------
// Version-site check — universal invariant, any branch. All three version
// sites must be bumped vs origin/main and mutually matching, then the
// mechanical SemVer floor applies.
// ---------------------------------------------------------------------------

function runVersionSiteCheck(
  reader: PrepublishReader,
  changed: ChangedFile[],
  sites: VersionSites
): NormalizedDecision | null {
  if (!sites.pluginBumped || !sites.marketBumped) {
    return deny(
      "prepublish-guard: a distributed asset (agents/|skills/|hooks/) changed, but all three version sites (.claude-plugin/plugin.json, .claude-plugin/marketplace.json, CLAUDE.md §3) must be bumped vs origin/main. Bump all three to the same X.Y.Z and re-push. See CLAUDE.md §6.3 and agents/delivery.md Step 9. Push blocked."
    );
  }
  // Third site: only fires when CLAUDE.md §3 was parseable at HEAD (fail-open otherwise).
  if (sites.claudeHead && !sites.claudeBumped) {
    return deny(
      "prepublish-guard: a distributed asset changed, but CLAUDE.md §3 was not bumped vs origin/main while .claude-plugin/plugin.json and .claude-plugin/marketplace.json were. Bump all three version sites to the same X.Y.Z and re-push. Push blocked."
    );
  }

  if (sites.pluginHead !== sites.marketHead) {
    return deny(
      `prepublish-guard: version sites do not match — .claude-plugin/plugin.json is '${sites.pluginHead}' but .claude-plugin/marketplace.json plugins[0].version is '${sites.marketHead}'. All version sites must be bumped to the same X.Y.Z. Push blocked.`
    );
  }
  if (sites.claudeHead && sites.pluginHead !== sites.claudeHead) {
    return deny(
      `prepublish-guard: version sites do not match — .claude-plugin/plugin.json is '${sites.pluginHead}' but CLAUDE.md §3 Current version is '${sites.claudeHead}'. All version sites must be bumped to the same X.Y.Z. Push blocked.`
    );
  }

  return runBumpFloorSubstage(reader, changed, sites.pluginOrigin, sites.pluginHead);
}

// ---------------------------------------------------------------------------
// Bump-floor sub-stage — runs after the version-site checks pass.
// ---------------------------------------------------------------------------

function warnUnderBump(reader: PrepublishReader, floor: string, actual: SemverDelta): void {
  if (floor === "major") {
    reader.warn(
      `prepublish-guard: WARN — a shipped asset was DELETED or RENAMED (removed public surface) but the version bump is ${actual}. SemVer suggests MAJOR. If the deleted/renamed file is not a public invocable surface (e.g. an internal include), ignore. (advisory; push not blocked)`
    );
  } else if (floor === "minor") {
    reader.warn(
      `prepublish-guard: WARN — a NEW shipped file was added (new invocable surface) but the version bump is ${actual}. SemVer suggests MINOR. If the new file is not a new invocable surface (e.g. a _shared include), ignore. (advisory; push not blocked)`
    );
  }
}

function resolveOverBump(reader: PrepublishReader, floor: string, actual: SemverDelta): NormalizedDecision | null {
  if (findOverrideToken(reader)) {
    reader.warn(`prepublish-guard: over-bump allowed by bump-override token (actual=${actual} floor=${floor})`);
    return null;
  }
  return deny(
    `prepublish-guard: version bump level exceeds the mechanical SemVer floor for this diff. The changed shipped paths (agents/|skills/|hooks/) only warrant a ${floor} bump, but a ${actual} was applied. If this over-bump is intentional (e.g. a fix + new surface in the same PR), add a commit trailer or push option: bump-override: ${actual} — <reason>. See CLAUDE.md §6.3 and agents/delivery.md Step 9. Push blocked.`
  );
}

function runBumpFloorSubstage(
  reader: PrepublishReader,
  changed: ChangedFile[],
  pluginOrigin: string,
  pluginHead: string
): NormalizedDecision | null {
  const floor = deriveFloor(changed);
  const actual = semverDelta(pluginOrigin, pluginHead);

  if (actual === "unknown") {
    reader.warn(
      `prepublish-guard: version not X.Y.Z (old=${pluginOrigin} new=${pluginHead}); skipping bump-floor check`
    );
    return null;
  }

  const rankActual = rankOf(actual);
  const rankFloor = rankOf(floor);

  if (rankActual < rankFloor) warnUnderBump(reader, floor, actual);
  if (rankActual > rankFloor) return resolveOverBump(reader, floor, actual);

  return null; // actual >= floor and not over-bumped — silent pass
}

// ---------------------------------------------------------------------------
// Check 1 — version-bump guard (git push)
// ---------------------------------------------------------------------------

function runVersionBumpCheck(reader: PrepublishReader): NormalizedDecision | null {
  // Generic safety: if .claude-plugin/plugin.json does not exist, not a team-harness repo.
  if (!reader.fileExists(".claude-plugin/plugin.json")) {
    return null; // no-op
  }

  // Compute the diff once — reused by the no-asset advisory and the bump-floor sub-stage.
  const changed = reader.gitDiffNameStatus();
  if (changed === null) {
    return null; // preflight/diff fault → fail-open
  }

  const touchesAssets = changed.some(touchesShippedPath);
  if (!touchesAssets) {
    const pluginHead = extractJsonVersion(reader.readFile(".claude-plugin/plugin.json"));
    const pluginOrigin = extractJsonVersion(reader.gitShow("origin/main:.claude-plugin/plugin.json"));
    runNoAssetAdvisory(reader, pluginOrigin, pluginHead);
    return null;
  }

  const sites = readVersionSites(reader);
  return runVersionSiteCheck(reader, changed, sites);
}

// ---------------------------------------------------------------------------
// Check 2 — tests-not-broken guard (gh pr create)
// ---------------------------------------------------------------------------

function runPrepublishCheck(reader: PrepublishReader): NormalizedDecision | null {
  const config = reader.readConfig();
  if (config === null) return null; // no config → no-op

  const checkCmd = typeof config["prepublish_check"] === "string" ? config["prepublish_check"] : "";
  if (!checkCmd) return null; // undeclared → no-op

  // SEC-DR-A control-char guard.
  if (CONTROL_CHAR_RE.test(checkCmd)) {
    // Value contains control chars; treat as undeclared (fail-open).
    return null;
  }

  // Execute the declared command under a 90s budget via bash -lc.
  const result = reader.runCommand("bash", ["-lc", checkCmd], 90_000);
  const rc = result.exitCode;

  if (rc === 0) return null; // tests passed → no-op

  // Internal-timeout (124) or command-not-found (127) → guard fault → fail-open.
  if (rc === 124 || rc === 127) return null;

  // Non-zero exit (other than 124/127) → BLOCK.
  // The deny reason embeds the command JSON-escaped (SDR-PPG-01).
  // Captured test stdout/stderr is NEVER placed in the reason (CWE-209).
  const escapedCmd = reader.jsonEscape(checkCmd);
  return deny(
    `prepublish-guard: the declared prepublish_check failed (exit ${rc}). Command: ${escapedCmd}. Fix the failing tests before opening the PR, or clear the prepublish_check key to bypass. PR creation blocked.`
  );
}

// ---------------------------------------------------------------------------
// Public evaluate function (with injected PrepublishReader for testability)
// ---------------------------------------------------------------------------

export function evaluate(input: NormalizedInput, reader: PrepublishReader): NormalizedDecision {
  const cmd = typeof input.tool?.input?.["command"] === "string"
    ? (input.tool.input["command"] as string)
    : "";

  if (!cmd) return none();

  const isGitPush = GIT_PUSH_RE.test(cmd);
  const isGhPrCreate = GH_PR_CREATE_RE.test(cmd);

  if (!isGitPush && !isGhPrCreate) return none();

  if (isGitPush) {
    const result = runVersionBumpCheck(reader);
    return result ?? none();
  }

  if (isGhPrCreate) {
    const result = runPrepublishCheck(reader);
    return result ?? none();
  }

  return none();
}
