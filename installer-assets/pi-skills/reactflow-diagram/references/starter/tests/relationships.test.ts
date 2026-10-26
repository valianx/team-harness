import { test } from 'node:test';
import assert from 'node:assert/strict';
import ELK from 'elkjs/lib/elk.bundled.js';
import { layout } from '../src/layout';
import { routeCompact } from '../src/compact-routing';
import { checkGeometry } from '../src/geometry';
import { contentBounds, routeReadability } from '../src/composition';
import { relationships, relationshipMeasurements, placed } from './fixtures/relationships';
import type { Architecture, Geometry } from '../src/types';

function endpoints(model: Architecture, geometry: Geometry) {
  const ids = new Set<string>(), slots = new Set<string>();
  for (const relation of model.edges) {
    const route = geometry.edges.find(edge => edge.id === relation.id)!;
    assert.ok(route, `missing ${relation.id}`);
    for (const [role, nodeId, point] of [['source', relation.from, route.sourcePort], ['target', relation.to, route.targetPort]] as const) {
      assert.equal(point.id, `${relation.id}:${role}`);
      assert.equal(point.nodeId, nodeId);
      assert.ok(['left', 'right', 'top', 'bottom'].includes(point.side));
      assert.ok(Number.isInteger(point.slot) && point.slot >= 0);
      assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
      assert.equal(ids.has(point.id), false); ids.add(point.id);
      const slot = `${nodeId}:${point.side}:${point.slot}`;
      assert.equal(slots.has(slot), false, `aliased ${slot}`); slots.add(slot);
    }
    assert.deepEqual(route.sections[0].points[0], { x: route.sourcePort.x, y: route.sourcePort.y });
    assert.deepEqual(route.sections.at(-1)!.points.at(-1), { x: route.targetPort.x, y: route.targetPort.y });
  }
  assert.deepEqual(checkGeometry(model, geometry), []);
}

function positions(geometry: Geometry) {
  return { nodes: geometry.nodes, edges: geometry.edges, bounds: geometry.bounds };
}

for (const mode of ['layered', 'compact'] as const) for (const direction of ['right', 'down'] as const) {
  test(`${mode} ${direction} retains a self-loop beyond the measured card union`, async () => {
    const model = relationships('reciprocal', direction);
    model.nodes = model.nodes.slice(0, 1);
    model.edges = [{ ...model.edges[0], to: 'actor' }];
    const geometry = await layout(model, relationshipMeasurements(model), { composition: mode });
    endpoints(model, geometry);
    const bounds = contentBounds(geometry), node = geometry.nodes[0];
    assert.ok(bounds.x < node.absX || bounds.y < node.absY || bounds.x + bounds.width > node.absX + node.width || bounds.y + bounds.height > node.absY + node.height);
    assert.ok(routeReadability(geometry).routeDetour > 0);
  });

  test(`${mode} ${direction} keeps reciprocal identities, attached slots and distinct lanes`, async () => {
    const model = relationships('reciprocal', direction);
    const geometry = await layout(model, relationshipMeasurements(model), { composition: mode });
    endpoints(model, geometry);
    assert.equal(geometry.composition?.selected, mode);
    const metric = routeReadability(geometry);
    assert.equal(metric.overlaps, 0, 'reciprocal edges share a visible segment');
    assert.equal(metric.crossings, 0);
  });

  test(`${mode} ${direction} keeps repeated calls and fan-in slots stable under input permutation`, async () => {
    const model = relationships('fan-in', direction), sizes = relationshipMeasurements(model);
    const geometry = await layout(model, sizes, { composition: mode });
    endpoints(model, geometry);
    const reordered = { ...model, nodes: [...model.nodes].reverse(), edges: [...model.edges].reverse() };
    assert.deepEqual(positions(await layout(reordered, sizes, { composition: mode })), positions(geometry));
  });
}

test('facing sides avoid a whole-flow detour when the target is behind the primary direction', () => {
  const model = relationships(); model.edges = model.edges.slice(0, 1);
  const geometry = routeCompact(model, [placed('actor', 700, 200), placed('service', 100, 200)], relationshipMeasurements(model));
  endpoints(model, geometry);
  const route = geometry.edges[0];
  assert.equal(route.sourcePort.side, 'left');
  assert.equal(route.targetPort.side, 'right');
  const points = route.sections.flatMap(section => section.points);
  const length = points.slice(1).reduce((sum, point, index) => sum + Math.abs(point.x - points[index].x) + Math.abs(point.y - points[index].y), 0);
  assert.ok(length <= 400, `${length} exceeds the hand-checked 376-unit gap`);
});

test('an unavoidable obstacle retains the edge and records the affected detour', () => {
  const model = relationships(); model.edges = model.edges.slice(0, 1); model.edges[0].label = undefined;
  model.nodes.push({ ...model.nodes[0], id: 'obstacle', label: 'obstacle' });
  const geometry = routeCompact(model, [placed('actor', 100, 200), placed('service', 800, 200), placed('obstacle', 450, 170)], relationshipMeasurements(model));
  endpoints(model, geometry);
  const metric = routeReadability(geometry);
  assert.ok(metric.routeLength > 460);
  assert.ok(metric.routeDetour > 0);
  assert.equal(metric.routes[0].id, 'request');
  assert.ok(metric.routes[0].detour > 0);
});

test('geometry rejects endpoint aliasing, wrong identity, detached sides and nonfinite coordinates', async () => {
  const model = relationships('fan-in'), sizes = relationshipMeasurements(model);
  const original = await layout(model, sizes, { composition: 'compact' });
  const mutations: [string, (geometry: Geometry) => void][] = [
    ['endpoint-identity', value => { value.edges[1].sourcePort.id = value.edges[0].sourcePort.id; }],
    ['endpoint-slot', value => {
      const routes = value.edges.filter(route => model.edges.find(edge => edge.id === route.id)!.from === 'actor');
      routes[1].sourcePort = { ...routes[0].sourcePort, id: routes[1].sourcePort.id };
      routes[1].sections[0].points[0] = { x: routes[1].sourcePort.x, y: routes[1].sourcePort.y };
    }],
    ['port', value => { value.edges[0].sourcePort.side = 'top'; }],
    ['port', value => { value.edges[0].sourcePort.x = Infinity; }],
  ];
  for (const [check, mutate] of mutations) {
    const geometry = structuredClone(original); mutate(geometry);
    assert.ok(checkGeometry(model, geometry).some(diagnostic => diagnostic.check === check && diagnostic.ids.some(id => model.edges.some(edge => edge.id === id))), check);
  }
});

test('a missing endpoint reports its relationship instead of crashing the geometry check', async () => {
  const model = relationships(), geometry = await layout(model, relationshipMeasurements(model), { composition: 'compact' });
  delete (geometry.edges[0] as Partial<typeof geometry.edges[number]>).sourcePort;
  assert.ok(checkGeometry(model, geometry).some(diagnostic => diagnostic.check === 'endpoint-identity' && diagnostic.ids.includes(geometry.edges[0].id)));
});

test('explicit composition performs only the requested engine work', async context => {
  const model = relationships(), sizes = relationshipMeasurements(model), actual = ELK.prototype.layout;
  let calls = 0;
  context.mock.method(ELK.prototype, 'layout', function(this: ELK, ...args: Parameters<typeof actual>) { calls++; return actual.apply(this, args); });
  const compact = await layout(model, sizes, { composition: 'compact' });
  assert.equal(calls, 0, 'compact invoked ELK');
  assert.ok(compact.composition!.candidates.every(candidate => candidate.mode === 'compact'));
  const layered = await layout(model, sizes, { composition: 'layered' });
  assert.equal(calls, 1);
  assert.deepEqual(layered.composition!.candidates.map(candidate => candidate.mode), ['layered']);
  assert.equal(layered.composition!.execution.work.compactPlacements, 0);
});

test('automatic exploration reaches the finite side budget, keeps topology and records actual work and time', async () => {
  const model = relationships(), geometry = await layout(model, relationshipMeasurements(model));
  endpoints(model, geometry);
  const evidence = geometry.composition!, execution = evidence.execution;
  assert.ok(evidence.candidates.length <= 3);
  assert.equal(execution.work.layeredCalls, 1);
  assert.ok(execution.work.compactPlacements <= 2);
  assert.ok(execution.work.endpointCandidates > 0);
  assert.ok(execution.work.endpointCandidates <= model.edges.length * evidence.candidates.length * 8);
  assert.ok(evidence.candidates.some(candidate => candidate.work.endpointCandidates === model.edges.length * 8));
  assert.ok(execution.work.searches <= execution.work.endpointCandidates * 25);
  assert.ok(execution.work.corridorCandidates >= 0 && execution.work.corridorCandidates <= execution.work.searches * 48);
  assert.ok(execution.work.expandedStates <= execution.work.searches * 60000);
  assert.ok(execution.work.maxGridStates <= 120000);
  assert.ok(Number.isFinite(execution.elapsedMs) && execution.elapsedMs >= 0);
  assert.ok(evidence.candidates.every(candidate => Number.isFinite(candidate.elapsedMs) && candidate.elapsedMs >= 0));
});

test('automatic comparison reuses identical compact geometry and reports the work it actually performed', async () => {
  const model = relationships(), geometry = await layout(model, relationshipMeasurements(model));
  const evidence = geometry.composition!, duplicate = evidence.candidates.find(candidate => candidate.id === 'compact-wide')!;
  assert.equal(duplicate.duplicateOf, 'compact-balanced');
  assert.equal(duplicate.work.compactPlacements, 1);
  assert.equal(duplicate.work.endpointCandidates, 0);
  assert.equal(duplicate.work.searches, 0);
  assert.equal(evidence.execution.work.compactPlacements, 2);
  assert.equal(evidence.execution.work.endpointCandidates, 32);
  endpoints(model, geometry);
});

test('a large obstacle fixture retains complete topology within declared search budgets', () => {
  const model = relationships(); model.edges = model.edges.slice(0, 1); model.edges[0].label = undefined;
  const nodes = [placed('actor', 100, 200), placed('service', 800, 200), placed('obstacle', 450, 170)];
  model.nodes.push({ ...model.nodes[0], id: 'obstacle', label: 'obstacle' });
  for (let index = 0; index < 260; index++) {
    const id = `spectator-${index}`;
    model.nodes.push({ ...model.nodes[0], id, label: id });
    nodes.push(placed(id, 2000 + index * 300, 2000 + index * 200));
  }
  const geometry = routeCompact(model, nodes, relationshipMeasurements(model));
  assert.equal(geometry.edges.length, 1);
  assert.equal(geometry.nodes.length, 263);
  assert.ok(geometry.routing!.work.maxGridStates <= 120000);
  assert.ok(geometry.routing!.work.searches <= 8 * 25);
  assert.equal(geometry.routing!.work.endpointCandidates, 8);
  assert.ok(geometry.routing!.work.corridorCandidates > 0);
  assert.deepEqual(checkGeometry(model, geometry), []);
});
