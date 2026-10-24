import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, access, cp, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { createDeck } from './create-deck.mjs';

const referencesDir = fileURLToPath(new URL('../', import.meta.url));
const palettes = { technical: 'dark', natural: 'light', cosmic: 'dark', editorial: 'light', workshop: 'light' };
async function temporary(t) {
  const root = await mkdtemp(join(tmpdir(), 'harness-visual-themes-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
function headmatter(raw) {
  const header = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.ok(header, 'The native headmatter must remain valid and first.');
  return Object.fromEntries([...header[1].matchAll(/^(theme|colorSchema|favicon): (.+)$/gm)].map(match => [match[1], match[2]]));
}
test('each visual theme composes with every narrative while preserving native content and dependency identity', async t => {
  const root = await temporary(t);
  for (const template of ['feature', 'integration', 'architecture']) {
    const original = await readFile(join(referencesDir, 'templates', template, 'slides.md'), 'utf8');
    for (const [visualTheme, colorSchema] of Object.entries(palettes)) {
      const output = join(root, template + '-' + visualTheme);
      const result = await createDeck({ referencesDir, template, visualTheme, output });
      assert.equal(result.visualTheme, visualTheme);
      const actual = await readFile(join(output, 'slides.md'), 'utf8');
      assert.deepEqual(headmatter(actual), { theme: 'default', colorSchema, favicon: '/images/harness-theme.svg' });
      const rootEnd = text => text.indexOf('\n---', 4);
      assert.equal(actual.slice(rootEnd(actual)), original.slice(rootEnd(original)), 'Choosing a palette must not rewrite any slide content or later frontmatter.');
      const style = await readFile(join(output, 'style.css'), 'utf8');
      assert.equal(style, await readFile(join(referencesDir, 'themes', visualTheme, 'style.css'), 'utf8'));
      assert.deepEqual(await readFile(join(output, 'styles/harness-theme-base.css')), await readFile(join(referencesDir, 'themes/shared.css')));
      assert.deepEqual(await readFile(join(output, 'public/images/harness-theme.svg')), await readFile(join(referencesDir, 'themes', visualTheme, 'public/images/harness-theme.svg')));
      const imports = [...style.matchAll(/@import\s+['"](.+?)['"]/g)];
      assert.ok(imports.length > 0, 'The theme must carry its shared surface styles.');
      for (const [, local] of imports) {
        assert.ok(!local.startsWith('/') && !local.includes('://'));
        await access(resolve(output, local));
      }
      assert.match(await readFile(join(output, 'public/images/harness-theme.svg'), 'utf8'), /<svg[\s>]/);
      for (const file of ['package.json', 'package-lock.json', 'vendor/slidev-addon-harness-1.0.0.tgz'])
        assert.deepEqual(await readFile(join(output, file)), await readFile(join(referencesDir, 'starter', file)));
    }
  }
});
test('omitting a visual theme preserves the existing scaffold and an unknown selection leaves no project', async t => {
  const root = await temporary(t);
  const output = join(root, 'default');
  await createDeck({ referencesDir, template: 'feature', output });
  assert.ok(!(await readdir(output)).includes('style.css'));
  assert.equal(await readFile(join(output, 'slides.md'), 'utf8'), await readFile(join(referencesDir, 'templates/feature/slides.md'), 'utf8'));
  for (const visualTheme of ['unknown', '../natural', '__proto__']) {
    const rejected = join(root, 'rejected-' + visualTheme.replaceAll('/', '_'));
    await assert.rejects(createDeck({ referencesDir, template: 'feature', visualTheme, output: rejected }), /visual theme/i);
    await assert.rejects(access(rejected));
  }
});
test('native CLI accepts a visual theme independently from the narrative', async t => {
  const root = await temporary(t);
  const output = join(root, 'cli');
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./create-deck.mjs', import.meta.url)), '--template', 'architecture', '--visual-theme', 'natural', '--out', output], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).visualTheme, 'natural');
  assert.equal(headmatter(await readFile(join(output, 'slides.md'), 'utf8')).colorSchema, 'light');
});

test('selecting a theme never overwrites an existing deck or its manual styles', async t => {
  const root = await temporary(t);
  const output = join(root, 'manual');
  await mkdir(output);
  await writeFile(join(output, 'slides.md'), '# Existing deck');
  await writeFile(join(output, 'style.css'), '.manual { color: navy; }');
  await assert.rejects(createDeck({ referencesDir, template: 'feature', visualTheme: 'natural', output }), /existing|exists|inspect/i);
  assert.equal(await readFile(join(output, 'slides.md'), 'utf8'), '# Existing deck');
  assert.equal(await readFile(join(output, 'style.css'), 'utf8'), '.manual { color: navy; }');
});

test('theme payload failures roll back only the new consumer', async t => {
  const root = await temporary(t);
  const isolated = join(root, 'installation/references');
  await cp(referencesDir, isolated, { recursive: true });
  await writeFile(join(isolated, 'templates/feature/slides.md'), '# Missing native headmatter');
  const invalid = join(root, 'invalid-template');
  await assert.rejects(createDeck({ referencesDir: isolated, template: 'feature', visualTheme: 'natural', output: invalid }), /headmatter/);
  await assert.rejects(access(invalid));
  await writeFile(join(isolated, 'templates/feature/slides.md'), await readFile(join(referencesDir, 'templates/feature/slides.md')));
  await rm(join(isolated, 'themes/natural/style.css'));
  await writeFile(join(root, 'private.txt'), 'outside theme payload');
  await symlink(join(root, 'private.txt'), join(isolated, 'themes/natural/style.css'));
  const linked = join(root, 'linked-style');
  await assert.rejects(createDeck({ referencesDir: isolated, template: 'feature', visualTheme: 'natural', output: linked }), /symlink/);
  await assert.rejects(access(linked));
  assert.equal(await readFile(join(root, 'private.txt'), 'utf8'), 'outside theme payload');
});
