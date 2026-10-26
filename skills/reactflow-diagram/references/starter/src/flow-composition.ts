import { TOKENS as T } from './tokens';
import { flowLanePolicies, flowStubLength, parallelFlowCorridor } from './endpoints';
import type { Architecture, Diagnostic, FlowAssessment, Geometry, Measurements, PlacedNode, Point, Size } from './types';

type Tile = Size & { id: string; x: number; y: number; headerHeight: number; children: Tile[]; anchor?: number; first?: number };

function unsupportedDirection(model: Architecture): Diagnostic | undefined {
  return model.flow && model.direction !== 'right'
    ? { check: 'flow-direction', ids: model.flow.primary, message: `Flow composition unavailable for direction ${model.direction}; flow requires direction right.` }
    : undefined;
}

function flowContext(model: Architecture) {
  const entries = new Map([...model.groups, ...model.nodes].sort((a, b) => a.id.localeCompare(b.id)).map(node => [node.id, node]));
  const edges = new Map(model.edges.map(edge => [edge.id, edge]));
  const path = model.flow?.primary.map(id => edges.get(id)!) ?? [];
  const primary = path.length ? [path[0].from, ...path.map(edge => edge.to)] : [];
  const indices = new Map(primary.map((id, index) => [id, index]));
  const belongs = (id: string, ancestor: string): boolean => {
    let entry = entries.get(id);
    while (entry) { if (entry.id === ancestor) return true; entry = entry.parent ? entries.get(entry.parent) : undefined; }
    return false;
  };
  const spans = new Map([...entries.keys()].map(id => [id, primary.flatMap((node, index) => belongs(node, id) ? [index] : [])]));
  const terminal = (id: string): boolean => {
    const incident = model.edges.filter(edge => edge.from === id || edge.to === id);
    const inPrimaryGroup = model.groups.some(group => (spans.get(group.id)?.length ?? 0) > 0 && belongs(id, group.id));
    return inPrimaryGroup && incident.length > 0 && incident.every(edge => edge.to === id && edge.interaction === 'response');
  };
  const returnOnly = (id: string): boolean => {
    const leaves = model.nodes.filter(node => belongs(node.id, id));
    return leaves.length > 0 && leaves.every(node => terminal(node.id));
  };
  const limits: Diagnostic[] = [...model.groups].sort((a, b) => a.id.localeCompare(b.id)).flatMap(group => {
    const span = spans.get(group.id)!;
    return span.length && span.at(-1)! - span[0] + 1 !== span.length
      ? [{ check: 'flow-group-span', ids: [group.id, ...primary.slice(span[0], span.at(-1)! + 1)], message: `Group ${group.id} does not contain a contiguous primary span; preserving its ancestry prevents an unwrapped spine.` }]
      : [];
  });
  return { entries, primary, indices, spans, returnOnly, limits };
}

function shelf(tiles: Tile[], targetWidth: number, gapX: number, gapY: number): Size {
  let x = 0, y = 0, rowHeight = 0, width = 0;
  for (const tile of tiles) {
    if (x && x + tile.width > targetWidth + T.tolerance) { x = 0; y += rowHeight + gapY; rowHeight = 0; }
    tile.x = x; tile.y = y;
    x += tile.width + gapX; rowHeight = Math.max(rowHeight, tile.height); width = Math.max(width, tile.x + tile.width);
  }
  return { width, height: tiles.length ? y + rowHeight : 0 };
}

/** flowNodes derives a horizontal unwrapped measured spine without splitting or reparenting rectangular groups. */
export function flowNodes(model: Architecture, measurements: Measurements): PlacedNode[] {
  if (!model.flow) throw new Error('Flow placement requires declared flow intent');
  const direction = unsupportedDirection(model);
  if (direction) throw new Error(direction.message);
  const context = flowContext(model);
  if (context.limits.length) throw new Error(context.limits.map(limit => limit.message).join(' '));
  const maxLabelWidth = Math.max(0, ...Object.values(measurements.labels).map(size => size.width));
  const maxLabelHeight = Math.max(0, ...Object.values(measurements.labels).map(size => size.height));
  const gapX = T.layerGap;
  const gapY = Math.max(T.layerGap, maxLabelHeight + 2 * T.edgeClearance + T.portSize * 2);
  const groupIds = new Set(model.groups.map(group => group.id));
  const bandHalfHeight = Math.max(...context.primary.map(id => measurements.nodes[id].height / 2));
  const inset = T.groupInset + T.edgeClearance;
  const policies = flowLanePolicies(model), topApproaches = new Map<string, number>();
  let supportApproach = 0, supportLabelHeight = 0;
  for (const edge of model.edges) {
    const policy = policies.get(edge.id);
    const depth = T.portSize + flowStubLength(policy);
    if (policy?.sourceSide === 'top') topApproaches.set(edge.from, Math.max(topApproaches.get(edge.from) ?? 0, depth));
    if (policy?.targetSide === 'top') topApproaches.set(edge.to, Math.max(topApproaches.get(edge.to) ?? 0, depth));
    if (policy?.kind === 'support') {
      supportApproach = Math.max(supportApproach, depth);
      supportLabelHeight = Math.max(supportLabelHeight, measurements.labels[edge.id]?.height ?? 0);
    }
  }
  const supportGap = Math.max(gapY, supportApproach * 2 + supportLabelHeight + 2 * T.edgeClearance);
  const primaryGapAfter = (id: string): number => {
    const edgeId = model.flow!.primary[context.spans.get(id)!.at(-1)!];
    return Math.max(T.layerGap, (measurements.labels[edgeId]?.width ?? 0) + 2 * T.edgeClearance + T.portSize * 2);
  };
  const childIds = (parent?: string) => [...context.entries.values()].filter(node => node.parent === parent).map(node => node.id);
  const skeletonWidths = new Map<string, number>();
  function primaryWidth(ids: string[]): number {
    const primary = ids.filter(id => context.spans.get(id)!.length).sort((a, b) => context.spans.get(a)![0] - context.spans.get(b)![0]);
    return primary.reduce((width, id, index) => width + skeletonWidth(id) + (index ? primaryGapAfter(primary[index - 1]) : 0), 0);
  }
  function skeletonWidth(id: string): number {
    const cached = skeletonWidths.get(id);
    if (cached !== undefined) return cached;
    const width = groupIds.has(id)
      ? Math.max(T.nodeWidth + 2 * T.groupInset, measurements.headers[id].width + 2 * T.groupInset, primaryWidth(childIds(id)) + 2 * inset)
      : measurements.nodes[id].width;
    skeletonWidths.set(id, width);
    return width;
  }

  function arrange(children: Tile[], availableWidth: number): Size & { anchor?: number } {
    const primary = children.filter(child => child.anchor !== undefined).sort((a, b) => a.first! - b.first!);
    const support = children.filter(child => child.anchor === undefined).sort((a, b) => a.id.localeCompare(b.id));
    if (!primary.length) return shelf(support, availableWidth, gapX, gapY);
    const anchor = Math.max(bandHalfHeight, ...primary.map(tile => tile.anchor!));
    let primaryWidth = 0;
    for (const [index, child] of primary.entries()) {
      if (index) primaryWidth += primaryGapAfter(primary[index - 1].id);
      child.x = primaryWidth; child.y = anchor - child.anchor!;
      primaryWidth += child.width;
    }
    const primaryHeight = Math.max(anchor + bandHalfHeight, ...primary.map(tile => tile.y + tile.height));
    const above = support.filter(tile => model.flow!.supportSide === 'above' && !context.returnOnly(tile.id));
    const below = support.filter(tile => !above.includes(tile));
    const top = shelf(above, primaryWidth, gapX, gapY), bottom = shelf(below, primaryWidth, gapX, gapY);
    const offset = above.length ? top.height + supportGap : 0;
    const bottomGap = model.flow!.supportSide === 'below' ? supportGap : gapY;
    const width = Math.max(primaryWidth, top.width, bottom.width);
    for (const child of primary) { child.x += (width - primaryWidth) / 2; child.y += offset; }
    for (const child of above) child.x += (width - top.width) / 2;
    for (const child of below) { child.x += (width - bottom.width) / 2; child.y += offset + primaryHeight + bottomGap; }
    return { width, height: offset + primaryHeight + (below.length ? bottomGap + bottom.height : 0), anchor: offset + anchor };
  }

  function tile(id: string, availableWidth: number): Tile {
    if (!groupIds.has(id)) {
      const size = measurements.nodes[id], index = context.indices.get(id);
      return { id, ...size, x: 0, y: 0, headerHeight: 0, children: [], ...(index === undefined ? {} : { anchor: size.height / 2, first: index }) };
    }
    const header = measurements.headers[id], headerHeight = header.height + T.headerGap;
    const contentWidth = Math.max(0, (context.spans.get(id)!.length ? skeletonWidth(id) : availableWidth) - 2 * inset);
    const ids = childIds(id);
    // A policy top approach must fit below the reserved header before it can turn outward.
    const topInset = inset + Math.max(0, ...ids.map(child => topApproaches.get(child) ?? 0));
    const children = ids.map(child => tile(child, contentWidth));
    const content = arrange(children, contentWidth);
    for (const child of children) { child.x += inset; child.y += topInset + headerHeight; }
    return { id, children, x: 0, y: 0, headerHeight,
      width: Math.max(T.nodeWidth + 2 * T.groupInset, header.width + 2 * T.groupInset, content.width + 2 * inset),
      height: content.height + inset + topInset + headerHeight,
      ...(content.anchor === undefined ? {} : { anchor: content.anchor + topInset + headerHeight, first: context.spans.get(id)![0] }) };
  }
  const rootIds = childIds(), rootWidth = primaryWidth(rootIds);
  const roots = rootIds.map(id => tile(id, rootWidth));
  arrange(roots, rootWidth);
  const kinds = new Map(model.nodes.map(node => [node.id, node.kind]));
  const result: PlacedNode[] = [];
  function visit(value: Tile, absX: number, absY: number, parent?: string) {
    result.push({ id: value.id, parent, kind: kinds.get(value.id) ?? 'group', x: value.x, y: value.y,
      absX: absX + value.x, absY: absY + value.y, width: value.width, height: value.height, headerHeight: value.headerHeight });
    for (const child of value.children) visit(child, absX + value.x, absY + value.y, value.id);
  }
  for (const root of roots) { root.x += maxLabelWidth + T.groupInset; root.y += maxLabelHeight + T.groupInset; visit(root, 0, 0); }
  return result;
}

/** assessFlow checks declared placement and actual route lanes independently of mechanical geometry validity. */
export function assessFlow(model: Architecture, geometry?: Geometry): FlowAssessment | undefined {
  if (!model.flow) return undefined;
  const direction = unsupportedDirection(model);
  if (direction) return { status: 'unsatisfied', diagnostics: [direction] };
  const context = flowContext(model), diagnostics = [...context.limits];
  if (!geometry) {
    if (!diagnostics.length) diagnostics.push({ check: 'flow-unavailable', ids: model.flow.primary, message: 'Declared flow intent has no computed geometry to assess.' });
  } else {
    const placed = new Map(geometry.nodes.map(node => [node.id, node]));
    const primary = context.primary.map(id => placed.get(id));
    if (primary.some(node => !node)) diagnostics.push({ check: 'flow-primary', ids: context.primary, message: 'A declared primary component is missing from the geometry.' });
    else if (primary.length) {
      const spine = primary as PlacedNode[], center = spine[0].absY + spine[0].height / 2;
      for (let index = 1; index < spine.length; index++) {
        const previous = spine[index - 1], current = spine[index];
        if (current.absX < previous.absX + previous.width - T.tolerance || Math.abs(current.absY + current.height / 2 - center) > T.tolerance) {
          diagnostics.push({ check: 'flow-primary', ids: [previous.id, current.id], message: 'Declared primary order must progress left to right on one unwrapped band.' });
        }
      }
      const top = Math.min(...spine.map(node => node.absY)), bottom = Math.max(...spine.map(node => node.absY + node.height));
      for (const entry of context.entries.values()) if (!context.spans.get(entry.id)!.length) {
        const node = placed.get(entry.id);
        const above = node && node.absY + node.height <= top + T.tolerance;
        const below = node && node.absY >= bottom - T.tolerance;
        const satisfied = model.flow.supportSide === 'below' ? below : above || context.returnOnly(entry.id) && below;
        if (!satisfied) diagnostics.push({ check: 'flow-support-side', ids: [entry.id], message: `Supporting content must stay ${model.flow.supportSide} the primary band; only response terminals inside primary groups may use the lower band.` });
      }
      const edges = new Map(model.edges.map(edge => [edge.id, edge])), routes = new Map(geometry.edges.map(route => [route.id, route]));
      const returnLanes: { id: string; y: number }[] = [];
      const supportRoutes: { id: string; segments: { a: Point; b: Point }[] }[] = [];
      for (const [id, policy] of flowLanePolicies(model)) {
        const edge = edges.get(id)!, route = routes.get(id), source = placed.get(edge.from)!, target = placed.get(edge.to)!;
        const check = policy.kind === 'primary' ? 'flow-primary-route' : policy.kind === 'return' ? 'flow-return-route' : 'flow-support-route';
        if (!route?.sourcePort || !route.targetPort || !source || !target) {
          diagnostics.push({ check, ids: [id], message: 'Declared flow lane is missing its route or endpoints.' }); continue;
        }
        const points = route.sections.flatMap(section => section.points);
        let satisfied = points.length >= 2 && route.sourcePort.side === policy.sourceSide && route.targetPort.side === policy.targetSide;
        if (policy.kind === 'primary') {
          satisfied &&= points.every(point => point.y >= Math.min(route.sourcePort.y, route.targetPort.y) - T.tolerance && point.y <= Math.max(route.sourcePort.y, route.targetPort.y) + T.tolerance)
            && points.slice(1).every((point, index) => point.x >= points[index].x - T.tolerance)
            && (!route.label || route.label.x >= source.absX + source.width + T.edgeClearance - T.tolerance && route.label.x + route.label.width <= target.absX - T.edgeClearance + T.tolerance);
        } else if (policy.kind === 'support') {
          satisfied &&= points.every(point => model.flow!.supportSide === 'above' ? point.y <= source.absY + T.tolerance : point.y >= source.absY + source.height - T.tolerance)
            && (!route.label || (model.flow!.supportSide === 'above' ? route.label.y + route.label.height <= source.absY + T.tolerance : route.label.y >= source.absY + source.height - T.tolerance));
          const segments = route.sections.flatMap(section => section.points.slice(1).map((b, index) => ({ a: section.points[index], b })));
          for (const other of supportRoutes) if (segments.some(segment => other.segments.some(value => parallelFlowCorridor(segment.a, segment.b, value.a, value.b)))) {
            diagnostics.push({ check: 'flow-support-lanes', ids: [other.id, id], message: 'Supporting calls require distinct visible parallel corridors; isolated perpendicular crossings remain permitted.' });
          }
          supportRoutes.push({ id, segments });
        } else {
          const horizontal = route.sections.flatMap(section => section.points.slice(1).map((b, index) => ({ a: section.points[index], b }))).filter(segment => segment.a.y === segment.b.y && segment.a.x > segment.b.x).sort((a, b) => (b.a.x - b.b.x) - (a.a.x - a.b.x));
          satisfied &&= horizontal.length > 0 && horizontal.every(segment => segment.a.y > bottom + T.edgeClearance)
            && points.every(point => point.y >= Math.min(route.sourcePort.y, route.targetPort.y) - T.tolerance);
          if (horizontal.length) {
            const shared = returnLanes.find(lane => Math.abs(lane.y - horizontal[0].a.y) < 2 * T.edgeClearance);
            if (shared) diagnostics.push({ check: 'flow-return-lanes', ids: [shared.id, id], message: 'Synchronous returns require distinct lower lanes.' });
            returnLanes.push({ id, y: horizontal[0].a.y });
          }
        }
        if (!satisfied) diagnostics.push({ check, ids: [id], message: policy.kind === 'primary' ? 'Primary requests require facing lateral attachments, a near-axis forward route and a label in their measured gap.'
          : policy.kind === 'return' ? 'Reverse synchronous responses require lower attachments and lanes below the primary band.' : 'Supporting calls must attach and remain on the declared supporting-content side.' });
      }
    }
  }
  return { status: diagnostics.length ? 'unsatisfied' : 'satisfied', diagnostics };
}
