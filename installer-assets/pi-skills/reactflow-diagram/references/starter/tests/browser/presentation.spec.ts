import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parseModel } from '../../src/model';
import { revealControls } from './control-helpers';

async function ready(page: Page, fixture = 'sample', composition = 'auto') {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/?fixture=${fixture}&composition=${composition}`);
  await expect(page.locator('[data-layout-state="ready"]')).toBeVisible();
  const box = await page.getByTestId('diagram-canvas').boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
}

async function regions(page: Page, top: '0' | '1', bottom: '0' | '1') {
  await expect(page.locator('.viewer-toolbar')).toHaveCSS('opacity', top);
  await expect(page.locator('.viewer-footer')).toHaveCSS('opacity', bottom);
  await expect(page.locator('.canvas-navigation')).toHaveCSS('pointer-events', bottom === '1' ? 'auto' : 'none');
}

test('central hover reveals neither control region', async ({ page }) => {
  await ready(page);
  await regions(page, '0', '0');
});

for (const viewport of [{ width: 1280, height: 720 }, { width: 1440, height: 900 }]) {
  test(`standalone window and independent 24px borders at ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await ready(page);
    const box = await page.locator('.architecture-viewer').boundingBox();
    expect(box).toEqual({ x: 0, y: 0, ...viewport });
    await regions(page, '0', '0');
    const snapshot = () => page.evaluate(() => ({
      camera: document.querySelector('.react-flow__viewport')!.getAttribute('style'),
      nodes: [...document.querySelectorAll('.react-flow__node')].map(node => node.getAttribute('style')),
      paths: [...document.querySelectorAll('.react-flow__edge-path')].map(path => path.getAttribute('d')),
      canvas: document.querySelector('.diagram-canvas')!.getBoundingClientRect().toJSON(),
    }));
    const before = await snapshot();
    const canvas = await page.getByTestId('diagram-canvas').boundingBox();
    const x = canvas!.x + 2;
    await page.mouse.move(x, canvas!.y + 25);
    await regions(page, '0', '0');
    await page.mouse.move(x, canvas!.y + 23);
    await regions(page, '1', '0');
    const select = page.getByRole('combobox', { name: 'Perspective' });
    await select.hover();
    await regions(page, '1', '0');
    await page.mouse.move(x, canvas!.y + canvas!.height / 2);
    await regions(page, '0', '0');
    await page.mouse.move(x, canvas!.y + canvas!.height - 25);
    await regions(page, '0', '0');
    await page.mouse.move(x, canvas!.y + canvas!.height - 23);
    await regions(page, '0', '1');
    await page.getByRole('button', { name: 'Next step' }).hover();
    await regions(page, '0', '1');
    await page.mouse.move(x, canvas!.y + canvas!.height / 2);
    await regions(page, '0', '0');
    expect(await snapshot()).toEqual(before);
    await testInfo.attach('independent-regions.json', { body: JSON.stringify({ viewport, before }, null, 2), contentType: 'application/json' });
    await page.screenshot({ path: testInfo.outputPath('standalone-clean.png') });
  });
}

for (const composition of ['layered', 'compact']) {
  test(`${composition} renders each relationship endpoint as a hidden measurable handle`, async ({ page }, testInfo) => {
    await ready(page, 'cycle', composition);
    const model = parseModel(JSON.parse(readFileSync(new URL('../../fixtures/payment-demo.json', import.meta.url), 'utf8')));
    model.edges.push({ ...model.edges[0], id: 'reply', from: 'database', to: 'gateway', label: 'Return result' });
    const observations = [];
    for (const edge of model.edges) {
      await expect(page.getByTestId(`rf__edge-${edge.id}`)).toHaveCount(1);
      for (const [role, nodeId] of [['source', edge.from], ['target', edge.to]] as const) {
        const handle = page.getByTestId(`rf__node-${nodeId}`).locator(`.react-flow__handle.${role}[data-handleid="${edge.id}:${role}"]`);
        await expect(handle).toHaveCount(1);
        const observed = await handle.evaluate(element => {
          const box = element.getBoundingClientRect(), style = getComputedStyle(element);
          return { id: element.getAttribute('data-handleid'), side: element.getAttribute('data-handlepos'), slot: element.getAttribute('data-slot'), width: box.width, height: box.height, opacity: style.opacity, display: style.display };
        });
        expect(['left', 'right', 'top', 'bottom']).toContain(observed.side);
        expect(observed.slot).toMatch(/^\d+$/);
        expect(observed.width).toBeGreaterThan(0);
        expect(observed.height).toBeGreaterThan(0);
        expect(observed.display).not.toBe('none');
        expect(observed.opacity).toBe('0');
        observations.push(observed);
      }
      const attached = await page.getByTestId(`rf__edge-${edge.id}`).evaluate((element, edge) => {
        const path = [...element.querySelectorAll<SVGPathElement>('.react-flow__edge-path')];
        const endpoints = [path[0].getPointAtLength(0), path.at(-1)!.getPointAtLength(path.at(-1)!.getTotalLength())];
        const matrix = path[0].getScreenCTM()!;
        return endpoints.map((point, index) => {
          const screen = new DOMPoint(point.x, point.y).matrixTransform(matrix);
          const handle = document.querySelector(`[data-handleid="${CSS.escape(edge.id)}:${index ? 'target' : 'source'}"]`)!.getBoundingClientRect();
          return Math.hypot(screen.x - handle.x - handle.width / 2, screen.y - handle.y - handle.height / 2);
        });
      }, edge);
      expect(attached.every(distance => distance < 1)).toBe(true);
    }
    await page.getByTestId('rf__node-orchestrator').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('complementary', { name: 'Selection details' })).toBeVisible();
    await expect(page.locator('.react-flow__handle')).toHaveCount(model.edges.length * 2);
    await testInfo.attach('endpoint-handles.json', { body: JSON.stringify(observations, null, 2), contentType: 'application/json' });
  });

  test(`${composition} preserves endpoint identity through fit, selection and perspective changes`, async ({ page }) => {
    await ready(page, 'sample', composition);
    const completeIds = ['request', 'persistence', 'publish', 'notification'];
    const check = async (ids: string[]) => {
      await expect(page.locator('.react-flow__edge')).toHaveCount(ids.length);
      await expect(page.locator('.react-flow__handle')).toHaveCount(ids.length * 2);
      for (const id of ids) {
        await expect(page.locator(`.react-flow__handle[data-handleid="${id}:source"]`)).toHaveCount(1);
        await expect(page.locator(`.react-flow__handle[data-handleid="${id}:target"]`)).toHaveCount(1);
      }
      expect(await page.locator('.react-flow__handle').evaluateAll(handles => handles.every(handle => {
        const box = handle.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && getComputedStyle(handle).opacity === '0';
      }))).toBe(true);
    };
    await check(completeIds);
    await revealControls(page, 'top');
    await page.getByRole('button', { name: 'Fit diagram' }).click();
    await page.getByTestId('rf__edge-request').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('complementary', { name: 'Selection details' })).toContainText('HTTPS');
    await check(completeIds);
    await page.getByRole('button', { name: 'Close details' }).click();
    await page.getByRole('combobox', { name: 'Perspective' }).selectOption('request-view');
    await expect(page.locator('[data-layout-state="ready"]')).toBeVisible();
    await check(['request']);
    await page.getByRole('combobox', { name: 'Perspective' }).selectOption('');
    await expect(page.locator('[data-layout-state="ready"]')).toBeVisible();
    await check(completeIds);
  });
}

test('open arrowheads retain a readable presentation size when fitted and zoomed', async ({ page }, testInfo) => {
  await ready(page, 'cycle');
  const arrows = () => page.locator('.react-flow__edge-path').evaluateAll(paths => paths.map(path => {
    const ref = path.getAttribute('marker-end')!;
    const marker = document.getElementById(ref.slice(ref.indexOf('#') + 1).replace(/["')]+$/, ''))!;
    const arrow = marker.querySelector('polyline')!;
    const viewport = new DOMMatrix(getComputedStyle(document.querySelector('.react-flow__viewport')!).transform);
    return { fill: getComputedStyle(arrow).fill, points: arrow.getAttribute('points'), size: Number(marker.getAttribute('markerWidth')) * viewport.a, units: marker.getAttribute('markerUnits') };
  }));
  const fitted = await arrows();
  expect(fitted.length).toBe(5);
  for (const arrow of fitted) {
    expect(arrow.fill).toBe('none');
    expect(arrow.units).toBe('userSpaceOnUse');
    expect(arrow.size).toBeGreaterThanOrEqual(32);
    expect(arrow.size).toBeLessThanOrEqual(48);
  }
  const canvas = await page.getByTestId('diagram-canvas').boundingBox();
  await page.mouse.move(canvas!.x + 2, canvas!.y + canvas!.height - 2);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect.poll(async () => (await arrows())[0].size).toBeCloseTo(fitted[0].size, 1);
  await testInfo.attach('open-arrows.json', { body: JSON.stringify({ fitted, zoomed: await arrows() }, null, 2), contentType: 'application/json' });
});

test('interaction styles distinguish asynchronous lanes without recoloring components', async ({ page }, testInfo) => {
  await ready(page, 'interactions');
  await expect(page.locator('.react-flow__edge')).toHaveCount(6);
  const observed = () => page.locator('.react-flow__edge').evaluateAll(edges => edges.map(edge => {
    const path = edge.querySelector('.react-flow__edge-path')!, style = getComputedStyle(path);
    return { id: edge.getAttribute('data-id'), stroke: style.stroke, dash: style.strokeDasharray };
  }));
  const initial = await observed();
  expect(new Set(initial.map(edge => edge.stroke)).size).toBe(6);
  for (const edge of initial) expect(edge.dash === 'none', `${edge.id} uses its interaction pattern`).toBe(!['response', 'event'].includes(edge.id!));
  const cards = () => page.locator('.react-flow__node .component-card').evaluateAll(elements => elements.map(element => getComputedStyle(element).backgroundColor));
  const before = await cards();
  await page.addStyleTag({ content: '.architecture-viewer { --interaction-request: #e879f9; --interaction-response-dash: 10 3; }' });
  const customized = await observed();
  expect(customized.find(edge => edge.id === 'request')!.stroke).toBe('rgb(232, 121, 249)');
  expect(customized.find(edge => edge.id === 'response')!.dash).toBe('10px, 3px');
  expect(await cards()).toEqual(before);
  await testInfo.attach('interaction-styles.json', { body: JSON.stringify({ initial, customized }, null, 2), contentType: 'application/json' });
});

test('native fullscreen is a separate control from the full-window shell', async ({ page }) => {
  await ready(page);
  expect(await page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  const canvas = await page.getByTestId('diagram-canvas').boundingBox();
  await page.mouse.move(canvas!.x + 2, canvas!.y + 2);
  await page.getByRole('button', { name: 'Enter fullscreen' }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.classList.contains('architecture-viewer'))).toBe(true);
  await page.getByRole('button', { name: 'Exit fullscreen' }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
});
