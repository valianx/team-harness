/** Measure meaningful rendered leaves, not only their possibly clipped wrapper. */
export async function measureContent(page) {
  return page.evaluate(() => {
    const queryAll = (root, selector) => {
      const found = [...root.querySelectorAll(selector)];
      for (const element of root.querySelectorAll("*")) if (element.shadowRoot) found.push(...queryAll(element.shadowRoot, selector));
      return found;
    };
    const parentOf = (element) => element.parentElement ?? (element.getRootNode() instanceof ShadowRoot ? element.getRootNode().host : null);
    const visibleAt = (x, y) => {
      let visible = document.elementFromPoint(x, y);
      while (visible?.shadowRoot) {
        const inner = visible.shadowRoot.elementFromPoint(x, y);
        if (!inner || inner === visible) break;
        visible = inner;
      }
      return visible;
    };
    const frame = document.querySelector("[data-stage-safe-area]");
    if (!frame) throw new Error("The active scene has no declared safe area.");
    const box = (rect) => ({ x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom });
    const safeArea = box(frame.getBoundingClientRect());
    const stage = document.querySelector(".presentation-stage");
    const authoredStage = document.querySelector(".reveal .slides");
    const stageArea = box(authoredStage.getBoundingClientRect());
    const controls = queryAll(document, "[data-controls-state] button, .react-flow__controls button").filter((element) => {
      const style = getComputedStyle(element);
      return style.visibility !== "hidden" && Number(style.opacity) !== 0 && element.getBoundingClientRect().width > 0;
    }).map((element) => ({ name: element.getAttribute("aria-label") ?? element.textContent, rect: box(element.getBoundingClientRect()) }));
    const targets = [...new Set([...queryAll(frame, "[data-measure], .scene-title, .react-flow__node, .react-flow__edge-text, .react-flow__edge-path, .graph-caption"), ...queryAll(document, "[role=tooltip]")])];
    const contains = (outer, inner) => inner.x >= outer.x - 1 && inner.y >= outer.y - 1 && inner.right <= outer.right + 1 && inner.bottom <= outer.bottom + 1;
    const intersects = (a, b) => Math.min(a.right, b.right) - Math.max(a.x, b.x) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) > 1;
    const measurements = [];
    const problems = [];
    for (const target of targets) {
      const style = getComputedStyle(target);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const name = target.dataset.measure ?? target.getAttribute("data-id") ?? target.getAttribute("role") ?? target.classList[0];
      const rects = [];
      if (target instanceof HTMLImageElement) {
        const rect = target.getBoundingClientRect();
        if (!target.complete || !target.naturalWidth) problems.push(`${name}: image is not decoded`);
        const scale = Math.min(rect.width / target.naturalWidth, rect.height / target.naturalHeight);
        const width = target.naturalWidth * scale;
        const height = target.naturalHeight * scale;
        rects.push({ x: rect.x + (rect.width - width) / 2, y: rect.y + (rect.height - height) / 2, width, height, right: rect.x + (rect.width + width) / 2, bottom: rect.y + (rect.height + height) / 2 });
        if (!["contain", "scale-down"].includes(style.objectFit)) problems.push(`${name}: meaningful image must retain its complete aspect`);
      } else {
        const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          if (!walker.currentNode.textContent.trim()) continue;
          if (walker.currentNode.parentElement.closest("select,option")) continue;
          const range = document.createRange();
          range.selectNodeContents(walker.currentNode);
          rects.push(...[...range.getClientRects()].filter((rect) => rect.width && rect.height).map(box));
        }
        if (!rects.length || target.matches("input,textarea,button,select,audio,video,svg,circle,rect")) rects.push(box(target.getBoundingClientRect()));
      }
      for (const rect of rects) {
        if (!contains(safeArea, rect)) problems.push(`${name}: meaningful content is outside safe area`);
        if (!contains(stageArea, rect)) problems.push(`${name}: meaningful content is outside stage`);
        for (const control of controls) if (intersects(rect, control.rect)) problems.push(`${name}: overlaps control ${control.name}`);
        for (let parent = parentOf(target); parent && parent !== stage; parent = parentOf(parent)) {
          const parentStyle = getComputedStyle(parent);
          if ([parentStyle.overflowX, parentStyle.overflowY].some((overflow) => ["hidden", "clip", "auto", "scroll"].includes(overflow)) && !contains(box(parent.getBoundingClientRect()), rect)) {
            problems.push(`${name}: meaningful content is clipped by an ancestor`);
          }
        }
      }
      // SVG hit-testing follows painted outlines; a hollow shape has no content at its center.
      let samples = rects.flatMap((rect) => [0.08, 0.5, 0.92].map((fraction) => ({ x: rect.x + rect.width * fraction, y: rect.y + rect.height / 2 })));
      if (target instanceof SVGGeometryElement && style.fill === "none" && target.getTotalLength() > 0) {
        const fractions = target.matches(".react-flow__edge-path") ? [0.08, 0.92] : [0.125, 0.375, 0.625, 0.875];
        samples = fractions.map((fraction) => {
          const point = target.getPointAtLength(target.getTotalLength() * fraction).matrixTransform(target.getScreenCTM());
          return { x: point.x, y: point.y, fraction };
        });
      }
      const restored = [];
      const pointerParticipation = (element, value) => {
        const original = element.style.getPropertyValue("pointer-events");
        const priority = element.style.getPropertyPriority("pointer-events");
        restored.push(() => original ? element.style.setProperty("pointer-events", original, priority) : element.style.removeProperty("pointer-events"));
        element.style.setProperty("pointer-events", value);
      };
      // XYFlow's label text opts out of pointer events, while its transparent edge hit-area opts in.
      // Temporarily remove only these hit-testing differences; painted foreground occluders still fail.
      if (target instanceof SVGElement && style.pointerEvents === "none") pointerParticipation(target, "all");
      if (target.matches(".react-flow__edge-path")) {
        for (const interaction of target.closest(".react-flow__edge").querySelectorAll(".react-flow__edge-interaction")) {
          if (getComputedStyle(interaction).strokeOpacity === "0") pointerParticipation(interaction, "none");
        }
      }
      const visibilitySamples = [];
      try {
        for (const sample of samples) {
          const visible = visibleAt(sample.x, sample.y);
          const visibleContent = Boolean(visible && (target.contains(visible) || visible.contains(target)));
          visibilitySamples.push({ ...sample, hit: visible?.tagName, visibleContent });
          if (visible && !visibleContent) problems.push(`${name}: meaningful content is occluded by ${visible.tagName.toLowerCase()}`);
        }
      } finally { restored.reverse().forEach((restore) => restore()); }
      const elementRect = target.getBoundingClientRect();
      const svgMatrix = target instanceof SVGElement ? target.getScreenCTM() : null;
      const scale = svgMatrix ? Math.hypot(svgMatrix.c, svgMatrix.d) : target instanceof HTMLElement && target.offsetWidth ? elementRect.width / target.offsetWidth : stageArea.width / authoredStage.clientWidth;
      measurements.push({ name, kind: target.tagName, rects, visibilitySamples, fontSize: style.fontSize, renderedFontSize: Number.parseFloat(style.fontSize) * scale, color: style.color, background: style.backgroundColor });
    }
    return { stage: stageArea, safeArea, controls, roundingToleranceCssPixels: 1, measurements, problems: [...new Set(problems)], viewport: { width: innerWidth, height: innerHeight }, screen: { width: screen.width, height: screen.height }, fullscreen: Boolean(document.fullscreenElement) };
  });
}
