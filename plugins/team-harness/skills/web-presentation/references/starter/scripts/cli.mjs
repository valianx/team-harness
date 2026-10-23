import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function argumentsFor(argv, allowed) {
  const values = {};
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i];
    if (!allowed.includes(name) || !argv[i + 1] || argv[i + 1].startsWith('--'))
      throw new Error(`Expected ${allowed.join(', ')} followed by a value; received ${name}`);
    if (name in values) throw new Error(`Duplicate option ${name}`);
    values[name] = argv[++i];
  }
  return values;
}

export function isMain(metaUrl) {
  return process.argv[1] && metaUrl === pathToFileURL(resolve(process.argv[1])).href;
}

export function fail(error) {
  console.error(error.message);
  process.exitCode = 1;
}
