// hooks/ts/entry/checkpoint-guard.opencode.ts
// opencode (Bun) plugin entry for checkpoint-guard.
// Exports a factory function that registers checkpoint-guard on the opencode
// plugin event model.
//
// Fail mode: FAIL-OPEN (parity with checkpoint-guard.sh).
// Any exception → return (no block). This mirrors the Bash oracle.
//
// Note: checkpoint-guard fires on Task tool calls (agent dispatch).
// In the opencode model, this maps to tool:before for tool_name === "Task".
// The body's evaluate() already filters on toolName === "Task".
//
// Config path (option b, ratified): reads .team-harness.json from the opencode
// config root, NOT os.homedir()/.claude. This makes the opencode install
// autonomous from Claude Code (P2). The opencode config root is resolved via
// resolveOpencodeConfigRoot(), which is hardened against traversal, symlink,
// and env-injection overrides (SEC-OC-R3).

import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { inboundOpencode, outboundOpencode, ShimRejectError } from "../shim/shim.js";
import { evaluate, type StateReader } from "../bodies/checkpoint-guard.js";
import { resolveOpencodeConfigRoot } from "../shim/opencode-config.js";

const GIT_EXEC_TIMEOUT_MS = 5_000;

type HookCallback = (input: unknown, output: unknown) => Promise<void>;

interface CheckpointGuardPlugin {
  hooks: {
    "tool:before": HookCallback;
  };
}

// resolveOpencodeConfigRoot is imported from ../shim/opencode-config.js
// (SEC-OC-R3 hardening shared with prepublish-guard and session-enforcement).

function makeStateReader(): StateReader {
  return {
    readFile(filePath: string): string | null {
      try {
        return fs.readFileSync(filePath, "utf8");
      } catch {
        return null;
      }
    },

    findFiles(dir: string, name: string): string[] {
      try {
        const results: string[] = [];
        const stack: string[] = [dir];
        while (stack.length > 0) {
          const current = stack.pop()!;
          let entries: fs.Dirent[];
          try {
            entries = fs.readdirSync(current, { withFileTypes: true });
          } catch {
            continue;
          }
          for (const e of entries) {
            const fullPath = path.join(current, e.name);
            if (e.isDirectory()) {
              stack.push(fullPath);
            } else if (e.name === name) {
              results.push(fullPath);
            }
          }
        }
        return results;
      } catch {
        return [];
      }
    },

    mtime(filePath: string): number | null {
      try {
        return fs.statSync(filePath).mtimeMs;
      } catch {
        return null;
      }
    },

    readConfig(): Record<string, unknown> | null {
      try {
        // Resolve config from the opencode-owned path (option b — P2 autonomy).
        // The opencode install writes .team-harness.json here; the CC install
        // writes it under ~/.claude/ (unchanged — .cc.ts entries read that path).
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

    cwd(): string {
      return typeof process !== "undefined" ? process.cwd() : "";
    },

    realpath(filePath: string): string | null {
      try {
        return fs.realpathSync(filePath);
      } catch {
        return null;
      }
    },

    // Worktree-stable repo name: derives from the MAIN repo's `.git`
    // directory (git-common-dir), not cwd()'s own last path segment — a
    // `th-wt-{slug}` worktree checkout has a basename that does NOT match
    // the repo name (docs/worktree-discipline.md).
    gitRepoName(): string | null {
      try {
        const cwd = typeof process !== "undefined" ? process.cwd() : "";
        const out = execFileSync("git", ["rev-parse", "--git-common-dir"], {
          cwd,
          encoding: "utf8",
          timeout: GIT_EXEC_TIMEOUT_MS,
          stdio: ["ignore", "pipe", "ignore"],
        }).trim();
        if (!out) return null;
        const absCommonDir = path.isAbsolute(out) ? out : path.resolve(cwd, out);
        const repoRoot = path.dirname(absCommonDir); // strip the trailing ".git" segment
        const name = path.basename(repoRoot);
        return name || null;
      } catch {
        return null;
      }
    },
  };
}

export default function checkpointGuardPlugin(): CheckpointGuardPlugin {
  return {
    hooks: {
      "tool:before": async (input: unknown, output: unknown): Promise<void> => {
        try {
          const normalized = inboundOpencode(input, output);
          const reader = makeStateReader();
          const decision = evaluate(normalized, reader);
          outboundOpencode(decision);
        } catch (err) {
          if (err instanceof ShimRejectError) {
            // FAIL-OPEN: shim rejected → return (no block).
            return;
          }
          // FAIL-OPEN: any unexpected exception → return (no block).
          // For checkpoint-guard, even outboundOpencode throwing for ask/deny
          // means we re-throw — but unexpected errors are swallowed.
          if (err instanceof Error && err.message.includes("checkpoint-guard")) {
            // This is a deliberate gate-denial from the body — re-throw to block.
            throw err;
          }
          // Other errors → fail-open.
          return;
        }
      },
    },
  };
}
