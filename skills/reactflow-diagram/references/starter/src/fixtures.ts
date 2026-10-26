import sample from '../fixtures/payment-demo.json';
import { flowFixture } from '../tests/fixtures/flow';
import type { Architecture } from './types';

const clone = (): Architecture => ({ ...structuredClone(sample), views: [] }) as Architecture;
const longLabel = clone();
longLabel.nodes[1].label = 'Payment coordination and reconciliation service for international merchant settlements';
longLabel.edges[1].label = 'Persist the complete payment and reconciliation record';
const empty = { ...clone(), nodes: [], groups: [], edges: [], steps: [] };
const invalid = clone(); invalid.edges[0].to = 'missing';
const cycle = clone();
cycle.edges.push({ ...cycle.edges[0], id: 'reply', from: 'database', to: 'gateway', label: 'Return result' });
const disconnected = clone();
disconnected.nodes.push({ ...disconnected.nodes[0], id: 'isolated', label: 'Isolated service', kind: 'service' });
const nested = clone();
nested.groups.push({ ...nested.groups[0], id: 'reserved', label: 'Reserved boundary', parent: 'payments' });
const dense = clone();
dense.nodes.push({ ...dense.nodes[0], id: 'collector', label: 'Result collector', kind: 'service' });
for (let i = 0; i < 8; i++) {
  dense.nodes.push({ ...dense.nodes[0], id: `consumer-${i}`, label: `Event consumer ${i}`, kind: 'service' });
  dense.edges.push({ ...dense.edges[0], id: `delivery-${i}`, from: 'events', to: `consumer-${i}`, label: `Event ${i}` });
  dense.edges.push({ ...dense.edges[0], id: `result-${i}`, from: `consumer-${i}`, to: 'collector', label: `Result ${i}` });
}
const unresolved = clone(); unresolved.review.unresolved.push('The image and documentation disagree on notification direction.');
const unavailable: unknown = { ...clone(), sources: [...sample.sources, { id: 'missing', title: 'Unread image', locator: 'missing.png', status: 'unavailable', material: true }] };
const down = { ...clone(), direction: 'down' };
const selfLoop = clone();
selfLoop.title = 'Retry loop';
selfLoop.nodes = [{ ...selfLoop.nodes[0], id: 'worker', kind: 'service', label: 'Worker', parent: undefined }];
selfLoop.groups = [];
selfLoop.edges = [{ ...selfLoop.edges[0], id: 'retry', from: 'worker', to: 'worker', label: 'Retry' }];
selfLoop.steps = [];
const interactions = clone();
interactions.title = 'Interaction styles';
interactions.groups = [];
interactions.nodes = [
  ['client', 'Client', 'external'], ['coordinator', 'Coordinator', 'service'], ['specialist', 'Specialist', 'service'],
  ['store', 'Record store', 'database'], ['events', 'Event channel', 'queue'],
].map(([id, label, kind]) => ({ ...interactions.nodes[0], id, label, kind, parent: undefined })) as Architecture['nodes'];
interactions.edges = [
  ['request', 'client', 'coordinator', 'Request'], ['call', 'coordinator', 'specialist', 'Call specialist'],
  ['response', 'specialist', 'coordinator', 'Return result'], ['event', 'coordinator', 'events', 'Publish event'],
  ['persistence', 'coordinator', 'store', 'Persist record'], ['neutral', 'events', 'client', 'Notify client'],
].map(([id, from, to, label]) => ({ ...interactions.edges[0], id, from, to, label, ...(id === 'neutral' ? {} : { interaction: id }) })) as Architecture['edges'];
interactions.steps = [];

const flowAbove = flowFixture('above', true, true);
flowAbove.views = [
  { id: 'primary-view', label: 'Primary path', nodeIds: ['intake', 'router', 'journal'], edgeIds: ['enter', 'commit'],
    outside: flowAbove.edges.filter(edge => !['enter', 'commit'].includes(edge.id)).map(edge => ({ edge: edge.id, reason: 'Supporting relationship is outside this perspective.' })) },
  { id: 'helpers-view', label: 'Supporting lookup', nodeIds: ['router', 'lookup', 'memo'], edgeIds: ['consult', 'retain'],
    outside: flowAbove.edges.filter(edge => !['consult', 'retain'].includes(edge.id)).map(edge => ({ edge: edge.id, reason: 'Primary and return relationships are outside this perspective.' })) },
];
const flowBelow = flowFixture('below');
const incompatibleFlow = flowFixture();
incompatibleFlow.title = 'Invented incompatible grouping';
incompatibleFlow.groups.push({ ...incompatibleFlow.groups[0], id: 'split-zone', label: 'Split span' });
for (const node of incompatibleFlow.nodes) if (['intake', 'journal'].includes(node.id)) node.parent = 'split-zone';

export const FIXTURES: Record<string, unknown> = { sample, 'long-label': longLabel, 'self-loop': selfLoop, 'flow-above': flowAbove, 'flow-below': flowBelow, 'flow-incompatible': incompatibleFlow, empty, invalid, nested, cycle, disconnected, dense, unresolved, unavailable, down, interactions };
