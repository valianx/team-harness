// hooks/ts/entry/policy-block.cc.ts
// Claude Code (Node) entry for policy-block.
// Reads stdin → shim.inboundCC → body → shim.outboundCC → stdout + exit 0.
//
// Fail direction (policy-block specific, reconciled to the Bash oracle — T6c,
// hardened post-flip — T6d):
//   - ShimRejectError from unparsable JSON ("payload is not valid JSON" /
//     "payload must be a JSON object") on EMPTY stdin: fail-OPEN → none
//     (empty stdout). hooks/policy-block.sh's python3 path wraps json.loads()
//     in a bare `except Exception: sys.exit(0)` — the realistic case this
//     covers is a hook invoked with no stdin at all, and treating that as
//     `ask` would spam the operator on every no-op invocation (see lessons
//     #298/#300). This branch stays narrow to that one case.
//   - ShimRejectError from unparsable JSON on NON-EMPTY stdin: fail-CLOSED →
//     ask. A payload that is present but will not parse as JSON is
//     suspicious (truncation, tampering, a caller sending the wrong shape)
//     and gets no benefit of the doubt — the bash oracle's blanket fail-open
//     was too broad here; only the genuinely-empty case is parity-preserved.
//   - ShimRejectError from a schema/size/depth/pollution guard (oversized
//     payload, excessive nesting, __proto__ key, non-string tool.name, etc.):
//     Claude Code keeps the historical fail-closed → ask mapping. The Codex
//     adapter sets TEAM_HARNESS_CODEX_HOOK=1 and upgrades this validation
//     failure to deny: Codex cannot represent PreToolUse `ask`, so degrading a
//     deterministic safety floor to bounded context would let execution
//     continue without an operator decision.
//   - Unexpected body exception: Claude Code → ask (same fail-closed
//     rationale); Codex → deny because its adapter cannot represent ask
//     without continuing the tool call.
//   - Safe default (non-covered tool): none.

import { inboundCC, outboundCC, ShimRejectError } from "../shim/shim.js";
import { evaluate } from "../bodies/policy-block.js";
import type { NormalizedDecision } from "../shim/normalized-v1.js";

const PARSE_FAILURE_MESSAGES = [
  "SEC-07: payload is not valid JSON",
  "SEC-07: payload must be a JSON object",
];

function isParseFailure(err: ShimRejectError): boolean {
  return PARSE_FAILURE_MESSAGES.some((msg) => err.message === msg);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const raw = await readStdin();

  try {
    const normalized = inboundCC(raw);
    const decision = evaluate(normalized);
    outboundCC(decision);
  } catch (err) {
    if (process.env.TEAM_HARNESS_CODEX_HOOK === "1") {
      // Every evaluation failure is a deterministic safety-floor failure on
      // Codex, including unexpected body exceptions. Codex cannot represent
      // PreToolUse `ask`; degrading an evaluation error to bounded context
      // would let execution continue without an operator decision. The
      // launcher already rejects malformed native JSON before reaching this
      // branch; keeping the bundle itself fail-closed closes direct-entry
      // paths too.
      const fallback: NormalizedDecision = {
        decision: "deny",
        reason:
          err instanceof ShimRejectError
            ? "policy-block: payload failed shim validation — execution denied because safety could not be evaluated (policy-block.cc.ts SEC-07)."
            : "policy-block: safety evaluation failed — execution denied because policy could not be evaluated (policy-block.cc.ts).",
        mutations: null,
      };
      outboundCC(fallback);
    } else if (err instanceof ShimRejectError && isParseFailure(err)) {
      if (raw.trim().length === 0) {
        // Empty stdin — fail-open, matching the Bash oracle's silent
        // pass-through and avoiding ask-spam on no-op invocations.
        outboundCC({ decision: "none", reason: "", mutations: null });
      } else {
        // Non-empty but unparsable — fail-closed; a present payload that
        // won't parse gets no benefit of the doubt.
        const fallback: NormalizedDecision = {
          decision: "ask",
          reason:
            "policy-block: payload is non-empty but failed to parse as JSON — cannot evaluate safety. Manual review required before proceeding (policy-block.cc.ts SEC-07).",
          mutations: null,
        };
        outboundCC(fallback);
      }
    } else if (err instanceof ShimRejectError) {
      // SEC-07 shape/size/depth/pollution guard — TS-only hardening, stays
      // fail-closed. Codex has no PreToolUse `ask`; its launcher would turn
      // ask into additionalContext and continue, so a deterministic policy
      // validation failure must remain a native deny on that runtime.
      const fallback: NormalizedDecision = {
        decision: "ask",
        reason:
          "policy-block: payload failed shim validation (size/depth/pollution guard) — cannot evaluate safety. Manual review required before proceeding (policy-block.cc.ts SEC-07).",
        mutations: null,
      };
      outboundCC(fallback);
    } else {
      // Unexpected body exception — ask (fail-closed for a covered-tool path).
      const fallback: NormalizedDecision = {
        decision: "ask",
        reason:
          "policy-block: internal error during evaluation — proceeding requires manual confirmation (policy-block.cc.ts).",
        mutations: null,
      };
      outboundCC(fallback);
    }
  }
}

main().catch(() => {
  // Last-resort read/transport failure. A Codex deny-floor must still deny
  // when the wrapper fails before the inner evaluation catch can run.
  if (process.env.TEAM_HARNESS_CODEX_HOOK === "1") {
    try {
      outboundCC({
        decision: "deny",
        reason:
          "policy-block: safety evaluation failed before completion — execution denied because policy could not be evaluated (policy-block.cc.ts).",
        mutations: null,
      });
    } catch {
      // If stdout/process termination itself fails, fall through to the
      // runtime's exit path below rather than reflecting an internal error.
    }
  }
  // Claude Code last-resort: empty stdout → no-decision, exit 0.
  process.exit(0);
});
