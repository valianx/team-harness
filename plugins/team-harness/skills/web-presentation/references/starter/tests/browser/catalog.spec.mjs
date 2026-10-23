import { test, expect } from '@playwright/test';
import { activeSelector, healthy, inspection, record, route, settle, startCatalog } from './support.mjs';

let catalog;
test.beforeAll(async ({}, testInfo) => { catalog = await startCatalog(testInfo); });
test.afterAll(async () => { await catalog?.close(); });

const cases = [
  ['catalog-cover', 'h-cover'], ['catalog-section', 'h-section'],
  ['catalog-reveals', 'h-content'], ['catalog-compare', 'h-compare'],
  ['catalog-image', 'h-visual'], ['catalog-mermaid', 'h-visual'], ['catalog-local-frame', 'h-demo'],
];

test('catalog layouts occupy independently specified stage regions', async ({ page }, testInfo) => {
  for (const [alias, layout] of cases) {
    await page.goto(route(catalog.url, alias));
    const active = page.locator(activeSelector);
    await expect(active).toHaveAttribute('data-harness-layout', layout);
    if (alias === 'catalog-image') {
      const image = active.getByRole('img', { name: 'Order, stable key, then partner deduplication' });
      await expect(image, 'A required visual cannot disappear from the measurement set').toBeVisible();
      await expect.poll(() => image.evaluate(element => element.complete && element.naturalWidth > 0), { message: 'The required visual must decode, not merely have a CSS box' }).toBe(true);
      const size = await image.boundingBox();
      expect(size.width).toBeGreaterThan(300);
      expect(size.height).toBeGreaterThan(100);
    }
    if (alias === 'catalog-mermaid') {
      const diagram = active.locator('[data-harness-region="visual"] svg');
      await expect(diagram, 'The native diagram must actually render').toBeVisible();
      await expect(diagram).toContainText('Reservation request');
      await expect(diagram).toContainText('Reservation outcome');
    }
    if (layout === 'h-demo') await expect(active.locator('[data-harness-frame]')).toHaveAttribute('data-harness-frame-state', 'ready');
    await healthy(page, testInfo, alias);
    const actual = await active.evaluate(root => {
      const stage = root.getBoundingClientRect();
      return [...root.querySelectorAll('[data-harness-region]')].map(region => { const b = region.getBoundingClientRect(); return { name: region.dataset.harnessRegion, x: (b.left - stage.left) * 1280 / stage.width, y: (b.top - stage.top) * 720 / stage.height, w: b.width * 1280 / stage.width, h: b.height * 720 / stage.height }; });
    });
    const cover = ['h-cover', 'h-section'].includes(layout);
    const expected = { title: cover ? [64, 144, 1152, 176] : [64, 64, 1152, 88], body: cover ? [64, 352, 1152, 248] : [64, 176, 1152, 424], footer: [64, 624, 1152, 32] };
    if (layout === 'h-compare') Object.assign(expected, { left: [64, 176, 560, 424], right: [656, 176, 560, 424] });
    if (layout === 'h-visual') Object.assign(expected, { visual: [64, 176, 720, 424], explanation: [816, 176, 400, 424] });
    if (layout === 'h-demo') Object.assign(expected, { visual: [64, 176, 816, 424], explanation: [912, 176, 304, 424] });
    for (const [name, dimensions] of Object.entries(expected)) {
      const region = actual.find(item => item.name === name);
      expect(region, `${alias}: ${name} exists`).toBeTruthy();
      [region.x, region.y, region.w, region.h].forEach((value, index) => expect(Math.abs(value - dimensions[index]), `${alias}: ${name} dimension ${index}`).toBeLessThanOrEqual(1));
    }
  }
});

test('native shadow SVG geometry is measured and a collapsed diagram fails', async ({ page }, testInfo) => {
  await page.goto(route(catalog.url, 'catalog-mermaid'));
  const before = await healthy(page, testInfo, 'shadow-svg-healthy');
  expect(before.counts.svgs, 'Native shadow content must enter the geometry measurement set').toBeGreaterThan(0);
  const diagram = page.locator(`${activeSelector} [data-harness-region="visual"] svg`);
  await diagram.evaluate(svg => { svg.style.width = '0px'; svg.style.height = '0px'; });
  const report = await inspection(page);
  await record(page, testInfo, 'shadow-svg-collapsed-negative', report);
  expect(report.ready).toBe(false);
  expect(report.diagnostics.some(item => item.check === 'element-measurement' && item.slide === 'catalog-mermaid' && item.region === 'visual')).toBe(true);
});

test('native reveal facts are hidden, then visible in all three ordered states', async ({ page }, testInfo) => {
  await page.goto(route(catalog.url, 'catalog-reveals'));
  const lines = page.locator(`${activeSelector} li`);
  await expect(lines).toHaveText(['The first reveal keeps the delivery key.', 'The second reveal records the attempt.', 'The final reveal leaves the decision open.']);
  for (let click = 0; click <= 3; click++) {
    await expect(page.locator(activeSelector)).toHaveAttribute('data-harness-clicks', String(click));
    await settle(page);
    for (let index = 0; index < 3; index++) {
      await expect.poll(() => lines.nth(index).evaluate(element => { for (let node = element; node && !node.hasAttribute('data-harness-slide'); node = node.parentElement) { const style = getComputedStyle(node); if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) < 0.01) return false; } return true; }), { message: `Click ${click}, source fact ${index + 1}` }).toBe(index < click);
    }
    await healthy(page, testInfo, `reveal-${click === 0 ? 'initial' : click === 3 ? 'final' : `intermediate-${click}`}`);
    if (click < 3) await page.keyboard.press('ArrowRight');
  }
});

test('healthy DOM turns red for real overflow, clipping, overlap, missing assets and empty measurement', async ({ page }, testInfo) => {
  const injections = [
    ['long-title', 'content-overflow', body => { body.closest('[data-harness-slide]').querySelector('h1').textContent = 'A title that cannot fit its supported region '.repeat(12); }],
    ['overflow', 'content-overflow', body => { const p = document.createElement('p'); p.id = 'injected-long-copy'; p.textContent = 'Dense evidence '.repeat(150); body.append(p); }],
    ['clipping', 'content-clipping', body => { const box = document.createElement('div'); box.style.cssText = 'width:120px;height:20px;overflow:hidden'; box.innerHTML = '<p id="injected-clipped">The entire sentence must remain readable.</p>'; body.replaceChildren(box); }],
    ['overlap', 'content-overlap', body => { body.innerHTML = '<p id="injected-first" style="position:absolute;left:0;top:0">First independent statement</p><p id="injected-second" style="position:absolute;left:0;top:0">Second independent statement</p>'; }],
    ['missing-image', 'image-readiness', body => { const image = document.createElement('img'); image.id = 'injected-missing-image'; image.alt = 'Required missing fixture'; image.src = '/missing-required-asset-712.png'; image.width = 120; image.height = 80; body.append(image); }],
    ['zero-image', null, body => { const image = document.createElement('img'); image.id = 'injected-zero-image'; image.alt = 'Required visual collapsed by CSS'; image.src = '/images/retry-flow.svg'; image.style.cssText = 'display:block;width:0;height:0'; body.append(image); }],
  ];
  for (const [name, check, inject] of injections) {
    await page.goto(route(catalog.url, 'catalog-reveals'));
    await healthy(page, testInfo, `${name}-healthy-control`);
    await page.locator(`${activeSelector} [data-harness-region="body"]`).evaluate(inject);
    await settle(page);
    const report = await inspection(page);
    await record(page, testInfo, `${name}-negative`, report);
    const diagnostic = report.diagnostics.find(item => check ? item.check === check : item.element === '#injected-zero-image');
    expect(diagnostic, `${name}: real injected defect must be detected`).toBeDefined();
    expect(diagnostic, `${name}: real injected defect must be detected`).toMatchObject({ slide: 'catalog-reveals', region: name === 'long-title' ? 'title' : 'body' });
    expect(diagnostic.element).toBeTruthy();
    if (name === 'missing-image' || name === 'zero-image') expect(report.ready).toBe(false);
  }
  await page.goto(route(catalog.url, 'catalog-reveals'));
  await page.locator(activeSelector).evaluate(root => root.replaceChildren());
  const empty = await inspection(page);
  await record(page, testInfo, 'empty-negative', empty);
  expect(empty.ready).toBe(false);
  expect(empty.diagnostics.some(item => item.check === 'empty-measurement')).toBe(true);
});

test('native Mermaid messages and directional lines remain readable on the kit background', async ({ page }, testInfo) => {
  await page.goto(route(catalog.url, 'catalog-mermaid'));
  const diagram = page.locator(`${activeSelector} [data-harness-region="visual"] svg`);
  await expect(diagram).toBeVisible();
  await healthy(page, testInfo, 'mermaid-loaded-font-control');
  const labels = diagram.locator('.messageText');
  await expect(labels).toHaveCount(2);
  await expect(labels).toHaveText(['Reservation request', 'Reservation outcome']);
  const colors = await labels.evaluateAll(elements => elements.map(element => ({ text: element.textContent, fill: getComputedStyle(element).fill })));
  const lines = await diagram.locator('[class*="messageLine"]').evaluateAll(elements => elements.map(element => getComputedStyle(element).stroke));
  const background = await page.locator(activeSelector).evaluate(element => getComputedStyle(element).backgroundColor);
  const luminance = color => { const components = color.match(/[\d.]+/g)?.slice(0, 3).map(Number); expect(components, `Measured RGB color: ${color}`).toHaveLength(3); return components.map(value => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0); };
  const contrast = color => { const a = luminance(color), b = luminance(background); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
  await record(page, testInfo, 'mermaid-native-contrast', { background, labels: colors, directionalLines: lines });
  for (const label of colors) expect(contrast(label.fill), `${label.text}: label/background contrast`).toBeGreaterThanOrEqual(4.5);
  expect(lines.length).toBeGreaterThanOrEqual(2);
  for (const line of lines) expect(contrast(line), 'Directional line/background contrast').toBeGreaterThanOrEqual(3);
});

test('translated or ancestor-clipped stages cannot pass local region checks', async ({ page }, testInfo) => {
  await page.goto(route(catalog.url, 'catalog-reveals'));
  await healthy(page, testInfo, 'stage-healthy-control');
  await page.locator(activeSelector).evaluate(root => { root.style.transform = 'translateX(300px)'; });
  const translated = await inspection(page);
  await record(page, testInfo, 'stage-translated-negative', translated);
  expect(translated.diagnostics.some(item => /stage-clipping|stage-viewport/.test(item.check)), 'Correct local regions cannot conceal a stage moved outside the viewport or engine container').toBe(true);
  await page.goto(route(catalog.url, 'catalog-reveals'));
  await page.locator(activeSelector).evaluate(root => { const parent = root.parentElement; parent.style.width = '500px'; parent.style.overflow = 'hidden'; });
  const clipped = await inspection(page);
  await record(page, testInfo, 'stage-ancestor-clipped-negative', clipped);
  expect(clipped.diagnostics.some(item => item.check === 'stage-clipping')).toBe(true);
});

test('a local frame owns its keyboard and Escape restores presentation focus', async ({ page }, testInfo) => {
  await page.goto(route(catalog.url, 'catalog-local-frame'));
  const frame = page.locator(`${activeSelector} [data-harness-frame]`);
  await expect(frame).toHaveAttribute('data-harness-frame-state', 'ready');
  await expect(frame.locator('iframe')).toHaveAttribute('title', 'Catalog local retry simulation');
  const fallback = frame.getByRole('link', { name: 'Open static fallback' });
  await expect(fallback).toBeVisible();
  expect((await page.request.get(await fallback.evaluate(link => link.href))).ok()).toBe(true);
  const enter = frame.getByRole('button', { name: 'Enter demo', exact: true });
  await enter.click();
  const demo = page.frameLocator(`${activeSelector} iframe`);
  const input = demo.getByLabel('Delivery key');
  await expect(input).toBeFocused();
  await input.fill('delivery-browser');
  await input.press('ArrowRight');
  await expect(page.locator(activeSelector)).toHaveAttribute('data-harness-page', '7');
  await demo.getByRole('button', { name: 'Send attempt' }).click();
  await expect(demo.getByRole('status')).toHaveText('Key delivery-browser: attempt 1. Identity unchanged.');
  await demo.getByRole('button', { name: 'Send attempt' }).click();
  await expect(demo.getByRole('status')).toHaveText('Key delivery-browser: attempt 2. Identity unchanged.');
  await input.focus();
  await input.press('Escape');
  await expect(enter).toBeFocused();
  await expect(page.locator(activeSelector)).toHaveAttribute('data-harness-page', '7');
  await healthy(page, testInfo, 'local-frame-interacted');
});

test('pending, denied and cross-origin frames preserve an honest accessible fallback', async ({ page }, testInfo) => {
  await page.route('**/fixture-pending/', () => {});
  await page.route('**/fixture-denied/', route => route.fulfill({ status: 200, headers: { 'Content-Type': 'text/html', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "frame-ancestors 'none'" }, body: '<title>Denied fixture</title>' }));
  for (const [alias, expected] of [['catalog-pending-frame', /error/], ['catalog-denied-frame', /error|unverified/], ['catalog-external-frame', /unverified/]]) {
    await page.goto(route(catalog.url, alias), { waitUntil: 'domcontentloaded' });
    const frame = page.locator(`${activeSelector} [data-harness-frame]`);
    await expect(frame).toHaveAttribute('data-harness-frame-state', expected);
    await expect(frame.getByRole('link', { name: 'Open static fallback' })).toBeVisible();
    await expect(frame.locator('[data-harness-fallback] img')).toBeVisible();
    await expect.poll(() => frame.locator('[data-harness-fallback] img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
    const exit = frame.getByRole('button', { name: 'Return to presentation' });
    await exit.click();
    if (await frame.getAttribute('data-harness-frame-state') === 'unverified') {
      await expect(frame.getByText(/cannot be verified/)).toBeVisible();
      await expect(frame.getByRole('button', { name: 'Enter demo', exact: true })).toBeFocused();
    } else await expect(page.locator(activeSelector)).toBeFocused();
    await healthy(page, testInfo, alias);
  }
});

test('reduced motion keeps source facts, explicit navigation and focus usable', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(route(catalog.url, 'catalog-reveals'));
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  const before = await page.locator(`${activeSelector} [data-harness-region="body"]`).textContent();
  for (let click = 0; click < 3; click++) await page.keyboard.press('ArrowRight');
  await expect(page.locator(activeSelector)).toHaveAttribute('data-harness-clicks', '3');
  expect(await page.locator(`${activeSelector} [data-harness-region="body"]`).textContent()).toBe(before);
  expect(await page.locator(`${activeSelector} li`).first().evaluate(element => getComputedStyle(element).transitionDuration)).toBe('0s');
  await healthy(page, testInfo, 'reduced-motion-final');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.keyboard.press('ArrowRight');
  await expect(page.locator(activeSelector)).toHaveAttribute('data-harness-page', '4');
  await healthy(page, testInfo, 'reduced-motion-navigation');
  await page.goto(route(catalog.url, 'catalog-local-frame'));
  const frame = page.locator(`${activeSelector} [data-harness-frame]`);
  await expect(frame).toHaveAttribute('data-harness-frame-state', 'ready');
  const enter = frame.getByRole('button', { name: 'Enter demo', exact: true });
  await enter.click();
  const input = page.frameLocator(`${activeSelector} iframe`).getByLabel('Delivery key');
  await expect(input).toBeFocused();
  await input.press('Escape');
  await expect(enter).toBeFocused();
  await healthy(page, testInfo, 'reduced-motion-frame-focus');
});
