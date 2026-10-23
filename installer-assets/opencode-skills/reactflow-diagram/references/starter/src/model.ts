import { z } from 'zod';
import type { Architecture, ValidationEvidence } from './types';

const text = z.string().trim().min(1);
const id = text.regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
const evidence = z.array(z.union([
  z.strictObject({ source: id, locator: text }),
  z.strictObject({ inference: text, decision: text.optional() }),
])).min(1);
const element = { id, label: text, description: z.string().optional(), parent: id.optional(), evidence };
const schema = z.strictObject({
  schemaVersion: z.literal(1), title: text, theme: z.literal('presentation'), direction: z.enum(['right', 'down']),
  sources: z.array(z.strictObject({ id, title: text, locator: text, status: z.enum(['read', 'unavailable']), material: z.boolean().optional() })),
  nodes: z.array(z.strictObject({ ...element, kind: z.enum(['service', 'gateway', 'database', 'queue', 'external']) })),
  groups: z.array(z.strictObject(element)).default([]),
  edges: z.array(z.strictObject({ id, from: id, to: id, label: text.optional(), description: z.string().optional(), evidence })),
  review: z.strictObject({ unresolved: z.array(text), decisions: z.array(text), assessor: text.optional() }),
  views: z.array(z.strictObject({ id, label: text, nodeIds: z.array(id), edgeIds: z.array(id),
    outside: z.array(z.strictObject({ edge: id, reason: text })).optional(),
    continuations: z.array(z.strictObject({ edge: id, view: id })).optional() })).default([]),
  steps: z.array(z.strictObject({ id, title: text, description: z.string().optional(), focus: z.array(id).min(1) })).default([]),
});

/** Validate architecture semantics before any measurement or layout starts. */
export function parseModel(input: unknown): Architecture {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('\n'));
  const model = parsed.data;
  const unique = (values: { id: string }[], scope: string) => {
    const seen = new Set<string>();
    for (const value of values) {
      if (seen.has(value.id)) throw new Error(`Duplicate ${scope} ID: ${value.id}`);
      seen.add(value.id);
    }
    return seen;
  };
  const elements = [...model.nodes, ...model.groups, ...model.edges];
  const identities = unique(elements, 'element');
  unique(model.sources, 'source'); unique(model.views, 'view'); unique(model.steps, 'step');
  const groups = new Map(model.groups.map(group => [group.id, group]));
  const nodes = new Set(model.nodes.map(node => node.id));
  const edges = new Map(model.edges.map(edge => [edge.id, edge]));
  const sources = new Map(model.sources.map(source => [source.id, source]));
  const requireId = (set: { has(id: string): boolean }, value: string, field: string) => {
    if (!set.has(value)) throw new Error(`${field}: unknown ID ${value}`);
  };
  for (const value of elements) {
    for (const entry of value.evidence) if ('source' in entry) {
      requireId(sources, entry.source, `${value.id}.evidence`);
      if (sources.get(entry.source)!.status !== 'read') throw new Error(`${value.id}.evidence: unread source ${entry.source}`);
    }
  }
  for (const value of [...model.groups, ...model.nodes]) {
    let parent = value.parent;
    const seen = new Set([value.id]);
    let depth = model.groups.includes(value as typeof model.groups[number]) ? 1 : 0;
    while (parent) {
      requireId(groups, parent, `${value.id}.parent`);
      if (seen.has(parent)) throw new Error(`Hierarchy cycle at ${value.id}: ${parent}`);
      seen.add(parent); depth++;
      if (depth > 2) throw new Error(`Unsupported group depth at ${value.id}; maximum is two levels`);
      parent = groups.get(parent)!.parent;
    }
  }
  for (const edge of model.edges) {
    requireId(nodes, edge.from, `${edge.id}.from endpoint`); requireId(nodes, edge.to, `${edge.id}.to endpoint`);
  }
  for (const step of model.steps) for (const focus of step.focus) requireId(identities, focus, `${step.id}.focus`);
  const accounted = new Set<string>();
  const views = new Map(model.views.map(view => [view.id, view]));
  for (const view of model.views) {
    if (new Set(view.nodeIds).size !== view.nodeIds.length || new Set(view.edgeIds).size !== view.edgeIds.length) throw new Error(`Duplicate membership in view ${view.id}`);
    for (const node of view.nodeIds) requireId(nodes, node, `${view.id}.nodeIds`);
    for (const edgeId of view.edgeIds) {
      requireId(edges, edgeId, `${view.id}.edgeIds`);
      const edge = edges.get(edgeId)!;
      if (!view.nodeIds.includes(edge.from) || !view.nodeIds.includes(edge.to)) throw new Error(`View ${view.id}: missing endpoint for ${edgeId}`);
      accounted.add(edgeId);
    }
    for (const outside of view.outside ?? []) { requireId(edges, outside.edge, `${view.id}.outside`); accounted.add(outside.edge); }
    for (const continuation of view.continuations ?? []) {
      requireId(edges, continuation.edge, `${view.id}.continuations`);
      requireId(views, continuation.view, `${view.id}.continuations.view`);
      if (!views.get(continuation.view)!.edgeIds.includes(continuation.edge)) throw new Error(`Continuation ${continuation.edge} is not represented in ${continuation.view}`);
    }
  }
  if (model.views.length) for (const edge of model.edges) if (!accounted.has(edge.id)) throw new Error(`unaccounted relationship ${edge.id}`);
  return model;
}

/** Source review and mechanical verification are independent evidence lanes. */
export function fidelityStatus(model: Architecture): { status: 'draft' | 'reviewed'; reasons: string[] } {
  const reasons = [...model.review.unresolved];
  for (const source of model.sources) if (source.status === 'unavailable' && source.material !== false) reasons.push(`Material source unavailable: ${source.title}`);
  if (!model.review.assessor) reasons.push('Source fidelity has not been reviewed.');
  return { status: reasons.length ? 'draft' : 'reviewed', reasons };
}

/** Select an explicit perspective while retaining every required ancestor. */
export function selectView(model: Architecture, viewId?: string): Architecture {
  if (!viewId) return model;
  const view = model.views.find(value => value.id === viewId);
  if (!view) throw new Error(`Unknown perspective: ${viewId}`);
  const nodes = model.nodes.filter(node => view.nodeIds.includes(node.id));
  const groups = new Map(model.groups.map(group => [group.id, group]));
  const keep = new Set<string>(view.nodeIds);
  for (const node of nodes) {
    let parent = node.parent;
    while (parent) { keep.add(parent); parent = groups.get(parent)?.parent; }
  }
  const edges = model.edges.filter(edge => view.edgeIds.includes(edge.id));
  edges.forEach(edge => keep.add(edge.id));
  return { ...model, nodes, groups: model.groups.filter(group => keep.has(group.id)), edges, views: [],
    steps: model.steps.filter(step => step.focus.every(id => keep.has(id))) };
}

/** All required checks must pass in addition to the source assessment. */
export function completionStatus(model: Architecture, evidence: ValidationEvidence) {
  const fidelity = fidelityStatus(model);
  if (fidelity.status === 'draft') return { status: 'draft' as const, reasons: fidelity.reasons };
  const reasons = Object.entries(evidence).filter(([, status]) => status !== 'pass').map(([check, status]) => `${check}: ${status}`);
  return { status: reasons.length ? 'unverified' as const : 'verified' as const, reasons };
}
