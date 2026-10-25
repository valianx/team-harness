import { test, expect } from '@playwright/test';

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
  const viewer = await page.locator('.architecture-viewer').boundingBox();
  await page.mouse.move(viewer!.x + 15, viewer!.y + 15);
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
