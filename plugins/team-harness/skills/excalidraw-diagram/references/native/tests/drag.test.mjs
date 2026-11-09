import assert from 'node:assert/strict';
import test from 'node:test';
import { planDrag } from '../drag.mjs';

const box = (id, x, y, width = 100, height = 60, extra = {}) => ({ id, type: 'rectangle', x, y, width, height, angle: 0, ...extra });
const target = extra => box('target', 100, 100, 100, 60, { boundElements: [{ id: 'route', type: 'arrow' }], ...extra });
const route = { id: 'route', type: 'arrow', startBinding: { elementId: 'target' }, endBinding: { elementId: 'other' } };
const scene = extra => [target(), box('other', 600, 100), route, ...extra];

test('keeps the original pointer motion when its destination is clear', () => {
  const result = planDrag(scene([]), 'target');
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.pointerDelta, { x: 60, y: 45 });
  assert.deepEqual(result.sceneDelta, { x: 60, y: 45 });
  assert.deepEqual(result.destination, { x: 160, y: 145, width: 100, height: 60 });
});

test('chooses another deterministic direction when the original destination is blocked', () => {
  const result = planDrag(scene([box('obstacle', 230, 130)]), 'target');
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.pointerDelta, { x: -60, y: 45 });
});

test('requires eight scene units of obstacle clearance', () => {
  for (const x of [267, 268]) {
    const result = planDrag(scene([box('obstacle', x, 145)]), 'target', { pointerDeltas: [{ x: 60, y: 45 }] });
    assert.equal(result.status, x === 268 ? 'ready' : 'unavailable');
  }
});

test('converts CSS pointer motion through the actual editor zoom', () => {
  const result = planDrag(scene([]), 'target', { zoom: .5 });
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.sceneDelta, { x: 120, y: 90 });
  assert.deepEqual(result.destination, { x: 220, y: 190, width: 100, height: 60 });
});

test('stays inside an original enclosing container and an explicit frame', () => {
  for (const type of ['rectangle', 'frame']) {
    const parent = box('parent', 90, 90, 200, 150, { type });
    const current = target(type === 'frame' ? { frameId: 'parent' } : {});
    const result = planDrag([current, route, parent], 'target');
    assert.equal(result.status, 'ready');
    assert.ok(result.destination.x >= 90 && result.destination.x + result.destination.width <= 290);
    assert.ok(result.destination.y >= 90 && result.destination.y + result.destination.height <= 240);
  }
});

test('does not escape a tight parent merely to manufacture an edit proof', () => {
  const result = planDrag([target(), route, box('parent', 95, 95, 110, 70)], 'target');
  assert.equal(result.status, 'unavailable');
});

test('missing or invalid explicit frame geometry remains unavailable', () => {
  for (const parent of [null, box('frame', 0, 0, NaN, 500, { type: 'frame' }), box('frame', 0, 0, 50, 50, { type: 'frame' })]) {
    const elements = [target({ frameId: 'frame' }), route, ...(parent ? [parent] : [])];
    assert.equal(planDrag(elements, 'target').status, 'unavailable');
  }
});

test('does not drag compound containers while their children remain behind', () => {
  assert.equal(planDrag([target(), route, box('child', 120, 115, 20, 20)], 'target').status, 'unavailable');
});

test('rotation uses a conservative footprint for both target and obstacle', () => {
  const elements = [target({ angle: Math.PI / 4 }), route, box('obstacle', 245, 155, 50, 50, { angle: Math.PI / 4 })];
  assert.equal(planDrag(elements, 'target', { pointerDeltas: [{ x: 60, y: 45 }] }).status, 'unavailable');
  const clear = planDrag(elements, 'target');
  assert.equal(clear.status, 'ready');
  assert.notDeepEqual(clear.pointerDelta, { x: 60, y: 45 });
});

test('refuses invalid zoom, geometry and movement below the native proof threshold', () => {
  for (const zoom of [0, -1, NaN, Infinity, 10]) assert.equal(planDrag(scene([]), 'target', { zoom }).status, 'unavailable');
  for (const extra of [{ x: NaN }, { width: -1 }, { angle: Infinity }]) assert.equal(planDrag([target(extra), route], 'target').status, 'unavailable');
  assert.equal(planDrag(scene([box('invalid', 300, 100, NaN)]), 'target').status, 'unavailable');
  assert.equal(planDrag(scene([]), 'target', { pointerDeltas: [{ x: 5, y: 5 }] }).status, 'unavailable');
});

test('requires a live reciprocal native arrow binding', () => {
  for (const elements of [[target()], [target(), { ...route, isDeleted: true }], [target({ boundElements: [] }), route], [{ ...target(), isDeleted: true }, route]]) {
    assert.equal(planDrag(elements, 'target').status, 'unavailable');
  }
});

test('malformed reciprocal bindings or target identity remain unavailable', () => {
  for (const boundElements of [{}, [null], 'route']) {
    assert.equal(planDrag([target({ boundElements }), route], 'target').status, 'unavailable');
  }
  assert.equal(planDrag(scene([]), null).status, 'unavailable');
});

test('rotated parent containment is stricter than its surrounding axis-aligned box', () => {
  const parent = box('parent', 60, 110, 280, 180, { angle: Math.PI / 4 });
  const current = target({ x: 180, y: 190, width: 40, height: 20 });
  assert.equal(planDrag([current, parent, route], 'target', { pointerDeltas: [{ x: 130, y: 0 }] }).status, 'unavailable');
});

test('keeps the complete target in the visible viewport and rejects offscreen endpoints', () => {
  const result = planDrag(scene([]), 'target', { viewportPoint: { x: 80, y: 80 }, viewport: { width: 200, height: 200 } });
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.pointerDelta, { x: 0, y: 75 });
  assert.equal(planDrag(scene([]), 'target', { viewportPoint: { x: 80, y: 80 }, viewport: { width: 200, height: 200 },
    pointerDeltas: [{ x: -60, y: -45 }] }).status, 'unavailable');
});

test('ignores deleted obstacles and non-shape annotations without mutating input', () => {
  const elements = scene([box('deleted', 160, 145, 100, 60, { isDeleted: true }),
    { id: 'text', type: 'text', x: 160, y: 145, width: 100, height: 60 }]);
  const before = structuredClone(elements);
  assert.equal(planDrag(elements, 'target').status, 'ready');
  assert.deepEqual(elements, before);
});

test('no free candidate stays unavailable without choosing a collision', () => {
  const elements = scene([box('obstacle', 40, 40, 80, 80), box('obstacle-2', 200, 40, 80, 80),
    box('obstacle-3', 40, 150, 80, 80), box('obstacle-4', 200, 150, 80, 80)]);
  assert.equal(planDrag(elements, 'target').status, 'unavailable');
  assert.equal(planDrag(scene([]), 'target', { pointerDeltas: [] }).status, 'unavailable');
});
