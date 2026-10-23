import sample from '../fixtures/payment-demo.json';
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

export const FIXTURES: Record<string, unknown> = { sample, 'long-label': longLabel, empty, invalid, nested, cycle, disconnected, dense, unresolved, unavailable, down };
