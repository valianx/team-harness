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

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { inboundOpencode, outboundOpencode, ShimRejectError } from "../shim/shim.js";
import { evaluate, type StateReader } from "../bodies/checkpoint-guard.js";

type HookCallback = (input: unknown, output: unknown) => Promise<void>;

interface CheckpointGuardPlugin {
  hooks: {
    "tool:before": HookCallback;
  };
}

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
        const configPath = path.join(os.homedir(), ".claude", ".team-harness.json");
        const raw = fs.readFileSync(configPath, "utf8");
        return JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return null;
      }
    },

    cwd(): string {
      return typeof process !== "undefined" ? process.cwd() : "";
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
