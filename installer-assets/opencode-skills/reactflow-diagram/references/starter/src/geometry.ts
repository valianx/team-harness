import type { Architecture, Diagnostic, Geometry, PlacedNode, Point } from './types';
import { TOKENS as T } from './tokens';

type Rect = { x: number; y: number; width: number; height: number };
const rect = (node: PlacedNode): Rect => ({ x: node.absX, y: node.absY, width: node.width, height: node.height });
const overlap = (a: Rect, b: Rect) => a.x < b.x + b.width - T.tolerance && a.x + a.width > b.x + T.tolerance && a.y < b.y + b.height - T.tolerance && a.y + a.height > b.y + T.tolerance;
const gap = (a: number, lengthA: number, b: number, lengthB: number) => Math.max(b - a - lengthA, a - b - lengthB);

/** Clip a complete route segment against an obstacle, including intermediate points. */
export function segmentIntersects(a: Point, b: Point, box: Rect, clearance = 0): boolean {
  const minX = box.x - clearance + T.tolerance, maxX = box.x + box.width + clearance - T.tolerance;
  const minY = box.y - clearance + T.tolerance, maxY = box.y + box.height + clearance - T.tolerance;
  let low = 0, high = 1;
  for (const [start, delta, min, max] of [[a.x, b.x - a.x, minX, maxX], [a.y, b.y - a.y, minY, maxY]]) {
    if (Math.abs(delta) < 1e-9) { if (start < min || start > max) return false; }
    else {
      const t0 = (min - start) / delta, t1 = (max - start) / delta;
      low = Math.max(low, Math.min(t0, t1)); high = Math.min(high, Math.max(t0, t1));
      if (low > high) return false;
    }
  }
  return true;
}

/** Validate root-space geometry without treating intended ancestor containment as overlap. */
export function checkGeometry(model: Architecture, geometry: Geometry): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const fail = (check: string, ids: string[], message: string) => diagnostics.push({ check, ids, message });
  const expectedNodes = new Map([...model.nodes, ...model.groups].map(node => [node.id, node]));
  const placedIds = new Set<string>();
  for (const node of geometry.nodes) {
    if (!expectedNodes.has(node.id) || placedIds.has(node.id)) fail('identity', [node.id], 'Unknown or duplicate placed element');
    if (expectedNodes.get(node.id)?.parent !== node.parent) fail('containment', [node.id], 'Placed parent differs from the semantic model');
    placedIds.add(node.id);
  }
  for (const id of expectedNodes.keys()) if (!placedIds.has(id)) fail('identity', [id], 'Missing placed element');
  const outside = (x: number, y: number) => x < -T.tolerance || y < -T.tolerance || x > geometry.bounds.width + T.tolerance || y > geometry.bounds.height + T.tolerance;
  if (![geometry.bounds.width, geometry.bounds.height].every(value => Number.isFinite(value) && value >= 0)) fail('dimensions', [], 'Invalid diagram bounds');
  const nodes = new Map(geometry.nodes.map(node => [node.id, node]));
  const ancestor = (childId: string, parentId: string): boolean => {
    const seen = new Set<string>();
    let child = nodes.get(childId);
    while (child?.parent && !seen.has(child.parent)) {
      if (child.parent === parentId) return true;
      seen.add(child.parent); child = nodes.get(child.parent);
    }
    return false;
  };
  const header = (node: PlacedNode): Rect => ({ ...rect(node), height: T.groupInset + node.headerHeight });
  for (const node of geometry.nodes) {
    if (![node.x, node.y, node.absX, node.absY, node.width, node.height].every(Number.isFinite) || node.width <= 0 || node.height <= 0) fail('dimensions', [node.id], 'Nonfinite or empty bounds');
    if (outside(node.absX, node.absY) || outside(node.absX + node.width, node.absY + node.height)) fail('clipping', [node.id], 'Element is outside diagram bounds');
    if (node.kind === 'group' && (node.width < T.nodeWidth + 2 * T.groupInset - T.tolerance || node.height < node.headerHeight + 2 * T.groupInset - T.tolerance)) fail('group-minimum', [node.id], 'Group is smaller than measured header/inset minimum');
    if (!node.parent && (Math.abs(node.x - node.absX) > T.tolerance || Math.abs(node.y - node.absY) > T.tolerance)) fail('coordinates', [node.id], 'Root coordinate mismatch');
    if (node.parent) {
      const parent = nodes.get(node.parent);
      if (!parent) { fail('containment', [node.id, node.parent], 'Missing parent bounds'); continue; }
      if (node.x < T.groupInset - T.tolerance || node.y < T.groupInset + parent.headerHeight - T.tolerance || node.x + node.width > parent.width - T.groupInset + T.tolerance || node.y + node.height > parent.height - T.groupInset + T.tolerance) fail('containment', [node.id, parent.id], 'Child violates inset or reserved header');
      if (Math.abs(node.absX - parent.absX - node.x) > T.tolerance || Math.abs(node.absY - parent.absY - node.y) > T.tolerance) fail('coordinates', [node.id, parent.id], 'Parent/root coordinate mismatch');
    }
  }
  for (let i = 0; i < geometry.nodes.length; i++) for (let j = i + 1; j < geometry.nodes.length; j++) {
    const a = geometry.nodes[i], b = geometry.nodes[j];
    if (ancestor(a.id, b.id) || ancestor(b.id, a.id)) continue;
    if (overlap(rect(a), rect(b))) fail('overlap', [a.id, b.id], 'Unrelated rectangles overlap');
    if (a.parent !== b.parent) continue;
    const dx = gap(a.absX, a.width, b.absX, b.width), dy = gap(a.absY, a.height, b.absY, b.height);
    if (Math.max(dx, dy) < T.siblingGap - T.tolerance) fail('spacing', [a.id, b.id], 'Sibling clearance below token');
    const main = model.direction === 'right' ? dx : dy;
    const cross = model.direction === 'right' ? dy : dx;
    if (main >= 0 && cross < -T.tolerance && main < T.layerGap - T.tolerance) fail('layer-spacing', [a.id, b.id], 'Flow-layer clearance below token');
  }
  const byEdge = new Map(model.edges.map(edge => [edge.id, edge]));
  const routeIds = new Set(geometry.edges.map(edge => edge.id));
  const seenRoutes = new Set<string>();
  for (const edge of model.edges) if (!routeIds.has(edge.id)) fail('route', [edge.id], 'Missing computed route');
  for (const route of geometry.edges) {
    if (seenRoutes.has(route.id)) fail('identity', [route.id], 'Duplicate relationship route');
    seenRoutes.add(route.id);
    const edge = byEdge.get(route.id);
    if (!edge) { fail('route', [route.id], 'Unknown relationship route'); continue; }
    if (!route.sections.length || route.sections.some(section => section.points.length < 2)) fail('route', [route.id], 'Empty or incomplete route sections');
    for (let i = 1; i < route.sections.length; i++) {
      const previous = route.sections[i - 1].points.at(-1), next = route.sections[i].points[0];
      if (previous && next && Math.hypot(previous.x - next.x, previous.y - next.y) > T.tolerance) fail('route', [route.id], 'Disconnected route sections');
    }
    const first = route.sections[0]?.points[0], last = route.sections.at(-1)?.points.at(-1);
    if (!first || !last || Math.hypot(first.x - route.sourcePort.x, first.y - route.sourcePort.y) > T.tolerance || Math.hypot(last.x - route.targetPort.x, last.y - route.targetPort.y) > T.tolerance) fail('port', [route.id], 'Route is disconnected from its port');
    const segments = route.sections.flatMap(section => section.points.slice(1).map((point, i) => [section.points[i], point]));
    for (const [index, [a, b]] of segments.entries()) {
      if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) { fail('route', [route.id], 'Nonfinite route point'); continue; }
      if (outside(a.x, a.y) || outside(b.x, b.y)) fail('clipping', [route.id], 'Route is outside diagram bounds');
      for (const node of geometry.nodes) {
        const endpointContact = (node.id === edge.from && index === 0) || (node.id === edge.to && index === segments.length - 1);
        const intendedAncestor = node.kind === 'group' && (ancestor(edge.from, node.id) || ancestor(edge.to, node.id));
        const obstacle = intendedAncestor ? header(node) : rect(node);
        if (segmentIntersects(a, b, obstacle, intendedAncestor || endpointContact ? 0 : T.edgeClearance)) fail('route-collision', [route.id, node.id], 'Route crosses a body or reserved header');
      }
    }
    for (const [nodeId, point] of [[edge.from, route.sourcePort], [edge.to, route.targetPort]] as const) {
      const node = nodes.get(nodeId);
      if (!node || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < node.absX - T.portSize - T.tolerance || point.x > node.absX + node.width + T.portSize + T.tolerance || point.y < node.absY - T.portSize - T.tolerance || point.y > node.absY + node.height + T.portSize + T.tolerance) fail('port', [route.id, nodeId], 'Route port is detached from endpoint');
      else if (point.x > node.absX + T.tolerance && point.x < node.absX + node.width - T.tolerance && point.y > node.absY + T.tolerance && point.y < node.absY + node.height - T.tolerance) fail('port', [route.id, nodeId], 'Port is inside endpoint body');
    }
    if (edge.label && !route.label) fail('label', [route.id], 'Missing measured relationship label');
    if (route.label) {
      const label = route.label;
      if (![label.x, label.y, label.width, label.height].every(Number.isFinite) || label.width <= 0 || label.height <= 0) fail('label', [route.id], 'Invalid label bounds');
      if (label.x < -T.tolerance || label.y < -T.tolerance || label.x + label.width > geometry.bounds.width + T.tolerance || label.y + label.height > geometry.bounds.height + T.tolerance) fail('label', [route.id], 'Label is clipped by diagram bounds');
      for (const node of geometry.nodes) if (overlap(label, node.kind === 'group' && (ancestor(edge.from, node.id) || ancestor(edge.to, node.id)) ? header(node) : rect(node))) fail('label-collision', [route.id, node.id], 'Label obscures a component or header');
      for (const other of geometry.edges) if (other.id !== route.id && other.label && overlap(label, other.label)) fail('label-overlap', [route.id, other.id], 'Relationship labels overlap');
    }
  }
  return diagnostics;
}
