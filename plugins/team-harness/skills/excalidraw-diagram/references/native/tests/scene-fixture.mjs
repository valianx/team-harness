const base = (id, type, x, y, width, height) => ({
  id, type, x, y, width, height, angle: 0, strokeColor: '#1e1e1e', backgroundColor: 'transparent',
  fillStyle: 'solid', strokeWidth: 2, strokeStyle: 'solid', roughness: 0, opacity: 100,
  groupIds: [], frameId: null, roundness: null, seed: 1, version: 1, versionNonce: 1,
  isDeleted: false, boundElements: null, updated: 1, link: null, locked: false,
});

export function fixture() {
  const cardA = { ...base('card-a', 'rectangle', 100, 220, 180, 140), backgroundColor: '#dbe4ff',
    boundElements: [{ id: 'request', type: 'arrow' }, { id: 'response', type: 'arrow' }] };
  const cardB = { ...base('card-b', 'rectangle', 620, 300, 180, 140), backgroundColor: '#d3f9d8',
    boundElements: [{ id: 'request', type: 'arrow' }, { id: 'response', type: 'arrow' }] };
  const arrow = (id, x, y, points, source, target, sy, ty, labelId) => ({
    ...base(id, 'arrow', x, y, points.at(-1)[0], points.at(-1)[1]),
    elbowed: true, points, fixedSegments: null, startIsSpecial: null, endIsSpecial: null,
    startBinding: { elementId: source, fixedPoint: [source === 'card-a' ? 1 : 0, sy], mode: 'orbit' },
    endBinding: { elementId: target, fixedPoint: [target === 'card-b' ? 0 : 1, ty], mode: 'orbit' },
    startArrowhead: null, endArrowhead: 'arrow', boundElements: [{ id: labelId, type: 'text' }],
  });
  const label = (id, text, containerId, labelPosition) => ({
    ...base(id, 'text', 350, 180, 80, 25), text, originalText: text, fontSize: 20,
    fontFamily: 3, textAlign: 'center', verticalAlign: 'middle', containerId,
    autoResize: true, lineHeight: 1.2, labelPosition,
  });
  return { type: 'excalidraw', version: 2, source: 'synthetic-native-integrity', files: {},
    appState: { viewBackgroundColor: '#ffffff', scrollX: 0, scrollY: 0, zoom: { value: 1 } },
    elements: [cardA, cardB,
      arrow('request', 285, 255, [[0, 0], [155, 0], [155, 80], [330, 80]], 'card-a', 'card-b', 0.25, 0.25, 'request-label'),
      arrow('response', 615, 405, [[0, 0], [-155, 0], [-155, -80], [-330, -80]], 'card-b', 'card-a', 0.75, 0.75, 'response-label'),
      label('request-label', 'Submit', 'request', 0.2),
      label('response-label', 'Return', 'response', 0.75),
      { ...label('human-note', 'Human note', null, null), x: 100, y: 500, customData: { human: true } },
    ] };
}

/** A measured two-line label needs room for native masks and complete arrowheads. */
export function labelClearanceFixture(length) {
  const scene = fixture();
  const byId = new Map(scene.elements.map(element => [element.id, element]));
  scene.elements = ['card-a', 'card-b', 'request', 'request-label', 'human-note'].map(id => byId.get(id));
  for (const id of ['card-a', 'card-b']) byId.get(id).boundElements = [{ id: 'request', type: 'arrow' }];
  Object.assign(byId.get('card-b'), { x: 290 + length, y: 220 });
  Object.assign(byId.get('request'), { x: 285, y: 290, width: length, height: 0, points: [[0, 0], [length, 0]],
    startBinding: { elementId: 'card-a', fixedPoint: [1, 0.5001], mode: 'orbit' },
    endBinding: { elementId: 'card-b', fixedPoint: [0, 0.5001], mode: 'orbit' } });
  Object.assign(byId.get('request-label'), { x: 0, y: 0, text: 'Write\nrecord', originalText: 'Write\nrecord', width: 80, height: 55,
    fontSize: 22, lineHeight: 1.25, labelPosition: 0.5 });
  return scene;
}

/** A wide annotation is legitimate in an overview but makes per-flow text too small. */
export function presentationFixture(wide = true) {
  const scene = fixture();
  for (const id of ['card-a', 'card-b']) {
    const card = scene.elements.find(element => element.id === id);
    const text = id === 'card-a' ? 'Writer' : 'Archive';
    const labelId = `${id}-label`;
    card.boundElements.push({ id: labelId, type: 'text' });
    scene.elements.push({ ...base(labelId, 'text', card.x + 10, card.y + 10, 100, 28), text, originalText: text, fontSize: 22,
      fontFamily: 3, textAlign: 'center', verticalAlign: 'middle', containerId: id, autoResize: true, lineHeight: 1.25 });
  }
  for (const element of scene.elements) if (element.type === 'text' && element.containerId?.match(/request|response/)) element.labelPosition = 0.5;
  if (wide) scene.elements.find(element => element.id === 'human-note').x = 2200;
  return scene;
}
