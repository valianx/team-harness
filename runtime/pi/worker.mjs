import { spawn, execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

/** Finite process, queue and memory bounds; configuration can only tighten or finitely replace these values. */
export const DEFAULT_LIMITS = Object.freeze({
  max_workers: 4, max_followups: 8, max_pending: 16, max_sessions: 64,
  max_frame_bytes: 1_048_576, max_stderr_bytes: 65_536, max_result_bytes: 65_536,
  startup_ms: 15_000, request_ms: 30_000, operation_ms: 600_000, shutdown_ms: 2_000,
});
const TOOL_ORDER = ['read', 'grep', 'find', 'ls', 'bash', 'edit', 'write'];
const WORKER_ENTRY = 'th-pi-worker';
const RECEIPT_VERSION = 1;
const bridgePath = fileURLToPath(new URL('./extension.ts', import.meta.url));
const text = (value, maximum = 65_536) => typeof value === 'string' && value.length > 0
  && Buffer.byteLength(value) <= maximum && !value.includes('\0');
const clone = value => JSON.parse(JSON.stringify(value));
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const failure = (code, message) => Object.assign(new Error(message), { code });
const PUBLIC_CODES = new Set(('INVALID_LIMIT INVALID_PATH INVALID_LAUNCHER INVALID_SDK VERSION_UNAVAILABLE VERSION_MISMATCH '
  + 'SPAWN_FAILED PROCESS_EXIT STDIN_CLOSED STDOUT_ERROR TRUNCATED_FRAME PROTOCOL_EOF DIAGNOSTIC_LIMIT FRAME_LIMIT '
  + 'INVALID_PROTOCOL INVALID_RESPONSE COMMAND_FAILED EVENT_FAILED WRITE_TIMEOUT PENDING_LIMIT RESPONSE_TIMEOUT PROCESS_STOPPED '
  + 'MODEL_UNAVAILABLE MODEL_CATALOG_UNAVAILABLE MODEL_SELECTION_MISSING INVALID_PROFILE SESSION_INVALID SESSION_MISMATCH CONFIG_INVALID CATALOG_INVALID OWNER_INVALID RUNTIME_CLOSED '
  + 'WORKER_UNKNOWN POOL_LIMIT RESOURCE_INVALID RESOURCE_UNAVAILABLE STATE_MISMATCH BRIDGE_UNAVAILABLE BRIDGE_INVALID CAPABILITY_MISMATCH '
  + 'WORKER_BUSY DISPOSITION_INVALID ROLE_INVALID TASK_INVALID SESSION_LIMIT PROMPT_INVALID QUEUE_LIMIT WAIT_INVALID WAITER_LIMIT '
  + 'WAIT_ABORTED USAGE_INVALID OWNER_MISMATCH PROMPT_MISMATCH CLEANUP_INCOMPLETE').split(' '));

/** Expose bounded, known runtime reasons without forwarding native exceptions or credentials. */
export const workerFailureCode = error => PUBLIC_CODES.has(error?.code) ? error.code : 'WORKER_ERROR';
const boundedError = error => ({ code: workerFailureCode(error),
  message: error?.publicMessage || 'Native worker operation could not be completed' });
const publicFailure = (code, message) => Object.assign(failure(code, message), { publicMessage: message });

function limitsFrom(overrides = {}) {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) throw failure('INVALID_LIMIT', 'Worker limits are invalid');
  const result = { ...DEFAULT_LIMITS };
  for (const [key, value] of Object.entries(overrides)) {
    if (!(key in result) || !Number.isSafeInteger(value) || value < 1 || value > 86_400_000)
      throw failure('INVALID_LIMIT', 'Worker limit is invalid');
    result[key] = value;
  }
  if (result.max_workers > 32 || result.max_followups > 128 || result.max_pending > 128 || result.max_sessions > 256
      || result.max_frame_bytes > 16_777_216 || result.max_stderr_bytes > 1_048_576 || result.max_result_bytes > 1_048_576)
    throw failure('INVALID_LIMIT', 'Worker memory or concurrency limit is invalid');
  return Object.freeze(result);
}

async function absoluteFile(value, label) {
  if (!text(value, 8192) || !path.isAbsolute(value)) throw failure('INVALID_PATH', label + ' must be an absolute file');
  const resolved = await fs.realpath(value);
  if (!(await fs.stat(resolved)).isFile()) throw failure('INVALID_PATH', label + ' must be a regular file');
  return resolved;
}

async function absoluteDirectory(value, label) {
  if (!text(value, 8192) || !path.isAbsolute(value)) throw failure('INVALID_PATH', label + ' must be an absolute directory');
  const resolved = await fs.realpath(value);
  if (!(await fs.stat(resolved)).isDirectory()) throw failure('INVALID_PATH', label + ' must be a directory');
  return resolved;
}

function runVersion(executable, args, limits, env) {
  return new Promise((resolve, reject) => {
    let child, finished = false, timedOut = false, startupTimer, termTimer, killTimer;
    const exited = () => Boolean(child && (child.exitCode !== null || child.signalCode !== null));
    const finish = (error, value) => {
      if (finished) return;
      finished = true;
      clearTimeout(startupTimer); clearTimeout(termTimer); clearTimeout(killTimer);
      child.off('exit', onExit);
      child.stdin?.destroy(); child.stdout?.destroy(); child.stderr?.destroy();
      child.unref();
      if (error) reject(Object.assign(error, { cleanup_complete: exited() }));
      else resolve(value);
    };
    const failed = () => finish(publicFailure('VERSION_UNAVAILABLE', 'Worker version probe failed'));
    const onExit = () => { if (timedOut) failed(); };
    child = execFile(executable, args, { shell: false, windowsHide: true, maxBuffer: 8192, env },
      (error, stdout) => error || timedOut ? failed() : finish(null, stdout.trim()));
    child.once('exit', onExit);
    child.stdin?.end();
    startupTimer = setTimeout(() => {
      timedOut = true;
      if (exited()) { failed(); return; }
      try { child.kill('SIGTERM'); } catch {}
      termTimer = setTimeout(() => {
        if (exited()) { failed(); return; }
        try { child.kill('SIGKILL'); } catch {}
        killTimer = setTimeout(failed, limits.shutdown_ms);
      }, limits.shutdown_ms);
    }, limits.startup_ms);
  });
}

/** Resolve the installed public RPC export or an explicit compiled Pi executable, without a shell or PATH lookup. */
export async function resolveLauncher(descriptor, options = {}) {
  const limits = limitsFrom(options.limits);
  if (!descriptor || !['node', 'binary'].includes(descriptor.kind)
      || Object.keys(descriptor).some(key => !(descriptor.kind === 'node' ? ['kind', 'executable', 'sdk_root'] : ['kind', 'executable']).includes(key)))
    throw failure('INVALID_LAUNCHER', 'Worker launcher must explicitly select node or binary');
  const executable = await absoluteFile(descriptor.executable, 'Worker executable');
  if (descriptor.kind === 'binary') {
    if (await runVersion(executable, ['--version'], limits, options.env) !== '1.3.0')
      throw failure('VERSION_MISMATCH', 'Worker Pi version is unsupported');
    return { executable, args: ['--mode', 'rpc'], kind: 'binary' };
  }
  const root = await absoluteDirectory(descriptor.sdk_root, 'Worker SDK root');
  const metadata = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  if (metadata.name !== '@earendil-works/pi-coding-agent' || metadata.version !== '1.3.0')
    throw failure('VERSION_MISMATCH', 'Worker SDK version is unsupported');
  const exported = metadata.exports?.['./rpc-entry']?.import;
  const cli = metadata.bin?.pi;
  if (!text(exported, 1024) || !text(cli, 1024)) throw failure('INVALID_SDK', 'Worker SDK public entry is unavailable');
  const resolveEntry = async relative => {
    const entry = await absoluteFile(path.resolve(root, relative), 'Worker SDK entry');
    if (path.relative(root, entry).startsWith('..') || path.isAbsolute(path.relative(root, entry)))
      throw failure('INVALID_SDK', 'Worker SDK public entry escapes its package');
    return entry;
  };
  const [entry, cliEntry] = await Promise.all([resolveEntry(exported), resolveEntry(cli)]);
  const runtime = await runVersion(executable, ['--version'], limits, options.env);
  const match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(runtime);
  if (!match || +match[1] < 22 || (+match[1] === 22 && +match[2] < 19))
    throw failure('VERSION_MISMATCH', 'Worker Node version must be at least 22.19');
  if (await runVersion(executable, [cliEntry, '--version'], limits, options.env) !== '1.3.0')
    throw failure('VERSION_MISMATCH', 'Worker Pi version is unsupported');
  return { executable, args: [entry], kind: 'node' };
}

/** Own one public JSONL child, including bounded framing, backpressure, request correlation and shutdown. */
export class PiRpcTransport {
  #child;
  #limits;
  #pending = new Map();
  #listeners = new Set();
  #closeListeners = new Set();
  #buffer = Buffer.alloc(0);
  #stderr = Buffer.alloc(0);
  #fault;
  #sequence = 0;
  #writes = Promise.resolve();
  #writeCount = 0;
  #stopping;
  #closed;

  static async start(descriptor, options) {
    const launch = await resolveLauncher(descriptor, options);
    const client = new PiRpcTransport(launch, options);
    try {
      options.onSpawn?.(client);
      const state = await client.request({ type: 'get_state' }, client.#limits.startup_ms);
      if (!text(state?.sessionId, 128) || !path.isAbsolute(state?.sessionFile || '')
          || typeof state?.isStreaming !== 'boolean' || typeof state?.isCompacting !== 'boolean')
        throw publicFailure('STATE_MISMATCH', 'Worker startup state is invalid');
      return client;
    } catch (error) {
      await client.stop();
      throw error;
    }
  }

  constructor(launch, options) {
    this.#limits = limitsFrom(options.limits);
    this.#child = spawn(launch.executable, [...launch.args, ...(options.args || [])], {
      cwd: options.cwd, env: options.env, stdio: ['pipe', 'pipe', 'pipe'], shell: false, windowsHide: true,
    });
    this.#closed = new Promise(resolve => this.#child.once('close', resolve));
    this.#child.once('error', () => this.#fail(publicFailure('SPAWN_FAILED', 'Worker process failed to start')));
    this.#child.once('exit', (code, signal) => this.#fail(publicFailure('PROCESS_EXIT',
      'Worker process exited (code=' + code + ', signal=' + signal + ')')));
    this.#child.stdin.on('error', () => this.#fail(publicFailure('STDIN_CLOSED', 'Worker input closed')));
    this.#child.stdout.on('error', () => this.#fail(publicFailure('STDOUT_ERROR', 'Worker protocol stream failed')));
    this.#child.stdout.on('end', () => {
      if (this.#buffer.length) this.#fail(publicFailure('TRUNCATED_FRAME', 'Worker protocol frame was truncated'));
      else if (!this.#stopping) this.#fail(publicFailure('PROTOCOL_EOF', 'Worker protocol ended'));
    });
    this.#child.stdout.on('data', chunk => this.#read(chunk));
    this.#child.stderr.on('data', chunk => {
      if (this.#stderr.length + chunk.length > this.#limits.max_stderr_bytes) {
        this.#fail(publicFailure('DIAGNOSTIC_LIMIT', 'Worker diagnostic limit exceeded'));
      } else this.#stderr = Buffer.concat([this.#stderr, chunk]);
    });
  }

  #read(chunk) {
    if (this.#fault) return;
    this.#buffer = Buffer.concat([this.#buffer, chunk]);
    let newline;
    while ((newline = this.#buffer.indexOf(10)) >= 0) {
      if (newline + 1 > this.#limits.max_frame_bytes) {
        this.#fail(publicFailure('FRAME_LIMIT', 'Worker protocol frame limit exceeded'));
        return;
      }
      let frame = this.#buffer.subarray(0, newline);
      this.#buffer = this.#buffer.subarray(newline + 1);
      if (frame.at(-1) === 13) frame = frame.subarray(0, -1);
      if (!frame.length) continue;
      let record;
      try {
        record = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(frame));
        if (!record || typeof record !== 'object' || Array.isArray(record) || !text(record.type, 128)) throw new Error();
      } catch {
        this.#fail(publicFailure('INVALID_PROTOCOL', 'Worker emitted malformed protocol data'));
        return;
      }
      if (record.type === 'response') {
        const pending = this.#pending.get(record.id);
        if (!pending || record.command !== pending.command || typeof record.success !== 'boolean') {
          this.#fail(publicFailure('INVALID_RESPONSE', 'Worker response did not match a pending command'));
          return;
        }
        this.#pending.delete(record.id);
        clearTimeout(pending.timer);
        if (record.success) pending.resolve(record.data);
        else pending.reject(publicFailure('COMMAND_FAILED', 'Worker command was refused'));
      } else if (record.type === 'extension_ui_request') {
        if (['select', 'confirm', 'input', 'editor'].includes(record.method))
          this.#send({ type: 'extension_ui_response', id: record.id, cancelled: true }).catch(error => this.#fail(error));
      } else {
        for (const listener of [...this.#listeners]) {
          try { listener(record); } catch { this.#fail(publicFailure('EVENT_FAILED', 'Worker event could not be consumed')); }
        }
      }
    }
    if (this.#buffer.length > this.#limits.max_frame_bytes)
      this.#fail(publicFailure('FRAME_LIMIT', 'Worker protocol frame limit exceeded'));
  }

  #fail(error) {
    if (this.#fault) return;
    this.#fault = error;
    for (const pending of this.#pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.#pending.clear();
    for (const listener of [...this.#closeListeners]) listener(error);
    this.#closeListeners.clear();
    if (!this.#stopping) void this.stop();
  }

  #send(record) {
    if (this.#writeCount >= this.#limits.max_pending) return Promise.reject(publicFailure('PENDING_LIMIT', 'Worker pending write limit reached'));
    const bytes = Buffer.from(JSON.stringify(record) + '\n');
    if (bytes.length > this.#limits.max_frame_bytes) return Promise.reject(publicFailure('FRAME_LIMIT', 'Worker command frame limit exceeded'));
    this.#writeCount++;
    const write = async () => {
      if (this.#fault || !this.#child.stdin.writable) throw this.#fault || publicFailure('STDIN_CLOSED', 'Worker input closed');
      await new Promise((resolve, reject) => {
        const stream = this.#child.stdin;
        let done = false;
        const finish = error => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          stream.off('error', onError);
          stream.off('drain', onDrain);
          error ? reject(error) : resolve();
        };
        const onError = () => finish(publicFailure('STDIN_CLOSED', 'Worker input closed'));
        const onDrain = () => finish();
        const timer = setTimeout(() => finish(publicFailure('WRITE_TIMEOUT', 'Worker input backpressure timed out')), this.#limits.request_ms);
        stream.once('error', onError);
        if (stream.write(bytes)) finish();
        else stream.once('drain', onDrain);
      });
    };
    this.#writes = this.#writes.then(write).finally(() => { this.#writeCount--; });
    this.#writes.catch(() => {});
    return this.#writes;
  }

  /** Correlate one public command; failed or timed-out commands never become successful data. */
  request(command, timeout = this.#limits.request_ms) {
    if (this.#fault) return Promise.reject(this.#fault);
    if (this.#pending.size >= this.#limits.max_pending) return Promise.reject(publicFailure('PENDING_LIMIT', 'Worker pending request limit reached'));
    const id = 'th-' + (++this.#sequence);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.#fail(publicFailure('RESPONSE_TIMEOUT', 'Worker response timeout')), timeout);
      this.#pending.set(id, { command: command.type, resolve, reject, timer });
      this.#send({ ...command, id }).catch(error => this.#fail(error));
    });
  }

  /** Subscribe before issuing a prompt so fast completion cannot be lost. */
  onEvent(listener) { this.#listeners.add(listener); return () => this.#listeners.delete(listener); }

  /** Observe terminal process failures without inspecting private child handles. */
  onClose(listener) {
    if (this.#fault) { queueMicrotask(() => listener(this.#fault)); return () => {}; }
    this.#closeListeners.add(listener);
    return () => this.#closeListeners.delete(listener);
  }

  /** Request native disposal through stdin EOF, then bound termination of this owned child. */
  stop() {
    if (this.#stopping) return this.#stopping;
    this.#stopping = (async () => {
      this.#child.stdin.end();
      let timer;
      const graceful = await Promise.race([this.#closed.then(() => true),
        new Promise(resolve => { timer = setTimeout(() => resolve(false), this.#limits.shutdown_ms); })]);
      clearTimeout(timer);
      if (!graceful) {
        this.#child.kill('SIGTERM');
        const exited = await Promise.race([this.#closed.then(() => true),
          new Promise(resolve => { timer = setTimeout(() => resolve(false), this.#limits.shutdown_ms); })]);
        clearTimeout(timer);
        if (!exited) {
          this.#child.kill('SIGKILL');
          await Promise.race([this.#closed, new Promise(resolve => { timer = setTimeout(resolve, this.#limits.shutdown_ms); })]);
          clearTimeout(timer);
        }
      }
      this.#fail(publicFailure('PROCESS_STOPPED', 'Worker process stopped'));
      this.#listeners.clear();
      return { stopped: this.#child.exitCode !== null || this.#child.signalCode !== null,
        cleanup_complete: this.#child.exitCode !== null || this.#child.signalCode !== null };
    })();
    return this.#stopping;
  }
}

function modelSelection(value) {
  if (!value || !text(value.provider, 256) || !text(value.id, 512) || value.provider === 'unknown' || value.id === 'unknown')
    throw publicFailure('MODEL_UNAVAILABLE', 'The active native model is unavailable for a worker');
  return { provider: value.provider, id: value.id };
}

/** Validate bridge input independently from model-controlled tool arguments. */
export function validateWorkerProfile(value) {
  if (!value || value.schema_version !== 1 || !text(value.worker_id, 128) || !text(value.owner_session_id, 128)
      || !text(value.role, 128) || !path.isAbsolute(value.cwd || '') || !Array.isArray(value.tools)
      || !value.tools.length || value.tools.some(tool => !TOOL_ORDER.includes(tool)) || new Set(value.tools).size !== value.tools.length
      || typeof value.read_only !== 'boolean' || (value.read_only && value.tools.some(tool => ['bash', 'edit', 'write'].includes(tool))))
    throw publicFailure('INVALID_PROFILE', 'Worker capability profile is invalid');
  return clone(value);
}

async function sessionHeader(file, expected) {
  if (!path.isAbsolute(file || '')) throw publicFailure('SESSION_INVALID', 'Worker native session file is invalid');
  const before = await fs.lstat(file);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > 16_777_216)
    throw publicFailure('SESSION_INVALID', 'Worker native session file is unsafe');
  const handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const pinned = await handle.stat();
    if (pinned.dev !== before.dev || pinned.ino !== before.ino) throw publicFailure('SESSION_INVALID', 'Worker native session changed');
    const buffer = Buffer.alloc(16_384);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const newline = buffer.subarray(0, bytesRead).indexOf(10);
    if (newline < 0) throw publicFailure('SESSION_INVALID', 'Worker native session header is incomplete');
    const header = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, newline)));
    if (header.type !== 'session' || header.id !== expected.session_id || header.cwd !== expected.cwd)
      throw publicFailure('SESSION_MISMATCH', 'Worker native session identity or directory differs');
    return header;
  } finally { await handle.close(); }
}

function usageEvidence(entries) {
  const values = [], missing = [];
  for (const entry of entries) {
    const usage = entry.type === 'message' ? entry.message?.usage
      : ['usage', 'compaction', 'branch_summary'].includes(entry.type) ? entry.usage : undefined;
    if (usage !== undefined) values.push({ id: entry.id, usage });
    else if (entry.type === 'message' && entry.message?.role === 'assistant') missing.push({ entry_id: entry.id, dimension: 'usage' });
  }
  const numeric = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const available = {}, cost = {};
  for (const key of ['input', 'output', 'cacheRead', 'cacheWrite', 'totalTokens', 'reasoning', 'cacheWrite1h']) {
    const observed = values.filter(value => numeric(value.usage?.[key]));
    if (observed.length) available[key] = observed.reduce((sum, value) => sum + value.usage[key], 0);
    if (!['reasoning', 'cacheWrite1h'].includes(key)) {
      for (const value of values.filter(value => !numeric(value.usage?.[key]))) missing.push({ entry_id: value.id, dimension: key });
    }
  }
  for (const key of ['input', 'output', 'cacheRead', 'cacheWrite', 'total']) {
    const observed = values.filter(value => numeric(value.usage?.cost?.[key]));
    if (observed.length) cost[key] = observed.reduce((sum, value) => sum + value.usage.cost[key], 0);
    for (const value of values.filter(value => !numeric(value.usage?.cost?.[key]))) missing.push({ entry_id: value.id, dimension: 'cost.' + key });
  }
  if (Object.keys(cost).length) available.cost = cost;
  let usage;
  if (values.length && !missing.length) {
    usage = clone(available);
    for (const key of ['reasoning', 'cacheWrite1h']) if (!values.every(value => numeric(value.usage?.[key]))) delete usage[key];
  }
  return { usage, available_usage: available, missing_usage: missing };
}

/** Read-only settings choose only trusted launch/provider inputs, never model-supplied command strings. */
export function workerConfiguration(settings, native) {
  const selected = Object.hasOwn(settings || {}, 'pi-workers') ? settings['pi-workers'] : {};
  if (!selected || typeof selected !== 'object' || Array.isArray(selected))
    throw publicFailure('CONFIG_INVALID', 'Pi worker configuration is invalid');
  return { descriptor: Object.hasOwn(selected, 'launcher') ? selected.launcher : { kind: 'node', executable: process.execPath, sdk_root: native.sdkRoot },
    limits: limitsFrom(selected.limits), providerResources: Object.hasOwn(selected, 'provider_resources') ? selected.provider_resources : [] };
}

/** Coordinate bounded native conversations; retained entries contain references rather than a second transcript. */
export class WorkerManager {
  #options;
  #limits;
  #workers = new Map();
  #roles = new Map();
  #closed = false;

  constructor(options) {
    this.#options = options;
    this.#limits = limitsFrom(options.limits);
    if (!options.catalog || options.catalog.schema_version !== 1 || options.catalog.runtime !== 'pi' || !Array.isArray(options.catalog.agents))
      throw publicFailure('CATALOG_INVALID', 'Pi worker catalog is invalid');
    for (const role of options.catalog.agents) {
      if (!text(role.name, 128) || role.name === 'orchestrator' || this.#roles.has(role.name) || role.source !== 'agents/' + role.name + '.md'
          || !text(role.prompt, 1024) || !Array.isArray(role.tools) || !role.tools.length || role.tools.some(tool => !TOOL_ORDER.includes(tool))
          || typeof role.read_only !== 'boolean' || (role.read_only && role.tools.some(tool => ['bash', 'edit', 'write'].includes(tool))))
        throw publicFailure('CATALOG_INVALID', 'Pi eligible role catalog is invalid');
      this.#roles.set(role.name, clone(role));
    }
    if (!text(options.parent?.session_id, 128) || !path.isAbsolute(options.parent?.cwd || ''))
      throw publicFailure('OWNER_INVALID', 'A native primary session owner is required');
  }

  #worker(id) {
    if (this.#closed) throw publicFailure('RUNTIME_CLOSED', 'Worker runtime is closed');
    const value = this.#workers.get(id);
    if (!value) throw publicFailure('WORKER_UNKNOWN', 'Worker does not belong to this primary session');
    return value;
  }

  #state(worker) {
    return { worker_id: worker.id, role: worker.role.name, state: worker.active || worker.draining ? 'running'
      : worker.cleanupComplete === false ? 'unavailable' : worker.reclaiming ? 'stopping'
      : worker.connecting ? 'starting' : worker.transport ? 'ready' : 'dormant',
      queued: worker.queue.length, session_id: worker.sessionId, session_file: worker.sessionFile,
      operation: worker.latest ? clone(worker.latest) : null, cleanup_complete: worker.cleanupComplete ?? null };
  }

  #reference(worker) {
    return { schema_version: 1, worker_id: worker.id, owner_session_id: this.#options.parent.session_id,
      owner_cwd: this.#options.parent.cwd, role: worker.role.name, cwd: worker.cwd, session_id: worker.sessionId,
      session_file: worker.sessionFile, prompt_sha256: worker.promptHash, model: worker.model, thinking_level: worker.thinking,
      operation_id: worker.latest?.id, operation_status: worker.latest?.status || 'idle',
      operation_disposition: worker.latest?.disposition || null, operation_error: worker.latest?.error,
      operation_from_entry_id: worker.latest?.from_entry_id ?? null, cleanup_complete: worker.cleanupComplete ?? null };
  }

  async #persist(worker) {
    await this.#options.onReference?.(this.#reference(worker));
  }

  async #connect(worker, resume = false) {
    if (this.#closed) throw publicFailure('RUNTIME_CLOSED', 'Worker runtime is closed');
    if (worker.reclaiming) await worker.reclaiming;
    if (this.#closed) throw publicFailure('RUNTIME_CLOSED', 'Worker runtime is closed');
    if (worker.connecting) return worker.connecting;
    if (worker.cleanupComplete === false) throw publicFailure('CLEANUP_INCOMPLETE', 'The previous owned worker cleanup is unconfirmed');
    if (worker.transport) return;
    worker.connecting = this.#reserveAndOpen(worker, resume || !!worker.sessionFile);
    try { await worker.connecting; } finally { worker.connecting = null; worker.reserved = false; }
  }

  #occupiedSlots() {
    return [...this.#workers.values()].filter(value => value.ownedTransport || value.reserved || value.cleanupComplete === false).length;
  }

  async #reserveAndOpen(worker, resume) {
    if (this.#occupiedSlots() >= this.#limits.max_workers) {
      const idle = [...this.#workers.values()].find(value => value !== worker && value.transport && value.ownedTransport
        && !value.active && !value.connecting && !value.collecting && !value.draining && !value.preparingRun
        && !value.queue.length && !value.cancelling && !value.reclaiming && value.cleanupComplete !== false
        && ['completed', 'handled', 'failed', 'aborted', 'interrupted'].includes(value.latest?.status));
      if (!idle) throw publicFailure('POOL_LIMIT', 'Worker pool limit reached');
      idle.reclaiming = (async () => { await this.#stopTransport(idle); await this.#persist(idle); })();
      try { await idle.reclaiming; } finally { idle.reclaiming = null; }
    }
    if (this.#closed) throw publicFailure('RUNTIME_CLOSED', 'Worker runtime is closed');
    if (this.#occupiedSlots() >= this.#limits.max_workers) throw publicFailure('POOL_LIMIT', 'Worker pool limit reached');
    worker.reserved = true;
    return this.#open(worker, resume);
  }

  async #stopTransport(worker, client = worker.ownedTransport) {
    if (!client) return;
    worker.offEvent?.(); worker.offClose?.();
    const result = await client.stop();
    worker.cleanupComplete = result.cleanup_complete;
    if (worker.transport === client) worker.transport = null;
    if (result.cleanup_complete && worker.ownedTransport === client) worker.ownedTransport = null;
    return result;
  }

  #lost(worker, client, error) {
    worker.epoch = (worker.epoch || 0) + 1;
    worker.queue.length = 0;
    worker.draining = false;
    worker.cleanupComplete = false;
    worker.transport = null;
    if (worker.active) this.#finish(worker, 'interrupted', boundedError(error));
    worker.cleanupPromise = this.#stopTransport(worker, client).then(() => this.#persist(worker));
    worker.cleanupPromise.catch(() => {});
  }

  async #open(worker, resume) {
    if (resume) await sessionHeader(worker.sessionFile, { session_id: worker.sessionId, cwd: worker.cwd });
    const sessionDirectory = path.join(this.#options.agentDir, 'team-harness', 'sessions');
    await fs.mkdir(sessionDirectory, { recursive: true, mode: 0o700 });
    const profile = validateWorkerProfile({ schema_version: 1, worker_id: worker.id, owner_session_id: this.#options.parent.session_id,
      role: worker.role.name, cwd: worker.cwd, tools: worker.role.tools, read_only: worker.role.read_only });
    const resources = this.#options.providerResources || [];
    if (!Array.isArray(resources) || resources.length > 16) throw publicFailure('RESOURCE_INVALID', 'Worker provider resource selection is invalid');
    let providerPaths;
    try { providerPaths = await Promise.all(resources.map(resource => absoluteFile(resource, 'Worker provider resource'))); }
    catch { throw publicFailure('RESOURCE_UNAVAILABLE', 'An explicitly selected worker provider resource is unavailable'); }
    const args = ['--offline', '--no-extensions', '--no-mcp', '--no-skills', '--no-prompt-templates', '--no-themes',
      '--no-context-files', '--no-approve', '--session-dir', sessionDirectory, '--extension', bridgePath,
      ...providerPaths.flatMap(resource => ['--extension', resource]), '--th-worker-config', JSON.stringify(profile),
      '--tools', worker.role.tools.join(','), '--provider', worker.model.provider, '--model', worker.model.id,
      '--thinking', worker.thinking, '--append-system-prompt', worker.promptFile,
      ...(resume ? ['--session', worker.sessionFile] : ['--session-id', worker.sessionId])];
    let client;
    try {
      client = await PiRpcTransport.start(this.#options.descriptor, { cwd: worker.cwd, limits: this.#limits,
        env: { ...process.env, ...this.#options.env, PI_CODING_AGENT_DIR: this.#options.agentDir, PI_OFFLINE: '1' }, args,
        onSpawn: owned => { worker.ownedTransport = owned; worker.cleanupComplete = null; } });
      const state = await client.request({ type: 'get_state' });
      const relative = path.relative(sessionDirectory, state.sessionFile || '');
      if (!text(state.sessionId, 128) || !path.isAbsolute(state.sessionFile || '') || state.sessionId !== worker.sessionId
          || !relative || relative.startsWith('..') || path.isAbsolute(relative)
          || (resume && state.sessionFile !== worker.sessionFile) || state.isStreaming || state.isCompacting
          || state.model?.provider !== worker.model.provider || state.model?.id !== worker.model.id || state.thinkingLevel !== worker.thinking)
        throw publicFailure('STATE_MISMATCH', 'Worker native session, model or thinking selection differs');
      worker.sessionFile = state.sessionFile;
      const commands = await client.request({ type: 'get_commands' });
      if (!commands?.commands?.some(command => command.name === 'th-worker-capabilities'))
        throw publicFailure('BRIDGE_UNAVAILABLE', 'Worker capability bridge is unavailable');
      const nonce = randomUUID();
      const acknowledgement = await client.request({ type: 'prompt', message: '/th-worker-capabilities ' + nonce });
      if (acknowledgement?.disposition !== 'handled') throw publicFailure('BRIDGE_INVALID', 'Worker capability probe did not remain handled');
      const native = await client.request({ type: 'get_entries' });
      const capability = native.entries?.findLast(entry => entry.type === 'custom' && entry.customType === 'th-pi-worker-capabilities' && entry.data?.nonce === nonce)?.data;
      if (!capability || capability.owner_session_id !== profile.owner_session_id || capability.worker_id !== profile.worker_id
          || capability.role !== profile.role || capability.cwd !== worker.cwd || capability.session_id !== worker.sessionId
          || capability.session_file !== worker.sessionFile || capability.model?.provider !== worker.model.provider
          || capability.model?.id !== worker.model.id || capability.thinking_level !== worker.thinking
          || JSON.stringify([...(capability.active_tools || [])].sort()) !== JSON.stringify([...worker.role.tools].sort())
          || worker.role.tools.some(tool => !capability.all_tools?.includes(tool)))
        throw publicFailure('CAPABILITY_MISMATCH', 'Worker native tool capabilities do not match its role');
      if (this.#closed) throw publicFailure('RUNTIME_CLOSED', 'Worker runtime is closed');
      worker.transport = client;
      worker.offEvent = client.onEvent(event => this.#event(worker, event));
      worker.offClose = client.onClose(error => this.#lost(worker, client, error));
      await this.#persist(worker);
    } catch (error) {
      if (error.cleanup_complete === false) worker.cleanupComplete = false;
      await this.#stopTransport(worker);
      if (worker.cleanupComplete === false) await this.#persist(worker);
      throw error;
    }
  }

  #event(worker, event) {
    const active = worker.active;
    if (!active) return;
    if (event.type === 'message_end' && event.message?.role === 'assistant') {
      const message = event.message;
      const result = (message.content || []).filter(part => part.type === 'text').map(part => part.text).join('');
      if (Buffer.byteLength(result) > this.#limits.max_result_bytes) {
        active.error = { code: 'RESULT_LIMIT', message: 'Worker result exceeds its output limit' };
        void this.cancel(worker.id).catch(() => {});
        return;
      }
      active.text = result;
      active.stopReason = message.stopReason;
    }
    if (event.type === 'agent_settled') {
      active.settled = true;
      active.aborted ||= event.aborted === true;
      if (active.disposition) this.#settle(worker);
    }
  }

  #settle(worker) {
    const active = worker.active;
    if (!active) return;
    if (active.aborted) this.#finish(worker, 'aborted', active.error);
    else if (active.error || active.stopReason !== 'stop') this.#finish(worker, 'failed',
      active.error || { code: 'NATIVE_FAILURE', message: 'Worker did not produce a successful final assistant response' });
    else this.#finish(worker, 'completed');
  }

  #finish(worker, status, error) {
    const active = worker.active;
    if (!active) return;
    clearTimeout(active.timer);
    worker.latest = { id: active.id, status, disposition: active.disposition || null, text: active.text || '',
      from_entry_id: active.from_entry_id ?? null,
      ...(error ? { error } : {}) };
    worker.active = null;
    for (const resolve of worker.waiters) resolve(this.#state(worker));
    worker.waiters.clear();
    void this.#persist(worker).catch(() => {});
    if (worker.queue.length && !worker.cancelling && !this.#closed && worker.transport) {
      const next = worker.queue.shift();
      const epoch = worker.epoch || 0;
      worker.draining = true;
      queueMicrotask(() => this.#run(worker, next.task, next.id, epoch).catch(error => {
        if (epoch !== (worker.epoch || 0)) return;
        worker.draining = false;
        worker.queue.length = 0;
        worker.latest = { id: next.id, status: 'interrupted', disposition: null, text: '', error: boundedError(error) };
        for (const resolve of worker.waiters) resolve(this.#state(worker));
        worker.waiters.clear();
        void this.#persist(worker).catch(() => {});
      }));
    }
  }

  async #run(worker, task, operationId = randomUUID(), epoch = worker.epoch || 0) {
    let active;
    worker.preparingRun = (worker.preparingRun || 0) + 1;
    try {
      await this.#connect(worker, !worker.transport && !!worker.sessionFile);
      if (!this.#closed && epoch !== (worker.epoch || 0) && worker.latest?.id === operationId && worker.latest.status === 'aborted')
        return this.#state(worker);
      if (this.#closed || worker.cancelling || epoch !== (worker.epoch || 0)) throw publicFailure('RUNTIME_CLOSED', 'Worker context changed before task delivery');
      if (worker.active) throw publicFailure('WORKER_BUSY', 'Worker already has an active operation');
      active = { id: operationId, disposition: null, text: '', settled: false, aborted: false, from_entry_id: null };
      worker.active = active;
      worker.initialOperationId = null;
      worker.draining = false;
      worker.latest = { id: operationId, status: 'accepted', disposition: null, text: '', from_entry_id: active.from_entry_id };
    } finally { worker.preparingRun--; }
    active.timer = setTimeout(() => {
      active.error = { code: 'OPERATION_TIMEOUT', message: 'Worker operation deadline expired' };
      void this.cancel(worker.id).catch(() => {});
    }, this.#limits.operation_ms);
    try {
      const native = await worker.transport.request({ type: 'get_entries' });
      if (worker.active !== active || active.cancelled || this.#closed) return this.#state(worker);
      active.from_entry_id = native.leafId ?? null;
      worker.latest.from_entry_id = active.from_entry_id;
      await this.#persist(worker);
      if (worker.active !== active || active.cancelled || this.#closed) return this.#state(worker);
      const response = await worker.transport.request({ type: 'prompt', message:
        'TH package root: ' + this.#options.packageRoot + '\nWorker checkout: ' + worker.cwd + '\n\n' + task });
      if (worker.active !== active) return this.#state(worker);
      if (!['handled', 'started', 'queued'].includes(response?.disposition)) throw publicFailure('DISPOSITION_INVALID', 'Worker prompt disposition is invalid');
      active.disposition = response.disposition;
      worker.latest = { ...worker.latest, status: response.disposition === 'queued' ? 'queued' : 'running', disposition: response.disposition };
      if (response.disposition === 'handled') this.#finish(worker, 'handled');
      else if (active.settled) this.#settle(worker);
      await this.#persist(worker);
      return this.#state(worker);
    } catch (error) {
      this.#finish(worker, 'interrupted', boundedError(error));
      await this.#stopTransport(worker);
      await this.#persist(worker);
      return this.#state(worker);
    }
  }

  /** Bind the current worker selection before asynchronous preparation; follow-ups retain the conversation binding. */
  async dispatch({ role: name, task, cwd = this.#options.parent.cwd }) {
    if (this.#closed) throw publicFailure('RUNTIME_CLOSED', 'Worker runtime is closed');
    const role = this.#roles.get(name);
    if (!role) throw publicFailure('ROLE_INVALID', 'Requested worker role is not eligible');
    if (!text(task, this.#limits.max_frame_bytes / 2)) throw publicFailure('TASK_INVALID', 'Worker task is invalid');
    if (this.#workers.size >= this.#limits.max_sessions) throw publicFailure('SESSION_LIMIT', 'Retained worker session limit reached');
    const inherited = { model: this.#options.parent.model, thinking: this.#options.parent.thinking_level || 'off' };
    const selected = this.#options.selectWorkerModel?.(name, inherited) ?? inherited;
    const model = modelSelection(selected.model), thinking = selected.thinking;
    if (!['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(thinking))
      throw publicFailure('CONFIG_INVALID', 'Worker thinking selection is invalid');
    let worker;
    try {
      const directory = await absoluteDirectory(cwd, 'Worker directory');
      const root = await absoluteDirectory(this.#options.packageRoot, 'TH package root');
      const promptFile = await absoluteFile(path.resolve(root, role.prompt), 'Worker prompt');
      if (path.relative(root, promptFile).startsWith('..')) throw publicFailure('PROMPT_INVALID', 'Worker prompt escapes its package');
      worker = { id: randomUUID(), role, cwd: directory, model,
        thinking, sessionId: randomUUID(), sessionFile: null,
        promptFile, promptHash: digest(await fs.readFile(promptFile, 'utf8')), queue: [], waiters: new Set(), latest: null, active: null };
      const operationId = randomUUID(), epoch = worker.epoch || 0;
      worker.initialOperationId = operationId;
      worker.latest = { id: operationId, status: 'preparing', disposition: null, text: '', from_entry_id: null };
      if (this.#closed) throw publicFailure('RUNTIME_CLOSED', 'Worker runtime is closed');
      if (this.#workers.size >= this.#limits.max_sessions) throw publicFailure('SESSION_LIMIT', 'Retained worker session limit reached');
      this.#workers.set(worker.id, worker);
      await this.#connect(worker);
      return await this.#run(worker, task, operationId, epoch);
    } catch (error) {
      if (worker) {
        await this.#stopTransport(worker);
        if (!worker.ownedTransport && worker.cleanupComplete !== false) this.#workers.delete(worker.id);
      }
      throw error;
    }
  }

  /** Refresh only the selection inherited by newly dispatched conversations. */
  updateParentSelection(model, thinkingLevel) {
    if (this.#closed) throw publicFailure('RUNTIME_CLOSED', 'Worker runtime is closed');
    this.#options.parent.model = model;
    this.#options.parent.thinking_level = thinkingLevel;
  }

  /** Return bounded observable state without collecting or charging usage. */
  status(id) { return this.#state(this.#worker(id)); }

  /** List only workers owned by this manager's native primary session. */
  list() { return [...this.#workers.values()].map(worker => this.#state(worker)); }

  /** Queue a bounded follow-up in the existing conversation, or start it when idle. */
  async followUp(id, { task }) {
    const worker = this.#worker(id);
    if (worker.collecting) throw publicFailure('WORKER_BUSY', 'Worker native usage collection is in progress');
    if (!text(task, this.#limits.max_frame_bytes / 2)) throw publicFailure('TASK_INVALID', 'Worker follow-up is invalid');
    if (worker.active || worker.draining) {
      if (worker.queue.length >= this.#limits.max_followups) throw publicFailure('QUEUE_LIMIT', 'Worker follow-up queue limit reached');
      const operationId = randomUUID();
      worker.queue.push({ task, id: operationId });
      return { ...this.#state(worker), queued_operation_id: operationId };
    }
    return this.#run(worker, task);
  }

  /** Wait without implicitly collecting usage or cancelling the worker when a caller stops waiting. */
  async wait(id, { timeout_ms = this.#limits.request_ms, signal } = {}) {
    const worker = this.#worker(id);
    if (!worker.active && !worker.draining) return this.#state(worker);
    if (!Number.isSafeInteger(timeout_ms) || timeout_ms < 1 || timeout_ms > this.#limits.operation_ms)
      throw publicFailure('WAIT_INVALID', 'Worker wait deadline is invalid');
    if (worker.waiters.size >= this.#limits.max_pending) throw publicFailure('WAITER_LIMIT', 'Worker waiter limit reached');
    return new Promise((resolve, reject) => {
      const finish = (error, value) => {
        clearTimeout(timer); worker.waiters.delete(done); signal?.removeEventListener('abort', aborted);
        error ? reject(error) : resolve(value);
      };
      const done = value => finish(null, value);
      const aborted = () => finish(publicFailure('WAIT_ABORTED', 'Worker wait was cancelled'));
      const timer = setTimeout(() => finish(null, { ...this.#state(worker), wait_timed_out: true }), timeout_ms);
      worker.waiters.add(done);
      if (signal?.aborted) aborted(); else signal?.addEventListener('abort', aborted, { once: true });
    });
  }

  /** Discard TH/native queued work before native abort; uncertain cleanup remains visible. */
  async cancel(id) {
    const worker = this.#worker(id);
    worker.cancelling = true;
    worker.epoch = (worker.epoch || 0) + 1;
    worker.draining = false;
    if (worker.active) worker.active.cancelled = true;
    else if (worker.latest?.id === worker.initialOperationId) worker.latest = { ...worker.latest, status: 'aborted' };
    worker.queue.length = 0;
    try {
      if (worker.transport) {
        await worker.transport.request({ type: 'clear_queue' });
        await worker.transport.request({ type: 'abort' });
      }
      if (worker.active) this.#finish(worker, 'aborted');
    } catch (error) {
      this.#finish(worker, 'interrupted', boundedError(error));
      await this.#stopTransport(worker);
    } finally { worker.cancelling = false; }
    await this.#persist(worker);
    return this.#state(worker);
  }

  /** Attribute only native durable usage not covered by confirmed native parent tool-result receipts. */
  async collect(id) {
    const worker = this.#worker(id);
    if (worker.active || worker.draining || worker.queue.length) return { ...this.#state(worker), usage_status: 'uncollected' };
    if (worker.collecting) return { ...this.#state(worker), usage_status: 'collection_in_progress' };
    worker.collecting = true;
    try { return await this.#collect(worker); } finally { worker.collecting = false; }
  }

  async #collect(worker) {
    await this.#connect(worker, !worker.transport && !!worker.sessionFile);
    const [native, stats] = await Promise.all([worker.transport.request({ type: 'get_entries' }), worker.transport.request({ type: 'get_session_stats' })]);
    const entries = native.entries;
    if (!Array.isArray(entries) || entries.some(entry => !text(entry.id, 128)) || new Set(entries.map(entry => entry.id)).size !== entries.length
        || stats?.sessionId !== worker.sessionId || stats?.sessionFile !== worker.sessionFile)
      throw publicFailure('USAGE_INVALID', 'Worker native accounting identity is invalid');
    const parent = this.#options.parentEntries?.() || [];
    let cursor = -1;
    const receipts = parent.filter(entry => entry.type === 'message' && entry.message?.role === 'toolResult')
      .map(entry => ({ receipt: entry.message.details?.th_worker_receipt, usage: entry.message.usage }));
    for (let changed = true; changed;) {
      changed = false;
      for (const { receipt, usage } of receipts) {
        if (receipt?.schema_version !== RECEIPT_VERSION || receipt.worker_id !== worker.id
            || receipt.owner_session_id !== this.#options.parent.session_id || receipt.session_id !== worker.sessionId
            || receipt.from_entry_id !== (entries[cursor]?.id || null)) continue;
        const through = entries.findIndex(entry => entry.id === receipt.through_entry_id);
        if (through <= cursor) continue;
        const evidence = usageEvidence(entries.slice(cursor + 1, through + 1));
        if (!isDeepStrictEqual(evidence.usage, usage) || receipt.evidence_sha256 !== digest(evidence) || receipt.receipt_id !== digest({
          worker_id: worker.id, session_id: worker.sessionId, from_entry_id: receipt.from_entry_id, through_entry_id: receipt.through_entry_id })) continue;
        cursor = through;
        changed = true;
      }
    }
    if (worker.latest && !worker.latest.text && worker.latest.status !== 'handled') {
      const start = worker.latest.from_entry_id === null ? -1 : entries.findIndex(entry => entry.id === worker.latest.from_entry_id);
      const final = entries.slice(start + 1).findLast(entry => entry.type === 'message' && entry.message?.role === 'assistant')?.message;
      const content = (final?.content || []).filter(part => part.type === 'text').map(part => part.text).join('');
      if (Buffer.byteLength(content) <= this.#limits.max_result_bytes) worker.latest.text = content;
    }
    if (worker.pendingReceipt) {
      const confirmed = entries.findIndex(entry => entry.id === worker.pendingReceipt.through_entry_id);
      if (confirmed >= 0 && cursor >= confirmed) worker.pendingReceipt = null;
      else return { ...this.#state(worker), receipt: worker.pendingReceipt, usage_status: 'awaiting_confirmation',
        native_stats: stats, recovery: 'Await the native parent tool result; reload only after the previous delivery is no longer in flight.' };
    }
    const remaining = entries.slice(cursor + 1);
    const evidence = usageEvidence(remaining);
    const through = entries.at(-1)?.id || null;
    const usageStatus = evidence.missing_usage.length || worker.latest?.status === 'interrupted' ? 'partial'
      : evidence.usage ? 'complete' : ['completed', 'failed', 'aborted'].includes(worker.latest?.status) && remaining.length ? 'missing' : 'not_reported';
    const receipt = { schema_version: RECEIPT_VERSION, worker_id: worker.id, owner_session_id: this.#options.parent.session_id,
      session_id: worker.sessionId, from_entry_id: entries[cursor]?.id || null, through_entry_id: through,
      receipt_id: digest({ worker_id: worker.id, session_id: worker.sessionId, from_entry_id: entries[cursor]?.id || null, through_entry_id: through }),
      evidence_sha256: digest(evidence), usage_status: usageStatus,
      already_attributed: remaining.length === 0 };
    if (remaining.length) worker.pendingReceipt = receipt;
    return { ...this.#state(worker), receipt, ...evidence, native_stats: stats };
  }

  /** Release only a result known not to have been returned to the native tool runner. */
  abandonCollection(id, receiptId) {
    const worker = this.#worker(id);
    if (worker.pendingReceipt?.receipt_id === receiptId) worker.pendingReceipt = null;
  }

  /** Restore exact owner/cwd/session associations without replaying an accepted or uncertain prompt. */
  async restore(references) {
    if (!Array.isArray(references) || references.length > this.#limits.max_sessions) throw publicFailure('SESSION_LIMIT', 'Retained worker session limit reached');
    for (const reference of references) {
      if (reference.schema_version !== 1 || reference.owner_session_id !== this.#options.parent.session_id
          || reference.owner_cwd !== this.#options.parent.cwd || !text(reference.worker_id, 128) || this.#workers.has(reference.worker_id))
        throw publicFailure('OWNER_MISMATCH', 'Retained worker owner or session differs');
      if (reference.cleanup_complete === false) throw publicFailure('CLEANUP_INCOMPLETE', 'Retained owned worker cleanup is unconfirmed');
      const role = this.#roles.get(reference.role);
      if (!role) throw publicFailure('ROLE_INVALID', 'Retained worker role is not eligible');
      const promptFile = await absoluteFile(path.resolve(this.#options.packageRoot, role.prompt), 'Worker prompt');
      if (digest(await fs.readFile(promptFile, 'utf8')) !== reference.prompt_sha256) throw publicFailure('PROMPT_MISMATCH', 'Retained worker prompt changed');
      const cwd = await absoluteDirectory(reference.cwd, 'Worker directory');
      const sessionDirectory = path.join(this.#options.agentDir, 'team-harness', 'sessions');
      const relative = path.relative(sessionDirectory, reference.session_file || '');
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw publicFailure('SESSION_MISMATCH', 'Retained native session is outside its owned store');
      await sessionHeader(reference.session_file, { session_id: reference.session_id, cwd });
      const terminal = ['completed', 'handled', 'failed', 'aborted'].includes(reference.operation_status);
      const worker = { id: reference.worker_id, role, cwd, model: modelSelection(reference.model),
        thinking: reference.thinking_level, sessionId: reference.session_id, sessionFile: reference.session_file,
        promptFile, promptHash: reference.prompt_sha256, queue: [], waiters: new Set(), active: null,
        latest: reference.operation_id ? { id: reference.operation_id, status: terminal ? reference.operation_status : 'interrupted',
          disposition: reference.operation_disposition || null, from_entry_id: reference.operation_from_entry_id ?? null,
          text: '', ...(reference.operation_error ? { error: reference.operation_error } : {}) } : null };
      this.#workers.set(worker.id, worker);
    }
  }

  /** Close only owned processes and keep interrupted references for explicit later rebind. */
  async shutdown() {
    if (this.#closed) return;
    this.#closed = true;
    await Promise.all([...this.#workers.values()].map(async worker => {
      worker.epoch = (worker.epoch || 0) + 1;
      worker.draining = false;
      try { await worker.connecting; } catch {}
      worker.queue.length = 0;
      if (worker.active) {
        this.#finish(worker, 'interrupted', { code: 'CONTEXT_REPLACED', message: 'Worker context was replaced' });
        try { await worker.transport?.request({ type: 'clear_queue' }); await worker.transport?.request({ type: 'abort' }); } catch {}
      }
      try { await worker.cleanupPromise; } catch {}
      await this.#stopTransport(worker);
      await this.#persist(worker);
    }));
  }
}
