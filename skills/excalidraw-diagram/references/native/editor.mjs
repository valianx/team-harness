import React from 'react';
import { createRoot } from 'react-dom/client';
import 'official-sdk/index.css';

window.EXCALIDRAW_ASSET_PATH = `/node_modules/${new URLSearchParams(location.search).get('sdk') === 'stable' ? 'excalidraw-stable' : '@excalidraw/excalidraw'}/dist/prod/`;
const sdk = await import('official-sdk');
let api;
const root = createRoot(document.getElementById('editor'));
const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
const fontState = elements => {
  const families = [...new Set(elements.filter(element => element.type === 'text').map(element => element.fontFamily))].map(id => {
    const registered = sdk.Fonts?.registered.get(id);
    const faces = registered?.fontFaces.map(face => face.fontFace) || [];
    const characters = elements.filter(element => element.type === 'text' && element.fontFamily === id).map(element => element.text).join('');
    const ready = Boolean(registered) && (Boolean(registered.metadata.local)
      || faces.some(face => face.status === 'loaded') && document.fonts.check(`20px "${faces[0].family}"`, characters));
    return { id, local: Boolean(registered?.metadata.local), faces: faces.map(face => ({ family: face.family, status: face.status })), ready };
  });
  return { ready: Boolean(sdk.Fonts) && families.every(family => family.ready), families };
};

window.mountScene = async scene => {
  let loaded = [];
  if (sdk.Fonts) loaded = await sdk.Fonts.loadElementsFonts(scene.elements);
  await document.fonts.ready;
  const before = fontState(scene.elements);
  if (sdk.Fonts && !before.ready) return { ...before, sdkFontLoader: true, loaded: [] };
  const elements = sdk.restoreElements(scene.elements, null, { repairBindings: true, refreshDimensions: true });
  await new Promise(resolve => root.render(React.createElement(sdk.Excalidraw, {
    initialData: { elements, appState: { ...scene.appState, theme: 'light', zenModeEnabled: true }, files: scene.files || {} },
    excalidrawAPI: value => { api = value; resolve(); },
    onInitialize: value => { api = value; resolve(); },
    langCode: 'en', theme: 'light', zenModeEnabled: true, ui: false,
  })));
  await frame();
  await frame();
  if (api.setViewport) api.setViewport({ target: api.getSceneElements(), fit: 'scale-down', animation: false });
  else api.scrollToContent(api.getSceneElements(), { fitToContent: true, animate: false });
  await frame();
  await frame();
  if (sdk.Fonts) loaded.push(...await sdk.Fonts.loadElementsFonts(api.getSceneElements()));
  await document.fonts.ready;
  return { ...fontState(api.getSceneElements()),
    sdkFontLoader: Boolean(sdk.Fonts), loaded: loaded.map(font => ({ family: font.family, status: font.status })) };
};

window.recoverScene = () => JSON.parse(sdk.serializeAsJSON(api.getSceneElementsIncludingDeleted(), api.getAppState(), api.getFiles(), 'local'));

window.getDragPoint = id => {
  const element = api.getSceneElements().find(value => value.id === id);
  if (!element) throw new Error(`No editable element ${id}`);
  api.updateScene({ appState: { selectedElementIds: { [id]: true } } });
  return sdk.sceneCoordsToViewportCoords({ sceneX: element.x + element.width / 2, sceneY: element.y + element.height / 2 }, api.getAppState());
};

// Native SVG head footprints include stroke clearance; the intended shaft cutout is allowed.
function footprint(svg, element) {
  const box = element.getBBox(), style = getComputedStyle(element);
  const inset = style.stroke === 'none' ? 0 : parseFloat(style.strokeWidth) / 2;
  const matrix = svg.getCTM().inverse().multiply(element.getCTM());
  return [[box.x - inset, box.y - inset], [box.x + box.width + inset, box.y - inset],
    [box.x + box.width + inset, box.y + box.height + inset], [box.x - inset, box.y + box.height + inset]]
    .map(([x, y]) => { const point = new DOMPoint(x, y).matrixTransform(matrix); return { x: point.x, y: point.y }; });
}

function clearance(a, b) {
  let gap = -Infinity, overlap = Infinity;
  for (const polygon of [a, b]) for (let index = 0; index < polygon.length; index++) {
    const p = polygon[index], q = polygon[(index + 1) % polygon.length], length = Math.hypot(q.x - p.x, q.y - p.y);
    if (!length) continue;
    const project = points => points.map(point => ((q.y - p.y) * point.x - (q.x - p.x) * point.y) / length);
    const pa = project(a), pb = project(b);
    gap = Math.max(gap, Math.min(...pb) - Math.max(...pa), Math.min(...pa) - Math.max(...pb));
    overlap = Math.min(overlap, Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb)));
  }
  return gap > 0 ? gap : -overlap;
}

function contains(polygon, point) {
  const crosses = polygon.map((p, index) => { const q = polygon[(index + 1) % polygon.length]; return (q.x - p.x) * (point.y - p.y) - (q.y - p.y) * (point.x - p.x); });
  return crosses.every(value => value >= 0) || crosses.every(value => value <= 0);
}

function observeLabelVisibility(svg, elements) {
  const selector = 'path, polygon, polyline, line, circle, ellipse, rect';
  const primitives = element => element.matches(selector) ? [element] : [...element.querySelectorAll(selector)];
  return elements.filter(element => element.type === 'arrow').flatMap(arrow => {
    const label = elements.find(element => element.type === 'text' && element.containerId === arrow.id);
    if (!label) return [];
    const base = { arrowId: arrow.id, labelId: label.id };
    try {
      const mask = document.getElementById(`mask-${arrow.id}`);
      const paint = [...svg.querySelectorAll('[mask]')].find(element => element.getAttribute('mask') === `url(#mask-${arrow.id})`);
      const rectangles = [...(mask?.querySelectorAll('rect') || [])].filter(rect => getComputedStyle(rect).fill === 'rgb(0, 0, 0)' && Number(getComputedStyle(rect).opacity) > 0);
      if (!paint?.firstElementChild || mask?.getAttribute('maskUnits') !== 'userSpaceOnUse' || !rectangles.length) {
        return [{ ...base, status: 'fail', clearance: null, error: 'Native label-mask geometry is unavailable' }];
      }
      const masks = rectangles.map(rect => footprint(svg, rect));
      // The pinned native exporter paints the shaft first, followed by its head primitives.
      const body = primitives(paint.firstElementChild).map(element => footprint(svg, element));
      const heads = [...paint.children].slice(1).flatMap(primitives).map(element => footprint(svg, element));
      const headClearances = heads.map(head => Math.min(...masks.map(mask => clearance(head, mask))));
      const shaftFullyMasked = body.length > 0 && body.every(path => masks.some(mask => path.every(point => contains(mask, point))));
      const missingHead = (arrow.startArrowhead || arrow.endArrowhead) && !heads.length;
      const minimum = headClearances.length ? Math.min(...headClearances) : null;
      const failed = missingHead || shaftFullyMasked || headClearances.some(value => !Number.isFinite(value) || value <= 0);
      return [{ ...base, status: failed ? 'fail' : 'pass', clearance: minimum, headClearances, headFootprints: heads,
        labelMaskFootprints: masks, shaftFullyMasked, ...(missingHead ? { error: 'Native arrowhead geometry is unavailable' } : {}) }];
    } catch (error) {
      return [{ ...base, status: 'fail', clearance: null, error: `Native label-mask measurement failed: ${error.message}` }];
    }
  });
}

function observeTypography(svg, elements) {
  const directText = group => [...group.children].filter(child => child.localName === 'text');
  const groups = [...svg.querySelectorAll('g')].filter(group => directText(group).length);
  const fontSizes = group => directText(group).map(text => {
    const matrix = svg.getCTM().inverse().multiply(text.getCTM());
    return parseFloat(text.getAttribute('font-size')) * Math.hypot(matrix.a, matrix.b);
  });
  return elements.filter(element => element.type === 'text').map(element => {
    const container = elements.find(value => value.id === element.containerId);
    const role = container?.type === 'arrow' ? 'relationship' : container ? 'component' : 'unbound';
    try {
      let group;
      if (role === 'relationship') group = document.getElementById(`mask-${container.id}`)?.nextElementSibling;
      else {
        const matching = groups.filter(group => directText(group).map(text => text.textContent).join('\n') === element.text);
        // Size only disambiguates duplicate text; missing SVG measurements never use the scene value.
        group = matching.length === 1 ? matching[0] : matching.find(group => fontSizes(group).every(size => Math.abs(size - element.fontSize) < .001));
      }
      const sizes = group ? fontSizes(group) : [];
      const measured = sizes.length > 0 && sizes.every(size => Number.isFinite(size) && size > 0);
      return { id: element.id, role, text: element.text, fontSize: measured ? Math.min(...sizes) : null,
        ...(measured ? {} : { error: 'Actual native SVG font geometry is unavailable' }) };
    } catch (error) {
      return { id: element.id, role, text: element.text, fontSize: null, error: `Native font measurement failed: ${error.message}` };
    }
  });
}

window.exportScene = async scale => {
  const elements = api.getSceneElements();
  if (sdk.Fonts) await sdk.Fonts.loadElementsFonts(elements);
  await document.fonts.ready;
  const options = { elements, appState: { ...api.getAppState(), exportBackground: true, exportWithDarkMode: false }, files: api.getFiles(), exportPadding: 40 };
  const svg = sdk.exportScene
    ? await sdk.exportScene({ type: 'svg', data: options, config: { padding: 40, theme: 'light' } })
    : await sdk.exportToSvg(options);
  document.getElementById('export').replaceChildren(svg);
  const blob = sdk.exportScene
    ? await sdk.exportScene({ type: 'png', data: options, config: { padding: 40, scale, theme: 'light' } })
    : await sdk.exportToBlob({ ...options, mimeType: 'image/png', getDimensions: (width, height) => ({ width, height, scale }) });
  const png = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.readAsDataURL(blob); });
  const labels = [...svg.querySelectorAll('text')].map(text => {
    const bounds = text.getBBox();
    const point = svg.createSVGPoint();
    point.x = bounds.x + bounds.width / 2;
    point.y = bounds.y + bounds.height / 2;
    const center = point.matrixTransform(text.getCTM());
    return { text: text.textContent, center: { x: center.x, y: center.y }, fontFamily: text.getAttribute('font-family') };
  });
  const [minX, minY] = sdk.getCommonBounds(elements);
  const labelChecks = elements.filter(element => element.type === 'text' && element.containerId && element.labelPosition != null).map(label => {
    const arrow = elements.find(element => element.id === label.containerId && element.type === 'arrow');
    if (!arrow) return null;
    const lengths = arrow.points.slice(1).map((point, index) => Math.hypot(point[0] - arrow.points[index][0], point[1] - arrow.points[index][1]));
    let distance = lengths.reduce((sum, length) => sum + length, 0) * label.labelPosition;
    let expected;
    for (let index = 0; index < lengths.length; index++) {
      if (distance <= lengths[index] || index === lengths.length - 1) {
        const ratio = lengths[index] ? distance / lengths[index] : 0;
        expected = { x: arrow.x + arrow.points[index][0] + (arrow.points[index + 1][0] - arrow.points[index][0]) * ratio - minX + 40,
          y: arrow.y + arrow.points[index][1] + (arrow.points[index + 1][1] - arrow.points[index][1]) * ratio - minY + 40 };
        break;
      }
      distance -= lengths[index];
    }
    const mask = [...svg.querySelectorAll('mask')].find(element => element.id === `mask-${arrow.id}`);
    const group = mask?.nextElementSibling;
    if (!group?.querySelector('text')) return { id: label.id, error: 'No identifiable native label export group' };
    const center = svg.createSVGPoint();
    center.x = label.width / 2;
    center.y = label.height / 2;
    const actual = center.matrixTransform(group.getCTM());
    return { id: label.id, expected, actual: { x: actual.x, y: actual.y }, errorDistance: Math.hypot(actual.x - expected.x, actual.y - expected.y) };
  }).filter(Boolean);
  return { svg: svg.outerHTML, png, labels, labelChecks, labelVisibilityChecks: observeLabelVisibility(svg, elements),
    typography: observeTypography(svg, elements), viewBox: { width: svg.viewBox.baseVal.width, height: svg.viewBox.baseVal.height } };
};

window.__nativeReady = true;
