import { mkdtemp, mkdir, readFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, relative, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

export async function packKit({ kitDir, vendorDir, check = false }) {
  const manifest = JSON.parse(await readFile(join(kitDir, 'package.json'), 'utf8'));
  if (manifest.name !== 'slidev-addon-harness' || !/^\d+\.\d+\.\d+$/.test(manifest.version))
    throw new Error('Expected a versioned slidev-addon-harness package');
  const temp = await mkdtemp(join(tmpdir(), 'harness-kit-pack-'));
  try {
    const result = spawnSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', temp], { cwd: kitDir, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr || 'npm pack failed');
    const packages = JSON.parse(result.stdout);
    if (packages.length !== 1) throw new Error('Expected one npm archive');
    const archive = packages[0].filename;
    const fresh = await readFile(join(temp, archive));
    const target = join(vendorDir, archive);
    if (check) {
      let existing;
      try { existing = await readFile(target); } catch { throw new Error(`Kit archive is missing: ${target}`); }
      if (!fresh.equals(existing)) throw new Error(`Kit archive is stale: ${target}. Repack canonical kit inputs.`);
      const project = dirname(vendorDir);
      let consumer;
      try { consumer = JSON.parse(await readFile(join(project, 'package.json'), 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (consumer) {
        const lock = JSON.parse(await readFile(join(project, 'package-lock.json'), 'utf8'));
        const declared = `file:${relative(project, target).replaceAll('\\', '/')}`;
        const entry = lock.packages?.['node_modules/slidev-addon-harness'];
        const integrity = 'sha512-' + createHash('sha512').update(fresh).digest('base64');
        if (consumer.dependencies?.['slidev-addon-harness'] !== declared || entry?.resolved !== declared || entry.integrity !== integrity)
          throw new Error('Starter kit pin or lockfile integrity differs from the canonical archive. Refresh the explicit file dependency.');
      }
    } else {
      await mkdir(vendorDir, { recursive: true });
      await copyFile(join(temp, archive), target);
    }
    return { archive, sha256: createHash('sha256').update(fresh).digest('hex'), files: packages[0].files.map(file => file.path), checked: check };
  } finally { await rm(temp, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const options = { kitDir: fileURLToPath(new URL('../kit/', import.meta.url)), vendorDir: fileURLToPath(new URL('../starter/vendor/', import.meta.url)), check: false };
    for (let index = 0; index < args.length; index++) {
      if (args[index] === '--check') options.check = true;
      else if (['--kit-dir', '--vendor-dir'].includes(args[index]) && args[index + 1]) options[args[index] === '--kit-dir' ? 'kitDir' : 'vendorDir'] = resolve(args[++index]);
      else throw new Error(`Unknown packing option: ${args[index]}`);
    }
    console.log(JSON.stringify(await packKit(options), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
