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
//     fail-closed → ask. These are TS-only hardening with no Bash equivalent
//     (the Bash oracle never validates shape beyond the two checks above) —
//     relaxing them would be a genuine strictness regression, not a parity
//     fix, so they keep the conservative ask() default.
//   - Unexpected body exception: ask (same fail-closed rationale).
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
    if (err instanceof ShimRejectError && isParseFailure(err)) {
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
      // fail-closed (no Bash equivalent to reconcile against).
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
  // Last-resort: empty stdout → no-decision, exit 0.
  process.exit(0);
});
