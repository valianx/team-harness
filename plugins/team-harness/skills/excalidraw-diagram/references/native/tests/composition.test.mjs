import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectComposition } from '../composition.mjs';

const box = (id, x, y, width = 100, height = 60, extra = {}) => ({
  id, type: 'rectangle', bounds: { x, y, width, height }, ...extra,
});
const text = (id, x, y, width = 70, height = 20, extra = {}) => ({
  id, type: 'text', bounds: { x, y, width, height }, ...extra,
});
const arrow = (id, points, extra = {}) => ({ id, type: 'arrow', points: points.map(([x, y]) => ({ x, y })), ...extra });
const inspect = (elements, options) => inspectComposition({ elements }, options);
const kinds = result => result.issues.map(issue => issue.kind);

test('detects actual text overflow and accepts the one-unit geometry tolerance', () => {
  const result = inspect([box('card', -100, -80), text('label', -90, -30, 70, 20, { containerId: 'card' })]);
  assert.equal(result.status, 'fail');
  assert.deepEqual(kinds(result), ['text-overflow']);
  assert.deepEqual(result.issues[0].elementIds, ['label', 'card']);
  assert.equal(result.issues[0].measurement.overflow, 10);
  assert.equal(inspect([box('card', 0, 0), text('label', 5, 41, 70, 20, { containerId: 'card' })]).status, 'pass');
});

test('detects partial box overlap but preserves intentional complete containment and frames', () => {
  assert.deepEqual(kinds(inspect([box('a', 0, 0), box('b', 80, 30)])), ['box-overlap']);
  assert.equal(inspect([box('zone', -10, -10, 200, 200), box('child', 20, 20)]).status, 'pass');
  assert.equal(inspect([box('frame', 0, 0, 100, 100, { type: 'frame' }), box('node', 80, 80)]).status, 'pass');
  assert.equal(inspect([box('zone', 0, 0, 100, 100, { isBoundary: true }), box('node', 80, 80)]).status, 'pass');
});

test('coincident unrelated boxes warn while unequal nesting and explicit boundaries stay exempt', () => {
  for (const offset of [0, .5]) {
    const result = inspect([box('a', -20, -10), box('b', -20 + offset, -10 + offset)]);
    assert.equal(result.status, 'pass');
    assert.deepEqual(kinds(result), ['box-coincident']);
    assert.equal(result.issues[0].severity, 'warning');
    assert.deepEqual(result.issues[0].elementIds, ['a', 'b']);
  }
  assert.deepEqual(inspect([box('parent', -20, -10, 120, 80), box('child', -10, 0)]).issues, []);
  assert.deepEqual(inspect([box('boundary', 0, 0, 100, 60, { isBoundary: true }), box('node', 0, 0)]).issues, []);
  assert.deepEqual(inspect([box('frame', 0, 0, 100, 60, { type: 'frame' }), box('node', 0, 0)]).issues, []);
});

test('uses convex polygons for rotated geometry instead of intersecting bounding boxes', () => {
  const a = box('a', -10, -10, 20, 20, { angle: Math.PI / 4,
    polygon: [{ x: -10, y: 0 }, { x: 0, y: -10 }, { x: 10, y: 0 }, { x: 0, y: 10 }] });
  const b = box('b', 7, 7, 5, 5);
  assert.equal(inspect([a, b]).status, 'pass');
  const uncertain = inspect([{ ...a, polygon: undefined }, b]);
  assert.equal(uncertain.status, 'pass');
  assert.equal(uncertain.issues[0].severity, 'warning');
  assert.equal(uncertain.issues[0].measurement.approximate, true);
});

test('invalid supplied polygons and unobserved rotations cannot yield exact collision errors', () => {
  const invalidPolygons = [null, [], 0,
    [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 30, y: 20 }, { x: 100, y: 60 }, { x: 0, y: 60 }],
    [{ x: NaN, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 60 }]];
  for (const polygon of invalidPolygons) {
    const result = inspect([box('a', 0, 0, 100, 60, { polygon }), box('b', 80, 30)]);
    assert.equal(result.status, 'pass');
    assert.equal(result.issues[0].severity, 'warning');
    assert.equal(result.issues[0].measurement.approximate, true);
  }
  for (const angle of [Math.PI / 4, NaN, Infinity]) {
    const result = inspect([text('a', 0, 0, 100, 60, { angle }), text('b', 80, 30)]);
    assert.equal(result.status, 'pass');
    assert.equal(result.issues[0].severity, 'warning');
  }
  assert.equal(inspect([box('a', 0, 0), box('b', 80, 30)]).issues[0].severity, 'error');
});

test('rejects an arrow through an unrelated box but ignores bindings and container boundaries', () => {
  const nodes = [box('start', -100, 0), box('end', 200, 0), box('obstacle', 60, 0)];
  const route = arrow('route', [[0, 30], [200, 30]], { startBinding: { elementId: 'start' }, endBinding: { elementId: 'end' } });
  const result = inspect([...nodes, route]);
  assert.deepEqual(kinds(result), ['arrow-box-crossing']);
  assert.deepEqual(result.issues[0].elementIds, ['route', 'obstacle']);
  assert.equal(result.issues[0].measurement.insideLength, 98);
  assert.equal(inspect([nodes[0], nodes[1], route]).status, 'pass');
  assert.equal(inspect([...nodes, { ...route, points: [{ x: 0, y: -1 }, { x: 200, y: -1 }] }]).status, 'pass');
  assert.equal(inspect([box('zone', 40, 0, 140, 80, { isBoundary: true }), route]).status, 'pass');
});

test('arrow tangency and one-unit incursion are not crossings', () => {
  const shape = box('shape', 0, 0);
  for (const y of [0, 1, -1]) {
    assert.equal(inspect([shape, arrow('route', [[-10, y], [110, y]])]).status, 'pass');
  }
  assert.equal(inspect([shape, arrow('route', [[-10, 2], [110, 2]])]).status, 'fail');
});

test('detects unrelated arrow/text crossings while preserving its label mask and endpoint labels', () => {
  const route = arrow('route', [[0, 10], [180, 10]], { startBinding: { elementId: 'card' } });
  assert.deepEqual(kinds(inspect([route, text('other', 40, 0)])), ['arrow-text-crossing']);
  assert.equal(inspect([route, text('own', 40, 0, 70, 20, { containerId: 'route' })]).status, 'pass');
  assert.equal(inspect([route, box('card', 0, 0), text('endpoint', 10, 0, 70, 20, { containerId: 'card' })]).status, 'pass');
  assert.equal(inspect([route, text('heading', 40, 0, 70, 20, { isBoundary: true })]).status, 'fail');
});

test('boundary titles retain collisions with other text while their own container is intentional', () => {
  const heading = text('heading', 0, 0, 80, 20, { containerId: 'zone' });
  const zone = box('zone', 0, 5, 200, 100, { isBoundary: true });
  assert.equal(inspect([zone, heading]).status, 'pass');
  assert.deepEqual(kinds(inspect([zone, heading, text('route-label', 75, 0, 60, 20)])), ['text-overlap']);
  assert.deepEqual(kinds(inspect([zone, heading, text('route-label', 82, 0, 60, 20)])), ['text-clearance']);
});

test('approximate arrow paths produce warnings without asserting exact collisions', () => {
  const result = inspect([box('card', 0, 0), arrow('curve', [[-10, 30], [110, 30]], { approximate: true })]);
  assert.equal(result.status, 'pass');
  assert.equal(result.issues[0].severity, 'warning');
  assert.equal(result.issues[0].measurement.approximate, true);
});

test('detects text overlaps and ignores tangent or nearly touching labels', () => {
  assert.deepEqual(kinds(inspect([text('a', 0, 0), text('b', 60, 0)])), ['text-overlap']);
  assert.equal(inspect([text('a', 0, 0), text('b', 69, 0)]).status, 'pass');
  assert.equal(inspect([text('a', 0, 0), text('b', 70, 0)]).status, 'pass');
});

test('reports alignment and gap warnings only for explicit groups', () => {
  const nodes = [box('a', 0, 0), box('b', 0, 100), box('c', 5, 220)];
  assert.equal(inspect(nodes).issues.length, 0);
  const result = inspect(nodes, { alignmentGroups: [{ ids: ['a', 'b', 'c'], axis: 'x', anchor: 'start', spacing: 'equal' }] });
  assert.equal(result.status, 'pass');
  assert.deepEqual(kinds(result), ['alignment', 'spacing']);
  assert.equal(result.issues[0].measurement.deviation, 5);
  assert.equal(result.issues[1].measurement.deviation, 20);
  assert.ok(result.issues.every(issue => issue.severity === 'warning'));
  assert.equal(inspect(nodes, { alignmentGroups: [{ ids: ['a', 'b', 'c'], axis: 'x', tolerance: 25, spacing: 'equal' }] }).issues.length, 0);
});

test('unavailable observations cannot become a clean pass', () => {
  assert.equal(inspectComposition().status, 'unavailable');
  assert.equal(inspectComposition({ elements: {} }).status, 'unavailable');
  assert.equal(inspect([{ id: 'missing', type: 'text' }]).status, 'unavailable');
  assert.equal(inspect([box('nan', NaN, 0)]).status, 'unavailable');
  assert.equal(inspect([arrow('empty', [[0, 0]])]).status, 'unavailable');
  assert.equal(inspect([box('a', 0, 0), text('label', 0, 0, 20, 10, { containerId: 'missing' })]).status, 'unavailable');
  assert.equal(inspect([box('a', 0, 0)], { alignmentGroups: [{ ids: ['a', 'missing'], axis: 'y' }] }).status, 'unavailable');
  assert.equal(inspect([box('a', 0, 0)], { alignmentGroups: {} }).status, 'unavailable');
  assert.equal(inspect([box('a', 0, 0)], { alignmentGroups: [{ ids: ['a', 'a'], axis: 'y' }] }).status, 'unavailable');
});

test('large translated coordinates keep footprint orientation and collisions measurable', () => {
  const base = 1e12;
  const result = inspect([box('card', base, base), text('label', base + 10, base + 50, 70, 20, { containerId: 'card' })]);
  assert.equal(result.status, 'fail');
  assert.equal(result.issues[0].measurement.overflow, 10);
});

test('returns deterministic finite issue measurements and crop bounds without changing inputs', () => {
  const observations = { elements: [box('a', -100, -100), text('label', -90, -45, 80, 20, { containerId: 'a' })] };
  const before = structuredClone(observations);
  const result = inspectComposition(observations);
  assert.deepEqual(inspectComposition(observations), result);
  assert.deepEqual(observations, before);
  assert.equal(result.issues[0].key, 'text-overflow:label:a');
  assert.ok(Object.values(result.issues[0].bounds).every(Number.isFinite));
  assert.equal(result.counts.error, 1);
  assert.equal(result.counts.warning, 0);
});
