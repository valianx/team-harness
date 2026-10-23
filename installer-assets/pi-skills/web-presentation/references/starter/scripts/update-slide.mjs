import { readFile, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { parseSync } from '@slidev/parser';
import { argumentsFor, fail, isMain } from './cli.mjs';
import { loadDeck, sourceOffsets } from './deck.mjs';

// Unknown entry headmatter remains project configuration until deliberately edited.
const SLIDE_FIELDS = new Set(['routeAlias', 'layout', 'class', 'background', 'clicks', 'clicksStart', 'level', 'disabled', 'hide', 'eyebrow', 'footer']);

export async function updateSlide({ projectRoot = process.cwd(), entry = 'slides.md', alias, replacement }) {
  if (!alias || !replacement) throw new Error('A target alias and replacement file are required');
  const deck = await loadDeck(projectRoot, entry);
  const targets = deck.data.slides.filter(slide => slide.frontmatter.routeAlias === alias);
  if (targets.length !== 1) throw new Error(`Expected one routeAlias "${alias}"; found ${targets.length}. No source was changed.`);
  const target = targets[0];
  if (target.importChain?.some(item => item.frontmatter.routeAlias))
    throw new Error('A routeAlias overridden at an import boundary is ambiguous; edit the native source explicitly.');
  const source = target.source;
  const original = deck.originals.get(source.filepath);
  const raw = deck.sources.get(source.filepath);
  const originalSlide = original.slides[source.index];
  const fragment = await readFile(resolve(projectRoot, replacement), 'utf8');
  const parsed = parseSync(fragment, replacement, { preserveCR: true });
  if (parsed.slides.length !== 1 || parsed.slides[0].frontmatter.src)
    throw new Error('The replacement must contain exactly one native slide without a src import');
  const next = parsed.slides[0];
  if (next.frontmatter.routeAlias !== alias) throw new Error(`The replacement must retain routeAlias "${alias}"`);
  if (source.filepath === deck.filepath && source.index === 0) {
    for (const key of new Set([...Object.keys(originalSlide.frontmatter), ...Object.keys(next.frontmatter)])) {
      if (SLIDE_FIELDS.has(key)) continue;
      if (!isDeepStrictEqual(originalSlide.frontmatter[key], next.frontmatter[key]))
        throw new Error(`Replacement changes protected entry headmatter "${key}"; edit project configuration explicitly.`);
    }
  }
  const newline = raw.includes('\r\n') ? '\r\n' : '\n';
  const normalized = fragment.replace(/\r?\n/g, newline).replace(/(?:\r?\n)+$/, '');
  const offsets = sourceOffsets(raw);
  const start = offsets[originalSlide.start] ?? raw.length;
  const end = offsets[originalSlide.end] ?? raw.length;
  // The separator introducing the following slide belongs to that following slide.
  const hasFollowing = originalSlide.end < raw.split('\n').length;
  const oldSuffix = raw.slice(start, end).match(/(?:\r?\n)*$/)?.[0] ?? '';
  const ending = hasFollowing ? (oldSuffix || newline + newline) : oldSuffix;
  const updated = raw.slice(0, start) + normalized + ending + raw.slice(end);
  if (updated !== raw) await writeFile(source.filepath, updated);
  return { alias, file: relative(deck.root, source.filepath), changed: updated !== raw };
}

if (isMain(import.meta.url)) {
  try {
    const args = argumentsFor(process.argv.slice(2), ['--project', '--entry', '--slide', '--file']);
    console.log(JSON.stringify(await updateSlide({ projectRoot: args['--project'], entry: args['--entry'], alias: args['--slide'], replacement: args['--file'] }), null, 2));
  } catch (error) { fail(error); }
}
