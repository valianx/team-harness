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
      label('response-label', 'Return', 'response', 0.8),
      { ...label('human-note', 'Human note', null, null), x: 100, y: 500, customData: { human: true } },
    ] };
}
