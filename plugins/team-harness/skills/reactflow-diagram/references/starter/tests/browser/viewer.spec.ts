import { test, expect, type Page } from '@playwright/test';

async function ready(page: Page, fixture = 'sample') {
  await page.goto(`/?fixture=${fixture}`);
  await expect(page.locator('[data-layout-state="ready"]')).toBeVisible();
  const viewer = await page.locator('.architecture-viewer').boundingBox();
  await page.mouse.move(viewer!.x + 12, viewer!.y + 12);
}

async function selectedComponentIsVisible(page: Page) {
  await expect.poll(async () => {
    const canvas = await page.getByTestId('diagram-canvas').boundingBox();
    const node = await page.locator('.react-flow__node.selected .component-card').boundingBox();
    return !!canvas && !!node && node.x >= canvas.x + 4 && node.y >= canvas.y + 4 && node.x + node.width <= canvas.x + canvas.width - 4 && node.y + node.height <= canvas.y + canvas.height - 4;
  }).toBe(true);
}

test('shows source evidence for keyboard-selected components and relationships', async ({ page }, testInfo) => {
  await ready(page);
  const component = page.locator('.react-flow__node-service').first();
  await component.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('complementary', { name: 'Selection details' })).toContainText('Evidence');
  await expect(page.getByRole('complementary', { name: 'Selection details' })).toContainText('Source');
  await selectedComponentIsVisible(page);
  await page.screenshot({ path: testInfo.outputPath('component-details-1440.png'), fullPage: true });
  await page.getByRole('button', { name: 'Close details' }).click();
  const edge = page.locator('.react-flow__edge').first();
  await edge.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('complementary', { name: 'Selection details' })).toContainText('Relationship');
  await expect(page.getByRole('complementary', { name: 'Selection details' })).toContainText('Evidence');
});

test('group details keep visual inference and missing decisions explicit', async ({ page }) => {
  await ready(page);
  await page.locator('.react-flow__node-group[data-id="processing"]').focus();
  await page.keyboard.press('Enter');
  const panel = page.getByRole('complementary', { name: 'Selection details' });
  await expect(panel).toContainText('Inference');
  await expect(panel).toContainText('Decision not recorded');
  await expect(panel).toContainText('does not imply an architecture classification');
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(page.locator('.react-flow__node-group[data-id="processing"]')).toBeFocused();
});

test('waits for actual fonts and discards an earlier perspective while fonts load', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(/\.woff2?(?:\?|$)/, async route => { await gate; await route.continue(); });
  await page.goto('/?fixture=sample', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('status')).toContainText('Preparing your architecture');
  await page.getByRole('combobox', { name: 'Perspective' }).selectOption('persistence-view');
  release();
  await expect(page.locator('[data-layout-state="ready"]')).toBeVisible();
  await expect(page.locator('.react-flow__node[data-id="gateway"]')).toHaveCount(0);
  await expect(page.locator('.react-flow__node[data-id="events"]')).toBeVisible();
});

test('failed local font readiness produces a layout diagnostic', async ({ page }) => {
  await page.route(/\.woff2?(?:\?|$)/, route => route.abort('failed'));
  await page.goto('/?fixture=sample');
  await expect(page.getByRole('alert')).toContainText('Layout needs attention');
  await expect(page.getByRole('alert')).toContainText('diagnostic');
  await expect(page.locator('[data-layout-state="ready"]')).toHaveCount(0);
});

test('presentation steps preserve geometry while changing focus and narrative', async ({ page }) => {
  await ready(page);
  await page.getByRole('combobox', { name: 'Perspective' }).selectOption('');
  await expect(page.getByRole('button', { name: 'Next step' })).toBeEnabled();
  const positions = () => page.locator('.react-flow__node').evaluateAll(nodes => nodes.map(node => ({
    id: node.getAttribute('data-id'), transform: (node as HTMLElement).style.transform,
    width: (node as HTMLElement).style.width, height: (node as HTMLElement).style.height,
  })));
  const before = await positions();
  const narrative = await page.getByTestId('step-narrative').innerText();
  await page.getByRole('button', { name: 'Next step' }).click();
  await expect(page.getByTestId('step-narrative')).not.toHaveText(narrative);
  expect(await positions()).toEqual(before);
  await expect(page.locator('.react-flow__node.is-focused:not(.react-flow__node-group)').first()).toBeVisible();
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
  test(`guided payment focus fits at ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await ready(page);
    const focused = page.locator('.react-flow__node.is-focused:not(.react-flow__node-group)');
    const visible = async (ids: string[]) => {
      expect(await focused.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-id')).sort())).toEqual([...ids].sort());
      await expect.poll(async () => {
        const canvas = await page.getByTestId('diagram-canvas').boundingBox();
        const cards = await page.locator('.react-flow__node.is-focused:not(.react-flow__node-group), .react-flow__edge.is-focused .react-flow__edge-path, .edge-label.is-focused').evaluateAll(nodes => nodes.map(node => {
          const box = node.getBoundingClientRect();
          return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
        }));
        return !!canvas && cards.length >= ids.length && cards.every(card => card.left >= canvas.x + 4 && card.right <= canvas.x + canvas.width - 4 && card.top >= canvas.y + 4 && card.bottom <= canvas.y + canvas.height - 4);
      }).toBe(true);
    };
    await expect(focused).toHaveCount(0);
    await page.getByRole('button', { name: 'Next step' }).click();
    await visible(['gateway', 'orchestrator']);
    await page.screenshot({ path: testInfo.outputPath(`guided-request-${viewport.width}.png`), fullPage: true });
    await page.getByRole('combobox', { name: 'Perspective' }).selectOption('');
    await expect(page.locator('[data-layout-state="ready"]')).toBeVisible();
    await visible(['gateway', 'orchestrator']);
    await page.getByRole('button', { name: 'Next step' }).click();
    await visible(['orchestrator', 'database']);
    await page.getByRole('button', { name: 'Next step' }).click();
    await visible(['events', 'provider']);
  });
}

test('measures local Inter labels without clipping and reserves group headers', async ({ page }) => {
  await ready(page, 'long-label');
  await page.getByRole('combobox', { name: 'Perspective' }).selectOption('');
  await expect(page.locator('[data-layout-state="ready"]')).toBeVisible();
  const clipping = await page.locator('.react-flow__node .component-label, .react-flow__node .group-title, .edge-label').evaluateAll(elements =>
    elements.filter(element => element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1)
      .map(element => element.textContent));
  expect(clipping).toEqual([]);
  expect(await page.locator('.component-label').first().evaluate(element => getComputedStyle(element).fontFamily)).toContain('Inter');
  const headers = await page.locator('.react-flow__node-group').evaluateAll(groups => groups.map(group => {
    const header = group.querySelector('.group-header')!.getBoundingClientRect();
    const id = group.getAttribute('data-id')!;
    const children = [...group.closest('.react-flow')!.querySelectorAll(`[data-parent="${id}"]`)];
    return { id, bottom: header.bottom, childCount: children.length, childTop: Math.min(...children.map(child => child.getBoundingClientRect().top)) };
  }));
  expect(headers.map(header => header.id).sort()).toEqual(['payments', 'processing']);
  for (const header of headers) {
    expect(header.childCount).toBe(header.id === 'payments' ? 3 : 1);
    expect(header.childTop).toBeGreaterThanOrEqual(header.bottom);
  }
});

test('switches explicit perspectives and keeps continuation context accessible', async ({ page }) => {
  await ready(page);
  const select = page.getByRole('combobox', { name: 'Perspective' });
  expect(await select.locator('option').count()).toBeGreaterThan(1);
  const current = await select.inputValue();
  const next = await select.locator('option').evaluateAll((options, value) => options.map(option => (option as HTMLOptionElement).value).find(candidate => candidate && candidate !== value)!, current);
  await select.selectOption(next);
  await expect(select).not.toHaveValue(current);
  await expect(page.locator('[data-layout-state="ready"]')).toBeVisible();
  await expect(page.getByTestId('view-context')).toBeVisible();
});

test('keeps unresolved sources and missing validation visible', async ({ page }) => {
  await ready(page, 'unresolved');
  await expect(page.getByTestId('fidelity-status')).toContainText('Draft');
  await expect(page.getByTestId('review-notes')).toBeVisible();
  await expect(page.getByTestId('validation-status')).toContainText('Validation incomplete');
  await page.getByTestId('validation-status').locator('summary').click();
  await expect(page.getByTestId('validation-status').getByText('Rendered', { exact: true })).toBeVisible();
  await expect(page.getByTestId('validation-status').getByText('Not supplied')).toHaveCount(2);
});

test('empty and invalid models reach actionable terminal states', async ({ page }) => {
  await page.goto('/?fixture=empty');
  await expect(page.getByRole('heading', { name: 'No components in this perspective' })).toBeVisible();
  await page.goto('/?fixture=invalid');
  await expect(page.getByRole('alert')).toContainText('Model could not be read');
  await expect(page.getByRole('alert')).toContainText('endpoint');
});

test('an embedded viewer reports an unusable host size and recovers after resizing', async ({ page }) => {
  await page.goto('/?fixture=sample&embed=zero');
  await expect(page.getByRole('alert')).toContainText('Give the viewer a width and height');
  await page.locator('[data-embed-host]').evaluate(element => {
    (element as HTMLElement).style.width = '1100px';
    (element as HTMLElement).style.height = '650px';
  });
  await expect(page.locator('[data-layout-state="ready"]')).toBeVisible();
});

test('reduced motion and presentation viewport keep controls and selected content usable', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  await page.getByRole('combobox', { name: 'Perspective' }).selectOption('');
  await expect(page.getByRole('button', { name: 'Next step' })).toBeEnabled();
  await page.getByRole('button', { name: 'Next step' }).click();
  await page.locator('.react-flow__node-service').first().click();
  const canvas = await page.getByTestId('diagram-canvas').boundingBox();
  const panel = await page.getByRole('complementary', { name: 'Selection details' }).boundingBox();
  expect(canvas).not.toBeNull();
  expect(panel).not.toBeNull();
  expect(canvas!.x + canvas!.width).toBeLessThanOrEqual(panel!.x + 1);
  await selectedComponentIsVisible(page);
  await expect(page.getByRole('button', { name: 'Fit diagram' })).toBeInViewport();
  expect(await page.locator('.architecture-viewer').evaluate(element => getComputedStyle(element).getPropertyValue('--motion-duration').trim())).toBe('0ms');
});
