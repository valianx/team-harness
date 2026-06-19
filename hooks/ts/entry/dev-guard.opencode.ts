// hooks/ts/entry/dev-guard.opencode.ts
// opencode (Bun) plugin entry for dev-guard.
// Exports a factory function that registers dev-guard on the opencode plugin
// event model. The pre-execution hook blocks tool calls by throwing an Error.
//
// SEC-DR-F structural barriers:
//   1. inboundOpencode returns a frozen Readonly<NormalizedInput> — the body
//      receives a readonly view and any attempted write throws in strict mode.
//   2. The body never receives a reference to opencode's native `output` object.
//   3. outboundOpencode only return (allow/none) or throws (deny/ask) — it
//      NEVER writes output.args or any field of output.
//   The non-mutation invariant is enforced by the absence of a write path.
//
// ask→throw mapping: opencode's tool.execute.before has no interactive
// operator-confirm; mapping ask→throw is fail-closed for outward/gcp gates.

import { inboundOpencode, outboundOpencode, ShimRejectError } from "../shim/shim.js";
import { evaluate } from "../bodies/dev-guard.js";

// opencode plugin hook callback signature:
//   async (input: { tool: string; args: Record<string, unknown> }, output: { args: Record<string, unknown> }) => void
// Blocking = throw an Error.
type HookCallback = (input: unknown, output: unknown) => Promise<void>;

interface DevGuardPlugin {
  hooks: {
    "tool:before": HookCallback;
  };
}

/** opencode plugin factory for dev-guard.
 *  Registers the body on 'tool:before' (maps to tool.execute.before in the
 *  opencode plugin model). Both Bash matcher and ClickUp MCP matcher are
 *  handled inside the body (evaluate() gates on toolName for ClickUp). */
export default function devGuardPlugin(): DevGuardPlugin {
  return {
    hooks: {
      "tool:before": async (input: unknown, output: unknown): Promise<void> => {
        try {
          // inboundOpencode returns frozen Readonly<NormalizedInput>.
          // output is received but NEVER passed to the body or shim outbound.
          const normalized = inboundOpencode(input, output);
          const decision = evaluate(normalized);
          // outboundOpencode reads ONLY decision.decision and decision.reason.
          // It NEVER writes output.args (structural non-mutation invariant).
          outboundOpencode(decision);
        } catch (err) {
          if (err instanceof ShimRejectError) {
            // Shim hard-rejected. Fail-closed default for dev-guard on opencode:
            // no-decision → return (allow the tool call to proceed).
            // Parity: malformed payload with no covered token → no gate action.
            return;
          }
          // Re-throw any Error the outboundOpencode threw (deny/ask → thrown).
          // This is how opencode's plugin model blocks tool execution.
          throw err;
        }
      },
    },
  };
}
