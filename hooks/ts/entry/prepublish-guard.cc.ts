// hooks/ts/entry/prepublish-guard.cc.ts
// Claude Code (Node) entry for prepublish-guard.
// Reads stdin → resolve worktree-scope cwd → shim.inboundCC → body (with real
// PrepublishReader) → shim.outboundCC.
//
// Fail mode: FAIL-OPEN on every evaluation fault.
// Shim errors → none (non-covered call). Body faults are handled inside body.evaluate().

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execFileSync } from "node:child_process";
import { inboundCC, outboundCC, ShimRejectError } from "../shim/shim.js";
import { evaluate, type PrepublishReader, CONTROL_CHAR_RE } from "../bodies/prepublish-guard.js";
import type { NormalizedDecision } from "../shim/normalized-v1.js";

// ---------------------------------------------------------------------------
// Real PrepublishReader
// ---------------------------------------------------------------------------

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
          // ETIMEDOUT or ESRCH → map to exit code 124.
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

    gitDiffNameStatus(): Array<{ status: string; path: string }> | null {
      try {
        // MSYS_NO_PATHCONV=1 to prevent Git Bash path conversion on Windows.
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
            // Rename lines (R<score>\told\tnew) carry the destination path last.
            const filePath = fields.length > 2 ? fields[fields.length - 1] : fields[1] ?? "";
            return { status, path: filePath };
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

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

// ---------------------------------------------------------------------------
// Worktree-scope fix (#411 parity): when the payload carries a top-level
// `cwd` field, chdir into it once before any git/file read, so Check 1 and
// Check 2 evaluate the pushed worktree — not the hook process's own CWD.
// Mirrors hooks/prepublish-guard.sh Step 1b exactly (fail-open on every fault).
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
      // FAIL-OPEN: non-covered payload → none.
      const fallback: NormalizedDecision = { decision: "none", reason: "", mutations: null };
      outboundCC(fallback);
    } else {
      // Unexpected error → fail-open.
      const fallback: NormalizedDecision = { decision: "none", reason: "", mutations: null };
      outboundCC(fallback);
    }
  }
}

main().catch(() => {
  process.exit(0);
});
