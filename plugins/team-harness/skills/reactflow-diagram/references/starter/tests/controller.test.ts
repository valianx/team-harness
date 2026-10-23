import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLayoutRunner } from '../src/controller';
import type { Architecture, Geometry, Measurements } from '../src/types';

function model(): Architecture {
  return {
    schemaVersion: 1, title: 'Measured service', theme: 'presentation', direction: 'right',
    sources: [{ id: 'source', title: 'Synthetic source', locator: 'source.md', status: 'read' }],
    nodes: [{ id: 'service', kind: 'service', label: 'Service', evidence: [{ source: 'source', locator: 'Service' }] }],
    groups: [], edges: [], review: { unresolved: [], decisions: [] }, views: [], steps: [],
  };
}

function measured(width: number): Measurements {
  return { nodes: { service: { width, height: 88 } }, headers: {}, labels: {} };
}

function placed(width: number): Geometry {
  return { nodes: [{ id: 'service', kind: 'service', x: 0, y: 0, absX: 0, absY: 0, width, height: 88, headerHeight: 0 }], edges: [], bounds: { width, height: 88 } };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

test('uses the stable remeasured dimensions rather than the first layout', async () => {
  const snapshots = [measured(100), measured(140), measured(140)];
  const runner = createLayoutRunner({ layout: async (_model, sizes) => placed(sizes.nodes.service.width) });
  const result = await runner.run(model(), async () => snapshots.shift() ?? measured(140));
  assert.equal(result.geometry.nodes[0].width, 140);
  assert.deepEqual(result.diagnostics, []);
});

test('a newer run supersedes an older pending layout result', { timeout: 1000 }, async () => {
  const oldLayout = deferred<Geometry>();
  const entered = deferred<void>();
  const runner = createLayoutRunner({ layout: async (architecture, sizes) => {
    if (architecture.title === 'Old revision') {
      entered.resolve();
      return oldLayout.promise;
    }
    return placed(sizes.nodes.service.width);
  } });
  const old = runner.run({ ...model(), title: 'Old revision' }, async () => measured(100));
  const oldRejected = assert.rejects(old, /stale|supersed|invalidat|cancel|obsolete/i);
  await entered.promise;
  const current = await runner.run({ ...model(), title: 'Current revision' }, async () => measured(240));
  assert.equal(current.geometry.nodes[0].width, 240);
  assert.deepEqual(current.diagnostics, []);
  oldLayout.resolve(placed(100));
  await oldRejected;
});

test('invalidation prevents a pending layout from becoming a current result', { timeout: 1000 }, async () => {
  const pending = deferred<Geometry>();
  const entered = deferred<void>();
  const runner = createLayoutRunner({ layout: async () => {
    entered.resolve();
    return pending.promise;
  } });
  const result = runner.run(model(), async () => measured(100));
  const rejected = assert.rejects(result, /stale|supersed|invalidat|cancel|obsolete/i);
  await entered.promise;
  runner.invalidate();
  pending.resolve(placed(100));
  await rejected;
});

test('readiness that never resolves fails within the configured timeout', { timeout: 1000 }, async () => {
  const runner = createLayoutRunner({ timeoutMs: 25, layout: async () => placed(100) });
  await assert.rejects(runner.run(model(), () => new Promise<Measurements>(() => {})), /timeout|timed out|readiness/i);
});

test('a layout that never resolves is also bounded by the timeout', { timeout: 1000 }, async () => {
  const runner = createLayoutRunner({ timeoutMs: 25, layout: () => new Promise<Geometry>(() => {}) });
  await assert.rejects(runner.run(model(), async () => measured(100)), /timeout|timed out|readiness/i);
});

test('dimensions may settle on the third layout pass', async () => {
  const snapshots = [measured(100), measured(120), measured(140), measured(140)];
  const runner = createLayoutRunner({ layout: async (_model, sizes) => placed(sizes.nodes.service.width) });
  const result = await runner.run(model(), async () => snapshots.shift() ?? measured(140));
  assert.equal(result.geometry.nodes[0].width, 140);
  assert.deepEqual(result.diagnostics, []);
});

test('nonconvergent measurements terminate before waiting on a fourth pass', { timeout: 1000 }, async () => {
  const snapshots = [measured(100), measured(120), measured(140), measured(160)];
  const runner = createLayoutRunner({ layout: async (_model, sizes) => placed(sizes.nodes.service.width) });
  await assert.rejects(runner.run(model(), () => {
    const snapshot = snapshots.shift();
    return snapshot ? Promise.resolve(snapshot) : new Promise<Measurements>(() => {});
  }), /converg|pass|limit/i);
});

test('a smaller pass limit terminates before requesting another measurement', { timeout: 1000 }, async () => {
  const snapshots = [measured(100), measured(120), measured(140)];
  const runner = createLayoutRunner({ maxPasses: 2, layout: async (_model, sizes) => placed(sizes.nodes.service.width) });
  await assert.rejects(runner.run(model(), () => {
    const snapshot = snapshots.shift();
    return snapshot ? Promise.resolve(snapshot) : new Promise<Measurements>(() => {});
  }), /converg|pass|limit/i);
});

test('an empty model reaches its empty geometry without waiting for node measurements', { timeout: 1000 }, async () => {
  const empty = { ...model(), nodes: [] };
  const runner = createLayoutRunner({ timeoutMs: 25 });
  const result = await runner.run(empty, () => new Promise<Measurements>(() => {}));
  assert.deepEqual(result.geometry, { nodes: [], edges: [], bounds: { width: 0, height: 0 } });
  assert.deepEqual(result.diagnostics, []);
});

test('mutating a reused measurement object still triggers recalculation', async () => {
  const sizes = measured(100);
  let first = true;
  const runner = createLayoutRunner({ layout: async (_model, measurements) => placed(measurements.nodes.service.width) });
  const result = await runner.run(model(), async () => {
    if (first) first = false;
    else sizes.nodes.service.width = 180;
    return sizes;
  });
  assert.equal(result.geometry.nodes[0].width, 180);
  assert.deepEqual(result.diagnostics, []);
});
