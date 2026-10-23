import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { load } from '@slidev/parser/fs';
import { parseSync } from '@slidev/parser';

export function inside(root, path) {
  const rel = relative(root, path);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && !isAbsolute(rel));
}

export async function loadDeck(projectRoot, entry = 'slides.md') {
  const root = await realpath(resolve(projectRoot));
  const filepath = resolve(root, entry);
  const sources = new Map();
  const read = async (path) => {
    const actual = await realpath(path);
    if (!inside(root, actual)) throw new Error(`Markdown path escapes outside project: ${path}`);
    const raw = await readFile(actual, 'utf8');
    sources.set(path, raw);
    return raw;
  };
  const data = await load({ roots: [root], userRoot: root, allowedRoots: [root] }, filepath, read);
  const errors = Object.values(data.markdownFiles).flatMap(md => (md.errors ?? []).map(error => `${relative(root, md.filepath)}:${error.row + 1}: ${error.message}`));
  if (errors.length) throw new Error(errors.join('\n'));
  // The loader supplies native import identity; preserveCR supplies original byte spans.
  const originals = new Map([...sources].map(([path, raw]) => [path, parseSync(raw, path, { preserveCR: true })]));
  return { root, filepath, data, sources, originals };
}

export function sourceOffsets(raw) {
  const offsets = [0];
  for (let index = 0; index < raw.length; index++) if (raw[index] === '\n') offsets.push(index + 1);
  return offsets;
}
