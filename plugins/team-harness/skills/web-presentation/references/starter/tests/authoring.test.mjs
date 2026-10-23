import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = new URL('../scripts/update-slide.mjs', import.meta.url);
async function project(t, files) {
  const root = await mkdtemp(join(tmpdir(), 'harness-authoring-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [name, content] of Object.entries(files)) {
    await mkdir(join(root, name, '..'), { recursive: true });
    await writeFile(join(root, name), content);
  }
  return root;
}
function update(root, alias = 'retry') {
  return spawnSync(process.execPath, [fileURLToPath(script), '--project', root, '--slide', alias, '--file', join(root, 'fragment.md')], { encoding: 'utf8' });
}

for (const newline of ['\n', '\r\n']) {
  test(`named update preserves literal surrounding bytes and repeats without duplication (${JSON.stringify(newline)})`, async (t) => {
    const prefix = ['---', 'theme: default', 'routeAlias: opening', '---', '# Existing 👋', '', '```text', '---', 'routeAlias: misleading', '```', '', ''].join(newline);
    const originalTarget = ['---', 'routeAlias: retry', 'layout: h-content', '---', '# Old retry', '', ''].join(newline);
    const suffix = ['---', 'routeAlias: decision', '---', '# Manual decision', '<!-- Keep  two  spaces + 日本語 -->', ''].join(newline);
    const replacement = '---\nrouteAlias: retry\nlayout: h-content\n---\n# Retry handling\n\nTry twice, then ask for help.\n';
    const root = await project(t, { 'slides.md': prefix + originalTarget + suffix, 'fragment.md': replacement, 'package.json': '{"manual":"unchanged"}', 'asset.svg': '<svg><!-- manual --></svg>' });
    const beforePackage = await readFile(join(root, 'package.json'));
    const beforeAsset = await readFile(join(root, 'asset.svg'));
    const first = update(root);
    assert.equal(first.status, 0, first.stderr);
    const expected = prefix + replacement.replaceAll('\n', newline) + newline + suffix;
    assert.equal(await readFile(join(root, 'slides.md'), 'utf8'), expected);
    const second = update(root);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(await readFile(join(root, 'slides.md'), 'utf8'), expected);
    assert.deepEqual(await readFile(join(root, 'package.json')), beforePackage);
    assert.deepEqual(await readFile(join(root, 'asset.svg')), beforeAsset);
  });
}

test('native import update changes only the owning imported source', async (t) => {
  const entry = '---\ntheme: default\nrouteAlias: opening\n---\n# Opening\n\n---\nsrc: ./sections/retry.md\n---\n';
  const root = await project(t, { 'slides.md': entry, 'sections/retry.md': '---\nrouteAlias: retry\nlayout: h-content\n---\n# Before\n', 'fragment.md': '---\nrouteAlias: retry\nlayout: h-content\n---\n# After\n' });
  const result = update(root);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(join(root, 'slides.md'), 'utf8'), entry);
  assert.equal(await readFile(join(root, 'sections/retry.md'), 'utf8'), '---\nrouteAlias: retry\nlayout: h-content\n---\n# After\n');
});

for (const [label, slides, fragment] of [
  ['missing alias', '---\nrouteAlias: other\n---\n# Existing\n', '---\nrouteAlias: retry\n---\n# Update\n'],
  ['duplicate alias', '---\nrouteAlias: retry\n---\n# First\n\n---\nrouteAlias: retry\n---\n# Second\n', '---\nrouteAlias: retry\n---\n# Update\n'],
  ['mismatched replacement', '---\nrouteAlias: retry\n---\n# Existing\n', '---\nrouteAlias: other\n---\n# Update\n'],
  ['multiple replacement slides', '---\nrouteAlias: retry\n---\n# Existing\n', '---\nrouteAlias: retry\n---\n# One\n\n---\nrouteAlias: extra\n---\n# Two\n'],
  ['protected entry headmatter', '---\ntheme: default\nrouteAlias: retry\n---\n# Existing\n', '---\ntheme: another-theme\nrouteAlias: retry\n---\n# Update\n'],
  ['unknown project headmatter', '---\ncustomProjectOption: preserved\nrouteAlias: retry\n---\n# Existing\n', '---\ncustomProjectOption: replaced\nrouteAlias: retry\n---\n# Update\n'],
]) {
  test(`${label} fails without changing source`, async (t) => {
    const root = await project(t, { 'slides.md': slides, 'fragment.md': fragment });
    const result = update(root);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /alias|replacement|headmatter/i);
    assert.equal(await readFile(join(root, 'slides.md'), 'utf8'), slides);
  });
}

test('symlinked native imports outside the project fail before mutation', async (t) => {
  const outside = await project(t, { 'private.md': '---\nrouteAlias: retry\n---\n# Outside\n' });
  const entry = '---\nrouteAlias: opening\n---\n# Opening\n\n---\nsrc: ./escape.md\n---\n';
  const root = await project(t, { 'slides.md': entry, 'fragment.md': '---\nrouteAlias: retry\n---\n# Update\n' });
  await symlink(join(outside, 'private.md'), join(root, 'escape.md'));
  const result = update(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /outside|escape/i);
  assert.equal(await readFile(join(outside, 'private.md'), 'utf8'), '---\nrouteAlias: retry\n---\n# Outside\n');
});
