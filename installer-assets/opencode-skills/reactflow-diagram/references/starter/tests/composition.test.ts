import { test } from 'node:test';
import assert from 'node:assert/strict';
import ELK from 'elkjs/lib/elk.bundled.js';
import { layout } from '../src/layout';
import { checkGeometry, segmentIntersects } from '../src/geometry';
import { parseModel } from '../src/model';
import { FIXTURES } from '../src/fixtures';
import { assessComposition, contentBounds, routeReadability } from '../src/composition';
import type { Architecture, Geometry } from '../src/types';
import { compound, measured } from './fixtures/compound';
import { withoutTiming } from './fixtures/timing';
import { relationships, relationshipMeasurements } from './fixtures/relationships';
import { samplePresentationMeasurements } from './fixtures/presentation';
import { flowFixture, flowMeasurements, flowPresentationMeasurements } from './fixtures/flow';
import { assessFlow, flowNodes } from '../src/flow-composition';

function fit(geometry: Geometry) {
  return Math.min(1152 / geometry.bounds.width, 648 / geometry.bounds.height);
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

for (const supportSide of ['above', 'below'] as const) {
  test(`declared flow keeps an unwrapped request spine and measured support ${supportSide}`, async () => {
    const model = flowFixture(supportSide), original = structuredClone(model);
    const geometry = await layout(model, flowMeasurements(model), { composition: 'compact' });
    complete(model, geometry);
    const primary = ['intake', 'router', 'journal'].map(id => geometry.nodes.find(node => node.id === id)!);
    for (let i = 1; i < primary.length; i++) {
      assert.ok(primary[i].absX > primary[i - 1].absX + primary[i - 1].width);
      assert.equal(primary[i].absY + primary[i].height / 2, primary[0].absY + primary[0].height / 2);
    }
    const support = geometry.nodes.find(node => node.id === 'helper-zone')!;
    if (supportSide === 'above') assert.ok(support.absY + support.height < Math.min(...primary.map(node => node.absY)));
    else assert.ok(support.absY > Math.max(...primary.map(node => node.absY + node.height)));
    assert.equal(geometry.composition!.candidate, 'compact-flow');
    assert.equal(geometry.composition!.flow?.status, 'satisfied');
    assert.deepEqual(model, original);
  });
}

test('flow aligns a two-level primary hierarchy and permits a source-supported response terminal below', async () => {
  const model = flowFixture('above', true, true), sizes = flowMeasurements(model);
  sizes.nodes.router.height = 172;
  const geometry = await layout(model, sizes, { composition: 'compact' });
  complete(model, geometry);
  const router = geometry.nodes.find(node => node.id === 'router')!, receipt = geometry.nodes.find(node => node.id === 'receipt')!;
  assert.equal(router.parent, 'inner-zone');
  assert.equal(geometry.nodes.find(node => node.id === 'inner-zone')!.parent, 'processing-zone');
  assert.equal(router.height, 172);
  assert.ok(receipt.absY > router.absY + router.height);
  assert.equal(geometry.composition!.flow?.status, 'satisfied');
  const reordered = { ...model, nodes: [...model.nodes].reverse(), groups: [...model.groups].reverse(), edges: [...model.edges].reverse() };
  assert.deepEqual(withoutTiming(await layout(reordered, sizes, { composition: 'compact' })), withoutTiming(geometry));
});

test('support groups use the available primary band instead of adding a row that makes a nested flow unreadable', async () => {
  const model = flowFixture('above', true, true), sizes = flowPresentationMeasurements(model);
  const geometry = await layout(model, sizes, { composition: 'compact' });
  complete(model, geometry);
  const candidate = geometry.composition!.candidates[0];
  assert.ok(candidate.fittedNodeFont >= 14 && candidate.fittedLabelFont >= 11,
    `Fitted node ${candidate.fittedNodeFont}, label ${candidate.fittedLabelFont}; bounds ${JSON.stringify(candidate.bounds)}`);
  const lookup = geometry.nodes.find(node => node.id === 'lookup')!, memo = geometry.nodes.find(node => node.id === 'memo')!;
  assert.equal(lookup.absY, memo.absY);
  assert.equal(geometry.composition!.flow?.status, 'satisfied');
});

test('large supporting groups wrap within the measured primary band while preserving every component', async () => {
  const model = flowFixture('above', true, true), originalHelper = model.nodes.find(node => node.id === 'lookup')!;
  for (let index = 0; index < 16; index++) model.nodes.push({ ...originalHelper, id: `helper-${index}`, label: `Helper ${index}` });
  const original = structuredClone(model), geometry = await layout(model, flowPresentationMeasurements(model), { composition: 'compact' });
  complete(model, geometry);
  const helper = geometry.nodes.find(node => node.id === 'helper-zone')!, intake = geometry.nodes.find(node => node.id === 'intake')!, processing = geometry.nodes.find(node => node.id === 'processing-zone')!;
  const primaryWidth = processing.absX + processing.width - intake.absX;
  assert.ok(helper.width <= primaryWidth, `Support width ${helper.width} exceeds available primary band ${primaryWidth}`);
  const support = geometry.nodes.filter(node => node.parent === 'helper-zone');
  assert.equal(support.length, 18);
  assert.ok(new Set(support.map(node => node.absY)).size > 1);
  assert.equal(geometry.composition!.flow?.status, 'satisfied');
  assert.deepEqual(model, original);
});

test('support subgroups inherit the nearest primary ancestor band rather than the wider root band', async () => {
  const model = flowFixture('above', true, true);
  model.groups.find(group => group.id === 'helper-zone')!.parent = 'processing-zone';
  model.nodes.push({ ...model.nodes.find(node => node.id === 'lookup')!, id: 'adapter', label: 'Adapter' });
  const geometry = await layout(model, flowPresentationMeasurements(model), { composition: 'compact' });
  complete(model, geometry);
  const helper = geometry.nodes.find(node => node.id === 'helper-zone')!, inner = geometry.nodes.find(node => node.id === 'inner-zone')!, journal = geometry.nodes.find(node => node.id === 'journal')!;
  const nearestBand = journal.absX + journal.width - inner.absX;
  assert.equal(helper.parent, 'processing-zone');
  assert.ok(helper.width <= nearestBand, `Support width ${helper.width} exceeds nearest primary band ${nearestBand}`);
  assert.ok(new Set(geometry.nodes.filter(node => node.parent === 'helper-zone').map(node => node.absY)).size > 1);
  assert.equal(geometry.composition!.flow?.status, 'satisfied');
});

test('support inside a primary subgroup clears the complete band of unusually tall measured primary cards', async () => {
  const model = flowFixture('above', true), sizes = flowMeasurements(model);
  model.nodes.find(node => node.id === 'lookup')!.parent = 'inner-zone';
  sizes.nodes.journal.height = 600;
  const geometry = await layout(model, sizes, { composition: 'compact' });
  complete(model, geometry);
  const lookup = geometry.nodes.find(node => node.id === 'lookup')!, journal = geometry.nodes.find(node => node.id === 'journal')!;
  assert.ok(lookup.absY + lookup.height < journal.absY);
  assert.equal(geometry.composition!.flow?.status, 'satisfied');
});

test('automatic flow evidence is stable when node, group and relationship inputs are permuted', async () => {
  const model = flowFixture(), sizes = flowMeasurements(model);
  const original = await layout(model, sizes);
  const reordered = { ...model, nodes: [...model.nodes].reverse(), groups: [...model.groups].reverse(), edges: [...model.edges].reverse() };
  assert.deepEqual(withoutTiming(await layout(reordered, sizes)), withoutTiming(original));
});

test('a single-edge flat horizontal flow keeps its declared band and support side', async () => {
  const model = flowFixture('below');
  model.groups = [];
  model.nodes = model.nodes.filter(node => ['intake', 'router', 'memo'].includes(node.id)).map(({ parent: _parent, ...node }) => node);
  model.edges = [model.edges[0], { ...model.edges[2], to: 'memo' }];
  model.flow!.primary = ['enter'];
  const geometry = await layout(model, flowMeasurements(model), { composition: 'compact' });
  complete(model, geometry);
  const intake = geometry.nodes.find(node => node.id === 'intake')!, router = geometry.nodes.find(node => node.id === 'router')!, memo = geometry.nodes.find(node => node.id === 'memo')!;
  assert.ok(router.absX > intake.absX + intake.width);
  assert.equal(router.absY + router.height / 2, intake.absY + intake.height / 2);
  assert.ok(memo.absY > router.absY + router.height);
  assert.equal(geometry.composition!.flow?.status, 'satisfied');
});

test('raw vertical flow layout is unavailable before either engine computes an arrangement', async context => {
  const model = flowFixture(), sizes = flowMeasurements(model), actual = ELK.prototype.layout;
  model.direction = 'down';
  let calls = 0;
  context.mock.method(ELK.prototype, 'layout', function(this: ELK, ...args: Parameters<typeof actual>) { calls++; return actual.apply(this, args); });
  for (const composition of ['auto', 'compact', 'layered'] as const) {
    await assert.rejects(layout(model, sizes, { composition }), /flow.*unavailable.*direction.*down.*right/i);
  }
  assert.equal(calls, 0);
});

test('direct flow placement rejects an unsupported direction instead of overriding it', () => {
  const model = flowFixture(); model.direction = 'down';
  assert.throws(() => flowNodes(model, flowMeasurements(model)), /flow.*unavailable.*direction.*down.*right/i);
});

test('flow assessment explicitly reports unsupported direction without certifying horizontal geometry', async () => {
  const model = flowFixture(), geometry = await layout(model, flowMeasurements(model), { composition: 'compact' });
  model.direction = 'down';
  for (const assessed of [assessFlow(model), assessFlow(model, geometry)]) {
    assert.equal(assessed?.status, 'unsatisfied');
    assert.ok(assessed?.diagnostics.some(value => value.check === 'flow-direction' && /direction.*down.*right/.test(value.message)));
  }
});

test('primary gaps follow their adjacent request labels independently of a long supporting label', async () => {
  const model = flowFixture(); model.groups = [];
  model.nodes = model.nodes.map(({ parent: _parent, ...node }) => node);
  const sizes = flowMeasurements(model);
  sizes.labels.consult.width = 420;
  const geometry = await layout(model, sizes, { composition: 'compact' });
  complete(model, geometry);
  const primary = ['intake', 'router', 'journal'].map(id => geometry.nodes.find(node => node.id === id)!);
  assert.deepEqual(primary.slice(1).map((node, index) => node.absX - primary[index].absX - primary[index].width), [96, 96]);
  sizes.labels.enter.width = 168;
  const enlargedRequest = await layout(model, sizes, { composition: 'compact' });
  complete(model, enlargedRequest);
  const enlarged = ['intake', 'router', 'journal'].map(id => enlargedRequest.nodes.find(node => node.id === id)!);
  assert.deepEqual(enlarged.slice(1).map((node, index) => node.absX - enlarged[index].absX - enlarged[index].width), [200, 96]);
  assert.equal(enlargedRequest.composition!.flow?.status, 'satisfied');
});

test('a terminal without response semantics stays on the declared support side inside its primary group', async () => {
  const model = flowFixture('above', false, true), original = structuredClone(model);
  model.edges.find(edge => edge.id === 'deliver')!.interaction = 'event';
  const geometry = await layout(model, flowMeasurements(model), { composition: 'compact' });
  complete(model, geometry);
  const receipt = geometry.nodes.find(node => node.id === 'receipt')!, router = geometry.nodes.find(node => node.id === 'router')!;
  assert.ok(receipt.absY + receipt.height < router.absY);
  assert.equal(geometry.composition!.flow?.status, 'satisfied');
  assert.equal(model.edges.find(edge => edge.id === 'deliver')!.interaction, 'event');
  assert.deepEqual(model.nodes, original.nodes);
});

test('auto prefers readable declared flow over valid folded packing and retains three candidates', async () => {
  const model = flowFixture(), geometry = await layout(model, flowMeasurements(model)), evidence = geometry.composition!;
  complete(model, geometry);
  assert.deepEqual(evidence.candidates.map(candidate => candidate.id), ['layered', 'compact-balanced', 'compact-flow']);
  const folded = evidence.candidates.find(candidate => candidate.id === 'compact-balanced')!;
  assert.equal(folded.valid, true);
  assert.equal(folded.flow?.status, 'unsatisfied');
  const selected = evidence.candidates.find(candidate => candidate.id === evidence.candidate)!;
  assert.equal(selected.flow?.status, 'satisfied');
  assert.ok(selected.fittedNodeFont >= 14 && selected.fittedLabelFont >= 11);
  assert.equal(evidence.flow?.status, 'satisfied');
});

test('an incompatible group span remains an intent limit while complete fallback geometry stays available', async () => {
  const model = flowFixture();
  model.nodes.find(node => node.id === 'intake')!.parent = 'processing-zone';
  delete model.nodes.find(node => node.id === 'router')!.parent;
  const geometry = await layout(model, flowMeasurements(model)), evidence = geometry.composition!;
  complete(model, geometry);
  const flow = evidence.candidates.find(candidate => candidate.id === 'compact-flow')!;
  assert.equal(flow.valid, false);
  assert.ok(flow.flow?.diagnostics.some(value => value.check === 'flow-group-span' && value.ids.includes('processing-zone')));
  assert.equal(evidence.flow?.status, 'unsatisfied');
  assert.match(evidence.reason, /intent remains unsatisfied/i);
  await assert.rejects(layout(model, flowMeasurements(model), { composition: 'compact' }), /processing-zone.*contiguous/i);
});

test('legacy composition retains the generic compact alternatives without flow evidence', async () => {
  const model = flowFixture(); delete model.flow;
  const geometry = await layout(model, flowMeasurements(model));
  complete(model, geometry);
  assert.deepEqual(geometry.composition!.candidates.map(candidate => candidate.id), ['layered', 'compact-balanced', 'compact-wide']);
  assert.equal(geometry.composition!.flow, undefined);
  assert.ok(geometry.composition!.candidates.every(candidate => candidate.flow === undefined));
});

test('composition fit uses ninety percent of both reference-canvas axes', () => {
  const model = flowFixture(); model.nodes = model.nodes.slice(0, 1); model.groups = []; model.edges = []; delete model.flow;
  const geometry: Geometry = { nodes: [{ id: 'intake', kind: 'gateway', x: 0, y: 0, absX: 0, absY: 0, width: 224, height: 720, headerHeight: 0 }], edges: [], bounds: { width: 224, height: 720 } };
  assert.equal(assessComposition(model, geometry, 'tall', 'compact').fitScale, .9);
});

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

test('auto selects readable compact text for a small tall-card flow below the old ribbon gain threshold', async () => {
  const model = parseModel(FIXTURES.sample), original = structuredClone(model), sizes = samplePresentationMeasurements();
  sizes.nodes.orchestrator.height = 230;
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
