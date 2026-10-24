import { test, expect, type Page } from '@playwright/test';

const controls = '.viewer-toolbar, .viewer-footer, .canvas-context, .canvas-legend, .canvas-navigation, .view-context';

async function ready(page: Page, fixture = 'sample') {
  await page.goto(`/?fixture=${fixture}`);
  await expect(page.locator('[data-layout-state="ready"]')).toBeVisible();
  await page.mouse.move(0, 0);
}

async function visibility(page: Page, opacity: '0' | '1') {
  for (const selector of ['.viewer-toolbar', '.viewer-footer', '.canvas-context', '.canvas-legend', '.canvas-navigation']) {
    await expect(page.locator(selector)).toHaveCount(1);
  }
  const perspective = await page.getByRole('combobox', { name: 'Perspective' }).inputValue();
  await expect(page.locator('.view-context')).toHaveCount(perspective ? 1 : 0);
  for (const element of await page.locator(controls).all()) await expect(element).toHaveCSS('opacity', opacity);
  await expect(page.locator('.viewer-toolbar')).toHaveCSS('pointer-events', opacity === '0' ? 'none' : 'auto');
  await expect(page.locator('.canvas-navigation')).toHaveCSS('pointer-events', opacity === '0' ? 'none' : 'auto');
}

async function reveal(page: Page) {
  const box = await page.locator('.architecture-viewer').boundingBox();
  await page.mouse.move(box!.x + 12, box!.y + 12);
  await visibility(page, '1');
}

async function geometry(page: Page) {
  return page.evaluate(() => {
    const box = (element: Element) => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
    return {
      viewer: box(document.querySelector('.architecture-viewer')!), canvas: box(document.querySelector('.diagram-canvas')!),
      workarea: box(document.querySelector('.viewer-workarea')!),
      noticeHeight: [...document.querySelectorAll('.review-notes, .geometry-diagnostics')].reduce((height, element) => height + element.getBoundingClientRect().height, 0),
      nodes: [...document.querySelectorAll('.react-flow__node')].map(node => ({ id: node.getAttribute('data-id'), style: node.getAttribute('style'), box: box(node) })),
      routes: [...document.querySelectorAll('.react-flow__edge-path')].map(path => path.getAttribute('d')),
      camera: document.querySelector('.react-flow__viewport')!.getAttribute('style'),
    };
  });
}

async function fittedContent(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('.diagram-canvas')!.getBoundingClientRect();
    const boxes = [...document.querySelectorAll('.react-flow__node, .react-flow__edge-path, .edge-label[data-relationship]')].map(element => element.getBoundingClientRect());
    const left = Math.min(...boxes.map(box => box.left)), right = Math.max(...boxes.map(box => box.right));
    const top = Math.min(...boxes.map(box => box.top)), bottom = Math.max(...boxes.map(box => box.bottom));
    return { occupancy: Math.max((right - left) / canvas.width, (bottom - top) / canvas.height),
      margins: [(left - canvas.left) / canvas.width, (canvas.right - right) / canvas.width, (top - canvas.top) / canvas.height, (canvas.bottom - bottom) / canvas.height] };
  });
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
  for (const fixture of ['sample', 'cycle']) test(`floating controls preserve ${fixture} full-canvas 90% fit at ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await ready(page, fixture);
    await expect(page.getByRole('combobox', { name: 'Perspective' })).toHaveValue('');
    await expect(page.locator('.react-flow__edge')).toHaveCount(fixture === 'cycle' ? 5 : 4);
    await reveal(page);
    await page.getByRole('button', { name: 'Fit diagram' }).click();
    await expect.poll(async () => Math.abs((await fittedContent(page)).occupancy - 0.9)).toBeLessThan(0.005);
    const content = await fittedContent(page);
    expect(Math.min(...content.margins)).toBeGreaterThan(0.045);
    if (fixture === 'cycle') {
      const routesExtendNodes = await page.evaluate(() => {
        const nodes = [...document.querySelectorAll('.react-flow__node')].map(node => node.getBoundingClientRect());
        const routes = [...document.querySelectorAll('.react-flow__edge-path')].map(path => path.getBoundingClientRect());
        return routes.some(route => route.left < Math.min(...nodes.map(node => node.left)) - 1 || route.right > Math.max(...nodes.map(node => node.right)) + 1 || route.bottom > Math.max(...nodes.map(node => node.bottom)) + 1);
      });
      expect(routesExtendNodes, 'The cycle must exercise route bounds beyond the node union.').toBe(true);
    }
    const before = await geometry(page);
    expect(before.canvas.width).toBeCloseTo(before.viewer.width - 2, 0);
    expect(before.canvas.height).toBeCloseTo(before.workarea.height, 0);
    expect(before.canvas.height + before.noticeHeight).toBeCloseTo(before.viewer.height - 2, 0);
    await page.mouse.move(0, 0);
    await visibility(page, '0');
    expect(await geometry(page)).toEqual(before);
    await page.screenshot({ path: testInfo.outputPath(`canvas-clean-${viewport.width}.png`) });
    await reveal(page);
    expect(await geometry(page)).toEqual(before);
    await page.screenshot({ path: testInfo.outputPath(`canvas-controls-${viewport.width}.png`) });
    await testInfo.attach('framing.json', { body: JSON.stringify({ content, geometry: before }, null, 2), contentType: 'application/json' });
  });
}

test('keyboard discovers hidden controls and operates perspective and fit', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  await visibility(page, '0');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Architecture viewer home' })).toBeFocused();
  const select = page.getByRole('combobox', { name: 'Perspective' });
  for (let index = 0; index < 5 && !await select.evaluate(element => element === document.activeElement); index++) await page.keyboard.press('Tab');
  await expect(select).toBeFocused();
  await visibility(page, '1');
  await page.keyboard.press('End');
  await expect(select).toHaveValue('notification-view');
  await expect(page.locator('[data-layout-state="ready"]')).toBeVisible();
  await page.keyboard.press('Home');
  await expect(select).toHaveValue('');
  await expect(page.locator('[data-layout-state="ready"]')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Fit diagram' })).toBeFocused();
  await page.keyboard.press('Enter');
  await visibility(page, '1');
  await expect(page.locator('.viewer-toolbar')).toHaveCSS('transition-duration', '0s');
});

test('open native select and validation stay visible while mouse focus alone does not', async ({ page }) => {
  await ready(page);
  await reveal(page);
  await page.getByRole('button', { name: 'Fit diagram' }).click();
  await page.mouse.move(0, 0);
  await visibility(page, '0');
  await reveal(page);
  const validation = page.getByTestId('validation-status');
  await validation.locator('summary').click();
  await page.mouse.move(0, 0);
  await visibility(page, '1');
  await expect(page.locator('.validation-popover')).toBeVisible();
  await validation.locator('summary').click();
  await reveal(page);
  const select = page.getByRole('combobox', { name: 'Perspective' });
  await select.click();
  await expect.poll(() => select.evaluate(element => element.matches(':open'))).toBe(true);
  await page.mouse.move(0, 0);
  await visibility(page, '1');
  await expect.poll(() => select.evaluate(element => element.matches(':open'))).toBe(true);
  await page.keyboard.press('Escape');
});

test('desktop validation popover receives hits above overlapping canvas navigation', async ({ page }, testInfo) => {
  await ready(page);
  await reveal(page);
  await page.getByTestId('validation-status').locator('summary').click();
  await page.mouse.move(0, 0);
  await visibility(page, '1');
  const result = await page.evaluate(() => {
    const popup = document.querySelector('.validation-popover')!, navigation = document.querySelector('.canvas-navigation')!;
    const a = popup.getBoundingClientRect(), b = navigation.getBoundingClientRect();
    const left = Math.max(a.left, b.left), right = Math.min(a.right, b.right), top = Math.max(a.top, b.top), bottom = Math.min(a.bottom, b.bottom);
    const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
    return { intersection: { width: right - left, height: bottom - top }, popupReceivesHit: !!hit && popup.contains(hit), hit: hit?.className };
  });
  await testInfo.attach('validation-stacking.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  await page.screenshot({ path: testInfo.outputPath('validation-above-navigation.png') });
  expect(result.intersection.width).toBeGreaterThan(1);
  expect(result.intersection.height).toBeGreaterThan(1);
  expect(result.popupReceivesHit, 'Validation content must paint and receive hits above navigation underneath.').toBe(true);
});

test('touch controls remain visible and respond to zoom and fit taps', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await ready(page);
  expect(await page.evaluate(() => matchMedia('(any-pointer: coarse)').matches)).toBe(true);
  await visibility(page, '1');
  await page.getByRole('button', { name: 'Fit diagram' }).tap();
  const initial = await page.getByLabel('Zoom level').innerText();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).tap();
  await expect(page.getByLabel('Zoom level')).not.toHaveText(initial);
  await page.getByRole('button', { name: 'Fit diagram' }).tap();
  await expect(page.getByLabel('Zoom level')).toHaveText(initial);
  await visibility(page, '1');
  await context.close();
});

test('source notices, model errors and selected details stay visible independently of controls', async ({ page }) => {
  await ready(page, 'unresolved');
  await visibility(page, '0');
  await expect(page.locator('.viewer-toolbar')).toHaveCSS('transition-duration', '0.18s');
  const notices = page.getByTestId('review-notes');
  await notices.locator('summary').click();
  await page.mouse.move(0, 0);
  await visibility(page, '0');
  await expect(notices.locator('li').first()).toBeVisible();
  await expect(notices).toHaveCSS('opacity', '1');
  await page.locator('.react-flow__node-service').first().focus();
  await page.keyboard.press('Enter');
  const details = page.getByRole('complementary', { name: 'Selection details' });
  await expect(details).toBeVisible();
  await page.mouse.click(2, 2);
  await visibility(page, '0');
  await expect(details).toHaveCSS('opacity', '1');
  await details.getByRole('button', { name: 'Close details' }).click();
  await expect(details).toHaveCount(0);
  await page.goto('/?fixture=invalid');
  await page.mouse.move(0, 0);
  await expect(page.getByRole('alert')).toContainText('Model could not be read');
  await expect(page.getByRole('alert')).toHaveCSS('opacity', '1');
});

test('contextual graph appearances retain standard control styling and placement', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  await reveal(page);
  const snapshot = () => page.locator(`${controls}, .viewer-toolbar button, .viewer-toolbar select, .viewer-footer button`).evaluateAll(elements => elements.map(element => {
    const style = getComputedStyle(element), box = element.getBoundingClientRect();
    return { className: element.className, color: style.color, background: style.backgroundColor, border: style.borderColor, font: style.font, radius: style.borderRadius,
      x: box.x, y: box.y, width: box.width, height: box.height };
  }));
  const standard = await snapshot();
  const graph = () => page.locator('.component-card').first().evaluate(element => ({ color: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor, radius: getComputedStyle(element).borderRadius }));
  const original = await graph();
  await page.addStyleTag({ content: '.architecture-viewer { --accent: #a21caf; --muted: #172554; color: #172554; font-family: Georgia, serif; } .diagram-canvas, .architecture-viewer .react-flow { background: #eff6ff; --xy-background-color: #eff6ff; } .component-card { color: #172554; background: #dbeafe; border-color: #2563eb; border-radius: 0; } .edge-label { color: #172554; background: #eff6ff; }' });
  expect(await graph()).not.toEqual(original);
  expect(await snapshot()).toEqual(standard);
  await page.screenshot({ path: testInfo.outputPath('contextual-light-standard-controls.png') });
  await page.mouse.move(0, 0);
  await visibility(page, '0');
  await reveal(page);
  await page.getByRole('button', { name: 'Fit diagram' }).click();
  await reveal(page);
  expect(await snapshot()).toEqual(standard);
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
  test(`controls and details remain separate and clickable at ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await ready(page);
    await page.getByRole('combobox', { name: 'Perspective' }).selectOption('request-view');
    await expect(page.locator('[data-layout-state="ready"]')).toBeVisible();
    await page.locator('.react-flow__node-service').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('complementary', { name: 'Selection details' })).toBeVisible();
    await reveal(page);
    const result = await page.evaluate(controlSelector => {
      const canvas = document.querySelector('.diagram-canvas')!.getBoundingClientRect();
      const blocks = [...document.querySelectorAll(controlSelector)].map(element => ({ name: element.className, box: element.getBoundingClientRect() }));
      const overlaps = blocks.flatMap((a, index) => blocks.slice(index + 1).filter(b => Math.min(a.box.right, b.box.right) - Math.max(a.box.left, b.box.left) > 1 && Math.min(a.box.bottom, b.box.bottom) - Math.max(a.box.top, b.box.top) > 1).map(b => [a.name, b.name]));
      const outside = blocks.filter(({ box }) => box.left < canvas.left - 1 || box.right > canvas.right + 1).map(block => block.name);
      const targets = [...document.querySelectorAll('.viewer-toolbar button:not(:disabled), .viewer-toolbar select, .viewer-footer button:not(:disabled), .canvas-navigation button, .validation-status summary, .view-context button, button[aria-label="Close details"]')];
      const obscured = targets.filter(element => {
        const box = element.getBoundingClientRect(), hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return !hit || !element.contains(hit);
      }).map(element => element.getAttribute('aria-label') ?? element.textContent);
      return { overlaps, outside, obscured, targetCount: targets.length };
    }, controls);
    expect(result.targetCount).toBeGreaterThan(5);
    expect(result.overlaps).toEqual([]);
    expect(result.outside).toEqual([]);
    expect(result.obscured).toEqual([]);
    await testInfo.attach('control-hit-targets.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
    await page.getByRole('button', { name: 'Close details' }).click();
    await expect(page.getByRole('complementary', { name: 'Selection details' })).toHaveCount(0);
  });
}

test('layout failures stay visible with temporary controls hidden', async ({ page }) => {
  await page.route(/\.woff2?(?:\?|$)/, route => route.abort('failed'));
  await page.goto('/?fixture=sample');
  await expect(page.getByRole('alert')).toContainText('Layout needs attention');
  await page.mouse.move(0, 0);
  await expect(page.locator('.viewer-toolbar')).toHaveCSS('opacity', '0');
  await expect(page.getByRole('alert')).toHaveCSS('opacity', '1');
});

test('geometry diagnostics remain readable while temporary controls hide', async ({ page }) => {
  test.skip(!!process.env.DIAGRAM_SERVER_COMMAND, 'Development module boundary injects a diagnostic into real layout output.');
  await page.route(/\/src\/controller\.ts$/, route => route.fulfill({ contentType: 'text/javascript', body: `
    import { createLayoutRunner as actualRunner } from '/src/controller.ts?actual';
    export function createLayoutRunner() {
      const runner = actualRunner();
      return { ...runner, async run(...args) {
        const result = await runner.run(...args);
        return { ...result, diagnostics: [...result.diagnostics, { check: 'injected-route-collision', ids: [result.geometry.nodes[0].id], message: 'Injected route needs attention.' }] };
      } };
    }
  ` }));
  await ready(page);
  await visibility(page, '0');
  const diagnostics = page.locator('.geometry-diagnostics');
  await expect(diagnostics).toContainText('Injected route needs attention.');
  await expect(diagnostics).toHaveCSS('opacity', '1');
  await expect(diagnostics.locator('li')).toBeVisible();
});

test('selected component framing respects maximum zoom instead of forcing 90% occupancy', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  await page.locator('.react-flow__node-service').first().focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Zoom level')).toHaveText('180%');
  const box = await page.locator('.react-flow__node.selected').boundingBox();
  const canvas = await page.getByTestId('diagram-canvas').boundingBox();
  expect(box!.width / canvas!.width).toBeLessThan(0.9);
});

test('DPR2 preserves logical full-canvas framing and produces a 4K raster', async ({ browser }, testInfo) => {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await ready(page, 'cycle');
  await reveal(page);
  await page.getByRole('button', { name: 'Fit diagram' }).click();
  await expect.poll(async () => Math.abs((await fittedContent(page)).occupancy - 0.9)).toBeLessThan(0.005);
  await page.mouse.move(0, 0);
  await visibility(page, '0');
  expect(await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }))).toEqual({ width: 1920, height: 1080, dpr: 2 });
  await page.screenshot({ path: testInfo.outputPath('canvas-4k-dpr2.png') });
  await context.close();
});

for (const width of [820, 390]) {
  test(`stacked touch details keep overlay controls separate and reachable at ${width}×720`, async ({ browser }, testInfo) => {
    const context = await browser.newContext({ viewport: { width, height: 720 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await ready(page);
    await page.getByRole('combobox', { name: 'Perspective' }).selectOption('request-view');
    await expect(page.locator('[data-layout-state="ready"]')).toBeVisible();
    await page.locator('.react-flow__node-service').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('complementary', { name: 'Selection details' })).toBeVisible();
    await visibility(page, '1');
    const surfaces = await page.evaluate(() => {
      const rect = (selector: string) => { const r = document.querySelector(selector)!.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
      return { canvas: rect('.diagram-canvas'), top: rect('.viewer-chrome-top'), bottom: rect('.viewer-chrome-bottom') };
    });
    await testInfo.attach('stacked-overlay-surfaces.json', { body: JSON.stringify(surfaces, null, 2), contentType: 'application/json' });
    await page.screenshot({ path: testInfo.outputPath(`stacked-details-${width}.png`) });
    expect(surfaces.top.bottom + 4, 'Temporary overlay stacks must leave an unobstructed canvas interaction gap.').toBeLessThanOrEqual(surfaces.bottom.top);
    for (const surface of [surfaces.top, surfaces.bottom]) {
      expect(surface.left).toBeGreaterThanOrEqual(surfaces.canvas.left);
      expect(surface.right).toBeLessThanOrEqual(surfaces.canvas.right);
      expect(surface.top).toBeGreaterThanOrEqual(surfaces.canvas.top);
      expect(surface.bottom).toBeLessThanOrEqual(surfaces.canvas.bottom);
    }
    const beforeScrolling = await geometry(page);
    const bottom = page.locator('.viewer-chrome-bottom');
    const overflows = await bottom.evaluate(element => element.scrollHeight > element.clientHeight);
    if (width === 390) expect(overflows, 'Phone controls retain their full content in a scrollable overlay.').toBe(true);
    if (overflows) {
      const zoom = page.getByRole('button', { name: 'Zoom out', exact: true });
      await zoom.scrollIntoViewIfNeeded();
      await zoom.focus();
      const scrollTop = await bottom.evaluate(element => element.scrollTop);
      await page.keyboard.press('PageDown');
      await expect.poll(() => bottom.evaluate(element => element.scrollTop)).toBeGreaterThan(scrollTop);
    }
    const targets = page.locator('.viewer-toolbar button:not(:disabled), .viewer-toolbar select, .viewer-footer button:not(:disabled), .canvas-navigation button, .validation-status summary, .view-context button, button[aria-label="Close details"]');
    expect(await targets.count()).toBeGreaterThan(5);
    for (const target of await targets.all()) {
      await target.scrollIntoViewIfNeeded();
      expect(await target.evaluate(element => {
        const r = element.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return !!hit && element.contains(hit);
      }), `Control must remain reachable by scrolling: ${await target.getAttribute('aria-label') ?? await target.innerText()}`).toBe(true);
    }
    expect(await geometry(page), 'Scrolling controls must not scroll, resize or recamera the diagram.').toEqual(beforeScrolling);
    const fit = page.getByRole('button', { name: 'Fit diagram' });
    await fit.scrollIntoViewIfNeeded();
    await fit.tap();
    await expect.poll(async () => Math.abs((await fittedContent(page)).occupancy - 0.9)).toBeLessThan(0.005);
    const validation = page.getByTestId('validation-status').locator('summary');
    await validation.scrollIntoViewIfNeeded();
    await validation.tap();
    const explanation = page.locator('.validation-popover p');
    await explanation.scrollIntoViewIfNeeded();
    await expect(explanation).toBeVisible();
    expect(await explanation.evaluate(element => {
      const r = element.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return !!hit && element.contains(hit);
    })).toBe(true);
    await validation.scrollIntoViewIfNeeded();
    await validation.tap();
    const continuation = page.getByRole('button', { name: /Continue SQL in Persistence and events/ });
    await continuation.scrollIntoViewIfNeeded();
    await continuation.tap();
    await expect(page.getByRole('combobox', { name: 'Perspective' })).toHaveValue('persistence-view');
    await expect(page.locator('[data-layout-state="ready"]')).toBeVisible();
    await context.close();
  });
}

test('embedded viewer adapts controls to its canvas width with a desktop sidebar', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?fixture=sample&embed=fixed');
  await page.locator('[data-embed-host]').evaluate(element => { (element as HTMLElement).style.width = '650px'; });
  await expect(page.locator('[data-layout-state="ready"]')).toBeVisible();
  await page.getByRole('combobox', { name: 'Perspective' }).selectOption('request-view');
  await expect(page.locator('[data-layout-state="ready"]')).toBeVisible();
  await page.locator('.react-flow__node-service').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('complementary', { name: 'Selection details' })).toBeVisible();
  await reveal(page);
  const canvas = await page.getByTestId('diagram-canvas').boundingBox();
  expect(canvas!.width).toBeCloseTo(344, 0);
  const surfaces = await page.evaluate(() => {
    const rect = (selector: string) => { const r = document.querySelector(selector)!.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
    return { top: rect('.viewer-chrome-top'), bottom: rect('.viewer-chrome-bottom'), fidelity: rect('.fidelity-status') };
  });
  await testInfo.attach('embedded-overlay-surfaces.json', { body: JSON.stringify({ canvas, ...surfaces }, null, 2), contentType: 'application/json' });
  await page.screenshot({ path: testInfo.outputPath('embedded-before-control-scroll.png') });
  expect(surfaces.fidelity.right, 'Source status must not overflow from canvas controls into selected details.').toBeLessThanOrEqual(canvas!.x + canvas!.width);
  expect(surfaces.top.bottom + 48).toBeLessThanOrEqual(surfaces.bottom.top + 1);
  const beforeScrolling = await geometry(page);
  const targets = page.locator('.viewer-toolbar button:not(:disabled), .viewer-toolbar select, .viewer-footer button:not(:disabled), .canvas-navigation button, .validation-status summary, .view-context button');
  const outside: string[] = [];
  for (const target of await targets.all()) {
    await target.scrollIntoViewIfNeeded();
    const result = await target.evaluate(element => {
      const r = element.getBoundingClientRect(), canvas = document.querySelector('.diagram-canvas')!.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { inside: r.left >= canvas.left && r.right <= canvas.right && r.top >= canvas.top && r.bottom <= canvas.bottom, receivesHit: !!hit && element.contains(hit), name: element.getAttribute('aria-label') ?? element.textContent };
    });
    if (!result.inside || !result.receivesHit) outside.push(result.name ?? 'Unnamed control');
  }
  await testInfo.attach('embedded-control-targets.json', { body: JSON.stringify({ canvas, outside }, null, 2), contentType: 'application/json' });
  await page.screenshot({ path: testInfo.outputPath('embedded-sidebar-controls.png') });
  expect(outside, 'Controls must stay in their canvas instead of overflowing into selected details.').toEqual([]);
  expect(await geometry(page)).toEqual(beforeScrolling);
  const fit = page.getByRole('button', { name: 'Fit diagram' });
  await fit.scrollIntoViewIfNeeded();
  await fit.click();
  await expect.poll(async () => Math.abs((await fittedContent(page)).occupancy - 0.9)).toBeLessThan(0.005);
  await page.mouse.move(0, 0);
  await page.locator('button:focus, select:focus').evaluateAll(elements => elements.forEach(element => (element as HTMLElement).blur()));
  await visibility(page, '0');
  const clean = await geometry(page);
  await reveal(page);
  expect(await geometry(page)).toEqual(clean);
  const validation = page.getByTestId('validation-status').locator('summary');
  await validation.scrollIntoViewIfNeeded();
  await validation.click();
  await page.locator('.validation-popover p').scrollIntoViewIfNeeded();
  await expect(page.locator('.validation-popover p')).toBeVisible();
  const close = page.getByRole('button', { name: 'Close details' });
  await close.click();
  await expect(page.getByRole('complementary', { name: 'Selection details' })).toHaveCount(0);
});
