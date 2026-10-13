const { defineConfig } = await import(process.env.PRESENTATION_PLAYWRIGHT_MODULE ?? "@playwright/test");

export default defineConfig({
  testDir: ".",
  testMatch: "browser.spec.mjs",
  timeout: 30000,
  expect: { timeout: 6000 },
  fullyParallel: false,
  workers: 2,
  retries: 0,
  reporter: [["line"], ["json"]],
  outputDir: process.env.PRESENTATION_OUTPUT,
  use: {
    browserName: "chromium", headless: true, baseURL: process.env.PRESENTATION_BASE_URL,
    deviceScaleFactor: 1, screenshot: "only-on-failure", trace: "retain-on-failure",
  },
  projects: [
    { name: "1280x720", use: { viewport: { width: 1280, height: 720 } } },
    { name: "1920x1080", use: { viewport: { width: 1920, height: 1080 } } },
    { name: "strict-mode", grep: /T11:/, use: { viewport: { width: 1280, height: 720 }, baseURL: process.env.PRESENTATION_DEV_URL } },
  ],
});
