import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const checker = new URL('../scripts/check-source.mjs', import.meta.url);
async function check(t, markdown, assets = {}) {
  const root = await mkdtemp(join(tmpdir(), 'harness-source-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'slides.md'), markdown);
  for (const [name, content] of Object.entries(assets)) {
    await mkdir(join(root, name, '..'), { recursive: true });
    await writeFile(join(root, name), content);
  }
  const result = spawnSync(process.execPath, [fileURLToPath(checker), '--project', root], { encoding: 'utf8' });
  return { ...result, report: result.stdout ? JSON.parse(result.stdout) : null };
}
test('source validation inventories actual remote resources and resolves public assets', async (t) => {
  const result = await check(t, '---\nrouteAlias: overview\n---\n# Overview\n![diagram](/diagram.svg)\n<HarnessFrame src="https://demo.example/app" fallback="/fallback.svg" title="Demo" />\n', { 'public/diagram.svg': '<svg/>', 'public/fallback.svg': '<svg/>' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.report.resources.external.map(item => item.url), ['https://demo.example/app']);
  assert.equal(result.report.resources.local.length, 2);
  assert.equal(result.report.slides[0].alias, 'overview');
});
test('native frontmatter backgrounds resolve existing public assets', async (t) => {
  const result = await check(t, '---\nrouteAlias: cover\nlayout: cover\nbackground: /images/cover flow.svg\n---\n# Cover\n', { 'public/images/cover flow.svg': '<svg/>' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.report.resources.local.map(item => ({ url: item.url, path: item.path })), [{ url: '/images/cover flow.svg', path: 'public/images/cover flow.svg' }]);
});
test('native frontmatter backgrounds report missing assets', async (t) => {
  const result = await check(t, '---\nrouteAlias: cover\nlayout: cover\nbackground: /missing-background.svg\n---\n# Cover\n');
  assert.equal(result.status, 1);
  assert.deepEqual(result.report.diagnostics.map(item => ({ check: item.check, url: item.url })), [{ check: 'missing-asset', url: '/missing-background.svg' }]);
});
test('native frontmatter resources join the external inventory without fetching', async (t) => {
  const result = await check(t, '---\nrouteAlias: cover\nbackground: https://background.invalid/cover.svg\nfavicon: https://favicon.invalid/icon.svg\ndefaults:\n  background: //defaults.invalid/cover.svg\n  image: https://defaults.invalid/image.svg\n---\n# Cover\n---\nrouteAlias: image\nlayout: image-left\nimage: https://image.invalid/diagram.svg\n---\n# Diagram\n');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(new Set(result.report.resources.external.map(item => item.url)), new Set(['https://background.invalid/cover.svg', 'https://favicon.invalid/icon.svg', '//defaults.invalid/cover.svg', 'https://defaults.invalid/image.svg', 'https://image.invalid/diagram.svg']));
  assert.deepEqual(result.report.resources.local, []);
});
test('native background colors and unrelated metadata do not become file resources', async (t) => {
  const result = await check(t, '---\nrouteAlias: hex\nbackground: "#123abc"\nimage: "rgb(1, 2, 3)"\nmetadata:\n  image: /not-a-native-image.svg\n---\n# Hex\n---\nrouteAlias: rgb\nbackground: rgba(1, 2, 3, 0.5)\n---\n# RGB\n---\nrouteAlias: hsl\nbackground: hsl(120, 50%, 50%)\n---\n# HSL\n');
  assert.equal(result.status, 0, JSON.stringify(result.report?.diagnostics) || result.stderr);
  assert.deepEqual(result.report.resources, { local: [], external: [] });
});
test('native images, explicit favicon and resource defaults use the local asset guard', async (t) => {
  const result = await check(t, '---\nrouteAlias: cover\nfavicon: /icon.svg\ndefaults:\n  background: /default-background.svg\n  image: /default-image.svg\n---\n# Cover\n---\nrouteAlias: image\nlayout: image-right\nimage: /missing-image.svg\n---\n# Diagram\n', { 'public/icon.svg': '<svg/>', 'public/default-background.svg': '<svg/>', 'public/default-image.svg': '<svg/>' });
  assert.equal(result.status, 1);
  assert.deepEqual(new Set(result.report.resources.local.map(item => item.url)), new Set(['/icon.svg', '/default-background.svg', '/default-image.svg']));
  assert.deepEqual(result.report.diagnostics.map(item => ({ check: item.check, url: item.url })), [{ check: 'missing-asset', url: '/missing-image.svg' }]);
});
test('entry resource metadata keeps its owning path when the first slide is imported', async (t) => {
  const result = await check(t, '---\nsrc: pages/cover.md\nfavicon: ./icon.svg\ndefaults:\n  background: ./default-background.svg\n  image: ./default-image.svg\n---\n', {
    'pages/cover.md': '---\nrouteAlias: cover\nimage: ./own-image.svg\n---\n# Cover\n',
    'pages/own-image.svg': '<svg/>',
    'icon.svg': '<svg/>',
    'default-background.svg': '<svg/>',
    'default-image.svg': '<svg/>',
  });
  assert.equal(result.status, 0, JSON.stringify(result.report?.diagnostics) || result.stderr);
  assert.deepEqual(result.report.resources.local.map(item => ({ file: item.file, url: item.url, path: item.path })), [
    { file: 'pages/cover.md', url: './own-image.svg', path: 'pages/own-image.svg' },
    { file: 'slides.md', url: './default-background.svg', path: 'default-background.svg' },
    { file: 'slides.md', url: './default-image.svg', path: 'default-image.svg' },
    { file: 'slides.md', url: './icon.svg', path: 'icon.svg' },
  ]);
});
test('native resource overrides keep the importing frontmatter owner', async (t) => {
  const result = await check(t, '---\nsrc: pages/cover.md\nbackground: ./cover.svg\n---\n', {
    'pages/cover.md': '---\nrouteAlias: cover\nbackground: ./unused.svg\n---\n# Cover\n',
    'cover.svg': '<svg/>',
  });
  assert.equal(result.status, 0, JSON.stringify(result.report?.diagnostics) || result.stderr);
  assert.deepEqual(result.report.resources.local.map(item => ({ file: item.file, url: item.url, path: item.path })), [{ file: 'slides.md', url: './cover.svg', path: 'cover.svg' }]);
});
test('native frontmatter resources reject symlink escapes through the existing path guard', async (t) => {
  const outside = await mkdtemp(join(tmpdir(), 'harness-background-outside-'));
  const root = await mkdtemp(join(tmpdir(), 'harness-background-'));
  t.after(() => Promise.all([rm(outside, { recursive: true, force: true }), rm(root, { recursive: true, force: true })]));
  await writeFile(join(outside, 'external.svg'), '<svg/>');
  await mkdir(join(root, 'public'));
  await symlink(join(outside, 'external.svg'), join(root, 'public', 'escape.svg'));
  await writeFile(join(root, 'slides.md'), '---\nrouteAlias: boundary\nbackground: /escape.svg\n---\n# Boundary\n');
  const result = spawnSync(process.execPath, [fileURLToPath(checker), '--project', root], { encoding: 'utf8' });
  assert.equal(result.status, 1, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report.resources.local, []);
  assert.deepEqual(report.diagnostics.map(item => ({ check: item.check, url: item.url })), [{ check: 'missing-asset', url: '/escape.svg' }]);
});
test('native angle destinations retain spaces alongside plain titles and HTML attributes', async (t) => {
  const result = await check(t, '---\nrouteAlias: assets\n---\n# Assets\n![diagram](</images/retry flow.svg>)\n![titled](</images/titled flow.svg> "Retry flow")\n![plain](/images/plain.svg "Plain title")\n<img src="/images/html flow.svg" alt="HTML flow" />\n', {
    'public/images/retry flow.svg': '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="180"/>',
    'public/images/titled flow.svg': '<svg/>',
    'public/images/plain.svg': '<svg/>',
    'public/images/html flow.svg': '<svg/>',
  });
  assert.equal(result.status, 0, JSON.stringify(result.report?.diagnostics) || result.stderr);
  assert.deepEqual(result.report.resources.local.map(item => item.url), ['/images/retry flow.svg', '/images/titled flow.svg', '/images/plain.svg', '/images/html flow.svg']);
  assert.equal(result.report.resources.local[0].path, 'public/images/retry flow.svg');
});
test('angle destinations with spaces still reject existing resources outside the project', async (t) => {
  const outside = await mkdtemp(join(tmpdir(), 'harness-outside-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await writeFile(join(outside, 'external flow.svg'), '<svg/>');
  const url = `/../../${basename(outside)}/external flow.svg`;
  const result = await check(t, `---\nrouteAlias: boundary\n---\n# Boundary\n![external](<${url}>)\n`);
  assert.equal(result.status, 1);
  assert.deepEqual(result.report.resources.local, []);
  assert.deepEqual(result.report.diagnostics.map(item => ({ check: item.check, url: item.url })), [{ check: 'missing-asset', url }]);
});
test('missing assets and unfinished placeholders are actionable failures', async (t) => {
  const result = await check(t, '---\nrouteAlias: risks\n---\n# TODO: Fill risks\n![missing](/missing.svg)\n');
  assert.equal(result.status, 1);
  assert.deepEqual(new Set(result.report.diagnostics.map(item => item.check)), new Set(['placeholder', 'missing-asset']));
  for (const item of result.report.diagnostics) assert.equal(item.slide, 'risks');
});
test('fenced example references and note-only markup do not become live assets', async (t) => {
  const result = await check(t, '---\nrouteAlias: example\n---\n# Syntax\n```md\n![sample](/not-a-live-asset.svg)\n```\n<!-- speaker note: ![note](/private-note.svg) -->\n');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.report.resources.local.length, 0);
});
test('prepare preserves an existing ignore file and creates an omitted one', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'harness-ignore-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'gitignore.txt'), 'node_modules/\ndist/\n');
  const script = new URL('../scripts/prepare-project.mjs', import.meta.url);
  let result = spawnSync(process.execPath, [fileURLToPath(script), '--project', root], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(join(root, '.gitignore'), 'utf8'), 'node_modules/\ndist/\n');
  await writeFile(join(root, '.gitignore'), '# Keep mine\n');
  result = spawnSync(process.execPath, [fileURLToPath(script), '--project', root], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(join(root, '.gitignore'), 'utf8'), '# Keep mine\n');
});
