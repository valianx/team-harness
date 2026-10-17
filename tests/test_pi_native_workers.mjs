import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../", import.meta.url));
const provider = path.join(repo, "tests/fixtures/pi-scripted-provider.ts");
const root = process.env.TH_PI_TEST_ROOT;
assert.ok(root && path.isAbsolute(root), "TH_PI_TEST_ROOT must select an isolated installed Pi package");
const metadata = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
assert.equal(metadata.name, "@earendil-works/pi-coding-agent");
assert.equal(metadata.version, "1.3.0");
const node = await realpath(process.execPath);
const rpcEntry = path.resolve(root, metadata.exports["./rpc-entry"].import);
const expectedUsage = {
  input: 11, output: 7, cacheRead: 5, cacheWrite: 3, cacheWrite1h: 1, reasoning: 2,
  totalTokens: 26, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};
const once = { input: 11, output: 7, cacheRead: 5, cacheWrite: 3, total: 26 };
const twice = { input: 22, output: 14, cacheRead: 10, cacheWrite: 6, total: 52 };
const readTools = ["find", "grep", "ls", "read"];

function nativeParent(args, options) {
  const child = spawn(node, [rpcEntry, ...args], { ...options, shell: false, stdio: ["pipe", "pipe", "pipe"] });
  const pending = new Map();
  const listeners = new Set();
  let sequence = 0, buffer = "", diagnostics = "", closed = false, failure;
  const exit = new Promise(resolve => child.once("close", (code, signal) => {
    closed = true;
    rejectAll(new Error(`Native Pi exited (${code}/${signal}): ${diagnostics}`));
    resolve({ code, signal });
  }));
  function rejectAll(error) {
    failure = error;
    for (const waiter of pending.values()) waiter.reject(error);
    pending.clear();
    for (const listener of listeners) listener.reject(error);
    listeners.clear();
  }
  child.on("error", rejectAll);
  child.stdin.on("error", rejectAll);
  child.stderr.setEncoding("utf8").on("data", chunk => { diagnostics = (diagnostics + chunk).slice(-8192); });
  child.stdout.setEncoding("utf8").on("data", chunk => {
    buffer += chunk;
    if (buffer.length > 16 * 1024 * 1024) {
      rejectAll(new Error("Native integration response exceeded its containment bound"));
      child.kill();
      return;
    }
    let end;
    while ((end = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      if (!line.trim()) continue;
      let record;
      try { record = JSON.parse(line); }
      catch {
        rejectAll(new Error(`Invalid native protocol record: ${line.slice(0, 300)}`));
        child.kill();
        return;
      }
      if (record.type === "response") {
        const waiter = pending.get(record.id);
        if (waiter) { pending.delete(record.id); waiter.resolve(record); }
      }
      for (const listener of listeners) {
        if (listener.type === record.type) { listeners.delete(listener); listener.resolve(record); }
      }
    }
  });
  return {
    async request(type, extra = {}) {
      if (failure) throw failure;
      const id = `parent-${++sequence}`;
      const response = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Native ${type} request timed out: ${diagnostics}`));
        }, 45000);
        pending.set(id, {
          resolve: value => { clearTimeout(timer); resolve(value); },
          reject: error => { clearTimeout(timer); reject(error); },
        });
      });
      child.stdin.write(JSON.stringify({ id, type, ...extra }) + "\n");
      const record = await response;
      assert.equal(record.success, true, JSON.stringify(record));
      return record.data;
    },
    settled() {
      let listener;
      const promise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          listeners.delete(listener);
          reject(new Error(`Native parent did not settle: ${diagnostics}`));
        }, 60000);
        listener = {
          type: "agent_settled",
          resolve: record => { clearTimeout(timer); resolve(record); },
          reject: error => { clearTimeout(timer); reject(error); },
          dispose: () => { clearTimeout(timer); listeners.delete(listener); },
        };
        listeners.add(listener);
      });
      promise.catch(() => {});
      return { promise, dispose: () => listener.dispose() };
    },
    async close() {
      if (closed) return exit;
      child.stdin.end();
      const terminate = setTimeout(() => child.kill(), 5000);
      const kill = setTimeout(() => child.kill("SIGKILL"), 10000);
      try { return await exit; }
      finally { clearTimeout(terminate); clearTimeout(kill); }
    },
  };
}

const nativeEntries = async file => (await readFile(file, "utf8")).trim().split("\n").map(line => JSON.parse(line));
const assistantMessages = entries => entries.filter(entry => entry.type === "message" && entry.message.role === "assistant");

test("native Pi workers preserve role/session identity and attribute synthetic usage once through parent tool results", { timeout: 180000 }, async t => {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "th-pi workers 研究 ñ-")));
  let parent;
  t.after(async () => {
    try {
      if (parent) assert.equal((await parent.close()).code, 0);
    } finally { await rm(temp, { recursive: true, force: true }); }
  });
  const agentDir = path.join(temp, "agent"), cwd = path.join(temp, "project");
  await Promise.all([mkdir(agentDir), mkdir(cwd)]);
  const settings = {
    "workspace-mode": "local",
    "pi-workers": {
      launcher: { kind: "node", executable: node, sdk_root: root },
      provider_resources: [provider],
      limits: { max_workers: 1, max_followups: 2, startup_ms: 30000, request_ms: 15000,
        operation_ms: 45000, shutdown_ms: 3000, max_frame_bytes: 1048576,
        max_stderr_bytes: 65536, max_result_bytes: 16384 },
    },
  };
  await writeFile(path.join(agentDir, ".team-harness.json"), JSON.stringify(settings));
  await writeFile(path.join(agentDir, "settings.json"), JSON.stringify({
    compaction: { enabled: false }, retry: { enabled: false },
  }));
  const env = { ...process.env, PI_CODING_AGENT_DIR: agentDir, PI_OFFLINE: "1", TH_PI_SCRIPTED_FIXTURE: "1" };
  for (const key of Object.keys(env)) if (/api[_-]?key|auth.*token|access[_-]?token/i.test(key)) delete env[key];
  parent = nativeParent([
    "--offline", "--no-extensions", "--no-mcp", "--no-skills", "--no-context-files", "--no-approve",
    "--no-prompt-templates", "--no-themes", "--extension", provider,
    "--extension", path.join(repo, "runtime/pi/extension.ts"),
    "--tools", "th_worker_dispatch,th_worker_control", "--session-dir", path.join(temp, "parent sessions"),
    "--provider", "th-scripted-fixture", "--model", "synthetic-native-v1", "--thinking", "high",
  ], { cwd, env });
  let call = 0;
  async function tool(name, args) {
    const id = `synthetic-tool-${++call}`;
    const settlement = parent.settled();
    try {
      const ack = await parent.request("prompt", {
        message: "TH_PI_NATIVE_TOOL " + JSON.stringify({ id, name, arguments: args }),
      });
      assert.equal(ack.disposition, "started");
      assert.equal((await settlement.promise).aborted, false);
    } finally { settlement.dispose(); }
    const entries = (await parent.request("get_entries")).entries;
    const result = entries.find(entry => entry.type === "message" && entry.message.role === "toolResult"
      && entry.message.toolCallId === id)?.message;
    assert.ok(result, `Native parent must persist the actual ${name} result for ${id}`);
    assert.equal(result.isError, false, JSON.stringify(result));
    return result;
  }
  async function probe() {
    assert.equal((await parent.request("prompt", { message: "/th-scripted-fixture-probe" })).disposition, "handled");
    const entries = (await parent.request("get_entries")).entries;
    const result = entries.findLast(entry => entry.type === "custom" && entry.customType === "th-scripted-fixture-probe")?.data;
    assert.ok(result);
    assert.equal(result.external_requests, 0, "The fixture must reject every real provider/network path");
    return result;
  }

  const initial = await parent.request("get_state");
  assert.equal(initial.model.provider, "th-scripted-fixture");
  assert.equal(initial.model.id, "synthetic-native-v1");
  assert.equal(initial.thinkingLevel, "high");
  const firstProbe = await probe();
  let worker, firstText;

  await t.test("PI.2-INT-003 and PI.7-INT-001: native model, thinking and read-only capabilities match the parent/role", async () => {
    worker = (await tool("th_worker_dispatch", { role: "reviewer", task: "native synthetic task one" })).details;
    assert.ok(worker.worker_id);
    const finished = (await tool("th_worker_control", { worker_id: worker.worker_id, operation: "wait", timeout_ms: 15000 })).details;
    assert.equal(finished.operation.status, "completed");
    firstText = finished.operation.text;
    const output = JSON.parse(firstText);
    assert.equal(output.fixture, "synthetic-no-inference");
    assert.equal(output.task.split("\n").at(-1), "native synthetic task one");
    assert.deepEqual(output.model, { provider: "th-scripted-fixture", id: "synthetic-native-v1" });
    assert.equal(output.thinking_level, "high");
    assert.deepEqual(output.active_tools.toSorted(), readTools);
    assert.equal(output.all_tools.some(name => name.startsWith("th_worker_")), false);
    assert.equal(output.external_requests, 0);
    const entries = await nativeEntries(worker.session_file);
    const capability = entries.findLast(entry => entry.type === "custom" && entry.customType === "th-pi-worker-capabilities")?.data;
    assert.ok(capability, "The production capability bridge must have run in the native worker");
    assert.deepEqual(capability.active_tools.toSorted(), readTools);
    assert.equal(capability.owner_session_id, initial.sessionId);
    assert.equal(capability.role, "reviewer");
    assert.equal(capability.session_id, worker.session_id);
    assert.equal(capability.session_file, worker.session_file);
    assert.equal(capability.cwd, cwd);
    assert.equal(capability.thinking_level, "high");
    assert.equal((await parent.request("get_session_stats")).tokens.total, 0, "Waiting must not collect native worker usage");
  });

  await t.test("PI.8-INT-004: native final parent toolResult and session statistics include one synthetic usage vector", async () => {
    const collected = await tool("th_worker_control", { worker_id: worker.worker_id, operation: "collect" });
    assert.deepEqual(collected.usage, expectedUsage);
    const receipt = collected.details.th_worker_receipt;
    assert.ok(receipt?.receipt_id);
    assert.equal(receipt.worker_id, worker.worker_id);
    assert.equal(receipt.owner_session_id, initial.sessionId);
    assert.equal(receipt.session_id, worker.session_id);
    assert.equal(receipt.usage_status, "complete");
    assert.equal(receipt.already_attributed, false);
    const durable = (await nativeEntries(initial.sessionFile)).find(entry => entry.type === "message"
      && entry.message.role === "toolResult" && entry.message.toolCallId === collected.toolCallId)?.message;
    assert.deepEqual(durable?.usage, expectedUsage, "Usage must survive native session persistence");
    assert.deepEqual(durable.details.th_worker_receipt, receipt);
    assert.deepEqual((await parent.request("get_session_stats")).tokens, once);
  });

  await t.test("PI.6-INT-001 and PI.8-INT-004: reload rebinds the same native session and repeated collect does not attribute again", async () => {
    assert.equal((await parent.request("prompt", { message: "/th-scripted-fixture-reload" })).disposition, "handled");
    assert.notEqual((await probe()).generation, firstProbe.generation);
    assert.equal((await parent.request("get_state")).sessionId, initial.sessionId);
    const repeated = await tool("th_worker_control", { worker_id: worker.worker_id, operation: "collect" });
    assert.equal(repeated.details.session_id, worker.session_id);
    assert.equal(repeated.details.session_file, worker.session_file);
    assert.equal(repeated.details.operation.status, "completed");
    assert.equal(repeated.details.operation.text, firstText, "Reload must retain the useful completed result");
    assert.equal(repeated.usage, undefined, "A persisted parent receipt must prevent duplicate native attribution");
    assert.deepEqual((await parent.request("get_session_stats")).tokens, once);
    const entries = await nativeEntries(worker.session_file);
    assert.equal(entries[0].id, worker.session_id);
    assert.equal(entries[0].cwd, cwd);
    assert.equal(assistantMessages(entries).length, 1, "Rebind must not replay the original prompt");
    assert.ok(entries.filter(entry => entry.type === "custom" && entry.customType === "th-pi-worker-capabilities").length >= 2,
      "Recollection after reload must verify the reconnected native worker through the bridge");
  });

  await t.test("PI.6-INT-001: explicit follow-up continues that conversation and only its new usage is attributed", async () => {
    await tool("th_worker_control", { worker_id: worker.worker_id, operation: "follow_up", task: "native synthetic task two" });
    const finished = (await tool("th_worker_control", { worker_id: worker.worker_id, operation: "wait", timeout_ms: 15000 })).details;
    assert.equal(finished.operation.status, "completed");
    assert.equal(JSON.parse(finished.operation.text).task.split("\n").at(-1), "native synthetic task two");
    const collected = await tool("th_worker_control", { worker_id: worker.worker_id, operation: "collect" });
    assert.deepEqual(collected.usage, expectedUsage);
    assert.equal(collected.details.session_id, worker.session_id);
    assert.equal(collected.details.session_file, worker.session_file);
    assert.deepEqual((await parent.request("get_session_stats")).tokens, twice);
    assert.equal((await nativeEntries(worker.session_file)).filter(entry => entry.type === "message" && entry.message.role === "user").length, 2);
    assert.equal(assistantMessages(await nativeEntries(worker.session_file)).length, 2);
    assert.equal((await tool("th_worker_control", { worker_id: worker.worker_id, operation: "collect" })).usage, undefined);
    assert.deepEqual((await parent.request("get_session_stats")).tokens, twice);
    assert.equal((await probe()).external_requests, 0);
  });
  t.diagnostic("Synthetic native Pi provider only; external requests/model inference: 0. Node launcher, not a compiled-binary activation claim.");
});
