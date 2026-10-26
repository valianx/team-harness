import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fixture, labelClearanceFixture, presentationFixture } from './scene-fixture.mjs';
import { findPython } from '../python.mjs';

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

async function probe(name, scene, presentation = false, wrapper = false) {
  const output = join(evidence, name);
  await mkdir(output, { recursive: true });
  const input = join(output, 'input.excalidraw');
  const bytes = JSON.stringify(scene, null, 2);
  await writeFile(input, bytes);
  let command = process.execPath, args = ['verify.mjs', input, '--output-dir', output, '--edit-id', 'card-a'];
  if (wrapper) {
    const python = findPython();
    command = python.command;
    args = [...python.prefix, '../render_excalidraw.py', input, '--output', join(output, 'wrapper.png'), '--edit-id', 'card-a'];
  }
  if (presentation) args.push('--presentation');
  const run = spawnSync(command, args, { cwd: root, encoding: 'utf8', timeout: 80_000 });
  const reportPath = wrapper ? join(output, 'wrapper.verification', 'verification.json') : join(output, 'verification.json');
  const report = await readFile(reportPath, 'utf8').then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  await writeFile(join(output, 'execution.json'), JSON.stringify({ command, args, status: run.status, signal: run.signal, stdout: run.stdout, stderr: run.stderr, reportPath,
    sourceSha256: createHash('sha256').update(bytes).digest('hex') }, null, 2));
  assert.equal(run.error, undefined, run.error?.message);
  assert.equal(await readFile(input, 'utf8'), bytes, 'Verification must preserve exact source bytes');
  if (report?.nativeEditability === 'pass') {
    const recovered = JSON.parse(await readFile(wrapper ? join(output, 'wrapper.verification', 'edited.excalidraw') : join(output, 'edited.excalidraw'), 'utf8'));
    const note = recovered.elements.find(element => element.id === 'human-note');
    const original = scene.elements.find(element => element.id === 'human-note');
    for (const key of ['x', 'y', 'text', 'customData']) assert.deepEqual(note[key], original[key], `Human note ${key} changed`);
  }
  return { run, report, output };
}

for (const [length, failedStage] of [[80, 'export'], [180, 'edited export'], [220, null]]) {
  test(`bound-label mask clearance ${length} preserves native semantics and exposes hidden heads`, { timeout: 90_000 }, async () => {
    const { run, report } = await probe(`clearance-${length}`, labelClearanceFixture(length));
    assert.equal(report.nativeEditability, 'pass', JSON.stringify(report.errors));
    assert.equal(run.status, failedStage ? 1 : 0, run.stderr + JSON.stringify(report));
    assert.equal(report.labelVisibility, failedStage ? 'fail' : 'pass');
    assert.ok(report.labelVisibilityChecks.length && report.editedLabelVisibilityChecks.length);
    if (failedStage) {
      assert.ok(report.visibilityErrors.some(error => error.includes(failedStage) && error.includes('request') && error.includes('clearance')));
      const checks = failedStage === 'export' ? report.labelVisibilityChecks : report.editedLabelVisibilityChecks;
      assert.ok(checks.some(check => check.arrowId === 'request' && check.clearance < 0));
    } else assert.ok([...report.labelVisibilityChecks, ...report.editedLabelVisibilityChecks].every(check => check.status === 'pass' && check.clearance > 0));
    assert.ok([...report.labelChecks, ...report.editedLabelChecks].every(check => check.errorDistance <= 1.5));
    assert.equal(report.sourceFidelity, 'unassessed');
    assert.equal(report.visual, 'unassessed');
  });
}

test('presentation typography is observed generically and enforced only when requested, including the wrapper', { timeout: 240_000 }, async () => {
  const overview = await probe('typography-overview', presentationFixture());
  assert.equal(overview.run.status, 0, overview.run.stderr + JSON.stringify(overview.report));
  assert.equal(overview.report?.presentationReadability, 'not-applicable');
  assert.equal(overview.report.fittedTypography.length, 2);
  assert.ok(overview.report.fittedTypography.some(view => view.componentTextPx.minimum < 14 || view.relationshipTextPx.minimum < 11));
  const requested = await probe('typography-per-flow', presentationFixture(), true, true);
  assert.equal(requested.run.status, 1);
  assert.equal(requested.report?.nativeEditability, 'pass');
  assert.equal(requested.report.labelVisibility, 'pass');
  assert.equal(requested.report.presentationReadability, 'fail');
  assert.ok(requested.report.presentationFailures.some(failure => failure.viewport.width === 1280 && failure.ids.length));
  const readable = await probe('typography-readable-flow', presentationFixture(false), true, true);
  assert.equal(readable.run.status, 0, readable.run.stderr + JSON.stringify(readable.report));
  assert.equal(readable.report.presentationReadability, 'pass');
  assert.deepEqual(readable.report.presentationFailures, []);
  for (const { report } of [overview, requested, readable]) {
    assert.equal(report.sourceFidelity, 'unassessed');
    assert.equal(report.visual, 'unassessed');
  }
});

test('presentation requires component observations and permits genuinely unlabeled relationships', { timeout: 240_000 }, async () => {
  const withoutArrowLabels = scene => {
    const labels = new Set(scene.elements.filter(element => ['request', 'response'].includes(element.containerId)).map(element => element.id));
    scene.elements = scene.elements.filter(element => !labels.has(element.id));
    for (const arrow of scene.elements.filter(element => element.type === 'arrow')) arrow.boundElements = null;
    return scene;
  };
  const overview = await probe('unclassified-overview', withoutArrowLabels(fixture()));
  assert.equal(overview.run.status, 0, overview.run.stderr + JSON.stringify(overview.report));
  assert.equal(overview.report.presentationReadability, 'not-applicable');
  const missing = await probe('unclassified-presentation', withoutArrowLabels(fixture()), true);
  assert.equal(missing.run.status, 1, 'Absent component observations must not establish a per-flow typography pass');
  assert.equal(missing.report.nativeEditability, 'pass');
  assert.equal(missing.report.presentationReadability, 'fail');
  assert.ok(missing.report.presentationFailures.some(failure => failure.metric === 'componentTextPx' && failure.count === 0));
  const unlabeled = await probe('unlabeled-presentation', withoutArrowLabels(presentationFixture(false)), true, true);
  assert.equal(unlabeled.run.status, 0, unlabeled.run.stderr + JSON.stringify(unlabeled.report));
  assert.equal(unlabeled.report.presentationReadability, 'pass');
  assert.equal(unlabeled.report.labelVisibility, 'not-applicable');
  assert.ok(unlabeled.report.fittedTypography.every(view => view.componentTextPx.count === 2 && view.relationshipTextPx.count === 0));
});
