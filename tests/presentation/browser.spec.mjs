const { test, expect } = await import(process.env.PRESENTATION_PLAYWRIGHT_MODULE ?? "@playwright/test");
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { measureContent } from "./measure.mjs";

const sceneOrder = ["context", "image", "focus", "graph", "animation", "delayed", "failure", "closing"];

async function open(page, query = "") {
  await page.goto(`/${query}`);
  await expect(page.locator(".presentation-stage")).toHaveAttribute("data-active-scene", "context");
  await expect(page.locator(".presentation-stage")).toHaveAttribute("data-engine-ready", "true");
  await page.evaluate(async () => { await document.fonts.ready; });
}

async function stage(page) {
  await page.locator(".presentation-stage").focus();
}

async function scene(page, id) {
  const current = await page.locator(".presentation-stage").getAttribute("data-active-scene");
  let iterations = 0;
  while (await page.locator(".presentation-stage").getAttribute("data-active-scene") !== id) {
    if (++iterations > 20) throw new Error(`Could not navigate from ${current} to ${id}.`);
    const active = await page.locator(".presentation-stage").getAttribute("data-active-scene");
    await stage(page);
    await page.keyboard.press(sceneOrder.indexOf(active) < sceneOrder.indexOf(id) ? "ArrowRight" : "ArrowLeft");
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }
}

async function controls(page) {
  await page.getByRole("button", { name: "Show presentation controls", exact: true }).click();
  await expect(page.locator("[data-controls-state]")).toHaveAttribute("data-controls-state", "visible");
}

async function capture(page, info, state) {
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.locator("img").evaluateAll(async (images) => { await Promise.all(images.map((image) => image.decode())); });
  await page.waitForFunction(() => {
    const active = document.querySelector(".reveal .slides > section.present");
    return active && Number(getComputedStyle(active).opacity) === 1 && !active.getAnimations({ subtree: true }).some((animation) => animation.playState === "running" && animation.effect.getComputedTiming().iterations !== Infinity);
  });
  const measured = await measureContent(page);
  const name = `${info.project.name}-${state}`;
  await writeFile(path.join(process.env.PRESENTATION_RUN, `bounds-${process.env.PRESENTATION_EXECUTION}-${name}.json`), `${JSON.stringify(measured, null, 2)}\n`, { flag: "wx" });
  await page.screenshot({ path: path.join(process.env.PRESENTATION_CAPTURES, `${name}.png`) });
  expect(measured.measurements.length, `${state} must measure actual content`).toBeGreaterThan(0);
  expect(measured.problems, `${state}: meaningful bounds and collisions`).toEqual([]);
  return measured;
}

async function signalX(page) {
  return page.locator("[data-measure=animation-target]").evaluate((element) => element.getBoundingClientRect().x);
}

async function graphGestures(page) {
  const graph = page.locator(".graph-stage");
  const transform = await page.locator(".react-flow__viewport").getAttribute("style");
  const graphBox = await graph.boundingBox();
  await page.mouse.move(graphBox.x + graphBox.width * 0.8, graphBox.y + graphBox.height * 0.7);
  await page.mouse.wheel(0, -300);
  await expect.poll(() => page.locator(".react-flow__viewport").getAttribute("style")).not.toBe(transform);
  const zoomed = await page.locator(".react-flow__viewport").getAttribute("style");
  await page.mouse.down();
  await page.mouse.move(graphBox.x + graphBox.width * 0.8 + 90, graphBox.y + graphBox.height * 0.7 + 30, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => page.locator(".react-flow__viewport").getAttribute("style")).not.toBe(zoomed);
  await expect(page.locator(".presentation-stage")).toHaveAttribute("data-active-scene", "graph");
}

test("T01/T09: complete copied template renders long composed text and full image", async ({ page }, info) => {
  await open(page);
  await expect(page.locator("[data-stage-safe-area] .scene-title")).toHaveCount(1);
  await expect(page.locator(".reveal .slides > section.stack")).toHaveCount(0);
  const markers = await page.locator(".slide-body ul").evaluateAll((lists) => lists.map((list) => getComputedStyle(list).listStyleType));
  expect(markers).toEqual(["disc", "disc"]);
  const frame = await capture(page, info, "context-idle");
  expect(frame.stage.width / frame.stage.height).toBeCloseTo(16 / 9, 2);
  await controls(page);
  await capture(page, info, "context-controls");
  await scene(page, "image");
  await expect(page.locator(".scene-title")).toHaveCount(1);
  const image = page.getByRole("img", { name: "Context, evidence, composition and delivery surround a meeting-ready decision" });
  await expect(image).toBeVisible();
  const dimensions = await image.evaluate((element) => ({ width: element.naturalWidth, height: element.naturalHeight }));
  expect(dimensions).toEqual({ width: 800, height: 600 });
  await capture(page, info, "image-complete");
  await open(page, "?ownedHeading=1");
  await scene(page, "image");
  await expect(page.locator(".scene-title")).toHaveCount(0);
  await expect(page.getByRole("img", { name: "Context, evidence, composition and delivery surround a meeting-ready decision" })).toBeVisible();
  await capture(page, info, "image-own-headline");
});

test("T03: native text fields and editable content retain Arrow/Space and caret behavior", async ({ page }) => {
  await open(page);
  await scene(page, "focus");
  const input = page.getByRole("textbox", { name: "Native input", exact: true });
  await input.fill("a");
  await input.press("End");
  await input.press("Space");
  await input.press("b");
  await expect(input).toHaveValue("a b");
  await input.press("ArrowLeft");
  await input.press("x");
  await expect(input).toHaveValue("a xb");
  const notes = page.getByRole("textbox", { name: "Native notes", exact: true });
  await notes.fill("alpha");
  await notes.press("End");
  await notes.press("Space");
  await notes.press("b");
  await expect(notes).toHaveValue("alpha b");
  await notes.press("ArrowLeft");
  await notes.press("x");
  await expect(notes).toHaveValue("alpha xb");
  const editable = page.getByRole("textbox", { name: "Editable note", exact: true });
  await editable.fill("a");
  await editable.press("End");
  await editable.press("Space");
  await editable.press("b");
  await expect(editable).toHaveText("a b");
  await editable.press("ArrowLeft");
  await editable.press("x");
  await expect(editable).toHaveText("a xb");
  await expect(page.locator(".presentation-stage")).toHaveAttribute("data-active-scene", "focus");
});

test("T04: buttons, native selectors, links and media own their focused keys", async ({ page }) => {
  await open(page);
  await scene(page, "focus");
  const action = page.getByRole("button", { name: "Record decision", exact: true });
  await action.focus();
  await action.press("Space");
  await expect(page.locator("#fixture-action-count")).toHaveText("1");
  await action.press("ArrowRight");
  const selector = page.getByRole("combobox", { name: "Native selector" });
  await selector.focus();
  await selector.press("ArrowDown");
  await selector.press("Enter");
  await expect(selector).toHaveValue("Second");
  await selector.press("Space");
  await selector.press("ArrowDown");
  await selector.press("Enter");
  await expect(selector).toHaveValue("Third");
  const link = page.getByRole("link", { name: "Meeting note", exact: true });
  await link.focus();
  await link.press("Enter");
  await expect(page.locator("#fixture-link-count")).toHaveText("1");
  await expect(page.locator("#focus-fragment-target")).toBeFocused();
  await expect(page).toHaveURL(/#focus-fragment-target$/);
  await page.goBack();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe("");
  await expect(page.locator(".presentation-stage")).toHaveAttribute("data-active-scene", "focus");
  const nativeInput = page.getByRole("textbox", { name: "Native input", exact: true });
  await nativeInput.focus();
  await expect(nativeInput).toBeFocused();
  await page.goForward();
  await expect(page).toHaveURL(/#focus-fragment-target$/);
  await expect(page.locator("#focus-fragment-target")).toBeFocused();
  await expect(page.locator(".presentation-stage")).toHaveAttribute("data-active-scene", "focus");
  await link.press("ArrowRight");
  const media = page.locator("audio[aria-label='Native media']");
  await media.focus();
  await media.press("Space");
  await expect.poll(() => media.evaluate((element) => element.paused)).toBe(false);
  await media.press("Space");
  await expect.poll(() => media.evaluate((element) => element.paused)).toBe(true);
  await media.press("ArrowRight");
  await expect(page.locator(".presentation-stage")).toHaveAttribute("data-active-scene", "focus");
});

test("T05: graph focus and pan/zoom retain graph ownership", async ({ page }) => {
  await open(page);
  await scene(page, "graph");
  const graph = page.locator(".graph-stage");
  await graph.focus();
  await graph.press("ArrowRight");
  await graph.press("Space");
  await expect(page.locator(".presentation-stage")).toHaveAttribute("data-active-scene", "graph");
  const node = page.locator(".react-flow__node[data-id=context-node]");
  await node.focus();
  const step = await page.locator("output[aria-label='Scene step']").textContent();
  await node.press("ArrowRight");
  await expect(node).toBeFocused();
  await expect(page.locator("output[aria-label='Scene step']")).toHaveText(step);
  await expect(page.locator(".presentation-stage")).toHaveAttribute("data-active-scene", "graph");
  await graphGestures(page);
});

test("T06: stage advances one scene step before slides and respects first/last limits", async ({ page }) => {
  await open(page);
  await stage(page);
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator(".presentation-stage")).toHaveAttribute("data-active-scene", "context");
  await scene(page, "graph");
  await stage(page);
  await expect(page.locator("output[aria-label='Scene step']")).toHaveText(/Step\s*1\s*\/\s*3/);
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("output[aria-label='Scene step']")).toHaveText(/Step\s*2\s*\/\s*3/);
  await page.keyboard.press("Space");
  await expect(page.locator("output[aria-label='Scene step']")).toHaveText(/Step\s*3\s*\/\s*3/);
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator("output[aria-label='Scene step']")).toHaveText(/Step\s*2\s*\/\s*3/);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".presentation-stage")).toHaveAttribute("data-active-scene", "animation");
  await scene(page, "closing");
  await stage(page);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Space");
  await expect(page.locator(".presentation-stage")).toHaveAttribute("data-active-scene", "closing");
});

test("T07: compact controls reveal, retain focus beyond inactivity and allow focus exit", async ({ page }, info) => {
  await open(page);
  const overlay = page.locator("[data-controls-state]");
  await page.mouse.move(1, 1);
  await expect(overlay).toHaveAttribute("data-controls-state", "hidden", { timeout: 7000 });
  const stageBox = await page.locator(".presentation-stage").boundingBox();
  await page.mouse.move(stageBox.x + stageBox.width - 12, stageBox.y + stageBox.height - 12);
  await expect(overlay).toHaveAttribute("data-controls-state", "visible");
  await page.mouse.move(1, 1);
  await stage(page);
  await page.keyboard.press("ArrowLeft");
  await expect(overlay).toHaveAttribute("data-controls-state", "visible");
  const next = page.getByRole("button", { name: "Next scene or step", exact: true });
  await next.focus();
  await page.waitForTimeout(3500);
  await expect(overlay).toHaveAttribute("data-controls-state", "visible");
  const focus = await next.evaluate((element) => { const style = getComputedStyle(element); return { outline: style.outlineStyle, width: style.outlineWidth }; });
  expect(focus.outline).not.toBe("none");
  expect(Number.parseFloat(focus.width)).toBeGreaterThan(0);
  await capture(page, info, "context-focused-controls");
  await scene(page, "focus");
  await controls(page);
  const show = page.getByRole("button", { name: "Show presentation controls", exact: true });
  await show.focus();
  await page.keyboard.press("Shift+Tab");
  expect(await page.evaluate(() => {
    let active = document.activeElement;
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
    return active?.closest("[data-controls-state]") !== null;
  })).toBe(false);
  await page.keyboard.press("Tab");
  await expect(show).toBeFocused();
});

test("T08: every graph highlight, label and explanation fits clear of compact controls", async ({ page }, info) => {
  await open(page);
  await scene(page, "graph");
  await controls(page);
  for (let step = 1; step <= 3; step++) {
    await expect(page.locator("output[aria-label='Scene step']")).toHaveText(new RegExp(`Step\\s*${step}\\s*\\/\\s*3`));
    const measured = await capture(page, info, `graph-step-${step}`);
    expect(measured.measurements.filter((entry) => entry.name.endsWith("-node"))).toHaveLength(3);
    expect(measured.measurements.filter((entry) => entry.name === "react-flow__edge-text")).toHaveLength(2);
    const edges = await page.locator(".react-flow__edge-path").evaluateAll((paths) => paths.map((edge) => edge.getTotalLength()));
    expect(edges).toHaveLength(2);
    expect(edges.every((length) => length > 0), "The complete diagram retains its actual connecting edges").toBe(true);
    if (step < 3) await page.getByRole("button", { name: "Next scene or step", exact: true }).click();
  }
  for (const id of ["context-node", "evidence-node", "decision-node"]) {
    await page.locator(`.react-flow__node[data-id=${id}]`).hover();
    const explanations = {
      "context-node": "The meeting objective gives this evidence a purpose.",
      "evidence-node": "Behavior is examined before a development decision.",
      "decision-node": "The decision states the next useful change.",
    };
    await expect(page.locator(".graph-caption")).toHaveText(explanations[id]);
    const measured = await capture(page, info, `graph-tooltip-${id}`);
    expect(measured.measurements.some((entry) => entry.name === "status")).toBe(true);
  }
  await page.mouse.move(1, 1);
  await page.locator(".react-flow__node[data-id=context-node]").focus();
  await expect(page.locator(".graph-caption")).toHaveText("The meeting objective gives this evidence a purpose.");
  await capture(page, info, "graph-keyboard-explanation");
});

test("T10: actual registered target plays, pauses, restarts and completes", async ({ page }, info) => {
  await open(page, "?semanticAnimation=1");
  await scene(page, "animation");
  await expect(page.locator(".reveal .slides > section.stack")).toHaveCount(0);
  await controls(page);
  const play = page.getByRole("button", { name: "Play animation", exact: true });
  await expect(play).toBeEnabled();
  const initial = await signalX(page);
  await capture(page, info, "animation-initial");
  await play.click();
  await expect.poll(() => signalX(page)).toBeGreaterThan(initial + 35);
  await page.getByRole("button", { name: "Pause animation", exact: true }).click();
  const paused = await signalX(page);
  await page.waitForTimeout(250);
  expect(await signalX(page)).toBeCloseTo(paused, 1);
  await capture(page, info, "animation-paused-intermediate");
  await page.getByRole("button", { name: "Restart animation", exact: true }).click();
  expect(await signalX(page)).toBeLessThan(paused);
  await page.getByRole("button", { name: "Play animation", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.fixtureLifetimes.signal.timeline.progress())).toBe(1);
  await expect(play).toBeVisible();
  expect(await signalX(page)).toBeGreaterThan(initial + 300);
  await capture(page, info, "animation-complete");
});

test("T11: StrictMode deactivation disposes the real timeline and revisits once", async ({ page }, info) => {
  await open(page);
  await scene(page, "animation");
  if (info.project.name === "strict-mode") {
    expect(await page.evaluate(() => window.fixtureLifetimes.signal.created)).toBeGreaterThanOrEqual(2);
    expect(await page.evaluate(() => window.fixtureLifetimes.signal.created - window.fixtureLifetimes.signal.disposed)).toBe(1);
  }
  await controls(page);
  await page.getByRole("button", { name: "Play animation", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.fixtureLifetimes.signal.timeline.progress())).toBeGreaterThan(0);
  await scene(page, "delayed");
  const inactive = await page.evaluate(() => ({ progress: window.fixtureLifetimes.signal.timeline.progress(), active: window.fixtureLifetimes.signal.timeline.isActive(), created: window.fixtureLifetimes.signal.created, disposed: window.fixtureLifetimes.signal.disposed, registered: window.fixtureLifetimes.signal.registered, unregistered: window.fixtureLifetimes.signal.unregistered, updates: window.fixtureLifetimes.signal.updates }));
  expect(inactive.active).toBe(false);
  expect(inactive.disposed).toBe(inactive.created);
  expect(inactive.unregistered).toBe(inactive.registered);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.fixtureLifetimes.signal.timeline.progress())).toBe(inactive.progress);
  expect(await page.evaluate(() => window.fixtureLifetimes.signal.updates)).toBe(inactive.updates);
  await scene(page, "animation");
  await expect.poll(() => page.evaluate(() => window.fixtureLifetimes.signal.created - window.fixtureLifetimes.signal.disposed)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.fixtureLifetimes.signal.registered - window.fixtureLifetimes.signal.unregistered)).toBe(1);
  const x = await signalX(page);
  await stage(page);
  await page.keyboard.press("ArrowRight");
  expect(await signalX(page)).toBeGreaterThan(x + 150);
  await expect(page.locator(".presentation-stage")).toHaveAttribute("data-active-scene", "animation");
});

test("T12: initial and dynamic reduced motion retain stable explicit explanation", async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, "?semanticAnimation=1");
  await scene(page, "animation");
  await controls(page);
  const initial = await signalX(page);
  await page.waitForTimeout(200);
  expect(await signalX(page)).toBe(initial);
  await expect(page.getByRole("button", { name: "Play animation", exact: true })).toBeDisabled();
  expect(await page.evaluate(() => window.fixtureLifetimes.signal.timeline.isActive())).toBe(false);
  await stage(page);
  await page.keyboard.press("ArrowRight");
  await capture(page, info, "animation-reduced-explicit-step");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await controls(page);
  await page.getByRole("button", { name: "Play animation", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.fixtureLifetimes.signal.timeline.isActive())).toBe(true);
  const registered = await page.evaluate(() => ({ created: window.fixtureLifetimes.signal.created, registered: window.fixtureLifetimes.signal.registered }));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".presentation-stage")).toHaveAttribute("data-reduced-motion", "true");
  await expect.poll(() => page.evaluate(() => window.fixtureLifetimes.signal.timeline.paused())).toBe(true);
  expect(await page.evaluate(() => ({ created: window.fixtureLifetimes.signal.created, registered: window.fixtureLifetimes.signal.registered }))).toEqual(registered);
  const frozen = await signalX(page);
  await page.waitForTimeout(150);
  expect(await signalX(page)).toBeCloseTo(frozen, 1);
  await expect(page.locator(".reveal .slides > section.stack")).toHaveCount(0);
  await capture(page, info, "animation-dynamic-reduced");
  await scene(page, "graph");
  expect(await page.locator(".react-flow__edge.animated").count()).toBe(0);
  await expect(page.locator(".reveal")).toHaveClass(/\bnone\b/);
  const transitions = await page.locator(".reveal .slides > section").evaluateAll((sections) => sections.map((section) => ({ transition: getComputedStyle(section).transitionDuration, animation: getComputedStyle(section).animationDuration })));
  expect(transitions.length).toBeGreaterThan(0);
  expect(transitions.every((duration) => duration.transition === "0s" && duration.animation === "0s")).toBe(true);
  await capture(page, info, "graph-reduced");
});

test("T13: actual fullscreen preserves scene, controls and meaningful bounds through exit", async ({ page }, info) => {
  await open(page);
  await scene(page, "graph");
  await controls(page);
  await page.getByRole("button", { name: "Next scene or step", exact: true }).click();
  await page.getByRole("button", { name: "Enter fullscreen", exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await expect(page.locator("output[aria-label='Scene step']")).toHaveText(/Step\s*2\s*\/\s*3/);
  await capture(page, info, "graph-fullscreen");
  await page.getByRole("button", { name: "Exit fullscreen", exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
  await expect(page.locator(".presentation-stage")).toHaveAttribute("data-active-scene", "graph");
  await expect(page.locator("output[aria-label='Scene step']")).toHaveText(/Step\s*2\s*\/\s*3/);
  await capture(page, info, "graph-fullscreen-exit");
});

test("T14/T15: contextual tokens and alternate project aspect reach actual scenes and controls", async ({ page }, info) => {
  await open(page, "?theme=earth&format=4:3");
  await controls(page);
  const content = await capture(page, info, "context-earth-4x3");
  expect(content.stage.width / content.stage.height).toBeCloseTo(4 / 3, 2);
  const titleStyle = await page.locator(".scene-title").evaluate((element) => ({ color: getComputedStyle(element).color, font: getComputedStyle(element).fontFamily }));
  expect(titleStyle.color).toBe("rgb(48, 44, 35)");
  expect(titleStyle.font).toContain("Georgia");
  const buttonStyle = await page.getByRole("button", { name: "Next scene or step", exact: true }).evaluate((element) => getComputedStyle(element).color);
  expect(buttonStyle).toBe("rgb(48, 44, 35)");
  expect(await page.getByRole("button", { name: "Next scene or step", exact: true }).evaluate((element) => getComputedStyle(element).fontFamily)).toContain("Georgia");
  await scene(page, "graph");
  const nodeStyle = await page.locator(".react-flow__node").first().evaluate((element) => getComputedStyle(element).color);
  expect(nodeStyle).toBe("rgb(48, 44, 35)");
  expect(await page.locator(".react-flow__node").first().evaluate((element) => getComputedStyle(element).fontFamily)).toContain("Georgia");
  await capture(page, info, "graph-earth-4x3");
  await graphGestures(page);
  await scene(page, "animation");
  await capture(page, info, "animation-earth-4x3");
});

test("T18: transport waits for actual registration and keeps failure navigation usable", async ({ page }, info) => {
  await open(page);
  await scene(page, "delayed");
  await controls(page);
  const play = page.getByRole("button", { name: "Play animation", exact: true });
  await expect(play).toBeDisabled();
  await capture(page, info, "animation-loading");
  await expect(play).toBeEnabled();
  await play.click();
  await expect.poll(() => page.evaluate(() => window.fixtureLifetimes.delayed.timeline.progress())).toBeGreaterThan(0);
  await scene(page, "failure");
  await expect(page.getByText("The synthetic animation asset could not load.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Play animation", exact: true })).toBeDisabled();
  await capture(page, info, "animation-error");
  await stage(page);
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".presentation-stage")).toHaveAttribute("data-active-scene", "closing");
});

test("ORACLE: bounds reject deliberate overflow and occluded meaningful text", async ({ page }) => {
  await open(page);
  await page.locator(".slide-body").evaluate((body) => {
    const target = document.createElement("span");
    target.dataset.measure = "deliberate-overflow";
    target.textContent = "This essential content must not be accepted outside the stage";
    target.style.cssText = "position:fixed;left:-100px;top:2px;white-space:nowrap";
    body.append(target);
  });
  expect((await measureContent(page)).problems.some((problem) => problem.startsWith("deliberate-overflow: meaningful content is outside"))).toBe(true);
  await page.locator("[data-measure=deliberate-overflow]").evaluate((element) => element.remove());
  await page.locator("[data-measure=dense-introduction]").evaluate((target) => {
    const blocker = document.createElement("div");
    blocker.id = "deliberate-blocker";
    const rect = target.getBoundingClientRect();
    blocker.style.cssText = `position:fixed;left:${rect.x}px;top:${rect.y}px;width:${rect.width}px;height:${rect.height}px;background:black;z-index:2147483647`;
    document.body.append(blocker);
  });
  expect((await measureContent(page)).problems.some((problem) => problem.startsWith("dense-introduction: meaningful content is occluded"))).toBe(true);
  await page.locator("#deliberate-blocker").evaluate((element) => element.remove());
  await scene(page, "graph");
  await page.waitForFunction(() => Number(getComputedStyle(document.querySelector(".reveal .slides > section.present")).opacity) === 1);
  await page.locator(".react-flow__edge-text").first().evaluate((label) => {
    const blocker = document.createElement("div");
    const rect = label.getBoundingClientRect();
    blocker.style.cssText = `position:fixed;left:${rect.x}px;top:${rect.y}px;width:${rect.width}px;height:${rect.height}px;background:black;z-index:2147483647`;
    document.body.append(blocker);
  });
  expect((await measureContent(page)).problems.some((problem) => problem.startsWith("react-flow__edge-text: meaningful content is occluded by div"))).toBe(true);
});
