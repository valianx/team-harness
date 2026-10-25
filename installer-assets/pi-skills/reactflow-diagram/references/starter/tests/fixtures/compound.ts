import type { Architecture, Measurements } from '../../src/types';

const evidence = [{ source: 'design', locator: 'Synthetic processing architecture' }];
const members = {
  clients: ['console', 'handheld'],
  access: ['gateway', 'identity', 'api'],
  operations: ['commands', 'dispatcher', 'registry', 'records'],
  processing: ['ingestion', 'broker', 'rules', 'alerts', 'series'],
  analytics: ['archive', 'transform', 'warehouse', 'reports'],
  support: ['tracing', 'messaging'],
};
const links = [
  ['console', 'gateway'], ['handheld', 'gateway'], ['gateway', 'identity'], ['gateway', 'api'],
  ['api', 'registry'], ['api', 'commands'], ['commands', 'records'], ['commands', 'dispatcher'],
  ['dispatcher', 'broker'], ['registry', 'records'], ['ingestion', 'broker'], ['broker', 'rules'],
  ['rules', 'series'], ['rules', 'alerts'], ['alerts', 'dispatcher'], ['dispatcher', 'messaging'],
  ['broker', 'archive'], ['archive', 'transform'], ['transform', 'warehouse'], ['warehouse', 'reports'],
  ['console', 'reports'], ['api', 'series'], ['api', 'records'], ['gateway', 'tracing'],
  ['api', 'tracing'], ['ingestion', 'tracing'], ['broker', 'tracing'], ['alerts', 'tracing'],
  ['rules', 'messaging'],
];

export function compound(direction: 'right' | 'down' = 'right'): Architecture {
  return {
    schemaVersion: 1, title: 'Synthetic processing system', theme: 'presentation', direction,
    sources: [{ id: 'design', title: 'Synthetic design', locator: 'design.md', status: 'read' }],
    groups: Object.keys(members).map(id => ({ id, label: id, evidence })),
    nodes: Object.entries(members).flatMap(([parent, ids]) => ids.map(id => ({
      id, parent, label: id, kind: id === 'broker' ? 'queue' as const : 'service' as const, evidence,
    }))),
    edges: links.map(([from, to], i) => ({ id: `link-${String(i + 1).padStart(2, '0')}`, from, to, label: `Relationship ${i + 1}`, evidence })),
    review: { unresolved: ['A capacity decision remains open.'], decisions: [] }, views: [], steps: [],
  };
}

export function measured(model: Architecture): Measurements {
  return {
    nodes: Object.fromEntries(model.nodes.map((node, i) => [node.id, { width: 256, height: i % 4 === 0 ? 120 : 88 }])),
    headers: Object.fromEntries(model.groups.map(group => [group.id, { width: 256, height: 38 }])),
    labels: Object.fromEntries(model.edges.filter(edge => edge.label).map((edge, i) => [edge.id, { width: i % 5 === 0 ? 168 : 112, height: i % 5 === 0 ? 44 : 28 }])),
  };
}
