// hooks/ts/entry/worktree-guard.cc.ts
// Claude Code (Node) entry for worktree-guard.
// Reads stdin → shim.inboundCC → body → shim.outboundCC → stdout + exit 0.
//
// Fail mode: FAIL-OPEN (parity with worktree-guard.sh).
// Any error → none (no gate action). This is an advisory hook.

import { inboundCC, outboundCC, ShimRejectError } from "../shim/shim.js";
import { evaluate } from "../bodies/worktree-guard.js";
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
    const decision = evaluate(normalized, raw);
    outboundCC(decision);
  } catch (err) {
    if (err instanceof ShimRejectError) {
      // FAIL-OPEN: advisory hook — shim rejected → none.
      const fallback: NormalizedDecision = { decision: "none", reason: "", mutations: null };
      outboundCC(fallback);
    } else {
      const fallback: NormalizedDecision = { decision: "none", reason: "", mutations: null };
      outboundCC(fallback);
    }
  }
}

main().catch(() => {
  process.exit(0);
});
