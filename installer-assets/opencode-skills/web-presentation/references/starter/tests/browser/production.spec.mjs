import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { activeSelector, inspectNativeStates, inventory, route } from './support.mjs';

test('copied static delivery resolves fonts, images, frames and native routes under its base', async ({ page, baseURL }, testInfo) => {
  test.setTimeout(120_000);
  const base = new URL(baseURL);
  expect(base.pathname, 'Static verification requires a real non-root deployment path').not.toBe('/');
  expect(base.pathname.endsWith('/')).toBe(true);
  const requests = [];
  const errors = [];
  page.on('response', response => { const url = new URL(response.url()); requests.push({ url: url.href, status: response.status(), kind: response.request().resourceType() }); if (url.origin === base.origin && response.status() >= 400) errors.push(`${response.status()} ${url.href}`); });
  const deck = await inventory();
  for (const slide of deck.slides) {
    await page.goto(route(baseURL, slide.alias));
    await expect(page.locator(activeSelector)).toHaveAttribute('data-harness-page', String(slide.page));
    await inspectNativeStates(page, testInfo, slide, deck.slides.length, 'static-');
    const resources = await page.locator(`${activeSelector} img, ${activeSelector} iframe, ${activeSelector} [data-harness-fallback] a`).evaluateAll(elements => elements.map(element => ({ tag: element.tagName, url: element.src || element.href })));
    for (const resource of resources) {
      const url = new URL(resource.url);
      if (url.origin === base.origin) { expect(url.pathname, resource.url).toMatch(new RegExp(`^${base.pathname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)); expect((await page.request.get(url.href)).ok(), `${resource.tag} ${url.href}`).toBe(true); }
    }
    await page.reload();
    await expect(page.locator(activeSelector)).toHaveAttribute('data-harness-page', String(slide.page));
  }
  expect(await page.evaluate(() => [...document.fonts].some(font => /Inter/i.test(font.family) && font.status === 'loaded')), 'A local Inter face must actually be loaded').toBe(true);
  const fonts = requests.filter(item => item.kind === 'font');
  expect(fonts.length, 'Font responses must be observed, not inferred from CSS').toBeGreaterThan(0);
  for (const font of fonts) { expect(new URL(font.url).origin).toBe(base.origin); expect(new URL(font.url).pathname.startsWith(base.pathname)).toBe(true); expect(font.status).toBeLessThan(400); }
  await writeFile(testInfo.outputPath('static-resource-evidence.json'), JSON.stringify({ base: baseURL, requests, errors, external: requests.filter(item => new URL(item.url).origin !== base.origin), limit: 'Resource availability and notes exclusion do not establish confidentiality or external authentication.' }, null, 2));
  expect(errors).toEqual([]);
});
