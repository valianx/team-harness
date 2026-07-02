// hooks/ts/entry/prepublish-guard.opencode.ts
// opencode (Bun) plugin entry for prepublish-guard.
// Fail mode: fail-closed-for-covered (deny blocks; shim errors → ask/throw).
//
// Config path (option b, ratified): reads .team-harness.json from the opencode
// config root, NOT os.homedir()/.claude. This makes the opencode install
// autonomous from Claude Code (P2). The opencode config root is resolved via
// resolveOpencodeConfigRoot(), which is hardened against traversal, symlink,
// and env-injection overrides (SEC-OC-R3).
//
// IMPORTANT: Check 1 (version-bump floor) is config-independent and fail-closed
// — it does NOT depend on the config path. Only the prepublish_check key read
// is moved to the opencode config root.

import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { inboundOpencode, outboundOpencode, ShimRejectError } from "../shim/shim.js";
import { evaluate, type PrepublishReader, CONTROL_CHAR_RE } from "../bodies/prepublish-guard.js";
import { resolveOpencodeConfigRoot } from "../shim/opencode-config.js";

type HookCallback = (input: unknown, output: unknown) => Promise<void>;

interface PrepublishGuardPlugin {
  hooks: {
    "tool:before": HookCallback;
  };
}

// resolveOpencodeConfigRoot is imported from ../shim/opencode-config.js
// (SEC-OC-R3 hardening shared with checkpoint-guard and session-enforcement).

function makeReader(): PrepublishReader {
  return {
    readFile(filePath: string): string | null {
      try {
        return fs.readFileSync(filePath, "utf8");
      } catch {
        return null;
      }
    },

    runCommand(cmd: string, args: string[], timeoutMs: number): { stdout: string; exitCode: number } {
      try {
        const stdout = execFileSync(cmd, args, { timeout: timeoutMs, encoding: "utf8" });
        return { stdout, exitCode: 0 };
      } catch (err: unknown) {
        if (err && typeof err === "object" && "status" in err) {
          const e = err as { status?: number; stdout?: string };
          return { stdout: String(e.stdout ?? ""), exitCode: e.status ?? 1 };
        }
        if (err && typeof err === "object" && "code" in err) {
          const e = err as { code?: string };
          if (e.code === "ETIMEDOUT") return { stdout: "", exitCode: 124 };
        }
        return { stdout: "", exitCode: 1 };
      }
    },

    fileExists(filePath: string): boolean {
      try {
        fs.accessSync(filePath);
        return true;
      } catch {
        return false;
      }
    },

    readConfig(): Record<string, unknown> | null {
      try {
        // Resolve config from the opencode-owned path (option b — P2 autonomy).
        // The opencode install writes .team-harness.json here; the CC install
        // writes it under ~/.claude/ (unchanged — .cc.ts entries read that path).
        //
        // NOTE: Check 1 (version-bump floor) is config-independent and remains
        // fail-closed — it does NOT depend on this config path. Only the
        // prepublish_check key read is moved to the opencode root (SEC-OC-R3).
        const configRoot = resolveOpencodeConfigRoot();
        if (!configRoot) {
          return null;
        }
        const configPath = path.join(configRoot, ".team-harness.json");
        const raw = fs.readFileSync(configPath, "utf8");
        return JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return null;
      }
    },

    gitDiffNameStatus(): Array<{ status: string; path: string; oldPath?: string }> | null {
      try {
        const out = execFileSync("git", ["diff", "--name-status", "origin/main...HEAD"], {
          encoding: "utf8",
          env: { ...process.env, MSYS_NO_PATHCONV: "1" },
        });
        return out
          .split("\n")
          .filter((line) => line.trim().length > 0)
          .map((line) => {
            const fields = line.split("\t");
            const status = fields[0] ?? "";
            // Rename lines (R<score>\told\tnew) carry the source path second-to-
            // last and the destination path last; both are surfaced so the body
            // can evaluate the shipped-asset surface on either side of the move.
            const isRename = fields.length > 2;
            const filePath = isRename ? fields[fields.length - 1] : fields[1] ?? "";
            const oldPath = isRename ? fields[fields.length - 2] : undefined;
            return { status, path: filePath, oldPath };
          });
      } catch {
        return null;
      }
    },

    gitShow(ref: string): string | null {
      try {
        return execFileSync("git", ["show", ref], {
          encoding: "utf8",
          env: { ...process.env, MSYS_NO_PATHCONV: "1" },
        });
      } catch {
        return null;
      }
    },

    gitCurrentBranch(): string | null {
      try {
        return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" }).trim();
      } catch {
        return null;
      }
    },

    readEnv(name: string): string | undefined {
      return process.env[name];
    },

    warn(msg: string): void {
      process.stderr.write(msg + "\n");
    },

    jsonEscape(s: string): string {
      return JSON.stringify(s);
    },
  };
}

// ---------------------------------------------------------------------------
// Worktree-scope fix (#411 parity): when the opencode tool:before input
// carries a top-level `cwd` field, chdir into it once before any git/file
// read, so Check 1 and Check 2 evaluate the pushed worktree — not the plugin
// process's own CWD. Mirrors prepublish-guard.cc.ts's resolveWorktreeCwd
// exactly (fail-open on every fault). Backward-compatible: an input without
// a `cwd` field is a no-op — the process CWD is evaluated as before.
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
      "prepublish-guard: payload cwd contains control characters; skipping cd (SEC-DR-A, fail-open)\n"
    );
    return;
  }
  if (!isDirectory(cwd)) {
    process.stderr.write("prepublish-guard: payload cwd does not exist as a directory; skipping cd (fail-open)\n");
    return;
  }
  try {
    process.chdir(cwd);
  } catch {
    process.stderr.write("prepublish-guard: cd into payload cwd failed; continuing with process CWD (fail-open)\n");
  }
}

export default function prepublishGuardPlugin(): PrepublishGuardPlugin {
  return {
    hooks: {
      "tool:before": async (input: unknown, output: unknown): Promise<void> => {
        try {
          resolveWorktreeCwd(input);
          const normalized = inboundOpencode(input, output);
          const reader = makeReader();
          const decision = evaluate(normalized, reader);
          outboundOpencode(decision);
        } catch (err) {
          if (err instanceof ShimRejectError) {
            // Fail-closed for a potential covered action (git push / gh pr create).
            // Note: dev-guard.sh also gates gh pr create as an outward action
            // requiring explicit operator approval (unconditional, SEC-DR-2).
            throw new Error(
              "prepublish-guard: payload failed shim validation — cannot evaluate safety. Manual review required (prepublish-guard.opencode.ts SEC-07)."
            );
          }
          throw err;
        }
      },
    },
  };
}
