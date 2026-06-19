// hooks/ts/entry/policy-block.cc.ts
// Claude Code (Node) entry for policy-block.
// Reads stdin → shim.inboundCC → body → shim.outboundCC → stdout + exit 0.
//
// Fail-closed direction (policy-block specific):
//   - ShimRejectError (SEC-07 violation): fail-closed → ask (unknown payload may
//     be a covered write action; the Bash oracle denies on parse failure for
//     Write/Edit/NotebookEdit). Use ask here because the caller is interactive.
//   - Unexpected body exception: ask (same rationale).
//   - Safe default (non-covered tool): none.
//
// This mirrors policy-block.sh: unknown/parse-failed → ask.

import { inboundCC, outboundCC, ShimRejectError } from "../shim/shim.js";
import { evaluate } from "../bodies/policy-block.js";
import type { NormalizedDecision } from "../shim/normalized-v1.js";

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
      // SEC-07 violation — payload too large, too deep, or polluted.
      // Fail-closed: ask the operator (parity with bash degraded path).
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
