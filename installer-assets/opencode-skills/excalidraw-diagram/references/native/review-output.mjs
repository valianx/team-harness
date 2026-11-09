import { lstat, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const union = boxes => {
  const x = Math.min(...boxes.map(box => box.x)), y = Math.min(...boxes.map(box => box.y));
  return { x, y, width: Math.max(...boxes.map(box => box.x + box.width)) - x,
    height: Math.max(...boxes.map(box => box.y + box.height)) - y };
};
const padded = (box, amount = 30) => ({ x: box.x - amount, y: box.y - amount,
  width: Math.max(120, box.width + amount * 2), height: Math.max(90, box.height + amount * 2) });

async function destination(output, directory, filename, protectedSources) {
  const dir = resolve(output, directory), file = resolve(dir, filename);
  for (const path of [dir, file]) {
    const info = await lstat(path).catch(error => { if (error.code !== 'ENOENT') throw error; });
    if (info?.isSymbolicLink() || info && (path === dir ? !info.isDirectory() : !info.isFile() || info.nlink > 1 ||
      protectedSources.some(source => source.dev === info.dev && source.ino === info.ino))) {
      throw new Error('Review output must not redirect through symlinks, non-files or hard links');
    }
  }
  await mkdir(dir, { recursive: true });
  return file;
}

async function render(page, items, shared, title) {
  await page.setViewportSize({ width: items.length > 1 ? 1920 : 1280, height: 960 });
  await page.setContent('<style>body{margin:0;padding:20px;width:100vw;overflow:hidden;box-sizing:border-box;background:#f1f4f8;font-family:Arial}h1{font-size:18px;margin:0 0 12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.grid{display:flex;gap:20px;height:860px}.item{flex:1;min-width:0;background:white;padding:12px;display:flex;flex-direction:column}h2{font-size:16px;margin:0 0 8px;overflow-wrap:anywhere}svg{width:100%;height:100%;min-height:0}</style><h1></h1><div class="grid"></div>');
  await page.evaluate(({ items, shared, title }) => {
    document.querySelector('h1').textContent = title;
    for (const [index, item] of items.entries()) {
      const section = document.createElement('section'); section.className = 'item';
      const heading = document.createElement('h2'); heading.textContent = item.label; section.append(heading);
      const svg = new DOMParser().parseFromString(item.svg, 'image/svg+xml').documentElement;
      // Side-by-side revisions reuse IDs; namespace masks and clip paths per image.
      const ids = new Map([...svg.querySelectorAll('[id]')].map(node => [node.id, `revision-${index}-${node.id}`]));
      for (const node of [svg, ...svg.querySelectorAll('*')]) for (const attribute of [...node.attributes]) {
        let value = attribute.value;
        if (attribute.name === 'id') value = ids.get(value) || value;
        else {
          value = value.replace(/url\(#([^)]*)\)/g, (match, id) => ids.has(id) ? `url(#${ids.get(id)})` : match);
          if (value.startsWith('#') && ids.has(value.slice(1))) value = `#${ids.get(value.slice(1))}`;
        }
        node.setAttribute(attribute.name, value);
      }
      const box = shared ? { ...shared, x: shared.x + item.origin.x, y: shared.y + item.origin.y } : item.box;
      svg.setAttribute('viewBox', `${box.x} ${box.y} ${box.width} ${box.height}`);
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      svg.removeAttribute('width'); svg.removeAttribute('height');
      for (const region of item.regions || []) {
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        for (const [name, value] of Object.entries({ x: region.x - 3, y: region.y - 3, width: region.width + 6, height: region.height + 6,
          fill: 'none', stroke: '#d33', 'stroke-width': 2, 'stroke-dasharray': '5 4' })) rect.setAttribute(name, value);
        svg.append(rect);
      }
      section.append(document.importNode(svg, true)); document.querySelector('.grid').append(section);
    }
    return document.fonts.ready;
  }, { items, shared, title });
  await page.evaluate(async () => { await Promise.all([...document.images].map(image => image.decode().catch(() => {}))); await document.fonts.ready; });
  await page.evaluate(() => window.scrollTo(0, 0));
}

/** Write bounded annotated crops of the native export; never rewrite the editable scene. */
export async function writeReview(context, exported, diagnostics, output, stage, focusIds = [], protectedSources = []) {
  const byId = new Map(exported.observations.elements.map(value => [value.id, value]));
  const explicit = focusIds.map(id => {
    const element = byId.get(id);
    if (!element?.bounds) throw new Error(`Cannot focus unobserved element ${id}`);
    return { key: `focus:${id}`, kind: 'focus', severity: 'focus', elementIds: [id], bounds: element.bounds };
  });
  const issues = [...diagnostics.issues].filter(issue => issue.kind !== 'unavailable-geometry')
    .sort((a, b) => (a.severity === 'error' ? 0 : 1) - (b.severity === 'error' ? 0 : 1));
  const selected = [...explicit, ...issues].filter((value, index, all) => all.findIndex(item => item.key === value.key) === index).slice(0, 8);
  const page = await context.newPage();
  await page.route('**/*', route => route.abort());
  const crops = [];
  try {
    for (let index = 0; index < selected.length; index++) {
      const issue = selected[index];
      const target = issue.kind.startsWith('arrow-') ? byId.get(issue.elementIds.at(-1))?.bounds : issue.bounds;
      if (!target || ![target.x, target.y, target.width, target.height].every(Number.isFinite)) continue;
      const box = padded(target);
      const relative = `review-${stage}/${String(index + 1).padStart(2, '0')}.png`;
      await render(page, [{ svg: exported.svg, box, regions: [target], label: issue.elementIds.join(' · ') }], null,
        `${issue.kind}${issue.message ? ` — ${issue.message}` : ''}`);
      await page.screenshot({ path: await destination(output, `review-${stage}`, `${String(index + 1).padStart(2, '0')}.png`, protectedSources) });
      crops.push({ path: relative, key: issue.key, kind: issue.kind, elementIds: issue.elementIds, bounds: box });
    }
  } finally { await page.close(); }
  const result = { crops, omitted: Math.max(0, explicit.length + issues.length - selected.length),
    note: 'Annotated native-export crops are review aids; inspect the faithful overview separately.' };
  await writeFile(await destination(output, `review-${stage}`, 'issues.json', protectedSources), JSON.stringify({ ...diagnostics, ...result }, null, 2) + '\n');
  return result;
}

/** Compare two native revisions at the same world-coordinate extent and scale. */
export async function writeComparison(context, before, current, output, protectedSources = []) {
  const worldBounds = exported => {
    const box = exported.observations.viewBox, origin = exported.observations.origin;
    return { ...box, x: box.x - origin.x, y: box.y - origin.y };
  };
  const sharedViewBox = union([worldBounds(before), worldBounds(current)]);
  const page = await context.newPage();
  await page.route('**/*', route => route.abort());
  try {
    await render(page, [
      { svg: before.svg, origin: before.observations.origin, label: 'Before' },
      { svg: current.svg, origin: current.observations.origin, label: 'Current' },
    ], sharedViewBox, 'Native revisions · same framing and scale');
    const path = 'review-comparison/before-after.png';
    await page.screenshot({ path: await destination(output, 'review-comparison', 'before-after.png', protectedSources) });
    return { path, sharedViewBox, calibration: [before.observations.origin, current.observations.origin] };
  } finally { await page.close(); }
}
