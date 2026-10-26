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
  return { svg: svg.outerHTML, png, labels, labelChecks };
};

window.__nativeReady = true;
