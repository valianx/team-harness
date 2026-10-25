import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { parseModel } from '../../src/model';

const model = parseModel(JSON.parse(readFileSync(new URL('../../fixtures/sample.json', import.meta.url), 'utf8')));
const labeled = model.edges.filter(edge => edge.label);

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
  test(`consumer relationship labels receive pointer input above SVG routes at ${viewport.width}`, async ({ page }) => {
    test.skip(!labeled.length, 'This consumer has no labeled relationships.');
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.locator('[data-layout-state="ready"]')).toBeVisible();
    const labels = page.locator('.diagram-canvas .edge-label[data-relationship]');
    await expect(labels).toHaveCount(labeled.length);
    await page.mouse.move(-10, -10);
    await expect.poll(() => labels.evaluateAll(elements => elements.filter(label => {
      const box = label.getBoundingClientRect();
      return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest('.edge-label') !== label;
    }).map(label => label.getAttribute('data-relationship')))).toEqual([]);
    const selected = await labels.first().getAttribute('data-relationship');
    await labels.first().click();
    await expect(page.getByRole('complementary')).toContainText(labeled.find(edge => edge.id === selected)!.label!);
  });
}
