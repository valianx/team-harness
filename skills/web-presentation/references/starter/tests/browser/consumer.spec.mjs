import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { inspectNativeStates, inventory, route } from './support.mjs';

test('selected consumer deck: every native route and each observed reveal has real geometry', async ({ page, baseURL }, testInfo) => {
  test.setTimeout(180_000);
  const localErrors = [];
  const origin = new URL(baseURL).origin;
  page.on('response', response => { if (new URL(response.url()).origin === origin && response.status() >= 400) localErrors.push({ url: response.url(), status: response.status() }); });
  const deck = await inventory();
  for (const slide of deck.slides) {
    await page.goto(route(baseURL, slide.alias));
    await inspectNativeStates(page, testInfo, slide, deck.slides.length);
  }
  await writeFile(testInfo.outputPath('consumer-resource-errors.json'), JSON.stringify(localErrors, null, 2));
  expect(localErrors, 'A same-origin iframe or asset 404 cannot count as a working consumer deck').toEqual([]);
});
