// hooks/ts/entry/language-user-prompt.cc.ts
// Claude Code (Node) entry for language-user-prompt.
// Reads stdin → shim.inboundCC → body (with real reader) → stdout JSON.
//
// Output format for UserPromptSubmit hooks:
//   { "additionalContext": "<string>" }  — if a language is configured
//   {} (empty stdout)                    — if no language configured
//
// NEVER blocks. Exit 0 always.

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { inboundCC, ShimRejectError } from "../shim/shim.js";
import {
  evaluateLanguagePrompt,
  type LanguagePromptReader,
} from "../bodies/language-user-prompt.js";

function makeReader(): LanguagePromptReader {
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
    const output = evaluateLanguagePrompt(normalized, reader);

    if (output.additionalContext !== null) {
      process.stdout.write(
        JSON.stringify({ additionalContext: output.additionalContext }) + "\n"
      );
    }
  } catch (err) {
    if (err instanceof ShimRejectError) {
      // FAIL-OPEN: emit nothing.
    }
    // Any other error: emit nothing (no-op, never block).
  }
}

main().catch(() => {
  process.exit(0);
});
