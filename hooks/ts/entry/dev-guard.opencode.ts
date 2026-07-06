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
// This makes the branch-push recognizer's conservatism load-bearing on this
// runtime: `allow` proceeds silently with no human in the loop.

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execFileSync } from "node:child_process";
import { inboundOpencode, outboundOpencode, ShimRejectError } from "../shim/shim.js";
import { evaluate, type DevGuardReader } from "../bodies/dev-guard.js";
import { CONTROL_CHAR_RE } from "../bodies/prepublish-guard.js";

// opencode plugin hook callback signature:
//   async (input: { tool: string; args: Record<string, unknown> }, output: { args: Record<string, unknown> }) => void
// Blocking = throw an Error.
type HookCallback = (input: unknown, output: unknown) => Promise<void>;

interface DevGuardPlugin {
  hooks: {
    "tool:before": HookCallback;
  };
}

const GIT_EXEC_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// Real DevGuardReader — argv-fixed git exec (no shell, no input interpolation
// into a command string — CWE-78), timeout-bounded, fail-open to null.
// ---------------------------------------------------------------------------

function makeReader(): DevGuardReader {
  return {
    gitCurrentBranch(): string | null {
      try {
        return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
          encoding: "utf8",
          timeout: GIT_EXEC_TIMEOUT_MS,
        }).trim();
      } catch {
        return null;
      }
    },

    resolveDefaultBranch(): string | null {
      try {
        const out = execFileSync("git", ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], {
          encoding: "utf8",
          timeout: GIT_EXEC_TIMEOUT_MS,
        }).trim();
        if (!out) return null;
        // "origin/main" → "main".
        const idx = out.indexOf("/");
        return idx >= 0 ? out.slice(idx + 1) : out;
      } catch {
        return null;
      }
    },

    resolveEffectivePushRemoteRef(): string | null {
      try {
        // Delegates to git's own @{push} resolution instead of re-implementing
        // the branch.<n>.pushRemote / remote.pushDefault / branch.<n>.remote
        // precedence — the effective push target, not the fetch upstream.
        const out = execFileSync(
          "git",
          ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{push}"],
          { encoding: "utf8", timeout: GIT_EXEC_TIMEOUT_MS }
        ).trim();
        return out || null;
      } catch {
        return null;
      }
    },

    readConfig(): Record<string, unknown> | null {
      try {
        const configPath = path.join(os.homedir(), ".claude", ".team-harness.json");
        const raw = fs.readFileSync(configPath, "utf8");
        return JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return null;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Worktree-scope fix (payload-cwd scoping, mirrors prepublish-guard.opencode.ts):
// when the opencode tool:before input carries a top-level `cwd` field, chdir
// into it once before any git read, so the reader evaluates the pushed
// worktree — not the plugin process's own CWD. Fail-open on every fault.
// Backward-compatible: an input without a `cwd` field is a no-op.
// ---------------------------------------------------------------------------

function extractCwdFromInput(input: unknown): string {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    const cwd = (input as Record<string, unknown>)["cwd"];
    if (typeof cwd === "string") return cwd;
  }
  return "";
}

function isDirectory(dirPath: string): boolean {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

function resolveWorktreeCwd(input: unknown): void {
  const cwd = extractCwdFromInput(input);
  if (!cwd) return; // absent → backward-compat, evaluate process CWD

  if (CONTROL_CHAR_RE.test(cwd)) {
    process.stderr.write(
      "dev-guard: payload cwd contains control characters; skipping cd (fail-open)\n"
    );
    return;
  }
  if (!isDirectory(cwd)) {
    process.stderr.write("dev-guard: payload cwd does not exist as a directory; skipping cd (fail-open)\n");
    return;
  }
  try {
    process.chdir(cwd);
  } catch {
    process.stderr.write("dev-guard: cd into payload cwd failed; continuing with process CWD (fail-open)\n");
  }
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
          resolveWorktreeCwd(input);
          // inboundOpencode returns frozen Readonly<NormalizedInput>.
          // output is received but NEVER passed to the body or shim outbound.
          const normalized = inboundOpencode(input, output);
          const reader = makeReader();
          const decision = evaluate(normalized, reader);
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
