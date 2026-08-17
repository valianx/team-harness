// hooks/ts/entry/precompact-snapshot.cc.ts
// Claude Code (Node) entry for precompact-snapshot.
// Reads stdin → shim.inboundCC → body (with real PrecompactWriter) → writes files.
//
// NEVER emits stdout. NEVER blocks. Exit 0 always.
// FAIL-OPEN: any error → silently exit 0.

import * as fs from "node:fs";
import * as path from "node:path";
import { inboundCC, ShimRejectError } from "../shim/shim.js";
import {
  evaluatePrecompactSnapshot,
  type PrecompactWriter,
} from "../bodies/precompact-snapshot.js";

// ---------------------------------------------------------------------------
// Workspace locator (same strategy as subagent-trace).
// ---------------------------------------------------------------------------

function findWorkspace(cwd: string): string | null {
  const workspacesDir = path.join(cwd, "workspaces");
  if (fs.existsSync(workspacesDir)) {
    try {
      const entries = fs.readdirSync(workspacesDir, { withFileTypes: true });
      const dirs = entries.filter((e) => e.isDirectory());
      let latest: { dir: string; mtime: number } | null = null;
      for (const d of dirs) {
        const statePath = path.join(workspacesDir, d.name, "00-state.md");
        try {
          const stat = fs.statSync(statePath);
          if (latest === null || stat.mtimeMs > latest.mtime) {
            latest = { dir: path.join(workspacesDir, d.name), mtime: stat.mtimeMs };
          }
        } catch {
          // Not found — skip.
        }
      }
      if (latest !== null) return latest.dir;
    } catch {
      // Cannot read — skip.
    }
  }

  const envWs = process.env["TH_WORKSPACE"];
  if (envWs && fs.existsSync(path.join(envWs, "00-state.md"))) {
    return envWs;
  }

  return null;
}

function makeWriter(): PrecompactWriter {
  return {
    findWorkspace(cwd: string): string | null {
      return findWorkspace(cwd);
    },

    readFile(filePath: string): string | null {
      try {
        return fs.readFileSync(filePath, "utf8");
      } catch {
        return null;
      }
    },

    writeFile(filePath: string, content: string): string | null {
      try {
        fs.writeFileSync(filePath, content, "utf8");
        return null;
      } catch (err: unknown) {
        return `writeFile failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    },

    appendLine(filePath: string, jsonLine: string): string | null {
      try {
        fs.appendFileSync(filePath, jsonLine + "\n", "utf8");
        return null;
      } catch (err: unknown) {
        return `appendLine failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    },

    realpath(filePath: string): string | null {
      try {
        return fs.realpathSync(filePath);
      } catch {
        return null;
      }
    },

    join(...parts: string[]): string {
      return path.join(...parts);
    },

    now(): string {
      return new Date().toISOString();
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
  const writer = makeWriter();

  try {
    const normalized = inboundCC(raw);
    evaluatePrecompactSnapshot(normalized, writer);
    // Never emit stdout.
  } catch (err) {
    if (err instanceof ShimRejectError) {
      // FAIL-OPEN: silently exit 0.
    }
    // Any other error: silently exit 0.
  }
}

main().catch(() => {
  process.exit(0);
});
