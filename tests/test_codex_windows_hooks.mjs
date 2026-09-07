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
if (process.platform !== "win32") {
  process.stdout.write("codex-windows-hooks: SKIP (native PowerShell coverage runs in Windows CI)\n");
  process.exit(0);
}
const windowsPowerShell = path.join(process.env.SystemRoot, "System32/WindowsPowerShell/v1.0/powershell.exe");
const discovery = spawnSync(windowsPowerShell, ["-NoProfile", "-NonInteractive", "-Command",
  "(Get-Command pwsh.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source"],
  { encoding: "utf8", timeout: 10000, windowsHide: true });
assert.equal(discovery.status, 0, `PowerShell 7 is required: ${discovery.stderr}`);
const shells = [discovery.stdout.trim(), windowsPowerShell];
const scratch = await mkdtemp(path.join(tmpdir(), "th hooks & windows "));
const copy = path.join(scratch, "plugin with spaces & symbols");
const safe = { tool_name: "Bash", tool_input: { command: "git status" } };
const destructive = { tool_name: "Bash", tool_input: { command: "rm -rf /" } };
let count = 0;

function invoke(hook, input, variables = { PLUGIN_ROOT: copy }, nodeAvailable = true) {
  assert.equal(typeof hook.commandWindows, "string");
  const env = { ...process.env };
  delete env.PLUGIN_ROOT;
  delete env.CLAUDE_PLUGIN_ROOT;
  Object.assign(env, variables);
  const pathKey = Object.keys(env).find(key => key.toLowerCase() === "path") || "PATH";
  env[pathKey] = nodeAvailable ? path.dirname(process.execPath) + path.delimiter + (env[pathKey] || "") : scratch;
  const options = { env, cwd: scratch, input: typeof input === "string" ? input : JSON.stringify(input), encoding: "utf8", timeout: 15000, maxBuffer: 1024 * 1024 };
  let output;
  for (const shell of shells) {
    const result = spawnSync(shell, ["-NoProfile", "-NonInteractive", "-Command", hook.commandWindows],
      { ...options, windowsHide: true });
    assert.equal(result.error, undefined, String(result.error));
    assert.equal(result.status, 0, `${shell}: ${result.stderr}`);
    assert.equal(result.stderr.trim(), "", `${shell}: unexpected stderr`);
    let current;
    assert.doesNotThrow(() => { current = result.stdout.trim() ? JSON.parse(result.stdout) : null; },
      `invalid hook response: stdout=${result.stdout} stderr=${result.stderr}`);
    if (shell === shells[0]) output = current;
    else assert.deepEqual(current, output, "PowerShell versions must return the same decision");
  }
  return output;
}
function denied(result) {
  assert.equal(result?.hookSpecificOutput?.permissionDecision, "deny");
  count += 1;
}

try {
  await cp(path.join(plugin, "hooks"), path.join(copy, "hooks"), { recursive: true });
  assert.equal(hooks.length, 2);
  denied(invoke(hooks[0], safe, { PLUGIN_ROOT: copy }, false));
  // A repository-local command must not shadow the runtime selected through PATH.
  await writeFile(path.join(scratch, "node.cmd"), "@echo WORKSPACE_NODE_EXECUTED\r\n@exit /b 0\r\n");
  await writeFile(path.join(scratch, "node.exe"), "not an executable");
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
  for (const source of ["not valid javascript {", "module.exports = {};", "exports.run = () => { throw new Error('DO_NOT_REFLECT_LAUNCHER_ERROR'); };"]) {
    await writeFile(launcher, source);
    const result = invoke(hooks[0], safe);
    denied(result);
    assert.ok(!JSON.stringify(result).includes("DO_NOT_REFLECT_LAUNCHER_ERROR"));
  }
  await rm(launcher);
  await mkdir(launcher);
  await writeFile(path.join(launcher, "index.js"), "process.stdout.write('must-not-execute');");
  assert.match(invoke(hooks[0], safe).systemMessage, /plugin runtime missing/); count += 1;
  process.stdout.write(`codex-windows-hooks: ${count} checks PASS in each of PowerShell 7 and Windows PowerShell\n`);
} finally {
  await rm(scratch, { recursive: true, force: true });
}
