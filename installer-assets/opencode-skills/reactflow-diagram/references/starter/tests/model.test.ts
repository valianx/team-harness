import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseModel, fidelityStatus, selectView, completionStatus } from '../src/model';
import { flowFixture } from './fixtures/flow';

export function example(): any {
  const evidence = [{ source: 'note', locator: 'Architecture' }];
  return { schemaVersion: 1, title: 'Example', theme: 'presentation', direction: 'right',
    sources: [{ id: 'note', title: 'Architecture', locator: 'note.md', status: 'read' }],
    nodes: [{ id: 'a', kind: 'gateway', label: 'Gateway', evidence }, { id: 'b', kind: 'service', label: 'Service', evidence }],
    groups: [], edges: [{ id: 'request', from: 'a', to: 'b', label: 'HTTPS', evidence }],
    review: { unresolved: [], decisions: [], assessor: 'Fixture review' }, views: [], steps: [] };
}

test('validates a minimal architecture and preserves relationship cycles', () => {
  const input = example();
  input.edges.push({ ...input.edges[0], id: 'reply', from: 'b', to: 'a' });
  assert.equal(parseModel(input).edges.length, 2);
});

test('schema one preserves neutral relationships and every supported interaction class', () => {
  const neutral = parseModel(example());
  assert.equal(neutral.edges[0].interaction, undefined);
  for (const interaction of ['request', 'call', 'response', 'event', 'persistence'] as const) {
    const input = example(); input.edges[0].interaction = interaction;
    const parsed = parseModel(input);
    assert.equal(parsed.edges[0].interaction, interaction);
    assert.deepEqual(parsed.edges[0].evidence, neutral.edges[0].evidence);
  }
});

test('interaction classes do not admit arbitrary style, coordinates or unknown values', () => {
  for (const field of [{ interaction: 'rpc' }, { interaction: 'call', color: 'red' }, { interaction: 'event', x: 10 }]) {
    const input = example(); Object.assign(input.edges[0], field);
    assert.throws(() => parseModel(input), /edges\.0/);
  }
});

test('schema one accepts an ordered request path without requiring flow on legacy inputs', () => {
  const input = flowFixture();
  assert.deepEqual(parseModel(input).flow, { primary: ['enter', 'commit'], supportSide: 'above' });
  input.edges.push({ ...input.edges[0], id: 'feedback', from: 'journal', to: 'intake', interaction: 'response' });
  assert.equal(parseModel(input).edges.length, 5);
  input.flow!.primary = ['enter'];
  assert.deepEqual(parseModel(input).flow!.primary, ['enter']);
  assert.equal(parseModel(example()).flow, undefined);
});

for (const [name, mutate, match] of [
  ['missing relationship', (m: any) => m.flow.primary[1] = 'absent', /flow.*absent/],
  ['unclassified relationship', (m: any) => delete m.edges[0].interaction, /flow.*enter.*request/],
  ['non-request relationship', (m: any) => m.flow.primary = ['consult'], /flow.*consult.*request/],
  ['repeated relationship', (m: any) => m.flow.primary = ['enter', 'enter'], /flow.*repeat.*enter/],
  ['disconnected order', (m: any) => m.flow.primary = ['commit', 'enter'], /flow.*contiguous/],
  ['cyclic request path', (m: any) => m.edges[1].to = 'intake', /flow.*simple.*intake/],
  ['empty request path', (m: any) => m.flow.primary = [], /flow\.primary/],
  ['unsupported side', (m: any) => m.flow.supportSide = 'left', /flow\.supportSide/],
  ['unsupported vertical direction', (m: any) => m.direction = 'down', /flow.*direction.*right/],
  ['coordinates', (m: any) => m.flow.x = 70, /flow.*x/],
  ['unknown flow field', (m: any) => m.flow.orientation = 'right', /flow.*orientation/],
] as const) {
  test(`flow intent rejects ${name}`, () => { const model = flowFixture(); mutate(model); assert.throws(() => parseModel(model), match); });
}

test('legacy vertical models remain valid without horizontal flow intent', () => {
  const input = example(); input.direction = 'down';
  assert.equal(parseModel(input).direction, 'down');
  assert.equal(parseModel(input).flow, undefined);
});

test('perspectives keep flow only when every primary relationship remains present', () => {
  const input = flowFixture();
  input.views = [
    { id: 'whole', label: 'Whole', nodeIds: input.nodes.map(node => node.id), edgeIds: input.edges.map(edge => edge.id) },
    { id: 'fragment', label: 'Fragment', nodeIds: input.nodes.map(node => node.id), edgeIds: ['enter'] },
  ];
  const model = parseModel(input), original = structuredClone(model);
  assert.deepEqual(selectView(model, 'whole').flow, model.flow);
  const fragment = selectView(model, 'fragment');
  assert.equal(fragment.flow, undefined);
  assert.deepEqual(fragment.nodes.map(node => node.id), model.nodes.map(node => node.id));
  assert.deepEqual(model, original);
});

test('rejects unsupported fields and reports their paths', () => {
  const input = example(); input.nodes[0].x = 123;
  assert.throws(() => parseModel(input), /nodes.*x/);
});

for (const [name, mutate, match] of [
  ['duplicate IDs', (m: any) => m.nodes[1].id = 'a', /a/],
  ['missing endpoint', (m: any) => m.edges[0].to = 'absent', /absent/],
  ['missing evidence', (m: any) => m.nodes[0].evidence = [], /evidence/],
  ['unread evidence', (m: any) => m.sources[0].status = 'unavailable', /note/],
  ['unknown evidence', (m: any) => m.edges[0].evidence[0].source = 'absent', /absent/],
  ['missing parent', (m: any) => m.nodes[0].parent = 'absent', /absent/],
  ['empty label', (m: any) => m.nodes[0].label = '', /label/],
  ['missing step target', (m: any) => m.steps = [{ id: 'first', title: 'First', focus: ['absent'] }], /absent/],
] as const) {
  test(`rejects ${name}`, () => { const m = example(); mutate(m); assert.throws(() => parseModel(m), match); });
}

test('rejects hierarchy cycles and more than two group levels', () => {
  const m = example();
  m.groups = [{ id: 'g', label: 'Group', parent: 'h', evidence: m.nodes[0].evidence }, { id: 'h', label: 'Subgroup', parent: 'g', evidence: m.nodes[0].evidence }];
  assert.throws(() => parseModel(m), /cycle/);
  m.groups[0].parent = undefined;
  m.groups.push({ id: 'i', label: 'Third', parent: 'h', evidence: m.nodes[0].evidence });
  assert.throws(() => parseModel(m), /depth/);
});

test('fidelity stays draft for unavailable material input, questions or absent assessment', () => {
  const m = example();
  assert.equal(fidelityStatus(parseModel(m)).status, 'reviewed');
  m.sources.push({ id: 'missing', title: 'Missing image', locator: 'missing.png', status: 'unavailable', material: true });
  assert.equal(fidelityStatus(parseModel(m)).status, 'draft');
  m.sources.pop(); m.review.unresolved.push('Which direction?');
  assert.equal(fidelityStatus(parseModel(m)).status, 'draft');
  m.review.unresolved = []; delete m.review.assessor;
  assert.equal(fidelityStatus(parseModel(m)).status, 'draft');
});

test('view membership accounts for relationships and retains ancestors', () => {
  const m = example();
  m.groups = [{ id: 'g', label: 'Group', evidence: m.nodes[0].evidence }]; m.nodes[1].parent = 'g';
  m.views = [{ id: 'request-view', label: 'Request', nodeIds: ['a', 'b'], edgeIds: ['request'] }];
  const view = selectView(parseModel(m), 'request-view');
  assert.deepEqual(view.groups.map(g => g.id), ['g']);
  m.views[0].nodeIds = ['a']; assert.throws(() => parseModel(m), /endpoint/);
  m.views[0].nodeIds = ['a', 'b']; m.views[0].edgeIds = [];
  assert.throws(() => parseModel(m), /unaccounted.*request/);
  m.views[0].outside = [{ edge: 'request', reason: 'Outside this perspective' }];
  assert.equal(parseModel(m).views.length, 1);
});

test('a build or geometry pass cannot hide missing checks or unresolved fidelity', () => {
  const m = parseModel(example());
  assert.equal(completionStatus(m, { model: 'pass', geometry: 'pass', build: 'pass', rendered: 'missing' }).status, 'unverified');
  assert.equal(completionStatus(m, { model: 'pass', geometry: 'fail', build: 'pass', rendered: 'pass' }).status, 'unverified');
  assert.equal(completionStatus(m, { model: 'pass', geometry: 'pass', build: 'pass', rendered: 'pass' }).status, 'verified');
  m.review.unresolved.push('Source conflict');
  assert.equal(completionStatus(m, { model: 'pass', geometry: 'pass', build: 'pass', rendered: 'pass' }).status, 'draft');
});

test('completion of a declared flow requires its own passing intent assessment', () => {
  const model = parseModel(flowFixture()), mechanical = { model: 'pass', geometry: 'pass', build: 'pass', rendered: 'pass' } as const;
  assert.equal(completionStatus(model, mechanical).status, 'unverified');
  assert.equal(completionStatus(model, { ...mechanical, flow: 'fail' }).status, 'unverified');
  assert.equal(completionStatus(model, { ...mechanical, flow: 'pass' }).status, 'verified');
});
