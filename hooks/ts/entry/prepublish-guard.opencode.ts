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

// resolveOpencodeConfigRoot returns the opencode config root directory.
// Resolution order (mirrors the Go installer's opencodeGlobalConfigDir):
//   1. OPENCODE_CONFIG_DIR env override — validated (absolute, no traversal).
//   2. Windows: %APPDATA%\opencode
//   3. Linux/macOS: $XDG_CONFIG_HOME/opencode else ~/.config/opencode
//
// Returns null when the resolved path contains ".." or is not absolute
// (SEC-OC-R3 — rejects traversal/injection overrides).
function resolveOpencodeConfigRoot(): string | null {
  // Check for an env override first (SEC-OC-R3: validate before use).
  const override = process.env["OPENCODE_CONFIG_DIR"];
  if (override) {
    const normalized = path.normalize(override);
    if (!path.isAbsolute(normalized) || normalized.includes("..")) {
      // Reject traversal or relative injection attempts.
      return null;
    }
    return normalized;
  }

  const isWindows = process.platform === "win32";
  if (isWindows) {
    const appdata = process.env["APPDATA"];
    if (!appdata) {
      return path.join(os.homedir(), "AppData", "Roaming", "opencode");
    }
    return path.join(appdata, "opencode");
  }

  // Linux / macOS: $XDG_CONFIG_HOME/opencode else ~/.config/opencode
  const xdg = process.env["XDG_CONFIG_HOME"];
  if (xdg && path.isAbsolute(xdg)) {
    return path.join(xdg, "opencode");
  }
  return path.join(os.homedir(), ".config", "opencode");
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
