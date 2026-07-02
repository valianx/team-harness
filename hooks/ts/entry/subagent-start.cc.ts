// hooks/ts/entry/subagent-start.cc.ts
// Claude Code (Node) entry for subagent-start.
// Reads stdin → shim.inboundCC → body (with real writer) → writes JSONL file.
//
// NEVER emits stdout. NEVER blocks the Task dispatch. Exit 0 always.
// FAIL-OPEN: any error → silently exit 0. Wired directly (node, no launcher
// yet — that lands with the Group-B cutover): node/dist absence at the CC
// hook-runner level degrades to a lost breadcrumb, never a blocked dispatch.

import * as fs from "node:fs";
import * as path from "node:path";
import { inboundCC, ShimRejectError } from "../shim/shim.js";
import { evaluateSubagentStart, type SubagentStartWriter } from "../bodies/subagent-start.js";

// ---------------------------------------------------------------------------
// Workspace locator: walks up from cwd looking for workspaces/ dir.
// Falls back to looking for 00-state.md in common locations.
// Mirrors hooks/ts/entry/subagent-trace.cc.ts (the stop-side twin).
// ---------------------------------------------------------------------------

function findWorkspace(cwd: string): string | null {
  // Strategy 1: look for workspaces/<anything>/00-state.md under cwd.
  const workspacesDir = path.join(cwd, "workspaces");
  if (fs.existsSync(workspacesDir)) {
    try {
      const entries = fs.readdirSync(workspacesDir, { withFileTypes: true });
      const dirs = entries.filter((e) => e.isDirectory());
      // Return most recently modified workspace with a 00-state.md.
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
      // Cannot read directory — continue.
    }
  }

  // Strategy 2: environment variable TH_WORKSPACE.
  const envWs = process.env["TH_WORKSPACE"];
  if (envWs && fs.existsSync(path.join(envWs, "00-state.md"))) {
    return envWs;
  }

  return null;
}

function makeWriter(): SubagentStartWriter {
  return {
    appendLine(workspacePath: string, encodedLine: string): string | null {
      // The body encodes filename + line as "filename\0jsonline".
      const sep = encodedLine.indexOf("\0");
      if (sep < 0) return "subagent-start: invalid encodedLine format";
      const filename = encodedLine.slice(0, sep);
      const jsonLine = encodedLine.slice(sep + 1);
      const filePath = path.join(workspacePath, filename);
      try {
        fs.appendFileSync(filePath, jsonLine + "\n", "utf8");
        return null;
      } catch (err: unknown) {
        return `subagent-start: append failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    },

    findWorkspace(cwd: string): string | null {
      return findWorkspace(cwd);
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
    evaluateSubagentStart(normalized, writer);
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
