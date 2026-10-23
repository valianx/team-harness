import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'harness-scaffold-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const referencesDir = join(root, 'installation', 'references');
  await mkdir(join(referencesDir, 'starter', 'vendor'), { recursive: true });
  await mkdir(join(referencesDir, 'starter', 'node_modules'), { recursive: true });
  await mkdir(join(referencesDir, 'templates', 'feature'), { recursive: true });
  await writeFile(join(referencesDir, 'starter', 'package.json'), '{"name":"consumer"}');
  await writeFile(join(referencesDir, 'starter', 'package-lock.json'), '{"lockfileVersion":3}');
  await writeFile(join(referencesDir, 'starter', 'gitignore.txt'), 'node_modules/\ndist/\n');
  await writeFile(join(referencesDir, 'starter', 'node_modules', 'private-machine-path.txt'), 'do not copy');
  await writeFile(join(referencesDir, 'starter', 'vendor', 'kit.tgz'), Buffer.from([31, 139, 8, 0]));
  await writeFile(join(referencesDir, 'templates', 'feature', 'slides.md'), '# Feature template');
  return { root, referencesDir, output: join(root, 'consumer') };
}
test('creation copies portable pinned assets and materializes ignore rules without dependencies', async (t) => {
  const { createDeck } = await import('./create-deck.mjs');
  const { referencesDir, output } = await fixture(t);
  await createDeck({ referencesDir, template: 'feature', output });
  assert.equal(await readFile(join(output, 'slides.md'), 'utf8'), '# Feature template');
  assert.equal(await readFile(join(output, 'package-lock.json'), 'utf8'), '{"lockfileVersion":3}');
  assert.deepEqual(await readFile(join(output, 'vendor', 'kit.tgz')), Buffer.from([31, 139, 8, 0]));
  assert.equal(await readFile(join(output, '.gitignore'), 'utf8'), 'node_modules/\ndist/\n');
  assert.ok(!(await readdir(output)).includes('node_modules'));
});
test('creation refuses an existing destination and preserves manual work', async (t) => {
  const { createDeck } = await import('./create-deck.mjs');
  const { referencesDir, output } = await fixture(t);
  await mkdir(output);
  await writeFile(join(output, 'slides.md'), '# Manual presentation');
  await assert.rejects(createDeck({ referencesDir, template: 'feature', output }), /existing|exists|inspect/i);
  assert.deepEqual(await readdir(output), ['slides.md']);
  assert.equal(await readFile(join(output, 'slides.md'), 'utf8'), '# Manual presentation');
});
test('creation rejects output inside installation, unknown templates and symlinked payloads', async (t) => {
  const { createDeck } = await import('./create-deck.mjs');
  const { root, referencesDir, output } = await fixture(t);
  await assert.rejects(createDeck({ referencesDir, template: 'feature', output: join(referencesDir, 'consumer') }), /outside|installation/i);
  await assert.rejects(createDeck({ referencesDir, template: 'feature', output: join(referencesDir, '..', 'consumer') }), /outside|installation/i);
  if (process.platform !== 'win32')
    await assert.rejects(createDeck({ referencesDir, template: 'feature', output: join(referencesDir, '..', '..\\consumer') }), /outside|installation/i);
  await assert.rejects(createDeck({ referencesDir, template: '../feature', output }), /template/i);
  await writeFile(join(root, 'secret'), 'private');
  await symlink(join(root, 'secret'), join(referencesDir, 'starter', 'linked.txt'));
  await assert.rejects(createDeck({ referencesDir, template: 'feature', output }), /symlink/i);
});
