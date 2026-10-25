import { checkGeometry, segmentIntersects } from './geometry';
import { TOKENS as T } from './tokens';
import type { Architecture, CompositionCandidate, Geometry, Point, Route } from './types';

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
export function routeReadability(geometry: Geometry): { crossings: number; overlaps: number; labelObstructions: number; bends: number } {
  const all = geometry.edges.flatMap(segments);
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
      if (Math.abs(lineA - lineB) <= T.tolerance && hi - lo > T.tolerance) overlaps.add(`${ids}|${ah ? 'h' : 'v'}|${lineA}|${lo}|${hi}`);
    } else {
      const h = ah ? a : b, v = ah ? b : a;
      const x = v.a.x, y = h.a.y;
      if (x > Math.min(h.a.x, h.b.x) + T.tolerance && x < Math.max(h.a.x, h.b.x) - T.tolerance && y > Math.min(v.a.y, v.b.y) + T.tolerance && y < Math.max(v.a.y, v.b.y) - T.tolerance) crossings.add(`${ids}|${x}|${y}`);
    }
  }
  let labelObstructions = 0;
  for (const edge of geometry.edges) if (edge.label) {
    for (const other of geometry.edges) if (other.id !== edge.id && segments(other).some(segment => segmentIntersects(segment.a, segment.b, edge.label!))) labelObstructions++;
  }
  const bends = all.filter((segment, index) => index && all[index - 1].route.id === segment.route.id && (all[index - 1].a.x === all[index - 1].b.x) !== (segment.a.x === segment.b.x)).length;
  return { crossings: crossings.size, overlaps: overlaps.size, labelObstructions, bends };
}

/** assessComposition validates complete geometry before comparing fit and route readability at one reference canvas. */
export function assessComposition(model: Architecture, geometry: Geometry, id: string, mode: 'layered' | 'compact'): CompositionCandidate {
  const diagnostics = checkGeometry(model, geometry);
  const metrics = routeReadability(geometry), bounds = contentBounds(geometry);
  const fitScale = bounds.width && bounds.height ? Math.min(1152 / bounds.width, 540 / bounds.height, 1) : 1;
  const aspectRatio = bounds.height ? bounds.width / bounds.height : 1;
  const shapePenalty = Math.abs(Math.log(aspectRatio / (1152 / 540)));
  const clutter = metrics.crossings * .018 + metrics.overlaps * .025 + metrics.labelObstructions * .12 + metrics.bends * .0008;
  const score = fitScale / (1 + shapePenalty * .08 + clutter);
  return { id, mode, valid: diagnostics.length === 0, bounds: { width: bounds.width, height: bounds.height },
    fitScale, fittedNodeFont: T.bodyFont * fitScale, fittedLabelFont: T.labelFont * fitScale, aspectRatio,
    ...metrics, score, diagnostics };
}
