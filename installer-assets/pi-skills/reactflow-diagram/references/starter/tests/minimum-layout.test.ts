import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layout } from '../src/layout';
import { checkGeometry } from '../src/geometry';
import { parseModel } from '../src/model';
import { TOKENS as T } from '../src/tokens';
import type { Architecture, Measurements } from '../src/types';

type Shape = 'empty' | 'single-card' | 'nested-empty' | 'wide-header';

function measuredBoundary(shape: Shape, direction: Architecture['direction']) {
  const evidence = [{ source: 'invented', locator: 'Independent group minimum fixture' }];
  const model = parseModel({
    schemaVersion: 1, title: 'Invented minimum bounds', theme: 'presentation', direction,
    sources: [{ id: 'invented', title: 'Invented minimum bounds', locator: 'invented.md', status: 'read' }],
    groups: [{ id: 'boundary', label: 'Boundary', evidence },
      ...(shape === 'nested-empty' ? [{ id: 'inner', label: 'Inner boundary', parent: 'boundary', evidence }] : [])],
    nodes: shape === 'single-card' || shape === 'wide-header'
      ? [{ id: 'worker', kind: 'service', label: 'Worker', parent: 'boundary', evidence }] : [],
    edges: [], review: { unresolved: [], decisions: [], assessor: 'Synthetic fixture' }, views: [], steps: [],
  });
  const sizes: Measurements = {
    nodes: Object.fromEntries(model.nodes.map(node => [node.id, { width: shape === 'wide-header' ? T.nodeWidth + 32 : Math.max(32, T.nodeWidth - 96), height: T.minNodeHeight + 20 }])),
    headers: Object.fromEntries(model.groups.map(group => [group.id, { width: shape === 'wide-header' ? T.nodeWidth + 120 : Math.max(32, T.nodeWidth - 80), height: 32 }])),
    labels: {},
  };
  return { model, sizes };
}

for (const composition of ['layered', 'compact'] as const) for (const direction of ['right', 'down'] as const) {
  for (const shape of ['empty', 'single-card', 'nested-empty', 'wide-header'] as const) {
    test(`${composition} ${direction} reserves physical token/header minima for ${shape} groups`, async () => {
      const { model, sizes } = measuredBoundary(shape, direction), original = structuredClone(model);
      const geometry = await layout(model, sizes, { composition });
      assert.deepEqual(checkGeometry(model, geometry), []);
      assert.deepEqual(geometry.nodes.map(node => node.id).sort(), [...model.groups, ...model.nodes].map(node => node.id).sort());
      for (const group of geometry.nodes.filter(node => node.kind === 'group')) {
        assert.ok(group.width >= Math.max(T.nodeWidth, sizes.headers[group.id].width) + 2 * T.groupInset - T.tolerance,
          `${group.id}: physical width ${group.width} does not fit the header and token minimum`);
        assert.ok(group.height >= group.headerHeight + 2 * T.groupInset - T.tolerance);
      }
      for (const node of model.nodes) {
        const actual = geometry.nodes.find(value => value.id === node.id)!;
        assert.equal(actual.width, sizes.nodes[node.id].width); assert.equal(actual.height, sizes.nodes[node.id].height);
        assert.equal(actual.parent, node.parent);
      }
      assert.equal(geometry.composition!.selected, composition);
      assert.deepEqual(geometry.composition!.candidates.map(candidate => candidate.mode), [composition]);
      assert.equal(geometry.composition!.execution.work.layeredCalls, composition === 'layered' ? 1 : 0);
      assert.equal(geometry.composition!.execution.work.compactPlacements, composition === 'compact' ? 1 : 0);
      assert.deepEqual(model, original);
    });
  }
}
