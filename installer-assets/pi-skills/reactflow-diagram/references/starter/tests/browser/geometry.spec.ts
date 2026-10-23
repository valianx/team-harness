import { test, expect } from '@playwright/test';

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
  for (const fixture of ['sample', 'long-label', 'nested', 'cycle', 'disconnected', 'dense', 'down']) {
    test(`${fixture} renders measured geometry and complete routes at ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.goto(`/?fixture=${fixture}`);
      await expect(page.locator('[data-layout-state="ready"]')).toBeVisible();

      if (fixture === 'dense') await expect(page.getByTestId('canvas-limit')).toContainText('Pan or choose a perspective');
      await page.getByRole('combobox', { name: 'Perspective' }).selectOption('');
      await expect(page.locator('[data-layout-state="ready"]')).toBeVisible();
      if (fixture === 'nested') {
        await expect(page.locator('.react-flow__node-group[data-id="reserved"]')).toHaveCount(1);
        await expect(page.locator('.react-flow [data-parent="reserved"]')).toHaveCount(0);
      }

      const result = await page.evaluate(async fixture => {
        const modules = ['/src/fixtures.ts', '/src/model.ts', '/src/geometry.ts', '/src/layout.ts', '/src/viewer/measurement.tsx', '/src/tokens.ts'];
        const [{ FIXTURES }, { parseModel }, { checkGeometry }, { layout }, { measureSurface }, { TOKENS }] = await Promise.all(modules.map(path => import(path)));
        const model = parseModel(FIXTURES[fixture]);
        const expected = await layout(model, await measureSurface(document.querySelector('.measurement-surface')));
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
        const port = (nodeId: string, type: string) => {
          const box = bounds(document.querySelector(`.react-flow__node[data-id="${CSS.escape(nodeId)}"] .react-flow__handle.${type}`)!);
          return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        };
        const edges = [...document.querySelectorAll('.react-flow__edge')].map(element => {
          const id = element.getAttribute('data-id')!;
          const edge = model.edges.find((edge: { id: string }) => edge.id === id)!;
          const sections = [...element.querySelectorAll('.react-flow__edge-path')].map(path => {
            const values = (path.getAttribute('d')!.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? []).map(Number);
            return { points: Array.from({ length: values.length / 2 }, (_, index) => ({ x: values[index * 2], y: values[index * 2 + 1] })) };
          });
          const label = document.querySelector(`.edge-label[data-relationship="${CSS.escape(id)}"]`);
          return { id, sections, sourcePort: port(edge.from, 'source'), targetPort: port(edge.to, 'target'), label: label ? { ...bounds(label), text: label.textContent } : undefined };
        });
        const geometry = { nodes, edges, bounds: expected.bounds };
        const attachmentErrors = edges.flatMap(edge => {
          const from = edge.sections[0]?.points[0];
          const to = edge.sections.at(-1)?.points.at(-1);
          return from && to && Math.hypot(from.x - edge.sourcePort.x, from.y - edge.sourcePort.y) <= TOKENS.tolerance && Math.hypot(to.x - edge.targetPort.x, to.y - edge.targetPort.y) <= TOKENS.tolerance ? [] : [edge.id];
        });
        const clipped = [...document.querySelectorAll('.react-flow__node .component-label, .react-flow__node .group-title, .edge-label[data-relationship]')].filter(element => element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1).map(element => element.textContent);
        return { geometry, diagnostics: checkGeometry(model, geometry), attachmentErrors, clipped,
          actualRoutes: edges.map(edge => ({ id: edge.id, sections: edge.sections })), expectedRoutes: expected.edges.map((edge: { id: string; sections: unknown }) => ({ id: edge.id, sections: edge.sections })),
          measurementIdentity: { font: getComputedStyle(document.querySelector('.component-label')!).fontFamily, browser: navigator.userAgent, viewport: { width: innerWidth, height: innerHeight }, kit: '1.0.0' } };
      }, fixture);

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
