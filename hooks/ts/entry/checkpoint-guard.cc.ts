// hooks/ts/entry/checkpoint-guard.cc.ts
// Claude Code (Node) entry for checkpoint-guard.
// Reads stdin → shim.inboundCC → body (with real StateReader) → shim.outboundCC.
//
// Fail mode: FAIL-OPEN (parity with checkpoint-guard.sh).
// Any shim or body exception → none (no gate action).
// This mirrors the Bash oracle: "on any error → exit 0 (no JSON)".

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execFileSync } from "node:child_process";
import { inboundCC, outboundCC, ShimRejectError } from "../shim/shim.js";
import { evaluate, type StateReader } from "../bodies/checkpoint-guard.js";
import type { NormalizedDecision } from "../shim/normalized-v1.js";

const GIT_EXEC_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// Real StateReader — reads from the live filesystem.
// ---------------------------------------------------------------------------

function makeStateReader(): StateReader {
  return {
    readFile(filePath: string): string | null {
      try {
        return fs.readFileSync(filePath, "utf8");
      } catch {
        return null;
      }
    },

    findFiles(dir: string, name: string, maxDepth: number): string[] {
      try {
        const results: string[] = [];
        // Stack entries carry the directory path and the current depth level.
        const stack: Array<{ dir: string; depth: number }> = [{ dir, depth: 0 }];
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
              // Only descend if we have not yet reached the caller's depth limit.
              if (depth < maxDepth) {
                stack.push({ dir: fullPath, depth: depth + 1 });
              }
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

    // fix(checkpoint-guard): return 0 on error per StateReader contract (null → NaN in sort)
    mtime(filePath: string): number {
      try {
        return fs.statSync(filePath).mtimeMs;
      } catch {
        return 0;
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

    cwd(): string {
      return process.cwd();
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
        const out = execFileSync("git", ["rev-parse", "--git-common-dir"], {
          cwd: process.cwd(),
          encoding: "utf8",
          timeout: GIT_EXEC_TIMEOUT_MS,
          stdio: ["ignore", "pipe", "ignore"],
        }).trim();
        if (!out) return null;
        const absCommonDir = path.isAbsolute(out) ? out : path.resolve(process.cwd(), out);
        const repoRoot = path.dirname(absCommonDir); // strip the trailing ".git" segment
        const name = path.basename(repoRoot);
        return name || null;
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

async function main(): Promise<void> {
  const raw = await readStdin();
  const reader = makeStateReader();

  try {
    const normalized = inboundCC(raw);
    const decision = evaluate(normalized, reader);
    outboundCC(decision);
  } catch (err) {
    if (err instanceof ShimRejectError) {
      // FAIL-OPEN: shim rejected → no gate action.
      const fallback: NormalizedDecision = { decision: "none", reason: "", mutations: null };
      outboundCC(fallback);
    } else {
      // FAIL-OPEN: any unexpected error → no gate action.
      const fallback: NormalizedDecision = { decision: "none", reason: "", mutations: null };
      outboundCC(fallback);
    }
  }
}

main().catch(() => {
  process.exit(0);
});
