import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { revealControls } from './control-helpers';

test('the initial architecture stays complete until presentation navigation is requested', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?fixture=sample');
  await expect(page.locator('[data-layout-state="ready"]')).toBeVisible();
  await expect(page.locator('.react-flow__node.is-dimmed, .react-flow__edge.is-dimmed')).toHaveCount(0);
  await expect(page.getByTestId('step-narrative')).toContainText('Explore the components');
  await expect.poll(() => page.getByTestId('diagram-canvas').evaluate(canvas => {
    const frame = canvas.getBoundingClientRect();
    const content = [...canvas.querySelectorAll('.react-flow__node, .react-flow__edge-path, .edge-label')].map(element => element.getBoundingClientRect());
    const left = Math.min(...content.map(box => box.left)), right = Math.max(...content.map(box => box.right));
    const top = Math.min(...content.map(box => box.top)), bottom = Math.max(...content.map(box => box.bottom));
    return Math.abs(Math.max((right - left) / frame.width, (bottom - top) / frame.height) - .9);
  })).toBeLessThan(.005);
  await revealControls(page, 'bottom');
  await page.getByRole('button', { name: 'Next step' }).click();
  await expect(page.locator('.step-index')).toContainText('01');
  await expect(page.locator('.react-flow__node.is-dimmed').first()).toBeVisible();
});

test('composition alternatives are inspectable without changing the editable semantic model', async ({ page }) => {
  await page.goto('/?fixture=sample&composition=layered');
  await expect(page.locator('[data-layout-state="ready"]')).toBeVisible();
  await expect(page.getByTestId('diagram-canvas')).toHaveAttribute('data-composition-selected', 'layered');
  const nodes = await page.locator('.react-flow__node').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-id')).sort());
  const edges = await page.locator('.react-flow__edge').evaluateAll(edges => edges.map(edge => edge.getAttribute('data-id')).sort());
  await page.goto('/?fixture=sample&composition=compact');
  await expect(page.locator('[data-layout-state="ready"]')).toBeVisible();
  await expect(page.getByTestId('diagram-canvas')).toHaveAttribute('data-composition-selected', 'compact');
  expect(await page.locator('.react-flow__node').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-id')).sort())).toEqual(nodes);
  expect(await page.locator('.react-flow__edge').evaluateAll(edges => edges.map(edge => edge.getAttribute('data-id')).sort())).toEqual(edges);
});

for (const viewport of [{ width: 1280, height: 720 }, { width: 1440, height: 900 }]) {
  test(`automatic overview chooses fitted readable content at ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/?fixture=sample');
    await expect(page.locator('[data-layout-state="ready"]')).toBeVisible();
    await expect(page.locator('.react-flow__node:not(.react-flow__node-group)')).toHaveCount(5);
    await expect(page.locator('.edge-label[data-relationship]')).toHaveCount(4);
    await revealControls(page, 'top');
    await page.getByRole('button', { name: 'Fit diagram' }).click();
    const read = () => page.evaluate(() => {
      const canvas = document.querySelector('.diagram-canvas')!.getBoundingClientRect();
      const matrix = new DOMMatrix(getComputedStyle(document.querySelector('.react-flow__viewport')!).transform);
      const fonts = (selector: string) => [...document.querySelectorAll(selector)].map(element => Number.parseFloat(getComputedStyle(element).fontSize) * matrix.a);
      const boxes = [...document.querySelectorAll('.react-flow__node, .react-flow__edge-path, .edge-label[data-relationship]')].map(element => element.getBoundingClientRect());
      return { componentTextPx: Math.min(...fonts('.react-flow__node .component-label')), relationshipTextPx: Math.min(...fonts('.edge-label[data-relationship]')),
        occupancy: Math.max((Math.max(...boxes.map(box => box.right)) - Math.min(...boxes.map(box => box.left))) / canvas.width, (Math.max(...boxes.map(box => box.bottom)) - Math.min(...boxes.map(box => box.top))) / canvas.height),
        composition: JSON.parse(document.querySelector('.diagram-canvas')!.getAttribute('data-composition-report')!) };
    });
    await expect.poll(async () => Math.abs((await read()).occupancy - 0.9)).toBeLessThan(0.005);
    const result = await read();
    await writeFile(testInfo.outputPath('fitted-readability.json'), JSON.stringify({ viewport, ...result }, null, 2));
    expect(result.componentTextPx).toBeGreaterThanOrEqual(14);
    expect(result.relationshipTextPx).toBeGreaterThanOrEqual(11);
  });
}
