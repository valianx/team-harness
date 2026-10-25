import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { chromium } from '@playwright/test';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const activeCanvas = '.diagram-canvas';
const viewports = [{ width: 1280, height: 720 }, { width: 1440, height: 900 }];

function argumentsFor(argv) {
  const values = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!['--out', '--url'].includes(argv[i]) || !argv[i + 1] || values[argv[i]]) throw new Error('Usage: npm run inspect -- --out /absolute/evidence [--url http://127.0.0.1:port/]');
    values[argv[i]] = argv[i + 1];
  }
  if (!values['--out'] || !path.isAbsolute(values['--out']) || path.parse(values['--out']).root === path.resolve(values['--out'])) throw new Error('--out must name an absolute evidence directory, not a filesystem root');
  if (values['--url']) {
    const url = new URL(values['--url']);
    if (!['http:', 'https:'].includes(url.protocol) || url.search || url.hash || url.username || url.password) throw new Error('--url must be an HTTP(S) base URL without credentials, query or fragment');
  }
  return values;
}

async function prepareOutput(destination) {
  const absolute = path.resolve(destination);
  let parent = absolute;
  while (true) {
    try {
      const stat = await lstat(parent);
      if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(parent) !== parent) throw new Error(`Evidence destination is redirected or not a directory: ${parent}`);
      break;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      parent = path.dirname(parent);
    }
  }
  await mkdir(absolute, { recursive: true });
  const run = path.join(absolute, `run-${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`);
  await mkdir(run);
  return run;
}

async function settle(page) {
  await page.locator(`${activeCanvas}[data-layout-state="ready"]`).waitFor({ timeout: 60000 });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function verifyIdentity(page, model) {
  const content = await page.locator('.architecture-viewer').getAttribute('data-model-content');
  if (!content || !isDeepStrictEqual(JSON.parse(content), model)) throw new Error('The served diagram does not match the editable consumer model; refuse fixture or stale-server evidence');
}

async function measure(page) {
  return page.locator(activeCanvas).evaluate(canvas => {
    const box = canvas.getBoundingClientRect();
    const effectiveFont = element => {
      let scale = 1;
      for (let current = element; current; current = current.parentElement) {
        const transform = getComputedStyle(current).transform;
        if (transform !== 'none') { const matrix = new DOMMatrixReadOnly(transform); scale *= Math.hypot(matrix.a, matrix.b); }
      }
      return parseFloat(getComputedStyle(element).fontSize) * scale;
    };
    const fonts = selector => {
      const sizes = [...canvas.querySelectorAll(selector)].map(effectiveFont);
      return sizes.length ? { minimum: Math.min(...sizes), maximum: Math.max(...sizes), count: sizes.length } : null;
    };
    const bounds = [...canvas.querySelectorAll('.react-flow__node, .react-flow__edge-path, .edge-label')].map(element => element.getBoundingClientRect()).filter(rect => rect.width || rect.height);
    const union = bounds.length ? { left: Math.min(...bounds.map(rect => rect.left)), top: Math.min(...bounds.map(rect => rect.top)), right: Math.max(...bounds.map(rect => rect.right)), bottom: Math.max(...bounds.map(rect => rect.bottom)) } : null;
    return {
      nodes: [...canvas.querySelectorAll('.react-flow__node:not(.react-flow__node-group)')].map(element => element.getAttribute('data-id')).sort(),
      groups: [...canvas.querySelectorAll('.react-flow__node-group')].map(element => element.getAttribute('data-id')).sort(),
      edges: [...canvas.querySelectorAll('.react-flow__edge')].map(element => element.getAttribute('data-id')).sort(),
      diagnostics: JSON.parse(canvas.getAttribute('data-layout-diagnostics') || '[]'),
      composition: JSON.parse(canvas.getAttribute('data-composition-report') || 'null'),
      componentTextPx: fonts('.react-flow__node .component-label'), relationshipTextPx: fonts('.edge-label .relationship-label-text'),
      canvas: { width: box.width, height: box.height }, content: union,
      fittedOccupancy: union ? { width: (union.right - union.left) / box.width, height: (union.bottom - union.top) / box.height } : null,
      camera: canvas.querySelector('.react-flow__viewport')?.getAttribute('style'),
      extensionNotice: canvas.querySelector('.canvas-limit')?.textContent ?? null,
    };
  });
}

async function inspect(options) {
  const output = await prepareOutput(options['--out']);
  const bytes = await readFile(path.join(project, 'fixtures/sample.json'));
  const model = JSON.parse(bytes);
  const report = {
    schemaVersion: 1, startedAt: new Date().toISOString(), project,
    model: { title: model.title, sha256: createHash('sha256').update(bytes).digest('hex'), nodes: model.nodes?.length, edges: model.edges?.length },
    output, cases: [], failures: [], mechanicalStatus: 'pending', visualAssessment: 'pending', sourceFidelityAssessment: 'pending',
    limits: 'Effective font sizes and candidate scores inform author judgment; they do not certify explanatory clarity or source fidelity.',
  };
  let server, browser;
  try {
    let base = options['--url'];
    if (!base) {
      const { createServer } = await import('vite');
      server = await createServer({ root: project, logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: true } });
      await server.listen();
      const address = server.httpServer.address();
      if (!address || typeof address === 'string') throw new Error('Local inspection server has no TCP address');
      base = `http://127.0.0.1:${address.port}/`;
    }
    report.baseURL = base;
    browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
    for (const viewport of viewports) {
      const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
      const assetFailures = [];
      page.on('requestfailed', request => assetFailures.push(`${request.url()}: ${request.failure()?.errorText}`));
      page.on('response', response => { if (response.status() >= 400) assetFailures.push(`${response.status()} ${response.url()}`); });
      for (const mode of ['auto', 'layered', 'compact']) {
        const url = new URL(base.endsWith('/') ? base : `${base}/`);
        url.searchParams.set('composition', mode);
        await page.goto(url.href, { waitUntil: 'networkidle' });
        await settle(page);
        await verifyIdentity(page, model);
        const views = mode === 'auto' ? [{ id: '', label: 'Complete architecture' }, ...(model.views ?? []).map(view => ({ id: view.id, label: view.label }))] : [{ id: '', label: 'Complete architecture' }];
        for (const view of views) {
          const box = await page.locator(activeCanvas).boundingBox();
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.getByRole('combobox', { name: 'Perspective', exact: true }).selectOption(view.id);
          await settle(page);
          if (model.nodes.length || model.groups.length) await page.getByRole('button', { name: 'Fit diagram', exact: true }).click();
          await settle(page);
          await page.mouse.move(-10, -10);
          const measurements = await measure(page);
          const selected = view.id ? model.views.find(item => item.id === view.id) : null;
          const expectedNodes = selected ? [...selected.nodeIds].sort() : model.nodes.map(node => node.id).sort();
          const expectedEdges = selected ? [...selected.edgeIds].sort() : model.edges.map(edge => edge.id).sort();
          if (JSON.stringify(measurements.nodes) !== JSON.stringify(expectedNodes) || JSON.stringify(measurements.edges) !== JSON.stringify(expectedEdges)) throw new Error(`Rendered membership differs from consumer model in ${view.label}`);
          const screenshot = `${viewport.width}x${viewport.height}-${mode}-${view.id || 'complete'}.png`;
          await page.screenshot({ path: path.join(output, screenshot), fullPage: false });
          const result = { viewport, mode, view: view.id, label: view.label, screenshot, ...measurements };
          report.cases.push(result);
          if (mode === 'auto' && measurements.diagnostics.length) report.failures.push({ viewport, view: view.id, reason: 'Selected composition has geometry diagnostics', diagnostics: measurements.diagnostics });
          if (mode === 'auto' && expectedNodes.length && (measurements.componentTextPx?.count !== expectedNodes.length || measurements.componentTextPx.minimum <= 0)) report.failures.push({ viewport, view: view.id, reason: 'Consumer component text was not fully measured' });
          const labeledEdges = model.edges.filter(edge => expectedEdges.includes(edge.id) && edge.label).length;
          if (mode === 'auto' && labeledEdges && (measurements.relationshipTextPx?.count !== labeledEdges || measurements.relationshipTextPx.minimum <= 0)) report.failures.push({ viewport, view: view.id, reason: 'Consumer relationship text was not fully measured' });
        }
      }
      if (assetFailures.length) report.failures.push({ viewport, reason: 'Runtime resource failures', failures: [...new Set(assetFailures)] });
      await page.close();
    }
    report.mechanicalStatus = report.failures.length ? 'fail' : 'pass';
  } catch (error) {
    report.mechanicalStatus = 'fail';
    report.failures.push({ reason: error.message });
  } finally {
    await browser?.close();
    await server?.close();
    report.finishedAt = new Date().toISOString();
    await writeFile(path.join(output, 'summary.json'), JSON.stringify(report, null, 2) + '\n');
  }
  console.log(JSON.stringify({ output, summary: path.join(output, 'summary.json'), mechanicalStatus: report.mechanicalStatus, visualAssessment: report.visualAssessment, sourceFidelityAssessment: report.sourceFidelityAssessment, cases: report.cases.length, failures: report.failures }, null, 2));
  process.exitCode = report.mechanicalStatus === 'pass' ? 0 : 1;
}

try { await inspect(argumentsFor(process.argv.slice(2))); }
catch (error) { console.error(error.message); process.exitCode = 1; }
