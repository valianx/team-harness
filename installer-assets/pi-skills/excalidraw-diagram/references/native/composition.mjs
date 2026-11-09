const shapeTypes = new Set(['rectangle', 'ellipse', 'diamond', 'image', 'embeddable', 'frame']);
const finite = value => Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER;
const point = value => value && finite(value.x) && finite(value.y);
const number = value => Math.round(value * 1e6) / 1e6;
const validBounds = bounds => bounds && ['x', 'y', 'width', 'height'].every(key => finite(bounds[key]))
  && bounds.width >= 0 && bounds.height >= 0;
const rectangle = bounds => [
  { x: bounds.x, y: bounds.y }, { x: bounds.x + bounds.width, y: bounds.y },
  { x: bounds.x + bounds.width, y: bounds.y + bounds.height }, { x: bounds.x, y: bounds.y + bounds.height },
];
const boundsOf = points => {
  const x = Math.min(...points.map(value => value.x)), y = Math.min(...points.map(value => value.y));
  return { x, y, width: Math.max(...points.map(value => value.x)) - x, height: Math.max(...points.map(value => value.y)) - y };
};
const union = elements => {
  const points = elements.filter(element => validBounds(element?.bounds)).flatMap(element => rectangle(element.bounds));
  return points.length ? boundsOf(points) : { x: 0, y: 0, width: 0, height: 0 };
};
const edges = polygon => polygon.map((a, index) => {
  const b = polygon[(index + 1) % polygon.length];
  return { a, b, length: Math.hypot(b.x - a.x, b.y - a.y) };
}).filter(edge => edge.length > 0);
const signedArea = polygon => polygon.reduce((area, a, index) => {
  const b = polygon[(index + 1) % polygon.length];
  const origin = polygon[0];
  return area + (a.x - origin.x) * (b.y - origin.y) - (b.x - origin.x) * (a.y - origin.y);
}, 0) / 2;
const convex = polygon => {
  if (!Array.isArray(polygon) || polygon.length < 3 || !polygon.every(point) || Math.abs(signedArea(polygon)) < 1e-9) return false;
  const signs = polygon.map((a, index) => {
    const b = polygon[(index + 1) % polygon.length], c = polygon[(index + 2) % polygon.length];
    return Math.sign((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x));
  }).filter(Boolean);
  return signs.every(sign => sign === signs[0]);
};
const margin = (polygon, p) => {
  const direction = Math.sign(signedArea(polygon));
  return Math.min(...edges(polygon).map(({ a, b, length }) => direction * ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / length));
};
const contains = (a, b, tolerance) => b.polygon.every(p => margin(a.polygon, p) >= -tolerance);

function separation(a, b) {
  let depth = Infinity, gap = -Infinity;
  for (const { a: p, b: q, length } of [...edges(a), ...edges(b)]) {
    const project = polygon => polygon.map(value => ((q.y - p.y) * value.x - (q.x - p.x) * value.y) / length);
    const pa = project(a), pb = project(b);
    const overlap = Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb));
    depth = Math.min(depth, overlap);
    gap = Math.max(gap, Math.min(...pb) - Math.max(...pa), Math.min(...pa) - Math.max(...pb));
  }
  return { depth, gap };
}

function insideLength(points, polygon, tolerance) {
  const direction = Math.sign(signedArea(polygon));
  let total = 0;
  for (let index = 1; index < points.length; index++) {
    const start = points[index - 1], end = points[index];
    let lower = 0, upper = 1;
    for (const { a, b, length } of edges(polygon)) {
      const distance = p => direction * ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / length;
      const initial = distance(start), delta = distance(end) - initial;
      if (Math.abs(delta) < 1e-9) {
        if (initial <= tolerance) { upper = lower; break; }
      } else {
        const crossing = (tolerance - initial) / delta;
        if (delta > 0) lower = Math.max(lower, crossing);
        else upper = Math.min(upper, crossing);
      }
      if (upper <= lower) break;
    }
    if (upper > lower) total += Math.hypot(end.x - start.x, end.y - start.y) * (upper - lower);
  }
  return total;
}

function normalize(element) {
  if (!element || typeof element.id !== 'string' || !element.id) return null;
  if (element.type === 'arrow') {
    if (!Array.isArray(element.points) || element.points.length < 2 || !element.points.every(point)
      || !element.points.some(p => p.x !== element.points[0].x || p.y !== element.points[0].y)) return null;
    return { ...element, bounds: boundsOf(element.points), approximate: element.approximate === true };
  }
  const polygonAvailable = convex(element.polygon);
  if (!validBounds(element.bounds)) return null;
  if (element.bounds.width === 0 || element.bounds.height === 0) return null;
  return { ...element, polygon: polygonAvailable ? element.polygon : rectangle(element.bounds),
    approximate: element.approximate === true || !polygonAvailable && (element.polygon !== undefined || element.angle != null && element.angle !== 0
      || ['ellipse', 'diamond'].includes(element.type)) };
}

/**
 * Inspect measured native-export geometry without mutating a scene. All coordinates
 * share the SVG export space; optional convex polygons preserve rotated footprints.
 * Alignment groups align the named axis and compare spacing on the opposite axis.
 * Errors concern measured collisions; approximate geometry and layout intent are warnings.
 */
export function inspectComposition(observations, options = {}) {
  options = options && typeof options === 'object' ? options : {};
  const tolerance = finite(options.tolerance) && options.tolerance >= 0 ? options.tolerance : 1;
  const textGap = finite(options.textGap) && options.textGap >= 0 ? options.textGap : 4;
  const issues = [], elements = [], ids = new Set();
  let unavailable = false;
  const add = (kind, severity, affected, message, measurement = {}) => issues.push({
    key: [kind, ...affected.map(element => element.id)].join(':'), kind, severity,
    elementIds: affected.map(element => element.id), bounds: union(affected), message, measurement,
  });
  const missing = (id, message) => {
    unavailable = true;
    add('unavailable-geometry', 'warning', [{ id }], message, { unavailable: true });
  };
  if (!Array.isArray(observations?.elements)) missing('scene', 'Native composition observations are unavailable');
  for (const original of Array.isArray(observations?.elements) ? observations.elements : []) {
    if (!shapeTypes.has(original?.type) && !['arrow', 'text'].includes(original?.type)) continue;
    const element = normalize(original);
    if (!element || ids.has(element.id)) { missing(original?.id || 'unknown', 'Element geometry is missing, invalid or duplicated'); continue; }
    ids.add(element.id);
    elements.push(element);
  }
  const byId = new Map(elements.map(element => [element.id, element]));
  const shapes = elements.filter(element => shapeTypes.has(element.type));
  const texts = elements.filter(element => element.type === 'text');
  const arrows = elements.filter(element => element.type === 'arrow');
  const boundary = element => element?.isBoundary === true || element?.type === 'frame';
  const title = element => boundary(element) || boundary(byId.get(element.containerId));
  const severity = (...values) => values.some(element => element.approximate) ? 'warning' : 'error';
  const approximate = (...values) => values.some(element => element.approximate);

  for (const label of texts) {
    if (!label.containerId) continue;
    const container = byId.get(label.containerId);
    if (!container) { missing(label.id, `Container ${label.containerId} has no measured geometry`); continue; }
    if (container.type === 'arrow' || title(label)) continue;
    const overflow = Math.max(0, ...label.polygon.map(p => -margin(container.polygon, p)));
    if (overflow > tolerance) add('text-overflow', severity(label, container), [label, container],
      `Text ${label.id} extends outside ${container.id}`, { overflow: number(overflow), tolerance, approximate: approximate(label, container) });
  }
  for (let left = 0; left < shapes.length; left++) for (let right = left + 1; right < shapes.length; right++) {
    const a = shapes[left], b = shapes[right];
    if (boundary(a) || boundary(b)) continue;
    if (['x', 'y', 'width', 'height'].every(key => Math.abs(a.bounds[key] - b.bounds[key]) <= tolerance)) {
      add('box-coincident', 'warning', [a, b], `Boxes ${a.id} and ${b.id} share the same bounds`,
        { tolerance, approximate: approximate(a, b) });
      continue;
    }
    if (contains(a, b, tolerance) || contains(b, a, tolerance)) continue;
    const { depth } = separation(a.polygon, b.polygon);
    if (depth > tolerance) add('box-overlap', severity(a, b), [a, b], `Boxes ${a.id} and ${b.id} overlap`,
      { penetration: number(depth), tolerance, approximate: approximate(a, b) });
  }
  for (const route of arrows) {
    const endpoints = [route.startBinding?.elementId, route.endBinding?.elementId].filter(Boolean);
    for (const target of shapes) {
      if (boundary(target) || endpoints.includes(target.id)
        || endpoints.some(id => byId.has(id) && contains(target, byId.get(id), tolerance))) continue;
      const length = insideLength(route.points, target.polygon, tolerance);
      if (length > tolerance) add('arrow-box-crossing', severity(route, target), [route, target],
        `Arrow ${route.id} crosses unrelated box ${target.id}`, { insideLength: number(length), tolerance, approximate: approximate(route, target) });
    }
    for (const label of texts) {
      if (label.containerId === route.id || endpoints.includes(label.containerId)) continue;
      const length = insideLength(route.points, label.polygon, tolerance);
      if (length > tolerance) add('arrow-text-crossing', severity(route, label), [route, label],
        `Arrow ${route.id} crosses unrelated text ${label.id}`, { insideLength: number(length), tolerance, approximate: approximate(route, label) });
    }
  }
  for (let left = 0; left < texts.length; left++) for (let right = left + 1; right < texts.length; right++) {
    const a = texts[left], b = texts[right];
    const { depth, gap } = separation(a.polygon, b.polygon);
    if (depth > tolerance) add('text-overlap', severity(a, b), [a, b], `Text ${a.id} and ${b.id} overlap`,
      { penetration: number(depth), tolerance, approximate: approximate(a, b) });
    else if (gap >= 0 && gap < textGap) add('text-clearance', 'warning', [a, b], `Text ${a.id} and ${b.id} have little separation`,
      { clearance: number(gap), target: textGap, approximate: approximate(a, b) });
  }
  if (options.alignmentGroups != null && !Array.isArray(options.alignmentGroups)) missing('alignment-groups', 'Alignment groups must be an array');
  for (const group of Array.isArray(options.alignmentGroups) ? options.alignmentGroups : []) {
    if (!Array.isArray(group?.ids) || group.ids.length < 2 || new Set(group.ids).size !== group.ids.length
      || !['x', 'y'].includes(group.axis) || group.anchor != null && !['start', 'center', 'end'].includes(group.anchor)) {
      missing('alignment-group', 'Alignment group needs element IDs and an x or y axis'); continue;
    }
    const members = group.ids.map(id => byId.get(id));
    if (members.some(element => !element || element.type === 'arrow')) { missing('alignment-group', 'Alignment group has unmeasured members'); continue; }
    const axis = group.axis, size = axis === 'x' ? 'width' : 'height';
    const factor = group.anchor === 'start' ? 0 : group.anchor === 'end' ? 1 : .5;
    const positions = members.map(element => element.bounds[axis] + element.bounds[size] * factor);
    const deviation = Math.max(...positions) - Math.min(...positions);
    const limit = finite(group.tolerance) && group.tolerance >= 0 ? group.tolerance : 2;
    if (deviation > limit) add('alignment', 'warning', members, `Declared ${axis} alignment differs across group members`,
      { axis, anchor: group.anchor || 'center', deviation: number(deviation), tolerance: limit });
    if (group.spacing === 'equal' && members.length > 2) {
      const cross = axis === 'x' ? 'y' : 'x', crossSize = axis === 'x' ? 'height' : 'width';
      const sorted = [...members].sort((a, b) => a.bounds[cross] - b.bounds[cross]);
      const gaps = sorted.slice(1).map((element, index) => element.bounds[cross] - sorted[index].bounds[cross] - sorted[index].bounds[crossSize]);
      const difference = Math.max(...gaps) - Math.min(...gaps);
      if (difference > limit) add('spacing', 'warning', sorted, 'Declared equal gaps differ across group members',
        { axis: cross, gaps: gaps.map(number), deviation: number(difference), tolerance: limit });
    }
  }
  const counts = { error: issues.filter(issue => issue.severity === 'error').length, warning: issues.filter(issue => issue.severity === 'warning').length };
  return { status: unavailable ? 'unavailable' : counts.error ? 'fail' : 'pass', issues, counts, observedElements: elements.length };
}
