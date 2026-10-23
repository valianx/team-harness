import { access, realpath } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { argumentsFor, fail, isMain } from './cli.mjs';
import { inside, loadDeck } from './deck.mjs';

function liveContent(content) {
  return content.replace(/^\s*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\s*\1\s*$/gm, '').replace(/<!--[\s\S]*?-->/g, '');
}

export async function inspectDeck(projectRoot = process.cwd(), entry = 'slides.md') {
  const deck = await loadDeck(projectRoot, entry);
  const diagnostics = [];
  const resources = { local: [], external: [] };
  const slides = [];
  const aliases = new Set();
  for (const slide of deck.data.slides) {
    const alias = slide.frontmatter.routeAlias;
    const label = alias || String(slide.index + 1);
    const file = relative(deck.root, slide.source.filepath);
    slides.push({ alias: alias ?? null, page: slide.index + 1, file, title: slide.title, layout: slide.frontmatter.layout ?? 'default' });
    const add = (check, message, extra = {}) => diagnostics.push({ check, slide: label, file, message, ...extra });
    if (!alias) add('missing-alias', 'Give this maintained slide a unique native routeAlias.');
    else if (aliases.has(alias)) add('duplicate-alias', `routeAlias "${alias}" is ambiguous.`);
    aliases.add(alias);
    const content = liveContent(slide.content);
    if (/\b(?:TODO|TBD|FIXME)\b|\{\{\s*(?:insert|replace|your)[^}]*\}\}|\[(?:insert|replace|your)[^\]]*\]/i.test(content))
      add('placeholder', 'Unfinished placeholder remains in visible slide content.');
    const refs = new Set();
    for (const match of content.matchAll(/!?\[[^\]]*\]\(\s*<?([^\s)>]+)>?(?:\s+[^)]*)?\)|\b(?:src|href|fallback|poster)\s*=\s*["']([^"']+)["']/g)) refs.add(match[1] ?? match[2]);
    for (const url of refs) {
      if (/^(?:https?:)?\/\//i.test(url)) {
        resources.external.push({ slide: label, file, url, verification: 'network/authentication/framing not established by source check' });
        continue;
      }
      if (/^(?:#|data:|mailto:|tel:|javascript:)/i.test(url)) continue;
      let path;
      try {
        const clean = decodeURIComponent(url.split(/[?#]/, 1)[0]);
        path = clean.startsWith('/') ? resolve(deck.root, 'public', `.${clean}`) : resolve(dirname(slide.source.filepath), clean);
        const actual = await realpath(path);
        if (!inside(deck.root, actual)) throw new Error('outside project');
        await access(actual);
        resources.local.push({ slide: label, file, url, path: relative(deck.root, actual) });
      } catch (error) {
        add('missing-asset', `Local resource is missing or outside the project: ${url}`, { url });
      }
    }
  }
  return { entry: relative(deck.root, deck.filepath), slides, resources, diagnostics, scope: 'Source references and placeholders only; semantic fidelity and rendered behavior require separate assessment.' };
}

if (isMain(import.meta.url)) {
  try {
    const args = argumentsFor(process.argv.slice(2), ['--project', '--entry']);
    const report = await inspectDeck(args['--project'], args['--entry']);
    console.log(JSON.stringify(report, null, 2));
    if (report.diagnostics.length) process.exitCode = 1;
  } catch (error) { fail(error); }
}
