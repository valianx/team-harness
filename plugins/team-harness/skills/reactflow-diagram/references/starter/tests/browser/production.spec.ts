import { test, expect } from '@playwright/test';

test.skip(!process.env.DIAGRAM_SERVER_COMMAND, 'Set DIAGRAM_SERVER_COMMAND to serve the copied production build.');

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
  test(`copied static build works with local assets at ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
    const requests: string[] = [];
    const failed: string[] = [];
    page.on('request', request => requests.push(request.url()));
    page.on('requestfailed', request => failed.push(`${request.url()}: ${request.failure()?.errorText}`));
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.locator('[data-layout-state="ready"]')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Payment platform', exact: true })).toBeVisible();
    await expect(page.locator('.react-flow__edge')).toHaveCount(1);

    await page.locator('.react-flow__node-service').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('complementary', { name: 'Selection details' })).toContainText('Synthetic payment architecture');
    await expect(page.getByRole('complementary', { name: 'Selection details' })).toContainText('Processing');
    await page.getByRole('button', { name: 'Close details' }).click();

    await page.getByRole('combobox', { name: 'Perspective' }).selectOption('');
    await expect(page.getByRole('button', { name: 'Next step' })).toBeEnabled();
    await expect(page.locator('.react-flow__edge')).toHaveCount(4);
    const paths = () => page.locator('.react-flow__edge-path').evaluateAll(paths => paths.map(path => path.getAttribute('d')));
    const before = await paths();
    await page.getByRole('button', { name: 'Next step' }).click();
    await expect(page.getByTestId('step-narrative')).toContainText('Store the payment');
    expect(await paths()).toEqual(before);

    await page.getByRole('combobox', { name: 'Perspective' }).selectOption('request-view');
    await expect(page.getByTestId('view-context')).toBeVisible();
    await page.getByRole('button', { name: /Continue SQL in Persistence and events/ }).click();
    await expect(page.getByRole('combobox', { name: 'Perspective' })).toHaveValue('persistence-view');
    await expect(page.locator('[data-layout-state="ready"]')).toBeVisible();
    await expect(page.locator('.react-flow__node-database')).toBeVisible();

    const origin = new URL(page.url()).origin;
    const assets = requests.filter(url => new URL(url).pathname.includes('/assets/'));
    expect(assets.some(url => /\.woff2?(?:\?|$)/.test(url))).toBe(true);
    expect(assets.some(url => /\.js(?:\?|$)/.test(url))).toBe(true);
    expect(requests.filter(url => new URL(url).origin !== origin)).toEqual([]);
    expect(requests.filter(url => /\/@vite|\/src\/|\.(?:ts|tsx)(?:\?|$)/.test(url))).toEqual([]);
    expect(failed).toEqual([]);
    await testInfo.attach('standalone-requests.json', { body: JSON.stringify({ requests, failed }, null, 2), contentType: 'application/json' });
    await page.screenshot({ path: testInfo.outputPath(`standalone-${viewport.width}.png`), fullPage: true });
  });
}
