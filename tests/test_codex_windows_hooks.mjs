import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, cp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const plugin = path.join(root, "plugins/team-harness");
const manifest = JSON.parse(await readFile(path.join(plugin, "hooks/hooks.json"), "utf8"));
const hooks = manifest.hooks.PreToolUse.flatMap(group => group.hooks);
const scratch = await mkdtemp(path.join(tmpdir(), "th hooks & windows "));
const copy = path.join(scratch, "plugin with spaces & symbols");
const safe = { tool_name: "Bash", tool_input: { command: "git status" } };
const destructive = { tool_name: "Bash", tool_input: { command: "rm -rf /" } };
let count = 0;

function invoke(hook, input, variables = { PLUGIN_ROOT: copy }, nodeAvailable = true) {
  assert.equal(typeof hook.commandWindows, "string");
  const parsed = /^node --version >nul 2>&1 & if errorlevel 1 \(echo (.+) & exit \/b 0\) else \(node -e "([^"]+)" (.+)\)$/.exec(hook.commandWindows);
  assert.ok(parsed, "Windows command must retain the tested Node bootstrap form");
  const env = { ...process.env };
  delete env.PLUGIN_ROOT;
  delete env.CLAUDE_PLUGIN_ROOT;
  Object.assign(env, variables);
  const pathKey = Object.keys(env).find(key => key.toLowerCase() === "path") || "PATH";
  env[pathKey] = nodeAvailable ? path.dirname(process.execPath) + path.delimiter + (env[pathKey] || "") : scratch;
  const options = { env, input: typeof input === "string" ? input : JSON.stringify(input), encoding: "utf8", timeout: 15000, maxBuffer: 1024 * 1024 };
  const result = process.platform === "win32"
    ? spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", hook.commandWindows], { ...options, windowsVerbatimArguments: true })
    : spawnSync(process.execPath, ["-e", parsed[2], ...parsed[3].split(" ")], options);
  assert.equal(result.error, undefined, String(result.error));
  assert.equal(result.status, 0, result.stderr);
  let output;
  assert.doesNotThrow(() => { output = result.stdout.trim() ? JSON.parse(result.stdout) : null; },
    `invalid hook response: stdout=${result.stdout} stderr=${result.stderr}`);
  return output;
}
function denied(result) {
  assert.equal(result?.hookSpecificOutput?.permissionDecision, "deny");
  count += 1;
}

try {
  await cp(path.join(plugin, "hooks"), path.join(copy, "hooks"), { recursive: true });
  assert.equal(hooks.length, 2);
  if (process.platform === "win32") denied(invoke(hooks[0], safe, { PLUGIN_ROOT: copy }, false));
  denied(invoke(hooks[0], destructive));
  assert.equal(invoke(hooks[0], safe), null); count += 1;
  denied(invoke(hooks[0], destructive, { CLAUDE_PLUGIN_ROOT: copy }));
  denied(invoke(hooks[0], destructive, { PLUGIN_ROOT: copy, CLAUDE_PLUGIN_ROOT: path.join(scratch, "absent") }));
  denied(invoke(hooks[1], { tool_name: "Bash", tool_input: { command: "gcloud projects delete prod" } }));
  denied(invoke(hooks[1], { tool_name: "Bash", tool_input: { command: "git push --force origin feature" } }));
  assert.equal(invoke(hooks[1], { tool_name: "Bash", tool_input: { command: "gcloud compute instances create demo" } }), null); count += 1;
  const token = "ghp_" + "A".repeat(36);
  denied(invoke(hooks[0], { tool_name: "apply_patch", tool_input: { command: "*** Begin Patch\n+TOKEN=" + token + "\n*** End Patch" } }));
  const marker = "DO_NOT_REFLECT_WINDOWS_FIXTURE";
  const invalid = invoke(hooks[0], "{invalid:" + marker);
  denied(invalid);
  assert.ok(!JSON.stringify(invalid).includes(marker));
  for (const variables of [{}, { PLUGIN_ROOT: "relative" }, { PLUGIN_ROOT: path.join(scratch, "absent") }]) {
    assert.match(invoke(hooks[0], safe, variables).systemMessage, /plugin runtime missing/); count += 1;
  }
  await rm(path.join(copy, "hooks/dist/policy-block.cjs"));
  denied(invoke(hooks[0], safe));
  await mkdir(path.join(copy, "hooks/dist"), { recursive: true });
  await writeFile(path.join(copy, "hooks/dist/policy-block.cjs"), "process.stdout.write('invalid');");
  denied(invoke(hooks[0], safe));
  await writeFile(path.join(copy, "hooks/dist/policy-block.cjs"), "process.stdout.write(JSON.stringify({hookSpecificOutput:{permissionDecision:'other'}}));");
  denied(invoke(hooks[0], safe));
  await writeFile(path.join(copy, "hooks/dist/gcp-guard.cjs"), "process.stdout.write(JSON.stringify({hookSpecificOutput:{permissionDecision:'ask'}}));");
  await writeFile(path.join(copy, "hooks/dist/gate-guard.cjs"), "process.stdout.write(JSON.stringify({hookSpecificOutput:{permissionDecision:'deny'}}));");
  denied(invoke(hooks[1], safe));
  const launcher = path.join(copy, "hooks/dist/codex-launcher.cjs");
  await rm(launcher);
  await mkdir(launcher);
  await writeFile(path.join(launcher, "index.js"), "process.stdout.write('must-not-execute');");
  assert.match(invoke(hooks[0], safe).systemMessage, /plugin runtime missing/); count += 1;
  process.stdout.write(`codex-windows-hooks: ${count} checks PASS (${process.platform === "win32" ? "literal commandWindows through cmd.exe" : "portable bootstrap/adapter; cmd.exe covered by Windows CI"})\n`);
} finally {
  await rm(scratch, { recursive: true, force: true });
}
