import { TOKENS as T } from './tokens';
import { ROUTING_LIMITS } from './route-budget';
import type { Architecture, Endpoint, FlowLanePolicy, PlacedNode, Point, PortSide, Relationship } from './types';

const sides: PortSide[] = ['right', 'left', 'bottom', 'top'];
const distance = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const point = (endpoint: Endpoint): Point => ({ x: endpoint.x, y: endpoint.y });

/** ENDPOINT_STUB_LENGTH is shared with group-header clearance for policy-constrained approaches. */
export const ENDPOINT_STUB_LENGTH = 16;

/** FLOW_SUPPORT_LANE_GAP separates parallel support corridors while allowing perpendicular crossings. */
export const FLOW_SUPPORT_LANE_GAP = 2 * T.edgeClearance;

/** flowStubLength reserves distinct measured departure and arrival levels for supporting calls. */
export function flowStubLength(policy?: FlowLanePolicy): number {
  return ENDPOINT_STUB_LENGTH + (policy?.kind === 'support' ? policy.order * FLOW_SUPPORT_LANE_GAP : 0);
}

/** parallelFlowCorridor detects merged or visually inseparable parallel runs, not isolated crossings. */
export function parallelFlowCorridor(a: Point, b: Point, c: Point, d: Point): boolean {
  const horizontal = Math.abs(a.y - b.y) <= T.tolerance;
  if (horizontal !== (Math.abs(c.y - d.y) <= T.tolerance)) return false;
  const axis = horizontal ? 'x' : 'y', normal = horizontal ? 'y' : 'x';
  if (Math.abs(a[axis] - b[axis]) <= T.tolerance || Math.abs(c[axis] - d[axis]) <= T.tolerance) return false;
  const shared = Math.min(Math.max(a[axis], b[axis]), Math.max(c[axis], d[axis])) - Math.max(Math.min(a[axis], b[axis]), Math.min(c[axis], d[axis]));
  return shared > T.tolerance && Math.abs(a[normal] - c[normal]) < FLOW_SUPPORT_LANE_GAP - T.tolerance;
}

/** endpointStub reserves a measured outward approach before the shared orthogonal router takes over. */
export function endpointStub(endpoint: Endpoint, length = ENDPOINT_STUB_LENGTH): Point {
  const { x, y, side } = endpoint;
  return { x: x + (side === 'right' ? length : side === 'left' ? -length : 0), y: y + (side === 'bottom' ? length : side === 'top' ? -length : 0) };
}

/** flowLanePolicies keeps primary progression, synchronous returns and supporting calls on declared sides. */
export function flowLanePolicies(model: Architecture): Map<string, FlowLanePolicy> {
  const policies = new Map<string, FlowLanePolicy>();
  if (!model.flow || model.direction !== 'right') return policies;
  const edges = new Map(model.edges.map(edge => [edge.id, edge]));
  const path = model.flow.primary.map(id => edges.get(id)!);
  const primary = new Map([path[0].from, ...path.map(edge => edge.to)].map((id, index) => [id, index]));
  path.forEach((edge, order) => policies.set(edge.id, { kind: 'primary', sourceSide: 'right', targetSide: 'left', order }));
  const returns = model.edges.filter(edge => edge.interaction === 'response' && primary.has(edge.from) && primary.has(edge.to) && primary.get(edge.from)! > primary.get(edge.to)!).sort((a, b) => a.id.localeCompare(b.id));
  returns.forEach((edge, order) => policies.set(edge.id, { kind: 'return', sourceSide: 'bottom', targetSide: 'bottom', order }));
  const support = model.edges.filter(edge => edge.interaction === 'call' && primary.has(edge.from) && !primary.has(edge.to)).sort((a, b) => a.id.localeCompare(b.id));
  support.forEach((edge, order) => policies.set(edge.id, { kind: 'support', sourceSide: model.flow!.supportSide === 'above' ? 'top' : 'bottom', targetSide: model.flow!.supportSide === 'above' ? 'bottom' : 'top', order }));
  return policies;
}

/** Reserve every role together, so repeated calls and reciprocal roles cannot alias a slot. */
export function endpointAllocator(model: Architecture, nodes: PlacedNode[]) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const policies = flowLanePolicies(model);
  const reservations = new Map<string, { id: string; other: string; primarySide?: PortSide }[]>();
  for (const edge of model.edges) for (const [role, nodeId, other] of [['source', edge.from, edge.to], ['target', edge.to, edge.from]] as const) {
    const values = reservations.get(nodeId) ?? [];
    const policy = policies.get(edge.id);
    values.push({ id: `${edge.id}:${role}`, other, ...(policy?.kind === 'primary' ? { primarySide: role === 'source' ? policy.sourceSide : policy.targetSide } : {}) }); reservations.set(nodeId, values);
  }
  function endpoint(edge: Relationship, role: 'source' | 'target', side: PortSide): Endpoint {
    const nodeId = role === 'source' ? edge.from : edge.to, node = byId.get(nodeId)!;
    const horizontal = side === 'left' || side === 'right', axis = horizontal ? 'absY' : 'absX', size = horizontal ? 'height' : 'width';
    const values = [...reservations.get(nodeId)!].sort((a, b) => {
      const av = byId.get(a.other)!, bv = byId.get(b.other)!;
      return (av[axis] + av[size] / 2) - (bv[axis] + bv[size] / 2) || a.id.localeCompare(b.id);
    });
    const id = `${edge.id}:${role}`, slot = values.findIndex(value => value.id === id);
    const inset = Math.min(24, node[size] / 4);
    let offset = inset + (node[size] - 2 * inset) * (slot + 1) / (values.length + 1);
    const primary = values.find(value => value.primarySide === side);
    if (primary) {
      // Unrelated roles must not tilt the aligned primary request spine.
      const others = values.filter(value => value !== primary);
      const offsets = Array.from({ length: values.length }, (_, index) => inset + (node[size] - 2 * inset) * (index + 1) / (values.length + 1));
      const closest = offsets.reduce((best, value, index) => Math.abs(value - node[size] / 2) < Math.abs(offsets[best] - node[size] / 2) ? index : best, 0);
      offsets.splice(closest, 1);
      offset = primary.id === id ? node[size] / 2 : offsets[others.findIndex(value => value.id === id)];
    }
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
    const policy = policies.get(edge.id), preferred = policy && values.find(value => value.source.side === policy.sourceSide && value.target.side === policy.targetSide);
    if (preferred) {
      if (!selected.has(preferred)) { selected.delete([...selected].at(-1)!); selected.add(preferred); }
      return [preferred, ...values.filter(value => selected.has(value) && value !== preferred)];
    }
    return values.filter(value => selected.has(value));
  }
  return { alternatives, policies };
}
