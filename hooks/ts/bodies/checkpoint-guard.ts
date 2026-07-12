// hooks/ts/bodies/checkpoint-guard.ts
// Canonical body — verbatim port of hooks/checkpoint-guard.sh decision logic.
// Runtime-pure: imports no runtime symbol; reads only NormalizedInput;
// returns only NormalizedDecision. Never branches on `input.runtime`.
//
// Fail mode: FAIL-OPEN — any state-read failure → allow.
// This hook gates functional clarity, not security. Security floors are on
// an independent path. Layer-2 self-check is the fallback.
//
// Enforcement class: reasoning-checkpoint gate.
// NEVER imports hook-profile helper (enforcement floor).
//
// Note: checkpoint-guard reads the filesystem (00-state.md) and the
// ~/.claude/.team-harness.json config. These are NOT part of NormalizedInput.
// The body must read them directly via Node fs / Bun fs APIs.
// To keep the body runtime-pure in the call signature, the filesystem reads
// are abstracted behind a StateReader interface injected at entry time.
// For the CC and Bun entries, the concrete implementation uses the platform's
// native fs module. This keeps evaluate() testable without a real filesystem.

import type { NormalizedInput, NormalizedDecision } from "../shim/normalized-v1.js";

// ---------------------------------------------------------------------------
// Decision helpers
// ---------------------------------------------------------------------------

// The Bash oracle's allow() emits an explicit permissionDecision:"allow" JSON
// envelope (checkpoint-guard.sh:30-33) — it does NOT exit with empty stdout.
// "none" would diverge from that documented contract (empty stdout is a
// DIFFERENT signal — no decision at all, not an explicit allow).
function allow(): NormalizedDecision {
  return { decision: "allow", reason: "", mutations: null };
}

function deny(reason: string): NormalizedDecision {
  return { decision: "deny", reason, mutations: null };
}

// ---------------------------------------------------------------------------
// StateReader interface — injected by the entry module.
// Keeps evaluate() independent of Node/Bun fs API.
// ---------------------------------------------------------------------------

export interface StateReader {
  /** Read file content as UTF-8 string; returns null on any error. */
  readFile(path: string): string | null;
  /** List files matching name recursively up to maxDepth; return empty array on error. */
  findFiles(rootDir: string, name: string, maxDepth: number): string[];
  /** Return modification time (ms since epoch) or 0 on error. */
  mtime(path: string): number;
  /** Read ~/.claude/.team-harness.json; returns null on any error. */
  readConfig(): Record<string, unknown> | null;
  /** Current working directory (the workspace search root). */
  cwd(): string;
  /** Resolve a path to its canonical form (symlinks and ".." collapsed);
   *  returns null when the path does not exist or cannot be resolved.
   *  Used to contain TH-STATE-REF candidates (CWE-22). */
  realpath(path: string): string | null;
  /** Resolve the name of the git repository that owns the current working
   *  directory, derived from the MAIN worktree's `.git` directory (stable
   *  across `git worktree` checkouts — see docs/worktree-discipline.md).
   *  Used to scope the obsidian vault containment root to the correct
   *  `{repo}` segment regardless of which worktree is active. Returns null
   *  when cwd() is not inside a git repository or git itself is
   *  unavailable; callers fall back to legacy cwd-basename derivation. */
  gitRepoName(): string | null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Extract a field value from a 00-state.md line using strict token parsing.
 *  Matches: "- <field>: <value>" (exact token, whole line, optional surrounding whitespace).
 *  Returns the value string, or null if not found. */
function readField(content: string, field: string): string | null {
  const lines = content.split("\n");
  const prefix = new RegExp(`^\\s*-\\s*${field}:\\s*(.+?)\\s*$`);
  for (const line of lines) {
    const m = prefix.exec(line);
    if (m) return m[1]!;
  }
  return null;
}

/** Check if a field has an exact value (whole-line token parse). */
function fieldIs(content: string, field: string, value: string): boolean {
  const lines = content.split("\n");
  const pattern = new RegExp(`^\\s*-\\s*${field}:\\s*${value}\\s*$`);
  return lines.some((line) => pattern.test(line));
}

/** Filter candidates to those with non-terminal status. */
function isTerminalStatus(content: string): boolean {
  const status = readField(content, "status");
  if (status === null) return false;
  return status === "complete" || status.startsWith("blocked-");
}

// ---------------------------------------------------------------------------
// TH-STATE-REF dispatch marker — explicit state scoping (AC-4.1..4.6).
//
// A dispatching orquestador stamps its own 00-state.md path into the FIRST
// LINE of the Task dispatch prompt as `TH-STATE-REF: {path}`. This lets
// checkpoint-guard evaluate boundary B1 against the state of the pipeline
// that is actually dispatching, instead of guessing from mtime across
// however many concurrent pipelines are live (cross-fire between lanes).
// ---------------------------------------------------------------------------

/** Extract the raw TH-STATE-REF value from the CONTROLLED header of a
 *  dispatch prompt. Only the first line is trusted: content forwarded or
 *  fetched into the rest of the prompt (untrusted per CLAUDE.md §6.6) is
 *  never scanned for the marker, so a marker planted further down in the
 *  prompt cannot spoof state scoping. Returns null when the first line does
 *  not match the exact marker format. */
function extractStateRefHeader(promptText: string): string | null {
  const firstLine = promptText.split("\n", 1)[0] ?? "";
  const m = /^TH-STATE-REF:\s*(.+?)\s*$/.exec(firstLine);
  return m ? m[1]! : null;
}

function normalizeSep(p: string): string {
  return p.replace(/\\/g, "/");
}

/** True when `child` equals `root` or is nested under it, comparing on
 *  forward-slash-normalized segments so the check is platform-independent. */
function isPathWithin(child: string, root: string): boolean {
  const c = normalizeSep(child);
  const r = normalizeSep(root).replace(/\/+$/, "");
  return c === r || c.startsWith(r + "/");
}

/** Resolve the repo name used to scope the obsidian vault containment root
 *  (`{logs-path}/{logs-subfolder}/{repo}/**`). Prefers the git-derived main
 *  repo name (worktree-stable — a `th-wt-{slug}` checkout resolves to the
 *  SAME `{repo}` as the primary tree). Falls back to cwd()'s own last path
 *  segment only when git resolution is unavailable, e.g. a non-git working
 *  directory — this preserves prior behavior for that edge case rather than
 *  producing an empty repo name. */
function resolveRepoName(reader: StateReader): string {
  const gitName = reader.gitRepoName();
  if (gitName) return gitName;
  return reader.cwd().split(/[/\\]/).filter(Boolean).pop() ?? "";
}

/** The containment allowlist for TH-STATE-REF: the local workspaces subtree
 *  under cwd, plus — when logs-mode: obsidian — this repo's vault work-logs
 *  subtree (config-derived, mirroring the candidate search below). Every
 *  root is realpath-resolved so a symlinked path component cannot be used to
 *  escape it (SEC-DR-D). A root that cannot itself be resolved is omitted. */
function containmentRoots(reader: StateReader): string[] {
  const roots: string[] = [];

  const localRoot = reader.realpath(reader.cwd());
  if (localRoot !== null) roots.push(localRoot);

  const config = reader.readConfig();
  if (config !== null) {
    const logsMode = typeof config["logs-mode"] === "string" ? config["logs-mode"] : "";
    const logsPath = typeof config["logs-path"] === "string" ? config["logs-path"] : "";
    const logsSub = typeof config["logs-subfolder"] === "string" ? config["logs-subfolder"] : "work-logs";

    if (logsMode === "obsidian" && logsPath) {
      const repoName = resolveRepoName(reader);
      if (repoName) {
        const vaultRoot = `${logsPath}/${logsSub}/${repoName}`;
        const realVaultRoot = reader.realpath(vaultRoot);
        if (realVaultRoot !== null) roots.push(realVaultRoot);
      }
    }
  }

  return roots;
}

/** Resolve a TH-STATE-REF candidate to its realpath, ONLY when it falls
 *  within a containment root (CWE-22: both the candidate and the roots are
 *  realpath-resolved before comparison, so ".." segments and symlink escapes
 *  are collapsed before the check runs). Returns null on any parse, resolve,
 *  or escape failure — every failure mode here fails open to the legacy
 *  mtime selection in the caller. */
function resolveContainedStateRef(rawPath: string, reader: StateReader): string | null {
  if (!rawPath) return null;

  const realTarget = reader.realpath(rawPath);
  if (realTarget === null) return null;

  const roots = containmentRoots(reader);
  const contained = roots.some((root) => isPathWithin(realTarget, root));
  return contained ? realTarget : null;
}

// ---------------------------------------------------------------------------
// Legacy candidate search — newest-non-terminal-by-mtime (byte-identical
// fallback path when TH-STATE-REF is absent, malformed, or out of root).
// Strategy mirrors checkpoint-guard.sh:
//   1. Local workspaces/ subtree under cwd.
//   2. If logs-mode = obsidian, also search {logs-path}/{logs-subfolder}/{repo}/.
//   3. Filter out terminal-status candidates.
//   4. Select the newest non-terminal by mtime.
//   5. If none found, fail-open.
// ---------------------------------------------------------------------------

function selectByMtime(reader: StateReader): string | null {
  const searchRoot = reader.cwd();
  const rawCandidates: string[] = reader.findFiles(searchRoot, "00-state.md", 4);

  // Check obsidian mode from config.
  const config = reader.readConfig();
  if (config !== null) {
    const logsMode = typeof config["logs-mode"] === "string" ? config["logs-mode"] : "";
    const logsPath = typeof config["logs-path"] === "string" ? config["logs-path"] : "";
    const logsSub = typeof config["logs-subfolder"] === "string" ? config["logs-subfolder"] : "work-logs";

    if (logsMode === "obsidian" && logsPath) {
      // Scope to this repo's subtree to avoid scanning the whole vault.
      const repoName = resolveRepoName(reader);
      if (repoName) {
        const vaultRoot = `${logsPath}/${logsSub}/${repoName}`;
        const vaultCandidates = reader.findFiles(vaultRoot, "00-state.md", 3);
        rawCandidates.push(...vaultCandidates);
      }
    }
  }

  if (rawCandidates.length === 0) {
    // No state file found anywhere — fail-open.
    return null;
  }

  // Sort newest-first by mtime, then walk to find first non-terminal.
  const sorted = rawCandidates.slice().sort((a, b) => reader.mtime(b) - reader.mtime(a));

  for (const candidate of sorted) {
    const content = reader.readFile(candidate);
    if (content === null) continue;
    if (isTerminalStatus(content)) continue;
    // Found first active (newest) workspace.
    return content;
  }

  // All candidates are terminal — no active boundary to enforce.
  return null;
}

// ---------------------------------------------------------------------------
// Main evaluate function (with injected StateReader for testability)
// ---------------------------------------------------------------------------

export function evaluate(input: NormalizedInput, reader: StateReader): NormalizedDecision {
  // (the subagent_type is extracted from the CC payload's tool_input.subagent_type field,
  // which the shim does not expose in NormalizedInput — it is in tool.input)
  const subagentType =
    typeof input.tool?.input?.["subagent_type"] === "string"
      ? (input.tool.input["subagent_type"] as string)
      : "";
  const promptText =
    typeof input.tool?.input?.["prompt"] === "string" ? (input.tool.input["prompt"] as string) : "";

  // ---------------------------------------------------------------------------
  // Step 3 — Select the governing 00-state.md.
  // A contained TH-STATE-REF marker in the dispatch prompt's controlled
  // header wins outright (AC-4.1/4.4); any other outcome — no marker,
  // malformed marker, or a target outside both containment roots — falls
  // back to the legacy newest-non-terminal-by-mtime selection (AC-4.2/4.3).
  // ---------------------------------------------------------------------------

  const stateRefRaw = extractStateRefHeader(promptText);
  const stateRefPath = stateRefRaw !== null ? resolveContainedStateRef(stateRefRaw, reader) : null;
  const refContent = stateRefPath !== null ? reader.readFile(stateRefPath) : null;

  const stateContent = refContent !== null ? refContent : selectByMtime(reader);

  if (stateContent === null) {
    // No governing state found anywhere — fail-open.
    return allow();
  }

  // ---------------------------------------------------------------------------
  // Step 5 — Check skip markers.
  // ---------------------------------------------------------------------------

  if (fieldIs(stateContent, "fast_mode", "true")) return allow();
  if (fieldIs(stateContent, "discover_state", "bypassed")) return allow();

  // bug_tier with a numeric value (0-4) → hotfix/fix tier, skip marker.
  const bugTierLines = stateContent.split("\n");
  for (const line of bugTierLines) {
    if (/^\s*-\s*bug_tier:\s*[0-4]\s*$/.test(line)) return allow();
  }

  // ---------------------------------------------------------------------------
  // Step 6 — Read checkpoint_boundary.
  // ---------------------------------------------------------------------------

  if (fieldIs(stateContent, "checkpoint_boundary", "null")) return allow();

  // If checkpoint_boundary field is absent, treat as unarmed.
  const hasBoundaryField = stateContent
    .split("\n")
    .some((line) => /^\s*-\s*checkpoint_boundary:/.test(line));
  if (!hasBoundaryField) return allow();

  const boundaryValue = readField(stateContent, "checkpoint_boundary") ?? "";

  // ---------------------------------------------------------------------------
  // Step 7 — B1 gate: name-keyed (intake-plan boundary).
  // ---------------------------------------------------------------------------

  if (boundaryValue === "intake-plan") {
    if (subagentType !== "th:architect") {
      // Non-architect dispatch while B1 is armed → allow (Case 8).
      return allow();
    }
    // Fall through to advance-contract evaluation below.
  }

  // ---------------------------------------------------------------------------
  // Step 8 — B2/B3 gate: boundary-keyed.
  // Unknown boundary value → treat as unarmed (fail-open).
  // ---------------------------------------------------------------------------

  const knownBoundaries = new Set(["intake-plan", "research-next", "postverify-next"]);
  if (!knownBoundaries.has(boundaryValue)) {
    return allow();
  }

  // ---------------------------------------------------------------------------
  // Step 9 — Evaluate the advance contract.
  // Both conditions must hold: checkpoint_advance_fresh: true AND
  // functional_clarity_confirmed: true
  // ---------------------------------------------------------------------------

  const advanceFresh = fieldIs(stateContent, "checkpoint_advance_fresh", "true");
  const clarityConfirmed = fieldIs(stateContent, "functional_clarity_confirmed", "true");

  if (advanceFresh && clarityConfirmed) {
    return allow();
  }

  // ---------------------------------------------------------------------------
  // Step 10 — Deny: explain which condition is missing.
  // ---------------------------------------------------------------------------

  if (boundaryValue === "intake-plan") {
    if (!advanceFresh && !clarityConfirmed) {
      return deny(
        "Reasoning checkpoint not satisfied at boundary B1 (intake→plan): fresh advance signal missing and functional clarity artifact not confirmed. Respond to the planning-confirmation prompt and confirm the functional statement before the architect is dispatched."
      );
    } else if (!advanceFresh) {
      return deny(
        "Reasoning checkpoint not satisfied at boundary B1 (intake→plan): fresh advance signal missing. Respond explicitly to the planning-confirmation prompt (¿Pasamos a planeación? [plan/explorar]) before the architect is dispatched."
      );
    } else {
      return deny(
        "Reasoning checkpoint not satisfied at boundary B1 (intake→plan): functional clarity artifact not confirmed. Confirm a short functional statement (what we are building, functionally) before the architect is dispatched."
      );
    }
  }

  if (boundaryValue === "research-next") {
    if (!advanceFresh && !clarityConfirmed) {
      return deny(
        "Reasoning checkpoint not satisfied at boundary B2 (research→next): fresh advance signal missing and functional clarity artifact not confirmed. Confirm what to do with the research findings and provide a fresh advance signal before the next phase is dispatched."
      );
    } else if (!advanceFresh) {
      return deny(
        "Reasoning checkpoint not satisfied at boundary B2 (research→next): fresh advance signal missing. Respond explicitly to the checkpoint prompt before the next phase is dispatched."
      );
    } else {
      return deny(
        "Reasoning checkpoint not satisfied at boundary B2 (research→next): functional clarity artifact not confirmed. Confirm the direction for the next step based on the research findings."
      );
    }
  }

  if (boundaryValue === "postverify-next") {
    if (!advanceFresh && !clarityConfirmed) {
      return deny(
        "Reasoning checkpoint not satisfied at boundary B3 (postverify→next): fresh advance signal missing and functional clarity artifact not confirmed. Confirm direction for the next step after verification and provide a fresh advance signal."
      );
    } else if (!advanceFresh) {
      return deny(
        "Reasoning checkpoint not satisfied at boundary B3 (postverify→next): fresh advance signal missing. Respond explicitly to the checkpoint prompt before the next phase is dispatched."
      );
    } else {
      return deny(
        "Reasoning checkpoint not satisfied at boundary B3 (postverify→next): functional clarity artifact not confirmed. Confirm the direction for the next step after verification."
      );
    }
  }

  // Should not reach here (handled in Step 8), but fail-open just in case.
  return allow();
}
