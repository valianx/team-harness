import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { checkGeometry } from '../../src/geometry';
import { layout } from '../../src/layout';
import { parseModel } from '../../src/model';
import { TOKENS } from '../../src/tokens';
import type { Geometry } from '../../src/types';
import { revealControls } from './control-helpers';

const kitVersion = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
  for (const fixture of ['sample', 'long-label', 'nested', 'cycle', 'disconnected', 'dense', 'down']) {
    test(`${fixture} renders measured geometry and complete routes at ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.goto(`/?fixture=${fixture}`);
      await expect(page.locator('[data-layout-state="ready"]')).toBeVisible();
      const viewer = await page.locator('.architecture-viewer').boundingBox();
      await page.mouse.move(viewer!.x + 12, viewer!.y + 12);

      await page.getByRole('combobox', { name: 'Perspective' }).selectOption('');
      await expect(page.locator('[data-layout-state="ready"]')).toBeVisible();
      if (fixture === 'dense') {
        await revealControls(page, 'bottom');
        for (let zoom = 0; zoom < 8; zoom++) await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
        await expect(page.getByTestId('canvas-limit')).toContainText('Pan or choose a perspective');
      }
      if (fixture === 'nested') {
        await expect(page.locator('.react-flow__node-group[data-id="reserved"]')).toHaveCount(1);
        await expect(page.locator('.react-flow [data-parent="reserved"]')).toHaveCount(0);
      }

      const observed = await page.evaluate(TOKENS => {
        const model = JSON.parse(document.querySelector('.architecture-viewer')!.getAttribute('data-model-content')!);
        const surface = document.querySelector('.measurement-surface')!;
        const collect = (attribute: string, child?: string) => Object.fromEntries([...surface.querySelectorAll(`[${attribute}]`)].map(element => {
          const box = (child ? element.querySelector(child)! : element).getBoundingClientRect();
          return [element.getAttribute(attribute)!, { width: box.width, height: box.height }];
        }));
        const measurements = { nodes: collect('data-measure-node', '.component-card'), headers: collect('data-measure-header', '.group-header'), labels: collect('data-measure-label') };
        const canvas = document.querySelector('.diagram-canvas')!.getBoundingClientRect();
        const matrix = new DOMMatrix(getComputedStyle(document.querySelector('.react-flow__viewport')!).transform);
        const bounds = (element: Element) => {
          const box = element.getBoundingClientRect();
          return { x: (box.x - canvas.x - matrix.e) / matrix.a, y: (box.y - canvas.y - matrix.f) / matrix.d, width: box.width / matrix.a, height: box.height / matrix.d };
        };
        const nodeElements = [...document.querySelectorAll('.react-flow__node')];
        const nodeBounds = new Map(nodeElements.map(element => [element.getAttribute('data-id'), bounds(element)]));
        const components = [...model.nodes, ...model.groups];
        const nodes = nodeElements.map(element => {
          const id = element.getAttribute('data-id')!;
          const component = components.find((component: { id: string }) => component.id === id)!;
          const box = nodeBounds.get(id)!;
          const parent = component.parent ? nodeBounds.get(component.parent)! : { x: 0, y: 0 };
          const header = element.querySelector('.group-header');
          return { id, kind: component.kind ?? 'group', parent: component.parent, x: box.x - parent.x, y: box.y - parent.y, absX: box.x, absY: box.y,
            width: box.width, height: box.height, headerHeight: header ? bounds(header).height + TOKENS.headerGap : 0 };
        });
        const port = (nodeId: string, edgeId: string, type: string) => {
          const handle = document.querySelector(`.react-flow__node[data-id="${CSS.escape(nodeId)}"] .react-flow__handle.${type}[data-handleid="${CSS.escape(edgeId)}:${type}"]`)!;
          const box = bounds(handle);
          return { id: handle.getAttribute('data-handleid'), nodeId, side: handle.getAttribute('data-handlepos'), slot: Number(handle.getAttribute('data-slot')), x: box.x + box.width / 2, y: box.y + box.height / 2 };
        };
        const edges = [...document.querySelectorAll('.react-flow__edge')].map(element => {
          const id = element.getAttribute('data-id')!;
          const edge = model.edges.find((edge: { id: string }) => edge.id === id)!;
          const sections = [...element.querySelectorAll('.react-flow__edge-path')].map(path => {
            const values = (path.getAttribute('d')!.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? []).map(Number);
            return { points: Array.from({ length: values.length / 2 }, (_, index) => ({ x: values[index * 2], y: values[index * 2 + 1] })) };
          });
          const label = document.querySelector(`.edge-label[data-relationship="${CSS.escape(id)}"]`);
          return { id, sections, sourcePort: port(edge.from, id, 'source'), targetPort: port(edge.to, id, 'target'), label: label ? { ...bounds(label), text: label.textContent } : undefined };
        });
        const attachmentErrors = edges.flatMap(edge => {
          const from = edge.sections[0]?.points[0];
          const to = edge.sections.at(-1)?.points.at(-1);
          return from && to && Math.hypot(from.x - edge.sourcePort.x, from.y - edge.sourcePort.y) <= TOKENS.tolerance && Math.hypot(to.x - edge.targetPort.x, to.y - edge.targetPort.y) <= TOKENS.tolerance ? [] : [edge.id];
        });
        const clipped = [...document.querySelectorAll('.react-flow__node .component-label, .react-flow__node .group-title, .edge-label[data-relationship]')].filter(element => element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1).map(element => element.textContent);
        return { model, measurements, geometry: { nodes, edges }, attachmentErrors, clipped,
          actualRoutes: edges.map(edge => ({ id: edge.id, sections: edge.sections })),
          measurementIdentity: { font: getComputedStyle(document.querySelector('.component-label')!).fontFamily, browser: navigator.userAgent, viewport: { width: innerWidth, height: innerHeight } } };
      }, TOKENS);
      const model = parseModel(observed.model);
      const expected = await layout(model, observed.measurements);
      const geometry = { ...observed.geometry, bounds: expected.bounds } as Geometry;
      const result = { ...observed, geometry, diagnostics: checkGeometry(model, geometry), expectedRoutes: expected.edges.map(edge => ({ id: edge.id, sections: edge.sections })), measurementIdentity: { ...observed.measurementIdentity, kit: kitVersion } };

      await testInfo.attach('rendered-geometry.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
      await page.screenshot({ path: testInfo.outputPath(`${fixture}-${viewport.width}.png`), fullPage: true });
      expect(result.actualRoutes).toEqual(result.expectedRoutes);
      expect(result.attachmentErrors).toEqual([]);
      expect(result.clipped).toEqual([]);
      expect(result.diagnostics).toEqual([]);
      await expect(page.locator('.geometry-diagnostics')).toHaveCount(0);
    });
  }
}
