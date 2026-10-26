import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';

async function unusedLoopbackPort(): Promise<number> {
  const server = createServer();
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') { server.close(); reject(new Error('No loopback port was assigned')); return; }
      server.close(error => error ? reject(error) : resolve(address.port));
    });
  });
}

/** browserServerOptions isolates default consumers while retaining caller-selected destinations and output. */
export async function browserServerOptions(projectRoot: string, environment: NodeJS.ProcessEnv = process.env) {
  const root = resolve(projectRoot);
  const explicitServer = environment.DIAGRAM_BASE_URL !== undefined || environment.DIAGRAM_SERVER_COMMAND !== undefined;
  let baseURL = environment.DIAGRAM_BASE_URL;
  if (baseURL === undefined) {
    if (environment.DIAGRAM_SERVER_COMMAND !== undefined) baseURL = 'http://127.0.0.1:4178';
    else {
      // Playwright reloads the config in child workers, which must inherit this consumer's chosen port.
      const key = `TH_DIAGRAM_BROWSER_PORT_${createHash('sha256').update(root).digest('hex')}`;
      let port = Number(environment[key]);
      if (!Number.isInteger(port) || port < 1 || port > 65535) { port = await unusedLoopbackPort(); environment[key] = String(port); }
      baseURL = `http://127.0.0.1:${port}`;
    }
  }
  const url = new URL(baseURL);
  const port = url.port || (url.protocol === 'https:' ? '443' : '80');
  return {
    baseURL, outputDir: environment.DIAGRAM_EVIDENCE_DIR ?? join(root, 'test-results'),
    command: environment.DIAGRAM_SERVER_COMMAND ?? `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    reuseExistingServer: explicitServer && !environment.CI,
  };
}
