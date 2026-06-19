// hooks/ts/entry/prepublish-guard.opencode.ts
// opencode (Bun) plugin entry for prepublish-guard.
// Fail mode: fail-closed-for-covered (deny blocks; shim errors → ask/throw).

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execFileSync } from "node:child_process";
import { inboundOpencode, outboundOpencode, ShimRejectError } from "../shim/shim.js";
import { evaluate, type PrepublishReader } from "../bodies/prepublish-guard.js";

type HookCallback = (input: unknown, output: unknown) => Promise<void>;

interface PrepublishGuardPlugin {
  hooks: {
    "tool:before": HookCallback;
  };
}

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
        const configPath = path.join(os.homedir(), ".claude", ".team-harness.json");
        const raw = fs.readFileSync(configPath, "utf8");
        return JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return null;
      }
    },

    gitDiffOriginMain(): string[] | null {
      try {
        const out = execFileSync("git", ["diff", "--name-only", "origin/main...HEAD"], {
          encoding: "utf8",
          env: { ...process.env, MSYS_NO_PATHCONV: "1" },
        });
        return out.split("\n").map((l) => l.trim()).filter(Boolean);
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

    jsonEscape(s: string): string {
      return JSON.stringify(s);
    },
  };
}

export default function prepublishGuardPlugin(): PrepublishGuardPlugin {
  return {
    hooks: {
      "tool:before": async (input: unknown, output: unknown): Promise<void> => {
        try {
          const normalized = inboundOpencode(input, output);
          const reader = makeReader();
          const decision = evaluate(normalized, reader);
          outboundOpencode(decision);
        } catch (err) {
          if (err instanceof ShimRejectError) {
            // Fail-closed for a potential covered action (git push / gh pr create).
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
