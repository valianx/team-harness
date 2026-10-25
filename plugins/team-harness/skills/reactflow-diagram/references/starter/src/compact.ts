import type { Architecture, Measurements, PlacedNode, Size } from './types';
import { TOKENS as T } from './tokens';

type Tile = Size & { id: string; headerHeight: number; children: Tile[]; x: number; y: number };

function flowOrder(ids: string[], model: Architecture): string[] {
  const entries = new Map([...model.groups, ...model.nodes].map(node => [node.id, node]));
  const siblings = new Set(ids);
  const branch = (id: string): string | undefined => {
    let value = entries.get(id);
    while (value && !siblings.has(value.id)) value = value.parent ? entries.get(value.parent) : undefined;
    return value?.id;
  };
  const links = new Map(ids.map(id => [id, new Set<string>()]));
  for (const edge of model.edges) {
    const from = branch(edge.from), to = branch(edge.to);
    if (from && to && from !== to) links.get(from)!.add(to);
  }
  const remaining = new Set([...ids].sort());
  const ordered: string[] = [];
  while (remaining.size) {
    const incoming = (id: string) => [...remaining].filter(other => links.get(other)!.has(id)).length;
    const ready = [...remaining].filter(id => incoming(id) === 0);
    const next = (ready.length ? ready : [...remaining]).sort((a, b) => incoming(a) - incoming(b) || links.get(b)!.size - links.get(a)!.size || a.localeCompare(b))[0];
    ordered.push(next); remaining.delete(next);
  }
  return ordered;
}

function pack(tiles: Tile[], aspect: number, gapX: number, gapY: number): Size {
  if (!tiles.length) return { width: 0, height: 0 };
  const widest = Math.max(...tiles.map(tile => tile.width));
  const total = tiles.reduce((sum, tile) => sum + tile.width, 0) + gapX * (tiles.length - 1);
  const area = tiles.reduce((sum, tile) => sum + (tile.width + gapX) * (tile.height + gapY), 0);
  const ideal = Math.sqrt(area * aspect);
  const limits = [...new Set([widest, total, ...[.7, .9, 1.1, 1.35].map(scale => Math.max(widest, ideal * scale))])];
  let best: { width: number; height: number; score: number; positions: { x: number; y: number }[] } | undefined;
  for (const limit of limits) {
    let x = 0, y = 0, row = 0, width = 0;
    const positions = tiles.map(tile => {
      if (x && x + tile.width > limit + T.tolerance) { x = 0; y += row + gapY; row = 0; }
      const point = { x, y };
      x += tile.width + gapX; row = Math.max(row, tile.height); width = Math.max(width, point.x + tile.width);
      return point;
    });
    const height = y + row;
    const score = Math.max(width / Math.sqrt(aspect), height * Math.sqrt(aspect)) + Math.sqrt(width * height) * .08;
    if (!best || score < best.score) best = { width, height, score, positions };
  }
  tiles.forEach((tile, i) => Object.assign(tile, best!.positions[i]));
  return { width: best!.width, height: best!.height };
}

/** compactNodes packs measured hierarchy tiles in stable flow order, without semantic coordinates. */
export function compactNodes(model: Architecture, measurements: Measurements, localAspect: number): PlacedNode[] {
  const vertical = model.direction === 'down';
  const maxLabelWidth = Math.max(0, ...Object.values(measurements.labels).map(size => size.width));
  const maxLabelHeight = Math.max(0, ...Object.values(measurements.labels).map(size => size.height));
  const gapX = Math.max(vertical ? T.siblingGap : T.layerGap, maxLabelWidth + 2 * T.edgeClearance + T.portSize * 2);
  const gapY = Math.max(vertical ? T.layerGap : T.siblingGap, maxLabelHeight + 2 * T.edgeClearance + T.portSize * 2);
  const entries = [...model.groups, ...model.nodes];
  const groupIds = new Set(model.groups.map(group => group.id));
  function tile(id: string): Tile {
    if (!groupIds.has(id)) return { id, ...measurements.nodes[id], headerHeight: 0, children: [], x: 0, y: 0 };
    const header = measurements.headers[id], headerHeight = header.height + T.headerGap;
    const children = flowOrder(entries.filter(node => node.parent === id).map(node => node.id), model).map(tile);
    const packed = pack(children, localAspect, gapX, gapY);
    const insetX = T.groupInset + T.edgeClearance, insetY = T.groupInset + T.edgeClearance + (vertical ? T.portSize + 16 + T.edgeClearance : 0);
    for (const child of children) { child.x += insetX; child.y += insetY + headerHeight; }
    return { id, children, headerHeight, x: 0, y: 0,
      width: Math.max(header.width + 2 * T.groupInset, packed.width + 2 * insetX),
      height: Math.max(headerHeight + 2 * T.groupInset, packed.height + 2 * insetY + headerHeight) };
  }
  const roots = flowOrder(entries.filter(node => !node.parent).map(node => node.id), model).map(tile);
  pack(roots, 1.9, gapX + T.groupInset, gapY + T.groupInset);
  const kinds = new Map(model.nodes.map(node => [node.id, node.kind]));
  const result: PlacedNode[] = [];
  const marginX = maxLabelWidth + T.groupInset, marginY = maxLabelHeight + T.groupInset;
  function visit(value: Tile, absX: number, absY: number, parent?: string) {
    result.push({ id: value.id, parent, kind: kinds.get(value.id) ?? 'group',
      x: value.x, y: value.y, absX: absX + value.x, absY: absY + value.y,
      width: value.width, height: value.height, headerHeight: value.headerHeight });
    for (const child of value.children) visit(child, absX + value.x, absY + value.y, value.id);
  }
  for (const root of roots) { root.x += marginX; root.y += marginY; visit(root, 0, 0); }
  return result;
}
