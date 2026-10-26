import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fixture } from './scene-fixture.mjs';

const root = new URL('../', import.meta.url);
const evidence = process.env.NATIVE_EVIDENCE_DIR || await mkdtemp(join(tmpdir(), 'th-native-'));
await mkdir(evidence, { recursive: true });

// Catches selecting a renderer that silently drops native binding/label fields.
test('stable incompatibility remains visible and the pinned editor preserves native editing', { timeout: 180_000 }, async () => {
  const input = join(evidence, 'synthetic.excalidraw');
  await writeFile(input, JSON.stringify(fixture()));
  for (const sdk of ['stable', 'pinned']) {
    const output = join(evidence, sdk);
    const run = spawnSync(process.execPath, ['verify.mjs', input, '--output-dir', output, '--sdk', sdk, '--edit-id', 'card-a'],
      { cwd: root, encoding: 'utf8', timeout: 80_000 });
    assert.equal(run.error, undefined, run.error?.message);
    const report = JSON.parse(await readFile(join(output, 'verification.json'), 'utf8'));
    if (sdk === 'stable') {
      assert.equal(run.status, 1);
      assert.equal(report.nativeEditability, 'fail');
      assert.ok(report.errors.some(error => error.includes('labelPosition') || error.includes('mode')));
    } else {
      assert.equal(run.status, 0, run.stderr + JSON.stringify(report));
      assert.equal(report.nativeEditability, 'pass');
      assert.equal(report.fonts.ready, true);
      assert.ok(report.fonts.loaded.some(font => font.family === 'Cascadia' && font.status === 'loaded'));
      assert.equal(report.labelChecks.length, 2);
      assert.ok(report.labelChecks.every(check => check.errorDistance <= 1.5));
      assert.ok(report.editedLabelChecks.every(check => check.errorDistance <= 1.5));
      assert.equal(report.edit.id, 'card-a');
      assert.ok(report.edit.movedDistance > 20);
      assert.ok(report.edit.changedArrowIds.includes('request'));
      assert.ok(report.edit.changedArrowIds.includes('response'));
      assert.equal(report.sourceFidelity, 'unassessed');
      assert.equal(report.visual, 'unassessed');
      for (const name of ['imported.excalidraw', 'edited.excalidraw', 'scene.svg', 'scene.png', 'editor.png', 'edited.svg', 'edited.png']) {
        assert.ok((await readFile(join(output, name))).length > 100, name);
      }
    }
  }
});

// Catches requiring arrow bindings in ordinary valid conceptual drawings.
test('a scene without connections exports with native binding verification not applicable', { timeout: 80_000 }, async () => {
  const input = join(evidence, 'conceptual.excalidraw');
  const scene = fixture();
  scene.elements = scene.elements.filter(element => ['card-a', 'card-b', 'human-note'].includes(element.id));
  for (const element of scene.elements) element.boundElements = null;
  await writeFile(input, JSON.stringify(scene));
  const output = join(evidence, 'conceptual');
  const run = spawnSync(process.execPath, ['verify.mjs', input, '--output-dir', output], { cwd: root, encoding: 'utf8', timeout: 70_000 });
  assert.equal(run.error, undefined);
  const report = JSON.parse(await readFile(join(output, 'verification.json'), 'utf8'));
  assert.equal(run.status, 0, run.stderr + JSON.stringify(report));
  assert.equal(report.nativeEditability, 'not-applicable');
  assert.equal(report.structural, 'pass');
  assert.ok((await readFile(join(output, 'scene.png'))).length > 100);
});

test('verification cannot overwrite the input through an export or recovery destination', { timeout: 90_000 }, async () => {
  for (const through of ['recovery', 'png']) {
    const output = join(evidence, `overlap-${through}`);
    await mkdir(output, { recursive: true });
    const input = join(output, through === 'recovery' ? 'imported.excalidraw' : 'approved.excalidraw');
    const original = JSON.stringify(fixture(), null, 4);
    await writeFile(input, original);
    const args = ['verify.mjs', input, '--output-dir', output];
    if (through === 'png') args.push('--output', input);
    const run = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 40_000 });
    assert.equal(run.error, undefined);
    assert.ok((await readFile(input)).equals(Buffer.from(original)), `${through} overwrote the approved scene`);
    assert.equal(run.status, 1);
  }
});

test('a missing selected font cannot be certified through fallback metrics', { timeout: 80_000 }, async () => {
  const input = join(evidence, 'missing-font.excalidraw');
  await writeFile(input, JSON.stringify(fixture()));
  const font = new URL('../node_modules/@excalidraw/excalidraw/dist/prod/fonts/Cascadia/CascadiaCode-Regular.woff2', import.meta.url);
  const hidden = new URL(`${font.href}.unavailable`);
  const output = join(evidence, 'missing-font');
  let run;
  await rename(font, hidden);
  try {
    run = spawnSync(process.execPath, ['verify.mjs', input, '--output-dir', output], { cwd: root, encoding: 'utf8', timeout: 70_000 });
  } finally {
    await rename(hidden, font);
  }
  assert.equal(run.error, undefined);
  const report = JSON.parse(await readFile(join(output, 'verification.json'), 'utf8'));
  assert.equal(run.status, 1, 'Fallback text must not pass selected-font verification');
  assert.notEqual(report.fonts?.ready, true);
});

test('native edit proof reaches components outside the initial viewport', { timeout: 80_000 }, async () => {
  const input = join(evidence, 'translated.excalidraw');
  const scene = fixture();
  for (const element of scene.elements) { element.x += 5000; element.y -= 3000; }
  await writeFile(input, JSON.stringify(scene));
  const output = join(evidence, 'translated');
  const run = spawnSync(process.execPath, ['verify.mjs', input, '--output-dir', output], { cwd: root, encoding: 'utf8', timeout: 70_000 });
  assert.equal(run.error, undefined);
  const report = JSON.parse(await readFile(join(output, 'verification.json'), 'utf8'));
  assert.equal(run.status, 0, JSON.stringify(report.errors));
  assert.ok(report.edit.movedDistance > 20);
});
