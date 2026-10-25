import { segmentIntersects } from './geometry';
import { TOKENS as T } from './tokens';
import type { Architecture, Geometry, Measurements, PlacedNode, Point, Relationship, Route, Size } from './types';

type Rect = Point & Size;
type Obstacle = Rect & { clearance: number };
type Segment = { a: Point; b: Point };
type Pending = { state: number; cost: number; estimate: number };
const equal = (a: Point, b: Point) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;
const length = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const overlap = (a: Rect, b: Rect, gap = 0) => a.x < b.x + b.width + gap - T.tolerance && a.x + a.width > b.x - gap + T.tolerance && a.y < b.y + b.height + gap - T.tolerance && a.y + a.height > b.y - gap + T.tolerance;
const segments = (points: Point[]): Segment[] => points.slice(1).map((b, i) => ({ a: points[i], b }));

function simplify(points: Point[]): Point[] {
  const distinct = points.filter((point, i) => !i || !equal(point, points[i - 1]));
  return distinct.filter((point, i) => !i || i === distinct.length - 1 || !((distinct[i - 1].x === point.x && point.x === distinct[i + 1].x) || (distinct[i - 1].y === point.y && point.y === distinct[i + 1].y)));
}

class MinHeap {
  values: Pending[] = [];
  push(value: Pending) {
    let index = this.values.length;
    this.values.push(value);
    while (index) {
      const parent = (index - 1) >> 1;
      if (this.values[parent].estimate <= value.estimate) break;
      this.values[index] = this.values[parent]; index = parent;
    }
    this.values[index] = value;
  }
  pop(): Pending | undefined {
    const first = this.values[0], last = this.values.pop();
    if (!this.values.length || !last) return first;
    let index = 0;
    while (index * 2 + 1 < this.values.length) {
      let child = index * 2 + 1;
      if (child + 1 < this.values.length && this.values[child + 1].estimate < this.values[child].estimate) child++;
      if (this.values[child].estimate >= last.estimate) break;
      this.values[index] = this.values[child]; index = child;
    }
    this.values[index] = last;
    return first;
  }
}

function occupancy(a: Point, b: Point, occupied: Segment[]): number {
  const horizontal = a.y === b.y;
  let penalty = 0;
  for (const other of occupied) {
    const parallel = (other.a.y === other.b.y) === horizontal;
    if (parallel) {
      const distance = Math.abs((horizontal ? a.y : a.x) - (horizontal ? other.a.y : other.a.x));
      if (distance > 10) continue;
      const shared = Math.min(Math.max(horizontal ? a.x : a.y, horizontal ? b.x : b.y), Math.max(horizontal ? other.a.x : other.a.y, horizontal ? other.b.x : other.b.y)) - Math.max(Math.min(horizontal ? a.x : a.y, horizontal ? b.x : b.y), Math.min(horizontal ? other.a.x : other.a.y, horizontal ? other.b.x : other.b.y));
      if (shared > T.tolerance) penalty += distance < T.tolerance ? shared * 8 + 80 : shared * .15;
    } else {
      const h = horizontal ? { a, b } : other, v = horizontal ? other : { a, b };
      if (v.a.x >= Math.min(h.a.x, h.b.x) - T.tolerance && v.a.x <= Math.max(h.a.x, h.b.x) + T.tolerance && h.a.y >= Math.min(v.a.y, v.b.y) - T.tolerance && h.a.y <= Math.max(v.a.y, v.b.y) + T.tolerance) penalty += 160;
    }
  }
  return penalty;
}

function path(start: Point, end: Point, obstacles: Obstacle[], occupied: Segment[], ports: Point[], bounds: Size): Point[] {
  if (equal(start, end)) return [start];
  const margin = 12;
  const axes = (axis: 'x' | 'y') => {
    const size = axis === 'x' ? 'width' : 'height';
    const values = [0, bounds[size], start[axis], end[axis], ...ports.map(point => point[axis])];
    for (const box of obstacles) values.push(Math.max(0, box[axis] - box.clearance - 2), box[axis] + box[size] + box.clearance + 2);
    for (const segment of occupied) if (segment.a[axis] === segment.b[axis]) values.push(Math.max(0, segment.a[axis] - margin), segment.a[axis], segment.a[axis] + margin);
    return [...new Set(values)].sort((a, b) => a - b);
  };
  const xs = axes('x'), ys = axes('y'), rows = ys.length;
  const point = (id: number): Point => ({ x: xs[Math.floor(id / rows)], y: ys[id % rows] });
  const index = (value: Point) => xs.indexOf(value.x) * rows + ys.indexOf(value.y);
  const first = index(start), last = index(end), count = xs.length * rows * 2;
  const distances = new Float64Array(count).fill(Infinity), previous = new Int32Array(count).fill(-1);
  const queue = new MinHeap(), blocked = new Map<number, boolean>();
  for (let heading = 0; heading < 2; heading++) {
    const state = first * 2 + heading;
    distances[state] = 0; queue.push({ state, cost: 0, estimate: length(start, end) });
  }
  while (queue.values.length) {
    const current = queue.pop()!;
    if (current.cost !== distances[current.state]) continue;
    const id = current.state >> 1, heading = current.state % 2;
    if (id === last) {
      const result: Point[] = [];
      for (let state = current.state; state !== -1; state = previous[state]) result.push(point(state >> 1));
      return simplify(result.reverse());
    }
    const column = Math.floor(id / rows), row = id % rows, a = point(id);
    const next = [column ? id - rows : -1, column < xs.length - 1 ? id + rows : -1, row ? id - 1 : -1, row < rows - 1 ? id + 1 : -1];
    for (let i = 0; i < next.length; i++) {
      const neighbor = next[i];
      if (neighbor < 0) continue;
      const b = point(neighbor), key = Math.min(id, neighbor) * count + Math.max(id, neighbor);
      let collision = blocked.get(key);
      if (collision === undefined) {
        collision = obstacles.some(box => segmentIntersects(a, b, box, box.clearance)); blocked.set(key, collision);
      }
      if (collision) continue;
      const nextHeading = i < 2 ? 0 : 1, state = neighbor * 2 + nextHeading;
      const cost = current.cost + length(a, b) + (heading === nextHeading ? 0 : 28) + occupancy(a, b, occupied);
      if (cost >= distances[state]) continue;
      distances[state] = cost; previous[state] = current.state;
      queue.push({ state, cost, estimate: cost + length(b, end) });
    }
  }
  throw new Error('No unobstructed orthogonal route through measured content');
}

function labelPositions(points: Point[], size: Size): Rect[] {
  return segments(points).sort((a, b) => length(b.a, b.b) - length(a.a, a.b)).flatMap(({ a, b }) => [.5, .3, .7, .15, .85].flatMap(fraction => {
    const x = a.x + (b.x - a.x) * fraction - size.width / 2, y = a.y + (b.y - a.y) * fraction - size.height / 2;
    return (a.y === b.y ? [0, -size.height / 2 - 8, size.height / 2 + 8].map(offset => ({ x, y: y + offset })) : [0, -size.width / 2 - 8, size.width / 2 + 8].map(offset => ({ x: x + offset, y }))).map(point => ({ ...point, ...size }));
  }));
}

/** routeCompact reserves measured labels while routing all relationships through shared component ports. */
export function routeCompact(model: Architecture, nodes: PlacedNode[], measurements: Measurements): Geometry {
  if (!nodes.length) return { nodes: [], edges: [], bounds: { width: 0, height: 0 } };
  const vertical = model.direction === 'down', byId = new Map(nodes.map(node => [node.id, node]));
  const ancestor = (child: string, parent: string) => {
    let value = byId.get(child);
    while (value?.parent) { if (value.parent === parent) return true; value = byId.get(value.parent); }
    return false;
  };
  const port = (id: string, source: boolean): Point => {
    const node = byId.get(id)!;
    return vertical ? { x: node.absX + node.width / 2, y: source ? node.absY + node.height + T.portSize : node.absY - T.portSize } : { x: source ? node.absX + node.width + T.portSize : node.absX - T.portSize, y: node.absY + node.height / 2 };
  };
  const stub = (point: Point, source: boolean): Point => vertical ? { x: point.x, y: point.y + (source ? 16 : -16) } : { x: point.x + (source ? 16 : -16), y: point.y };
  const ports = model.nodes.flatMap(node => [port(node.id, false), port(node.id, true)]);
  const portZones: Rect[] = ports.map((point, i) => vertical ? { x: point.x - 6, y: point.y + (i % 2 ? 0 : -24), width: 12, height: 24 } : { x: point.x + (i % 2 ? 0 : -24), y: point.y - 6, width: 24, height: 12 });
  const maxLabelWidth = Math.max(0, ...Object.values(measurements.labels).map(size => size.width));
  const maxLabelHeight = Math.max(0, ...Object.values(measurements.labels).map(size => size.height));
  const bounds = { width: Math.max(...nodes.map(node => node.absX + node.width)) + maxLabelWidth + T.layerGap,
    height: Math.max(...nodes.map(node => node.absY + node.height)) + maxLabelHeight + T.layerGap };
  const routed: Route[] = [], labels: Rect[] = [];
  const obstaclesFor = (edge: Relationship): Obstacle[] => [...nodes.map(node => ({ x: node.absX, y: node.absY, width: node.width,
    height: node.kind === 'group' && (ancestor(edge.from, node.id) || ancestor(edge.to, node.id)) ? T.groupInset + node.headerHeight : node.height,
    clearance: T.edgeClearance })), ...labels.map(label => ({ ...label, clearance: 6 }))];
  const order = [...model.edges].sort((a, b) => {
    const localA = byId.get(a.from)!.parent === byId.get(a.to)!.parent ? 0 : 1;
    const localB = byId.get(b.from)!.parent === byId.get(b.to)!.parent ? 0 : 1;
    return localA - localB || length(port(a.from, true), port(a.to, false)) - length(port(b.from, true), port(b.to, false)) || a.id.localeCompare(b.id);
  });
  for (const edge of order) {
    const sourcePort = port(edge.from, true), targetPort = port(edge.to, false);
    const start = stub(sourcePort, true), end = stub(targetPort, false), obstacles = obstaclesFor(edge);
    const occupied = routed.flatMap(route => route.sections.flatMap(section => segments(section.points).filter((_, i, values) => !(i === 0 && equal(route.sourcePort, sourcePort)) && !(i === values.length - 1 && equal(route.targetPort, targetPort)))));
    let middle = path(start, end, obstacles, occupied, ports, bounds);
    let label: Route['label'];
    if (edge.label) {
      const size = measurements.labels[edge.id];
      const free = (box: Rect) => box.x >= 0 && box.y >= 0 && !obstacles.some(obstacle => overlap(box, obstacle, obstacle.clearance)) && !portZones.some(zone => overlap(box, zone, 4)) && !occupied.some(segment => segmentIntersects(segment.a, segment.b, box, 4));
      let placement = labelPositions(middle, size).find(free);
      if (!placement) {
        const center = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
        const alternatives = [
          ...labelPositions(middle, size).flatMap(box => [-1, 1].flatMap(sign => [
            { ...box, x: box.x + sign * (size.width + 16) }, { ...box, y: box.y + sign * (size.height + 16) },
          ])),
          ...nodes.flatMap(node => [
            { x: node.absX + (node.width - size.width) / 2, y: node.absY + node.height + T.edgeClearance + 4, ...size },
            { x: node.absX + (node.width - size.width) / 2, y: node.absY - size.height - T.edgeClearance - 4, ...size },
          ]),
          { x: Math.max(T.groupInset, center.x - size.width / 2), y: bounds.height - size.height - 16, ...size },
        ].filter(free).sort((a, b) => length({ x: a.x + size.width / 2, y: a.y + size.height / 2 }, center) - length({ x: b.x + size.width / 2, y: b.y + size.height / 2 }, center));
        for (const candidate of alternatives.slice(0, 12)) {
          const left = { x: candidate.x - 10, y: candidate.y + size.height / 2 }, right = { x: candidate.x + size.width + 10, y: left.y };
          if (obstacles.some(box => segmentIntersects(left, right, box, box.clearance))) continue;
          const [before, after] = start.x <= end.x ? [left, right] : [right, left];
          try {
            const reserved = [...obstacles, { ...candidate, clearance: 6 }];
            const first = path(start, before, reserved, occupied, ports, bounds);
            const last = path(after, end, reserved, [...occupied, ...segments(first)], ports, bounds);
            middle = [...first, after, ...last.slice(1)]; placement = candidate; break;
          } catch { /* Another bounded label position may have a reachable approach. */ }
        }
      }
      if (!placement) throw new Error(`No unobstructed measured label position for ${edge.id}`);
      label = { ...placement, text: edge.label }; labels.push(placement);
    }
    const points = [sourcePort, ...middle, targetPort].filter((point, i, values) => !i || !equal(point, values[i - 1]));
    routed.push({ id: edge.id, sourcePort, targetPort, sections: [{ points }], ...(label ? { label } : {}) });
  }
  const edges = routed.sort((a, b) => a.id.localeCompare(b.id));
  const all = [...nodes.flatMap(node => [{ x: node.absX, y: node.absY }, { x: node.absX + node.width, y: node.absY + node.height }]),
    ...edges.flatMap(edge => [...edge.sections.flatMap(section => section.points), ...(edge.label ? [edge.label, { x: edge.label.x + edge.label.width, y: edge.label.y + edge.label.height }] : [])])];
  const dx = T.groupInset - Math.min(...all.map(point => point.x)), dy = T.groupInset - Math.min(...all.map(point => point.y));
  const shifted = (point: Point) => ({ x: point.x + dx, y: point.y + dy });
  return {
    nodes: nodes.map(node => ({ ...node, absX: node.absX + dx, absY: node.absY + dy, x: node.x + (node.parent ? 0 : dx), y: node.y + (node.parent ? 0 : dy) })),
    edges: edges.map(edge => ({ ...edge, sourcePort: shifted(edge.sourcePort), targetPort: shifted(edge.targetPort),
      sections: edge.sections.map(section => ({ points: section.points.map(shifted) })), label: edge.label ? { ...edge.label, ...shifted(edge.label) } : undefined })),
    bounds: { width: Math.max(...all.map(point => point.x)) + dx + T.groupInset, height: Math.max(...all.map(point => point.y)) + dy + T.groupInset },
  };
}
