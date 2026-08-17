// hooks/ts/entry/gcp-guard.opencode.ts
// opencode (Bun) plugin entry for gcp-guard.
// Exports a factory that registers gcp-guard on the opencode plugin event model.
//
// SEC-DR-F structural barriers (same as dev-guard):
//   1. inboundOpencode returns frozen Readonly<NormalizedInput>.
//   2. body never receives native output object.
//   3. outboundOpencode only returns or throws — never writes output.args.
//
// ask→throw: fail-closed for outward/gcp gate (parity with gcp-guard.sh).
// ShimRejectError → throw (fail-closed: unknown payload that mentions gcloud → gate).

import { inboundOpencode, outboundOpencode, ShimRejectError } from "../shim/shim.js";
import { evaluate } from "../bodies/gcp-guard.js";

type HookCallback = (input: unknown, output: unknown) => Promise<void>;

interface GcpGuardPlugin {
  hooks: {
    "tool:before": HookCallback;
  };
}

export default function gcpGuardPlugin(): GcpGuardPlugin {
  return {
    hooks: {
      "tool:before": async (input: unknown, output: unknown): Promise<void> => {
        try {
          const normalized = inboundOpencode(input, output);
          const decision = evaluate(normalized);
          outboundOpencode(decision);
        } catch (err) {
          if (err instanceof ShimRejectError) {
            throw new Error(
              "gcp-guard: payload failed shim validation — cannot evaluate GCP safety. Manual review required (gcp-guard.opencode.ts SEC-07)."
            );
          }
          throw err;
        }
      },
    },
  };
}
