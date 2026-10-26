import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { cp, mkdir, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { test, expect, type Page } from '@playwright/test';
import { flowFixture } from '../fixtures/flow';
import { revealControls } from './control-helpers';

const run = promisify(execFile);
const project = fileURLToPath(new URL('../../', import.meta.url));
const viewports = [{ width: 1280, height: 720 }, { width: 1440, height: 900 }];

async function ready(page: Page, fixture: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/?fixture=${fixture}`);
  await expect(page.locator('[data-layout-state="ready"]')).toBeVisible();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.mouse.move(-10, -10);
}

async function openChecks(page: Page) {
  await revealControls(page, 'bottom');
  const status = page.getByTestId('validation-status');
  await status.locator('summary').click();
  return status;
}

for (const viewport of viewports) for (const side of ['above', 'below'] as const) {
  test(`measured ${side} flow preserves the complete unwrapped path at ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const fixture = `flow-${side}`, model = flowFixture(side, side === 'above', side === 'above');
    await ready(page, fixture);
    const observed = await page.getByTestId('diagram-canvas').evaluate(canvas => {
      const scale = new DOMMatrix(getComputedStyle(canvas.querySelector('.react-flow__viewport')!).transform).a;
      const minimumFont = (selector: string) => Math.min(...[...canvas.querySelectorAll(selector)].map(element => Number.parseFloat(getComputedStyle(element).fontSize) * scale));
      const boxes = Object.fromEntries([...canvas.querySelectorAll('.react-flow__node')].map(node => {
        const box = node.getBoundingClientRect();
        return [node.getAttribute('data-id')!, { left: box.left, right: box.right, top: box.top, bottom: box.bottom, centerY: box.y + box.height / 2 }];
      }));
      return { boxes, nodes: [...canvas.querySelectorAll('.react-flow__node:not(.react-flow__node-group)')].map(node => node.getAttribute('data-id')).sort(),
        groups: [...canvas.querySelectorAll('.react-flow__node-group')].map(node => node.getAttribute('data-id')).sort(),
        edges: [...canvas.querySelectorAll('.react-flow__edge')].map(edge => edge.getAttribute('data-id')).sort(),
        componentTextPx: minimumFont('.react-flow__node .component-label'), relationshipTextPx: minimumFont('.edge-label[data-relationship]'),
        diagnostics: JSON.parse(canvas.getAttribute('data-layout-diagnostics')!), composition: JSON.parse(canvas.getAttribute('data-composition-report')!) };
    });
    expect(observed.nodes).toEqual(model.nodes.map(node => node.id).sort());
    expect(observed.groups).toEqual(model.groups.map(group => group.id).sort());
    expect(observed.edges).toEqual(model.edges.map(edge => edge.id).sort());
    const renderedModel = JSON.parse((await page.locator('.architecture-viewer').getAttribute('data-model-content'))!);
    expect({ ...renderedModel, views: [] }).toEqual(model);
    expect(observed.diagnostics).toEqual([]);
    expect(observed.componentTextPx).toBeGreaterThanOrEqual(14);
    expect(observed.relationshipTextPx).toBeGreaterThanOrEqual(11);
    const primary = ['intake', 'router', 'journal'].map(id => observed.boxes[id]);
    for (let index = 1; index < primary.length; index++) {
      expect(primary[index].left).toBeGreaterThanOrEqual(primary[index - 1].right - 1);
      expect(Math.abs(primary[index].centerY - primary[0].centerY)).toBeLessThan(1);
    }
    for (const id of ['lookup', 'memo', 'helper-zone']) {
      if (side === 'above') expect(observed.boxes[id].bottom).toBeLessThanOrEqual(Math.min(...primary.map(box => box.top)) + 1);
      else expect(observed.boxes[id].top).toBeGreaterThanOrEqual(Math.max(...primary.map(box => box.bottom)) - 1);
    }
    if (side === 'above') expect(observed.boxes.receipt.top).toBeGreaterThanOrEqual(Math.max(...primary.map(box => box.bottom)) - 1);
    expect(observed.composition.candidates.length).toBeLessThanOrEqual(3);
    expect(observed.composition.candidates.find(candidate => candidate.id === observed.composition.candidate).valid).toBe(true);
    expect(observed.composition.flow).toEqual({ status: 'satisfied', diagnostics: [] });
    const status = await openChecks(page);
    await expect(status.locator('dl > div').filter({ hasText: 'Flow composition' })).toHaveText('Flow compositionPassed');
    await status.locator('summary').click();
    await page.mouse.move(-10, -10);
    await writeFile(testInfo.outputPath('flow-dom.json'), JSON.stringify({ viewport, side, ...observed }, null, 2));
    await page.screenshot({ path: testInfo.outputPath('flow.png') });
  });
}

for (const viewport of viewports) {
  test(`incompatible flow remains incomplete with accessible reasons at ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await ready(page, 'flow-incompatible');
    const composition = JSON.parse((await page.getByTestId('diagram-canvas').getAttribute('data-composition-report'))!);
    expect(composition.candidates.find(candidate => candidate.id === composition.candidate).valid).toBe(true);
    expect(composition.flow.status).toBe('unsatisfied');
    expect(await page.getByTestId('diagram-canvas').getAttribute('data-layout-diagnostics')).toBe('[]');
    await expect(page.locator('.viewer-toolbar')).toHaveCSS('opacity', '0');
    await expect(page.locator('.viewer-footer')).toHaveCSS('opacity', '0');
    const diagnostics = page.getByTestId('flow-diagnostics');
    await expect(diagnostics).toBeVisible();
    await expect(diagnostics).toContainText(composition.flow.diagnostics.find(diagnostic => diagnostic.check === 'flow-group-span').message);
    await expect(diagnostics.locator('li').first()).toBeVisible();
    await writeFile(testInfo.outputPath('unsatisfied-flow.json'), JSON.stringify({ viewport, composition }, null, 2));
    await page.screenshot({ path: testInfo.outputPath('unsatisfied-flow.png') });
    const status = await openChecks(page);
    await expect(status.locator('summary')).toContainText('Validation incomplete');
    await expect(status.locator('dl > div').filter({ hasText: 'Flow composition' })).toHaveText('Flow compositionFailed');
    await expect(status.locator('dl > div').filter({ hasText: 'Geometry' })).toHaveText('GeometryPassed');
  });
}

test('flow obligation follows only perspectives that retain the complete primary path', async ({ page }) => {
  await ready(page, 'flow-above');
  const status = await openChecks(page);
  await expect(status.getByText('Flow composition', { exact: true })).toBeVisible();
  await revealControls(page, 'top');
  await page.getByRole('combobox', { name: 'Perspective' }).selectOption('helpers-view');
  await expect(page.locator('[data-layout-state="ready"]')).toBeVisible();
  await expect(status.getByText('Flow composition', { exact: true })).toHaveCount(0);
  expect(JSON.parse((await page.getByTestId('diagram-canvas').getAttribute('data-composition-report'))!).flow).toBeUndefined();
  await page.getByRole('combobox', { name: 'Perspective' }).selectOption('primary-view');
  await expect(page.locator('[data-layout-state="ready"]')).toBeVisible();
  await expect(status.getByText('Flow composition', { exact: true })).toHaveCount(1);
  expect(JSON.parse((await page.getByTestId('diagram-canvas').getAttribute('data-composition-report'))!).flow.status).toBe('satisfied');
});

for (const missing of [false, true]) test(`current ${missing ? 'missing' : 'failed'} flow assessment overrides stale supplied pass`, async ({ page }) => {
  test.skip(!!process.env.DIAGRAM_SERVER_COMMAND, 'Development module boundaries inject stale evidence and an absent current assessment.');
  await page.route(/\/src\/viewer\/ArchitectureViewer\.tsx(?:\?t=\d+)?$/, async route => {
    const response = await route.fetch(), source = await response.text();
    const react = source.match(/from\s+["']([^"']*\/react\.js[^"']*)["']/)?.[1];
    if (!react) throw new Error('The development viewer must expose its React module import');
    await route.fulfill({ contentType: 'text/javascript', body: `
      import React from ${JSON.stringify(react)};
      import { ArchitectureViewer as ActualViewer } from '/src/viewer/ArchitectureViewer.tsx?actual';
      export function ArchitectureViewer(props) { return React.createElement(ActualViewer, { ...props, evidence: { model: 'pass', geometry: 'pass', rendered: 'pass', build: 'pass', flow: 'pass' } }); }
    ` });
  });
  if (missing) await page.route(/\/src\/controller\.ts(?:\?t=\d+)?$/, route => route.fulfill({ contentType: 'text/javascript', body: `
    import { createLayoutRunner as actualRunner } from '/src/controller.ts?actual';
    export function createLayoutRunner(options) {
      const runner = actualRunner(options);
      return { ...runner, async run(...args) { const result = await runner.run(...args); delete result.geometry.composition.flow; return result; } };
    }
  ` }));
  await ready(page, missing ? 'flow-below' : 'flow-incompatible');
  const status = await openChecks(page);
  await expect(status.locator('summary')).toContainText('Validation incomplete');
  await expect(status.locator('.status-dot.complete')).toHaveCount(0);
  await expect(status.locator('dl > div').filter({ hasText: 'Flow composition' })).toHaveText(`Flow composition${missing ? 'Not supplied' : 'Failed'}`);
  await expect(status.locator('dl > div').filter({ hasText: 'Geometry' })).toHaveText('GeometryPassed');
  await expect(page.getByTestId('flow-diagnostics')).toContainText(missing ? 'no current selected composition assessment' : 'does not contain a contiguous primary span');
});

type ReadabilityPerturbation = 'label-font' | 'component-font' | 'missing-one-label' | 'missing-all-labels' | 'unperformed' | 'unlabeled';

async function inspectFixture(destination: string, fixture: string, missing = false, perturbation?: ReadabilityPerturbation) {
  await mkdir(destination, { recursive: true });
  for (const entry of ['src', 'scripts', 'fixtures', 'tests/fixtures', 'index.html', 'package.json', 'vite.config.ts']) {
    await cp(path.join(project, entry), path.join(destination, entry), { recursive: true });
  }
  await symlink(path.join(project, 'node_modules'), path.join(destination, 'node_modules'), 'junction');
  await cp(path.join(destination, 'vite.config.ts'), path.join(destination, 'vite.config.original.ts'));
  await writeFile(path.join(destination, 'vite.config.ts'), `
    import config from './vite.config.original';
    export default { ...config, cacheDir: '.vite', server: { ...config.server, fs: { allow: ${JSON.stringify([destination, project])} } } };
  `);
  const model = fixture === 'sample' ? JSON.parse(await readFile(path.join(project, 'fixtures/payment-demo.json'), 'utf8')) : flowFixture('above', fixture !== 'flow-incompatible', fixture !== 'flow-incompatible');
  if (fixture === 'flow-incompatible') {
    model.groups.push({ ...model.groups[0], id: 'split-zone', label: 'Split span' });
    for (const node of model.nodes) if (['intake', 'journal'].includes(node.id)) node.parent = 'split-zone';
  } else if (fixture !== 'sample') {
    model.views = [
      { id: 'primary-view', label: 'Primary path', nodeIds: ['intake', 'router', 'journal'], edgeIds: ['enter', 'commit'], outside: model.edges.filter(edge => !['enter', 'commit'].includes(edge.id)).map(edge => ({ edge: edge.id, reason: 'Outside the primary perspective.' })) },
      { id: 'helpers-view', label: 'Supporting lookup', nodeIds: ['router', 'lookup', 'memo'], edgeIds: ['consult', 'retain'], outside: model.edges.filter(edge => !['consult', 'retain'].includes(edge.id)).map(edge => ({ edge: edge.id, reason: 'Outside the supporting perspective.' })) },
    ];
  }
  if (perturbation === 'unlabeled') for (const edge of model.edges) delete edge.label;
  const modelBytes = JSON.stringify(model, null, 2);
  const modelSha256 = createHash('sha256').update(modelBytes).digest('hex');
  await writeFile(path.join(destination, 'fixtures/sample.json'), modelBytes);
  if (perturbation === 'label-font' || perturbation === 'component-font') {
    const stylesheet = path.join(destination, 'src/styles.css');
    const css = perturbation === 'label-font' ? '.architecture-viewer { --label-font: 9px !important; }' : '.architecture-viewer .component-label { font-size: 9px !important; }';
    await writeFile(stylesheet, `${await readFile(stylesheet, 'utf8')}\n${css}\n`);
  }
  if (perturbation === 'missing-one-label' || perturbation === 'missing-all-labels') {
    const components = path.join(destination, 'src/viewer/components.tsx');
    const replacement = perturbation === 'missing-one-label' ? 'className={label === "Enter" ? undefined : "relationship-label-text"}' : '';
    await writeFile(components, (await readFile(components, 'utf8')).replace('className="relationship-label-text"', replacement));
  }
  if (missing) {
    await cp(path.join(destination, 'src/controller.ts'), path.join(destination, 'src/controller.original.ts'));
    await writeFile(path.join(destination, 'src/controller.ts'), `
      import { createLayoutRunner as actualRunner } from './controller.original';
      export function createLayoutRunner(options) { const runner = actualRunner(options); return { ...runner, async run(...args) {
        const result = await runner.run(...args); if (result.geometry.composition) delete result.geometry.composition.flow; return result;
      } }; }
    `);
  }
  if (perturbation === 'unperformed') await writeFile(path.join(destination, 'src/controller.ts'), `
    export function createLayoutRunner() { return { invalidate() {}, async run() { throw new Error('Synthetic layout interruption before AUTO assessment'); } }; }
  `);
  const args = [path.join(destination, 'scripts/inspect-composition.mjs'), '--out', path.join(destination, 'inspection')];
  let stdout = '', code = 0, staticServer: import('vite').PreviewServer | undefined;
  try {
    if (process.env.DIAGRAM_SERVER_COMMAND) {
      const { build, preview } = await import('vite');
      await build({ root: destination, logLevel: 'error' });
      staticServer = await preview({ root: destination, logLevel: 'error', preview: { host: '127.0.0.1', port: 0, strictPort: true } });
      const address = staticServer.httpServer.address();
      if (!address || typeof address === 'string') throw new Error('Private static consumer needs a TCP address');
      args.push('--url', `http://127.0.0.1:${address.port}/`);
    }
    try { ({ stdout } = await run(process.execPath, args, { timeout: 170000, maxBuffer: 2 * 1024 * 1024 })); }
    catch (error) { if (!error.stdout) throw error; stdout = error.stdout; code = error.code; }
  } finally {
    if (staticServer) await new Promise<void>(resolve => staticServer!.httpServer.close(() => resolve()));
    await unlink(path.join(destination, 'node_modules'));
    await rm(path.join(destination, '.vite'), { recursive: true, force: true });
  }
  const result = JSON.parse(stdout);
  await writeFile(path.join(destination, 'inspection-cli.json'), JSON.stringify({ mode: process.env.DIAGRAM_SERVER_COMMAND ? 'static' : 'development', args, code, result }, null, 2));
  return { code, result, modelSha256, report: JSON.parse(await readFile(result.summary, 'utf8')) };
}

test('inspection accepts declared flow with no relationship labels', async ({}, testInfo) => {
  test.setTimeout(180000);
  const { code, result, report, modelSha256 } = await inspectFixture(testInfo.outputPath('consumer'), 'flow-above', false, 'unlabeled');
  expect(code).toBe(0);
  expect(report.model.sha256).toBe(modelSha256);
  expect(result.mechanicalStatus).toBe('pass');
  expect(result.intentStatus).toBe('pass');
  expect(result.readabilityStatus).toBe('pass');
  expect(result.readabilityFailures).toEqual([]);
  expect(report.cases.every(item => item.relationshipTextPx === null)).toBe(true);
  expect(report.cases.filter(item => item.mode === 'auto' && item.view !== 'helpers-view').every(item => item.componentTextPx.minimum >= 14 && item.readabilityStatus === 'pass')).toBe(true);
  expect(report.visualAssessment).toBe('pending');
  expect(report.sourceFidelityAssessment).toBe('pending');
});

for (const kind of ['satisfied', 'unsatisfied', 'missing', 'generic'] as const) test(`inspection separates ${kind} intent from mechanics and source/visual judgment`, async ({}, testInfo) => {
  test.setTimeout(180000);
  const fixture = kind === 'unsatisfied' ? 'flow-incompatible' : kind === 'generic' ? 'sample' : 'flow-above';
  const { code, result, report, modelSha256 } = await inspectFixture(testInfo.outputPath('consumer'), fixture, kind === 'missing', kind === 'generic' ? 'label-font' : undefined);
  expect(result.mechanicalStatus).toBe('pass');
  expect(report.failures).toEqual([]);
  expect(result.visualAssessment).toBe('pending');
  expect(result.sourceFidelityAssessment).toBe('pending');
  expect(report.model.sha256).toBe(modelSha256);
  expect(report.readabilityTargets).toEqual({ componentTextPx: 14, relationshipTextPx: 11 });
  expect(result.readabilityTargets).toEqual(report.readabilityTargets);
  expect(result.readabilityStatus).toBe(report.readabilityStatus);
  expect(result.readabilityFailures).toEqual(report.readabilityFailures);
  if (kind === 'generic') {
    expect(report.readabilityStatus).toBe('not-applicable');
    expect(report.readabilityFailures).toEqual([]);
    expect(report.cases.filter(item => item.mode === 'auto').some(item => item.relationshipTextPx?.minimum < 11)).toBe(true);
  } else {
    const required = report.cases.filter(item => item.mode === 'auto' && item.view !== 'helpers-view');
    const readable = required.every(item => item.componentTextPx?.minimum >= 14 && item.relationshipTextPx?.minimum >= 11);
    expect(report.readabilityStatus).toBe(readable ? 'pass' : 'fail');
    expect(required.every(item => item.readabilityStatus === (item.componentTextPx?.minimum >= 14 && item.relationshipTextPx?.minimum >= 11 ? 'pass' : 'fail'))).toBe(true);
    expect(report.cases.filter(item => item.mode !== 'auto' || item.view === 'helpers-view').every(item => item.readabilityStatus === 'not-applicable')).toBe(true);
  }
  expect(report.intentStatus).toBe(kind === 'satisfied' ? 'pass' : kind === 'generic' ? 'not-applicable' : 'fail');
  expect(result.intentStatus).toBe(report.intentStatus);
  const failing = kind === 'unsatisfied' || kind === 'missing';
  expect(code).toBe(failing ? 1 : 0);
  expect(report.intentFailures.length > 0).toBe(failing);
  expect(result.intentFailures).toEqual(report.intentFailures);
  if (failing) {
    expect(report.intentFailures.every(failure => failure.mode === 'auto')).toBe(true);
    expect(report.intentFailures.every(failure => failure.status === kind)).toBe(true);
  }
  if (kind === 'unsatisfied') expect(report.cases.some(item => item.mode === 'compact' && item.error?.includes('contiguous primary span'))).toBe(true);
  if (kind === 'satisfied') {
    expect(report.cases.filter(item => item.mode === 'auto' && item.view === 'helpers-view').every(item => item.intentStatus === 'not-applicable')).toBe(true);
    expect(report.cases.filter(item => item.mode === 'auto' && item.view !== 'helpers-view').every(item => item.intentStatus === 'pass')).toBe(true);
    expect(report.cases.some(item => item.mode === 'layered' && item.composition.flow.status === 'unsatisfied')).toBe(true);
  }
});

for (const perturbation of ['label-font', 'component-font', 'missing-one-label', 'missing-all-labels', 'unperformed'] as const) {
  test(`inspection rejects required flow readability with ${perturbation}`, async ({}, testInfo) => {
    test.setTimeout(180000);
    const { code, result, report, modelSha256 } = await inspectFixture(testInfo.outputPath('consumer'), 'flow-above', false, perturbation);
    expect(code).toBe(1);
    expect(report.readabilityStatus).toBe('fail');
    expect(result.readabilityStatus).toBe('fail');
    expect(report.readabilityTargets).toEqual({ componentTextPx: 14, relationshipTextPx: 11 });
    expect(result.readabilityTargets).toEqual(report.readabilityTargets);
    expect(report.model.sha256).toBe(modelSha256);
    expect(report.visualAssessment).toBe('pending');
    expect(report.sourceFidelityAssessment).toBe('pending');
    expect(result.readabilityFailures).toEqual(report.readabilityFailures);
    expect(report.readabilityFailures.length).toBeGreaterThan(0);
    expect(report.readabilityFailures.every(failure => failure.mode === 'auto' && failure.view !== 'helpers-view' && failure.label)).toBe(true);
    expect(report.readabilityFailures.some(failure => failure.view === 'primary-view' && failure.label === 'Primary path')).toBe(true);
    if (perturbation === 'unperformed') {
      expect(report.cases).toEqual([]);
      expect(report.readabilityFailures).toHaveLength(4);
      expect(report.readabilityFailures.every(failure => failure.check === 'readability-unperformed')).toBe(true);
      return;
    }
    expect(report.intentStatus).toBe('pass');
    const auto = report.cases.filter(item => item.mode === 'auto' && item.view !== 'helpers-view');
    expect(auto.some(item => item.readabilityStatus === 'fail')).toBe(true);
    if (perturbation === 'label-font' || perturbation === 'component-font') {
      expect(report.mechanicalStatus).toBe('pass');
      expect(report.failures).toEqual([]);
      const field = perturbation === 'label-font' ? 'relationshipTextPx' : 'componentTextPx';
      const predicted = perturbation === 'label-font' ? 'fittedLabelFont' : 'fittedNodeFont';
      const target = perturbation === 'label-font' ? 11 : 14;
      expect(auto.filter(item => item.view === '').every(item => item[field].minimum < target)).toBe(true);
      expect(auto.every(item => item.readabilityStatus === (item[field].minimum < target ? 'fail' : 'pass'))).toBe(true);
      expect(auto.every(item => item.composition.candidates.find(candidate => candidate.id === item.composition.candidate)[predicted] >= target)).toBe(true);
      expect(report.readabilityFailures.some(failure => failure.check === 'readability-target' && failure.metric === field && failure.actual < failure.target)).toBe(true);
    } else {
      expect(auto.every(item => item.readabilityStatus === 'fail')).toBe(true);
      expect(report.readabilityFailures.every(failure => failure.check === 'readability-observations')).toBe(true);
      expect(auto.every(item => perturbation === 'missing-all-labels' ? item.relationshipTextPx === null : item.relationshipTextPx.count < item.edges.length)).toBe(true);
    }
  });
}
