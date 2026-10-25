import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { test, expect } from '@playwright/test';

const run = promisify(execFile);
const script = fileURLToPath(new URL('../../scripts/inspect-composition.mjs', import.meta.url));
const bytes = await readFile(new URL('../../fixtures/sample.json', import.meta.url));
const model = JSON.parse(bytes.toString());

test('the copied inspection command captures its actual consumer and keeps visual judgment pending', async ({ baseURL }, testInfo) => {
  test.setTimeout(180000);
  const { stdout } = await run(process.execPath, [script, '--out', testInfo.outputPath('inspection'), '--url', baseURL!], { timeout: 170000, maxBuffer: 1024 * 1024 });
  const result = JSON.parse(stdout);
  expect(result.mechanicalStatus).toBe('pass');
  expect(result.visualAssessment).toBe('pending');
  expect(result.sourceFidelityAssessment).toBe('pending');
  const report = JSON.parse(await readFile(result.summary, 'utf8'));
  expect(report.model.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
  expect(report.cases).toHaveLength(2 * ((model.views ?? []).length + 3));
  expect(report.cases.filter(item => item.mode === 'auto' && item.view === '')).toHaveLength(2);
  for (const item of report.cases.filter(item => item.mode === 'auto' && item.view === '')) {
    expect(item.nodes).toEqual(model.nodes.map(node => node.id).sort());
    expect(item.edges).toEqual(model.edges.map(edge => edge.id).sort());
    if (model.nodes.length) expect(item.componentTextPx.minimum).toBeGreaterThan(0);
  }
  for (const item of report.cases) {
    const labeled = model.edges.filter(edge => item.edges.includes(edge.id) && edge.label).length;
    if (labeled) {
      expect(item.relationshipTextPx.count).toBe(labeled);
      expect(item.relationshipTextPx.minimum).toBeGreaterThan(0);
    }
  }
});

test('the inspection command rejects a responding server that is not the editable consumer', async ({}, testInfo) => {
  const server = createServer((_, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end('<main class="architecture-viewer" data-model-title="wrong consumer"><div class="diagram-canvas" data-layout-state="ready" style="width:800px;height:600px"></div></main>');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Fixture server needs a TCP address');
    let failure;
    try { await run(process.execPath, [script, '--out', testInfo.outputPath('wrong-consumer'), '--url', `http://127.0.0.1:${address.port}/`], { timeout: 20000 }); }
    catch (error) { failure = error; }
    expect(failure?.code).toBe(1);
    const result = JSON.parse(failure.stdout);
    expect(result.mechanicalStatus).toBe('fail');
    expect(result.cases).toBe(0);
    expect(result.failures[0].reason).toContain('does not match the editable consumer');
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('the inspection command rejects stale content even when all identities and relationships match', async ({}, testInfo) => {
  const stale = structuredClone(model);
  stale.nodes[0].label += ' (stale)';
  const content = JSON.stringify(stale).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
  const server = createServer((_, response) => {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(`<main class="architecture-viewer" data-model-title="${model.title}" data-model-node-ids="${model.nodes.map(node => node.id).sort().join(',')}" data-model-group-ids="${(model.groups ?? []).map(group => group.id).sort().join(',')}" data-model-relationships="${JSON.stringify(model.edges.map(edge => [edge.id, edge.from, edge.to, edge.label ?? null]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))).replaceAll('"', '&quot;')}" data-model-content="${content}"><div class="diagram-canvas" data-layout-state="ready" style="width:800px;height:600px"></div></main>`);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Fixture server needs a TCP address');
    let failure;
    try { await run(process.execPath, [script, '--out', testInfo.outputPath('stale-content'), '--url', `http://127.0.0.1:${address.port}/`], { timeout: 20000 }); }
    catch (error) { failure = error; }
    expect(failure?.code).toBe(1);
    const result = JSON.parse(failure.stdout);
    expect(result.mechanicalStatus).toBe('fail');
    expect(result.cases).toBe(0);
    expect(result.failures[0].reason).toContain('does not match the editable consumer');
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
