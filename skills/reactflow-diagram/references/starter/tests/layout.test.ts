import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseModel } from '../src/model';
import { layout } from '../src/layout';
import { checkGeometry } from '../src/geometry';
import { FIXTURES } from '../src/fixtures';
import type { Architecture, Measurements } from '../src/types';

export function measurements(model: Architecture): Measurements {
  return {
    nodes: Object.fromEntries(model.nodes.map(n => [n.id, { width: 256, height: 100 }])),
    headers: Object.fromEntries(model.groups.map(g => [g.id, { width: 256, height: 32 }])),
    labels: Object.fromEntries(model.edges.filter(e => e.label).map(e => [e.id, { width: 110, height: 28 }])),
  };
}

for (const name of ['sample', 'cycle', 'disconnected', 'dense']) for (const direction of ['right', 'down'] as const) {
  test(`real ELK lays out ${name} ${direction} with complete routes and containment`, async () => {
    const model = parseModel({ ...structuredClone(FIXTURES[name] as object), views: [], direction });
    const geometry = await layout(model, measurements(model));
    assert.equal(geometry.nodes.length, model.nodes.length + model.groups.length);
    assert.equal(geometry.edges.length, model.edges.length);
    for (const edge of geometry.edges) {
      assert.ok(edge.sections.length > 0, edge.id);
      assert.ok(edge.sections.every(section => section.points.length >= 2));
      assert.ok(Number.isFinite(edge.sourcePort.x));
    }
    assert.deepEqual(checkGeometry(model, geometry), []);
    assert.deepEqual(await layout(model, measurements(model)), geometry);
  });
}

test('empty groups retain their header and inset minimum bounds', async () => {
  const model = parseModel({ ...(FIXTURES.sample as object), nodes: [], edges: [], steps: [], views: [] });
  const geometry = await layout(model, measurements(model));
  assert.equal(geometry.nodes.length, 2);
  assert.deepEqual(checkGeometry(model, geometry), []);
});

test('missing or nonfinite measurements fail before layout', async () => {
  const model = parseModel(FIXTURES.sample);
  await assert.rejects(layout(model, { nodes: {}, headers: {}, labels: {} }), /measurement/);
});

test('removing and restoring descendants recalculates the same nested group bounds', async () => {
  const model = parseModel({ ...(FIXTURES.sample as object), views: [], steps: [] });
  const before = await layout(model, measurements(model));
  const withoutChild = parseModel({ ...model, nodes: model.nodes.filter(node => node.id !== 'orchestrator'),
    edges: model.edges.filter(edge => edge.from !== 'orchestrator' && edge.to !== 'orchestrator') });
  const empty = await layout(withoutChild, measurements(withoutChild));
  const group = (value: typeof before) => value.nodes.find(node => node.id === 'processing')!;
  assert.equal(group(empty).id, group(before).id);
  assert.ok(group(empty).height < group(before).height);
  assert.deepEqual(checkGeometry(withoutChild, empty), []);
  assert.deepEqual(await layout(model, measurements(model)), before);
});
