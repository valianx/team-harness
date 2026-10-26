import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { findPython } from './python.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  'output-dir': { type: 'string' }, output: { type: 'string' }, 'edit-id': { type: 'string' },
  sdk: { type: 'string', default: 'pinned' }, scale: { type: 'string', default: '2' }, width: { type: 'string', default: '1440' },
} });
if (positionals.length !== 1 || !values['output-dir'] || !['pinned', 'stable'].includes(values.sdk)) {
  throw new Error('Usage: node verify.mjs INPUT --output-dir DIR [--edit-id ID] [--sdk pinned|stable]');
}
const input = resolve(positionals[0]);
const output = resolve(values['output-dir']);
await mkdir(output, { recursive: true });
const raw = await readFile(input);
const inputStat = await stat(input);
for (const destination of ['imported.excalidraw', 'edited.excalidraw', 'scene.svg', 'scene.png', 'editor.png',
  'edited.svg', 'edited.png', 'edited-editor.png', 'verification.json'].map(name => resolve(output, name))
  .concat(values.output ? [resolve(values.output)] : [])) {
  let existing;
  try { existing = await lstat(destination); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (existing?.isSymbolicLink() || existing && existing.dev === inputStat.dev && existing.ino === inputStat.ino) {
    throw new Error('Output destination aliases the input or is a symlink; choose separate evidence paths');
  }
}
const scene = JSON.parse(raw);
const sdkPackage = values.sdk === 'stable' ? 'excalidraw-stable' : '@excalidraw/excalidraw';
const metadata = JSON.parse(await readFile(resolve(root, 'node_modules', sdkPackage, 'package.json')));
const lockBytes = await readFile(resolve(root, 'package-lock.json'));
const lock = JSON.parse(lockBytes);
const report = { input, inputSha256: createHash('sha256').update(raw).digest('hex'),
  editor: { package: metadata.name, version: metadata.version, sourceRevision: values.sdk === 'pinned' ? '17d8904f734464847bcef638b636647b85ac1a1d' : null },
  runtime: { node: process.version, platform: process.platform, lockSha256: createHash('sha256').update(lockBytes).digest('hex'),
    sdkIntegrity: lock.packages[`node_modules/${sdkPackage}`].integrity },
  structural: 'pending', nativeEditability: 'fail', sourceFidelity: 'unassessed', visual: 'unassessed', errors: [], browserErrors: [] };
const byId = data => new Map(data.elements.map(element => [element.id, element]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function checkPreserved(before, after, stage) {
  const actual = byId(after);
  for (const original of before.elements) {
    const element = actual.get(original.id);
    if (!element) { report.errors.push(`${stage}: missing element ${original.id}`); continue; }
    const fields = original.type === 'text' ? ['text', 'containerId', 'labelPosition', 'fontFamily']
      : original.type === 'arrow' ? ['elbowed', 'startArrowhead', 'endArrowhead', ...(stage === 'import' ? ['fixedSegments', 'startIsSpecial', 'endIsSpecial'] : [])] : ['type'];
    for (const key of fields) if (original[key] != null && !same(original[key], element[key])) report.errors.push(`${stage}: ${original.id}.${key} changed`);
    for (const key of ['startBinding', 'endBinding']) if (original[key]) {
      for (const field of ['elementId', 'fixedPoint', 'mode']) if (original[key][field] != null && !same(original[key][field], element[key]?.[field])) {
        report.errors.push(`${stage}: ${original.id}.${key}.${field} changed`);
      }
    }
  }
}
let python;
const guard = data => {
  const result = spawnSync(python.command, [...python.prefix, resolve(root, '../render_excalidraw.py'), data, '--validate-only'], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Scene integrity failed: ${result.stdout || result.stderr}`);
};
let server;
let browser;
try {
  python = findPython();
  report.runtime.python = python;
  if (metadata.version !== (values.sdk === 'pinned' ? '0.18.0-17d8904' : '0.18.1')) throw new Error('Installed SDK does not match the identified compatibility boundary; run npm ci');
  guard(input);
  report.structural = 'pass';
  server = await createServer({ root, configFile: false, cacheDir: resolve(root, 'node_modules/.vite-native', values.sdk),
    resolve: { alias: [{ find: /^official-sdk(.*)$/, replacement: `${sdkPackage}$1` }] },
    server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  await server.listen();
  const address = server.httpServer.address();
  browser = await chromium.launch({ headless: true });
  report.browser = { engine: 'chromium', version: browser.version() };
  const page = await browser.newPage({ viewport: { width: Number(values.width), height: 900 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => report.browserErrors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto(`http://127.0.0.1:${address.port}/?sdk=${values.sdk}`);
  await page.waitForFunction(() => window.__nativeReady === true, undefined, { timeout: 40_000 });
  let mountTimer;
  try {
    report.fonts = await Promise.race([page.evaluate(data => window.mountScene(data), scene),
      new Promise((_, reject) => { mountTimer = setTimeout(() => reject(new Error('Font-ready native editor import timed out')), 30_000); })]);
  } finally {
    clearTimeout(mountTimer);
  }
  if (values.sdk === 'pinned' && !report.fonts.ready) throw new Error('Selected scene fonts are unavailable; fallback metrics cannot verify native placement');
  const imported = await page.evaluate(() => window.recoverScene());
  await writeFile(resolve(output, 'imported.excalidraw'), JSON.stringify(imported, null, 2));
  checkPreserved(scene, imported, 'import');
  guard(resolve(output, 'imported.excalidraw'));
  if (!report.fonts.ready) report.errors.push('Official scene fonts were not verified ready');
  const exported = await page.evaluate(scale => window.exportScene(scale), Number(values.scale));
  await writeFile(resolve(output, 'scene.svg'), exported.svg);
  await writeFile(resolve(output, 'scene.png'), Buffer.from(exported.png, 'base64'));
  if (values.output) await writeFile(resolve(values.output), Buffer.from(exported.png, 'base64'));
  report.exportLabels = exported.labels;
  report.labelChecks = exported.labelChecks;
  for (const check of exported.labelChecks) if (check.error || check.errorDistance > 1.5) report.errors.push(`export: ${check.id}.labelPosition differs from native path (${check.error || check.errorDistance})`);
  await page.screenshot({ path: resolve(output, 'editor.png') });
  const editId = values['edit-id'] || imported.elements.find(element => element.type !== 'arrow' && element.type !== 'text'
    && element.boundElements?.some(bound => bound.type === 'arrow'))?.id;
  const hasArrows = imported.elements.some(element => element.type === 'arrow');
  if (!editId && hasArrows) throw new Error('No bound component available for native editing proof; supply --edit-id');
  if (editId) {
    const target = byId(imported).get(editId);
    if (!target?.boundElements?.some(bound => bound.type === 'arrow')) throw new Error('--edit-id must name a component with bound arrows');
    const point = await page.evaluate(id => window.getDragPoint(id), editId);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x + 60, point.y + 45, { steps: 12 });
    await page.mouse.up();
    await page.waitForFunction(id => window.recoverScene().elements.find(element => element.id === id)?.version > 1, editId);
    const edited = await page.evaluate(() => window.recoverScene());
    await writeFile(resolve(output, 'edited.excalidraw'), JSON.stringify(edited, null, 2));
    checkPreserved(imported, edited, 'edit');
    guard(resolve(output, 'edited.excalidraw'));
    const moved = byId(edited).get(editId);
    report.edit = { id: editId, movedDistance: Math.hypot(moved.x - target.x, moved.y - target.y),
      changedArrowIds: imported.elements.filter(element => element.type === 'arrow' && [element.startBinding?.elementId, element.endBinding?.elementId].includes(editId)
        && !same([element.x, element.y, element.points], [byId(edited).get(element.id)?.x, byId(edited).get(element.id)?.y, byId(edited).get(element.id)?.points])).map(element => element.id) };
    if (report.edit.movedDistance < 20 || !report.edit.changedArrowIds.length) report.errors.push('Native drag did not move the component and its bound arrow geometry');
    const changedExport = await page.evaluate(scale => window.exportScene(scale), Number(values.scale));
    await writeFile(resolve(output, 'edited.svg'), changedExport.svg);
    await writeFile(resolve(output, 'edited.png'), Buffer.from(changedExport.png, 'base64'));
    await page.screenshot({ path: resolve(output, 'edited-editor.png') });
    report.editedExportLabels = changedExport.labels;
    report.editedLabelChecks = changedExport.labelChecks;
    for (const check of changedExport.labelChecks) if (check.error || check.errorDistance > 1.5) report.errors.push(`edited export: ${check.id}.labelPosition differs from native path (${check.error || check.errorDistance})`);
  }
  if (report.browserErrors.length) report.errors.push('Native editor raised browser errors');
  report.nativeEditability = report.errors.length ? 'fail' : hasArrows ? 'pass' : 'not-applicable';
  report.verification = report.errors.length ? 'fail' : 'pass';
} catch (error) {
  report.errors.push(error.message);
} finally {
  await browser?.close();
  await server?.close();
  await writeFile(resolve(output, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({ report: resolve(output, 'verification.json'), nativeEditability: report.nativeEditability, errors: report.errors }));
process.exitCode = report.verification === 'pass' ? 0 : 1;
