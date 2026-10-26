import type { Architecture, Interaction, Measurements, PlacedNode } from '../../src/types';

const evidence = [{ source: 'synthetic', locator: 'Independent relationship routing fixture' }];

/** Small invented flows isolate reciprocal and fan-in routing, without application facts. */
export function relationships(kind: 'reciprocal' | 'fan-in' = 'reciprocal', direction: 'right' | 'down' = 'right'): Architecture {
  const ids = kind === 'reciprocal' ? ['actor', 'service'] : ['actor', 'bridge', 'specialist', 'store'];
  const links = kind === 'reciprocal' ? [
    ['request', 'actor', 'service', 'request'], ['response', 'service', 'actor', 'response'],
  ] : [
    ['first', 'actor', 'specialist', 'call'], ['second', 'bridge', 'specialist', 'call'],
    ['again', 'actor', 'specialist', 'call'], ['return', 'specialist', 'actor', 'response'],
    ['save', 'specialist', 'store', 'persistence'],
  ];
  return {
    schemaVersion: 1, title: 'Synthetic relationships', theme: 'presentation', direction,
    sources: [{ id: 'synthetic', title: 'Synthetic relationships', locator: 'synthetic.md', status: 'read' }],
    nodes: ids.map(id => ({ id, label: id, kind: 'service', evidence })), groups: [],
    edges: links.map(([id, from, to, interaction]) => ({ id, from, to, label: id, interaction: interaction as Interaction, evidence })),
    review: { unresolved: [], decisions: [], assessor: 'Synthetic fixture' }, views: [], steps: [],
  };
}

export function relationshipMeasurements(model: Architecture): Measurements {
  return {
    nodes: Object.fromEntries(model.nodes.map(node => [node.id, { width: 224, height: 100 }])),
    headers: Object.fromEntries(model.groups.map(group => [group.id, { width: 224, height: 32 }])),
    labels: Object.fromEntries(model.edges.filter(edge => edge.label).map(edge => [edge.id, { width: 72, height: 24 }])),
  };
}

export function placed(id: string, x: number, y: number): PlacedNode {
  return { id, kind: 'service', x, y, absX: x, absY: y, width: 224, height: 100, headerHeight: 0 };
}
