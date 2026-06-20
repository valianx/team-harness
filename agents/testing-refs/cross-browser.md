# Testing Reference: Cross-Browser Testing

> Loaded on demand by the `tester` agent via the Reference Router **only when `cross_browser: true`
> is present in the dispatch payload**. This file is an AXIS reference — it is loaded ALONGSIDE
> the warranted `e2e` or `browser-mode` reference, never as the sole warranted type.
> Stack-agnostic principles first, then per-stack sections keyed `## <stack>`.

## Principles

**Cross-browser testing** means running ONE test suite (or one coordinated set of assertions) across
multiple browser engines and branded browser channels so that regressions visible only in a specific
engine surface before they reach production.

Key definitional points:

- Cross-browser is an **axis over** the existing e2e and browser-mode test types, not a fourth test
  type. The selector hierarchy, assertion discipline, fixture patterns, and per-engine mechanics you
  already know from `e2e.md` and `browser-mode.md` still apply. This reference adds only what is
  uniquely cross-engine: the browser model, which channels are real, the grid path for coverage
  that Playwright cannot provide locally, device emulation, CI cost strategy, skip annotations, and
  the failure-mode catalog.
- **Strictly opt-in.** Cross-browser coverage is never the default. The default CI target for any
  Playwright or Vitest browser-mode suite is **chromium only**. The full engine or channel matrix
  is activated on demand via the `/th:test-cross-browser` skill (the sole producer of
  `cross_browser: true`) or an explicit CI schedule / `cross-browser` PR label — never by default.
- Cross-link discipline: detection mechanics (screenshots, baselines, viewport control) are owned by
  the existing references and are **pointed to here, not re-documented**. See
  `agents/testing-refs/visual.md` for screenshot/baseline mechanics and the platform-suffix caveat.
  See `agents/testing-refs/e2e.md` § "Responsive assertions in E2E" and
  `agents/testing-refs/browser-mode.md` § "Viewport control" for viewport-control mechanics.

---

## Honest browser model

Playwright does NOT run all popular browsers natively. Understanding what it actually provides
prevents fabricated test plans.

### The three native engines

| Engine | Approximates | Playwright project `use` |
|--------|--------------|--------------------------|
| Chromium | Chrome, Edge, Brave, Opera, Vivaldi, Samsung Internet family | `...devices['Desktop Chrome']` |
| Firefox (Gecko) | Mozilla Firefox | `...devices['Desktop Firefox']` |
| WebKit | Safari — **approximation only, NOT real Safari** | `...devices['Desktop Safari']` |

These are bundled by Playwright; they run headless on any OS and need no additional install beyond
`npx playwright install`.

### Verified branded Chromium channels

Running a **real local Chrome or Edge install** (as opposed to the bundled Chromium) is done via the
`channel:` option. The complete verified list:

```
chrome  chrome-beta  chrome-dev  chrome-canary
msedge  msedge-beta  msedge-dev  msedge-canary
```

Use `channel:` inside a project's `use:` block:

```typescript
{ name: 'chrome-stable', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }
{ name: 'edge-stable',   use: { ...devices['Desktop Edge'],   channel: 'msedge' } }
```

The browser must be installed on the machine; Playwright does not download branded channels.

### Popular browser → engine → how to run

| Browser | Underlying engine | How Playwright runs it | Caveat |
|---------|-------------------|------------------------|--------|
| Google Chrome | Chromium | bundled `chromium` engine, or `channel: 'chrome'` (real install) | — |
| Microsoft Edge | Chromium | `channel: 'msedge'` (+ `...devices['Desktop Edge']`) | requires real Edge install |
| Brave | Chromium-based | run on bundled `chromium` engine — **not an official `channel:`** | Brave Shields, fingerprint-protection and brand features are not reproduced |
| Opera | Chromium-based | run on bundled `chromium` engine — not an official `channel:` | brand features not reproduced |
| Vivaldi | Chromium-based | run on bundled `chromium` engine — not an official `channel:` | brand UI not reproduced |
| Samsung Internet | Chromium family | run on bundled `chromium` engine | brand/mobile specifics not reproduced |
| Mozilla Firefox | Gecko | bundled `firefox` engine | — |
| Safari (desktop) | WebKit | bundled `webkit` engine — **approximates Safari, is NOT real Safari** | real macOS Safari / iOS Safari require the cloud grid |

**Brave, Opera, and Vivaldi** are Chromium-based but are **not official Playwright channels** — you
cannot specify them via `channel:`. Running your suite on `chromium` covers the engine; it does not
reproduce any brand-specific behavior (Shields, theme, etc.).

### Cloud device grid

**For what Playwright cannot cover locally.** Real Safari on macOS/iOS, real Brave/Opera/Vivaldi
brand behavior, real mobile devices, and OS-specific rendering combinations require a remote grid.

Playwright connects to a remote grid via `connectOptions.wsEndpoint` (project-level) or
`browserType.connect({ wsEndpoint })`. The common providers (**BrowserStack**, **Sauce Labs**,
**LambdaTest**) expose this mechanism.

```typescript
// playwright.config.ts — cloud grid project
{
  name: 'safari-ios-grid',
  use: {
    connectOptions: { wsEndpoint: process.env.GRID_WS_ENDPOINT },
    ...devices['iPhone 12'],
  },
}
```

**Explicit local-vs-grid line:** engines and branded channels run locally; brand-specific,
OS-specific, and real-device coverage run via the grid. Grid credentials are operator-supplied
environment variables — never embedded in code or config files.

### Device emulation

**Cheap mobile approximation, distinct from the grid.** Verified descriptors:

```typescript
{ name: 'pixel5-mobile',  use: { ...devices['Pixel 5'] } }
{ name: 'iphone12-mobile', use: { ...devices['iPhone 12'] } }
```

These set viewport, user-agent, and touch emulation locally — an approximation of mobile layout.
They are NOT a real-device test. Real-device fidelity requires the grid.

---

## Browser × resolution matrix

The same component or flow checked across {engines + channels} × {breakpoint viewports} catches
elements that overflow, clip, or move off-screen at a specific breakpoint IN a specific engine — the
"disappears off-screen" class of bug that single-engine testing misses.

**Recommended breakpoint set** (start small; the full Cartesian product multiplies run count fast):

| Label | Approximate width | Representative device |
|-------|-------------------|-----------------------|
| mobile | ~375 px | iPhone SE, Pixel |
| tablet | ~768 px | iPad portrait |
| desktop | ~1280 px | Standard laptop |

**Detection approach:**

1. **Primary** — per-browser × per-viewport **visual snapshots** (`toHaveScreenshot`). Cross-link
   `visual.md` Option B/C for mechanics and the **platform-suffix caveat** — do NOT re-document
   them here.
2. **Plus** explicit **programmatic assertions** for the off-screen class:
   - `await expect(locator).toBeVisible()` — fails deterministically for an off-screen element.
   - Bounding-box-within-viewport check:
     ```typescript
     const box = await locator.boundingBox()
     const viewport = page.viewportSize()!
     expect(box!.x).toBeGreaterThanOrEqual(0)
     expect(box!.y).toBeGreaterThanOrEqual(0)
     expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width)
     expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height)
     ```
   This assertion makes an element pushed off-screen **fail deterministically**, rather than passing
   a snapshot diff whose threshold tolerates the shift.

**Cost awareness.** The full {browser × viewport} product is `(engines + channels) × breakpoints`.
Pick a representative subset — not the full Cartesian product — on every PR. The "When NOT to go
full-matrix" section below applies here too.

For viewport-control mechanics, cross-link to `e2e.md` § "Responsive assertions in E2E"
(`page.setViewportSize`, `devices`) and `browser-mode.md` § "Viewport control" (`page.viewport(w,h)`)
— do NOT re-document them here.

---

## Third-party UI library review

Before writing the cross-browser test plan, the tester should:

1. **Inventory UI libraries** from `package.json` that own rendering or positioning: date pickers,
   modal / popover / `floating-ui` / `@popperjs`, carousels, charting libraries (recharts, chart.js,
   d3), rich-text editors (tiptap, slate, quill), virtualized lists (react-window, react-virtuoso).
2. **Consult each library's documented browser-support matrix** (its own docs / context7) before
   assuming cross-engine coverage. Do not assume a library supports every engine.
3. **Prioritize cross-browser tests on components built on these libraries** — they are the
   highest-yield breakage sites because they are runtime-positioned and engine-API-sensitive.
   Floating-UI / Popper-based components are the canonical example: `flip()`, `shift()`, `autoUpdate`
   timing diverges per engine, making dropdown calendars and popovers the most common class of
   "works in Chrome, broken in Safari" reports.
4. **Surface unsupported-browser findings** in `03-testing.md` rather than silently passing. If a
   library's docs state no WebKit support, that is a reported finding — not a skipped test.

---

## Known cross-browser failure modes

> **Methodology floor** — nothing in this catalog is a permanent "browser X breaks Y". Engine
> versions, UA stylesheets, and CSS feature support shift every release cycle. Treat every entry as
> "this is the class of thing that looks fine in Chrome and breaks elsewhere — **verify per engine
> on your actual target version matrix, do not assume**." CSS feature entries explicitly say
> "verify current support per engine at author time."
>
> **Detection column key:** `V` = visual snapshot; `P` = programmatic assertion; `V+P` = both.
>
> **Operator anchor case** — the canonical worked example spans two families and must stay
> visibly connected: the **rendering half** (a native `<input type="date">` calendar that may
> render fully only in the Chrome family — Family 1) and the **positioning half** (a JS
> date-picker/popover built on floating-ui/popper that flips, clips, or renders off-screen at a
> constrained viewport or gets trapped behind a stacking context — Family 2). When you encounter
> "our date picker works in Chrome but is broken in Safari", first check Family 1 (is this the
> native control at all?), then Family 2 (is it a floating-UI positioning failure?).
>
> The exhaustive 76-category source lives in the workspace sketch
> `sketches/cross-browser-failure-catalog.md`; this section is its curated rendering.

---

### Family 1 — Form controls & inputs

Native UA-rendered controls diverge the most: each engine ships its own widget chrome,
pseudo-elements, and OS delegation. Verify per engine. Focus-ring divergence (`:focus-visible`
heuristic, ring rendering) belongs here; dark-mode UA theming cross-links to Family 9.

| Category | Symptom | Concrete example | Detection | Cross-link |
|---|---|---|---|---|
| **Native date/time picker UI** *(operator anchor — rendering half)* | The calendar/time popup, keyboard depth, ARIA hooks, and whether a picker renders at all vs degrades to a text field differ per engine. A `type="date"` may present a full dropdown calendar only in the Chrome family. | `datetime-local` shows a combined popup in Chrome/Edge; Firefox may omit the time sub-panel; older Safari pickers may lack keyboard nav / ARIA hooks Chrome exposes. | V+P: snapshot per browser/OS; assert `.showPicker()` opens vs throws/no-ops; assert `.value` non-empty after simulated fill. | visual.md (positioning half → Family 2) |
| **`input[type=month]`/`type=week` → text degradation** | Unsupported engines silently reset the type to plain text — no widget. | A `type="month"` payment-date field shows a spinner in one engine and a blank text box in another. | P: read `element.type` after DOM insertion (unsupported → `"text"`); pair with V snapshot. | visual.md |
| **`select` closed-state appearance & open-list styling** | Box dimensions, border, arrow, and open-list styling differ per engine/OS. `border-radius` ignored by macOS Safari without `-webkit-appearance:none`. | Country selector renders with different border/arrow per engine; open option list ignores `background-color` on macOS Safari. | V: snapshot per browser/OS pair — no reliable programmatic assertion for UA appearance. | visual.md |
| **`input[type=color]` picker and swatch** | Picker UI, eyedropper presence, click-count to open, and vendor pseudo-elements (`::-webkit-color-swatch`/`::-moz-color-swatch`) differ. | One engine opens an inline hue panel on single click; another opens the OS color dialog. | V+P: snapshot per engine; assert focus-via-Tab where a11y is in question. | visual.md |
| **`input[type=range]` track/thumb pseudo-elements** | Styling needs separate vendor selectors; `appearance:none` is a prerequisite; default tint follows `accent-color` (→ Family 9). | A slider styled only with `::-webkit-` rules falls back to the OS thumb in Gecko. | V: snapshot per engine. | visual.md; Family 9 |
| **`input[type=number]` spinner rendering/hiding** | Spin buttons show on hover / always / never per engine and device. | A quantity field shows persistent arrows in one engine, hover-only in another, none on iOS. | V: snapshot per engine/device. | visual.md |
| **`input[type=file]` button label and pseudo-element** | Button label, border/radius, post-selection text, and the button pseudo-element (`::file-selector-button` vs `::-webkit-file-upload-button`) diverge. | Post-pick text shows filename vs full path depending on engine. | V+P: snapshot; assert `input.files[0].name` non-empty after simulated selection. | visual.md |
| **`::placeholder` opacity/color defaults** | UA defaults for placeholder opacity differ; some engines historically applied reduced opacity. | An unstyled placeholder is faint in one engine — a one-engine a11y failure. | V: snapshot per engine (pseudo-element computed values not directly readable). | visual.md |
| **Autofill styling — background injection** | WebKit/Blink inject a pale background via `:-webkit-autofill` with `!important`; the standard `:autofill` (Firefox) is easier to override. | A dark-theme input turns bright on autofill in one engine. | V: snapshot after triggering autofill; inset `box-shadow` is the common workaround. | visual.md; Family 9 |
| **Constraint-validation bubble** | The native validation tooltip has no CSS hooks; shape, position, and whether it renders off-screen near a viewport edge differ per engine. | Required-email failure shows a dark tooltip in one engine, nothing on some iOS. | V+P: snapshot after failed submit; assert `element.validationMessage` non-empty. | visual.md |
| **`:focus` vs `:focus-visible` heuristic & focus-ring rendering** | Engines apply different heuristics for when `:focus-visible` matches (keyboard vs pointer vs scripted `.focus()`). Default ring shape/offset and `outline-style:auto` differ. | A custom button shows a ring after mouse-click in Chrome but only after Tab in Firefox. | V+P: drive focus three ways (Tab, mouse, scripted) and assert `el.matches(':focus-visible')` per engine; snapshot the ring; assert a non-zero-width outline is present. | visual.md; Family 8 |

---

### Family 2 — Floating UI & scrolling

Positioning middleware (flip/shift/autoUpdate) and scroll behaviors are sensitive to per-engine
measurement timing, sub-pixel snapping, and viewport models. Scroll-snap and overscroll-behavior
live here. Stacking-context root causes live in Family 3 (cross-linked below).

| Category | Symptom | Concrete example | Detection | Cross-link |
|---|---|---|---|---|
| **Floating dropdown/calendar panel — trapped, clipped, or off-screen** *(operator anchor — positioning half)* | A popover/calendar built on floating middleware can render off-screen, clipped by an `overflow` ancestor, or trapped below a modal because flip/shift timing, containing-block resolution, or a silent stacking context (`transform`, `will-change`) behaves differently across engines. | A calendar clips below the fold in one engine because `flip()` fired a tick late; or it sits behind a modal because an ancestor `transform:translateZ(0)` capped its z-index. | V+P: snapshot at the edge/overlay trigger; assert all four floating-rect edges are within the visual viewport / clipping ancestor; assert panel and modal are siblings in the same portal root. | visual.md; Family 3 |
| **Sub-pixel rounding 0.5px misalignment (HiDPI)** | On fractional CSS coordinates, engines snap sub-pixels differently on HiDPI — visible anchor↔floater gap/overlap. | A tooltip arrow points ~1px off a button edge on Retina in one engine, aligned in another. | V+P: snapshot at 2× DPR; assert `abs(refRect.right - floatRect.left) < 1/devicePixelRatio`. | visual.md; Family 4 |
| **Disappearing/doubled 1px hairline borders (subpixel collapse)** | Thin borders/gridlines disappear, double, or render at uneven weight depending on fractional element offsets, DPR, and per-engine box-edge snapping. | A 1px row separator in a transaction list vanishes on odd rows in one engine at DPR 1.5. | V+P: render at DPR 1/1.5/2 and at 110%/125% zoom; pixel-diff to detect missing/doubled hairlines. | visual.md; Family 4 |
| **iOS virtual keyboard shrinks only the visual viewport** | On iOS, focusing an input shrinks the visual (not layout) viewport; `getBoundingClientRect()`-based positioning becomes stale. | An open combobox scrolls partly off-screen after the keyboard slides up on iOS. | V+P: snapshot after keyboard shown; assert floating rect stays within `visualViewport.height`. | browser-mode.md; visual.md |
| **Floating element clipped by `overflow` ancestor** | `strategy:'absolute'` is clipped by any `overflow:hidden/auto/scroll` ancestor; `strategy:'fixed'` escapes most but can itself be clipped if a containing block (`transform`/`will-change`) sets overflow. | A date-picker panel disappears behind a scrollable modal in one engine. | V+P: snapshot with floater open inside an `overflow:auto` container; assert no corner of the floating rect is outside the clipping ancestor's rect. | visual.md |
| **Scrollbar model: overlay vs classic (gutter shift)** | macOS/iOS default to overlay scrollbars (zero layout space); Windows/Linux to classic (occupy a gutter). Toggling overflow causes layout shift only on classic-scrollbar platforms. | A modal jumps ~15px when a classic scrollbar appears on one OS but is stable on macOS. | V+P: snapshot on both OS types; assert `offsetWidth` delta is 0 when `scrollbar-gutter:stable` is applied. | visual.md; browser-mode.md |
| **scroll-snap + programmatic smooth scroll conflict** | `scrollTo({behavior:'smooth'})` on a snap container can over-/under-shoot to a wrong snap point in some engines. | A `scrollBy({behavior:'smooth'})` carousel lands one slide off in one engine. | V+P: snapshot mid-animation and at rest; assert settled `scrollLeft` within 1px of expected snap position. | e2e.md; visual.md |
| **`overscroll-behavior` — scroll chaining / pull-to-refresh** | `overscroll-behavior:none/contain` suppresses chaining; some older mobile builds ignored it. | A bottom-sheet with `contain` locks scroll in some engines but the page behind scrolls through on an older iOS build. | V+P: snapshot after scroll-to-boundary gesture; assert `window.scrollY` unchanged. | browser-mode.md; visual.md |

---

### Family 3 — Layout: flex / grid / positioning / stacking

Owns the root causes other families reference: silent stacking-context creation, `position:fixed`
containing-block hijacks, and subgrid sizing. Many entries here are spec-mandated (reproduce
identically across engines) — flagged as such.

| Category | Symptom | Concrete example | Detection | Cross-link |
|---|---|---|---|---|
| **`position:fixed` containing-block hijack under transform/filter/will-change** | Any ancestor with `transform`/`filter`/`perspective`/`will-change` becomes the containing block; "fixed" elements scroll with that ancestor. | A `position:fixed` cookie banner inside a `transform:translateZ(0)` section scrolls with the section in all modern engines. | V+P: assert `getBoundingClientRect().top` is constant across `scrollY`; snapshot before/after scroll. | e2e.md |
| **`position:sticky` neutralized by `overflow` ancestor** *(spec-mandated)* | Sticky sticks to its nearest scrollable ancestor; any `overflow:hidden/scroll/auto` ancestor captures it. `overflow:clip` does not create a scroll container. | A sticky table header inside an `overflow:hidden` card never sticks. | V+P: assert sticky `getBoundingClientRect().top` stays at declared offset during parent scroll; snapshot. | e2e.md |
| **Silent stacking-context creation — z-index scope trap** *(root cause for Family 2 trapping)* | `opacity<1`, any `filter`, `transform`, `backdrop-filter`, `clip-path`, `isolation`, `will-change`, `container-type` create a stacking context; descendant `z-index` becomes local. | A calendar gains `filter:drop-shadow(...)`; the new context traps it behind a fixed header. | V+P: snapshot; `document.elementsFromPoint(x,y)` at the dropdown's coords and assert dropdown is topmost. | visual.md |
| **`aspect-ratio` ignored under stretch / both-dims-set** | `aspect-ratio` is ignored when both width and height are set (incl. `align-items:stretch`); some engines evaluate `max-height:100%` before the ratio resolves. | A `16/9` wrapper with `max-height:100%` collapses to height 0 in one engine. | V+P: assert `offsetHeight > 0` and `offsetWidth/offsetHeight ≈ ratio` per engine; snapshot. | visual.md |
| **`overflow` + `border-radius` fails to clip composited descendants** | A rounded container with `overflow:hidden` fails to clip a child that is animating or has `transform`/`will-change`. Classic/recurring WebKit issue. | A spinning loader inside a `border-radius:12px; overflow:hidden` card shows square corners in Safari. | V: snapshot per engine; sample corner pixels and assert they are the background color. | visual.md |
| **CSS subgrid — gap inheritance & auto-sizing** | Subgrid inherits parent gap; auto-row sizing and named-line resolution diverged in earlier versions. Deeply nested subgrids may resolve line names inconsistently. | A subgrid card's rows size to its own content in one engine while older builds collapsed auto rows. | V+P: snapshot per engine; assert `getBoundingClientRect()` of cells matches expected (e.g., equal sibling heights). | visual.md |

---

### Family 4 — Typography, fonts & viewport units

Mostly **visual-snapshot-driven** — metric and antialiasing differences are structural, not
catchable programmatically without font-ID tooling. Viewport-unit entries are device-driven.
`text-overflow:ellipsis` failure in flex → Family 3; hairline border collapse → Family 2.

| Category | Symptom | Concrete example | Detection | Cross-link |
|---|---|---|---|---|
| **Antialiasing / subpixel rendering** | Text appears heavier/lighter per engine+OS; `-webkit-font-smoothing` affects only macOS. | A web-font heading renders bolder on macOS than Windows at the same pixel size. | V: snapshot per engine+OS; pixel-diff a text-heavy element. | visual.md |
| **Transform / compositing sub-pixel text blur** | Text inside a non-integer `translate`, `scale`, or `translateZ(0)` promotion becomes blurry on some engines/DPRs. Affects modals, centered overlays, and scale-hover. | A modal title centered with `translate(-50%,-50%)` is crisp in Chrome but visibly soft in Safari at DPR 1. | V: snapshot the element at DPR 1 and 2; pixel-diff against an untransformed baseline using edge-contrast. | visual.md |
| **`100vh` overflow on mobile (browser chrome)** | `100vh` computes to the max (toolbar-hidden) viewport, clipping a `100vh` element when the address bar is shown. | A `height:100vh` hero is clipped by the mobile address bar on first load. | V+P: assert `clientHeight` vs `innerHeight` differ at load; snapshot the fold; verify `svh`/`dvh` on target OS. | e2e.md |
| **`svh`/`dvh`/`lvh` divergence & mobile WebKit quirk** | `svh` and `dvh` were observed equal in some mobile builds; `dvh` elements didn't update dynamically. | A `dvh` element stays fixed instead of expanding when the toolbar collapses on affected builds. | V+P: simulate toolbar collapse and assert a `dvh` element's `offsetHeight` increases; snapshot before/after. | e2e.md |
| **Fallback-font metric mismatch → swap layout shift** | Web font and fallback differ in ascent/descent/line-gap; swap reflows surrounding elements; shift magnitude differs per engine+OS (HHead vs Win metrics). | A `font-display:swap` paragraph reflows ~40px on one OS due to different metric tables. | V: snapshot before/after font load; assert height delta within threshold. | visual.md |
| **`hyphens:auto` dictionary / break-point divergence** | Requires both CSS support and a language dictionary; engines break the same text at different syllable points, changing line count and element height. `lang` attribute is mandatory. | A German paragraph wraps to 4 lines in one engine, 5 in another. | V: snapshot per engine; assert element height within an acceptable range. | visual.md |
| **Page zoom / text-only zoom altering geometry** | Text-only zoom scales only text and overflows fixed-unit containers; subpixel rounding at non-100% zoom shifts ellipsis/line-breaks. | At 125% zoom the ellipsis appears one char earlier in one engine. | V+P: set zoom via CDP/BiDi; assert ellipsis only when `scrollWidth>clientWidth`; snapshot at each zoom level. | e2e.md |

---

### Family 5 — CSS feature-support gaps

**Always "verify current support per engine at author time" (caniuse/MDN)** — these are the entries
most prone to going stale. The dominant failure mode is silent non-rendering: an unsupported rule
drops with no console error. Gate with `@supports`/`CSS.supports()` and snapshot per engine.
Subgrid layout behavior → Family 3. Forced-colors and `prefers-color-scheme` → Families 8 and 9.

| Category | Symptom | Concrete example | Detection | Cross-link |
|---|---|---|---|---|
| **`:has()` relational pseudo-class** | Non-forgiving selector list; one invalid argument invalidates the whole rule; cannot cross shadow DOM boundary; drops silently on unsupported engines. | A library relying on `:has(.invalid)` to style a container silently applies nothing on older engines. | V+P: inject a known `:has()` rule and check `cssRules` length, or `@supports selector(:has(a))`; snapshot to confirm no missing styles. | visual.md; Family 12 |
| **`@container` size / style / scroll-state queries** | Core size queries are broad, but style queries and scroll-state queries have narrower, diverging support. | A component using `@container scroll-state(stuck:top)` adapts only in engines that ship it. | V+P: `@supports (container-type: inline-size)` for core; verify sub-features via `@supports`; snapshot. | visual.md |
| **CSS anchor positioning (`anchor()`, `position-anchor`)** | Spec-native alternative to JS positioning middleware is Chromium-only at present; positioned elements collapse to fallback layout elsewhere. | A menu anchored via `position-anchor` lays out in Chrome but stacks at its fallback `inset` in Firefox/Safari. | V+P: `CSS.supports('anchor-name','--a')` as gate; snapshot positioned vs fallback layout per engine. | Family 2; visual.md |
| **`backdrop-filter` — prefix & CSS-variable rejection** | Some engines still require `-webkit-backdrop-filter`; prefixed form may reject CSS custom-property values. | `backdrop-filter:blur(var(--b))` shows no blur in an engine that needs the prefix and rejects the variable. | V: snapshot; `CSS.supports('-webkit-backdrop-filter','blur(5px)')` and literal-vs-variable computed-style comparison. | visual.md |
| **Scroll-driven animations (`animation-timeline`/`scroll()`/`view()`)** | Absent or flag-gated in some engines; the animation is silently ignored. Highest-impact support gap in this family. | A reading-progress bar using `animation-timeline:scroll()` animates in some engines and produces no animation elsewhere. | V+P: `CSS.supports('animation-timeline','scroll()')` before applying rules; snapshot to confirm; always gate. | visual.md |
| **`@layer` cascade layers — `!important` reversal** | Core cascade behavior is consistent, but the `!important`-priority reversal (earlier layers win) is non-obvious; JS APIs may be absent in older versions within range. | A runtime layer-reorder script silently fails where JS APIs are absent. | V+P: `CSS.supports('@layer','a')`; snapshot layer ordering; assert computed styles in `!important`-across-layers scenarios. | visual.md |
| **`text-wrap: balance` line-count cap** | The line cap for balancing differs per engine (e.g., ~6 vs ~10 lines); `text-wrap: pretty` has narrower support. | A 7-line headline is balanced in one engine (within its cap) but unbalanced in another. | V: snapshot per engine; `@supports (text-wrap: balance)` to confirm parse; verify a >6-line block manually. | visual.md |

---

### Family 6 — JS APIs & runtime behavior

Mostly **programmatically assertable** — snapshots rarely needed. Spec-mandated entries reproduce
across engines and are environment-sensitive, not engine-divergent.

| Category | Symptom | Concrete example | Detection | Cross-link |
|---|---|---|---|---|
| **Date string parsing — non-ISO formats** | Only one simplified ISO-8601 format is spec-mandated; every other string is implementation-defined — valid `Date` in some engines, `Invalid Date` in others. | `new Date('04/27/2024')` is valid in some engines, `Invalid Date` in another. | P: assert `!isNaN(getTime())` and the UTC timestamp matches expected per engine. | none |
| **`Intl` locale output format divergence** | `Intl.*Format` output varies by engine even for the same locale (NBSP vs narrow NBSP vs regular space, bidi controls) due to bundled ICU/CLDR versions. | `Intl.NumberFormat('fr-FR').format(1234.5)` differs in grouping separator between engines. | V+P: snapshot for readability; normalize whitespace before comparing — prefer normalization/range checks over exact string match. | visual.md |
| **Clipboard API — permission model & activation** | Permission gating and transient-activation requirements differ; some engines lack clipboard read/write permissions outright or require user activation. | `clipboard.readText()` inside a Promise continuation fails where activation is required but succeeds where permission was pre-granted. | P: attempt write/read in a direct event handler and in a Promise continuation; assert expected rejection/prompt per engine. | none |
| **Popover API + top-layer ordering** | Newer than `<dialog>` and unevenly supported in older-in-range versions; light-dismiss, top-layer promotion, and `popovertarget` differ or are absent. | A `popover` menu promotes above a high-z header in Chrome but renders inline behind sibling content in an older Firefox. | P+V: assert `HTMLElement.prototype.hasOwnProperty('popover')`; trigger popover; assert top-layer promotion via `elementsFromPoint`; snapshot ordering per engine. | Family 2; visual.md |
| **`requestIdleCallback` — absent in some engines** | Unavailable/flag-gated in stable releases of one engine; calling it without a guard throws `TypeError`. | A `requestIdleCallback(sendBeacon)` analytics flush throws in the engine that lacks it. | P: assert `typeof window.requestIdleCallback === 'function'`; assert a `setTimeout` polyfill is active where absent. | none |
| **Third-party cookie / SameSite blocking** | Default third-party-cookie handling differs (blocked-by-default vs per-site isolation vs deprecation in progress). | An embedded widget's `SameSite=None;Secure` cookie works in one iframe context, is isolated in another, blocked in a third. | P+V: in an iframe, attempt to read `document.cookie` after a cross-site `Set-Cookie`; snapshot the widget's auth state; verify current deprecation phase. | browser-mode.md |

---

### Family 7 — Media, animation & input events

Mixed detection: image/codec selection and animation completion are programmatically assertable;
rendering, animation, and touch/IME/DnD paths need visual snapshots and real-device testing.

| Category | Symptom | Concrete example | Detection | Cross-link |
|---|---|---|---|---|
| **Next-gen image formats (AVIF / WebP / JPEG-XL)** | Images fail to render or fall back silently depending on engine support. | A `<picture>` AVIF source renders in some engines, falls back in others. | V+P: snapshot to confirm correct variant; assert `currentSrc` and `naturalWidth > 0`. | visual.md |
| **`transition-behavior: allow-discrete`** | Animating `display`/`visibility` or discrete props works only where `transition-behavior` is implemented; otherwise abrupt hide/show. | `transition: opacity .3s, display .3s allow-discrete` animates in some engines, jumps in versions without support. | V+P: snapshot; `CSS.supports('transition-behavior','allow-discrete')` before asserting duration. | visual.md |
| **`prefers-reduced-motion` suppression & `transitionend`** | `transition-duration:0s` (vs `0.01ms`) can prevent `transitionend` from firing, breaking JS state machines. | A modal entrance with reduced-motion + `0s` duration never fires `transitionend`, leaving the modal mid-state. | V+P: emulate `prefers-reduced-motion:reduce`; assert `getAnimations().length===0`; assert that `transitionend`-dependent state is still reached. | e2e.md |
| **Pointer vs touch vs mouse event model** | `touchmove` target stays where the touch began while `pointermove`/`mousemove` report the current element. `pointercancel` fires on browser gesture takeover while touch events keep firing. | A drag-to-sort list using `touchmove` always miscalculates drop position. | V+P: synthesize pointer/mouse/touch events; assert correct target+coords; real-device testing required for touch paths. | e2e.md |
| **IME composition event ordering** | Ordering of `compositionend`/`input`/`keyup` differs; some engines emit no `keyup` after `compositionend`. | A search input submitting on Enter fires a spurious submit during CJK composition. | P: simulate a full composition sequence; assert value updates only after `compositionend`. | e2e.md |
| **HTML Drag-and-Drop `DataTransfer` & event order** | `getData()` returns null during `dragover` in some engines; `drop`/`dragend` order differs; `dataTransfer.types` type differs. | A Kanban board reading `getData` in `dragover` gets null in some engines. | V+P: assert event type is `DragEvent`, `getData` only in `drop`, and event ordering; snapshot drop-target highlight. | e2e.md |

---

### Family 8 — Forced colors / High Contrast Mode

In forced-colors mode (Windows High Contrast Mode — honored by Edge, Chrome, and Firefox) the
engine replaces author colors with a limited system palette: `box-shadow`-only borders,
`background-image`-based affordances, and transparent focus rings vanish. Engines diverge on what
they force (Firefox vs Chromium historically differed on `background-image` and SVG `fill`).
`forced-color-adjust:none` and system color keywords (`Canvas`, `CanvasText`, `ButtonText`) are the
only escapes. **Verify per engine and per OS HCM theme.**

| Category | Symptom | Concrete example | Detection | Cross-link |
|---|---|---|---|---|
| **`forced-colors` palette override & system-color keywords** | Custom-styled controls relying on `background-image`, `box-shadow` borders, or transparent focus rings become unreadable or invisible; SVG `fill` / `background-image` survival differs between Chromium and Firefox. | A submit button drawn with `background-image` + `box-shadow` (no real border) renders flat/invisible in WHCM in Chromium; a status chip relying on background color loses its meaning. | V+P: emulate forced-colors via CDP `Emulation.setEmulatedMedia({features:[{name:'forced-colors',value:'active'}]})`; snapshot per engine and per HCM theme; assert `matchMedia('(forced-colors: active)').matches` branch renders; assert focus/borders resolve to a system color keyword rather than transparent or `box-shadow`-only affordances. | visual.md; Family 1 (focus ring) |

---

### Family 9 — Color scheme & dark mode

`color-scheme:dark` (or `<meta name="color-scheme">`) flips UA rendering of form controls,
scrollbars, and the default canvas per engine — Safari, Chrome, and Firefox theme native
`<input>`/`<select>`/checkbox/scrollbar backgrounds differently. An unset `color-scheme` leaves
white form fields on a dark page in some engines only. **Verify per engine in both light and dark.**

| Category | Symptom | Concrete example | Detection | Cross-link |
|---|---|---|---|---|
| **`prefers-color-scheme` / `color-scheme` UA control & scrollbar theming** | `color-scheme:dark` flips UA theming per engine; an unset `color-scheme` on a dark page leaves white form fields / light scrollbars in some engines only. | A checkout with a dark background but no `color-scheme` declaration shows a bright white native `<select>` in one engine, dark in another. | V+P: emulate `prefers-color-scheme:dark`; snapshot native controls + scrollbars per engine in both schemes; assert `color-scheme` is declared and that computed control background differs between light and dark. | visual.md; Family 1; Family 2 (scrollbar) |
| **`accent-color` tint & default hue** | `accent-color` tints checkbox/radio/range/progress, but support is uneven and the default accent hue differs per engine/OS where absent or unset. | An `accent-color:#7c3aed` checkbox is purple in supporting engines but OS-default blue in one engine that ignores it. | V+P: verify `CSS.supports('accent-color','red')`; snapshot the controls per engine and scheme; assert tint applies via sampled pixel or computed style. | visual.md; Family 1 |

---

### Family 10 — Writing direction / bidi (RTL)

Physical properties (`margin-left`, `left`, `text-align:left`) don't mirror in RTL while logical
ones (`margin-inline-start`, `inset-inline`) do. `scrollLeft` sign conventions diverge across
Blink/Gecko/WebKit. For a multi-country product this directly affects Arabic/Hebrew markets.
**Verify per engine under `dir="rtl"`.**

| Category | Symptom | Concrete example | Detection | Cross-link |
|---|---|---|---|---|
| **Physical-property leakage vs logical-property mirroring** | Under `dir="rtl"`, physical values land on the wrong side; logical properties flip correctly. | A card padded with `padding-left:16px` keeps its gap on the left in RTL while a sibling using `padding-inline-start` flips correctly. | V+P: render under `dir="rtl"`; snapshot per engine; assert logical-property elements' rects flip (left↔right) and physical-property elements do NOT flip; assert caret/selection and placeholder alignment in inputs flip correctly. | visual.md |
| **`scrollLeft` sign convention & mirrored scroll** | RTL `scrollLeft` sign/origin diverges (negative in some engines, positive-from-right or inverted in others) — a long-standing Blink/Gecko/WebKit difference. | A horizontal carousel computing position from `scrollLeft` jumps to the wrong slide in RTL on one engine because the value is negative where another reports positive. | P: under `dir="rtl"`, set/read `scrollLeft` and assert the sign/origin convention per engine; normalize via a feature-detected helper before relying on the value. | e2e.md; Family 2 |
| **Bidi isolation & neutral-character reordering** | `<bdi>`/`unicode-bidi:isolate` handling and neutral-character (numbers, punctuation) reordering differ; `direction` inheritance into controls/placeholders varies. | A balance string mixing an RTL label with a Latin amount reorders the parentheses/sign differently per engine without isolation. | V+P: render mixed-direction strings; snapshot per engine; wrap embedded opposite-direction runs in `<bdi>` and assert glyph order matches expected. | visual.md |

---

### Family 11 — Print & paged media

A real cross-engine surface that screen testing never exercises — and a primary use case for a
payment gateway (receipts, vouchers, payroll reports). `@page` margin/size support,
`break-inside:avoid`, background-color/-image printing, `position:fixed`/sticky behavior in paged
context, and `thead` repetition all differ between engines. **Verify per engine via headless print.**

> **Inline detection mechanic (no existing reference owns print rendering):** use
> `page.pdf()` (Playwright's PDF generation) or CDP `Page.printToPDF` to render the page to PDF
> headlessly per engine. Visual-diff the paged output via `visual.md` for the before/after
> comparison.

| Category | Symptom | Concrete example | Detection | Cross-link |
|---|---|---|---|---|
| **`@media print` / `@page` / fragmentation (`break-*`, `page-break-*`, orphans/widows)** | `@page` margin/size support, `break-inside:avoid`, and orphans/widows are honored inconsistently; backgrounds print only when the engine's "print backgrounds" default allows; `thead` may or may not repeat per page; `position:fixed`/sticky behave differently in paged context. | A payment receipt's totals row is split across a page boundary in Safari but kept whole in Chrome; background shading on the header prints in one engine, drops in another. | V+P: render to PDF via `page.pdf()` / CDP `Page.printToPDF` per engine; visual-diff the paged output (→ visual.md); assert no `break-inside:avoid` block straddles a page boundary (no element rect crosses a page edge); assert `@page` margins/size resolve and `thead` repeats as intended. | visual.md; e2e.md |

---

### Family 12 — Shadow DOM & Web Components

`::part`/`::slotted` styling, custom-property penetration, form-associated custom elements
(`ElementInternals`), declarative shadow DOM (`<template shadowrootmode>`), and constructable
stylesheets (`adoptedStyleSheets`) all have version-divergent support. A payment widget shipped as
a custom element can submit/validate in one engine and silently not participate in another.
**Verify per engine on your minimum target versions.**

| Category | Symptom | Concrete example | Detection | Cross-link |
|---|---|---|---|---|
| **Style isolation, `::part`/`::slotted`, form-association & declarative shadow DOM** | `::part`/`::slotted` styling, custom-property inheritance, slot reprojection, `ElementInternals` form participation, declarative shadow DOM hydration, and `adoptedStyleSheets` have version-divergent support. | A form-associated payment widget's value is included in `<form>` submission in one engine but omitted in an older one lacking `ElementInternals`; a declarative shadow root hydrates without JS in one engine but renders empty in another. | V+P: assert `'attachInternals' in HTMLElement.prototype`; assert element value appears in `FormData` on submit; assert `::part` styling applies (computed style on the part); assert declarative SD hydrated (`element.shadowRoot` present after parse); snapshot slotted content rendering per engine. | visual.md; Family 5 (`:has()` boundary) |

---

### Family 13 — Canvas / WebGL / pixel readback

Text/line anti-aliasing and `getImageData`/`toDataURL` byte output differ per engine and GPU.
Privacy-hardening engines (Brave, Firefox resist-fingerprinting, Safari) inject randomized noise or
return uniform data, breaking pixel-exact assertions. **Never assert pixel-exact canvas output
across engines.**

| Category | Symptom | Concrete example | Detection | Cross-link |
|---|---|---|---|---|
| **2D/WebGL anti-aliasing, pixel-readback divergence, anti-fingerprint noise & context loss** | AA and `getImageData`/`toDataURL` bytes differ per engine/GPU; privacy engines inject noise or uniform data; WebGL/WebGPU availability and software fallback diverge; cross-origin readback throws `SecurityError` under CORS conditions that differ in practice. | A QR rendered to canvas reads back with different bytes per engine; a fingerprint-hardened browser returns noisy `getImageData`; a WebGL chart fails to init where software-blocked. | V+P: draw a known pattern and assert `getImageData` within a **tolerance band** (not exact) to survive AA/noise; detect fingerprint-noise engines by hashing two identical draws and checking for instability; assert `getContext('webgl2')` is non-null and handle `webglcontextlost`; for cross-origin sources assert readback either succeeds or throws `SecurityError` as expected. | visual.md; e2e.md; Family 7 |

---

## Per-engine skip annotations

When a test must skip an engine for a known, tracked reason:

```typescript
import { test } from '@playwright/test'

// Skip on a specific engine with a reason
test.skip(({ browserName }) => browserName === 'webkit', 'Safari: <tracked issue URL>')

// Mark as expected to fail (fixme) — test still runs and reports as expected-to-fail
test.fixme(({ browserName }) => browserName === 'firefox', 'Firefox: <tracked issue URL>')
```

Rules:
- Always provide a reason string — a URL to the issue tracker or a concise description.
- Prefer `test.fixme` over `test.skip` when the failure is a known engine bug expected to be fixed.
- Never skip an engine permanently without a tracking issue. A `skip` without a reason is a
  silent hole in coverage.
- Record every skip/fixme annotation in `03-testing.md` under "Known skip annotations" with the
  engine, reason, and issue URL.

---

## CI strategy — defaults and matrix gating

### Default: chromium-only on every PR

The default `playwright.config.ts` (from `e2e.md`) already specifies a single `chromium` project.
The cross-browser matrix is **never the PR default**.

```typescript
// playwright.config.ts — default: chromium only on every PR
projects: [
  { name: 'setup', testMatch: /.*\.setup\.ts/ },
  {
    name: 'chromium',
    use: { ...devices['Desktop Chrome'] },
    dependencies: ['setup'],
  },
  // Cross-browser matrix activated only by 'cross-browser' label or on schedule:
  // { name: 'firefox', use: { ...devices['Desktop Firefox'] }, dependencies: ['setup'] },
  // { name: 'webkit',  use: { ...devices['Desktop Safari'] },  dependencies: ['setup'] },
]
```

### Full matrix via label or schedule

```yaml
# .github/workflows/e2e-cross-browser.yml
on:
  schedule:
    - cron: '0 2 * * 1'  # weekly nightly
  pull_request:
    types: [labeled]
    # triggered when the 'cross-browser' label is added to a PR

jobs:
  cross-browser:
    if: github.event_name == 'schedule' || contains(github.event.label.name, 'cross-browser')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx playwright install --with-deps
      - run: npx playwright test --project=chromium --project=firefox --project=webkit
```

### WebKit on Linux — install deps caveat

WebKit requires Linux system libraries not installed by a bare `npx playwright install`. Always
install with the full system dependencies in CI:

```bash
npx playwright install --with-deps          # installs all browsers + system deps
npx playwright install-deps webkit          # WebKit-only system deps
```

The tester **surfaces this as a setup finding** in `03-testing.md` — it does NOT auto-install on
the developer's machine. WebKit is also the most flake-prone engine on headless Linux: enable
`retries: 2` and `trace: 'on-first-retry'` in the WebKit project config rather than disabling it.

### When NOT to go full-matrix

The full engine + branded-channel + grid matrix multiplies wall-clock and cost significantly. Skip
the full matrix when:

- The PR changes only backend logic, API contracts, or data models with no rendering impact.
- All changed UI is pure CSS layout with no browser-API dependencies (no floating/positioned
  elements, no animations, no JS positioning middleware).
- The feature targets a single-platform deployment (e.g., an internal admin tool used only on
  Chrome).
- The cross-browser surface was already covered by a recent scheduled run (less than two weeks old)
  with no changes since.
- CI budget is a hard constraint: triage by engine priority (Chromium first, Firefox second, WebKit
  third; branded channels last; grid only for real-device / real-Safari requirements).

---

## react-nextjs

Stack: Next.js App Router + TypeScript + Playwright 1.60 + Vitest 4.1.8

### Playwright multi-engine projects

Extend the `playwright.config.ts` from `e2e.md`. Add the cross-browser projects as an opt-in layer
(commented out on PR, uncommented for the scheduled / labeled workflow):

```typescript
// playwright.config.ts — cross-browser extension
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  // ... all existing config from e2e.md ...
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    // Default PR target — always active
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
    // Cross-browser matrix — activated via label or schedule
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, dependencies: ['setup'] },
    { name: 'webkit',  use: { ...devices['Desktop Safari'] },  dependencies: ['setup'] },
    // Branded Chrome/Edge — require real local install
    { name: 'chrome',  use: { ...devices['Desktop Chrome'], channel: 'chrome' },  dependencies: ['setup'] },
    { name: 'msedge', use: { ...devices['Desktop Edge'],   channel: 'msedge' }, dependencies: ['setup'] },
    // Mobile emulation
    { name: 'pixel5',   use: { ...devices['Pixel 5'] },    dependencies: ['setup'] },
    { name: 'iphone12', use: { ...devices['iPhone 12'] },  dependencies: ['setup'] },
  ],
})
```

For viewport override within a test, use `page.setViewportSize(...)` — see `e2e.md`
§ "Responsive assertions in E2E".

### Vitest Browser Mode multi-engine instances

For component-in-isolation tests (Vitest Browser Mode), extend the browser project from
`browser-mode.md` with multiple `instances`:

```typescript
// vitest.config.ts — cross-browser browser project
{
  extends: true,
  plugins: [react()],
  test: {
    name: 'browser-cross',
    browser: {
      enabled: true,
      provider: playwright(),
      // Cross-browser instances — start with chromium, add firefox/webkit for scheduled runs
      instances: [
        { browser: 'chromium' },
        { browser: 'firefox' },
        { browser: 'webkit' },
      ],
      headless: true,
    },
    include: ['src/**/*.browser.test.{ts,tsx}'],
  },
}
```

For viewport control within a Vitest browser test, use `page.viewport(w, h)` — see
`browser-mode.md` § "Viewport control".

---

## nestjs

> Not applicable — cross-browser testing targets UI components and user flows in a real browser.
> NestJS is a server-side framework; its tests use `@nestjs/testing` + `supertest` or `vitest`
> (see `unit.md` and `integration.md` for NestJS guidance).

## go

> Not applicable — cross-browser testing targets UI components and user flows in a real browser.
> Go backend tests use the standard `testing` package and `httptest`
> (see `unit.md` and `e2e.md` for Go guidance).

## python

> Not applicable — cross-browser testing targets UI components and user flows in a real browser.
> Python backend tests use `pytest` (see `unit.md` and `e2e.md` for Python guidance).
