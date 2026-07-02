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
// Main evaluate function (with injected StateReader for testability)
// ---------------------------------------------------------------------------

export function evaluate(input: NormalizedInput, reader: StateReader): NormalizedDecision {
  void input; // checkpoint-guard gates on Task tool; subagent_type from input is not used here
  // (the subagent_type is extracted from the CC payload's tool_input.subagent_type field,
  // which the shim does not expose in NormalizedInput — it is in tool.input)
  const subagentType =
    typeof input.tool?.input?.["subagent_type"] === "string"
      ? (input.tool.input["subagent_type"] as string)
      : "";

  // ---------------------------------------------------------------------------
  // Step 3 — Locate 00-state.md candidates.
  // Strategy mirrors checkpoint-guard.sh:
  //   1. Local workspaces/ subtree under cwd.
  //   2. If logs-mode = obsidian, also search {logs-path}/{logs-subfolder}/{repo}/.
  //   3. Filter out terminal-status candidates.
  //   4. Select the newest non-terminal by mtime.
  //   5. If none found, fail-open.
  // ---------------------------------------------------------------------------

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
      const repoName = searchRoot.split(/[/\\]/).filter(Boolean).pop() ?? "";
      if (repoName) {
        const vaultRoot = `${logsPath}/${logsSub}/${repoName}`;
        const vaultCandidates = reader.findFiles(vaultRoot, "00-state.md", 3);
        rawCandidates.push(...vaultCandidates);
      }
    }
  }

  if (rawCandidates.length === 0) {
    // No state file found anywhere — fail-open.
    return allow();
  }

  // Sort newest-first by mtime, then walk to find first non-terminal.
  const sorted = rawCandidates.slice().sort((a, b) => reader.mtime(b) - reader.mtime(a));

  let stateContent: string | null = null;
  for (const candidate of sorted) {
    const content = reader.readFile(candidate);
    if (content === null) continue;
    if (isTerminalStatus(content)) continue;
    // Found first active (newest) workspace.
    stateContent = content;
    break;
  }

  if (stateContent === null) {
    // All candidates are terminal — no active boundary to enforce. Fail-open.
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
