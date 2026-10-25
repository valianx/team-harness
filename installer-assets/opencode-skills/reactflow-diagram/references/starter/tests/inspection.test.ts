import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const run = promisify(execFile);
const script = fileURLToPath(new URL('../scripts/inspect-composition.mjs', import.meta.url));

test('consumer inspection refuses ambiguous arguments and filesystem roots before creating evidence', async () => {
  for (const args of [[], ['--out', 'relative'], ['--out', path.parse(process.cwd()).root], ['--unknown', 'value'], ['--out', '/tmp/example', '--out', '/tmp/example']]) {
    await assert.rejects(run(process.execPath, [script, ...args]), error => error.code === 1 && /Usage:|--out must/.test(error.stderr));
  }
});

test('consumer inspection refuses redirected evidence storage without writing through it', async context => {
  const directory = await mkdtemp(path.join(tmpdir(), 'diagram-inspection-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const link = path.join(directory, 'redirected');
  try { await symlink(directory, link, 'dir'); }
  catch (error) { if (error.code === 'EPERM') { context.skip('Native host cannot create the symbolic-link fixture'); return; } throw error; }
  await assert.rejects(run(process.execPath, [script, '--out', link]), error => error.code === 1 && /redirected/.test(error.stderr));
  assert.deepEqual(await readdir(directory), ['redirected']);
});
