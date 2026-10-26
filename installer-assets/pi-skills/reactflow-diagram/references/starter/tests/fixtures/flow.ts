import type { Architecture, Measurements } from '../../src/types';

const evidence = [{ source: 'invented', locator: 'Small independent flow fixture' }];

/** Invented request and support relationships exercise composition without application-specific facts. */
export function flowFixture(supportSide: 'above' | 'below' = 'above', nested = false, terminal = false): Architecture {
  const processingParent = nested ? 'inner-zone' : 'processing-zone';
  return {
    schemaVersion: 1, title: 'Invented dispatch', theme: 'presentation', direction: 'right',
    sources: [{ id: 'invented', title: 'Invented dispatch', locator: 'invented.md', status: 'read' }],
    nodes: [
      { id: 'intake', label: 'Intake', kind: 'gateway', evidence },
      { id: 'router', label: 'Router', kind: 'service', parent: processingParent, evidence },
      { id: 'journal', label: 'Journal', kind: 'database', parent: 'processing-zone', evidence },
      { id: 'lookup', label: 'Lookup', kind: 'service', parent: 'helper-zone', evidence },
      { id: 'memo', label: 'Memo', kind: 'queue', parent: 'helper-zone', evidence },
      ...(terminal ? [{ id: 'receipt', label: 'Receipt', kind: 'external' as const, parent: processingParent, evidence }] : []),
    ],
    groups: [
      { id: 'processing-zone', label: 'Processing', evidence },
      { id: 'helper-zone', label: 'Helpers', evidence },
      ...(nested ? [{ id: 'inner-zone', label: 'Inner', parent: 'processing-zone', evidence }] : []),
    ],
    edges: [
      { id: 'enter', from: 'intake', to: 'router', label: 'Enter', interaction: 'request', evidence },
      { id: 'commit', from: 'router', to: 'journal', label: 'Commit', interaction: 'request', evidence },
      { id: 'consult', from: 'router', to: 'lookup', label: 'Consult', interaction: 'call', evidence },
      { id: 'retain', from: 'lookup', to: 'memo', label: 'Retain', interaction: 'persistence', evidence },
      ...(terminal ? [{ id: 'deliver', from: 'journal', to: 'receipt', label: 'Deliver', interaction: 'response' as const, evidence }] : []),
    ],
    flow: { primary: ['enter', 'commit'], supportSide },
    review: { unresolved: [], decisions: [], assessor: 'Synthetic source assessment' }, views: [], steps: [],
  };
}

/** Measurements vary card and header sizes while remaining independent of the placement engine. */
export function flowMeasurements(model: Architecture): Measurements {
  return {
    nodes: Object.fromEntries(model.nodes.map(node => [node.id, { width: node.id === 'memo' ? 240 : 224, height: node.id === 'journal' ? 116 : 100 }])),
    headers: Object.fromEntries(model.groups.map(group => [group.id, { width: group.id === 'inner-zone' ? 260 : 224, height: 28 }])),
    labels: Object.fromEntries(model.edges.filter(edge => edge.label).map(edge => [edge.id, { width: 64, height: 20 }])),
  };
}

/** Minimum-height presentation cards isolate the effect of support packing on fitted text. */
export function flowPresentationMeasurements(model: Architecture): Measurements {
  const sizes = flowMeasurements(model);
  Object.values(sizes.nodes).forEach(size => { size.height = 76; });
  Object.values(sizes.headers).forEach(size => { size.height = 22.5; });
  return sizes;
}

/** An invented flat chain separates primary, synchronous return and supporting-call lanes. */
export function laneFixture(supportSide: 'above' | 'below' = 'above'): Architecture {
  return {
    schemaVersion: 1, title: 'Invented routing lanes', theme: 'presentation', direction: 'right',
    sources: [{ id: 'invented', title: 'Invented routing lanes', locator: 'invented.md', status: 'read' }],
    nodes: ['origin', 'relay', 'sink', 'helper'].map(id => ({ id, label: id, kind: 'service', evidence })), groups: [],
    edges: [
      { id: 'support-first', from: 'relay', to: 'helper', label: 'Inspect', interaction: 'call', evidence },
      { id: 'reply-last', from: 'sink', to: 'relay', label: 'Accepted', interaction: 'response', evidence },
      { id: 'start', from: 'origin', to: 'relay', label: 'Begin request', interaction: 'request', evidence },
      { id: 'support-last', from: 'sink', to: 'helper', label: 'Check', interaction: 'call', evidence },
      { id: 'finish', from: 'relay', to: 'sink', label: 'Finish', interaction: 'request', evidence },
      { id: 'reply-first', from: 'relay', to: 'origin', label: 'Ready', interaction: 'response', evidence },
    ],
    flow: { primary: ['start', 'finish'], supportSide },
    review: { unresolved: [], decisions: [], assessor: 'Synthetic source assessment' }, views: [], steps: [],
  };
}

/** The first request label occupies the gap that measurement reserves, without widening other gaps. */
export function laneMeasurements(model: Architecture): Measurements {
  const sizes = flowMeasurements(model);
  sizes.labels.start.width = 168;
  return sizes;
}

/** Repeated calls between three invented components require separate departure and arrival lanes. */
export function supportLaneFixture(supportSide: 'above' | 'below' = 'above', nested = false): Architecture {
  return {
    schemaVersion: 1, title: 'Invented worker checks', theme: 'presentation', direction: 'right',
    sources: [{ id: 'invented', title: 'Invented worker checks', locator: 'invented.md', status: 'read' }],
    nodes: [
      { id: 'sender', label: 'Sender', kind: 'external', parent: 'worker-area', evidence },
      { id: 'worker', label: 'Worker', kind: 'service', parent: nested ? 'inner-area' : 'worker-area', evidence },
      { id: 'helper', label: 'Helper', kind: 'service', parent: 'support-area', evidence },
    ],
    groups: [
      { id: 'worker-area', label: 'Workers', evidence }, { id: 'support-area', label: 'Support', evidence },
      ...(nested ? [{ id: 'inner-area', label: 'Inner worker', parent: 'worker-area', evidence }] : []),
    ],
    edges: [
      { id: 'execute', from: 'sender', to: 'worker', label: 'Execute', interaction: 'request', evidence },
      ...['one', 'two', 'three'].map(id => ({ id: `check-${id}`, from: 'worker', to: 'helper', label: `Check ${id}`, interaction: 'call' as const, evidence })),
    ],
    flow: { primary: ['execute'], supportSide },
    review: { unresolved: [], decisions: [], assessor: 'Synthetic fixture' }, views: [], steps: [],
  };
}

/** Enlarged card, header and label measurements model supported shared typography changes. */
export function supportLaneMeasurements(model: Architecture, enlarged = false): Measurements {
  return {
    nodes: Object.fromEntries(model.nodes.map(node => [node.id, { width: 224, height: enlarged ? 112 : 76 }])),
    headers: Object.fromEntries(model.groups.map(group => [group.id, { width: 224, height: enlarged ? 65 : 22.5 }])),
    labels: Object.fromEntries(model.edges.map(edge => [edge.id, { width: enlarged ? 184 : 72, height: enlarged ? 76 : 24 }])),
  };
}
