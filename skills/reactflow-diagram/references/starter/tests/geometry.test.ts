import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkGeometry, segmentIntersects } from '../src/geometry';
import type { Architecture, Diagnostic, Geometry, PlacedNode, Relationship, Route } from '../src/types';

const evidence = [{ source: 'source', locator: 'Synthetic architecture' }];

function architecture(nodes: { id: string; parent?: string }[], edges: Omit<Relationship, 'evidence'>[] = [], groups: { id: string; parent?: string }[] = []): Architecture {
  return {
    schemaVersion: 1, title: 'Geometry oracle', theme: 'presentation', direction: 'right',
    sources: [{ id: 'source', title: 'Synthetic architecture', locator: 'source.md', status: 'read' }],
    nodes: nodes.map(node => ({ ...node, kind: 'service', label: node.id, evidence })),
    groups: groups.map(group => ({ ...group, label: group.id, evidence })),
    edges: edges.map(edge => ({ ...edge, evidence })),
    review: { unresolved: [], decisions: [] }, views: [], steps: [],
  };
}

function box(id: string, x: number, y: number, extra: Partial<PlacedNode> = {}): PlacedNode {
  return { id, x, y, absX: x, absY: y, width: 100, height: 100, headerHeight: 0, kind: 'service', ...extra };
}

function geometry(nodes: PlacedNode[], edges: Route[] = []): Geometry {
  return { nodes, edges, bounds: { width: 1400, height: 1000 } };
}

function horizontal(label = false): { model: Architecture; geometry: Geometry } {
  return {
    model: architecture([{ id: 'a' }, { id: 'b' }], [{ id: 'request', from: 'a', to: 'b', ...(label ? { label: 'Calls' } : {}) }]),
    geometry: geometry([box('a', 0, 200), box('b', 600, 200)], [{
      id: 'request', sourcePort: { x: 100, y: 250 }, targetPort: { x: 600, y: 250 },
      sections: [{ points: [{ x: 100, y: 250 }, { x: 600, y: 250 }] }],
      ...(label ? { label: { x: 300, y: 100, width: 100, height: 24, text: 'Calls' } } : {}),
    }]),
  };
}

function diagnostic(diagnostics: Diagnostic[], check: string | RegExp, ids: string[]) {
  assert.ok(diagnostics.some(value => (typeof check === 'string' ? value.check === check : check.test(value.check)) && ids.every(id => value.ids.includes(id))), JSON.stringify(diagnostics));
}

test('missing, duplicate and unknown placed identities cannot pass geometry validation', () => {
  const model = architecture([{ id: 'a' }]);
  diagnostic(checkGeometry(model, geometry([])), 'identity', ['a']);
  diagnostic(checkGeometry(model, geometry([box('a', 0, 0), box('a', 300, 0)])), 'identity', ['a']);
  diagnostic(checkGeometry(model, geometry([box('a', 0, 0), box('unknown', 300, 0)])), 'identity', ['unknown']);
});

test('node and route points outside root bounds are reported as clipping', () => {
  const example = horizontal();
  example.geometry.bounds.width = 650;
  diagnostic(checkGeometry(example.model, example.geometry), 'clipping', ['b']);
  example.geometry.bounds.width = 1400;
  example.geometry.edges[0].sections[0].points.splice(1, 0, { x: 300, y: -20 });
  diagnostic(checkGeometry(example.model, example.geometry), 'clipping', ['request']);
});

test('disconnected route sections and duplicate routes are rejected', () => {
  const example = horizontal();
  const route = example.geometry.edges[0];
  route.sections = [{ points: [{ x: 100, y: 250 }, { x: 300, y: 250 }] }, { points: [{ x: 350, y: 250 }, { x: 600, y: 250 }] }];
  diagnostic(checkGeometry(example.model, example.geometry), 'route', ['request']);
  example.geometry.edges.push(structuredClone(route));
  diagnostic(checkGeometry(example.model, example.geometry), 'identity', ['request']);
});

test('segment clipping sees middle intersections in either traversal direction', () => {
  const obstacle = { x: 100, y: 100, width: 80, height: 40 };
  assert.equal(segmentIntersects({ x: 0, y: 120 }, { x: 300, y: 120 }, obstacle), true);
  assert.equal(segmentIntersects({ x: 300, y: 120 }, { x: 0, y: 120 }, obstacle), true);
  assert.equal(segmentIntersects({ x: 120, y: 0 }, { x: 120, y: 300 }, obstacle), true);
  assert.equal(segmentIntersects({ x: 0, y: 0 }, { x: 300, y: 300 }, obstacle), true);
  assert.equal(segmentIntersects({ x: 0, y: 50 }, { x: 300, y: 50 }, obstacle), false);
});

test('segment clearance catches a near miss without inventing a body intersection', () => {
  const obstacle = { x: 100, y: 100, width: 80, height: 40 };
  assert.equal(segmentIntersects({ x: 0, y: 93 }, { x: 300, y: 93 }, obstacle), false);
  assert.equal(segmentIntersects({ x: 0, y: 93 }, { x: 300, y: 93 }, obstacle, 8), true);
});

test('nonancestor overlap identifies both rectangles', () => {
  const model = architecture([{ id: 'a' }, { id: 'b' }]);
  diagnostic(checkGeometry(model, geometry([box('a', 0, 0), box('b', 80, 80)])), 'overlap', ['a', 'b']);
  assert.deepEqual(checkGeometry(model, geometry([box('a', 0, 0), box('b', 300, 0)])), []);
});

test('valid ancestor containment is not reported as overlap', () => {
  const model = architecture([{ id: 'child', parent: 'group' }], [], [{ id: 'group' }]);
  const placed = geometry([
    box('group', 100, 100, { kind: 'group', width: 600, height: 400, headerHeight: 32 }),
    box('child', 32, 96, { parent: 'group', absX: 132, absY: 196 }),
  ]);
  assert.deepEqual(checkGeometry(model, placed), []);
});

for (const [name, x, y, absX, absY] of [
  ['left inset', 16, 96, 116, 196],
  ['reserved header', 32, 48, 132, 148],
  ['right inset', 500, 96, 600, 196],
  ['bottom inset', 32, 290, 132, 390],
] as const) {
  test(`child outside the ${name} fails containment`, () => {
    const model = architecture([{ id: 'child', parent: 'group' }], [], [{ id: 'group' }]);
    diagnostic(checkGeometry(model, geometry([
      box('group', 100, 100, { kind: 'group', width: 600, height: 400, headerHeight: 32 }),
      box('child', x, y, { parent: 'group', absX, absY }),
    ])), 'containment', ['child', 'group']);
  });
}

test('parent-relative and root-space positions must describe the same child', () => {
  const model = architecture([{ id: 'child', parent: 'group' }], [], [{ id: 'group' }]);
  diagnostic(checkGeometry(model, geometry([
    box('group', 100, 100, { kind: 'group', width: 600, height: 400, headerHeight: 32 }),
    box('child', 32, 96, { parent: 'group', absX: 999, absY: 196 }),
  ])), 'coordinates', ['child', 'group']);
});

test('root nodes cannot disagree with their root-space positions', () => {
  const model = architecture([{ id: 'a' }]);
  diagnostic(checkGeometry(model, geometry([box('a', 0, 0, { absX: 50 })])), 'coordinates', ['a']);
});

test('sibling clearance catches a 32-unit gap but accepts the 48-unit boundary', () => {
  const model = architecture([{ id: 'a' }, { id: 'b' }]);
  diagnostic(checkGeometry(model, geometry([box('a', 0, 0), box('b', 0, 132)])), 'spacing', ['a', 'b']);
  assert.deepEqual(checkGeometry(model, geometry([box('a', 0, 0), box('b', 0, 148)])), []);
});

for (const direction of ['right', 'down'] as const) {
  test(`${direction} layer clearance catches a 64-unit gap and accepts 96`, () => {
    const model = { ...architecture([{ id: 'a' }, { id: 'b' }]), direction };
    const tooClose = direction === 'right' ? box('b', 164, 0) : box('b', 0, 164);
    const valid = direction === 'right' ? box('b', 196, 0) : box('b', 0, 196);
    diagnostic(checkGeometry(model, geometry([box('a', 0, 0), tooClose])), 'layer-spacing', ['a', 'b']);
    assert.deepEqual(checkGeometry(model, geometry([box('a', 0, 0), valid])), []);
  });
}

test('a collision on the middle route section names the relationship and obstacle', () => {
  const fixture = horizontal();
  fixture.model.nodes.push({ id: 'obstacle', kind: 'service', label: 'Obstacle', evidence });
  fixture.geometry.nodes.push(box('obstacle', 300, 200));
  fixture.geometry.edges[0].sections = [
    { points: [{ x: 100, y: 250 }, { x: 200, y: 250 }] },
    { points: [{ x: 200, y: 250 }, { x: 500, y: 250 }] },
    { points: [{ x: 500, y: 250 }, { x: 600, y: 250 }] },
  ];
  diagnostic(checkGeometry(fixture.model, fixture.geometry), 'route-collision', ['request', 'obstacle']);
});

test('intended contacts at the source and target boundary are permitted', () => {
  const fixture = horizontal();
  assert.deepEqual(checkGeometry(fixture.model, fixture.geometry), []);
});

for (const direction of ['right', 'down'] as const) for (const endpoint of ['source', 'target'] as const) {
  test(`${direction} route cannot traverse its ${endpoint} body at the endpoint contact`, () => {
    const fixture = horizontal();
    const route = fixture.geometry.edges[0];
    const point = { x: endpoint === 'source' ? 0 : 700, y: 250 };
    if (endpoint === 'source') {
      route.sourcePort = point;
      route.sections[0].points[0] = point;
    } else {
      route.targetPort = point;
      route.sections[0].points[1] = point;
    }
    if (direction === 'down') {
      fixture.model.direction = 'down';
      for (const node of fixture.geometry.nodes) {
        [node.x, node.y] = [node.y, node.x];
        [node.absX, node.absY] = [node.absY, node.absX];
      }
      const rotate = ({ x, y }: { x: number; y: number }) => ({ x: y, y: x });
      route.sourcePort = rotate(route.sourcePort);
      route.targetPort = rotate(route.targetPort);
      route.sections[0].points = route.sections[0].points.map(rotate);
    }
    diagnostic(checkGeometry(fixture.model, fixture.geometry), 'route-collision', ['request', endpoint === 'source' ? 'a' : 'b']);
  });
}

function crossBoundary(): { model: Architecture; geometry: Geometry } {
  return {
    model: architecture([{ id: 'a', parent: 'group' }, { id: 'b' }], [{ id: 'request', from: 'a', to: 'b' }], [{ id: 'group' }]),
    geometry: geometry([
      box('group', 100, 100, { kind: 'group', width: 400, height: 400, headerHeight: 32 }),
      box('a', 32, 150, { parent: 'group', absX: 132, absY: 250 }),
      box('b', 800, 250),
    ], [{ id: 'request', sourcePort: { x: 232, y: 300 }, targetPort: { x: 800, y: 300 }, sections: [{ points: [{ x: 232, y: 300 }, { x: 800, y: 300 }] }] }]),
  };
}

test('crossing the endpoint ancestor boundary below its header is permitted', () => {
  const fixture = crossBoundary();
  assert.deepEqual(checkGeometry(fixture.model, fixture.geometry), []);
});

test('the ancestor-boundary exception never permits a reserved-header collision', () => {
  const fixture = crossBoundary();
  fixture.geometry.edges[0].sections = [{ points: [
    { x: 232, y: 300 }, { x: 250, y: 300 }, { x: 250, y: 120 },
    { x: 700, y: 120 }, { x: 700, y: 300 }, { x: 800, y: 300 },
  ] }];
  diagnostic(checkGeometry(fixture.model, fixture.geometry), 'route-collision', ['request', 'group']);
});

test('the ancestor-boundary exception never hides an unrelated child body', () => {
  const fixture = crossBoundary();
  fixture.model.nodes.push({ id: 'obstacle', kind: 'service', label: 'Obstacle', parent: 'group', evidence });
  fixture.geometry.nodes.push(box('obstacle', 250, 150, { parent: 'group', absX: 350, absY: 250 }));
  diagnostic(checkGeometry(fixture.model, fixture.geometry), 'route-collision', ['request', 'obstacle']);
});

test('a route that reenters its source after the initial contact is rejected', () => {
  const fixture = horizontal();
  fixture.geometry.edges[0].sections = [{ points: [
    { x: 100, y: 250 }, { x: 200, y: 250 }, { x: 200, y: 180 },
    { x: 50, y: 180 }, { x: 50, y: 250 }, { x: 600, y: 250 },
  ] }];
  diagnostic(checkGeometry(fixture.model, fixture.geometry), 'route-collision', ['request', 'a']);
});

test('a port detached outside the endpoint bounds is rejected', () => {
  const fixture = horizontal();
  fixture.geometry.edges[0].sourcePort = { x: 300, y: 250 };
  diagnostic(checkGeometry(fixture.model, fixture.geometry), 'port', ['request', 'a']);
});

test('a port in the middle of its endpoint body is not an attached boundary port', () => {
  const fixture = horizontal();
  fixture.geometry.edges[0].sourcePort = { x: 50, y: 250 };
  fixture.geometry.edges[0].sections[0].points[0] = { x: 50, y: 250 };
  diagnostic(checkGeometry(fixture.model, fixture.geometry), 'port', ['request', 'a']);
});

test('the computed path must actually start at its declared source port', () => {
  const fixture = horizontal();
  fixture.geometry.edges[0].sections[0].points[0] = { x: 200, y: 250 };
  diagnostic(checkGeometry(fixture.model, fixture.geometry), /port|route/, ['request']);
});

test('a missing relationship route is rejected', () => {
  const fixture = horizontal();
  fixture.geometry.edges = [];
  diagnostic(checkGeometry(fixture.model, fixture.geometry), 'route', ['request']);
});

for (const [name, points] of [
  ['no points', []],
  ['only one point', [{ x: 100, y: 250 }]],
] as const) {
  test(`a route section with ${name} cannot count as a computed route`, () => {
    const fixture = horizontal();
    fixture.geometry.edges[0].sections = [{ points: [...points] }];
    diagnostic(checkGeometry(fixture.model, fixture.geometry), 'route', ['request']);
  });
}

test('a required measured label cannot be silently omitted', () => {
  const fixture = horizontal(true);
  delete fixture.geometry.edges[0].label;
  diagnostic(checkGeometry(fixture.model, fixture.geometry), 'label', ['request']);
});

test('nonpositive label bounds are invalid', () => {
  const fixture = horizontal(true);
  fixture.geometry.edges[0].label!.width = 0;
  diagnostic(checkGeometry(fixture.model, fixture.geometry), 'label', ['request']);
});

test('a label clipped outside the computed diagram bounds is rejected', () => {
  const fixture = horizontal(true);
  fixture.geometry.edges[0].label!.x = 1360;
  diagnostic(checkGeometry(fixture.model, fixture.geometry), /label|bounds/, ['request']);
});

test('a label on the endpoint body is still a collision', () => {
  const fixture = horizontal(true);
  fixture.geometry.edges[0].label = { x: 10, y: 220, width: 80, height: 24, text: 'Calls' };
  diagnostic(checkGeometry(fixture.model, fixture.geometry), 'label-collision', ['request', 'a']);
});

test('a relationship label cannot overlap the endpoint ancestor header', () => {
  const fixture = crossBoundary();
  fixture.model.edges[0].label = 'Calls';
  fixture.geometry.edges[0].label = { x: 200, y: 120, width: 80, height: 24, text: 'Calls' };
  diagnostic(checkGeometry(fixture.model, fixture.geometry), 'label-collision', ['request', 'group']);
});

test('overlapping relationship labels identify both relationships', () => {
  const fixture = horizontal(true);
  fixture.model.edges.push({ id: 'second', from: 'a', to: 'b', label: 'Replies', evidence });
  fixture.geometry.edges.push({ ...structuredClone(fixture.geometry.edges[0]), id: 'second', label: { x: 350, y: 110, width: 100, height: 24, text: 'Replies' } });
  diagnostic(checkGeometry(fixture.model, fixture.geometry), 'label-overlap', ['request', 'second']);
});

for (const [name, width, height] of [['horizontal insets', 40, 150], ['header and vertical insets', 200, 80]] as const) {
  test(`an empty group must still reserve ${name}`, () => {
    const model = architecture([], [], [{ id: 'group' }]);
    diagnostic(checkGeometry(model, geometry([box('group', 0, 0, { kind: 'group', width, height, headerHeight: 32 })])), /group|dimension|contain|header/, ['group']);
  });
}

test('an empty group with room for its header and insets is valid', () => {
  const model = architecture([], [], [{ id: 'group' }]);
  assert.deepEqual(checkGeometry(model, geometry([
    box('group', 0, 0, { kind: 'group', width: 320, height: 96, headerHeight: 32 }),
  ])), []);
});

test('relationships sharing a component must use its single rendered source and target handles', () => {
  const fixture = horizontal();
  fixture.model.edges.push({ id: 'second', from: 'a', to: 'b', evidence });
  fixture.geometry.edges.push({ id: 'second', sourcePort: { x: 100, y: 270 }, targetPort: { x: 600, y: 270 },
    sections: [{ points: [{ x: 100, y: 270 }, { x: 600, y: 270 }] }] });
  diagnostic(checkGeometry(fixture.model, fixture.geometry), 'shared-port', ['a', 'second']);
  diagnostic(checkGeometry(fixture.model, fixture.geometry), 'shared-port', ['b', 'second']);
});

test('a diagonal segment cannot pass as an orthogonal architecture route', () => {
  const fixture = horizontal();
  fixture.geometry.edges[0].sections[0].points.splice(1, 0, { x: 300, y: 150 });
  diagnostic(checkGeometry(fixture.model, fixture.geometry), 'route-orthogonality', ['request']);
});

test('a route through an unrelated relationship label is an obstruction even with valid node clearance', () => {
  const fixture = horizontal(true);
  fixture.model.edges.push({ id: 'second', from: 'a', to: 'b', evidence });
  fixture.geometry.edges.push({ id: 'second', sourcePort: { x: 100, y: 250 }, targetPort: { x: 600, y: 250 },
    sections: [{ points: [{ x: 100, y: 250 }, { x: 250, y: 250 }, { x: 250, y: 112 }, { x: 500, y: 112 }, { x: 500, y: 250 }, { x: 600, y: 250 }] }] });
  diagnostic(checkGeometry(fixture.model, fixture.geometry), 'route-label-collision', ['request', 'second']);
});
