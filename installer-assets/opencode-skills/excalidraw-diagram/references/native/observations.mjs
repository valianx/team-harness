const point = (matrix, x, y) => {
  const value = new DOMPoint(x, y).matrixTransform(matrix);
  return { x: value.x, y: value.y };
};
const matrixIn = (svg, node) => svg.getCTM().inverse().multiply(node.getCTM());
const boxOf = points => {
  const xs = points.map(value => value.x), ys = points.map(value => value.y);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
};
const directText = group => [...group.children].filter(child => child.localName === 'text');
const hull = points => {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const side = values => values.reduce((result, value) => {
    while (result.length > 1 && cross(result.at(-2), result.at(-1), value) <= 1e-7) result.pop();
    result.push(value); return result;
  }, []);
  return [...side(sorted).slice(0, -1), ...side([...sorted].reverse()).slice(0, -1)];
};

/** Resolve a native bound label through optional frame clipping wrappers. */
export function nativeLabelGroup(svg, arrowId) {
  const mask = [...svg.querySelectorAll('mask')].find(value => value.id === `mask-${arrowId}`);
  const next = mask?.nextElementSibling || mask?.parentElement?.nextElementSibling;
  return next?.hasAttribute('clip-path') ? next.querySelector('g') : next;
}

/** Locate the native painted shaft without interpolating element IDs into selectors. */
export function nativeArrowPaint(svg, arrowId) {
  return [...svg.querySelectorAll('[mask]')].find(value => value.getAttribute('mask') === `url(#mask-${arrowId})`);
}

function exportOrigin(svg, elements, commonBounds) {
  for (const arrow of elements.filter(value => value.type === 'arrow' && !value.angle)) {
    const shaft = nativeArrowPaint(svg, arrow.id)?.firstElementChild;
    if (shaft) {
      const origin = point(matrixIn(svg, shaft), 0, 0);
      return { x: origin.x - arrow.x, y: origin.y - arrow.y, approximate: false };
    }
  }
  const groups = [...svg.querySelectorAll('g')].filter(group => directText(group).length);
  for (const text of elements.filter(value => value.type === 'text' && !value.angle)) {
    const matching = groups.filter(group => directText(group).map(node => node.textContent).join('\n') === text.text);
    if (matching.length === 1) {
      const origin = point(matrixIn(svg, matching[0]), 0, 0);
      return { x: origin.x - text.x, y: origin.y - text.y, approximate: false };
    }
  }
  const [x, y, maxX, maxY] = commonBounds;
  // A frame-only export has no identifiable shaft/text anchor; retain that uncertainty.
  return { x: 40 - x, y: 40 - y + Math.max(0, svg.viewBox.baseVal.height - (maxY - y) - 80), approximate: true };
}

function shapePolygon(element, origin) {
  const { x, y, width, height, angle = 0 } = element;
  const cx = x + width / 2, cy = y + height / 2;
  let points;
  if (element.type === 'ellipse') points = Array.from({ length: 48 }, (_, index) => {
    const t = index * Math.PI / 24;
    return [cx + Math.cos(t) * width / 2, cy + Math.sin(t) * height / 2];
  });
  else if (element.type === 'diamond') points = [[cx, y], [x + width, cy], [cx, y + height], [x, cy]];
  else points = [[x, y], [x + width, y], [x + width, y + height], [x, y + height]];
  return points.map(([px, py]) => ({ x: origin.x + cx + Math.cos(angle) * (px - cx) - Math.sin(angle) * (py - cy),
    y: origin.y + cy + Math.sin(angle) * (px - cx) + Math.cos(angle) * (py - cy) }));
}

function textPolygon(svg, group) {
  const points = directText(group).flatMap(node => {
    const box = node.getBBox(), matrix = matrixIn(svg, node);
    return [[box.x, box.y], [box.x + box.width, box.y], [box.x + box.width, box.y + box.height], [box.x, box.y + box.height]]
      .map(([x, y]) => point(matrix, x, y));
  });
  const matrix = matrixIn(svg, group), inverse = matrix.inverse();
  const local = boxOf(points.map(value => point(inverse, value.x, value.y)));
  return [[local.x, local.y], [local.x + local.width, local.y], [local.x + local.width, local.y + local.height], [local.x, local.y + local.height]]
    .map(([x, y]) => point(matrix, x, y));
}

function paintedShape(svg, element, origin) {
  const groups = [...svg.querySelectorAll('g[stroke-linecap][transform]')];
  for (const group of groups) {
    const matrix = matrixIn(svg, group), actual = point(matrix, 0, 0);
    const rotatedOrigin = shapePolygon({ ...element, type: 'rectangle' }, origin)[0];
    if (Math.hypot(actual.x - rotatedOrigin.x, actual.y - rotatedOrigin.y) > .1) continue;
    const path = [...group.children].find(node => node.localName === 'path' && node.getAttribute('fill') !== 'none' && node.getAttribute('stroke') === 'none');
    if (!path) continue;
    const bounds = path.getBBox();
    if (Math.abs(bounds.width - element.width) > 4 || Math.abs(bounds.height - element.height) > 4) continue;
    const length = path.getTotalLength(), count = Math.min(256, Math.max(24, Math.ceil(length / 6)));
    const sampled = Array.from({ length: count }, (_, index) => { const p = path.getPointAtLength(length * index / count); return point(matrixIn(svg, path), p.x, p.y); });
    // Native convex shapes can contain repeated almost-collinear Bézier samples.
    return hull(sampled);
  }
  return null;
}

/** Observe recovered geometry and font-ready SVG glyph bounds in one export coordinate system. */
export function observeComposition(svg, elements, commonBounds) {
  const origin = exportOrigin(svg, elements, commonBounds);
  const groups = [...svg.querySelectorAll('g')].filter(group => directText(group).length);
  const used = new Set();
  const byId = new Map(elements.map(value => [value.id, value]));
  const observed = elements.map(element => {
    const base = { id: element.id, type: element.type, containerId: element.containerId, frameId: element.frameId,
      groupIds: element.groupIds, startBinding: element.startBinding, endBinding: element.endBinding };
    if (element.type === 'text') {
      const container = byId.get(element.containerId);
      let group = container?.type === 'arrow' ? nativeLabelGroup(svg, container.id) : null;
      if (!group) {
        const target = { x: element.x + element.width / 2 + origin.x, y: element.y + element.height / 2 + origin.y };
        const candidates = groups.filter(value => !used.has(value) && directText(value).map(node => node.textContent).join('\n') === element.text);
        group = candidates.sort((a, b) => {
          const distance = value => { const box = boxOf(textPolygon(svg, value)); return Math.hypot(box.x + box.width / 2 - target.x, box.y + box.height / 2 - target.y); };
          return distance(a) - distance(b);
        })[0];
      }
      if (!group || !directText(group).length) return { ...base, bounds: null };
      used.add(group);
      const polygon = textPolygon(svg, group);
      return { ...base, bounds: boxOf(polygon), polygon, text: element.text };
    }
    if (element.type === 'arrow') {
      const paint = nativeArrowPaint(svg, element.id)?.firstElementChild;
      const paths = paint ? [...paint.querySelectorAll('path')] : [];
      const path = paths.sort((a, b) => b.getTotalLength() - a.getTotalLength())[0];
      let points;
      if (path) {
        const length = path.getTotalLength(), count = Math.min(4096, Math.max(2, Math.ceil(length / 3)));
        const matrix = matrixIn(svg, path);
        points = Array.from({ length: count + 1 }, (_, index) => { const p = path.getPointAtLength(length * index / count); return point(matrix, p.x, p.y); });
      } else points = (element.points || []).map(([x, y]) => ({ x: x + element.x + origin.x, y: y + element.y + origin.y }));
      return { ...base, points, bounds: points.length ? boxOf(points) : null, approximate: !path || origin.approximate };
    }
    const fallback = shapePolygon(element, origin);
    const painted = ['rectangle', 'ellipse', 'diamond'].includes(element.type) ? paintedShape(svg, element, origin) : null;
    const polygon = painted || fallback;
    const boundary = element.type === 'frame' || element.customData?.layoutBoundary === true ||
      elements.filter(value => value.id !== element.id && ['rectangle', 'ellipse', 'diamond'].includes(value.type) &&
        value.x >= element.x && value.y >= element.y && value.x + value.width <= element.x + element.width && value.y + value.height <= element.y + element.height).length >= 3;
    return { ...base, polygon, bounds: boxOf(polygon), isBoundary: boundary,
      approximate: origin.approximate || element.roughness > 0 || !painted && Boolean(element.roundness) ||
        !['rectangle', 'ellipse', 'diamond', 'frame'].includes(element.type) };
  });
  return { origin, elements: observed, coordinateSpace: 'native-svg', viewBox: {
    x: svg.viewBox.baseVal.x, y: svg.viewBox.baseVal.y, width: svg.viewBox.baseVal.width, height: svg.viewBox.baseVal.height } };
}
