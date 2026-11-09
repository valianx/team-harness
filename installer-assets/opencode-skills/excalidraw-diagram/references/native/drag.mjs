const shapes = new Set(['rectangle', 'ellipse', 'diamond', 'image', 'embeddable', 'frame']);
const finite = value => Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER;
const deltas = [{ x: 60, y: 45 }, { x: -60, y: 45 }, { x: 60, y: -45 }, { x: -60, y: -45 },
  { x: 75, y: 0 }, { x: -75, y: 0 }, { x: 0, y: 75 }, { x: 0, y: -75 }];
const unavailable = reason => ({ status: 'unavailable', reason });
const point = value => value && finite(value.x) && finite(value.y);

function geometry(element) {
  if (!['x', 'y', 'width', 'height'].every(key => finite(element[key])) || element.width <= 0 || element.height <= 0
    || !finite(element.angle ?? 0)) return null;
  const cx = element.x + element.width / 2, cy = element.y + element.height / 2;
  const cosine = Math.cos(element.angle || 0), sine = Math.sin(element.angle || 0);
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => ({
    x: cx + cosine * x * element.width / 2 - sine * y * element.height / 2,
    y: cy + sine * x * element.width / 2 + cosine * y * element.height / 2,
  }));
  const left = Math.min(...corners.map(p => p.x)), top = Math.min(...corners.map(p => p.y));
  const right = Math.max(...corners.map(p => p.x)), bottom = Math.max(...corners.map(p => p.y));
  if (![cx, cy, left, top, right, bottom].every(finite)) return null;
  return { element, corners, bounds: { left, top, right, bottom }, area: element.width * element.height };
}

function contains(parent, child, delta = { x: 0, y: 0 }) {
  const { element } = parent, angle = -(element.angle || 0);
  const cx = element.x + element.width / 2, cy = element.y + element.height / 2;
  return child.corners.every(p => {
    const x = p.x + delta.x - cx, y = p.y + delta.y - cy;
    return Math.abs(Math.cos(angle) * x - Math.sin(angle) * y) <= element.width / 2 + 1e-6
      && Math.abs(Math.sin(angle) * x + Math.cos(angle) * y) <= element.height / 2 + 1e-6;
  });
}

function clear(bounds, obstacle, delta) {
  return bounds.right + delta.x + 8 <= obstacle.left || bounds.left + delta.x - 8 >= obstacle.right
    || bounds.bottom + delta.y + 8 <= obstacle.top || bounds.top + delta.y - 8 >= obstacle.bottom;
}

/**
 * Plan a native pointer drag into clear space without changing the scene. Candidates
 * retain at least 20 scene units of movement, eight units of unrelated-shape clearance,
 * and existing enclosing bounds. A ready destination uses the element's native x/y/size.
 */
export function planDrag(elements, targetId, { zoom = 1, viewportPoint, viewport, pointerDeltas = deltas } = {}) {
  if (!Array.isArray(elements) || !finite(zoom) || zoom <= 0) return unavailable('A finite positive editor zoom and scene are required');
  if (typeof targetId !== 'string' || !targetId) return unavailable('A target identity is required');
  if (!Array.isArray(pointerDeltas) || !pointerDeltas.length || !pointerDeltas.every(point)) return unavailable('Valid pointer candidates are required');
  const live = elements.filter(element => element && !element.isDeleted);
  const target = live.find(element => element.id === targetId && shapes.has(element.type) && element.type !== 'frame');
  const arrows = live.filter(element => element.type === 'arrow' && [element.startBinding?.elementId, element.endBinding?.elementId].includes(targetId));
  if (!target || !Array.isArray(target.boundElements) || !arrows.some(arrow => target.boundElements.some(bound => bound?.type === 'arrow' && bound.id === arrow.id))) {
    return unavailable('Target must have a live reciprocal native arrow binding');
  }
  const measured = live.filter(element => shapes.has(element.type)).map(geometry);
  if (measured.some(value => !value)) return unavailable('Shape geometry is invalid or unavailable');
  const current = measured.find(value => value.element === target);
  if (measured.some(value => value !== current && current.area > value.area + 1e-6 && contains(current, value))) {
    return unavailable('A compound container requires a separate edit proof');
  }
  const parents = measured.filter(value => value !== current && value.area > current.area + 1e-6 && contains(value, current));
  if (target.frameId) {
    const frame = measured.find(value => value.element.id === target.frameId && value.element.type === 'frame');
    if (!frame || !contains(frame, current)) return unavailable('The target frame must exist and contain the target');
    if (!parents.includes(frame)) parents.push(frame);
  }
  const obstacles = measured.filter(value => value !== current && !parents.includes(value));
  if (viewport || viewportPoint) {
    if (!viewport || !point(viewportPoint) || !finite(viewport.width) || !finite(viewport.height)
      || viewport.width <= 0 || viewport.height <= 0) return unavailable('Viewport and pointer position must both be measurable');
  }
  for (const pointerDelta of pointerDeltas) {
    const sceneDelta = { x: pointerDelta.x / zoom, y: pointerDelta.y / zoom };
    if (!point(sceneDelta) || Math.hypot(sceneDelta.x, sceneDelta.y) < 20) continue;
    if (parents.some(parent => !contains(parent, current, sceneDelta))
      || obstacles.some(obstacle => !clear(current.bounds, obstacle.bounds, sceneDelta))) continue;
    if (viewport) {
      const halfWidth = (current.bounds.right - current.bounds.left) * zoom / 2;
      const halfHeight = (current.bounds.bottom - current.bounds.top) * zoom / 2;
      const x = viewportPoint.x + pointerDelta.x, y = viewportPoint.y + pointerDelta.y;
      if (x - halfWidth < 12 || x + halfWidth > viewport.width - 12 || y - halfHeight < 12 || y + halfHeight > viewport.height - 12) continue;
    }
    const destination = { x: target.x + sceneDelta.x, y: target.y + sceneDelta.y, width: target.width, height: target.height };
    if (!Object.values(destination).every(finite)) continue;
    return { status: 'ready', pointerDelta: { ...pointerDelta }, sceneDelta, destination };
  }
  return unavailable('No candidate preserves free space, containment and the native movement threshold');
}
