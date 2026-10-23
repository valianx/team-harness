import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('normal build arguments always omit notes and retain the requested non-root base', async () => {
  const { buildArguments } = await import('../scripts/build.mjs');
  assert.deepEqual(buildArguments(['--base', '/talks/proposal/']), ['build', 'slides.md', '--base', '/talks/proposal/', '--out', 'dist', '--without-notes']);
  assert.throws(() => buildArguments(['--base', '//external.example/']), /base/i);
  assert.throws(() => buildArguments(['--base', '/talks/../secret/']), /base/i);
  assert.throws(() => buildArguments(['--with-notes', 'true']), /option|Expected/i);
});

test('static delivery retains the actual kit, font and theme license bytes', async (t) => {
  const { copyDeliveryLicenses } = await import('../scripts/build.mjs');
  const root = await mkdtemp(join(tmpdir(), 'harness-licenses-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const kit = join(root, 'kit');
  const output = join(root, 'dist');
  await mkdir(join(kit, 'licenses'), { recursive: true });
  await writeFile(join(kit, 'LICENSE'), 'Kit MIT license');
  await writeFile(join(kit, 'NOTICE.md'), 'Upstream theme and font attribution');
  await writeFile(join(kit, 'licenses', 'Inter-OFL.txt'), 'Font OFL terms');
  await writeFile(join(kit, 'licenses', 'theme-default-MIT.txt'), 'Theme MIT terms');
  await copyDeliveryLicenses(kit, output);
  assert.equal(await readFile(join(output, 'licenses', 'slidev-addon-harness-MIT.txt'), 'utf8'), 'Kit MIT license');
  assert.equal(await readFile(join(output, 'licenses', 'NOTICE.md'), 'utf8'), 'Upstream theme and font attribution');
  assert.equal(await readFile(join(output, 'licenses', 'Inter-OFL.txt'), 'utf8'), 'Font OFL terms');
  assert.equal(await readFile(join(output, 'licenses', 'theme-default-MIT.txt'), 'utf8'), 'Theme MIT terms');
});

test('preview serves real assets and SPA routes under the requested base, with missing files kept missing', async (t) => {
  const { startPreview } = await import('../scripts/serve.mjs');
  const root = await mkdtemp(join(tmpdir(), 'harness-preview-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'assets'));
  await writeFile(join(root, 'index.html'), '<main>Real compiled app</main>');
  await writeFile(join(root, 'assets', 'app.js'), 'window.loaded = true;');
  const { server, url } = await startPreview({ directory: root, base: '/talks/proposal/', port: 0 });
  t.after(() => new Promise(resolve => server.close(resolve)));
  assert.equal(await (await fetch(url)).text(), '<main>Real compiled app</main>');
  assert.equal(await (await fetch(`${url}decision`)).text(), '<main>Real compiled app</main>');
  const asset = await fetch(`${url}assets/app.js`);
  assert.match(asset.headers.get('content-type'), /javascript/);
  assert.equal(await asset.text(), 'window.loaded = true;');
  assert.equal((await fetch(`${url}missing.svg`)).status, 404);
  assert.equal((await fetch(new URL('/elsewhere/', url))).status, 404);
});

test('preview refuses symlink escapes and non-loopback exposure', async (t) => {
  const { startPreview } = await import('../scripts/serve.mjs');
  const root = await mkdtemp(join(tmpdir(), 'harness-preview-path-'));
  const outside = await mkdtemp(join(tmpdir(), 'harness-preview-outside-'));
  t.after(() => Promise.all([rm(root, { recursive: true, force: true }), rm(outside, { recursive: true, force: true })]));
  await writeFile(join(root, 'index.html'), 'app');
  await writeFile(join(outside, 'private.txt'), 'private');
  await symlink(join(outside, 'private.txt'), join(root, 'leak.txt'));
  const { server, url } = await startPreview({ directory: root, port: 0 });
  t.after(() => new Promise(resolve => server.close(resolve)));
  assert.equal((await fetch(`${url}leak.txt`)).status, 404);
  await assert.rejects(startPreview({ directory: root, host: '0.0.0.0', port: 0 }), /loopback/i);
});
