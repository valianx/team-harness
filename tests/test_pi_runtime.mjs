import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { PiRpcTransport, WorkerManager, resolveLauncher, workerFailureCode, workerConfiguration } from '../runtime/pi/worker.mjs';
import { inspectPiWorkspace } from '../runtime/pi/context.mjs';

const fixture = fileURLToPath(new URL('./fixtures/pi-rpc-child.mjs', import.meta.url));
const limits = { startup_ms: 2000, request_ms: 500, shutdown_ms: 200, operation_ms: 2000, max_frame_bytes: 16000,
  max_stderr_bytes: 4000, max_workers: 2, max_followups: 1, max_result_bytes: 4000 };

async function isolated(t, scenario = 'normal') {
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'th-pi Unicode 研究 ')));
  const cleanups = [];
  const defer = cleanup => { assert.ok(cleanups.length < 64); cleanups.push(cleanup); };
  t.after(async () => {
    const errors = [];
    for (const cleanup of cleanups.reverse()) {
      try {
        const result = await cleanup();
        assert.notEqual(result?.cleanup_complete, false, 'Owned child cleanup must finish before removing its directory');
      } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, 'Owned fixture cleanup failed; temporary directory retained');
    await fs.rm(directory, { recursive: true, force: true });
  });
  const sdk = path.join(directory, 'native sdk');
  await fs.mkdir(sdk);
  await fs.copyFile(fixture, path.join(sdk, 'rpc.mjs'));
  await fs.writeFile(path.join(sdk, 'package.json'), JSON.stringify({ name: '@earendil-works/pi-coding-agent', version: '1.3.0',
    exports: { './rpc-entry': { import: './rpc.mjs' } }, bin: { pi: './rpc.mjs' } }));
  const descriptor = { kind: 'node', executable: process.execPath, sdk_root: sdk };
  const options = { cwd: directory, env: { ...process.env, TH_PI_FIXTURE_SCENARIO: scenario }, limits,
    args: ['--session-dir', path.join(directory, 'sessions')] };
  return { directory, sdk, descriptor, options, defer };
}

async function transport(t, scenario) {
  const setup = await isolated(t, scenario);
  const client = await PiRpcTransport.start(setup.descriptor, setup.options);
  setup.defer(() => client.stop());
  return { ...setup, client };
}

test('public launcher preserves spaces and Unicode and checks declared SDK version', async t => {
  const setup = await isolated(t);
  const launch = await resolveLauncher(setup.descriptor, { limits });
  assert.equal(launch.executable, await fs.realpath(process.execPath));
  assert.equal(launch.args[0], path.join(setup.sdk, 'rpc.mjs'));
  await fs.writeFile(path.join(setup.sdk, 'package.json'), JSON.stringify({ name: '@earendil-works/pi-coding-agent', version: '9.0.0' }));
  await assert.rejects(resolveLauncher(setup.descriptor, { limits }), /version|SDK/i);
  await assert.rejects(resolveLauncher({ kind: 'node', executable: 'node', sdk_root: setup.sdk }), /absolute/i);
});

test('a SIGTERM-ignoring version probe reaches bounded failure with observed owned cleanup', async t => {
  const setup = await isolated(t);
  const pidFile = path.join(setup.directory, 'version-probe.json');
  const started = Date.now();
  const pending = resolveLauncher(setup.descriptor, { limits: { ...limits, startup_ms: 200, shutdown_ms: 100 },
    env: { ...process.env, TH_PI_FIXTURE_VERSION_MODE: 'stubborn', TH_PI_FIXTURE_VERSION_PID: pidFile } })
    .then(value => ({ value }), error => ({ error }));
  let timer;
  const outcome = await Promise.race([pending, new Promise(resolve => { timer = setTimeout(() => resolve({ deadline_exceeded: true }), 1200); })]);
  clearTimeout(timer);
  const { pid } = JSON.parse(await fs.readFile(pidFile, 'utf8'));
  if (outcome.deadline_exceeded) {
    process.kill(pid, 'SIGKILL');
    await pending;
  }
  assert.equal(outcome.deadline_exceeded, undefined, 'version probe remained pending beyond its bounded startup and cleanup window');
  assert.equal(outcome.error?.code, 'VERSION_UNAVAILABLE');
  assert.equal(outcome.error?.cleanup_complete, true);
  assert.ok(Date.now() - started < 1200);
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});

test('transport correlates concurrent responses and preserves literal argument and Unicode frame boundaries', async t => {
  const { client } = await transport(t);
  const values = ['first', 'é\u2028研究\u2029next', '$(unchanged); literal'];
  const results = await Promise.all(values.map(value => client.request({ type: 'echo', value })));
  assert.deepEqual(results.map(result => result.value), values);
});

test('fragmented UTF-8 and CRLF frames preserve Unicode line separators as string content', async t => {
  const { client } = await transport(t, 'fragmented');
  const value = 'é\u2028研究\u2029🙂';
  assert.equal((await client.request({ type: 'echo', value })).value, value);
});

test('reverse response order is correlated to the exact pending IDs', async t => {
  const { client } = await transport(t, 'reverse');
  const values = ['one', 'two', 'three'];
  assert.deepEqual((await Promise.all(values.map(value => client.request({ type: 'echo', value })))).map(value => value.value), values);
});

test('unknown and duplicate response IDs cannot resolve another pending operation', async t => {
  const foreign = await transport(t, 'unknown-id');
  await assert.rejects(foreign.client.request({ type: 'echo', value: 'own' }), /match|response/i);
  const duplicate = await transport(t, 'duplicate-id');
  assert.equal((await duplicate.client.request({ type: 'echo', value: 'first' })).value, 'first');
  await assert.rejects(duplicate.client.request({ type: 'echo', value: 'next' }), /match|response/i);
});

test('headless dialogs receive matching cancellation and notifications cannot block a command', async t => {
  const { client } = await transport(t);
  const result = await client.request({ type: 'ui' });
  assert.deepEqual(result.dialogs, [0, 1, 2, 3].map(index => ({ type: 'extension_ui_response', id: 'dialog-' + index, cancelled: true })));
});

test('EOF and unterminated frames reject every affected pending command', async t => {
  for (const truncated of [false, true]) {
    const { client } = await transport(t, 'eof');
    const pending = [client.request({ type: 'eof', truncated }), client.request({ type: 'stall' })];
    const results = await Promise.allSettled(pending);
    assert.deepEqual(results.map(result => result.status), ['rejected', 'rejected']);
    assert.match(results[0].reason.message, truncated ? /truncated/i : /ended/i);
  }
});

test('request deadline invalidates pending IDs and later commands cannot revive that child', async t => {
  const { client } = await transport(t);
  await assert.rejects(client.request({ type: 'stall' }, 30), /timeout/i);
  await assert.rejects(client.request({ type: 'echo', value: 'late' }), /timeout/i);
  assert.equal((await client.stop()).cleanup_complete, true);
});

test('frame and diagnostic byte limits accept the boundary and refuse boundary plus one', async t => {
  for (const [type, key] of [['emit_frame', 'max_frame_bytes'], ['diagnostics', 'max_stderr_bytes']]) {
    const setup = await isolated(t);
    const selected = { ...limits, [key]: 1024 };
    const client = await PiRpcTransport.start(setup.descriptor, { ...setup.options, limits: selected });
    setup.defer(() => client.stop());
    await client.request({ type, bytes: 1024 });
    await assert.rejects(client.request({ type, bytes: type === 'diagnostics' ? 1 : 1025 }), /limit/i);
  }
});

test('paused child input exercises drained writes while stdout and stderr stay consumed', async t => {
  const setup = await isolated(t);
  const client = await PiRpcTransport.start(setup.descriptor, { ...setup.options,
    limits: { ...limits, max_frame_bytes: 2_000_000, request_ms: 3000 } });
  setup.defer(() => client.stop());
  await client.request({ type: 'pause_input' });
  const started = Date.now();
  const values = Array.from({ length: 3 }, (_, index) => String(index) + 'x'.repeat(524288));
  const result = await Promise.all(values.map(value => client.request({ type: 'echo', value })));
  assert.deepEqual(result.map(item => item.value), values);
  assert.ok(Date.now() - started >= 100);
});

test('owned shutdown escalates within finite deadlines and leaves unrelated processes running', async t => {
  const unrelated = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  const unrelatedClosed = new Promise(resolve => unrelated.once('close', resolve));
  t.after(async () => { unrelated.kill(); await unrelatedClosed; });
  const { client } = await transport(t, 'stubborn');
  const started = Date.now();
  const result = await client.stop();
  assert.ok(Date.now() - started < 2500);
  assert.equal(result.cleanup_complete, true);
  assert.equal(unrelated.exitCode, null);
  assert.doesNotThrow(() => process.kill(unrelated.pid, 0));
});

test('a faulted stubborn child retains its pool slot through cleanup and discards unstarted follow-ups', async t => {
  const { value, options, directory } = await manager(t, 'fault-stubborn', { limits: { ...limits, max_workers: 1, shutdown_ms: 300 } });
  const log = path.join(directory, 'fault-slot.jsonl');
  options.env.TH_PI_FIXTURE_LOG = log;
  const first = await value.dispatch({ role: 'reviewer', task: 'first active task' });
  await value.followUp(first.worker_id, { task: 'unstarted queued payload' });
  const stopped = await value.wait(first.worker_id, { timeout_ms: 1000 });
  assert.equal(stopped.operation.status, 'interrupted');
  const records = (await fs.readFile(log, 'utf8')).trim().split('\n').map(JSON.parse);
  const pid = records.find(record => record.kind === 'launch').pid;
  assert.doesNotThrow(() => process.kill(pid, 0));
  await assert.rejects(value.dispatch({ role: 'reviewer', task: 'replacement before cleanup' }), error => error.code === 'POOL_LIMIT');
  await assert.rejects(value.followUp(first.worker_id, { task: 'premature rebind' }), error => error.code === 'CLEANUP_INCOMPLETE');
  assert.equal(value.status(first.worker_id).queued, 0);
  const deadline = Date.now() + 2000;
  while (value.status(first.worker_id).cleanup_complete !== true && Date.now() < deadline)
    await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(value.status(first.worker_id).cleanup_complete, true);
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  const next = await value.dispatch({ role: 'reviewer', task: 'replacement after cleanup' });
  assert.notEqual(next.worker_id, first.worker_id);
  await value.cancel(next.worker_id);
  const final = (await fs.readFile(log, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(final.filter(record => record.kind === 'launch').length, 2);
  assert.equal(final.some(record => record.type === 'prompt' && record.message.includes('unstarted queued payload')), false);
});

test('unconfirmed cleanup stays unavailable in memory and in retained references', async t => {
  const { value, references, options } = await manager(t, 'fault-stubborn', { limits: { ...limits, max_workers: 1 } });
  const original = PiRpcTransport.prototype.stop;
  const owned = new Set();
  PiRpcTransport.prototype.stop = function () { owned.add(this); return Promise.resolve({ stopped: false, cleanup_complete: false }); };
  try {
    const first = await value.dispatch({ role: 'reviewer', task: 'unconfirmed owned child' });
    await value.wait(first.worker_id, { timeout_ms: 1000 });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(value.status(first.worker_id).cleanup_complete, false);
    await assert.rejects(value.followUp(first.worker_id, { task: 'must not reconnect' }), error => error.code === 'CLEANUP_INCOMPLETE');
    await assert.rejects(value.dispatch({ role: 'reviewer', task: 'must not replace' }), error => error.code === 'POOL_LIMIT');
    const fresh = new WorkerManager(options);
    await assert.rejects(fresh.restore([references.at(-1)]), error => error.code === 'CLEANUP_INCOMPLETE');
    await fresh.shutdown();
  } finally {
    PiRpcTransport.prototype.stop = original;
    await Promise.all([...owned].map(client => original.call(client)));
  }
});

test('binary descriptor uses an explicit literal executable with version and state proof', { skip: process.platform === 'win32' && 'POSIX executable fixture; native compiled Pi on Windows remains unverified' }, async t => {
  const setup = await isolated(t);
  const executable = path.join(setup.directory, 'controlled binary 研究');
  await fs.writeFile(executable, '#!' + process.execPath + '\n' + await fs.readFile(fixture, 'utf8'));
  await fs.chmod(executable, 0o700);
  const client = await PiRpcTransport.start({ kind: 'binary', executable }, setup.options);
  setup.defer(() => client.stop());
  const echoed = await client.request({ type: 'echo', value: 'literal $(stay); é' });
  assert.equal(echoed.value, 'literal $(stay); é');
  assert.deepEqual(echoed.argv.slice(0, 2), ['--mode', 'rpc']);
});

test('public refusal codes cannot leak arbitrary native exception values', () => {
  assert.equal(workerFailureCode({ code: 'RESOURCE_UNAVAILABLE', message: 'synthetic-private' }), 'RESOURCE_UNAVAILABLE');
  assert.equal(workerFailureCode({ code: 'synthetic-private', publicMessage: 'synthetic-private' }), 'WORKER_ERROR');
});

for (const scenario of ['startup-exit', 'malformed', 'oversized', 'stderr-limit', 'no-response', 'invalid-state']) {
  test(`transport refuses ${scenario} without leaving an unsettled startup`, async t => {
    const setup = await isolated(t, scenario);
    await assert.rejects((async () => {
      const client = await PiRpcTransport.start(setup.descriptor, setup.options);
      setup.defer(() => client.stop());
      return client;
    })(), /worker|protocol|frame|response|diagnostic|exit|timeout/i);
  });
}

test('invalid descriptors, missing files and a nonexecutable target cannot become a ready transport', async t => {
  const setup = await isolated(t);
  await assert.rejects(resolveLauncher({ ...setup.descriptor, command: 'untrusted shell string' }), /launcher/i);
  await assert.rejects(resolveLauncher({ kind: 'binary', executable: process.execPath, sdk_root: setup.sdk }), /launcher/i);
  await assert.rejects(resolveLauncher({ kind: 'binary', executable: path.join(setup.directory, 'absent') }));
  const executable = path.join(setup.directory, 'nonexecutable');
  await fs.writeFile(executable, 'ordinary bytes');
  await assert.rejects(resolveLauncher({ kind: 'binary', executable }, { limits }), /version/i);
});

test('explicit invalid worker preferences cannot silently select a default launcher', () => {
  for (const invalid of [null, false, 0, 'invalid'])
    assert.throws(() => workerConfiguration({ 'pi-workers': invalid }, { sdkRoot: '/native' }), /configuration/i);
  assert.equal(workerConfiguration({ 'pi-workers': { launcher: null } }, { sdkRoot: '/native' }).descriptor, null);
});

test('the pending request limit rejects boundary plus one and cleanup rejects both held requests', async t => {
  const setup = await isolated(t);
  const client = await PiRpcTransport.start(setup.descriptor, { ...setup.options, limits: { ...limits, max_pending: 2 } });
  setup.defer(() => client.stop());
  const held = [client.request({ type: 'stall' }), client.request({ type: 'stall' })];
  const settled = Promise.allSettled(held);
  await assert.rejects(client.request({ type: 'stall' }), /limit/i);
  await client.stop();
  assert.deepEqual((await settled).map(item => item.status), ['rejected', 'rejected']);
});

async function manager(t, scenario = 'normal', overrides = {}) {
  const setup = await isolated(t, scenario);
  const prompt = 'installer-assets/pi-agents/reviewer.md';
  await fs.mkdir(path.join(setup.directory, path.dirname(prompt)), { recursive: true });
  await fs.writeFile(path.join(setup.directory, prompt), 'Review the assigned files.');
  const entries = [];
  const references = [];
  const options = { packageRoot: setup.directory, agentDir: path.join(setup.directory, 'agent'), descriptor: setup.descriptor,
    env: setup.options.env, limits, catalog: { schema_version: 1, runtime: 'pi', version: '3.49.0', agents: [
      { name: 'reviewer', description: 'Review', source: 'agents/reviewer.md', prompt, model: 'sonnet', effort: 'high',
        tools: ['read', 'grep', 'find', 'ls'], read_only: true },
    ] }, parent: { session_id: 'primary-session', cwd: setup.directory, model: { provider: 'fixture', id: 'fixture-model' }, thinking_level: 'high' },
    parentEntries: () => entries, onReference: reference => references.push(reference), ...overrides };
  const value = new WorkerManager(options);
  setup.defer(async () => {
    await value.shutdown();
    assert.equal(value.list().some(worker => worker.cleanup_complete === false), false);
  });
  return { ...setup, value, options, entries, references };
}

test('role validation rejects coordinator/reference names before any worker exists', async t => {
  const { value } = await manager(t);
  for (const role of ['orchestrator', '_shared', 'unknown-role']) await assert.rejects(value.dispatch({ role, task: 'task' }), /eligible|role/i);
  assert.deepEqual(value.list(), []);
});

test('handled prompts finish without waiting for agent settlement', async t => {
  const { value } = await manager(t, 'handled');
  const launched = await value.dispatch({ role: 'reviewer', task: 'handled input' });
  const result = await value.wait(launched.worker_id, { timeout_ms: 300 });
  assert.equal(result.operation.status, 'handled');
  assert.equal(result.operation.disposition, 'handled');
});

for (const scenario of ['normal', 'fast-settle', 'queued', 'retry']) {
  test(`worker completes ${scenario} only with native final evidence`, async t => {
    const { value } = await manager(t, scenario);
    const launched = await value.dispatch({ role: 'reviewer', task: 'native task' });
    const result = await value.wait(launched.worker_id, { timeout_ms: 1000 });
    assert.equal(result.operation.status, 'completed');
    assert.match(result.operation.text, /native task/);
    const collected = await value.collect(launched.worker_id);
    assert.equal(collected.usage.input, 5);
    assert.equal(collected.usage.reasoning, 3);
    assert.equal(collected.usage.totalTokens, 15);
  });
}

test('native tool mismatch makes the worker unavailable before its assigned task', async t => {
  const { value, directory } = await manager(t, 'wrong-tools');
  await assert.rejects(value.dispatch({ role: 'reviewer', task: 'must not be delivered' }), /capabilit|tools/i);
  const sessions = await fs.readdir(path.join(directory, 'agent', 'team-harness', 'sessions'));
  const content = await fs.readFile(path.join(directory, 'agent', 'team-harness', 'sessions', sessions[0]), 'utf8');
  assert.equal(content.includes('must not be delivered'), false);
});

test('pool and follow-up bounds are finite; cancellation clears queued work before abort', async t => {
  const { value, options, directory } = await manager(t, 'hang', { limits: { ...limits, max_workers: 1 } });
  const log = path.join(directory, 'commands.jsonl');
  options.env.TH_PI_FIXTURE_LOG = log;
  const launched = await value.dispatch({ role: 'reviewer', task: 'active' });
  await value.followUp(launched.worker_id, { task: 'queued' });
  await assert.rejects(value.followUp(launched.worker_id, { task: 'overflow' }), /queue|follow/i);
  await assert.rejects(value.dispatch({ role: 'reviewer', task: 'overflow worker' }), /pool|worker limit/i);
  const result = await value.cancel(launched.worker_id);
  assert.equal(result.operation.status, 'aborted');
  assert.equal(result.queued, 0);
  const commands = (await fs.readFile(log, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(commands.filter(command => ['clear_queue', 'abort'].includes(command.type)).map(command => command.type), ['clear_queue', 'abort']);
  assert.equal(commands.filter(command => command.type === 'prompt' && !command.message.startsWith('/')).length, 1);
  assert.equal(commands[0].argv.includes('--no-mcp'), true);
  assert.equal(commands[0].argv.includes('--no-extensions'), true);
  assert.equal(commands[0].argv.includes('--no-context-files'), true);
});

test('concurrent dispatch reaches the pool boundary and never creates a boundary-plus-one process', async t => {
  const { value, options, directory } = await manager(t, 'hang');
  const log = path.join(directory, 'pool-commands.jsonl');
  options.env.TH_PI_FIXTURE_LOG = log;
  const result = await Promise.allSettled([0, 1, 2].map(index => value.dispatch({ role: 'reviewer', task: 'worker ' + index })));
  assert.equal(result.filter(item => item.status === 'fulfilled').length, 2);
  assert.equal(result.filter(item => item.status === 'rejected' && item.reason.code === 'POOL_LIMIT').length, 1);
  const records = (await fs.readFile(log, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(records.filter(item => item.kind === 'launch').length, 2);
});

test('five sequential conversations reclaim idle capacity while preserving pending receipts and native follow-up identity', async t => {
  const { value, entries } = await manager(t, 'normal', { limits: { ...limits, max_workers: 4 } });
  const workers = [];
  let original;
  for (let index = 0; index < 5; index++) {
    if (index === 4) t.diagnostic('Before fifth dispatch: ' + JSON.stringify(value.list().map(item => ({
      state: item.state, operation: item.operation.status, queued: item.queued,
    }))));
    const launched = await value.dispatch({ role: 'reviewer', task: 'sequential conversation ' + index });
    const completed = await value.wait(launched.worker_id, { timeout_ms: 1000 });
    assert.equal(completed.operation.status, 'completed');
    workers.push(completed);
    if (index === 0) original = await value.collect(completed.worker_id);
    assert.ok(value.list().filter(item => ['ready', 'running', 'starting'].includes(item.state)).length <= 4);
  }
  assert.equal(value.list().length, 5);
  assert.equal(value.status(workers[0].worker_id).state, 'dormant');
  assert.equal(value.status(workers[0].worker_id).cleanup_complete, true);
  const unconfirmed = await value.collect(workers[0].worker_id);
  assert.equal(unconfirmed.usage_status, 'awaiting_confirmation');
  assert.equal(unconfirmed.usage, undefined);
  assert.equal(unconfirmed.session_id, workers[0].session_id);
  assert.equal(unconfirmed.session_file, workers[0].session_file);
  const confirm = result => entries.push({ type: 'message', message: { role: 'toolResult', usage: result.usage,
    details: { th_worker_receipt: result.receipt } } });
  confirm(original);
  const reconnected = await value.collect(workers[0].worker_id);
  assert.equal(reconnected.usage, undefined);
  confirm(reconnected);
  await value.followUp(workers[0].worker_id, { task: 'follow-up in reclaimed native conversation' });
  const final = await value.wait(workers[0].worker_id, { timeout_ms: 1000 });
  assert.equal(final.operation.status, 'completed');
  assert.equal(final.session_id, workers[0].session_id);
  assert.equal(final.session_file, workers[0].session_file);
  const next = await value.collect(workers[0].worker_id);
  assert.equal(next.usage.input, 5);
  confirm(next);
  assert.equal((await value.collect(workers[0].worker_id)).usage, undefined);
});

test('an in-progress collection cannot be reclaimed to admit another conversation', async t => {
  const { value, options, directory } = await manager(t, 'held-collection', { limits: { ...limits, max_workers: 1 } });
  const barrier = path.join(directory, 'release-collection');
  options.env.TH_PI_FIXTURE_COLLECTION_BARRIER = barrier;
  const first = await value.dispatch({ role: 'reviewer', task: 'completed before collection' });
  await value.wait(first.worker_id, { timeout_ms: 1000 });
  const pending = value.collect(first.worker_id);
  pending.catch(() => {});
  const deadline = Date.now() + 1000;
  let held = false;
  while (!held && Date.now() < deadline) {
    held = await fs.access(barrier + '.waiting').then(() => true, () => false);
    if (!held) await new Promise(resolve => setTimeout(resolve, 5));
  }
  try {
    assert.equal(held, true);
    await assert.rejects(value.dispatch({ role: 'reviewer', task: 'must not evict collection' }), error => error.code === 'POOL_LIMIT');
    assert.equal(value.status(first.worker_id).state, 'ready');
  } finally { await fs.writeFile(barrier, 'release'); }
  assert.equal((await pending).usage.input, 5);
  const next = await value.dispatch({ role: 'reviewer', task: 'replacement after collection' });
  assert.notEqual(next.worker_id, first.worker_id);
});

test('competing replacements reserve only confirmed reclaimed capacity and preserve an active winner', async t => {
  const { value, options, directory } = await manager(t, 'hold-replacements', { limits: { ...limits, max_workers: 1 } });
  const log = path.join(directory, 'reclaim-race.jsonl');
  options.env.TH_PI_FIXTURE_LOG = log;
  const first = await value.dispatch({ role: 'reviewer', task: 'initial idle conversation' });
  await value.wait(first.worker_id, { timeout_ms: 1000 });
  const results = await Promise.allSettled([0, 1].map(index => value.dispatch({ role: 'reviewer', task: 'replacement ' + index })));
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(results.filter(item => item.status === 'rejected' && item.reason.code === 'POOL_LIMIT').length, 1);
  const records = (await fs.readFile(log, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(records.filter(item => item.kind === 'launch').length, 2);
  assert.equal(value.status(first.worker_id).state, 'dormant');
  assert.equal(value.list().filter(item => item.operation.status === 'running').length, 1);
});

test('idle reclamation never releases a process slot when owned cleanup is unconfirmed', async t => {
  const { value } = await manager(t, 'normal', { limits: { ...limits, max_workers: 1 } });
  const first = await value.dispatch({ role: 'reviewer', task: 'idle cleanup proof' });
  await value.wait(first.worker_id, { timeout_ms: 1000 });
  const original = PiRpcTransport.prototype.stop;
  const owned = new Set();
  PiRpcTransport.prototype.stop = function () { owned.add(this); return Promise.resolve({ stopped: false, cleanup_complete: false }); };
  try {
    await assert.rejects(value.dispatch({ role: 'reviewer', task: 'replacement must remain refused' }), error => error.code === 'POOL_LIMIT');
    assert.equal(value.status(first.worker_id).cleanup_complete, false);
    await assert.rejects(value.followUp(first.worker_id, { task: 'no unconfirmed reconnect' }), error => error.code === 'CLEANUP_INCOMPLETE');
  } finally {
    PiRpcTransport.prototype.stop = original;
    await Promise.all([...owned].map(client => original.call(client)));
  }
});

test('cancellation during native preparation cannot submit the task after abort acknowledgement', async t => {
  const { value, options, directory } = await manager(t, 'slow-prepare');
  const log = path.join(directory, 'preparation.jsonl');
  options.env.TH_PI_FIXTURE_LOG = log;
  const dispatch = value.dispatch({ role: 'reviewer', task: 'cancel before task delivery' });
  const deadline = Date.now() + 2000;
  while (value.list()[0]?.operation?.status !== 'accepted' && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(value.list()[0]?.operation?.status, 'accepted');
  await value.cancel(value.list()[0].worker_id);
  const result = await dispatch;
  assert.equal(result.operation.status, 'aborted');
  const commands = (await fs.readFile(log, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(commands.filter(command => command.type === 'prompt' && !command.message.startsWith('/')).length, 0);
});

test('cancellation while initial startup is held fences the original dispatch generation before acceptance', async t => {
  const { value, options, directory } = await manager(t, 'held-startup');
  const barrier = path.join(directory, 'release-startup');
  const log = path.join(directory, 'held-startup.jsonl');
  options.env.TH_PI_FIXTURE_START_BARRIER = barrier;
  options.env.TH_PI_FIXTURE_LOG = log;
  const pending = value.dispatch({ role: 'reviewer', task: 'cancelled initial assignment must never be delivered' });
  pending.catch(() => {});
  const deadline = Date.now() + 1500;
  let held = false;
  while (!held && Date.now() < deadline) {
    held = await fs.access(barrier + '.waiting').then(() => true, () => false);
    if (!held) await new Promise(resolve => setTimeout(resolve, 5));
  }
  let cancelled;
  try {
    assert.equal(held, true, 'fixture must hold the first startup response before task acceptance');
    const initial = value.list()[0];
    assert.ok(initial.worker_id);
    assert.notEqual(initial.operation?.status, 'accepted');
    cancelled = await value.cancel(initial.worker_id);
  } finally { await fs.writeFile(barrier, 'release'); }
  const result = await pending;
  const commands = (await fs.readFile(log, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(commands.filter(command => command.type === 'prompt' && !command.message.startsWith('/')).length, 0);
  assert.equal(cancelled.operation.status, 'aborted');
  assert.equal(result.operation.status, 'aborted');
  assert.equal(result.worker_id, cancelled.worker_id);
});

test('queued follow-up remains distinct and eventually runs in the same native conversation', async t => {
  const { value } = await manager(t, 'retry');
  const first = await value.dispatch({ role: 'reviewer', task: 'first task' });
  const queued = await value.followUp(first.worker_id, { task: 'follow-up task' });
  assert.equal(queued.queued, 1);
  assert.ok(queued.queued_operation_id);
  assert.equal((await value.collect(first.worker_id)).usage_status, 'uncollected');
  const deadline = Date.now() + 2000;
  while (value.status(first.worker_id).operation.id !== queued.queued_operation_id && Date.now() < deadline)
    await new Promise(resolve => setTimeout(resolve, 5));
  const final = await value.wait(first.worker_id, { timeout_ms: 1000 });
  assert.equal(final.operation.id, queued.queued_operation_id);
  assert.equal(final.operation.status, 'completed');
  assert.match(final.operation.text, /follow-up task/);
  assert.equal(final.session_id, first.session_id);
});

test('an operation deadline aborts native work and remains an explicit timeout failure', async t => {
  const { value } = await manager(t, 'hang', { limits: { ...limits, operation_ms: 40 } });
  const launched = await value.dispatch({ role: 'reviewer', task: 'deadline' });
  const deadline = Date.now() + 1500;
  while (value.status(launched.worker_id).operation.status === 'running' && Date.now() < deadline)
    await new Promise(resolve => setTimeout(resolve, 5));
  const result = value.status(launched.worker_id);
  assert.equal(result.operation.status, 'aborted');
  assert.equal(result.operation.error.code, 'OPERATION_TIMEOUT');
});

test('aborting a wait stops only that waiter and a result byte limit remains a failure', async t => {
  const waiting = await manager(t, 'hang');
  const launched = await waiting.value.dispatch({ role: 'reviewer', task: 'keep running' });
  const signal = new AbortController();
  const pending = waiting.value.wait(launched.worker_id, { timeout_ms: 1000, signal: signal.signal });
  signal.abort();
  await assert.rejects(pending, /wait.*cancel/i);
  assert.equal(waiting.value.status(launched.worker_id).operation.status, 'running');
  await waiting.value.cancel(launched.worker_id);
  const limited = await manager(t, 'normal', { limits: { ...limits, max_result_bytes: 16 } });
  const result = await limited.value.dispatch({ role: 'reviewer', task: 'large output' });
  const final = await limited.value.wait(result.worker_id, { timeout_ms: 1000 });
  assert.equal(final.operation.status, 'failed');
  assert.equal(final.operation.error.code, 'RESULT_LIMIT');
});

test('two native final vectors sum once while cumulative stream snapshots remain uncharged', async t => {
  const { value } = await manager(t, 'cumulative-stream');
  const first = await value.dispatch({ role: 'reviewer', task: 'first vector' });
  await value.wait(first.worker_id, { timeout_ms: 1000 });
  await value.followUp(first.worker_id, { task: 'second vector' });
  await value.wait(first.worker_id, { timeout_ms: 1000 });
  const collected = await value.collect(first.worker_id);
  assert.deepEqual(collected.usage, { input: 10, output: 14, cacheRead: 4, cacheWrite: 2, totalTokens: 30,
    reasoning: 6, cacheWrite1h: 2, cost: { input: .02, output: .04, cacheRead: .002, cacheWrite: .004, total: .066 } });
});

test('known pre-delivery failure can retry; an unconfirmed delivered result remains explicit until native confirmation', async t => {
  const { value, entries } = await manager(t);
  const launched = await value.dispatch({ role: 'reviewer', task: 'delivery windows' });
  await value.wait(launched.worker_id, { timeout_ms: 1000 });
  const undelivered = await value.collect(launched.worker_id);
  value.abandonCollection(launched.worker_id, undelivered.receipt.receipt_id);
  const delivered = await value.collect(launched.worker_id);
  assert.deepEqual(delivered.usage, undelivered.usage);
  const pending = await value.collect(launched.worker_id);
  assert.equal(pending.usage_status, 'awaiting_confirmation');
  assert.equal(pending.usage, undefined);
  entries.push({ type: 'message', message: { role: 'toolResult', usage: delivered.usage, details: { th_worker_receipt: delivered.receipt } } });
  assert.equal((await value.collect(launched.worker_id)).usage, undefined);
});

test('missing assistant telemetry differs from a native vector that explicitly reports zero', async t => {
  const missing = await manager(t, 'missing-usage');
  const absent = await missing.value.dispatch({ role: 'reviewer', task: 'missing usage' });
  await missing.value.wait(absent.worker_id, { timeout_ms: 1000 });
  const unknown = await missing.value.collect(absent.worker_id);
  assert.equal(unknown.usage, undefined);
  assert.ok(unknown.missing_usage.some(item => item.dimension === 'usage'));
  const zero = await manager(t, 'zero-usage');
  const explicit = await zero.value.dispatch({ role: 'reviewer', task: 'zero usage' });
  await zero.value.wait(explicit.worker_id, { timeout_ms: 1000 });
  const reported = await zero.value.collect(explicit.worker_id);
  assert.equal(reported.usage.input, 0);
  assert.equal(reported.receipt.usage_status, 'complete');
  assert.deepEqual(reported.missing_usage, []);
});

test('an explicitly missing provider resource refuses dispatch without launching or changing models', async t => {
  const { value, options, directory } = await manager(t, 'normal', { providerResources: ['/missing/explicit-provider.ts'] });
  const log = path.join(directory, 'missing-resource.jsonl');
  options.env.TH_PI_FIXTURE_LOG = log;
  await assert.rejects(value.dispatch({ role: 'reviewer', task: 'must not launch' }), error => error.code === 'RESOURCE_UNAVAILABLE');
  await assert.rejects(fs.access(log), { code: 'ENOENT' });
  assert.deepEqual(options.parent.model, { provider: 'fixture', id: 'fixture-model' });
});

test('provider failures and crashes remain failures or interruptions', async t => {
  for (const [scenario, expected] of [['provider-error', 'failed'], ['crash-after-ack', 'interrupted']]) {
    const { value } = await manager(t, scenario);
    const launched = await value.dispatch({ role: 'reviewer', task: 'uncertain task' });
    const result = await value.wait(launched.worker_id, { timeout_ms: 1000 });
    assert.equal(result.operation.status, expected);
  }
});

test('persisted parent tool-result receipts deduplicate usage; custom entries do not charge', async t => {
  const { value, entries } = await manager(t);
  const launched = await value.dispatch({ role: 'reviewer', task: 'count once' });
  await value.wait(launched.worker_id, { timeout_ms: 1000 });
  const first = await value.collect(launched.worker_id);
  entries.push({ type: 'custom', customType: 'pretend-charge', data: first.receipt });
  const unconfirmed = await value.collect(launched.worker_id);
  assert.equal(unconfirmed.usage, undefined);
  assert.equal(unconfirmed.usage_status, 'awaiting_confirmation');
  entries.push({ type: 'message', message: { role: 'toolResult', usage: first.usage, details: { th_worker_receipt: first.receipt } } });
  const duplicate = await value.collect(launched.worker_id);
  assert.equal(duplicate.usage, undefined);
  assert.equal(duplicate.receipt.already_attributed, true);
});

test('simultaneous collects deliver at most one native usage vector', async t => {
  const { value } = await manager(t);
  const launched = await value.dispatch({ role: 'reviewer', task: 'parallel collection' });
  await value.wait(launched.worker_id, { timeout_ms: 1000 });
  const collected = await Promise.all([value.collect(launched.worker_id), value.collect(launched.worker_id)]);
  assert.equal(collected.filter(item => item.usage).length, 1);
});

test('completed native results survive reload and confirmed usage is never charged again', async t => {
  const setup = await manager(t);
  const launched = await setup.value.dispatch({ role: 'reviewer', task: 'retain useful final result' });
  await setup.value.wait(launched.worker_id, { timeout_ms: 1000 });
  const first = await setup.value.collect(launched.worker_id);
  setup.entries.push({ type: 'message', message: { role: 'toolResult', usage: first.usage, details: { th_worker_receipt: first.receipt } } });
  await setup.value.shutdown();
  const restored = new WorkerManager(setup.options);
  setup.defer(() => restored.shutdown());
  await restored.restore([setup.references.at(-1)]);
  const result = await restored.collect(launched.worker_id);
  assert.equal(result.operation.status, 'completed');
  assert.match(result.operation.text, /retain useful final result/);
  assert.equal(result.usage, undefined);
  await assert.rejects(setup.value.followUp(launched.worker_id, { task: 'stale context' }), /closed/i);
});

test('a fresh native selection is inherited by new workers while an existing conversation retains its model', async t => {
  const { value } = await manager(t);
  assert.doesNotThrow(() => value.updateParentSelection({ provider: 'fixture', id: 'fixture-model' }, 'high'));
  const launched = await value.dispatch({ role: 'reviewer', task: 'current model' });
  await value.wait(launched.worker_id, { timeout_ms: 1000 });
  value.updateParentSelection(undefined, 'off');
  await assert.rejects(value.dispatch({ role: 'reviewer', task: 'no substitute model' }), /model/i);
  assert.equal((await value.followUp(launched.worker_id, { task: 'same conversation' })).worker_id, launched.worker_id);
});

test('missing native usage dimensions stay visible without fabricated zero totals', async t => {
  const { value } = await manager(t, 'partial-usage');
  const launched = await value.dispatch({ role: 'reviewer', task: 'incomplete telemetry' });
  await value.wait(launched.worker_id, { timeout_ms: 1000 });
  const result = await value.collect(launched.worker_id);
  assert.equal(result.usage, undefined);
  assert.equal(result.receipt.usage_status, 'partial');
  assert.equal(result.available_usage.output, 7);
  assert.ok(result.missing_usage.some(item => item.dimension === 'input'));
});

test('reload restores owned native sessions, refuses different owners, and never replays interrupted input', async t => {
  const setup = await manager(t, 'hang');
  const launched = await setup.value.dispatch({ role: 'reviewer', task: 'do not replay' });
  await setup.value.shutdown();
  const reference = setup.references.at(-1);
  const restored = new WorkerManager(setup.options);
  setup.defer(() => restored.shutdown());
  await restored.restore([reference]);
  assert.equal(restored.status(launched.worker_id).operation.status, 'interrupted');
  const before = await fs.readFile(reference.session_file, 'utf8');
  const collected = await restored.collect(launched.worker_id);
  assert.equal(collected.operation.status, 'interrupted');
  assert.equal((await fs.readFile(reference.session_file, 'utf8')).split('do not replay').length, before.split('do not replay').length);
  const foreign = new WorkerManager({ ...setup.options, parent: { ...setup.options.parent, session_id: 'another-owner' } });
  setup.defer(() => foreign.shutdown());
  await assert.rejects(foreign.restore([reference]), /owner|session/i);
});

test('retained source-bound Space takes precedence and both native operations remain exactly unavailable', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'th-pi-bound-space-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const binding = { context: { kind: 'gpt-space', space_id: 'space_fixture', container_page_id: 'page_container',
    effort_page_id: 'page_effort', url: 'https://chatgpt.com/space/page_effort', created_date: '2026-10-17', slug: 'worker-proof',
    source_associations: [{ kind: 'repository', identity: 'repository:merchant', role: 'writable-owner', verified: true,
      host_paths: [{ host: 'fixture', path: directory }] }] }, operational_directory: null };
  const retained = [{ type: 'custom', customType: 'th-workspace-binding', data: { binding } }];
  const before = structuredClone(retained);
  for (const settings of [{ 'workspace-mode': 'local' }, { 'workspace-mode': null, 'logs-mode': 'obsidian' }]) {
    const selected = inspectPiWorkspace(settings, retained);
    assert.equal(selected.status, 'ready');
    assert.deepEqual(selected.binding, binding);
    assert.deepEqual(selected.operations, {
      read: { status: 'unavailable', operation: 'read', reason_code: 'native_space_read_unavailable' },
      write: { status: 'unavailable', operation: 'write', reason_code: 'native_space_write_unavailable' },
    });
    assert.deepEqual(await fs.readdir(directory), []);
    assert.deepEqual(retained, before);
  }
  const unbound = inspectPiWorkspace({ 'workspace-mode': 'gpt-space' });
  assert.equal(unbound.status, 'pending');
  assert.equal(unbound.binding, null);
  assert.equal(unbound.operations.read.reason_code, 'native_space_read_unavailable');
});

test('retained native association mismatch matrix refuses rebind without mutating any session file', async t => {
  const setup = await manager(t);
  const launched = await setup.value.dispatch({ role: 'reviewer', task: 'association proof' });
  await setup.value.wait(launched.worker_id, { timeout_ms: 1000 });
  await setup.value.shutdown();
  const reference = setup.references.at(-1);
  const original = await fs.readFile(reference.session_file);
  const foreignFile = path.join(setup.directory, 'foreign.jsonl');
  await fs.writeFile(foreignFile, original);
  const wrongHeader = path.join(path.dirname(reference.session_file), 'wrong-header.jsonl');
  const lines = original.toString('utf8').split('\n');
  lines[0] = JSON.stringify({ ...JSON.parse(lines[0]), id: 'foreign-header-id' });
  const wrongBytes = lines.join('\n');
  await fs.writeFile(wrongHeader, wrongBytes);
  for (const patch of [
    { owner_session_id: 'foreign-owner' }, { owner_cwd: path.dirname(setup.directory) }, { role: 'orchestrator' },
    { cwd: path.dirname(setup.directory) }, { session_id: 'foreign-session' }, { session_file: foreignFile },
    { session_file: path.join(path.dirname(reference.session_file), 'absent.jsonl') }, { session_file: wrongHeader },
    { prompt_sha256: 'wrong-hash' },
  ]) {
    const fresh = new WorkerManager(setup.options);
    await assert.rejects(fresh.restore([{ ...reference, ...patch }]));
    await fresh.shutdown();
    assert.deepEqual(await fs.readFile(reference.session_file), original);
    assert.deepEqual(await fs.readFile(foreignFile), original);
    assert.equal(await fs.readFile(wrongHeader, 'utf8'), wrongBytes);
  }
});

test('crashes before and after acknowledgement retain interrupted ownership without automatic replay', async t => {
  for (const scenario of ['crash-before-ack', 'crash-after-ack']) {
    const setup = await manager(t, scenario);
    const log = path.join(setup.directory, 'crash-commands.jsonl');
    setup.options.env.TH_PI_FIXTURE_LOG = log;
    const launched = await setup.value.dispatch({ role: 'reviewer', task: 'uncertain execution' });
    const stopped = await setup.value.wait(launched.worker_id, { timeout_ms: 1000 });
    assert.equal(stopped.operation.status, 'interrupted');
    await setup.value.shutdown();
    const fresh = new WorkerManager(setup.options);
    setup.defer(() => fresh.shutdown());
    await fresh.restore([setup.references.at(-1)]);
    const result = await fresh.collect(launched.worker_id);
    assert.equal(result.operation.status, 'interrupted');
    const commands = (await fs.readFile(log, 'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(commands.filter(command => command.type === 'prompt' && !command.message.startsWith('/')).length, 1);
  }
});
