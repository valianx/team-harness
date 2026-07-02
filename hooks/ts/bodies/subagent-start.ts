// hooks/ts/bodies/subagent-start.ts
// Canonical body — PreToolUse breadcrumb writer, the start-side twin of
// hooks/ts/bodies/subagent-trace.ts (SubagentStop). First hook authored
// under Decision A (CLAUDE.md §6.3) with no Bash body — TS is the single
// source, not a port.
//
// CONTRACT:
//   - NEVER emits stdout (no permissionDecision envelope — this hook never
//     gates the Task dispatch, it only observes it).
//   - ALWAYS exits 0 (never blocks).
//   - Writes one JSONL line to 00-subagent-trace.jsonl in the active workspace.
//   - Scope guard: subagent_type field must start with "th:" — skip others silently.
//
// NON-SUPPRESSIBLE BY DESIGN: unlike the stop-side TS body, this module does
// NOT import hook-profile / observabilityEnabled. hooks/subagent-trace.sh
// documents the breadcrumb as a deterministic floor that TH_HOOK_PROFILE must
// never erase; the start-side breadcrumb inherits that same invariant.
//
// Fired on PreToolUse (matcher: Task) — BEFORE the subagent boundary exists.
// The CC payload carries the requested subagent_type but no agent_id yet
// (agent_id is assigned by the runtime and only observable at SubagentStop),
// so the emitted record omits agent_id.

import type { NormalizedInput } from "../shim/normalized-v1.js";

// ---------------------------------------------------------------------------
// SubagentStartWriter — injected by the entry module.
// ---------------------------------------------------------------------------

export interface SubagentStartWriter {
  /** Append a JSONL line to the trace file. Returns null on success, error message on failure. */
  appendLine(workspacePath: string, jsonLine: string): string | null;
  /** Locate the active workspace directory. Returns null if not found. */
  findWorkspace(cwd: string): string | null;
  /** Return current ISO-8601 timestamp. */
  now(): string;
  /** Current working directory. */
  cwd(): string;
}

// ---------------------------------------------------------------------------
// TRACE_FILENAME — same sink as the SubagentStop breadcrumb.
// ---------------------------------------------------------------------------

const TRACE_FILENAME = "00-subagent-trace.jsonl";

// ---------------------------------------------------------------------------
// Agent-type scope guard: must start with "th:".
// ---------------------------------------------------------------------------

function isTHAgent(subagentType: string): boolean {
  return subagentType.startsWith("th:");
}

// ---------------------------------------------------------------------------
// Public writeStart() — main body function.
// Returns null on success or silent skip, error message on failure (always fail-open).
// ---------------------------------------------------------------------------

export function writeStart(input: NormalizedInput, writer: SubagentStartWriter): string | null {
  // Extract subagent_type from the Task tool_input payload.
  const subagentType =
    typeof input.tool?.input?.["subagent_type"] === "string"
      ? (input.tool.input["subagent_type"] as string)
      : "";

  // Scope guard.
  if (!subagentType || !isTHAgent(subagentType)) {
    return null; // not a th: dispatch — skip silently
  }

  const workspace = writer.findWorkspace(writer.cwd());
  if (workspace === null) {
    // No active workspace — skip silently (fail-open).
    return null;
  }

  // Build the JSONL record — matches AC-1's exact field set.
  const record: Record<string, string> = {
    ts: writer.now(),
    event: "subagent.start",
    agent_type: subagentType,
  };

  const jsonLine = JSON.stringify(record);
  return writer.appendLine(workspace, TRACE_FILENAME + "\0" + jsonLine);
  // NOTE: appendLine's signature takes workspace + jsonLine. TRACE_FILENAME is
  // embedded ahead of a NUL separator to pass both in one string; see the CC
  // entry for the real writer implementation.
}

// ---------------------------------------------------------------------------
// evaluateSubagentStart() — clean interface for tests.
// Returns: null = no error (success or silently skipped), string = error msg.
// ---------------------------------------------------------------------------

export function evaluateSubagentStart(
  input: NormalizedInput,
  writer: SubagentStartWriter
): null | string {
  try {
    return writeStart(input, writer);
  } catch (err: unknown) {
    // Fail-open: any unexpected exception must not crash or block the dispatch.
    const msg = err instanceof Error ? err.message : String(err);
    return `subagent-start: unexpected error (${msg})`;
  }
}
