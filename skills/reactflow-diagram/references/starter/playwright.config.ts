import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { browserServerOptions } from './scripts/browser-server';

const server = await browserServerOptions(fileURLToPath(new URL('.', import.meta.url)));

export default defineConfig({
  testDir: './tests/browser',
  outputDir: server.outputDir,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: server.baseURL,
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
  },
  webServer: {
    command: server.command,
    url: server.baseURL,
    reuseExistingServer: server.reuseExistingServer,
  },
});
