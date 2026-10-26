import { TOKENS as T } from './tokens';
import { ROUTING_LIMITS } from './route-budget';
import type { Architecture, Endpoint, PlacedNode, Point, PortSide, Relationship } from './types';

const sides: PortSide[] = ['right', 'left', 'bottom', 'top'];
const distance = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const point = (endpoint: Endpoint): Point => ({ x: endpoint.x, y: endpoint.y });

/** endpointStub reserves an outward approach before the shared orthogonal router takes over. */
export function endpointStub(endpoint: Endpoint): Point {
  const { x, y, side } = endpoint;
  return { x: x + (side === 'right' ? 16 : side === 'left' ? -16 : 0), y: y + (side === 'bottom' ? 16 : side === 'top' ? -16 : 0) };
}

/** Reserve every role together, so repeated calls and reciprocal roles cannot alias a slot. */
export function endpointAllocator(model: Architecture, nodes: PlacedNode[]) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const reservations = new Map<string, { id: string; other: string }[]>();
  for (const edge of model.edges) for (const [role, nodeId, other] of [['source', edge.from, edge.to], ['target', edge.to, edge.from]] as const) {
    const values = reservations.get(nodeId) ?? [];
    values.push({ id: `${edge.id}:${role}`, other }); reservations.set(nodeId, values);
  }
  function endpoint(edge: Relationship, role: 'source' | 'target', side: PortSide): Endpoint {
    const nodeId = role === 'source' ? edge.from : edge.to, node = byId.get(nodeId)!;
    const horizontal = side === 'left' || side === 'right', axis = horizontal ? 'absY' : 'absX', size = horizontal ? 'height' : 'width';
    const values = [...reservations.get(nodeId)!].sort((a, b) => {
      const av = byId.get(a.other)!, bv = byId.get(b.other)!;
      return (av[axis] + av[size] / 2) - (bv[axis] + bv[size] / 2) || a.id.localeCompare(b.id);
    });
    const id = `${edge.id}:${role}`, slot = values.findIndex(value => value.id === id);
    const inset = Math.min(24, node[size] / 4), offset = inset + (node[size] - 2 * inset) * (slot + 1) / (values.length + 1);
    return { id, nodeId, side, slot,
      x: horizontal ? node.absX + (side === 'right' ? node.width + T.portSize : -T.portSize) : node.absX + offset,
      y: horizontal ? node.absY + offset : node.absY + (side === 'bottom' ? node.height + T.portSize : -T.portSize) };
  }
  function alternatives(edge: Relationship): { source: Endpoint; target: Endpoint }[] {
    const values = sides.flatMap(sourceSide => sides.map(targetSide => ({ source: endpoint(edge, 'source', sourceSide), target: endpoint(edge, 'target', targetSide) })));
    // Lower bounds include outward stubs. Facing boundaries naturally rank before routes that double back.
    values.sort((a, b) => {
      const cost = (value: typeof a) => distance(point(value.source), endpointStub(value.source)) + distance(endpointStub(value.source), endpointStub(value.target)) + distance(endpointStub(value.target), point(value.target));
      return cost(a) - cost(b) || sides.indexOf(a.source.side) - sides.indexOf(b.source.side) || sides.indexOf(a.target.side) - sides.indexOf(b.target.side);
    });
    const opposite: Record<PortSide, PortSide> = { right: 'left', left: 'right', top: 'bottom', bottom: 'top' };
    const facing = values.filter(value => opposite[value.source.side] === value.target.side);
    const remaining = values.filter(value => opposite[value.source.side] !== value.target.side);
    const selected = new Set([...facing, ...remaining.slice(0, ROUTING_LIMITS.sidePairsPerEdge - facing.length)]);
    return values.filter(value => selected.has(value));
  }
  return { alternatives };
}
