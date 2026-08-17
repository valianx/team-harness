// hooks/ts/entry/gate-guard.opencode.ts
// opencode (Bun) plugin entry for gate-guard.
// Fail mode: fail-closed-for-covered (deny/ask both throw, per outboundOpencode).
// gate-guard never emits ask (decision set is {none, deny}), so this entry
// only ever throws on a genuine deny — the same fail-closed mapping already
// used by prepublish-guard.opencode.ts for its own deny-class decisions.
//
// Config path (option b, ratified): reads .team-harness.json from the
// opencode config root, NOT os.homedir()/.claude — same rationale as
// prepublish-guard.opencode.ts / checkpoint-guard.opencode.ts (P2 autonomy
// from the Claude Code install). Hardened via resolveOpencodeConfigRoot()
// (SEC-OC-R3: traversal/symlink/env-injection resistant).

import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { inboundOpencode, outboundOpencode, ShimRejectError } from "../shim/shim.js";
import { evaluate, type GateGuardReader } from "../bodies/gate-guard.js";
import { CONTROL_CHAR_RE } from "../bodies/prepublish-guard.js";
import { resolveOpencodeConfigRoot } from "../shim/opencode-config.js";

const GIT_EXEC_TIMEOUT_MS = 5_000;

type HookCallback = (input: unknown, output: unknown) => Promise<void>;

interface GateGuardPlugin {
  hooks: {
    "tool:before": HookCallback;
  };
}

function currentCwd(): string {
  return typeof process !== "undefined" ? process.cwd() : "";
}

// ---------------------------------------------------------------------------
// Real GateGuardReader — reads from the live filesystem / git.
// ---------------------------------------------------------------------------

function makeReader(): GateGuardReader {
  return {
    readFile(filePath: string): string | null {
      try {
        return fs.readFileSync(filePath, "utf8");
      } catch {
        return null;
      }
    },

    findFiles(rootDir: string, name: string, maxDepth: number): string[] {
      try {
        const results: string[] = [];
        const stack: Array<{ dir: string; depth: number }> = [{ dir: rootDir, depth: 0 }];
        while (stack.length > 0) {
          const { dir: current, depth } = stack.pop()!;
          let entries: fs.Dirent[];
          try {
            entries = fs.readdirSync(current, { withFileTypes: true });
          } catch {
            continue;
          }
          for (const e of entries) {
            const fullPath = path.join(current, e.name);
            if (e.isDirectory()) {
              if (depth < maxDepth) stack.push({ dir: fullPath, depth: depth + 1 });
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

    mtime(filePath: string): number {
      try {
        return fs.statSync(filePath).mtimeMs;
      } catch {
        return 0;
      }
    },

    readConfig(): Record<string, unknown> | null {
      try {
        // Resolve config from the opencode-owned path (option b — P2 autonomy).
        const configRoot = resolveOpencodeConfigRoot();
        if (!configRoot) return null;
        const configPath = path.join(configRoot, ".team-harness.json");
        const raw = fs.readFileSync(configPath, "utf8");
        return JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return null;
      }
    },

    cwd(): string {
      return currentCwd();
    },

    realpath(filePath: string): string | null {
      try {
        return fs.realpathSync(filePath);
      } catch {
        return null;
      }
    },

    gitRepoName(): string | null {
      try {
        const cwd = currentCwd();
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

    gitCurrentBranch(): string | null {
      try {
        return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
          cwd: currentCwd(),
          encoding: "utf8",
          timeout: GIT_EXEC_TIMEOUT_MS,
          stdio: ["ignore", "pipe", "ignore"],
        }).trim();
      } catch {
        return null;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Worktree-scope fix (#411 parity): when the opencode tool:before input
// carries a top-level `cwd` field, chdir into it once before any git/file
// read, so lane resolution evaluates the pushed worktree — not the plugin
// process's own CWD. Mirrors prepublish-guard.opencode.ts's
// resolveWorktreeCwd exactly (fail-open on every fault).
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
    process.stderr.write("gate-guard: payload cwd contains control characters; skipping cd (SEC-DR-A, fail-open)\n");
    return;
  }
  if (!isDirectory(cwd)) {
    process.stderr.write("gate-guard: payload cwd does not exist as a directory; skipping cd (fail-open)\n");
    return;
  }
  try {
    process.chdir(cwd);
  } catch {
    process.stderr.write("gate-guard: cd into payload cwd failed; continuing with process CWD (fail-open)\n");
  }
}

export default function gateGuardPlugin(): GateGuardPlugin {
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
            // Non-covered payload → no-op (parity with prepublish-guard's
            // fail-open-for-non-covered handling; gate-guard has no ask
            // class to fail closed into for a malformed payload).
            return;
          }
          throw err;
        }
      },
    },
  };
}
