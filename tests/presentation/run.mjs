import { createServer } from "node:http";
import { constants } from "node:fs";
import { access, cp, lstat, mkdir, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { argumentsFor, command, fingerprint, harnessRoot, physicalDirectory, saveJson, template } from "./common.mjs";
import { summarize } from "./results.mjs";

let server;
let developmentServer;
try {
  const options = argumentsFor();
  await physicalDirectory(options.runDirectory);
  await physicalDirectory(path.join(options.runDirectory, "app/dist"));
  const metadataPath = path.join(options.runDirectory, "prepared.json");
  if (!(await lstat(metadataPath)).isFile()) throw new Error("Expected regular preparation metadata.");
  const prepared = JSON.parse(await readFile(metadataPath, "utf8"));
  if (prepared.sourceFingerprint !== await fingerprint(template) || prepared.fixtureFingerprint !== await fingerprint(path.join(harnessRoot, "fixture"))) {
    throw new Error("Prepared fixture is stale; run explicit prepare-fixture with a new --candidate identity.");
  }
  let playwright;
  const require = createRequire(import.meta.url);
  try { playwright = await import("@playwright/test"); }
  catch { throw new Error("Required @playwright/test is missing. Run npm ci --prefix tests/presentation explicitly."); }
  const executable = playwright.chromium.executablePath();
  try { await access(executable, constants.X_OK); }
  catch { throw new Error("Required Chromium is missing. Run npm exec --prefix tests/presentation -- playwright install chromium explicitly, using the same PLAYWRIGHT_BROWSERS_PATH."); }
  const browser = await playwright.chromium.launch();
  const browserVersion = browser.version();
  await browser.close();
  const execution = `${new Date().toISOString().replaceAll(":", "-")}-${randomUUID().slice(0, 8)}`;
  const captures = path.join(options.runDirectory, "captures", execution);
  await physicalDirectory(path.dirname(captures), true);
  await mkdir(captures);
  const output = path.join(options.runDirectory, "browser-results", execution);
  await physicalDirectory(path.dirname(output), true);
  const runnerSnapshot = path.join(options.runDirectory, "browser-runner", execution);
  await physicalDirectory(path.dirname(runnerSnapshot), true);
  await mkdir(runnerSnapshot);
  for (const filename of ["playwright.config.mjs", "browser.spec.mjs", "measure.mjs"]) {
    await cp(path.join(harnessRoot, filename), path.join(runnerSnapshot, filename));
  }
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".wav": "audio/wav" };
  const dist = path.join(options.runDirectory, "app/dist");
  server = createServer(async (request, response) => {
    try {
      const name = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      const filename = path.resolve(dist, `.${name === "/" ? "/index.html" : name}`);
      if (!filename.startsWith(`${dist}${path.sep}`)) { response.writeHead(403); response.end(); return; }
      const content = await readFile(filename);
      response.writeHead(200, { "Content-Type": types[path.extname(filename)] ?? "application/octet-stream", "Cache-Control": "no-store" });
      response.end(content);
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  const appRequire = createRequire(path.join(options.runDirectory, "app/package.json"));
  const { createServer: createViteServer } = await import(pathToFileURL(appRequire.resolve("vite")).href);
  developmentServer = await createViteServer({ root: path.join(options.runDirectory, "app"), server: { host: "127.0.0.1", port: 0, strictPort: true, hmr: false }, logLevel: "error" });
  await developmentServer.listen();
  const developmentURL = developmentServer.resolvedUrls.local[0];
  const report = path.join(options.runDirectory, `browser-report-${execution}.json`);
  const provenance = {
    execution, candidate: options.candidate, prepared, browserVersion, executable,
    testSourceFingerprint: await fingerprint(runnerSnapshot), runnerSnapshot,
    deviceScaleFactor: 1, viewports: [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }],
    modes: ["production build: full matrix", "development: StrictMode lifecycle case"],
    playwright: JSON.parse(await readFile(require.resolve("@playwright/test/package.json"), "utf8")).version,
    command: "node run.mjs --workspace <external workspace> --candidate <prepared identity>",
  };
  await saveJson(path.join(options.runDirectory, `browser-environment-${execution}.json`), provenance);
  try {
    await command(process.execPath, [require.resolve("@playwright/test/cli"), "test", "--config", path.join(runnerSnapshot, "playwright.config.mjs")], {
      cwd: harnessRoot,
      log: path.join(options.runDirectory, `browser-${execution}.log`),
      env: { ...process.env, PRESENTATION_PLAYWRIGHT_MODULE: import.meta.resolve("@playwright/test"), PRESENTATION_BASE_URL: baseURL, PRESENTATION_DEV_URL: developmentURL, PRESENTATION_RUN: options.runDirectory, PRESENTATION_EXECUTION: execution, PRESENTATION_CAPTURES: captures, PRESENTATION_OUTPUT: output, PLAYWRIGHT_JSON_OUTPUT_NAME: report },
    });
  } finally {
    try {
      const results = JSON.parse(await readFile(report, "utf8"));
      const assessment = summarize(results);
      await saveJson(path.join(options.runDirectory, `browser-summary-${execution}.json`), { ...provenance, ...assessment, stats: results.stats });
      console.log(JSON.stringify({ counts: assessment.counts, missing: assessment.missing, unexpected: assessment.unexpected, report, captures }));
      if (!assessment.complete) process.exitCode = 1;
    } catch (error) { console.error(`Browser report unavailable: ${error.message}`); process.exitCode = 1; }
  }
} catch (error) {
  console.error(`Presentation browser checks failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (developmentServer) await developmentServer.close();
}
