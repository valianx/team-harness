import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fixture } from './scene-fixture.mjs';

const root = new URL('../', import.meta.url);
const evidence = process.env.NATIVE_EVIDENCE_DIR || await mkdtemp(join(tmpdir(), 'th-polish-'));

async function verify(name, scene) {
  const output = join(evidence, name);
  await mkdir(output, { recursive: true });
  const input = join(output, 'input.excalidraw');
  const bytes = JSON.stringify(scene);
  await writeFile(input, bytes);
  const result = spawnSync(process.execPath, ['verify.mjs', input, '--output-dir', output, '--edit-id', 'card-a'],
    { cwd: root, encoding: 'utf8', timeout: 80_000 });
  assert.equal(result.error, undefined);
  assert.equal(await readFile(input, 'utf8'), bytes);
  return { result, output, report: JSON.parse(await readFile(join(output, 'verification.json'), 'utf8')) };
}

test('native proof chooses clear space when the original drag would overlap another card', { timeout: 90_000 }, async () => {
  const scene = fixture();
  scene.elements.push({ ...scene.elements[0], id: 'obstacle', x: 290, y: 270, width: 160, height: 140, boundElements: null });
  const { result, report } = await verify('free-destination', scene);
  assert.equal(result.status, 0, JSON.stringify(report.errors));
  assert.equal(report.nativeEditability, 'pass');
  assert.ok(report.edit.pointerDeltaCssPx);
  assert.notDeepEqual(report.edit.pointerDeltaCssPx, { x: 60, y: 45 });
  const box = report.edit.destination;
  assert.ok(box.x + box.width + 8 <= 290 || box.x - 8 >= 450 || box.y + box.height + 8 <= 270 || box.y - 8 >= 410);
  assert.ok(report.edit.movedDistance >= 20);
  const summary = JSON.parse(result.stdout.trim().split('\n').at(-1));
  assert.equal(summary.verification, 'pass');
  assert.equal(summary.errorsCount, 0);
});

test('the reported destination is recovered from the editor even with grid snapping enabled', { timeout: 90_000 }, async () => {
  const scene = fixture();
  Object.assign(scene.appState, { gridModeEnabled: true, gridSize: 100 });
  const { report, output } = await verify('snapped-destination', scene);
  const edited = JSON.parse(await readFile(join(output, 'edited.excalidraw'), 'utf8'));
  const moved = edited.elements.find(value => value.id === 'card-a');
  assert.deepEqual(report.edit.destination, { x: moved.x, y: moved.y, width: moved.width, height: moved.height });
  assert.ok(['ready', 'unavailable'].includes(report.edit.destinationSafety));
});

test('snapping into occupied space cannot certify the native edit proof', { timeout: 90_000 }, async () => {
  const scene = fixture();
  Object.assign(scene.appState, { gridModeEnabled: true, gridSize: 100 });
  scene.elements.push({ ...scene.elements[0], id: 'snap-obstacle', x: 350, y: 280, width: 120, height: 140, boundElements: null });
  const { result, report } = await verify('unsafe-snapped-destination', scene);
  assert.equal(result.status, 1);
  assert.equal(report.nativeEditability, 'fail');
  assert.equal(report.edit.destinationSafety, 'unavailable');
  assert.ok(report.errors.some(value => value.startsWith('Recovered edit destination is not safe')));
});

test('a fully occupied frame leaves edit proof explicitly unavailable', { timeout: 90_000 }, async () => {
  const scene = fixture(), target = scene.elements[0];
  target.frameId = 'tight-frame';
  scene.elements.unshift({ ...target, id: 'tight-frame', type: 'frame', name: 'No free destination',
    boundElements: null, frameId: null });
  const { result, report } = await verify('unavailable-destination', scene);
  assert.equal(result.status, 1);
  assert.equal(report.nativeEditability, 'unavailable');
  assert.equal(report.edit.status, 'unavailable');
  assert.match(report.edit.reason, /No candidate/);
});
