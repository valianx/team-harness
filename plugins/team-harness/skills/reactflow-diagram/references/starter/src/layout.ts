import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkNode, ElkExtendedEdge, LayoutOptions as ElkLayoutOptions } from 'elkjs/lib/elk-api';
import type { Architecture, Measurements, Geometry, PlacedNode, Route, Size, LayoutOptions, CompositionCandidate } from './types';
import { TOKENS as T } from './tokens';
import { avoidHeaders } from './routing';
import { compactNodes } from './compact';
import { routeCompact } from './compact-routing';
import { assessComposition } from './composition';

function measuredSize(values: Record<string, Size>, id: string): Size {
  const value = values[id];
  if (!value || !Number.isFinite(value.width) || !Number.isFinite(value.height) || value.width <= 0 || value.height <= 0) throw new Error(`Missing or invalid measurement: ${id}`);
  return value;
}

function failedCandidate(id: string, mode: 'layered' | 'compact', error: unknown): CompositionCandidate {
  return { id, mode, valid: false, bounds: { width: 0, height: 0 },
    fitScale: 0, fittedNodeFont: 0, fittedLabelFont: 0, aspectRatio: 0, crossings: 0, overlaps: 0, labelObstructions: 0, bends: 0, score: 0,
    diagnostics: [{ check: 'composition', ids: [], message: error instanceof Error ? error.message : String(error) }] };
}

async function layeredLayout(model: Architecture, measurements: Measurements): Promise<Geometry> {
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
    entries.set(node.id, { id: node.id, ...measured, layoutOptions: { 'elk.portConstraints': 'FIXED_SIDE' }, ports: [
      { id: `${node.id}:in`, width: T.portSize, height: T.portSize, layoutOptions: { 'elk.port.side': vertical ? 'NORTH' : 'WEST' } },
      { id: `${node.id}:out`, width: T.portSize, height: T.portSize, layoutOptions: { 'elk.port.side': vertical ? 'SOUTH' : 'EAST' } },
    ] });
  }
  for (const value of [...model.groups, ...model.nodes].sort((a, b) => a.id.localeCompare(b.id))) {
    const parent = value.parent ? entries.get(value.parent)! : root;
    (parent.children ??= []).push(entries.get(value.id)!);
  }
  for (const edge of [...model.edges].sort((a, b) => a.id.localeCompare(b.id))) {
    root.edges!.push({ id: edge.id, sources: [`${edge.from}:out`], targets: [`${edge.to}:in`],
      labels: edge.label ? [{ id: `${edge.id}:label`, text: edge.label, ...measuredSize(measurements.labels, edge.id) }] : [] });
  }
  if (!root.children!.length) return { nodes: [], edges: [], bounds: { width: 0, height: 0 } };
  const result = await new ELK().layout(root);
  const nodes: PlacedNode[] = [];
  const routes = new Map<string, ElkExtendedEdge>();
  const kinds = new Map(model.nodes.map(node => [node.id, node.kind]));
  function visit(node: ElkNode, absX: number, absY: number, parent?: string) {
    for (const child of node.children ?? []) {
      const x = child.x ?? 0, y = child.y ?? 0;
      nodes.push({ id: child.id, kind: kinds.get(child.id) ?? 'group', parent,
        x, y, absX: absX + x, absY: absY + y,
        width: child.width ?? 0, height: child.height ?? 0, headerHeight: headers.get(child.id) ?? 0 });
      visit(child, absX + x, absY + y, child.id);
    }
    for (const edge of node.edges ?? []) routes.set(edge.id, edge);
  }
  visit(result, 0, 0);
  const edges: Route[] = [...model.edges].sort((a, b) => a.id.localeCompare(b.id)).map(edge => {
    const routed = routes.get(edge.id);
    if (!routed?.sections?.length) throw new Error(`No route sections for ${edge.id}`);
    const sections = routed.sections.map(section => ({ points: [section.startPoint, ...(section.bendPoints ?? []), section.endPoint] }));
    const label = routed.labels?.[0];
    return { id: edge.id, sections,
      sourcePort: sections[0].points[0], targetPort: sections[sections.length - 1].points.at(-1)!,
      label: label ? { x: label.x!, y: label.y!, width: label.width!, height: label.height!, text: edge.label! } : undefined };
  });
  return avoidHeaders({ nodes, edges, bounds: { width: result.width ?? 0, height: result.height ?? 0 } }, model.edges);
}

/** layout compares bounded complete compositions, retaining layered geometry as an explicit fallback. */
export async function layout(model: Architecture, measurements: Measurements, options: LayoutOptions = {}): Promise<Geometry> {
  const requested = options.composition ?? 'auto';
  for (const node of model.nodes) measuredSize(measurements.nodes, node.id);
  for (const group of model.groups) measuredSize(measurements.headers, group.id);
  for (const edge of model.edges) if (edge.label) measuredSize(measurements.labels, edge.id);
  const candidates: { geometry?: Geometry; evidence: CompositionCandidate }[] = [];
  try {
    const geometry = await layeredLayout(model, measurements);
    candidates.push({ geometry, evidence: assessComposition(model, geometry, 'layered', 'layered') });
  } catch (error) { candidates.push({ evidence: failedCandidate('layered', 'layered', error) }); }
  const placements = new Set<string>();
  for (const [id, aspect] of [['compact-balanced', 1.65], ['compact-wide', 2.5]] as const) {
    try {
      const nodes = compactNodes(model, measurements, aspect), signature = JSON.stringify(nodes);
      if (placements.has(signature)) continue;
      placements.add(signature);
      const geometry = routeCompact(model, nodes, measurements);
      candidates.push({ geometry, evidence: assessComposition(model, geometry, id, 'compact') });
    } catch (error) {
      candidates.push({ evidence: failedCandidate(id, 'compact', error) });
    }
  }
  const best = candidates.filter(candidate => candidate.evidence.valid && candidate.geometry).sort((a, b) => b.evidence.score - a.evidence.score || a.evidence.id.localeCompare(b.evidence.id));
  const available = candidates.filter(candidate => candidate.geometry);
  if (!available.length) throw new Error(`No composition could be computed: ${candidates.flatMap(candidate => candidate.evidence.diagnostics.map(diagnostic => `${candidate.evidence.id}: ${diagnostic.message}`)).join('; ')}`);
  const layered = candidates[0];
  let selected = layered.geometry ? layered : best[0] ?? available[0];
  let reason = layered.geometry ? 'The validated layered arrangement retains a clear short flow.' : 'The layered engine failed; selected an available complete alternative.';
  if (requested === 'compact') {
    selected = best.find(candidate => candidate.evidence.mode === 'compact') ?? best[0] ?? available[0];
    reason = selected.evidence.mode === 'compact' ? 'The requested compact arrangement passed complete geometry and label checks.' : 'Compact candidates were rejected; using the validated layered fallback.';
  } else if (requested === 'auto') {
    const compact = best.find(candidate => candidate.evidence.mode === 'compact');
    const elongated = layered.evidence.aspectRatio > 4 || layered.evidence.aspectRatio < 1;
    const smallRibbonGain = compact && elongated && compact.evidence.fitScale >= layered.evidence.fitScale * 1.5;
    const needsCompaction = model.nodes.length > 8 || layered.evidence.fitScale < .25 || smallRibbonGain;
    if (compact && (!layered.evidence.valid || needsCompaction && compact.evidence.fitScale >= layered.evidence.fitScale * 1.15 && compact.evidence.score > layered.evidence.score * 1.05)) {
      selected = compact; reason = 'Compact packing improves fitted readability while preserving complete routes, groups and measured labels.';
    } else if (!selected.evidence.valid && best.length) {
      selected = best[0]; reason = 'The layered arrangement failed geometry checks; selected a validated complete alternative.';
    }
  } else reason = layered.geometry ? selected.evidence.valid ? 'The requested layered arrangement passed geometry checks.' : 'The requested layered arrangement has unresolved geometry diagnostics.' : 'The requested layered engine failed; using a complete alternative.';
  if (!selected.evidence.valid) reason = best.length ? 'The requested arrangement has unresolved geometry checks; valid alternatives are recorded.' : 'No candidate passed every geometry check; retain these diagnostics for visual repair.';
  return { ...selected.geometry!, composition: { requested, selected: selected.evidence.mode, candidate: selected.evidence.id,
    candidates: candidates.map(candidate => candidate.evidence), reason } };
}
