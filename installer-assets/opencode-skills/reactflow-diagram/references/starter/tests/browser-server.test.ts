import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const tsxLoader = import.meta.resolve('tsx');
type BrowserConfig = { baseURL: string; outputDir: string; command: string; reuseExistingServer: boolean };

async function consumers(run: (roots: string[]) => Promise<void>) {
  const temporary = await mkdtemp(join(tmpdir(), 'diagram-browser-consumers-'));
  try {
    const roots = await Promise.all(['first', 'second'].map(async name => {
      const root = join(temporary, name);
      await mkdir(join(root, 'scripts'), { recursive: true });
      await writeFile(join(root, 'package.json'), '{"type":"module"}\n');
      await copyFile(new URL('../playwright.config.ts', import.meta.url), join(root, 'playwright.config.ts'));
      try { await copyFile(new URL('../scripts/browser-server.ts', import.meta.url), join(root, 'scripts/browser-server.ts')); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      await symlink(fileURLToPath(new URL('../node_modules', import.meta.url)), join(root, 'node_modules'), 'junction');
      return root;
    }));
    await run(roots);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

async function configuration(root: string, overrides: NodeJS.ProcessEnv = {}, cwd = root): Promise<BrowserConfig> {
  const environment = { ...process.env };
  for (const key of ['DIAGRAM_BASE_URL', 'DIAGRAM_SERVER_COMMAND', 'DIAGRAM_EVIDENCE_DIR', 'CI']) delete environment[key];
  const script = `const { default: config } = await import(process.argv[1]);
    console.log(JSON.stringify({ baseURL: config.use.baseURL, outputDir: config.outputDir,
      command: config.webServer.command, reuseExistingServer: config.webServer.reuseExistingServer }));`;
  const { stdout } = await execute(process.execPath, ['--import', tsxLoader, '--input-type=module', '--eval', script, pathToFileURL(join(root, 'playwright.config.ts')).href], {
    cwd, env: { ...environment, ...overrides }, timeout: 10000,
  });
  return JSON.parse(stdout);
}

test('an active default consumer keeps the next consumer on a distinct loopback port', async () => {
  await consumers(async roots => {
    const first = await configuration(roots[0]);
    const active = createServer();
    await new Promise<void>((resolve, reject) => { active.once('error', reject); active.listen(Number(new URL(first.baseURL).port), '127.0.0.1', resolve); });
    try {
      const configs = [first, await configuration(roots[1])];
      const urls = configs.map(config => new URL(config.baseURL));
      assert.notEqual(urls[0].port, urls[1].port, 'An occupied destination must not be selected for another consumer');
      for (const [index, config] of configs.entries()) {
        assert.equal(urls[index].hostname, '127.0.0.1');
        assert.ok(Number(urls[index].port) > 0);
        assert.equal(config.reuseExistingServer, false);
        assert.match(config.command, new RegExp(`--port ${urls[index].port}(?: |$)`));
        assert.match(config.command, /--host 127\.0\.0\.1(?: |$)/);
        assert.match(config.command, /--strictPort(?: |$)/);
      }
    } finally {
      await new Promise<void>((resolve, reject) => active.close(error => error ? reject(error) : resolve()));
    }
  });
});

test('each consumer keeps default browser output inside its own root even from another cwd', async () => {
  await consumers(async roots => {
    const configs = await Promise.all(roots.map(root => configuration(root, {}, dirname(root))));
    assert.notEqual(resolve(roots[0], configs[0].outputDir), resolve(roots[1], configs[1].outputDir));
    configs.forEach((config, index) => assert.equal(resolve(roots[index], config.outputDir), join(roots[index], 'test-results')));
  });
});

test('explicit destination, command and evidence overrides retain caller-selected values and reuse outside CI', async () => {
  await consumers(async ([root]) => {
    const overrides = { DIAGRAM_BASE_URL: 'http://127.0.0.1:48123/', DIAGRAM_SERVER_COMMAND: 'node custom-server.mjs --static', DIAGRAM_EVIDENCE_DIR: join(dirname(root), 'explicit evidence') };
    const config = await configuration(root, overrides);
    assert.equal(config.baseURL, overrides.DIAGRAM_BASE_URL);
    assert.equal(config.command, overrides.DIAGRAM_SERVER_COMMAND);
    assert.equal(config.outputDir, overrides.DIAGRAM_EVIDENCE_DIR);
    assert.equal(config.reuseExistingServer, true);
    assert.equal((await configuration(root, { ...overrides, CI: 'true' })).reuseExistingServer, false);
  });
});

test('a custom server command alone retains the existing static destination', async () => {
  await consumers(async ([root]) => {
    const command = 'npm run preview -- --host 127.0.0.1 --port 4178';
    const config = await configuration(root, { DIAGRAM_SERVER_COMMAND: command });
    assert.equal(config.baseURL, 'http://127.0.0.1:4178');
    assert.equal(config.command, command);
    assert.equal(config.reuseExistingServer, true);
  });
});

test('a destination override without a command starts the matching strict loopback port', async () => {
  await consumers(async ([root]) => {
    const config = await configuration(root, { DIAGRAM_BASE_URL: 'http://127.0.0.1:48124/' });
    assert.equal(config.baseURL, 'http://127.0.0.1:48124/');
    assert.match(config.command, /--port 48124(?: |$)/);
    assert.match(config.command, /--strictPort(?: |$)/);
    assert.equal(config.reuseExistingServer, true);
  });
});

test('an evidence-only override preserves default server isolation in and outside CI', async () => {
  await consumers(async ([root]) => {
    for (const CI of ['', 'true']) {
      const outputDir = join(root, 'case evidence');
      const config = await configuration(root, { DIAGRAM_EVIDENCE_DIR: outputDir, CI });
      assert.equal(config.outputDir, outputDir);
      assert.equal(config.reuseExistingServer, false);
    }
  });
});
