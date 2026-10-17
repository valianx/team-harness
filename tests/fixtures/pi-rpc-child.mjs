import fs from 'node:fs';
import path from 'node:path';

if (process.argv.includes('--version')) {
  if (process.env.TH_PI_FIXTURE_VERSION_MODE === 'stubborn') {
    fs.writeFileSync(process.env.TH_PI_FIXTURE_VERSION_PID, JSON.stringify({ pid: process.pid }));
    process.on('SIGTERM', () => {});
    setInterval(() => {}, 1000);
    await new Promise(() => {});
  }
  process.stdout.write(`${process.env.TH_PI_FIXTURE_VERSION || '1.3.0'}\n`);
  process.exit(0);
}

const option = name => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};
const scenario = process.env.TH_PI_FIXTURE_SCENARIO || 'normal';
const log = value => {
  if (process.env.TH_PI_FIXTURE_LOG) fs.appendFileSync(process.env.TH_PI_FIXTURE_LOG, JSON.stringify(value) + '\n');
};
log({ kind: 'launch', pid: process.pid, argv: process.argv.slice(2), cwd: process.cwd() });
const sessionDirectory = option('--session-dir') || process.cwd();
const sessionFile = option('--session') || path.join(sessionDirectory, `${option('--session-id') || 'fixture-session'}.jsonl`);
const sessionId = option('--session-id') || (fs.existsSync(sessionFile) ? JSON.parse(fs.readFileSync(sessionFile, 'utf8').split('\n')[0]).id : 'fixture-session');
fs.mkdirSync(path.dirname(sessionFile), { recursive: true });
if (!fs.existsSync(sessionFile)) fs.writeFileSync(sessionFile, JSON.stringify({ type: 'session', version: 3, id: sessionId, cwd: process.cwd(), timestamp: new Date().toISOString() }) + '\n');
const entries = fs.readFileSync(sessionFile, 'utf8').trim().split('\n').slice(1).map(JSON.parse);
let active = false;
let pendingTimer;
let startupTimer;
let firstState = true;
let sequence = entries.length;
let entryReads = 0;
let buffer = '';
const usage = { input: 5, output: 7, cacheRead: 2, cacheWrite: 1, reasoning: 3, cacheWrite1h: 1, totalTokens: 15,
  cost: { input: .01, output: .02, cacheRead: .001, cacheWrite: .002, total: .033 } };
let output = Promise.resolve();
const emit = value => {
  const bytes = Buffer.from(JSON.stringify(value) + (scenario === 'fragmented' ? '\r\n' : '\n'));
  if (scenario !== 'fragmented') { process.stdout.write(bytes); return; }
  output = output.then(async () => {
    for (let start = 0; start < bytes.length; start += 3) {
      process.stdout.write(bytes.subarray(start, start + 3));
      await new Promise(resolve => setImmediate(resolve));
    }
  });
};
const append = entry => {
  const value = { id: `entry-${++sequence}`, parentId: entries.at(-1)?.id || null, timestamp: new Date().toISOString(), ...entry };
  entries.push(value);
  fs.appendFileSync(sessionFile, JSON.stringify(value) + '\n');
  return value;
};
const response = (command, data) => emit({ id: command.id, type: 'response', command: command.type, success: true, ...(data === undefined ? {} : { data }) });
const state = () => ({ model: { provider: 'fixture', id: 'fixture-model' }, thinkingLevel: 'high', isStreaming: active,
  isCompacting: false, sessionId, sessionFile, messageCount: entries.length, pendingMessageCount: 0 });
const finish = (text, aborted = false) => {
  active = false;
  const message = { role: 'assistant', provider: 'fixture', model: 'fixture-model', content: [{ type: 'text', text }],
    stopReason: aborted ? 'aborted' : scenario === 'provider-error' ? 'error' : 'stop', usage, timestamp: Date.now() };
  if (scenario === 'partial-usage') { message.usage = { ...usage }; delete message.usage.input; }
  if (scenario === 'missing-usage') delete message.usage;
  if (scenario === 'zero-usage') message.usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
  append({ type: 'message', message });
  emit({ type: 'message_end', message });
  emit({ type: 'agent_end', messages: [message], willRetry: false });
  emit({ type: 'agent_settled', aborted });
};

process.stdin.setEncoding('utf8');
const echoes = [], dialogs = [];
let uiCommand;
process.stdin.on('data', chunk => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, newline);
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    const command = JSON.parse(line);
    log(command);
    if (command.type === 'extension_ui_response') {
      dialogs.push(command);
      if (dialogs.length === 4) response(uiCommand, { dialogs });
    } else if (command.type === 'get_state') {
      if (scenario === 'held-startup' && firstState) {
        firstState = false;
        fs.writeFileSync(process.env.TH_PI_FIXTURE_START_BARRIER + '.waiting', command.id);
        const release = () => {
          if (fs.existsSync(process.env.TH_PI_FIXTURE_START_BARRIER)) response(command, state());
          else startupTimer = setTimeout(release, 5);
        };
        release();
        continue;
      }
      if (scenario === 'startup-exit') process.exit(43);
      if (scenario === 'malformed') { process.stdout.write('not-json\n'); continue; }
      if (scenario === 'oversized') { process.stdout.write('x'.repeat(20000)); continue; }
      if (scenario === 'stderr-limit') { process.stderr.write('x'.repeat(20000)); continue; }
      if (scenario === 'no-response') continue;
      response(command, scenario === 'invalid-state' ? { ...state(), isStreaming: 'invalid' } : state());
    } else if (command.type === 'get_commands') {
      response(command, { commands: [{ name: 'th-worker-capabilities', source: 'extension' }] });
    } else if (command.type === 'get_entries') {
      entryReads++;
      if (scenario === 'held-collection' && entryReads === 3) {
        const barrier = process.env.TH_PI_FIXTURE_COLLECTION_BARRIER;
        fs.writeFileSync(barrier + '.waiting', command.id);
        const release = () => {
          if (fs.existsSync(barrier)) response(command, { entries: [...entries], leafId: entries.at(-1)?.id || null });
          else pendingTimer = setTimeout(release, 5);
        };
        release();
        continue;
      }
      const index = command.since === undefined ? -1 : entries.findIndex(entry => entry.id === command.since);
      if (command.since !== undefined && index < 0) emit({ id: command.id, type: 'response', command: command.type, success: false, error: 'cursor unavailable' });
      else if (scenario === 'slow-prepare' && entryReads === 2)
        setTimeout(() => response(command, { entries: entries.slice(index + 1), leafId: entries.at(-1)?.id || null }), 150);
      else response(command, { entries: entries.slice(index + 1), leafId: entries.at(-1)?.id || null });
    } else if (command.type === 'get_session_stats') {
      const count = entries.filter(entry => entry.message?.role === 'assistant').length;
      response(command, { sessionId, sessionFile, tokens: { input: count * 5, output: count * 7, cacheRead: count * 2, cacheWrite: count,
        total: count * 15 }, cost: count * .033 });
    } else if (command.type === 'prompt' && command.message.startsWith('/th-worker-capabilities ')) {
      const profile = JSON.parse(option('--th-worker-config') || '{}');
      append({ type: 'custom', customType: 'th-pi-worker-capabilities', data: { schema_version: 1, nonce: command.message.split(' ')[1],
        owner_session_id: profile.owner_session_id, worker_id: profile.worker_id, role: profile.role,
        cwd: process.cwd(), session_id: sessionId, session_file: sessionFile, active_tools: scenario === 'wrong-tools' ? ['bash'] : profile.tools,
        all_tools: [...(profile.tools || [])], model: state().model, thinking_level: 'high' } });
      response(command, { disposition: 'handled' });
    } else if (command.type === 'prompt') {
      if (scenario === 'crash-before-ack') { process.exit(45); }
      if (scenario === 'handled') { response(command, { disposition: 'handled' }); continue; }
      active = true;
      append({ type: 'message', message: { role: 'user', content: command.message, timestamp: Date.now() } });
      if (scenario === 'fast-settle') finish(command.message);
      response(command, { disposition: scenario === 'queued' ? 'queued' : 'started' });
      if (scenario === 'fault-stubborn') { pendingTimer = setTimeout(() => process.stdout.write('not-json\n'), 30); continue; }
      if (scenario === 'crash-after-ack') { setTimeout(() => process.exit(44), 10); continue; }
      if (scenario === 'hang' || scenario === 'fast-settle' || (scenario === 'hold-replacements' && command.message.includes('replacement'))) continue;
      if (scenario === 'retry') emit({ type: 'agent_end', messages: [], willRetry: true });
      if (scenario === 'cumulative-stream') for (let index = 0; index < 4; index++)
        emit({ type: 'message_update', message: { role: 'assistant', usage: { input: 999, output: 999 } } });
      pendingTimer = setTimeout(() => finish(`result:${command.message}\u2028next\u2029line`), scenario === 'retry' ? 90 : 20);
    } else if (command.type === 'clear_queue') {
      response(command, { steering: [], followUp: [] });
    } else if (command.type === 'abort') {
      clearTimeout(pendingTimer);
      if (active) finish('cancelled', true);
      response(command);
    } else if (command.type === 'pause_input') {
      response(command);
      process.stdin.pause();
      setTimeout(() => process.stdin.resume(), 150);
    } else if (command.type === 'emit_frame') {
      const base = JSON.stringify({ type: 'fixture_event', padding: '' });
      process.stdout.write(base.slice(0, -2) + 'x'.repeat(command.bytes - Buffer.byteLength(base) - 1) + '"}\n');
      response(command);
    } else if (command.type === 'diagnostics') {
      process.stderr.write('d'.repeat(command.bytes));
      setTimeout(() => response(command), 20);
    } else if (command.type === 'eof') {
      if (command.truncated) process.stdout.write('{"type":');
      process.stdout.end();
    } else if (command.type === 'ui') {
      uiCommand = command;
      for (const [index, method] of ['select', 'confirm', 'input', 'editor'].entries())
        emit({ type: 'extension_ui_request', id: 'dialog-' + index, method, title: 'fixture' });
      emit({ type: 'extension_ui_request', id: 'notification', method: 'notify', message: 'fixture' });
    } else if (command.type === 'stall') {
      // A held command deliberately reaches the caller's request deadline.
    } else if (command.type === 'echo' && scenario === 'reverse') {
      echoes.push(command);
      if (echoes.length === 3) for (const value of echoes.reverse()) response(value, { value: value.value });
    } else if (command.type === 'echo' && scenario === 'unknown-id') {
      emit({ id: 'foreign-response', type: 'response', command: 'echo', success: true, data: { value: 'foreign' } });
      response(command, { value: command.value });
    } else if (command.type === 'echo' && scenario === 'duplicate-id') {
      response(command, { value: command.value });
      response(command, { value: 'duplicate' });
    } else if (command.type === 'echo') {
      response(command, { value: command.value, argv: process.argv.slice(2) });
    } else {
      emit({ id: command.id, type: 'response', command: command.type, success: false, error: 'fixture command refused' });
    }
  }
});
if (['stubborn', 'fault-stubborn'].includes(scenario)) process.on('SIGTERM', () => {});
process.stdin.on('end', () => {
  clearTimeout(pendingTimer);
  clearTimeout(startupTimer);
  if (!['stubborn', 'fault-stubborn'].includes(scenario)) process.exit(0);
  setInterval(() => {}, 1000);
});
