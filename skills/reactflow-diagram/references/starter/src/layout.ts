import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkNode, LayoutOptions as ElkLayoutOptions } from 'elkjs/lib/elk-api';
import type { Architecture, Measurements, Geometry, PlacedNode, Size, LayoutOptions, CompositionCandidate, RoutingWork } from './types';
import { TOKENS as T } from './tokens';
import { compactNodes } from './compact';
import { routeCompact } from './compact-routing';
import { assessComposition } from './composition';
import { assessFlow, flowNodes } from './flow-composition';
import { ROUTING_LIMITS, routingWork, sumWork } from './route-budget';

function measuredSize(values: Record<string, Size>, id: string): Size {
  const value = values[id];
  if (!value || !Number.isFinite(value.width) || !Number.isFinite(value.height) || value.width <= 0 || value.height <= 0) throw new Error(`Missing or invalid measurement: ${id}`);
  return value;
}

function failedCandidate(model: Architecture, id: string, mode: 'layered' | 'compact', error: unknown): CompositionCandidate {
  return { id, mode, valid: false, bounds: { width: 0, height: 0 },
    fitScale: 0, fittedNodeFont: 0, fittedLabelFont: 0, aspectRatio: 0, crossings: 0, overlaps: 0, labelObstructions: 0, bends: 0, score: 0,
    routeLength: 0, routeDetour: 0, maxDetourRatio: 1, routes: [], elapsedMs: 0, work: routingWork(),
    diagnostics: [{ check: 'composition', ids: [], message: error instanceof Error ? error.message : String(error) }],
    ...(model.flow ? { flow: assessFlow(model) } : {}) };
}

async function layeredLayout(model: Architecture, measurements: Measurements, work: RoutingWork): Promise<Geometry> {
  const vertical = model.direction === 'down';
  const options: ElkLayoutOptions = {
    'elk.algorithm': 'layered', 'elk.direction': vertical ? 'DOWN' : 'RIGHT',
    'elk.hierarchyHandling': 'INCLUDE_CHILDREN', 'elk.edgeRouting': 'ORTHOGONAL',
    'elk.json.edgeCoords': 'ROOT', 'elk.json.shapeCoords': 'PARENT',
    'elk.spacing.nodeNode': String(T.siblingGap),
    'elk.spacing.componentComponent': String(T.layerGap),
    'elk.layered.spacing.nodeNodeBetweenLayers': String(T.layerGap),
    'elk.spacing.edgeNode': String(Math.max(T.edgeClearance + 4, T.siblingGap / 2)),
    'elk.layered.spacing.edgeNodeBetweenLayers': String(Math.max(T.edgeClearance + 4, T.siblingGap / 2)),
    'elk.spacing.edgeLabel': '12', 'elk.spacing.labelNode': '12', 'elk.spacing.labelLabel': '12',
    'elk.randomSeed': '1',
    'elk.padding': `[top=${T.groupInset},left=${T.groupInset},bottom=${T.groupInset},right=${T.groupInset}]`,
  };
  const root: ElkNode = { id: '__root__', children: [], edges: [], layoutOptions: options };
  const entries = new Map<string, ElkNode>();
  const headers = new Map<string, number>();
  for (const group of [...model.groups].sort((a, b) => a.id.localeCompare(b.id))) {
    const header = measuredSize(measurements.headers, group.id);
    const headerHeight = header.height + T.headerGap;
    headers.set(group.id, headerHeight);
    const width = header.width + 2 * T.groupInset;
    const height = headerHeight + 2 * T.groupInset;
    entries.set(group.id, { id: group.id, width, height, children: [], layoutOptions: {
      ...options,
      'elk.padding': `[top=${T.groupInset + headerHeight + T.edgeClearance},left=${T.groupInset},bottom=${T.groupInset},right=${T.groupInset}]`,
      'elk.nodeSize.constraints': 'MINIMUM_SIZE', 'elk.nodeSize.minimum': `(${width},${height})`,
    } });
  }
  for (const node of [...model.nodes].sort((a, b) => a.id.localeCompare(b.id))) {
    const measured = measuredSize(measurements.nodes, node.id);
    const ports = [...model.edges].sort((a, b) => a.id.localeCompare(b.id)).flatMap(edge => [
      ...(edge.from === node.id ? [{ id: `${edge.id}:source`, width: T.portSize, height: T.portSize, layoutOptions: { 'elk.port.side': vertical ? 'SOUTH' : 'EAST' } }] : []),
      ...(edge.to === node.id ? [{ id: `${edge.id}:target`, width: T.portSize, height: T.portSize, layoutOptions: { 'elk.port.side': vertical ? 'NORTH' : 'WEST' } }] : []),
    ]);
    entries.set(node.id, { id: node.id, ...measured, layoutOptions: { 'elk.portConstraints': 'FIXED_SIDE' }, ports });
  }
  for (const value of [...model.groups, ...model.nodes].sort((a, b) => a.id.localeCompare(b.id))) {
    const parent = value.parent ? entries.get(value.parent)! : root;
    (parent.children ??= []).push(entries.get(value.id)!);
  }
  for (const edge of [...model.edges].sort((a, b) => a.id.localeCompare(b.id))) {
    root.edges!.push({ id: edge.id, sources: [`${edge.id}:source`], targets: [`${edge.id}:target`],
      labels: edge.label ? [{ id: `${edge.id}:label`, text: edge.label, ...measuredSize(measurements.labels, edge.id) }] : [] });
  }
  if (!root.children!.length) return { nodes: [], edges: [], bounds: { width: 0, height: 0 } };
  work.layeredCalls++;
  const result = await new ELK().layout(root);
  const nodes: PlacedNode[] = [];
  const kinds = new Map(model.nodes.map(node => [node.id, node.kind]));
  function visit(node: ElkNode, absX: number, absY: number, parent?: string) {
    for (const child of node.children ?? []) {
      const x = child.x ?? 0, y = child.y ?? 0;
      nodes.push({ id: child.id, kind: kinds.get(child.id) ?? 'group', parent,
        x, y, absX: absX + x, absY: absY + y,
        width: child.width ?? 0, height: child.height ?? 0, headerHeight: headers.get(child.id) ?? 0 });
      visit(child, absX + x, absY + y, child.id);
    }
  }
  visit(result, 0, 0);
  return routeCompact(model, nodes, measurements, work);
}

/** layout compares bounded complete compositions, retaining layered geometry as an explicit fallback. */
export async function layout(model: Architecture, measurements: Measurements, options: LayoutOptions = {}): Promise<Geometry> {
  const started = performance.now();
  const requested = options.composition ?? 'auto';
  if (model.flow && model.direction !== 'right') throw new Error(assessFlow(model)!.diagnostics[0].message);
  for (const node of model.nodes) measuredSize(measurements.nodes, node.id);
  for (const group of model.groups) measuredSize(measurements.headers, group.id);
  for (const edge of model.edges) if (edge.label) measuredSize(measurements.labels, edge.id);
  const candidates: { geometry?: Geometry; evidence: CompositionCandidate }[] = [];
  async function compute(id: string, mode: 'layered' | 'compact', run: (work: RoutingWork) => Geometry | Promise<Geometry>) {
    const begin = performance.now(), work = routingWork();
    let candidate: typeof candidates[number];
    try {
      const geometry = await run(work);
      candidate = { geometry, evidence: assessComposition(model, geometry, id, mode) };
    } catch (error) { candidate = { evidence: failedCandidate(model, id, mode, error) }; }
    candidate.evidence.work = work; candidate.evidence.elapsedMs = performance.now() - begin;
    candidates.push(candidate);
    return candidate;
  }
  if (requested !== 'compact') await compute('layered', 'layered', work => layeredLayout(model, measurements, work));
  const compactPlans = requested === 'layered' ? [] : requested === 'compact'
    ? [[model.flow ? 'compact-flow' : 'compact-balanced', 1.65] as const]
    : [['compact-balanced', 1.65] as const, [model.flow ? 'compact-flow' : 'compact-wide', 2.5] as const];
  const placements = new Map<string, { id: string; geometry: Geometry }>();
  for (const [id, aspect] of compactPlans) {
    let duplicateOf: string | undefined;
    const candidate = await compute(id, 'compact', work => {
      work.compactPlacements++;
      const nodes = id === 'compact-flow' ? flowNodes(model, measurements) : compactNodes(model, measurements, aspect);
      const signature = JSON.stringify(nodes), previous = placements.get(signature);
      if (previous) { duplicateOf = previous.id; return previous.geometry; }
      const geometry = routeCompact(model, nodes, measurements, work);
      placements.set(signature, { id, geometry });
      return geometry;
    });
    if (duplicateOf) candidate.evidence.duplicateOf = duplicateOf;
  }
  const best = candidates.filter(candidate => candidate.evidence.valid && candidate.geometry).sort((a, b) => b.evidence.score - a.evidence.score || a.evidence.id.localeCompare(b.evidence.id));
  const available = candidates.filter(candidate => candidate.geometry);
  if (!available.length) throw new Error(`No composition could be computed: ${candidates.flatMap(candidate => candidate.evidence.diagnostics.map(diagnostic => `${candidate.evidence.id}: ${diagnostic.message}`)).join('; ')}`);
  const layered = candidates.find(candidate => candidate.evidence.mode === 'layered');
  let selected = layered?.geometry ? layered : best[0] ?? available[0];
  let reason = `The requested ${requested} arrangement ${selected.evidence.valid ? 'passed geometry checks.' : 'has unresolved geometry diagnostics.'}`;
  if (requested === 'auto') {
    const hasLabels = model.edges.some(edge => edge.label);
    const readable = (candidate: CompositionCandidate) => candidate.fittedNodeFont >= T.minFittedNodeFont && (!hasLabels || candidate.fittedLabelFont >= T.minFittedLabelFont);
    const belowTargets = layered && !readable(layered.evidence);
    reason = layered?.geometry ? 'The validated layered arrangement retains the flow.' : 'The layered engine failed; selected an available complete alternative.';
    const compact = best.find(candidate => candidate.evidence.mode === 'compact' && belowTargets && readable(candidate.evidence))
      ?? best.find(candidate => candidate.evidence.mode === 'compact');
    const restoresReadability = belowTargets && compact && readable(compact.evidence);
    const elongated = layered && (layered.evidence.aspectRatio > 4 || layered.evidence.aspectRatio < 1);
    const smallRibbonGain = compact && layered && elongated && compact.evidence.fitScale >= layered.evidence.fitScale * 1.5;
    const needsCompaction = belowTargets || model.nodes.length > 8 || layered && layered.evidence.fitScale < .25 || smallRibbonGain;
    if (compact && (!layered?.evidence.valid || restoresReadability || needsCompaction && compact.evidence.fitScale >= layered.evidence.fitScale * 1.15 && compact.evidence.score > layered.evidence.score * 1.05)) {
      selected = compact; reason = restoresReadability
        ? 'Compact packing meets the fitted presentation text targets while preserving complete routes, groups and measured labels.'
        : 'Compact packing improves fitted readability while preserving complete routes, groups and measured labels.';
    } else if (!selected.evidence.valid && best.length) {
      selected = best[0]; reason = 'The layered arrangement failed geometry checks; selected a validated complete alternative.';
    }
    if (selected.evidence.valid && !readable(selected.evidence)) reason += ' Fitted text remains below the default presentation targets.';
    if (model.flow) {
      const satisfying = best.filter(candidate => candidate.evidence.flow?.status === 'satisfied');
      const preferred = satisfying.find(candidate => readable(candidate.evidence)) ?? satisfying[0];
      if (preferred) {
        selected = preferred;
        reason = 'The selected arrangement satisfies the declared unwrapped request spine and supporting-content side.';
        if (!readable(selected.evidence)) reason += ' Fitted text remains below the default presentation targets.';
      }
    }
  }
  if (!selected.evidence.valid) reason = best.length ? 'The requested arrangement has unresolved geometry checks; valid alternatives are recorded.' : 'No candidate passed every geometry check; retain these diagnostics for visual repair.';
  if (model.flow && selected.evidence.flow?.status !== 'satisfied') reason = `Declared flow intent remains unsatisfied. The selected complete arrangement ${selected.evidence.valid ? 'passed geometry checks' : 'has unresolved geometry diagnostics'}. Geometry validity alone does not establish the requested composition.`;
  return { ...selected.geometry!, composition: { requested, selected: selected.evidence.mode, candidate: selected.evidence.id,
    candidates: candidates.map(candidate => candidate.evidence), reason, ...(model.flow ? { flow: selected.evidence.flow } : {}),
    execution: { elapsedMs: performance.now() - started, limits: ROUTING_LIMITS, work: sumWork(candidates.map(candidate => candidate.evidence.work)) } } };
}
