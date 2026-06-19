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
import { inboundCC, outboundCC, ShimRejectError } from "../shim/shim.js";
import { evaluate, type StateReader } from "../bodies/checkpoint-guard.js";
import type { NormalizedDecision } from "../shim/normalized-v1.js";

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
