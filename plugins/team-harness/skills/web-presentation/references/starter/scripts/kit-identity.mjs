import { readFile, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { relative, resolve } from 'node:path';
import { argumentsFor, fail, isMain } from './cli.mjs';
import { inside } from './deck.mjs';

export async function kitIdentity(projectRoot = process.cwd()) {
  const root = await realpath(resolve(projectRoot));
  const packageBytes = await readFile(resolve(root, 'package.json'));
  const lockBytes = await readFile(resolve(root, 'package-lock.json'));
  const manifest = JSON.parse(packageBytes);
  const lock = JSON.parse(lockBytes);
  const declared = manifest.dependencies?.['slidev-addon-harness'];
  if (!declared?.startsWith('file:')) throw new Error('Expected a project-owned file: archive for slidev-addon-harness');
  const archive = await realpath(resolve(root, declared.slice(5)));
  if (!inside(root, archive) || !archive.endsWith('.tgz')) throw new Error('Kit archive must be an owned .tgz inside the consumer project');
  const bytes = await readFile(archive);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const integrity = 'sha512-' + createHash('sha512').update(bytes).digest('base64');
  const entry = lock.packages?.['node_modules/slidev-addon-harness'];
  if (!entry || entry.integrity !== integrity || entry.resolved !== declared)
    throw new Error('Kit archive integrity or dependency differs from the lockfile; perform an explicit project-owned upgrade.');
  let installedVersion = null;
  try { installedVersion = JSON.parse(await readFile(resolve(root, 'node_modules/slidev-addon-harness/package.json'), 'utf8')).version; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (installedVersion && installedVersion !== entry.version) throw new Error('Installed kit version differs from the locked archive; run npm ci and validate.');
  return { engine: manifest.devDependencies?.['@slidev/cli'] ?? manifest.dependencies?.['@slidev/cli'], theme: manifest.dependencies?.['@slidev/theme-default'], kit: { declared, version: entry.version, installedVersion, archive: relative(root, archive).replaceAll('\\', '/'), sha256, integrity }, packageSha256: createHash('sha256').update(packageBytes).digest('hex'), lockSha256: createHash('sha256').update(lockBytes).digest('hex'), status: installedVersion ? 'identity-checked' : 'installation-pending', validation: 'Identity does not establish rendered or content correctness.' };
}

if (isMain(import.meta.url)) {
  try {
    const args = argumentsFor(process.argv.slice(2), ['--project']);
    console.log(JSON.stringify(await kitIdentity(args['--project']), null, 2));
  } catch (error) { fail(error); }
}
