import { expect, type Page } from '@playwright/test';

export async function revealControls(page: Page, region: 'top' | 'bottom') {
  const box = await page.getByTestId('diagram-canvas').boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + (region === 'top' ? 2 : box!.height - 2));
  await expect(page.locator(region === 'top' ? '.viewer-toolbar' : '.viewer-footer')).toHaveCSS('opacity', '1');
}

export async function hideControls(page: Page) {
  await page.locator('.viewer-chrome-top :focus, .viewer-chrome-bottom :focus').evaluateAll(elements => elements.forEach(element => (element as HTMLElement).blur()));
  const box = await page.getByTestId('diagram-canvas').boundingBox();
  await page.mouse.move(box!.x + 2, box!.y + box!.height / 2);
}

export async function revealBothControls(page: Page) {
  await revealControls(page, 'top');
  await page.getByRole('combobox', { name: 'Perspective' }).focus();
  await page.keyboard.press('Tab');
  await revealControls(page, 'bottom');
}
