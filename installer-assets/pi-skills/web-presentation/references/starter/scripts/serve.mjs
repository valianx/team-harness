import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { argumentsFor, fail, isMain } from './cli.mjs';
import { inside } from './deck.mjs';
import { normalizedBase } from './build.mjs';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

export async function startPreview({ directory = 'dist', base = '/', host = '127.0.0.1', port = 4173 } = {}) {
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error('Preview host must be loopback; publishing requires separate authorization.');
  base = normalizedBase(base);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid preview port');
  const root = await realpath(resolve(directory));
  const server = createServer(async (request, response) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (!pathname.startsWith(base) || pathname.includes('\\') || pathname.split('/').includes('..')) throw new Error('outside base');
      const resource = pathname.slice(base.length);
      let file = resolve(root, resource || 'index.html');
      if (!inside(root, file)) throw new Error('outside root');
      try {
        if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
      } catch {
        // Only native extensionless history routes receive the app shell.
        if (extname(resource)) throw new Error('missing resource');
        file = resolve(root, 'index.html');
      }
      const actual = await realpath(file);
      if (!inside(root, actual)) throw new Error('symlink outside root');
      const body = await readFile(actual);
      response.writeHead(200, { 'content-type': TYPES[extname(actual)] || 'application/octet-stream', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch { response.writeHead(404, { 'content-type': 'text/plain' }); response.end('Not found'); }
  });
  await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(port, host, resolveListen); });
  const address = server.address();
  return { server, url: `http://${host.includes(':') ? `[${host}]` : host}:${address.port}${base}` };
}

if (isMain(import.meta.url)) {
  try {
    const args = argumentsFor(process.argv.slice(2), ['--dir', '--base', '--port', '--host']);
    const { url } = await startPreview({ directory: args['--dir'], base: args['--base'], host: args['--host'], port: args['--port'] === undefined ? 4173 : Number(args['--port']) });
    console.log(`Preview: ${url} (local process; Ctrl-C to stop)`);
  } catch (error) { fail(error); }
}
