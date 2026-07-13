// hooks/ts/entry/dev-guard.cc.ts
// Claude Code (Node) entry for dev-guard.
// Reads stdin → resolve worktree-scope cwd → shim.inboundCC → body (with real
// DevGuardReader) → shim.outboundCC → stdout + exit 0.
//
// Fail-closed direction (dev-guard specific):
//   - ShimRejectError on a Bash payload with no extractable command → none (no-decision).
//     This mirrors dev-guard.sh's default: non-covered calls emit empty stdout.
//   - Any other uncaught exception on a payload that looked like a covered
//     outward action → none (fail-safe: a body exception is not evidence of
//     a covered action; the body itself fails closed to `ask` internally for
//     every covered branch it does reach).
//   - Safe default (no tool context): none.
//
// The CC decision object always carries permissionDecisionReason (from body.reason).

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execFileSync } from "node:child_process";
import { inboundCC, outboundCC, ShimRejectError } from "../shim/shim.js";
import { evaluate, type DevGuardReader } from "../bodies/dev-guard.js";
import { CONTROL_CHAR_RE } from "../bodies/prepublish-guard.js";
import { NormalizedDecision } from "../shim/normalized-v1.js";

const GIT_EXEC_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// Real DevGuardReader — argv-fixed git exec (no shell, no input interpolation
// into a command string — CWE-78), timeout-bounded, fail-open to null.
// ---------------------------------------------------------------------------

// Task-6 (AC-6.1) — when `dir` is given (the `git -C {dir} push` closed
// form), every git read below is scoped to THAT directory via Node's `cwd`
// exec option, never a shell `-C` argument (no injection surface regardless
// of dir's content — `cwd` is a filesystem path resolved by the OS, not
// shell-interpreted). A dir that does not exist or is not a git repo simply
// fails the exec (caught below) → null → the body fails closed to `ask`
// (never a silent allow on an unresolvable target).
function makeReader(): DevGuardReader {
  return {
    gitCurrentBranch(dir?: string): string | null {
      try {
        return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
          encoding: "utf8",
          timeout: GIT_EXEC_TIMEOUT_MS,
          ...(dir !== undefined ? { cwd: dir } : {}),
        }).trim();
      } catch {
        return null;
      }
    },

    resolveDefaultBranch(dir?: string): string | null {
      try {
        const out = execFileSync("git", ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], {
          encoding: "utf8",
          timeout: GIT_EXEC_TIMEOUT_MS,
          ...(dir !== undefined ? { cwd: dir } : {}),
        }).trim();
        if (!out) return null;
        // "origin/main" → "main".
        const idx = out.indexOf("/");
        return idx >= 0 ? out.slice(idx + 1) : out;
      } catch {
        return null;
      }
    },

    resolveEffectivePushRemoteRef(dir?: string): string | null {
      try {
        // Delegates to git's own @{push} resolution instead of re-implementing
        // the branch.<n>.pushRemote / remote.pushDefault / branch.<n>.remote
        // precedence — the effective push target, not the fetch upstream.
        const out = execFileSync(
          "git",
          ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{push}"],
          {
            encoding: "utf8",
            timeout: GIT_EXEC_TIMEOUT_MS,
            ...(dir !== undefined ? { cwd: dir } : {}),
          }
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

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

// ---------------------------------------------------------------------------
// Worktree-scope fix (payload-cwd scoping, mirrors prepublish-guard.cc.ts):
// when the payload carries a top-level `cwd` field, chdir into it once before
// any git read, so the reader evaluates the pushed worktree — not the hook
// process's own CWD. Fail-open on every fault.
// ---------------------------------------------------------------------------

function extractCwdFromRaw(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const cwd = (parsed as Record<string, unknown>)["cwd"];
      if (typeof cwd === "string") return cwd;
    }
  } catch {
    // Unparsable payload — cwd resolution is best-effort; the shim separately
    // handles the malformed-payload contract downstream.
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

function resolveWorktreeCwd(raw: string): void {
  const cwd = extractCwdFromRaw(raw);
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

async function main(): Promise<void> {
  const raw = await readStdin();
  resolveWorktreeCwd(raw);
  const reader = makeReader();

  try {
    const normalized = inboundCC(raw);
    const decision = evaluate(normalized, reader);
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
