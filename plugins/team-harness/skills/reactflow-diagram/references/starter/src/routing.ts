import { segmentIntersects } from './geometry';
import type { Geometry, Point, Relationship } from './types';
import { TOKENS as T } from './tokens';

type Obstacle = Point & { width: number; height: number };

function detour(start: Point, end: Point, obstacles: Obstacle[]): Point[] {
  const margin = T.edgeClearance + 2;
  const xs = [...new Set([start.x, end.x, ...obstacles.flatMap(r => [r.x - margin, r.x + r.width + margin])])].sort((a, b) => a - b);
  const ys = [...new Set([start.y, end.y, ...obstacles.flatMap(r => [r.y - margin, r.y + r.height + margin])])].sort((a, b) => a - b);
  const points = xs.flatMap(x => ys.map(y => ({ x, y })));
  const at = (point: Point) => xs.indexOf(point.x) * ys.length + ys.indexOf(point.y);
  const first = at(start), last = at(end);
  const distances = new Map<number, number>([[first, 0]]);
  const previous = new Map<number, number>();
  const pending = new Set([first]);
  const blocked = (a: Point, b: Point) => obstacles.some(box => segmentIntersects(a, b, box, T.edgeClearance));
  while (pending.size) {
    let current = -1, best = Infinity;
    for (const id of pending) if (distances.get(id)! < best) { best = distances.get(id)!; current = id; }
    pending.delete(current);
    if (current === last) {
      const path = [points[last]];
      while (current !== first) { current = previous.get(current)!; path.unshift(points[current]); }
      return path.filter((p, i) => !i || i === path.length - 1 || !((path[i - 1].x === p.x && p.x === path[i + 1].x) || (path[i - 1].y === p.y && p.y === path[i + 1].y)));
    }
    const column = Math.floor(current / ys.length), row = current % ys.length;
    const next = [column > 0 ? current - ys.length : -1, column < xs.length - 1 ? current + ys.length : -1, row > 0 ? current - 1 : -1, row < ys.length - 1 ? current + 1 : -1];
    for (const id of next) {
      if (id < 0 || blocked(points[current], points[id])) continue;
      const distance = best + Math.abs(points[current].x - points[id].x) + Math.abs(points[current].y - points[id].y);
      if (distance < (distances.get(id) ?? Infinity)) { distances.set(id, distance); previous.set(id, current); pending.add(id); }
    }
  }
  throw new Error('No collision-free route around measured group headers');
}

/** Refine only obstructed ELK segments; retain sections, endpoints and every valid bend. */
export function avoidHeaders(geometry: Geometry, relationships: Relationship[]): Geometry {
  const nodes = new Map(geometry.nodes.map(node => [node.id, node]));
  const ancestor = (child: string, parent: string): boolean => {
    let node = nodes.get(child);
    while (node?.parent) { if (node.parent === parent) return true; node = nodes.get(node.parent); }
    return false;
  };
  const edges = geometry.edges.map(route => {
    const relation = relationships.find(edge => edge.id === route.id)!;
    const obstacles = geometry.nodes.map(node => ({ x: node.absX, y: node.absY, width: node.width,
      height: node.kind === 'group' && (ancestor(relation.from, node.id) || ancestor(relation.to, node.id)) ? T.groupInset + node.headerHeight : node.height }));
    const sections = route.sections.map(section => {
      const points: Point[] = [section.points[0]];
      for (let i = 1; i < section.points.length; i++) {
        const a = section.points[i - 1], b = section.points[i];
        const intersects = obstacles.some(box => segmentIntersects(a, b, box, T.edgeClearance));
        points.push(...(intersects ? detour(a, b, obstacles).slice(1) : [b]));
      }
      return { points };
    });
    return { ...route, sections };
  });
  const all = edges.flatMap(edge => edge.sections.flatMap(section => section.points));
  return { ...geometry, edges, bounds: { width: Math.max(geometry.bounds.width, ...all.map(p => p.x + T.edgeClearance)), height: Math.max(geometry.bounds.height, ...all.map(p => p.y + T.edgeClearance)) } };
}
