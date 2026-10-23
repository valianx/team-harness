import { constants } from 'node:fs';
import { copyFile, lstat, mkdir, readdir, realpath, rm } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const OMIT = new Set(['node_modules', '.git', '.slidev', 'dist', 'evidence', 'test-results', 'playwright-report']);
const TEMPLATES = ['feature', 'integration', 'architecture'];

export async function createDeck({ referencesDir = fileURLToPath(new URL('../', import.meta.url)), template, output }) {
  if (!TEMPLATES.includes(template)) throw new Error(`Select a template: ${TEMPLATES.join(', ')}`);
  if (!output || !isAbsolute(output)) throw new Error('The --out path must be absolute and outside the installation.');
  const sources = await realpath(referencesDir);
  output = resolve(output);
  // Resolve existing parent symlinks before creating a consumer inside an installation.
  await mkdir(dirname(output), { recursive: true });
  const parent = await realpath(dirname(output));
  const destination = resolve(parent, basename(output));
  const rel = relative(dirname(sources), destination);
  if (rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)))
    throw new Error('Create consumer projects outside the installed skill assets.');
  try { await mkdir(destination); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error(`Destination already exists: ${output}. Inspect and update that presentation instead.`);
    throw error;
  }
  try {
    const copyTree = async (source, target) => {
      if (OMIT.has(basename(source))) return;
      const info = await lstat(source);
      if (info.isSymbolicLink()) throw new Error(`Portable payload may not contain symlinks: ${source}`);
      if (info.isDirectory()) {
        await mkdir(target, { recursive: true });
        for (const child of await readdir(source)) await copyTree(resolve(source, child), resolve(target, child));
      } else await copyFile(source, target, constants.COPYFILE_EXCL);
    };
    for (const source of [resolve(sources, 'starter'), resolve(sources, 'templates', template)])
      await copyTree(source, destination);
    try { await copyFile(resolve(destination, 'gitignore.txt'), resolve(destination, '.gitignore'), constants.COPYFILE_EXCL); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    return { project: output, template, next: ['npm ci', 'npm run check', 'npm run dev'], note: 'Build and browser verification remain pending until executed in this copied project.' };
  } catch (error) { await rm(destination, { recursive: true, force: true }); throw error; }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const options = {};
    for (let index = 0; index < args.length; index++) {
      if (args[index] === '--template' && args[index + 1]) options.template = args[++index];
      else if (args[index] === '--out' && args[index + 1]) options.output = args[++index];
      else throw new Error(`Expected --template NAME --out ABSOLUTE_PATH; received ${args[index]}`);
    }
    console.log(JSON.stringify(await createDeck(options), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
