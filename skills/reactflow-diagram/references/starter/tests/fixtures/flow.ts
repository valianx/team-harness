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
