import { constants } from 'node:fs';
import { copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { argumentsFor } from './cli.mjs';

const args = argumentsFor(process.argv.slice(2), ['--project']);
const root = args['--project'] ? resolve(args['--project']) : new URL('../', import.meta.url);
try {
  const file = (name) => typeof root === 'string' ? resolve(root, name) : new URL(name, root);
  await copyFile(file('gitignore.txt'), file('.gitignore'), constants.COPYFILE_EXCL);
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
}
