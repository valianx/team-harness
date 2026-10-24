import { expect } from '@playwright/test';
import { spawn, execFile as execFileCallback } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { access, cp, mkdir, readFile, readdir, realpath, rename, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

export const execFile = promisify(execFileCallback);
export const project = resolve(process.env.WEB_PRESENTATION_PROJECT || resolve(dirname(fileURLToPath(import.meta.url)), '../..'));
export const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures');
export const activeSelector = '[data-harness-slide][data-harness-active="true"]';

export async function inventory() {
  const { stdout } = await execFile(process.execPath, ['scripts/check-source.mjs'], { cwd: project });
  const result = JSON.parse(stdout);
  expect(result.diagnostics, 'Source references must be valid before browser acceptance').toEqual([]);
  expect(result.slides.length).toBeGreaterThan(0);
  return result;
}

export function route(base, alias) {
  return new URL(encodeURIComponent(alias), base.endsWith('/') ? base : `${base}/`).href;
}

export async function settle(page) {
  await page.locator(activeSelector).waitFor();
  const frames = page.locator(`${activeSelector} [data-harness-frame]`);
  for (const frame of await frames.all()) await expect(frame, 'Demo availability must reach an explicit bounded state').not.toHaveAttribute('data-harness-frame-state', 'loading');
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.complete ? undefined : new Promise(resolve => { image.addEventListener('load', resolve, { once: true }); image.addEventListener('error', resolve, { once: true }); }))); });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect.poll(() => page.evaluate(() => document.getAnimations().some(animation => animation.playState === 'running' && Number.isFinite(animation.effect?.getComputedTiming().endTime))), { message: 'Finite native reveal and navigation transitions must settle before measurement' }).toBe(false);
}

export async function inspection(page, options) {
  const require = createRequire(resolve(project, 'package.json'));
  const { inspectSlide } = await import(pathToFileURL(require.resolve('slidev-addon-harness/geometry')).href);
  return page.evaluate(inspectSlide, options);
}

export async function record(page, testInfo, name, report) {
  await writeFile(testInfo.outputPath(`${name}.json`), JSON.stringify(report, null, 2));
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: false });
}

export async function healthy(page, testInfo, name) {
  await settle(page);
  const fonts = await page.evaluate(async () => Promise.all([400, 500].map(async weight => {
    let error;
    try { await document.fonts.load(`${weight} 28px Inter`, 'Harness local font validation'); }
    catch (failure) { error = String(failure); }
    const faces = [...document.fonts].filter(face => face.family.replace(/["']/g, '').toLowerCase() === 'inter' && face.weight === String(weight)).map(face => ({ family: face.family, weight: face.weight, status: face.status, unicodeRange: face.unicodeRange }));
    return { weight, loaded: faces.some(face => face.status === 'loaded'), faces, error };
  })));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const report = await inspection(page);
  report.fonts = fonts;
  report.frames = await page.locator(`${activeSelector} [data-harness-frame]`).evaluateAll(frames => frames.map(frame => ({ state: frame.dataset.harnessFrameState, source: frame.querySelector('iframe')?.src, title: frame.querySelector('iframe')?.title, status: frame.querySelector('[role="status"]')?.textContent, limit: 'Availability and outer geometry do not prove the embedded application interaction.' })));
  await record(page, testInfo, name, report);
  for (const font of report.fonts) expect(font.loaded, `${name}: an actual Inter ${font.weight} FontFace must be loaded; ${font.error || ''}`).toBe(true);
  expect(report.ready, `${name}: fonts/assets/measurement readiness`).toBe(true);
  expect(report.counts.roots).toBe(1);
  expect(report.counts.regions).toBeGreaterThan(2);
  expect(report.counts.elements).toBeGreaterThan(0);
  expect(report.counts.text).toBeGreaterThan(0);
  expect(report.diagnostics, `${name}: ${JSON.stringify(report.diagnostics)}`).toEqual([]);
  return report;
}

export async function inspectNativeStates(page, testInfo, slide, slideCount, prefix = '') {
  await settle(page);
  const root = page.locator(activeSelector);
  await expect(root).toHaveAttribute('data-harness-page', String(slide.page));
  const current = Number(await root.getAttribute('data-harness-clicks'));
  const totalAttribute = await root.getAttribute('data-harness-clicks-total');
  expect(totalAttribute, 'Expose the native total so the final slide cannot hide untested reveals').not.toBeNull();
  const total = Number(totalAttribute);
  expect(Number.isInteger(current) && Number.isInteger(total) && current >= 0 && total >= current).toBe(true);
  expect(total, 'The safety bound is explicit; larger decks need a deliberate test configuration').toBeLessThanOrEqual(30);
  await healthy(page, testInfo, `${prefix}${slide.alias}-initial`);
  for (let click = current + 1; click <= total; click++) {
    await page.keyboard.press('ArrowRight');
    await expect(root).toHaveAttribute('data-harness-page', String(slide.page));
    await expect(root).toHaveAttribute('data-harness-clicks', String(click));
    await healthy(page, testInfo, `${prefix}${slide.alias}-click-${click}${click === total ? '-final' : '-intermediate'}`);
  }
  await page.keyboard.press('ArrowRight');
  if (slide.page < slideCount) {
    await expect(page.locator(activeSelector)).toHaveAttribute('data-harness-page', String(slide.page + 1));
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator(activeSelector)).toHaveAttribute('data-harness-page', String(slide.page));
  } else {
    await settle(page);
    await expect(root).toHaveAttribute('data-harness-page', String(slide.page));
    await expect(root).toHaveAttribute('data-harness-clicks', String(total));
  }
}

export async function copyForFixture(directory, entry) {
  await mkdir(directory, { recursive: true });
  const omitted = new Set(['node_modules', '.git', 'dist', '.slidev', 'test-results', 'playwright-report']);
  await cp(project, directory, { recursive: true, filter: path => !omitted.has(path.split('/').at(-1)) });
  await symlink(resolve(project, 'node_modules'), resolve(directory, 'node_modules'), 'dir');
  await writeFile(resolve(directory, 'slides.md'), entry);
  // The isolated copy resolves dependencies through a symlink. Vite otherwise
  // denies their font URLs even after document.fonts.status becomes "loaded".
  // Merge the exact dependency root into a copy of the consumer's native config.
  let original;
  for (const extension of ['js', 'mjs', 'ts', 'cjs', 'mts', 'cts']) {
    const name = `vite.config.${extension}`;
    try { await access(resolve(directory, name)); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    original = `./.harness-vite-consumer-${Date.now()}-${process.pid}.${extension}`;
    await rename(resolve(directory, name), resolve(directory, original));
    break;
  }
  const dependencyRoot = await realpath(resolve(project, 'node_modules'));
  await writeFile(resolve(directory, 'vite.config.js'), `import { mergeConfig } from 'vite';\n${original ? `import original from ${JSON.stringify(original)};` : 'const original = {};'}\nexport default async env => mergeConfig((typeof original === 'function' ? await original(env) : await original) || {}, { server: { fs: { allow: ${JSON.stringify([directory, dependencyRoot])} } } });\n`);
  return directory;
}

export async function startCatalog(testInfo) {
  const { loadDeck } = await import(pathToFileURL(resolve(project, 'scripts/deck.mjs')).href);
  const { data } = await loadDeck(project);
  const colorSchema = data.slides[0]?.frontmatter.colorSchema;
  const external = createServer((_request, response) => { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><html lang="en"><title>Controlled external fixture</title><button>External control</button></html>'); });
  await new Promise(resolve => external.listen(0, '127.0.0.1', resolve));
  const externalUrl = `http://127.0.0.1:${external.address().port}/`;
  let raw = (await readFile(resolve(fixtures, 'catalog.md'), 'utf8')).replace('CROSS_ORIGIN_FIXTURE', externalUrl);
  if (colorSchema === 'light' || colorSchema === 'dark')
    raw = raw.replace(/^colorSchema: dark$/m, `colorSchema: ${colorSchema}`);
  const directory = await copyForFixture(testInfo.outputPath('catalog-project'), raw);
  const socket = createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const log = createWriteStream(testInfo.outputPath('catalog-server.log'));
  const child = spawn(process.execPath, [resolve(directory, 'node_modules/@slidev/cli/bin/slidev.mjs'), 'slides.md', '--port', String(port)], { cwd: directory, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe(log); child.stderr.pipe(log);
  const url = `http://localhost:${port}/`;
  try {
    const deadline = Date.now() + 60_000;
    while (true) {
      if (child.exitCode !== null) throw new Error(`Catalog server exited ${child.exitCode}; see catalog-server.log`);
      try { if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) break; } catch {}
      if (Date.now() > deadline) throw new Error('Catalog server readiness timed out; see catalog-server.log');
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  } catch (error) { try { process.kill(-child.pid, 'SIGTERM'); } catch {} external.close(); log.end(); throw error; }
  return { url, externalUrl, directory, async close() { try { process.kill(-child.pid, 'SIGTERM'); } catch {} await new Promise(resolve => external.close(resolve)); log.end(); } };
}

export async function filesContaining(directory, needle) {
  const found = [];
  const walk = async path => { for (const entry of await readdir(path, { withFileTypes: true })) { const child = resolve(path, entry.name); if (entry.isDirectory()) await walk(child); else if ((await readFile(child)).includes(Buffer.from(needle))) found.push(child); } };
  await walk(directory);
  return found;
}
