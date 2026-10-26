import { checkGeometry, segmentIntersects } from './geometry';
import { TOKENS as T } from './tokens';
import { routingWork } from './route-budget';
import { assessFlow } from './flow-composition';
import type { Architecture, CompositionCandidate, Geometry, Point, Route, RouteMetric } from './types';

type Rect = Point & { width: number; height: number };
type Segment = { a: Point; b: Point; route: Route; index: number; last: number };
const same = (a: Point, b: Point) => Math.abs(a.x - b.x) <= T.tolerance && Math.abs(a.y - b.y) <= T.tolerance;
const segments = (route: Route): Segment[] => {
  const values = route.sections.flatMap(section => section.points.slice(1).map((b, i) => ({ a: section.points[i], b })));
  return values.map((value, index) => ({ ...value, route, index, last: values.length - 1 }));
};

/** contentBounds covers rendered nodes, every route point and every relationship label. */
export function contentBounds(geometry: Geometry): Rect {
  const points = geometry.nodes.flatMap(node => [{ x: node.absX, y: node.absY }, { x: node.absX + node.width, y: node.absY + node.height }]);
  for (const edge of geometry.edges) {
    points.push(...edge.sections.flatMap(section => section.points));
    if (edge.label) points.push(edge.label, { x: edge.label.x + edge.label.width, y: edge.label.y + edge.label.height });
  }
  if (!points.length) return { x: 0, y: 0, width: 0, height: 0 };
  const x = Math.min(...points.map(point => point.x)), y = Math.min(...points.map(point => point.y));
  return { x, y, width: Math.max(...points.map(point => point.x)) - x, height: Math.max(...points.map(point => point.y)) - y };
}

/** routeReadability reports crossings and label obstruction separately from body/header validity. */
export function routeReadability(geometry: Geometry): { crossings: number; overlaps: number; labelObstructions: number; bends: number; routeLength: number; routeDetour: number; maxDetourRatio: number; routes: RouteMetric[] } {
  const all = geometry.edges.flatMap(segments);
  const related = new Map(geometry.edges.map(route => [route.id, { crossings: new Set<string>(), shared: new Set<string>(), labels: new Set<string>() }]));
  const crossings = new Set<string>(), overlaps = new Set<string>();
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = all[i], b = all[j];
    if (a.route.id === b.route.id) continue;
    const sharedSource = a.index === 0 && b.index === 0 && same(a.route.sourcePort, b.route.sourcePort);
    const sharedTarget = a.index === a.last && b.index === b.last && same(a.route.targetPort, b.route.targetPort);
    if (sharedSource || sharedTarget) continue;
    const ah = Math.abs(a.a.y - a.b.y) <= T.tolerance, bh = Math.abs(b.a.y - b.b.y) <= T.tolerance;
    const ids = [a.route.id, b.route.id].sort().join('|');
    if (ah === bh) {
      const lineA = ah ? a.a.y : a.a.x, lineB = bh ? b.a.y : b.a.x;
      const lo = Math.max(Math.min(ah ? a.a.x : a.a.y, ah ? a.b.x : a.b.y), Math.min(bh ? b.a.x : b.a.y, bh ? b.b.x : b.b.y));
      const hi = Math.min(Math.max(ah ? a.a.x : a.a.y, ah ? a.b.x : a.b.y), Math.max(bh ? b.a.x : b.a.y, bh ? b.b.x : b.b.y));
      if (Math.abs(lineA - lineB) <= T.tolerance && hi - lo > T.tolerance) {
        overlaps.add(`${ids}|${ah ? 'h' : 'v'}|${lineA}|${lo}|${hi}`);
        related.get(a.route.id)!.shared.add(b.route.id); related.get(b.route.id)!.shared.add(a.route.id);
      }
    } else {
      const h = ah ? a : b, v = ah ? b : a;
      const x = v.a.x, y = h.a.y;
      if (x > Math.min(h.a.x, h.b.x) + T.tolerance && x < Math.max(h.a.x, h.b.x) - T.tolerance && y > Math.min(v.a.y, v.b.y) + T.tolerance && y < Math.max(v.a.y, v.b.y) - T.tolerance) {
        crossings.add(`${ids}|${x}|${y}`);
        related.get(a.route.id)!.crossings.add(b.route.id); related.get(b.route.id)!.crossings.add(a.route.id);
      }
    }
  }
  let labelObstructions = 0;
  for (const edge of geometry.edges) if (edge.label) {
    for (const other of geometry.edges) if (other.id !== edge.id && segments(other).some(segment => segmentIntersects(segment.a, segment.b, edge.label!))) {
      labelObstructions++; related.get(other.id)!.labels.add(edge.id);
    }
  }
  const routes = geometry.edges.map(route => {
    const values = segments(route), neighbors = related.get(route.id)!;
    const length = values.reduce((sum, { a, b }) => sum + Math.abs(a.x - b.x) + Math.abs(a.y - b.y), 0);
    const directLength = Math.abs(route.sourcePort.x - route.targetPort.x) + Math.abs(route.sourcePort.y - route.targetPort.y);
    return { id: route.id, length, directLength, detour: Math.max(0, length - directLength), detourRatio: directLength > T.tolerance ? length / directLength : length ? Infinity : 1,
      bends: values.filter((segment, index) => index && (values[index - 1].a.x === values[index - 1].b.x) !== (segment.a.x === segment.b.x)).length,
      crossingIds: [...neighbors.crossings].sort(), sharedSegmentIds: [...neighbors.shared].sort(), obstructedLabelIds: [...neighbors.labels].sort() };
  });
  return { crossings: crossings.size, overlaps: overlaps.size, labelObstructions, bends: routes.reduce((sum, route) => sum + route.bends, 0),
    routeLength: routes.reduce((sum, route) => sum + route.length, 0), routeDetour: routes.reduce((sum, route) => sum + route.detour, 0), maxDetourRatio: Math.max(1, ...routes.map(route => route.detourRatio)), routes };
}

/** assessComposition validates complete geometry before comparing fit and route readability at one reference canvas. */
export function assessComposition(model: Architecture, geometry: Geometry, id: string, mode: 'layered' | 'compact'): CompositionCandidate {
  const diagnostics = checkGeometry(model, geometry);
  const metrics = routeReadability(geometry), bounds = contentBounds(geometry);
  const fitScale = bounds.width && bounds.height ? Math.min(1152 / bounds.width, 648 / bounds.height, 1) : 1;
  const aspectRatio = bounds.height ? bounds.width / bounds.height : 1;
  const shapePenalty = Math.abs(Math.log(aspectRatio / (1152 / 648)));
  const detourPenalty = metrics.routeLength ? metrics.routeDetour / metrics.routeLength * .08 : 0;
  const clutter = metrics.crossings * .018 + metrics.overlaps * .025 + metrics.labelObstructions * .12 + metrics.bends * .0008 + detourPenalty;
  const score = fitScale / (1 + shapePenalty * .08 + clutter);
  return { id, mode, valid: diagnostics.length === 0, bounds: { width: bounds.width, height: bounds.height },
    fitScale, fittedNodeFont: T.bodyFont * fitScale, fittedLabelFont: T.labelFont * fitScale, aspectRatio,
    ...metrics, score, diagnostics, elapsedMs: 0, work: geometry.routing?.work ?? routingWork(), ...(model.flow ? { flow: assessFlow(model, geometry) } : {}) };
}
