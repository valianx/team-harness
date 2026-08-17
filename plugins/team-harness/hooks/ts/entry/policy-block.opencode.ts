// hooks/ts/entry/policy-block.opencode.ts
// opencode (Bun) plugin entry for policy-block.
// Exports a factory function that registers policy-block on the opencode plugin
// event model. The pre-execution hook blocks tool calls by throwing an Error.
//
// SEC-DR-F structural barriers:
//   1. inboundOpencode returns a frozen Readonly<NormalizedInput>.
//   2. The body never receives the native `output` object.
//   3. outboundOpencode only returns (allow/none) or throws (deny/ask).
//
// ask→throw mapping: opencode has no interactive confirm. For a security gate
// (policy-block), ask→throw is fail-closed-for-covered — correct.

import { inboundOpencode, outboundOpencode, ShimRejectError } from "../shim/shim.js";
import { evaluate } from "../bodies/policy-block.js";

type HookCallback = (input: unknown, output: unknown) => Promise<void>;

interface PolicyBlockPlugin {
  hooks: {
    "tool:before": HookCallback;
  };
}

export default function policyBlockPlugin(): PolicyBlockPlugin {
  return {
    hooks: {
      "tool:before": async (input: unknown, output: unknown): Promise<void> => {
        try {
          const normalized = inboundOpencode(input, output);
          const decision = evaluate(normalized);
          outboundOpencode(decision);
        } catch (err) {
          if (err instanceof ShimRejectError) {
            // SEC-07 violation — payload validation failed.
            // Fail-closed: throw an Error to block the tool call.
            throw new Error(
              "policy-block: payload failed shim validation (size/depth/pollution guard) — cannot evaluate safety. Manual review required (policy-block.opencode.ts SEC-07)."
            );
          }
          // Re-throw any Error that outboundOpencode threw (deny/ask → thrown).
          throw err;
        }
      },
    },
  };
}
