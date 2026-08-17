// hooks/ts/bodies/subagent-trace.ts
// Canonical body — port of hooks/subagent-trace.sh SubagentStop breadcrumb writer.
//
// CONTRACT:
//   - NEVER emits stdout (no permissionDecision envelope).
//   - ALWAYS exits 0 (never blocks).
//   - Writes one JSONL line to 00-subagent-trace.jsonl in the active workspace.
//   - NON-SUPPRESSIBLE: the breadcrumb is NOT gated by TH_HOOK_PROFILE, matching
//     the Bash oracle (hooks/subagent-trace.sh has no profile gate at all) and
//     its own start-side twin (subagent-start.ts, also non-suppressible by
//     design). This is a pipeline-observability floor (SEC-DR-002/004/005/007),
//     not an optional notification — the mate on the other end of a start/stop
//     pair must never silently disappear because the operator lowered the hook
//     profile for a different, unrelated class of hook.
//   - Scope guard: agent_type field must start with "th:" — skip others silently.
//   - agent_id (SEC-DR-007): carried through as an opaque correlation key,
//     same as the retired Bash oracle (hooks/subagent-trace.sh Step 2/6) —
//     read from the payload and copied into the record verbatim, never
//     parsed, decoded, or used for control flow.
//
// STOP-SIDE RESIDUAL (`project` key, see subagent-start.ts): the SubagentStop
// payload carries agent_type/agent_id/stop_reason only — no prompt field —
// so this hook CANNOT read a `TH-LANE: {project-key}` marker the way the
// PreToolUse start-side breadcrumb does. `subagent.stop` records never carry
// `project`. This is a documented, permanent gap, not a TODO: the authoritative
// per-agent timing record is the orchestrator's `phase.end` event (which does
// carry `project` when the dispatching orchestrator is lane-scoped); this
// breadcrumb remains the coarse existence proof it always was. See
// docs/observability.md for the pairing rule this residual implies.
//
// The body exposes a SubagentTraceWriter interface for testability.
// The CC entry injects a real filesystem writer; tests inject a mock.
//
// IMPORTS hook-profile: NO. Despite being an observability hook, the
// breadcrumb invariant above requires it to stay outside the profile gate —
// see the CONTRACT note.

import type { NormalizedInput } from "../shim/normalized-v1.js";

// ---------------------------------------------------------------------------
// SubagentTraceWriter — injected by the entry module.
// ---------------------------------------------------------------------------

export interface SubagentTraceWriter {
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
// TRACE_FILENAME — matches the subagent-trace.sh output file.
// ---------------------------------------------------------------------------

const TRACE_FILENAME = "00-subagent-trace.jsonl";

// ---------------------------------------------------------------------------
// Agent-type scope guard: must start with "th:".
// ---------------------------------------------------------------------------

function isTHAgent(agentType: string): boolean {
  return agentType.startsWith("th:");
}

// ---------------------------------------------------------------------------
// Public writeTrace() — main body function.
// Returns null on success, error message on failure (always fail-open).
// ---------------------------------------------------------------------------

export function writeTrace(input: NormalizedInput, writer: SubagentTraceWriter): string | null {
  // Extract agent_type from the subagent stop payload.
  // SubagentStop payload: { agent_type, stop_reason, ... }
  const agentType =
    typeof input.tool?.input?.["agent_type"] === "string"
      ? (input.tool.input["agent_type"] as string)
      : "";

  // Scope guard.
  if (!agentType || !isTHAgent(agentType)) {
    return null; // not a th: agent — skip silently
  }

  const stopReason =
    typeof input.tool?.input?.["stop_reason"] === "string"
      ? (input.tool.input["stop_reason"] as string)
      : "";

  // agent_id (SEC-DR-007): opaque correlation key, read the same way as
  // agent_type/stop_reason and copied through as-is — no parsing, no decoding.
  const agentId =
    typeof input.tool?.input?.["agent_id"] === "string"
      ? (input.tool.input["agent_id"] as string)
      : "";

  const ts = writer.now();
  const cwd = writer.cwd();
  const workspace = writer.findWorkspace(cwd);
  if (workspace === null) {
    // No active workspace — skip silently (fail-open).
    return null;
  }

  // Build the JSONL record.
  const record: Record<string, string> = {
    ts,
    event: "subagent.stop",
    agent_type: agentType,
    agent_id: agentId,
    stop_reason: stopReason,
    workspace,
  };

  const jsonLine = JSON.stringify(record);
  return writer.appendLine(workspace, TRACE_FILENAME + "\0" + jsonLine);
  // NOTE: the writer.appendLine signature takes workspace + jsonLine.
  // The TRACE_FILENAME is embedded in the key to pass both to the writer.
  // See the CC entry for the real implementation.
}

// ---------------------------------------------------------------------------
// evaluateSubagentTrace() — clean interface for tests.
// Returns: null = no error (success or silently skipped), string = error msg.
// ---------------------------------------------------------------------------

export function evaluateSubagentTrace(
  input: NormalizedInput,
  writer: SubagentTraceWriter
): null | string {
  try {
    return writeTrace(input, writer);
  } catch (err: unknown) {
    // Fail-open: any unexpected exception must not crash or block.
    const msg = err instanceof Error ? err.message : String(err);
    return `subagent-trace: unexpected error (${msg})`;
  }
}
