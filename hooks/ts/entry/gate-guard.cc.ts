// hooks/ts/entry/gate-guard.cc.ts
// Claude Code (Node) entry for gate-guard.
// Reads stdin -> resolve worktree-scope cwd -> shim.inboundCC -> body (with
// real GateGuardReader) -> shim.outboundCC.
//
// Fail mode: the body itself is fail-CLOSED once a governing lane resolves
// (see gate-guard.ts header) and fail-open when no lane resolves at all. The
// entry-level exception handling below is fail-open — a shim/runtime fault
// before the body even runs is not evidence of a resolved-but-corrupt lane,
// it is evidence the payload could not be evaluated at all.

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execFileSync } from "node:child_process";
import { inboundCC, outboundCC, ShimRejectError } from "../shim/shim.js";
import {
  evaluate,
  evaluateCodexForcePushFloor,
  type GateGuardReader,
} from "../bodies/gate-guard.js";
import { CONTROL_CHAR_RE } from "../bodies/prepublish-guard.js";
import type { NormalizedDecision } from "../shim/normalized-v1.js";

const GIT_EXEC_TIMEOUT_MS = 5_000;

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
      const legacyPath = path.join(os.homedir(), ".claude", ".team-harness.json");
      const codexRoot = process.env.CODEX_HOME?.trim() || path.join(os.homedir(), ".codex");
      const candidates = process.env.TEAM_HARNESS_CODEX_HOOK === "1"
        ? [path.join(codexRoot, ".team-harness.json"), legacyPath]
        : [legacyPath];
      for (const configPath of candidates) {
        let raw: string;
        try {
          raw = fs.readFileSync(configPath, "utf8");
        } catch (err: unknown) {
          if (err && typeof err === "object" && "code" in err
              && (err as { code?: string }).code === "ENOENT") {
            continue;
          }
          process.stderr.write(`gate-guard: cannot read Team Harness config at ${configPath}; using safe defaults\n`);
          return null;
        }
        try {
          const parsed = JSON.parse(raw) as unknown;
          if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
            throw new TypeError("config root must be an object");
          }
          return parsed as Record<string, unknown>;
        } catch {
          process.stderr.write(`gate-guard: malformed Team Harness config at ${configPath}; using safe defaults\n`);
          return null;
        }
      }
      return null;
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

    gitCurrentBranch(): string | null {
      try {
        return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
          cwd: process.cwd(),
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

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

// ---------------------------------------------------------------------------
// Worktree-scope fix (#411 parity): when the payload carries a top-level
// `cwd` field, chdir into it once before any git/file read, so lane
// resolution evaluates the pushed worktree — not the hook process's own
// CWD. Mirrors prepublish-guard.cc.ts's resolveWorktreeCwd exactly
// (fail-open on every fault).
// ---------------------------------------------------------------------------

function extractCwdFromRaw(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const cwd = (parsed as Record<string, unknown>)["cwd"];
      if (typeof cwd === "string") return cwd;
    }
  } catch {
    // Unparsable payload — cwd resolution is best-effort; the shim
    // separately handles the malformed-payload contract downstream.
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
      "gate-guard: payload cwd contains control characters; skipping cd (SEC-DR-A, fail-open)\n"
    );
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

async function main(): Promise<void> {
  const raw = await readStdin();
  resolveWorktreeCwd(raw);
  const reader = makeReader();

  try {
    const normalized = inboundCC(raw);
    const decision = process.env.TEAM_HARNESS_CODEX_HOOK === "1"
      ? evaluateCodexForcePushFloor(normalized)
      : evaluate(normalized, reader);
    outboundCC(decision);
  } catch (err) {
    if (process.env.TEAM_HARNESS_CODEX_HOOK === "1") {
      const fallback: NormalizedDecision = {
        decision: "deny",
        reason: "gate-guard: force-push safety evaluation failed; execution denied.",
        mutations: null,
      };
      outboundCC(fallback);
      return;
    }
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
  if (process.env.TEAM_HARNESS_CODEX_HOOK === "1") {
    try {
      outboundCC({
        decision: "deny",
        reason: "gate-guard: force-push safety evaluation failed before completion; execution denied.",
        mutations: null,
      });
    } catch {
      // The process exit remains the final transport boundary.
    }
  }
  process.exit(0);
});
