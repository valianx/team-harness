import { test, expect } from '@playwright/test';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { activeSelector, healthy, inspection, project, record, route, settle, startCatalog } from './support.mjs';

let catalog;
test.beforeAll(async ({}, testInfo) => { catalog = await startCatalog(testInfo); });
test.afterAll(async () => { await catalog?.close(); });

const cases = [
  ['catalog-cover', 'h-cover'], ['catalog-section', 'h-section'],
  ['catalog-reveals', 'h-content'], ['catalog-compare', 'h-compare'],
  ['catalog-image', 'h-visual'], ['catalog-mermaid', 'h-visual'], ['catalog-local-frame', 'h-demo'],
  ['catalog-code', 'h-content'],
];

async function renderedContrast(locator, kind = 'text') {
  return locator.evaluateAll((elements, kind) => {
    const color = value => {
      const component = value => value.endsWith('%') ? parseFloat(value) / 100 : Number(value);
      const srgb = value.match(/^color\(srgb\s+([^)]*)\)$/);
      if (srgb) {
        const [channels, alpha] = srgb[1].split('/').map(value => value.trim());
        const result = [...channels.split(/\s+/).map(component), alpha === undefined ? 1 : component(alpha)];
        if (result.length !== 4 || result.some(value => !Number.isFinite(value) || value < 0 || value > 1))
          throw new Error(`Unsupported computed sRGB color: ${value}`);
        return result;
      }
      const match = value.match(/^rgba?\(([^)]+)\)$/);
      if (!match) throw new Error(`Unsupported computed color: ${value}`);
      const channels = match[1].split(/[\s,/]+/).filter(Boolean);
      const result = [...channels.slice(0, 3).map(value => value.endsWith('%') ? component(value) : Number(value) / 255), channels[3] === undefined ? 1 : component(channels[3])];
      if (![3, 4].includes(channels.length) || result.some(value => !Number.isFinite(value) || value < 0 || value > 1))
        throw new Error(`Unsupported computed RGB color: ${value}`);
      return result;
    };
    const over = (front, back) => {
      const alpha = front[3] + back[3] * (1 - front[3]);
      return alpha ? [...front.slice(0, 3).map((value, index) => (value * front[3] + back[index] * back[3] * (1 - front[3])) / alpha), alpha] : [0, 0, 0, 0];
    };
    const luminance = value => value.slice(0, 3).map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    return elements.map(element => {
      const style = getComputedStyle(element);
      let ink = color(kind === 'outline' ? style.outlineColor : style.color);
      let background = [0, 0, 0, 0];
      const layers = [], unsupported = [];
      for (let node = element; node; node = node.parentElement) {
        const paint = getComputedStyle(node);
        const label = node.id ? `#${node.id}` : `${node.tagName.toLowerCase()}.${[...node.classList].join('.')}`;
        if (paint.backgroundImage !== 'none' && background[3] < 1) unsupported.push(`${label}: ${paint.backgroundImage}`);
        if (paint.filter !== 'none' || paint.mixBlendMode !== 'normal') unsupported.push(`${label}: filter or blend changes the paint`);
        const fill = kind === 'outline' && node === element ? [0, 0, 0, 0] : color(paint.backgroundColor);
        ink = over(ink, fill);
        background = over(background, fill);
        const opacity = Number(paint.opacity);
        ink[3] *= opacity;
        background[3] *= opacity;
        layers.push({ element: label, color: paint.backgroundColor, opacity });
      }
      ink = over(ink, [1, 1, 1, 1]);
      background = over(background, [1, 1, 1, 1]);
      const a = luminance(ink), b = luminance(background);
      const bounds = element.getBoundingClientRect();
      return {
        text: element.textContent.trim(), kind, color: kind === 'outline' ? style.outlineColor : style.color,
        foreground: ink, background, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), layers, unsupported,
        visible: bounds.width > 0 && bounds.height > 0 && style.visibility === 'visible',
        disabled: element.matches(':disabled'), outlineStyle: style.outlineStyle, outlineWidth: parseFloat(style.outlineWidth),
      };
    });
  }, kind);
}

function readable(samples, label, minimum = 4.5) {
  expect(samples.length, `${label}: rendered samples must exist`).toBeGreaterThan(0);
  for (const sample of samples) {
    expect(sample.visible, `${label}: ${sample.text} is measurable`).toBe(true);
    expect(sample.unsupported, `${label}: unsupported background paint cannot count as measured contrast`).toEqual([]);
    expect(sample.ratio, `${label}: ${sample.text}; foreground ${sample.foreground}; background ${sample.background}`).toBeGreaterThanOrEqual(minimum);
  }
}

async function frameTextContrast(page, frame, testInfo, name) {
  const samples = await renderedContrast(frame.locator('.harness-frame-status, .harness-frame-placeholder strong, .harness-frame-placeholder p, .harness-frame-fallback a, .harness-frame-fallback p'));
  await record(page, testInfo, `${name}-text-contrast`, { state: await frame.getAttribute('data-harness-frame-state'), samples });
  expect(samples.length).toBeGreaterThanOrEqual(3);
  readable(samples, name);
}

async function frameControlContrast(page, frame, testInfo, name) {
  const buttons = frame.locator('button');
  const disabled = [];
  for (const button of await buttons.all()) {
    if (await button.isDisabled()) {
      disabled.push(...await renderedContrast(button));
      continue;
    }
    const states = [];
    await page.locator(activeSelector).focus();
    await page.mouse.move(0, 0);
    states.push({ state: 'normal', samples: await renderedContrast(button) });
    await button.hover();
    states.push({ state: 'hover', samples: await renderedContrast(button) });
    await page.mouse.move(0, 0);
    await page.keyboard.press('Tab');
    await button.focus();
    await expect(button).toBeFocused();
    expect(await button.evaluate(element => element.matches(':focus-visible')), 'A real keyboard focus indicator must be present').toBe(true);
    states.push({ state: 'focus', samples: await renderedContrast(button), outline: await renderedContrast(button, 'outline') });
    const index = await button.evaluate(element => [...element.closest('[data-harness-frame]').querySelectorAll('button')].indexOf(element));
    await record(page, testInfo, `${name}-control-${index}-contrast`, { states });
    for (const state of states) {
      readable(state.samples, `${name}: ${state.state}`);
      if (state.outline) {
        expect(state.outline[0].outlineStyle).not.toBe('none');
        expect(state.outline[0].outlineWidth).toBeGreaterThan(0);
        readable(state.outline, `${name}: focus outline against its adjacent parent surface`, 3);
      }
    }
  }
  if (disabled.length) await record(page, testInfo, `${name}-disabled-control-observations`, { disabled, reason: 'Unavailable controls are measured but exempt from active-control contrast requirements.' });
}

test('catalog text and highlighted code meet contrast on their rendered surfaces', async ({ page }, testInfo) => {
  await page.goto(route(catalog.url, 'catalog-code'));
  await settle(page);
  const root = page.locator(activeSelector);
  const paletteSelected = await access(resolve(project, 'styles/harness-theme-base.css')).then(() => true, error => {
    if (error.code === 'ENOENT') return false;
    throw error;
  });
  test.skip(!paletteSelected, 'The unselected legacy default does not include styles/harness-theme-base.css.');
  const codeText = await root.evaluate(element => getComputedStyle(element).getPropertyValue('--h-code-text').trim());
  expect(codeText, 'A selected palette must load its --h-code-text value before contrast can be assessed').not.toBe('');
  const highlighted = root.locator('pre');
  await highlighted.evaluate(element => element.closest('[style*="--slidev-code-font-size"]')?.style.removeProperty('--slidev-code-font-size'));
  expect(await highlighted.evaluate(element => getComputedStyle(element).fontSize), 'The selected theme must supply 22px without the legacy fixture override').toBe('22px');
  await healthy(page, testInfo, 'palette-code-native-font');
  const groups = [
    ['pre code', root.locator('pre code')],
    ['body', root.locator('.harness-body > p').first()],
    ['muted', root.locator('blockquote p')],
    ['footer', root.locator('.harness-footer > div')],
    ['page label', root.locator('.harness-page')],
    ['link', root.locator('.harness-body a')],
    ['inline code', root.locator('.harness-body p > code')],
  ];
  const samples = [];
  for (const [label, locator] of groups) samples.push({ label, samples: await renderedContrast(locator) });
  const tokens = root.locator('pre code span[style]').filter({ hasText: /[A-Za-z0-9]/ });
  expect(await tokens.count(), 'The real highlighter must render meaningful syntax tokens').toBeGreaterThan(3);
  samples.push({ label: 'syntax tokens', samples: await renderedContrast(tokens) });
  await record(page, testInfo, 'catalog-code-rendered-contrast', { codeText, groups: samples });
  for (const group of samples) readable(group.samples, group.label);
});

test('contrast measurements reject translucent text and report unsupported background paint', async ({ page }, testInfo) => {
  await page.goto(route(catalog.url, 'catalog-code'));
  await settle(page);
  const body = page.locator(`${activeSelector} .harness-body`);
  const text = body.locator('p').first();
  await body.evaluate(element => { element.style.opacity = '0.1'; });
  const faded = await renderedContrast(text);
  await record(page, testInfo, 'translucent-text-contrast-negative', { samples: faded });
  expect(faded[0].ratio, 'Ancestor opacity must lower actual text contrast').toBeLessThan(4.5);
  await body.evaluate(element => { element.style.opacity = '1'; });
  await text.evaluate(element => { element.style.color = 'color(srgb 1 1 1 / 50%)'; element.style.backgroundColor = '#000'; });
  const translucentSrgb = await renderedContrast(text);
  await record(page, testInfo, 'native-srgb-alpha-contrast-control', { samples: translucentSrgb });
  expect(translucentSrgb[0].ratio, 'Half-opacity white on black has independently calculated contrast 5.2808:1').toBeCloseTo(5.2808, 3);
  await text.evaluate(element => { element.style.removeProperty('color'); element.style.removeProperty('background-color'); });
  await body.evaluate(element => { element.style.opacity = '1'; element.style.backgroundImage = 'linear-gradient(90deg, #000, #fff)'; });
  const gradient = await renderedContrast(text);
  await record(page, testInfo, 'unsupported-background-contrast-negative', { samples: gradient });
  expect(gradient[0].unsupported.length, 'A nominal backgroundColor must not conceal unmeasured gradient paint').toBeGreaterThan(0);
});

test('ready frame controls keep readable normal, hover and keyboard-focus states', async ({ page }, testInfo) => {
  await page.goto(route(catalog.url, 'catalog-local-frame'));
  const frame = page.locator(`${activeSelector} [data-harness-frame]`);
  await expect(frame).toHaveAttribute('data-harness-frame-state', 'ready');
  await settle(page);
  await frameTextContrast(page, frame, testInfo, 'ready-frame');
  await frameControlContrast(page, frame, testInfo, 'ready-frame');
});

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

test('loaded media clipped by a nonzero ancestor fails its visual region check', async ({ page }, testInfo) => {
  await page.goto(route(catalog.url, 'catalog-image'));
  await healthy(page, testInfo, 'media-clipping-healthy-control');
  await page.locator(`${activeSelector} [data-harness-region="visual"]`).evaluate(async visual => {
    const wrapper = document.createElement('div');
    wrapper.id = 'injected-media-clip';
    wrapper.style.cssText = 'width:1px;height:1px;overflow:hidden';
    const image = document.createElement('img');
    image.id = 'injected-clipped-image';
    image.alt = 'Required visual clipped by its wrapper';
    image.src = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="180"><rect width="300" height="180" fill="#82c8b5"/></svg>')}`;
    image.style.cssText = 'display:block;width:300px;height:180px;max-width:none;max-height:none';
    wrapper.append(image);
    visual.replaceChildren(wrapper);
    await image.decode();
  });
  const image = page.locator('#injected-clipped-image');
  expect(await image.evaluate(element => element.complete && element.naturalWidth === 300 && element.naturalHeight === 180)).toBe(true);
  const bounds = await image.boundingBox();
  expect(bounds.width).toBeGreaterThan(100);
  expect(bounds.height).toBeGreaterThan(50);
  const report = await inspection(page);
  await record(page, testInfo, 'media-ancestor-clipped-negative', report);
  expect(report.diagnostics).not.toContainEqual(expect.objectContaining({ check: 'element-overflow', element: '#injected-clipped-image' }));
  const diagnostic = report.diagnostics.find(item => item.check === 'element-clipping' && item.element === '#injected-clipped-image');
  expect(diagnostic, 'A loaded media box inside the safe region cannot conceal ancestor clipping').toBeDefined();
  expect(diagnostic).toMatchObject({ slide: 'catalog-image', region: 'visual' });
  expect(diagnostic.message).toContain('#injected-media-clip');
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
    await frameTextContrast(page, frame, testInfo, alias);
    if (alias === 'catalog-pending-frame') {
      await frameControlContrast(page, frame, testInfo, alias);
      await page.route('**/retry-flow.svg?contrast-fallback-error', route => route.fulfill({ status: 404, body: 'Missing fallback fixture' }));
      await frame.locator('[data-harness-fallback] img').evaluate(image => { image.src += '?contrast-fallback-error'; });
      await expect(frame.locator('.harness-frame-fallback-error')).toBeVisible();
      const fallbackError = await renderedContrast(frame.locator('.harness-frame-fallback-error'));
      await record(page, testInfo, 'failed-fallback-text-contrast', { samples: fallbackError });
      readable(fallbackError, 'Failed fallback explanation');
    }
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
