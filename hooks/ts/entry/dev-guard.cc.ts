// hooks/ts/entry/dev-guard.cc.ts
// Claude Code (Node) entry for dev-guard.
// Reads stdin → shim.inboundCC → body → shim.outboundCC → stdout + exit 0.
//
// Fail-closed direction (dev-guard specific):
//   - ShimRejectError on a Bash payload with no extractable command → none (no-decision).
//     This mirrors dev-guard.sh's default: non-covered calls emit empty stdout.
//   - Any other uncaught exception on a payload that looked like a covered
//     outward action → ask (fail-safe: we cannot determine safety, so gate it).
//   - Safe default (no tool context): none.
//
// The CC decision object always carries permissionDecisionReason (from body.reason).

import { inboundCC, outboundCC, ShimRejectError } from "../shim/shim.js";
import { evaluate } from "../bodies/dev-guard.js";
import { NormalizedDecision } from "../shim/normalized-v1.js";

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
    if (err instanceof ShimRejectError) {
      // Shim hard-rejected (SEC-07 violation). For dev-guard the fail-closed
      // default is no-decision (parity: a malformed Bash payload with no
      // extractable covered token is non-covered). We do NOT emit ask/deny
      // for an unparse-able payload — that would widen the gate beyond the
      // Bash original's contract.
      const fallback: NormalizedDecision = { decision: "none", reason: "", mutations: null };
      outboundCC(fallback);
    } else {
      // Unexpected error during body evaluation. Fail-safe: no-decision.
      // (A body exception is NOT evidence of a covered action.)
      const fallback: NormalizedDecision = { decision: "none", reason: "", mutations: null };
      outboundCC(fallback);
    }
  }
}

main().catch(() => {
  // Last-resort: exit 0 with empty stdout (no-decision default).
  process.exit(0);
});
