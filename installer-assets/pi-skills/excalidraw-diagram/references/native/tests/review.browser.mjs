import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fixture } from './scene-fixture.mjs';

const root = new URL('../', import.meta.url);
const evidence = process.env.NATIVE_EVIDENCE_DIR || await mkdtemp(join(tmpdir(), 'th-review-'));
await mkdir(evidence, { recursive: true });
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

async function run(name, scene, args = []) {
  const output = join(evidence, name);
  await mkdir(output, { recursive: true });
  const input = join(output, 'input.excalidraw');
  const bytes = JSON.stringify(scene);
  await writeFile(input, bytes);
  const result = spawnSync(process.execPath, ['verify.mjs', input, '--output-dir', output, '--edit-id', 'card-a', ...args],
    { cwd: root, encoding: 'utf8', timeout: 80_000 });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(digest(await readFile(input)), digest(bytes));
  const report = await readFile(join(output, 'verification.json'), 'utf8').then(JSON.parse).catch(() => null);
  return { result, report, output, input };
}

test('frame clipping wrappers preserve observed label positions and actual typography', { timeout: 90_000 }, async () => {
  const scene = fixture();
  for (const element of scene.elements) element.frameId = 'frame';
  scene.elements.unshift({ ...scene.elements[0], id: 'frame', type: 'frame', name: 'Framed flow',
    x: 60, y: 160, width: 820, height: 430, boundElements: null, frameId: null });
  const { result, report } = await run('frame-labels', scene, ['--review']);
  assert.equal(result.status, 0, result.stderr + JSON.stringify(report));
  assert.equal(report.nativeEditability, 'pass');
  assert.ok(report.typography.filter(value => value.role === 'relationship').every(value => value.fontSize > 0));
  assert.ok(report.labelChecks.every(value => value.errorDistance <= 1.5));
  assert.ok(report.editedLabelChecks.every(value => value.errorDistance <= 1.5));
  assert.equal(report.composition.initial.status, 'pass');
});

test('review reports native collisions and emits focused and comparable images without changing sources', { timeout: 90_000 }, async () => {
  const before = fixture();
  const beforeFile = join(evidence, 'before.excalidraw');
  const beforeBytes = JSON.stringify(before);
  await writeFile(beforeFile, beforeBytes);
  const scene = fixture();
  scene.elements.push({ ...scene.elements[0], id: 'obstacle', x: 350, y: 235, width: 80, height: 50, boundElements: null });
  const { result, report, output } = await run('composition-review', scene, ['--review', '--focus', 'obstacle', '--before', beforeFile]);
  assert.equal(result.status, 1, 'A real route collision must keep reviewed delivery failing');
  assert.ok(report, result.stderr);
  assert.equal(report.nativeEditability, 'pass');
  assert.equal(report.composition.initial.status, 'fail');
  assert.ok(report.composition.initial.issues.some(value => value.kind === 'arrow-box-crossing' && value.elementIds.includes('obstacle')));
  assert.equal(report.visual, 'unassessed');
  assert.ok(report.review.initial.crops.some(value => value.elementIds.includes('obstacle')));
  for (const crop of report.review.initial.crops) assert.ok((await readFile(join(output, crop.path))).length > 100);
  assert.ok((await readFile(join(output, report.review.comparison.path))).length > 100);
  assert.ok(report.review.comparison.sharedViewBox.width > 0);
  assert.equal(report.review.beforeSha256, digest(beforeBytes));
  assert.equal(digest(await readFile(beforeFile)), digest(beforeBytes));
});

test('review rejects a comparison input inside its generated crop directory', { timeout: 90_000 }, async () => {
  const directory = join(evidence, 'protected-comparison', 'review-initial');
  await mkdir(directory, { recursive: true });
  const beforeFile = join(directory, '01.png');
  const bytes = JSON.stringify(fixture());
  await writeFile(beforeFile, bytes);
  const { result } = await run('protected-comparison', fixture(), ['--review', '--before', beforeFile]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /outside generated review directories/);
  assert.equal(await readFile(beforeFile, 'utf8'), bytes);
});

test('a symlinked output root cannot redirect review evidence over the comparison source', { timeout: 90_000 }, async () => {
  const physical = join(evidence, 'physical-output');
  await mkdir(join(physical, 'review-initial'), { recursive: true });
  const before = join(physical, 'review-initial', 'issues.json');
  const current = join(evidence, 'symlink-current.excalidraw');
  const bytes = JSON.stringify(fixture());
  await writeFile(before, bytes); await writeFile(current, bytes);
  const alias = join(evidence, 'aliased-output');
  await symlink(physical, alias, 'dir');
  const run = spawnSync(process.execPath, ['verify.mjs', current, '--output-dir', alias, '--review', '--before', before, '--edit-id', 'card-a'],
    { cwd: root, encoding: 'utf8', timeout: 80_000 });
  assert.equal(run.error, undefined);
  assert.equal(run.status, 1);
  assert.equal(await readFile(before, 'utf8'), bytes);
  assert.equal(await readFile(current, 'utf8'), bytes);
});
