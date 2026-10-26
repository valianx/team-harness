import { test } from 'node:test';
import assert from 'node:assert/strict';
import ELK from 'elkjs/lib/elk.bundled.js';
import { layout } from '../src/layout';
import { checkGeometry, segmentIntersects } from '../src/geometry';
import { parseModel } from '../src/model';
import { FIXTURES } from '../src/fixtures';
import { contentBounds, routeReadability } from '../src/composition';
import type { Architecture, Geometry } from '../src/types';
import { compound, measured } from './fixtures/compound';
import { withoutTiming } from './fixtures/timing';
import { relationships, relationshipMeasurements } from './fixtures/relationships';
import { samplePresentationMeasurements } from './fixtures/presentation';

function fit(geometry: Geometry) {
  return Math.min(1152 / geometry.bounds.width, 540 / geometry.bounds.height);
}

function complete(model: Architecture, geometry: Geometry) {
  assert.deepEqual(checkGeometry(model, geometry), []);
  assert.deepEqual(geometry.nodes.map(node => node.id).sort(), [...model.nodes, ...model.groups].map(node => node.id).sort());
  assert.deepEqual(geometry.edges.map(edge => edge.id).sort(), model.edges.map(edge => edge.id).sort());
  for (const edge of model.edges) {
    const route = geometry.edges.find(value => value.id === edge.id)!;
    assert.equal(route.label?.text, edge.label);
    for (const other of geometry.edges.filter(value => value.id !== edge.id)) {
      for (const section of other.sections) for (let i = 1; i < section.points.length; i++) {
        assert.equal(segmentIntersects(section.points[i - 1], section.points[i], route.label!), false, `${other.id} obscures ${edge.id}`);
      }
    }
  }
}

test('auto replaces a compound ribbon with a complete measured composition at a materially larger fit', async () => {
  const model = compound(), original = structuredClone(model), measurements = measured(model);
  const layered = await layout(model, measurements, { composition: 'layered' });
  const automatic = await layout(model, measurements);
  assert.ok(fit(automatic) >= 1.8 * fit(layered), `auto ${JSON.stringify(automatic.bounds)}; layered ${JSON.stringify(layered.bounds)}`);
  complete(model, automatic);
  assert.equal(automatic.composition?.selected, 'compact');
  assert.ok(automatic.composition!.candidates.length >= 2 && automatic.composition!.candidates.length <= 4);
  assert.equal(automatic.composition!.candidates.find(candidate => candidate.id === automatic.composition!.candidate)?.valid, true);
  assert.deepEqual(model, original);
});

for (const direction of ['right', 'down'] as const) {
  test(`compact ${direction} retains measured bounds and separate endpoint reservations for every relationship`, async () => {
    const model = compound(direction), measurements = measured(model);
    const geometry = await layout(model, measurements, { composition: 'compact' });
    assert.equal(geometry.composition?.selected, 'compact');
    complete(model, geometry);
    for (const node of model.nodes) {
      const placed = geometry.nodes.find(value => value.id === node.id)!;
      assert.equal(placed.width, measurements.nodes[node.id].width);
      assert.equal(placed.height, measurements.nodes[node.id].height);
      const sources = model.edges.filter(edge => edge.from === node.id).map(edge => geometry.edges.find(route => route.id === edge.id)!.sourcePort);
      const targets = model.edges.filter(edge => edge.to === node.id).map(edge => geometry.edges.find(route => route.id === edge.id)!.targetPort);
      const ports = [...sources, ...targets];
      assert.equal(new Set(ports.map(point => point.id)).size, ports.length);
      assert.equal(new Set(ports.map(point => `${point.side}:${point.slot}`)).size, ports.length);
    }
    const candidate = geometry.composition!.candidates.find(value => value.id === geometry.composition!.candidate)!;
    assert.equal(candidate.labelObstructions, 0);
    assert.ok(candidate.crossings < 40, `${candidate.crossings} route crossings`);
  });
}

test('composition is deterministic under input ordering and repeated layout', async () => {
  const model = compound(), measurements = measured(model);
  const geometry = await layout(model, measurements, { composition: 'compact' });
  const reordered = { ...model, nodes: [...model.nodes].reverse(), groups: [...model.groups].reverse(), edges: [...model.edges].reverse() };
  assert.deepEqual(withoutTiming(await layout(model, measurements, { composition: 'compact' })), withoutTiming(geometry));
  assert.deepEqual(withoutTiming(await layout(reordered, measurements, { composition: 'compact' })), withoutTiming(geometry));
});

test('compact packing respects nested and empty boundaries with variable measured cards', async () => {
  const model = parseModel(FIXTURES.nested);
  model.nodes.find(node => node.id === 'orchestrator')!.parent = 'reserved';
  const measurements = measured(model);
  measurements.nodes.orchestrator.height = 214;
  const geometry = await layout(model, measurements, { composition: 'compact' });
  assert.equal(geometry.composition?.selected, 'compact');
  complete(model, geometry);
  assert.equal(geometry.nodes.find(node => node.id === 'orchestrator')!.height, 214);
});

test('a short flow that meets fitted text targets keeps the layered choice and reports alternatives', async () => {
  const model = relationships(), sizes = relationshipMeasurements(model);
  const geometry = await layout(model, sizes);
  assert.deepEqual(checkGeometry(model, geometry), []);
  const layered = geometry.composition!.candidates.find(candidate => candidate.mode === 'layered')!;
  assert.ok(layered.fittedNodeFont >= 14 && layered.fittedLabelFont >= 11);
  assert.equal(geometry.composition?.selected, 'layered');
  assert.ok(geometry.composition!.candidates.some(candidate => candidate.mode === 'compact'));
});

test('auto selects readable compact text for a small measured flow below the old ribbon gain threshold', async () => {
  const model = parseModel(FIXTURES.sample), original = structuredClone(model), sizes = samplePresentationMeasurements();
  const geometry = await layout(model, sizes), evidence = geometry.composition!;
  const layered = evidence.candidates.find(candidate => candidate.mode === 'layered')!;
  const compact = evidence.candidates.find(candidate => candidate.mode === 'compact')!;
  assert.ok(layered.valid && compact.valid);
  assert.ok(layered.fittedNodeFont < 14 && layered.fittedLabelFont < 11);
  assert.ok(compact.fittedNodeFont >= 14 && compact.fittedLabelFont >= 11);
  assert.ok(compact.fitScale / layered.fitScale > 1.15 && compact.fitScale / layered.fitScale < 1.5);
  assert.equal(evidence.selected, 'compact');
  const selected = evidence.candidates.find(candidate => candidate.id === evidence.candidate)!;
  assert.ok(selected.fittedNodeFont >= 14 && selected.fittedLabelFont >= 11);
  complete(model, geometry);
  assert.deepEqual(model, original);
  const reordered = { ...model, nodes: [...model.nodes].reverse(), groups: [...model.groups].reverse(), edges: [...model.edges].reverse() };
  assert.deepEqual(withoutTiming(await layout(reordered, sizes)), withoutTiming(geometry));
});

test('auto compacts a few-node ribbon instead of assuming small graphs are readable', async () => {
  const model = compound();
  model.groups = [];
  model.nodes = model.nodes.slice(0, 5).map(({ parent: _parent, ...node }) => node);
  model.edges = model.nodes.slice(1).map((node, i) => ({ ...model.edges[0], id: `flow-${i}`, from: model.nodes[i].id, to: node.id, label: `Flow ${i}` }));
  const sizes = measured(model), layered = await layout(model, sizes, { composition: 'layered' });
  const geometry = await layout(model, sizes);
  assert.equal(geometry.composition?.selected, 'compact');
  assert.ok(fit(geometry) >= fit(layered) * 1.5);
  complete(model, geometry);
});

test('requested compact succeeds without evaluating an unavailable layered engine', async context => {
  const model = compound();
  context.mock.method(ELK.prototype, 'layout', async () => { throw new Error('Layered engine failed'); });
  const geometry = await layout(model, measured(model), { composition: 'compact' });
  assert.equal(geometry.composition?.selected, 'compact');
  complete(model, geometry);
  assert.equal(geometry.composition!.candidates.some(candidate => candidate.mode === 'layered'), false);
  assert.equal(geometry.composition!.execution.work.layeredCalls, 0);
});

test('compact recovery never turns missing measured labels into engine failure evidence', async () => {
  const model = compound(), sizes = measured(model);
  delete sizes.labels['link-01'];
  await assert.rejects(layout(model, sizes, { composition: 'compact' }), /Missing or invalid measurement: link-01/);
});

test('content bounds include route detours and labels while excluding unused engine padding', () => {
  const geometry: Geometry = {
    nodes: [{ id: 'a', kind: 'service', x: 100, y: 100, absX: 100, absY: 100, width: 100, height: 100, headerHeight: 0 }],
    edges: [{ id: 'route', sourcePort: { id: 'route:source', nodeId: 'a', side: 'right', slot: 0, x: 200, y: 150 }, targetPort: { id: 'route:target', nodeId: 'b', side: 'left', slot: 0, x: 500, y: 150 },
      sections: [{ points: [{ x: 200, y: 150 }, { x: 500, y: 150 }] }], label: { x: 700, y: 80, width: 80, height: 24, text: 'Outside the node frame' } }],
    bounds: { width: 2000, height: 1000 },
  };
  assert.deepEqual(contentBounds(geometry), { x: 100, y: 80, width: 680, height: 120 });
});

test('route metrics distinguish a proper crossing from a route obscuring an unrelated label', () => {
  const geometry: Geometry = { nodes: [], bounds: { width: 100, height: 100 }, edges: [
    { id: 'horizontal', sourcePort: { id: 'horizontal:source', nodeId: 'a', side: 'right', slot: 0, x: 0, y: 50 }, targetPort: { id: 'horizontal:target', nodeId: 'b', side: 'left', slot: 0, x: 100, y: 50 }, sections: [{ points: [{ x: 0, y: 50 }, { x: 100, y: 50 }] }], label: { x: 40, y: 20, width: 20, height: 10, text: 'Label' } },
    { id: 'vertical', sourcePort: { id: 'vertical:source', nodeId: 'c', side: 'bottom', slot: 0, x: 50, y: 0 }, targetPort: { id: 'vertical:target', nodeId: 'd', side: 'top', slot: 0, x: 50, y: 100 }, sections: [{ points: [{ x: 50, y: 0 }, { x: 50, y: 100 }] }] },
  ] };
  assert.deepEqual(routeReadability(geometry), { crossings: 1, overlaps: 0, labelObstructions: 1, bends: 0,
    routeLength: 200, routeDetour: 0, maxDetourRatio: 1,
    routes: [
      { id: 'horizontal', length: 100, directLength: 100, detour: 0, detourRatio: 1, bends: 0, crossingIds: ['vertical'], sharedSegmentIds: [], obstructedLabelIds: [] },
      { id: 'vertical', length: 100, directLength: 100, detour: 0, detourRatio: 1, bends: 0, crossingIds: ['horizontal'], sharedSegmentIds: [], obstructedLabelIds: ['horizontal'] },
    ] });
});
