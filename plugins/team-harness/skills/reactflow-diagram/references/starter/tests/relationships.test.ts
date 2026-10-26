import { test } from 'node:test';
import assert from 'node:assert/strict';
import ELK from 'elkjs/lib/elk.bundled.js';
import { layout } from '../src/layout';
import { routeCompact } from '../src/compact-routing';
import { checkGeometry, segmentIntersects } from '../src/geometry';
import { contentBounds, routeReadability } from '../src/composition';
import { relationships, relationshipMeasurements, placed } from './fixtures/relationships';
import type { Architecture, Geometry, Route } from '../src/types';
import { flowFixture, flowMeasurements, laneFixture, laneMeasurements, supportLaneFixture, supportLaneMeasurements } from './fixtures/flow';
import { flowNodes, assessFlow } from '../src/flow-composition';
import { endpointAllocator, endpointStub } from '../src/endpoints';
import { TOKENS as T } from '../src/tokens';
import { withoutTiming } from './fixtures/timing';

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

function separateSupport(model: Architecture, geometry: Geometry) {
  const calls = geometry.edges.filter(route => model.edges.some(edge => edge.id === route.id && edge.interaction === 'call'));
  const segments = (route: Route) => route.sections.flatMap(section => section.points.slice(1).map((b, index) => ({ a: section.points[index], b })));
  for (const [index, first] of calls.entries()) for (const second of calls.slice(index + 1)) {
    for (const a of segments(first)) for (const b of segments(second)) {
      const horizontal = a.a.y === a.b.y;
      if (horizontal !== (b.a.y === b.b.y)) continue;
      const axis = horizontal ? 'x' : 'y', normal = horizontal ? 'y' : 'x';
      const shared = Math.min(Math.max(a.a[axis], a.b[axis]), Math.max(b.a[axis], b.b[axis])) - Math.max(Math.min(a.a[axis], a.b[axis]), Math.min(b.a[axis], b.b[axis]));
      if (shared > T.tolerance) assert.ok(Math.abs(a.a[normal] - b.a[normal]) >= 2 * T.edgeClearance - T.tolerance,
        `${first.id}/${second.id} merge for ${shared} units`);
    }
  }
}

for (const supportSide of ['above', 'below'] as const) for (const enlarged of [false, true]) {
  test(`repeated support calls retain distinct ${supportSide} lanes with ${enlarged ? 'enlarged nested' : 'small'} measured content`, async () => {
    const model = supportLaneFixture(supportSide, enlarged), original = structuredClone(model), sizes = supportLaneMeasurements(model, enlarged);
    const geometry = await layout(model, sizes, { composition: 'compact' });
    endpoints(model, geometry); separateSupport(model, geometry);
    assert.equal(assessFlow(model, geometry)?.status, 'satisfied');
    for (const route of geometry.edges.filter(edge => edge.id.startsWith('check-'))) {
      const source = geometry.nodes.find(node => node.id === route.sourcePort.nodeId)!;
      const boundary = supportSide === 'above' ? source.absY : source.absY + source.height;
      assert.ok(route.sections.flatMap(section => section.points).every(point => supportSide === 'above' ? point.y <= boundary + T.tolerance : point.y >= boundary - T.tolerance));
      assert.ok(supportSide === 'above' ? route.label!.y + route.label!.height <= boundary + T.tolerance : route.label!.y >= boundary - T.tolerance);
      assert.equal(route.label!.width, sizes.labels[route.id].width); assert.equal(route.label!.height, sizes.labels[route.id].height);
    }
    assert.equal(geometry.nodes.find(node => node.id === 'worker')!.parent, enlarged ? 'inner-area' : 'worker-area');
    assert.deepEqual(model, original);
    const reordered = { ...model, nodes: [...model.nodes].reverse(), groups: [...model.groups].reverse(), edges: [...model.edges].reverse() };
    assert.deepEqual(withoutTiming(await layout(reordered, sizes, { composition: 'compact' })), withoutTiming(geometry));
    const work = geometry.composition!.execution.work;
    assert.equal(geometry.composition!.candidates.length, 1);
    assert.ok(work.endpointCandidates <= model.edges.length * 8);
    assert.ok(work.searches <= work.endpointCandidates * 25);
    assert.ok(work.corridorCandidates <= work.searches * 48);
    assert.ok(work.maxGridStates <= 120000);
  });
}

function crossingSupportGeometry() {
  const model = supportLaneFixture(); model.groups = []; model.nodes.forEach(node => { delete node.parent; });
  model.edges = model.edges.filter(edge => edge.id !== 'check-three');
  const endpoint = (id: string, nodeId: string, side: 'top' | 'bottom' | 'left' | 'right', slot: number, x: number, y: number) => ({ id, nodeId, side, slot, x, y });
  const geometry: Geometry = { nodes: [placed('sender', 80, 400), placed('worker', 500, 400), placed('helper', 290, 100)], bounds: { width: 800, height: 550 }, edges: [
    { id: 'execute', sourcePort: endpoint('execute:source', 'sender', 'right', 0, 312, 450), targetPort: endpoint('execute:target', 'worker', 'left', 0, 492, 450), sections: [{ points: [{ x: 312, y: 450 }, { x: 492, y: 450 }] }], label: { x: 360, y: 438, width: 72, height: 24, text: 'Execute' } },
    { id: 'check-one', sourcePort: endpoint('check-one:source', 'worker', 'top', 0, 550, 392), targetPort: endpoint('check-one:target', 'helper', 'bottom', 0, 450, 208), sections: [{ points: [{ x: 550, y: 392 }, { x: 550, y: 368 }, { x: 250, y: 368 }, { x: 250, y: 240 }, { x: 450, y: 240 }, { x: 450, y: 208 }] }], label: { x: 214, y: 288, width: 72, height: 24, text: 'Check one' } },
    { id: 'check-two', sourcePort: endpoint('check-two:source', 'worker', 'top', 1, 660, 392), targetPort: endpoint('check-two:target', 'helper', 'bottom', 1, 350, 208), sections: [{ points: [{ x: 660, y: 392 }, { x: 660, y: 336 }, { x: 600, y: 336 }, { x: 600, y: 224 }, { x: 350, y: 224 }, { x: 350, y: 208 }] }], label: { x: 564, y: 278, width: 72, height: 24, text: 'Check two' } },
  ] };
  return { model, geometry };
}

test('declared support lanes permit isolated perpendicular crossings', () => {
  const { model, geometry } = crossingSupportGeometry();
  endpoints(model, geometry); separateSupport(model, geometry);
  assert.ok(routeReadability(geometry).crossings > 0);
  assert.equal(assessFlow(model, geometry)?.status, 'satisfied');
});

for (const separation of [0, T.edgeClearance]) test(`mechanically valid support corridors ${separation} units apart remain explicit unsatisfied intent`, () => {
  const { model, geometry } = crossingSupportGeometry(), route = geometry.edges.find(edge => edge.id === 'check-two')!;
  route.sections[0].points.forEach(point => { if (point.y === 224) point.y = 240 + separation; });
  endpoints(model, geometry);
  assert.ok(assessFlow(model, geometry)?.diagnostics.some(value => value.check === 'flow-support-lanes' && value.ids.includes('check-one') && value.ids.includes('check-two')));
  model.edges.find(edge => edge.id === 'check-two')!.interaction = 'persistence';
  assert.equal(assessFlow(model, geometry)?.status, 'satisfied', 'unrelated shared relationships are not support-lane policy');
});

test('infeasible support approach room retains complete geometry with explicit unsatisfied intent', () => {
  const model = supportLaneFixture(), sizes = supportLaneMeasurements(model), nodes = flowNodes(model, sizes);
  for (const node of nodes.filter(node => node.parent === 'worker-area')) { node.absY -= 4 * T.edgeClearance; node.y -= 4 * T.edgeClearance; }
  nodes.find(node => node.id === 'worker-area')!.height -= 4 * T.edgeClearance;
  const geometry = routeCompact(model, nodes, sizes);
  endpoints(model, geometry);
  const flow = assessFlow(model, geometry)!;
  assert.equal(flow.status, 'unsatisfied');
  assert.ok(flow.diagnostics.some(value => value.check === 'flow-support-route' || value.check === 'flow-support-lanes'));
  assert.ok(geometry.routing!.work.endpointCandidates <= model.edges.length * 8);
});

test('a measured primary label fits its own lateral corridor without hypothetical endpoint blockers', async () => {
  const model = laneFixture(); model.nodes = model.nodes.slice(0, 2); model.edges = model.edges.filter(edge => edge.id === 'start'); model.flow!.primary = ['start'];
  const sizes = laneMeasurements(model), geometry = await layout(model, sizes, { composition: 'compact' });
  endpoints(model, geometry);
  const route = geometry.edges[0], source = geometry.nodes.find(node => node.id === 'origin')!, target = geometry.nodes.find(node => node.id === 'relay')!;
  assert.equal(route.sourcePort.side, 'right'); assert.equal(route.targetPort.side, 'left');
  const points = route.sections.flatMap(section => section.points);
  assert.ok(points.every(point => Math.abs(point.y - route.sourcePort.y) <= T.tolerance), JSON.stringify(points));
  assert.ok(route.label!.x >= source.absX + source.width + T.edgeClearance);
  assert.ok(route.label!.x + route.label!.width <= target.absX - T.edgeClearance);
  assert.equal(route.label!.width, 168);
});

for (const supportSide of ['above', 'below'] as const) {
  test(`declared ${supportSide} flow routes the primary corridor first with lower returns and support-facing calls`, async () => {
    const model = laneFixture(supportSide), sizes = laneMeasurements(model), geometry = await layout(model, sizes, { composition: 'compact' });
    endpoints(model, geometry); separateSupport(model, geometry);
    assert.deepEqual(geometry.routing!.alternatives.slice(0, 2).map(value => value.id), ['start', 'finish']);
    for (const id of model.flow!.primary) {
      const route = geometry.edges.find(edge => edge.id === id)!, points = route.sections.flatMap(section => section.points);
      assert.equal(route.sourcePort.side, 'right'); assert.equal(route.targetPort.side, 'left');
      assert.ok(points.every(point => point.y >= Math.min(route.sourcePort.y, route.targetPort.y) - T.tolerance && point.y <= Math.max(route.sourcePort.y, route.targetPort.y) + T.tolerance));
      assert.ok(points.slice(1).every((point, index) => point.x >= points[index].x - T.tolerance));
    }
    const primaryBottom = Math.max(...geometry.nodes.filter(node => ['origin', 'relay', 'sink'].includes(node.id)).map(node => node.absY + node.height));
    const returnLanes = ['reply-first', 'reply-last'].map(id => {
      const route = geometry.edges.find(edge => edge.id === id)!;
      assert.equal(route.sourcePort.side, 'bottom'); assert.equal(route.targetPort.side, 'bottom');
      const points = route.sections.flatMap(section => section.points), horizontal = points.slice(1).map((b, index) => ({ a: points[index], b })).filter(value => value.a.y === value.b.y && value.a.x > value.b.x);
      assert.ok(horizontal.length);
      assert.ok(horizontal.every(value => value.a.y > primaryBottom));
      return horizontal.reduce((best, value) => best.a.x - best.b.x >= value.a.x - value.b.x ? best : value).a.y;
    });
    assert.ok(Math.abs(returnLanes[0] - returnLanes[1]) >= T.edgeClearance * 2);
    for (const id of ['support-first', 'support-last']) {
      const route = geometry.edges.find(edge => edge.id === id)!, source = geometry.nodes.find(node => node.id === route.sourcePort.nodeId)!;
      assert.equal(route.sourcePort.side, supportSide === 'above' ? 'top' : 'bottom');
      assert.equal(route.targetPort.side, supportSide === 'above' ? 'bottom' : 'top');
      const points = route.sections.flatMap(section => section.points);
      assert.ok(points.every(point => supportSide === 'above' ? point.y <= source.absY : point.y >= source.absY + source.height));
    }
    assert.equal(assessFlow(model, geometry)?.status, 'satisfied');
    const reordered = { ...model, nodes: [...model.nodes].reverse(), edges: [...model.edges].reverse() };
    assert.deepEqual(positions(await layout(reordered, sizes, { composition: 'compact' })), positions(geometry));
    const work = geometry.composition!.execution.work;
    assert.ok(work.endpointCandidates <= model.edges.length * 8);
    assert.ok(work.searches <= work.endpointCandidates * 25);
    assert.ok(work.corridorCandidates <= work.searches * 48);
    assert.ok(work.maxGridStates <= 120000);
  });
}

test('declared preferred endpoint pairs remain among the same eight alternatives', () => {
  const model = laneFixture(), allocator = endpointAllocator(model, flowNodes(model, laneMeasurements(model)));
  for (const [id, source, target] of [['start', 'right', 'left'], ['reply-first', 'bottom', 'bottom'], ['support-first', 'top', 'bottom']] as const) {
    const pairs = allocator.alternatives(model.edges.find(edge => edge.id === id)!);
    assert.equal(pairs.length, 8);
    assert.equal(pairs[0].source.side, source); assert.equal(pairs[0].target.side, target);
  }
});

test('automatic declared-lane diagnostics and work remain stable under relationship permutation', async () => {
  const model = laneFixture(), sizes = laneMeasurements(model), geometry = await layout(model, sizes);
  const reordered = { ...model, nodes: [...model.nodes].reverse(), edges: [...model.edges].reverse() };
  assert.deepEqual(withoutTiming(await layout(reordered, sizes)), withoutTiming(geometry));
});

for (const supportSide of ['above', 'below'] as const) {
  test(`nested ${supportSide} policy approaches clear every reserved group header`, () => {
    const model = flowFixture(supportSide, true, true), nodes = flowNodes(model, flowMeasurements(model)), allocator = endpointAllocator(model, nodes);
    const byId = new Map(nodes.map(node => [node.id, node]));
    for (const edge of model.edges.filter(edge => allocator.policies.has(edge.id))) {
      const pair = allocator.alternatives(edge)[0];
      for (const endpoint of [pair.source, pair.target].filter(endpoint => endpoint.side === 'top')) {
        let parent = byId.get(endpoint.nodeId)!.parent;
        while (parent) {
          const group = byId.get(parent)!;
          assert.equal(segmentIntersects(endpoint, endpointStub(endpoint), { x: group.absX, y: group.absY, width: group.width, height: T.groupInset + group.headerHeight }, T.edgeClearance), false, `${edge.id} approach crosses ${parent}`);
          parent = group.parent;
        }
      }
    }
  });
}

test('a mechanically valid lower request loop cannot satisfy declared primary route intent', () => {
  const model = laneFixture(); model.nodes = model.nodes.slice(0, 2); model.edges = model.edges.filter(edge => edge.id === 'start'); model.flow!.primary = ['start'];
  const sizes = laneMeasurements(model), nodes = flowNodes(model, sizes), edge = model.edges[0];
  const pair = endpointAllocator(model, nodes).alternatives(edge).find(value => value.source.side === 'right' && value.target.side === 'left')!;
  const start = endpointStub(pair.source), end = endpointStub(pair.target), laneY = Math.max(...nodes.map(node => node.absY + node.height)) + T.layerGap;
  const geometry: Geometry = { nodes, edges: [{ id: edge.id, sourcePort: pair.source, targetPort: pair.target,
    sections: [{ points: [pair.source, start, { x: start.x, y: laneY }, { x: end.x, y: laneY }, end, pair.target].map(({ x, y }) => ({ x, y })) }],
    label: { x: (start.x + end.x - sizes.labels.start.width) / 2, y: laneY - sizes.labels.start.height / 2, ...sizes.labels.start, text: edge.label! } }],
    bounds: { width: Math.max(...nodes.map(node => node.absX + node.width)) + T.groupInset, height: laneY + sizes.labels.start.height + T.groupInset } };
  assert.deepEqual(checkGeometry(model, geometry), []);
  assert.ok(assessFlow(model, geometry)?.diagnostics.some(value => value.check === 'flow-primary-route' && value.ids.includes('start')));
});

test('an infeasible measured primary corridor retains complete fallback geometry and unsatisfied route intent', () => {
  const model = laneFixture(); model.nodes = model.nodes.slice(0, 2); model.edges = model.edges.filter(edge => edge.id === 'start'); model.flow!.primary = ['start'];
  const sizes = laneMeasurements(model), staleSizes = structuredClone(sizes); staleSizes.labels.start.width = 64;
  const geometry = routeCompact(model, flowNodes(model, staleSizes), sizes);
  endpoints(model, geometry);
  const flow = assessFlow(model, geometry)!;
  assert.equal(flow.status, 'unsatisfied');
  assert.ok(flow.diagnostics.some(value => value.check === 'flow-primary-route' && value.ids.includes('start')));
  assert.equal(geometry.edges[0].label!.width, 168);
});

test('mechanically valid synchronous returns sharing a lower lane remain unsatisfied intent', async () => {
  const model = laneFixture(), geometry = await layout(model, laneMeasurements(model), { composition: 'compact' });
  const axis = (id: string) => {
    const points = geometry.edges.find(edge => edge.id === id)!.sections.flatMap(section => section.points);
    return points.slice(1).map((b, index) => ({ a: points[index], b })).filter(segment => segment.a.y === segment.b.y && segment.a.x > segment.b.x).sort((a, b) => (b.a.x - b.b.x) - (a.a.x - a.b.x))[0].a.y;
  };
  const first = axis('reply-first'), last = axis('reply-last'), route = geometry.edges.find(edge => edge.id === 'reply-last')!;
  route.sections.forEach(section => section.points.forEach(point => { if (point.y === last) point.y = first; }));
  route.label!.y += first - last;
  assert.deepEqual(checkGeometry(model, geometry), []);
  assert.ok(assessFlow(model, geometry)?.diagnostics.some(value => value.check === 'flow-return-lanes'));
});

test('correct support endpoints cannot certify a mechanically valid call loop below the primary cards', async () => {
  const model = laneFixture(); model.edges = model.edges.filter(edge => ['start', 'finish', 'support-first'].includes(edge.id));
  const geometry = await layout(model, laneMeasurements(model), { composition: 'compact' }), route = geometry.edges.find(edge => edge.id === 'support-first')!;
  const start = endpointStub(route.sourcePort), end = endpointStub(route.targetPort), left = T.edgeClearance;
  const right = Math.max(...geometry.nodes.map(node => node.absX + node.width)) + T.siblingGap;
  const lower = Math.max(...geometry.nodes.map(node => node.absY + node.height)) + T.layerGap;
  route.sections = [{ points: [route.sourcePort, start, { x: left, y: start.y }, { x: left, y: lower }, { x: right, y: lower }, { x: right, y: end.y }, end, route.targetPort].map(({ x, y }) => ({ x, y })) }];
  route.label!.x = (left + right - route.label!.width) / 2; route.label!.y = lower - route.label!.height / 2;
  geometry.bounds.width = right + T.groupInset; geometry.bounds.height = lower + route.label!.height + T.groupInset;
  assert.equal(route.sourcePort.side, 'top'); assert.equal(route.targetPort.side, 'bottom');
  endpoints(model, geometry);
  assert.ok(assessFlow(model, geometry)?.diagnostics.some(value => value.check === 'flow-support-route' && value.ids.includes(route.id)));
});

test('correct return endpoints cannot certify a mechanically valid loop above the primary band', async () => {
  const model = laneFixture(); model.nodes = model.nodes.slice(0, 2); model.edges = model.edges.filter(edge => ['start', 'reply-first'].includes(edge.id)); model.flow!.primary = ['start'];
  const geometry = await layout(model, laneMeasurements(model), { composition: 'compact' }), route = geometry.edges.find(edge => edge.id === 'reply-first')!;
  const start = endpointStub(route.sourcePort), end = endpointStub(route.targetPort), left = T.edgeClearance, upper = T.edgeClearance;
  const right = Math.max(...geometry.nodes.map(node => node.absX + node.width)) + T.siblingGap;
  route.sections = [{ points: [route.sourcePort, start, { x: right, y: start.y }, { x: right, y: upper }, { x: left, y: upper }, { x: left, y: end.y }, end, route.targetPort].map(({ x, y }) => ({ x, y })) }];
  const source = geometry.nodes.find(node => node.id === 'origin')!, target = geometry.nodes.find(node => node.id === 'relay')!;
  route.label!.x = (source.absX + source.width + target.absX - route.label!.width) / 2; route.label!.y = upper + T.edgeClearance;
  geometry.bounds.width = right + T.groupInset;
  assert.equal(route.sourcePort.side, 'bottom'); assert.equal(route.targetPort.side, 'bottom');
  endpoints(model, geometry);
  assert.ok(assessFlow(model, geometry)?.diagnostics.some(value => value.check === 'flow-return-route' && value.ids.includes(route.id)));
});

for (const supportSide of ['above', 'below'] as const) {
  test(`declared ${supportSide} lanes preserve plausible approaches around a tall primary card`, async () => {
    const model = laneFixture(supportSide), sizes = laneMeasurements(model); sizes.nodes.relay.height = 600;
    const geometry = await layout(model, sizes, { composition: 'compact' });
    endpoints(model, geometry);
    assert.equal(geometry.nodes.find(node => node.id === 'relay')!.height, 600);
    assert.equal(assessFlow(model, geometry)?.status, 'satisfied');
  });
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

test('declared flow respects explicit engine isolation and preserves endpoint identity within the same work ceilings', async context => {
  const model = flowFixture('below'), sizes = flowMeasurements(model), actual = ELK.prototype.layout;
  let calls = 0;
  context.mock.method(ELK.prototype, 'layout', function(this: ELK, ...args: Parameters<typeof actual>) { calls++; return actual.apply(this, args); });
  const compact = await layout(model, sizes, { composition: 'compact' });
  endpoints(model, compact);
  assert.equal(calls, 0);
  assert.deepEqual(compact.composition!.candidates.map(candidate => candidate.id), ['compact-flow']);
  assert.equal(compact.composition!.execution.work.compactPlacements, 1);
  const layered = await layout(model, sizes, { composition: 'layered' });
  endpoints(model, layered);
  assert.equal(calls, 1);
  assert.deepEqual(layered.composition!.candidates.map(candidate => candidate.id), ['layered']);
  assert.equal(layered.composition!.execution.work.compactPlacements, 0);
  const automatic = await layout(model, sizes), evidence = automatic.composition!, work = evidence.execution.work;
  endpoints(model, automatic);
  assert.equal(evidence.candidates.length, 3);
  assert.equal(work.layeredCalls, 1);
  assert.equal(work.compactPlacements, 2);
  assert.ok(work.endpointCandidates <= model.edges.length * 3 * 8);
  assert.ok(work.searches <= work.endpointCandidates * 25);
  assert.ok(work.corridorCandidates <= work.searches * 48);
  assert.ok(work.expandedStates <= work.searches * 60000);
  assert.ok(work.maxGridStates <= 120000);
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
