import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { parseModel } from '../../src/model';
import { hideControls } from './control-helpers';

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

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
  test(`known request label receives a normal click over its route at ${viewport.width}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/?fixture=sample');
    await expect(page.locator('.edge-label[data-relationship="request"]')).toHaveCount(1);
    await hideControls(page);
    await expect(page.getByRole('complementary', { name: 'Selection details' })).toHaveCount(0);
    const observed = await page.locator('.edge-label[data-relationship]').evaluateAll(labels => labels.map(label => {
      const box = label.getBoundingClientRect(), center = new DOMPoint(box.x + box.width / 2, box.y + box.height / 2);
      const paths = [...document.querySelectorAll<SVGPathElement>('.react-flow__edge-interaction')];
      return { id: label.getAttribute('data-relationship'), receivesHit: document.elementFromPoint(center.x, center.y)?.closest('.edge-label') === label,
        overlappingRoutes: paths.filter(path => path.isPointInStroke(center.matrixTransform(path.getScreenCTM()!.inverse()))).map(path => path.parentElement!.getAttribute('data-id')) };
    }));
    expect(observed.length).toBe(4);
    expect(observed.every(label => label.receivesHit)).toBe(true);
    expect(observed.find(label => label.id === 'request')!.overlappingRoutes).toContain('request');
    await page.locator('.edge-label[data-relationship="request"]').click();
    await expect(page.getByTestId('rf__edge-request')).toHaveClass(/selected/);
    await expect(page.locator('.react-flow__edge.selected')).toHaveCount(1);
    await expect(page.getByRole('complementary', { name: 'Selection details' })).toContainText('HTTPS');
    await testInfo.attach('label-route-hit-witness.json', { body: JSON.stringify({ target: 'request', observed }, null, 2), contentType: 'application/json' });
  });
}
