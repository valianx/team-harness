// hooks/ts/bodies/subagent-trace.ts
// Canonical body — port of hooks/subagent-trace.sh SubagentStop breadcrumb writer.
//
// CONTRACT:
//   - NEVER emits stdout (no permissionDecision envelope).
//   - ALWAYS exits 0 (never blocks).
//   - Writes one JSONL line to 00-subagent-trace.jsonl in the active workspace.
//   - Profile gate: suppressed under TH_HOOK_PROFILE=minimal (pipeline-observability class).
//   - Scope guard: agent_type field must start with "th:" — skip others silently.
//
// The body exposes a SubagentTraceWriter interface for testability.
// The CC entry injects a real filesystem writer; tests inject a mock.
//
// IMPORTS hook-profile: YES. This is an observability hook — the hook-profile
// helper is sourced ONLY by observability/notification bodies.
// (Enforcement floors: policy-block, dev-guard, gcp-guard, prepublish-guard,
//  checkpoint-guard, worktree-guard, session-start, language-user-prompt
//  MUST NOT import hook-profile.)

import { observabilityEnabled } from "./hook-profile.js";
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
  // Profile gate (pipeline-observability class).
  if (!observabilityEnabled("pipeline-observability")) {
    return null; // suppressed
  }

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
