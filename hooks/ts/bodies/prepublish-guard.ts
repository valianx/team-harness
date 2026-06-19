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
// The body requires filesystem access (git, config reads).
// These are abstracted behind a PrepublishReader interface.

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
  /** git diff --name-only origin/main...HEAD; returns null on any error. */
  gitDiffOriginMain(): string[] | null;
  /** git show origin/main:<path>; returns null on any error. */
  gitShow(ref: string): string | null;
  /** JSON-escape a string (for embedding in deny reason). */
  jsonEscape(s: string): string;
}

// ---------------------------------------------------------------------------
// Regex — mirrors prepublish-guard.sh route detection
// ---------------------------------------------------------------------------

const GIT_PUSH_RE = /(^|[\s|;`])git(\s+-C\s+\S+|\s+\S+=\S+)*\s+push(\s|$)/;
const GH_PR_CREATE_RE = /(^|[\s|;`])gh\s+pr\s+create(\s|$)/;

// SEC-DR-A control-char guard: reject values containing any control character.
const CONTROL_CHAR_RE = /[\x00-\x1f\x7f]/;

// ---------------------------------------------------------------------------
// Check 1 — version-bump guard (git push)
// ---------------------------------------------------------------------------

function runVersionBumpCheck(reader: PrepublishReader): NormalizedDecision | null {
  // Generic safety: if .claude-plugin/plugin.json does not exist, not a team-harness repo.
  if (!reader.fileExists(".claude-plugin/plugin.json")) {
    return null; // no-op
  }

  // Compute the diff. A git diff error → fail-open.
  const changed = reader.gitDiffOriginMain();
  if (changed === null) {
    return null; // fault → fail-open
  }

  // If no distributed assets changed, Check 1 passes.
  const touchesAssets = changed.some((f) => /^(agents|skills|hooks)\//.test(f));
  if (!touchesAssets) {
    return null; // no-op
  }

  // Read HEAD versions.
  const pluginContent = reader.readFile(".claude-plugin/plugin.json");
  const marketContent = reader.readFile(".claude-plugin/marketplace.json");

  let pluginHead = "";
  let marketHead = "";

  if (pluginContent) {
    try {
      const obj = JSON.parse(pluginContent) as Record<string, unknown>;
      pluginHead = typeof obj["version"] === "string" ? obj["version"] : "";
    } catch {
      // fault → fail-open
      return null;
    }
  } else {
    return null; // fault → fail-open
  }

  if (marketContent) {
    try {
      const obj = JSON.parse(marketContent) as Record<string, unknown>;
      const plugins = obj["plugins"];
      if (Array.isArray(plugins) && plugins.length > 0) {
        const first = plugins[0] as Record<string, unknown>;
        marketHead = typeof first["version"] === "string" ? first["version"] : "";
      }
    } catch {
      return null; // fault → fail-open
    }
  } else {
    return null; // fault → fail-open
  }

  // Read origin/main versions.
  const pluginOriginJson = reader.gitShow("origin/main:.claude-plugin/plugin.json");
  let pluginOrigin = "";
  if (pluginOriginJson !== null) {
    try {
      const obj = JSON.parse(pluginOriginJson) as Record<string, unknown>;
      pluginOrigin = typeof obj["version"] === "string" ? obj["version"] : "";
    } catch {
      return null;
    }
  }

  const marketOriginJson = reader.gitShow("origin/main:.claude-plugin/marketplace.json");
  let marketOrigin = "";
  if (marketOriginJson !== null) {
    try {
      const obj = JSON.parse(marketOriginJson) as Record<string, unknown>;
      const plugins = obj["plugins"];
      if (Array.isArray(plugins) && plugins.length > 0) {
        const first = plugins[0] as Record<string, unknown>;
        marketOrigin = typeof first["version"] === "string" ? first["version"] : "";
      }
    } catch {
      return null;
    }
  }

  // Evaluate: both versions must be non-empty AND changed vs origin/main.
  const pluginBumped =
    (pluginHead && pluginOrigin && pluginHead !== pluginOrigin) ||
    (pluginHead && !pluginOrigin); // new file in branch

  const marketBumped =
    (marketHead && marketOrigin && marketHead !== marketOrigin) ||
    (marketHead && !marketOrigin);

  if (!pluginBumped || !marketBumped) {
    return deny(
      'prepublish-guard: distributed assets (agents/|skills/|hooks/) changed but the plugin version was not bumped. Bump "version" in BOTH .claude-plugin/plugin.json AND .claude-plugin/marketplace.json (matched semver) in this push, or the marketplace serves nothing (CLAUDE.md §6.3). Push blocked.'
    );
  }

  return null; // Check 1 passed
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
