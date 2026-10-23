import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { argumentsFor, fail, isMain } from './cli.mjs';
import { inspectDeck } from './check-source.mjs';

export function normalizedBase(base = '/') {
  if (!base.startsWith('/') || !base.endsWith('/') || base.startsWith('//') || /[\\?#%\s]|(?:^|\/)\.{1,2}(?:\/|$)/.test(base))
    throw new Error('The build base must be a local absolute path starting and ending with /, without traversal.');
  return base;
}

export function buildArguments(argv) {
  const args = argumentsFor(argv, ['--base', '--out', '--entry']);
  return ['build', args['--entry'] || 'slides.md', '--base', normalizedBase(args['--base']), '--out', args['--out'] || 'dist', '--without-notes'];
}

export async function copyDeliveryLicenses(kitDirectory, outputDirectory) {
  const target = resolve(outputDirectory, 'licenses');
  await mkdir(target, { recursive: true });
  for (const [source, name] of [['LICENSE', 'slidev-addon-harness-MIT.txt'], ['NOTICE.md', 'NOTICE.md'], ['licenses/Inter-OFL.txt', 'Inter-OFL.txt'], ['licenses/theme-default-MIT.txt', 'theme-default-MIT.txt']])
    await copyFile(resolve(kitDirectory, source), resolve(target, name));
}

if (isMain(import.meta.url)) {
  try {
    const args = buildArguments(process.argv.slice(2));
    const report = await inspectDeck(process.cwd(), args[1]);
    if (report.diagnostics.length) throw new Error(`Source validation failed:\n${report.diagnostics.map(item => `${item.slide} (${item.file}): ${item.message}`).join('\n')}`);
    const bin = new URL('../node_modules/@slidev/cli/bin/slidev.mjs', import.meta.url);
    const result = spawnSync(process.execPath, [fileURLToPath(bin), ...args], { stdio: 'inherit', cwd: process.cwd() });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Slidev build failed (${result.status ?? result.signal})`);
    const output = resolve(process.cwd(), args[5]);
    await mkdir(output, { recursive: true });
    await copyDeliveryLicenses(fileURLToPath(new URL('../node_modules/slidev-addon-harness/', import.meta.url)), output);
    await writeFile(resolve(output, 'resource-inventory.json'), JSON.stringify({ ...report.resources, note: 'Source inventory; runtime requests and sensitive content still require inspection.' }, null, 2) + '\n');
  } catch (error) { fail(error); }
}
