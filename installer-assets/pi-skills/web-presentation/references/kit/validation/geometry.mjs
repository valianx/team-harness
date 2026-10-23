/** Execute with Playwright page.evaluate(inspectSlide, options) after settling each native reveal state. */
export function inspectSlide(options = {}) {
  const diagnostics = [];
  const counts = { roots: 0, regions: 0, elements: 0, text: 0, images: 0, svgs: 0 };
  const matches = [...document.querySelectorAll(options.selector || '[data-harness-slide][data-harness-active="true"]')];
  counts.roots = matches.length;
  const root = matches[0];
  const slide = root?.getAttribute('data-harness-alias') || root?.getAttribute('data-harness-slide') || root?.getAttribute('data-harness-page') || 'unknown';
  const layout = root?.getAttribute('data-harness-layout') || 'unknown';
  const add = (check, region, element, message) => diagnostics.push({ check, slide, region, element, message });
  if (matches.length !== 1) {
    add('active-root', 'stage', 'root', `Expected one measurable active slide; found ${matches.length}.`);
    return { slide, layout, diagnostics, counts, ready: false };
  }
  const bounds = root.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0 || root.offsetWidth <= 0 || root.offsetHeight <= 0) {
    add('stage-measurement', 'stage', 'root', 'The active stage has zero dimensions.');
    return { slide, layout, diagnostics, counts, ready: false };
  }
  const tolerance = Number.isFinite(options.tolerance) ? options.tolerance : 1;
  const scaleX = bounds.width / 1280;
  const scaleY = bounds.height / 720;
  const parentAcross = (element) => element.parentElement || element.getRootNode()?.host || null;
  const closestAcross = (element, selector) => {
    for (let node = element; node; node = parentAcross(node)) if (node.matches(selector)) return node;
    return null;
  };
  const containsAcross = (ancestor, element) => {
    for (let node = element; node; node = parentAcross(node)) if (node === ancestor) return true;
    return false;
  };
  const allElements = [];
  const allText = [];
  const collect = (container) => {
    for (const node of container.childNodes) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        allElements.push(node);
        collect(node);
        if (node.shadowRoot) collect(node.shadowRoot);
      } else if (node.nodeType === Node.TEXT_NODE) allText.push(node);
    }
  };
  collect(root);
  const rect = (element) => {
    const value = element.getBoundingClientRect();
    return { x: (value.left - bounds.left) / scaleX, y: (value.top - bounds.top) / scaleY, width: value.width / scaleX, height: value.height / scaleY };
  };
  const contained = (inner, outer) => inner.x >= outer.x - tolerance && inner.y >= outer.y - tolerance && inner.x + inner.width <= outer.x + outer.width + tolerance && inner.y + inner.height <= outer.y + outer.height + tolerance;
  const overlaps = (a, b) => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > tolerance && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > tolerance;
  const visible = (element) => {
    for (let node = element; node && node !== root.parentElement; node = parentAcross(node)) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) <= 0.01) return false;
    }
    return true;
  };
  const label = (element) => element.id ? `#${element.id}` : `${element.tagName.toLowerCase()}${element.getAttribute('aria-label') ? `[${element.getAttribute('aria-label')}]` : ''}: ${(element.textContent || element.getAttribute('src') || '').trim().replace(/\s+/g, ' ').slice(0, 70)}`;
  const regionName = (element) => closestAcross(element, '[data-harness-region]')?.getAttribute('data-harness-region') || 'stage';
  if (Math.abs(root.offsetWidth - 1280) > tolerance || Math.abs(root.offsetHeight - 720) > tolerance || Math.abs(scaleX - scaleY) > 0.01)
    add('stage-size', 'stage', 'root', 'Expected a uniformly scaled 1280×720 logical stage.');
  const screenTolerance = tolerance * Math.max(scaleX, scaleY);
  if (bounds.left < -screenTolerance || bounds.top < -screenTolerance || bounds.right > innerWidth + screenTolerance || bounds.bottom > innerHeight + screenTolerance)
    add('stage-clipping', 'stage', 'root', 'The stage extends beyond the visible browser viewport.');
  for (let ancestor = root.parentElement; ancestor; ancestor = ancestor.parentElement) {
    const style = getComputedStyle(ancestor);
    const box = ancestor.getBoundingClientRect();
    const clippedX = /(hidden|clip|auto|scroll)/.test(style.overflowX) && box.width > 0 && (bounds.left < box.left - screenTolerance || bounds.right > box.right + screenTolerance);
    const clippedY = /(hidden|clip|auto|scroll)/.test(style.overflowY) && box.height > 0 && (bounds.top < box.top - screenTolerance || bounds.bottom > box.bottom + screenTolerance);
    if (clippedX || clippedY) { add('stage-clipping', 'stage', 'root', `The stage is clipped by its engine/container ancestor ${label(ancestor)}.`); break; }
  }
  const cover = ['h-cover', 'h-section'].includes(layout);
  const expected = {
    title: cover ? [64, 144, 1152, 176] : [64, 64, 1152, 88],
    body: cover ? [64, 352, 1152, 248] : [64, 176, 1152, 424],
    footer: [64, 624, 1152, 32],
  };
  if (layout === 'h-compare') Object.assign(expected, { left: [64, 176, 560, 424], right: [656, 176, 560, 424] });
  if (layout === 'h-visual') Object.assign(expected, { visual: [64, 176, 720, 424], explanation: [816, 176, 400, 424] });
  if (layout === 'h-demo') Object.assign(expected, { visual: [64, 176, 816, 424], explanation: [912, 176, 304, 424] });
  if (!['h-cover', 'h-section', 'h-content', 'h-compare', 'h-visual', 'h-demo'].includes(layout)) add('supported-layout', 'stage', 'root', `Unknown kit layout: ${layout}`);
  const regions = allElements.filter(element => element.matches('[data-harness-region]') && visible(element));
  counts.regions = regions.length;
  for (const [name, values] of Object.entries(expected)) {
    const candidates = regions.filter(element => element.getAttribute('data-harness-region') === name);
    if (candidates.length !== 1) { add('region-count', name, 'region', `Expected one ${name} region; found ${candidates.length}.`); continue; }
    const actual = rect(candidates[0]);
    if (['x', 'y', 'width', 'height'].some((key, index) => Math.abs(actual[key] - values[index]) > tolerance))
      add('region-bounds', name, label(candidates[0]), `Region differs from logical bounds ${values.join(', ')}.`);
  }
  for (let i = 0; i < regions.length; i++) for (let j = i + 1; j < regions.length; j++) {
    if (containsAcross(regions[i], regions[j]) || containsAcross(regions[j], regions[i])) continue;
    if (overlaps(rect(regions[i]), rect(regions[j]))) add('region-overlap', regionName(regions[i]), label(regions[i]), `Collides with ${regionName(regions[j])}.`);
  }
  let ready = document.fonts?.status === 'loaded';
  if (!ready) add('font-readiness', 'stage', 'fonts', 'Font loading has not settled.');
  for (const text of allText) {
    const element = text.parentElement;
    if (!text.textContent.trim() || !element || !visible(element) || closestAcross(element, 'script,style,title,desc,defs,symbol,clipPath,mask,pattern')) continue;
    const region = closestAcross(element, '[data-harness-region]');
    if (!region) continue;
    counts.text++;
    const range = document.createRange();
    range.selectNodeContents(text);
    const pieces = [...range.getClientRects()].filter(value => value.width > 0 && value.height > 0);
    if (!pieces.length) { add('text-measurement', regionName(element), label(element), 'Visible text has no measurable bounds.'); continue; }
    for (const piece of pieces) {
      const actual = { x: (piece.left - bounds.left) / scaleX, y: (piece.top - bounds.top) / scaleY, width: piece.width / scaleX, height: piece.height / scaleY };
      if (!contained(actual, rect(region))) { add('content-overflow', regionName(element), label(element), 'Visible text exceeds its safe region.'); break; }
      for (let ancestor = element; ancestor && ancestor !== root; ancestor = parentAcross(ancestor)) {
        const style = getComputedStyle(ancestor);
        if (/(hidden|clip)/.test(`${style.overflowX} ${style.overflowY}`) && !contained(actual, rect(ancestor))) {
          add('content-clipping', regionName(element), label(element), `Text is clipped by ${label(ancestor)}.`); break;
        }
      }
    }
    if (parseFloat(getComputedStyle(element).fontSize) < 16 - tolerance)
      add('small-text', regionName(element), label(element), 'Text is below the supported 16px caption minimum; assess body readability separately.');
  }
  const candidates = allElements.filter(element => element.matches('p,li,h1,h2,h3,h4,h5,h6,pre,table,img,iframe,svg,video,canvas,button,input,textarea,select,.mermaid,[data-harness-check]') && visible(element) && !closestAcross(element, 'defs,symbol,clipPath,mask,pattern'));
  const elements = [];
  for (const element of candidates) {
    if (element instanceof HTMLImageElement) {
      counts.images++;
      if (!element.complete || element.naturalWidth === 0) { ready = false; add('image-readiness', regionName(element), label(element), `Image is missing or not ready: ${element.getAttribute('src')}`); }
    }
    if (element instanceof SVGSVGElement) counts.svgs++;
    const measured = rect(element);
    if (measured.width <= 0 || measured.height <= 0) {
      if (element.matches('img,iframe,svg,video,canvas,.mermaid,[data-harness-check]')) {
        ready = false;
        add('element-measurement', regionName(element), label(element), 'Visible media has zero rendered width or height; loaded assets alone do not establish a visible visual.');
      }
      continue;
    }
    elements.push(element);
    const region = closestAcross(element, '[data-harness-region]');
    if (region && !contained(measured, rect(region))) add('element-overflow', regionName(element), label(element), 'Element exceeds its safe region.');
  }
  counts.elements = elements.length;
  for (let i = 0; i < elements.length; i++) for (let j = i + 1; j < elements.length; j++) {
    const a = elements[i]; const b = elements[j];
    if (containsAcross(a, b) || containsAcross(b, a)) continue;
    const overlayA = closestAcross(a, '[data-harness-overlay]')?.getAttribute('data-harness-overlay');
    const overlayB = closestAcross(b, '[data-harness-overlay]')?.getAttribute('data-harness-overlay');
    if (overlayA && overlayA === overlayB) continue;
    if (overlaps(rect(a), rect(b))) add('content-overlap', regionName(a), label(a), `Collides with ${label(b)}. Explicit intentional overlays need a shared data-harness-overlay group.`);
  }
  if (!counts.regions || !counts.elements || !counts.text) { ready = false; add('empty-measurement', 'stage', 'content', 'A nonempty set of regions, elements and visible text is required.'); }
  return { slide, layout, diagnostics, counts, ready, stage: { width: 1280, height: 720, scale: scaleX }, readability: 'Geometry and the minimum caption size are checked; source fidelity and readable composition require independent visual review.' };
}
