import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkNode, ElkExtendedEdge, LayoutOptions } from 'elkjs/lib/elk-api';
import type { Architecture, Measurements, Geometry, PlacedNode, Route, Size } from './types';
import { TOKENS as T } from './tokens';
import { avoidHeaders } from './routing';

/** Convert measured architecture content into a compound ELK graph and normalized geometry. */
export async function layout(model: Architecture, measurements: Measurements): Promise<Geometry> {
  const size = (values: Record<string, Size>, id: string): Size => {
    const value = values[id];
    if (!value || !Number.isFinite(value.width) || !Number.isFinite(value.height) || value.width <= 0 || value.height <= 0) throw new Error(`Missing or invalid measurement: ${id}`);
    return value;
  };
  const vertical = model.direction === 'down';
  const options: LayoutOptions = {
    'elk.algorithm': 'layered', 'elk.direction': vertical ? 'DOWN' : 'RIGHT',
    'elk.hierarchyHandling': 'INCLUDE_CHILDREN', 'elk.edgeRouting': 'ORTHOGONAL',
    'elk.json.edgeCoords': 'ROOT', 'elk.json.shapeCoords': 'PARENT',
    'elk.spacing.nodeNode': String(T.siblingGap),
    'elk.spacing.componentComponent': String(T.layerGap),
    'elk.layered.spacing.nodeNodeBetweenLayers': String(T.layerGap),
    'elk.spacing.edgeNode': String(T.edgeClearance + 4),
    'elk.layered.spacing.edgeNodeBetweenLayers': String(T.edgeClearance + 4),
    'elk.spacing.edgeLabel': '12', 'elk.spacing.labelNode': '12', 'elk.spacing.labelLabel': '12',
    'elk.randomSeed': '1',
    'elk.padding': `[top=${T.groupInset},left=${T.groupInset},bottom=${T.groupInset},right=${T.groupInset}]`,
  };
  const root: ElkNode = { id: '__root__', children: [], edges: [], layoutOptions: options };
  const entries = new Map<string, ElkNode>();
  const headers = new Map<string, number>();
  for (const group of [...model.groups].sort((a, b) => a.id.localeCompare(b.id))) {
    const header = size(measurements.headers, group.id);
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
    const measured = size(measurements.nodes, node.id);
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
      labels: edge.label ? [{ id: `${edge.id}:label`, text: edge.label, ...size(measurements.labels, edge.id) }] : [] });
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
  const edges: Route[] = model.edges.map(edge => {
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
