// hooks/ts/entry/session-start.cc.ts
// Claude Code (Node) entry for session-start.
// Reads stdin → shim.inboundCC → body (with real SessionStartReader) → stdout JSON.
//
// Output format for SessionStart hooks (per code.claude.com/docs/en/hooks,
// verified via context7 — matches hooks/session-start.sh:272 exactly):
//   {"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"<string>"}}
//                                             — if any directives loaded
//   {} (empty stdout)                        — if nothing to emit
//
// This hook NEVER blocks or emits a permissionDecision. Exit 0 always.
// FAIL-OPEN: any error → empty stdout (no additionalContext).

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { inboundCC, ShimRejectError } from "../shim/shim.js";
import { evaluateSessionStart, type SessionStartReader } from "../bodies/session-start.js";

function makeReader(): SessionStartReader {
  return {
    readConfig(): Record<string, unknown> | null {
      try {
        const configPath = path.join(os.homedir(), ".claude", ".team-harness.json");
        const raw = fs.readFileSync(configPath, "utf8");
        return JSON.parse(raw) as Record<string, unknown>;
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
  const reader = makeReader();

  try {
    const normalized = inboundCC(raw);
    const output = evaluateSessionStart(normalized, reader);

    if (output.additionalContext !== null) {
      // Emit the CC SessionStart envelope — hookSpecificOutput wrapper, not a
      // bare top-level additionalContext (that form is not honoured by CC).
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "SessionStart",
            additionalContext: output.additionalContext,
          },
        }) + "\n"
      );
    }
    // Empty stdout → CC SessionStart hook emits nothing (no-op).
  } catch (err) {
    if (err instanceof ShimRejectError) {
      // FAIL-OPEN: emit nothing, still load the orchestrator disposition
      // via a minimal fallback so the session is not crippled.
      // (Rarely triggered — session-start payload is simple JSON.)
    }
    // Any other error: emit nothing.
  }
}

main().catch(() => {
  process.exit(0);
});
