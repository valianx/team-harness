import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
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
