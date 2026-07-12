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
//
// project key (TH-LANE marker): when the dispatching agent stamps a
// `TH-LANE: {project-key}` line into the FIRST LINE of the dispatch prompt,
// this hook stamps a `project` field on the breadcrumb. Only the first line
// is trusted, mirroring checkpoint-guard's TH-STATE-REF controlled-header
// parse: content forwarded or fetched into the rest of the prompt is
// untrusted per CLAUDE.md §6.6, so a marker planted lower in the prompt
// cannot smuggle a project key onto the breadcrumb. Charset/length are
// bounded (PROJECT_KEY_RE) before the value ever reaches the JSONL sink — an
// out-of-shape marker is treated as absent, never written raw. Marker
// absent, invalid, or not on the first line → `project` is omitted and
// readers fall back to file-order pairing (backward-compat, see
// docs/observability.md). PreToolUse is the ONLY breadcrumb able to read
// this marker — subagent-trace.ts (SubagentStop) has no prompt in its
// payload; see that file's header comment for the stop-side residual.

import type { NormalizedInput } from "../shim/normalized-v1.js";

// ---------------------------------------------------------------------------
// project key extraction — TH-LANE marker (charset/length bounded, AC-5.4;
// first-line-only, mirrors checkpoint-guard's extractStateRefHeader)
// ---------------------------------------------------------------------------

const PROJECT_KEY_RE = /^[a-z0-9-]{1,60}$/;
const TH_LANE_MARKER_RE = /^TH-LANE:\s*(\S+)/;

/** Extract and bound-check the project key from the CONTROLLED HEADER (first
 *  line only) of a dispatch prompt. A marker appearing anywhere else in the
 *  prompt is untrusted content, not the dispatcher's own header, and is
 *  never scanned. Returns the key when the marker is present on the first
 *  line AND the captured value fits the charset/length bound; returns null
 *  otherwise (marker absent, not on the first line, or present but
 *  out-of-shape — every case omits `project`, never writes it unbounded). */
function extractProjectKey(prompt: string): string | null {
  const firstLine = prompt.split("\n", 1)[0] ?? "";
  const match = TH_LANE_MARKER_RE.exec(firstLine);
  if (match === null) return null;
  const candidate = match[1] ?? "";
  return PROJECT_KEY_RE.test(candidate) ? candidate : null;
}

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

  // Build the JSONL record — matches AC-1's exact field set, plus the
  // optional `project` key (AC-5.1/5.3/5.4).
  const record: Record<string, string> = {
    ts: writer.now(),
    event: "subagent.start",
    agent_type: subagentType,
  };

  const prompt =
    typeof input.tool?.input?.["prompt"] === "string"
      ? (input.tool.input["prompt"] as string)
      : "";
  const projectKey = extractProjectKey(prompt);
  if (projectKey !== null) {
    record["project"] = projectKey;
  }

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
