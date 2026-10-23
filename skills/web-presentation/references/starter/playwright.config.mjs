import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const configRoot = dirname(fileURLToPath(import.meta.url));
const project = resolve(process.env.WEB_PRESENTATION_PROJECT || configRoot);
const evidence = resolve(process.env.WEB_PRESENTATION_EVIDENCE_DIR || resolve(tmpdir(), 'web-presentation-evidence'));
const rel = relative(project, evidence);
if (rel === '' || (rel !== '..' && !rel.startsWith('../') && !isAbsolute(rel)))
  throw new Error('WEB_PRESENTATION_EVIDENCE_DIR must be outside the consumer project.');
const baseURL = process.env.WEB_PRESENTATION_BASE_URL || 'http://localhost:4177/';
const staticOnly = process.env.WEB_PRESENTATION_STATIC === '1';
const run = process.env.WEB_PRESENTATION_RUN_DIR || resolve(evidence, `run-${Date.now()}-${process.pid}`);
process.env.WEB_PRESENTATION_RUN_DIR = run;
process.env.WEB_PRESENTATION_PROJECT = project;
const command = process.env.WEB_PRESENTATION_SERVER_COMMAND || (!process.env.WEB_PRESENTATION_BASE_URL ? 'npm run dev -- --port 4177' : undefined);
const browserFiles = staticOnly ? /production\.spec\.mjs/ : /(?:consumer|catalog)\.spec\.mjs/;

export default defineConfig({
  testDir: './tests/browser',
  outputDir: resolve(run, 'results'),
  reporter: [['list'], ['json', { outputFile: resolve(run, 'results.json') }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL,
    launchOptions: { ...(process.env.WEB_PRESENTATION_CHROME ? { executablePath: process.env.WEB_PRESENTATION_CHROME } : {}), args: ['--no-sandbox'] },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'laptop', testMatch: browserFiles, use: { viewport: { width: 1280, height: 720 } } },
    { name: 'presentation', testMatch: browserFiles, use: { viewport: { width: 1440, height: 900 } } },
    ...(!staticOnly ? [{ name: 'artifact-privacy', testMatch: /notes\.spec\.mjs/ }] : []),
  ],
  ...(command ? { webServer: { command, cwd: project, url: baseURL, timeout: 90_000, reuseExistingServer: false, stdout: 'pipe', stderr: 'pipe' } } : {}),
});
