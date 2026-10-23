import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { parseModel } from '../../src/model';

const editableModel = parseModel(JSON.parse(readFileSync(new URL('../../fixtures/sample.json', import.meta.url), 'utf8')));

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
  test(`copied static build works with local assets at ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
    test.skip(!process.env.DIAGRAM_SERVER_COMMAND, 'Set DIAGRAM_SERVER_COMMAND to serve the copied production build.');
    const requests: string[] = [];
    const failed: string[] = [];
    page.on('request', request => requests.push(request.url()));
    page.on('requestfailed', request => failed.push(`${request.url()}: ${request.failure()?.errorText}`));
    await page.setViewportSize(viewport);
    await page.goto('/?fixture=sample');
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

  test(`copied static build renders its editable default model at ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: editableModel.title, exact: true })).toBeVisible();
    await expect(page.locator('[data-layout-state="ready"]')).toBeVisible();
    await page.getByRole('combobox', { name: 'Perspective' }).selectOption('');
    await expect(page.locator('[data-layout-state="ready"]')).toBeVisible();

    await expect(page.locator('.react-flow__node:not(.react-flow__node-group)')).toHaveCount(editableModel.nodes.length);
    await expect(page.locator('.react-flow__node-group')).toHaveCount(editableModel.groups.length);
    await expect(page.locator('.react-flow__edge')).toHaveCount(editableModel.edges.length);
    for (const node of editableModel.nodes) await expect(page.getByTestId(`rf__node-${node.id}`).locator('.component-label')).toHaveText(node.label);
    for (const group of editableModel.groups) await expect(page.getByTestId(`rf__node-${group.id}`).locator('.group-title')).toHaveText(group.label);
    for (const edge of editableModel.edges) await expect(page.getByTestId(`rf__edge-${edge.id}`)).toHaveCount(1);
    expect((await page.locator('.edge-label[data-relationship]').allTextContents()).sort()).toEqual(editableModel.edges.filter(edge => edge.label).map(edge => edge.label!).sort());
    await expect(page.locator('.geometry-diagnostics')).toHaveCount(0);
    if (!editableModel.nodes.length && !editableModel.groups.length) await expect(page.getByRole('heading', { name: 'No components in this perspective' })).toBeVisible();

    await testInfo.attach('editable-model-contract.json', { body: JSON.stringify({ title: editableModel.title, components: editableModel.nodes.length, groups: editableModel.groups.length, relationships: editableModel.edges.length }, null, 2), contentType: 'application/json' });
    await page.screenshot({ path: testInfo.outputPath(`editable-model-${viewport.width}.png`), fullPage: true });
  });
}
