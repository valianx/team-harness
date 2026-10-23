import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  outputDir: process.env.DIAGRAM_EVIDENCE_DIR ?? '/tmp/architecture-diagram-browser',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.DIAGRAM_BASE_URL ?? 'http://127.0.0.1:4178',
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
  },
  webServer: {
    command: process.env.DIAGRAM_SERVER_COMMAND ?? 'npm run dev -- --port 4178',
    url: process.env.DIAGRAM_BASE_URL ?? 'http://127.0.0.1:4178',
    reuseExistingServer: !process.env.CI,
  },
});
