// hooks/ts/entry/worktree-guard.opencode.ts
// opencode (Bun) plugin entry for worktree-guard.
// Exports a factory that registers worktree-guard on the opencode plugin event model.
//
// Fail mode: FAIL-OPEN (parity with worktree-guard.sh).
// ShimRejectError → return (no block — advisory hook).
// outboundOpencode throwing (ask→throw) → re-throw to issue the advisory.

import { inboundOpencode, outboundOpencode, ShimRejectError } from "../shim/shim.js";
import { evaluate } from "../bodies/worktree-guard.js";

type HookCallback = (input: unknown, output: unknown) => Promise<void>;

interface WorktreeGuardPlugin {
  hooks: {
    "tool:before": HookCallback;
  };
}

export default function worktreeGuardPlugin(): WorktreeGuardPlugin {
  return {
    hooks: {
      "tool:before": async (input: unknown, output: unknown): Promise<void> => {
        try {
          const normalized = inboundOpencode(input, output);
          const decision = evaluate(normalized);
          outboundOpencode(decision);
        } catch (err) {
          if (err instanceof ShimRejectError) {
            // FAIL-OPEN: advisory hook.
            return;
          }
          // outboundOpencode threw for ask → re-throw (advisory warning).
          throw err;
        }
      },
    },
  };
}
