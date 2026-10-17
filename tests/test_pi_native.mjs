import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../", import.meta.url));
const runtime = process.env.TH_PI_TEST_ROOT;
assert.ok(runtime && path.isAbsolute(runtime), "TH_PI_TEST_ROOT must name an isolated installed Pi package root");
const metadata = JSON.parse(await readFile(path.join(runtime, "package.json"), "utf8"));
assert.equal(metadata.name, "@earendil-works/pi-coding-agent");
assert.equal(metadata.version, "1.3.0", "native verification uses the declared compatibility target");
const node = await realpath(process.execPath);
const cli = path.resolve(runtime, metadata.bin.pi);
const rpcEntry = path.resolve(runtime, metadata.exports["./rpc-entry"].import);

function rpc(args, options) {
  const child = spawn(node, [rpcEntry, ...args], { ...options, stdio: ["pipe", "pipe", "pipe"], shell: false });
  let pending = new Map(), sequence = 0, buffer = "", diagnostics = "";
  const exit = new Promise((resolve) => child.once("close", (code, signal) => resolve({ code, signal })));
  const rejectPending = (error) => { for (const item of pending.values()) item.reject(error); pending.clear(); };
  child.on("error", rejectPending);
  child.on("close", () => rejectPending(new Error(`Native Pi exited: ${diagnostics}`)));
  child.stderr.setEncoding("utf8").on("data", (chunk) => { diagnostics = (diagnostics + chunk).slice(-8192); });
  child.stdout.setEncoding("utf8").on("data", (chunk) => {
    buffer += chunk;
    if (buffer.length > 4 * 1024 * 1024) { rejectPending(new Error("Native probe frame exceeded its bound")); child.kill(); return; }
    let end;
    while ((end = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      if (!line.trim()) continue;
      let item;
      try { item = JSON.parse(line); } catch { rejectPending(new Error(`Invalid native JSONL: ${line.slice(0, 500)}`)); continue; }
      if (item.type === "extension_error") diagnostics = (diagnostics + line).slice(-8192);
      const waiter = pending.get(item.id);
      if (item.type === "response" && waiter) { pending.delete(item.id); waiter.resolve(item); }
    }
  });
  return {
    diagnostics: () => diagnostics,
    async request(type, extra = {}) {
      const id = `native-${++sequence}`;
      const response = new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Native ${type} timeout: ${diagnostics}`)); }, 20000);
        pending.set(id, { resolve: (value) => { clearTimeout(timer); resolve(value); }, reject: (error) => { clearTimeout(timer); reject(error); } });
      });
      child.stdin.write(JSON.stringify({ type, id, ...extra }) + "\n");
      const result = await response;
      assert.equal(result.success, true, JSON.stringify(result));
      return result.data;
    },
    async close() {
      child.stdin.end();
      const timer = setTimeout(() => child.kill(), 5000);
      try { return await exit; } finally { clearTimeout(timer); }
    },
  };
}

test("native Pi installs, discovers, reloads and removes TH in a custom root without model requests", { timeout: 120000 }, async (t) => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "th-pi-native spaces-ñ-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const agentDir = path.join(temp, "selected agent"), cwd = path.join(temp, "project"), unrelated = path.join(temp, "unrelated package");
  await Promise.all([mkdir(agentDir), mkdir(cwd), mkdir(unrelated)]);
  await writeFile(path.join(unrelated, "package.json"), JSON.stringify({ name: "unrelated-native-fixture", pi: { extensions: [], skills: [] } }));
  const nativeSettings = path.join(agentDir, "settings.json");
  const baseline = { packages: [unrelated], provider: "unchanged-fixture", model: "unchanged-fixture", customValue: { preserve: true } };
  await writeFile(nativeSettings, JSON.stringify(baseline));
  const thSettings = path.join(agentDir, ".team-harness.json");
  const preferences = { "workspace-mode": "local", opaque: { preserve: true } };
  await writeFile(thSettings, JSON.stringify(preferences));
  const env = { ...process.env, PI_CODING_AGENT_DIR: agentDir, PI_OFFLINE: "1" };
  for (const key of Object.keys(env)) if (/API_KEY|AUTH_TOKEN|ACCESS_TOKEN/.test(key)) delete env[key];
  function packageCommand(...args) {
    const result = spawnSync(node, [cli, ...args], { cwd, env, encoding: "utf8", timeout: 30000, shell: false });
    assert.equal(result.status, 0, `${args.join(" ")}: ${result.error?.message || ""}\n${result.stdout}\n${result.stderr}`);
  }
  function start() {
    return rpc(["--offline", "--no-mcp", "--no-context-files", "--no-approve", "--no-prompt-templates", "--no-themes", "--session-dir", path.join(temp, "sessions"), "--extension", path.join(repo, "tests/fixtures/pi-native-probe.ts")], { cwd, env });
  }
  async function snapshot(client) {
    const commands = (await client.request("get_commands")).commands;
    assert.ok(commands.some((command) => command.name === "th-native-probe"), "probe must be discovered before any prompt is sent");
    const disposition = await client.request("prompt", { message: "/th-native-probe" });
    assert.equal(disposition.disposition, "handled");
    const entries = (await client.request("get_entries")).entries;
    return { commands, probe: entries.filter((entry) => entry.type === "custom" && entry.customType === "th-native-probe").at(-1)?.data };
  }

  packageCommand("install", repo);
  let client = start();
  try {
    const first = await snapshot(client);
    assert.ok(first.probe);
    for (const name of ["th_worker_dispatch", "th_worker_control"]) assert.ok(first.probe.allTools.includes(name), `${name}: ${client.diagnostics()}`);
    for (const name of ["skill:th-spec", "skill:th-workspace", "skill:th-setup"]) assert.ok(first.commands.some((command) => command.name === name), name);
    assert.ok(first.commands.some((command) => command.name === "th-native-reload"));
    assert.equal((await client.request("prompt", { message: "/th-native-reload" })).disposition, "handled");
    const second = await snapshot(client);
    assert.notEqual(second.probe.generation, first.probe.generation, "reload must replace the extension factory");
    for (const name of ["th_worker_dispatch", "th_worker_control"]) assert.ok(second.probe.allTools.includes(name), name);
    assert.equal((await client.request("get_state")).isStreaming, false);
  } finally { assert.equal((await client.close()).code, 0); }
  packageCommand("update", repo);
  const installed = JSON.parse(await readFile(nativeSettings, "utf8"));
  for (const key of ["provider", "model", "customValue"]) assert.deepEqual(installed[key], baseline[key]);
  assert.ok(installed.packages.includes(unrelated));
  assert.deepEqual(JSON.parse(await readFile(thSettings, "utf8")), preferences);
  packageCommand("remove", repo);
  assert.deepEqual(JSON.parse(await readFile(nativeSettings, "utf8")), baseline);
  client = start();
  try {
    const removed = await snapshot(client);
    assert.ok(!removed.probe.allTools.some((name) => name.startsWith("th_worker_")));
    assert.ok(!removed.commands.some((command) => command.name === "skill:th-spec"));
  } finally { assert.equal((await client.close()).code, 0); }
  t.diagnostic("Pi 1.3.0 native package lifecycle and handled commands; external model requests: 0");
});
