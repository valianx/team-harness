// hooks/ts/entry/subagent-trace.cc.ts
// Claude Code (Node) entry for subagent-trace.
// Reads stdin → shim.inboundCC → body (with real writer) → writes JSONL file.
//
// NEVER emits stdout. NEVER blocks. Exit 0 always.
// FAIL-OPEN: any error → silently exit 0.

import * as fs from "node:fs";
import * as path from "node:path";
import { writeWorkspaceOutput } from "./workspace-output.js";
import { inboundCC, ShimRejectError } from "../shim/shim.js";
import { evaluateSubagentTrace, type SubagentTraceWriter } from "../bodies/subagent-trace.js";

// ---------------------------------------------------------------------------
// Workspace binding: only an explicit absolute TH_WORKSPACE is eligible.
// Never infer a workspace from cwd or file modification time; a missing or
// invalid binding makes this observational hook a silent no-op.
// ---------------------------------------------------------------------------

function findWorkspace(_cwd: string): string | null {
  const envWs = process.env["TH_WORKSPACE"];
  if (!envWs || !path.isAbsolute(envWs)) return null;

  try {
    if (!fs.statSync(envWs).isDirectory()) return null;
    if (!fs.statSync(path.join(envWs, "00-state.md")).isFile()) return null;
    return envWs;
  } catch {
    return null;
  }
}

function makeWriter(): SubagentTraceWriter {
  return {
    appendLine(workspacePath: string, encodedLine: string): string | null {
      // The body encodes filename + line as "filename\0jsonline".
      const sep = encodedLine.indexOf("\0");
      if (sep < 0) return "subagent-trace: invalid encodedLine format";
      const filename = encodedLine.slice(0, sep);
      const jsonLine = encodedLine.slice(sep + 1);
      const filePath = path.join(workspacePath, filename);
      try {
        writeWorkspaceOutput(workspacePath, filePath, jsonLine + "\n", true);
        return null;
      } catch (err: unknown) {
        return `subagent-trace: append failed: ${err instanceof Error ? err.message : String(err)}`;
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
    evaluateSubagentTrace(normalized, writer);
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
