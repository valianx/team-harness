import { readSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const allowed = new Set(["policy-block", "gcp-guard", "gate-guard"]);

function deny(reason: string): void {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: {
    hookEventName: "PreToolUse", permissionDecision: "deny",
    permissionDecisionReason: `Blocked by team-harness Codex hook adapter: ${reason}`,
  } }) + "\n");
}

export function run(names: string[]): void {
  const selected = names.filter(name => allowed.has(name));
  if (!selected.length) return;
  let input: Record<string, unknown>;
  try {
    const chunks: Buffer[] = [];
    let total = 0;
    for (;;) {
      const buffer = Buffer.alloc(65536);
      const count = readSync(0, buffer, 0, buffer.length, null);
      if (!count) break;
      total += count;
      if (total > 1024 * 1024) throw new Error();
      chunks.push(buffer.subarray(0, count));
    }
    input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error();
  } catch { deny("invalid hook input"); return; }
  const deadline = Date.now() + 8000;
  for (const name of selected) {
    const artifact = join(__dirname, `${name}.cjs`);
    try {
      const stat = lstatSync(artifact);
      if (!stat.isFile() || stat.isSymbolicLink() || !stat.size) throw new Error();
    } catch { deny("hook artifact missing or empty"); return; }
    let value = input;
    if (name === "policy-block" && input.tool_name === "apply_patch") {
      const toolInput = input.tool_input as { command?: unknown } | undefined;
      value = { ...input, tool_name: "Write", tool_input: {
        file_path: "(apply_patch)", content: typeof toolInput?.command === "string" ? toolInput.command : "",
      } };
    }
    const timeout = deadline - Date.now();
    if (timeout <= 0) { deny("hook execution failed"); return; }
    const result = spawnSync(process.execPath, [artifact], {
      input: JSON.stringify(value), encoding: "utf8", shell: false, windowsHide: true,
      env: { ...process.env, TEAM_HARNESS_CODEX_HOOK: "1" }, timeout, maxBuffer: 256 * 1024,
    });
    if (result.error || result.status !== 0) { deny("hook execution failed"); return; }
    if (!result.stdout.trim()) continue;
    try {
      const output = JSON.parse(result.stdout);
      const decision = output?.hookSpecificOutput?.permissionDecision;
      if (decision === "deny") { process.stdout.write(JSON.stringify(output) + "\n"); return; }
      if (decision !== "allow" && decision !== "ask") { deny("hook produced an invalid decision"); return; }
    } catch { deny("hook produced invalid JSON"); return; }
  }
}

if (require.main === module) run(process.argv.slice(2));
