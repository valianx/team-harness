import { constants } from 'node:fs';
import { copyFile } from 'node:fs/promises';

try {
  await copyFile(new URL('../gitignore.txt', import.meta.url), new URL('../.gitignore', import.meta.url), constants.COPYFILE_EXCL);
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
}
