// hooks/ts/shim/normalized-v1.ts
// The versioned I/O contract every canonical hook body speaks.
// ioContract: "normalized-v1"
//
// Every body reads only this shape; the shim enforces it at both
// runtimes (Claude Code stdin / opencode callback args).
// SEC-07: absent keys are emitted as `null`, NEVER omitted.

/** Inbound: the single stable shape a body sees, regardless of runtime.
 *  Absent keys are emitted as `null`, NEVER omitted (SEC-07 invariant). */
export interface NormalizedInput {
  event:
    | "PreToolUse"
    | "SessionStart"
    | "UserPromptSubmit"
    | "SubagentStop"
    | "PreCompact"
    | "Notification"
    | "Task";
  tool: { name: string; input: Record<string, unknown> } | null;
  workspace: string | null;
  runtime: "claude-code" | "opencode";
  dataHome: string | null;
}

/** Outbound: the stable decision a body returns. The shim translates this
 *  into the runtime's native control signal. */
export interface NormalizedDecision {
  decision: "allow" | "deny" | "ask" | "none";
  /** Names the pattern CLASS for secret-scan decisions, never the captured value (CWE-200). */
  reason: string;
  /** Reserved; always null in normalized-v1. Enforced by the absence of a write path. */
  mutations: null;
}

// SEC-07 bounds documented as named constants in the versioned contract.
// The depth fixture in tests must exceed MAX_DEPTH while staying BELOW the
// engine's internal JSON.parse limit (~10000 levels), proving the HARNESS
// bound rejects — not an uncaught engine RangeError.
export const MAX_PAYLOAD_BYTES = 1_048_576; // 1 MiB
export const MAX_NESTING_DEPTH = 64;

export const IO_CONTRACT = "normalized-v1" as const;

// Allowed event values — used by the shim for schema validation.
export const VALID_EVENTS = new Set<string>([
  "PreToolUse",
  "SessionStart",
  "UserPromptSubmit",
  "SubagentStop",
  "PreCompact",
  "Notification",
  "Task",
]);
