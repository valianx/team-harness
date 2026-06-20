# Testing Reference: Vitest Browser Mode

> Loaded on demand by the `tester` agent via the Reference Router.
> Stack-agnostic principles first, then per-stack sections keyed `## <stack>`.

## Principles (stack-agnostic)

### When to use Browser Mode

Use Vitest Browser Mode when a **component in isolation** depends on **real browser APIs** that jsdom stubs incorrectly or not at all:

- **Layout and geometry** — `getBoundingClientRect`, `offsetWidth/offsetHeight`, scroll position, `clientWidth`.
- **Intersection and resize observers** — `IntersectionObserver`, `ResizeObserver` (jsdom does not implement these — calling them throws unless the project installs a polyfill; real layout triggers them in Browser Mode).
- **Media queries** — `matchMedia`, CSS `@media` breakpoints evaluated against a real viewport.
- **Web Animations API** — `element.animate()`, `KeyframeEffect`, `Animation.onfinish`.
- **Real CSS** — cascade, specificity, custom properties computed at runtime, CSS transitions.
- **Viewport behaviour** — components that react to window size, `visualViewport`, or orientation.
- **Canvas and WebGL** — APIs absent in jsdom that run in a real browser context.

The test subject is a single component (or a small composition). There is no multi-page navigation, no running server, no authentication flow.

### When NOT to use Browser Mode

| Situation | Correct tool |
|-----------|-------------|
| Pure logic: transforms, hooks, reducers, utilities with no browser-API dependency | Vitest + jsdom (`unit.md`) |
| Multi-page journey, login → dashboard → checkout flow | Playwright E2E (`e2e.md`) |
| Server Actions, middleware, redirects, async RSC (requires Next.js runtime) | Playwright E2E (`e2e.md`) |
| Component appearance/interaction at story level (no raw browser-API assertion needed) | Storybook / `ui-component.md` — runs on the same Vitest Browser Mode engine; story = appearance + interaction, this file = raw layout/observer assertions |
| Backend service, API, or CLI logic | Not applicable — Browser Mode is frontend-only |

**Anti-pattern to avoid:** choosing Browser Mode "because it sounds more modern than jsdom" or Playwright "because it is browser-real". The selection MUST be driven by a concrete browser-API dependency in the AC. Record the reason in the mandatory decision log every time.

### Difference vs Playwright E2E

Browser Mode does not replace E2E tools — it changes the environment where existing tests run. Specifically:

- **Browser Mode** runs Vitest tests (the same `describe`/`it`/`expect` API) inside a real browser context instead of a simulated environment (jsdom). No running application is required; the component is mounted in an iframe by the test runner.
- **Playwright E2E** navigates a real browser to a **running application** (the Next.js dev or production server). It tests complete user journeys across pages, server logic, and real network calls.

Use Browser Mode for component isolation with real browser APIs. Use Playwright E2E for flows that require a live server. The two are complementary, not competing.

### Difference vs jsdom / happy-dom

| Browser API | jsdom | happy-dom | Real browser (Browser Mode) |
|-------------|-------|-----------|-----------------------------|
| `getBoundingClientRect` | Returns all-zero stub | Returns all-zero stub | Real layout values |
| `IntersectionObserver` | Not implemented — throws | Partial stub | Fires correctly on real scroll/visibility |
| `ResizeObserver` | Not implemented — throws | Partial stub | Fires on real element resize |
| `matchMedia` | Not implemented — throws unless the project installs the conventional setup-file mock (which hardcodes `matches: false`) | Partial stub | Evaluates real CSS media conditions |
| CSS cascade / computed styles | No rendering engine; inline only | Limited | Full browser rendering engine |
| Web Animations API | Not implemented | Not implemented | Fully functional |
| `canvas` / `WebGL` | Stub (no pixels) | Stub | Fully functional (software-rendered via SwiftShader by default in headless) |

When a test relies on any of the above, jsdom and happy-dom produce misleading results (always-zero geometry, observer callbacks that never fire). Browser Mode eliminates the category of "passes in jsdom, broken in production" for layout-dependent components.

### Setup

#### Quick setup (interactive)

```bash
npx vitest init browser
```

The CLI prompts for the framework plugin and provider. Select `playwright` as the provider.

#### Manual setup

```bash
npm install -D vitest @vitest/browser-playwright
```

**Provider package versioning:** `@vitest/browser-playwright` must be kept in lockstep with `vitest` — both are pinned to the same release train (verified 2026-06-12: `vitest@4.1.8` + `@vitest/browser-playwright@4.1.8`). Bumping one without the other causes peer-dependency errors.

**Playwright binaries:** if the project already uses Playwright for E2E tests, the browser binaries from `npx playwright install` are shared — no second install is needed. If Playwright is not yet installed:

```bash
npx playwright install chromium   # minimum for CI; add firefox/webkit as needed
```

### Minimal config

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
import react from '@vitejs/plugin-react'   // required when the stack uses React

export default defineConfig({
  plugins: [react()],
  test: {
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
      headless: true,   // required in CI; omit or set false for local UI debugging
    },
    include: ['src/**/*.browser.test.{ts,tsx}'],
  },
})
```

Use a distinct glob (e.g. `*.browser.test.tsx`) to separate browser-mode tests from jsdom unit tests. In a multi-project Vitest config, define the browser project alongside the unit project (see `unit.md` for the two-project pattern).

**Headless in CI:** set `headless: true` in the config, or pass `--browser.headless` on the CLI. Do not rely on the default — it varies by environment.

### Typical cases worth a browser-real test

| Use case | Why jsdom is insufficient |
|----------|---------------------------|
| Sticky header that shrinks on scroll | `getBoundingClientRect` and scroll events are stubs |
| Virtualized list / infinite scroll | `IntersectionObserver` never fires |
| Responsive layout (grid columns collapse) | `matchMedia` always returns false |
| CSS-driven animation state (`onAnimationEnd`) | No rendering engine; event never fires |
| `ResizeObserver`-driven sidebar toggle | Observer callback is a no-op |
| `canvas` chart renders without throwing | Canvas API stub throws or produces nothing |
| `matchMedia('(prefers-reduced-motion)')` | Always returns false; cannot test the reduced branch |

---

## ISOLATION LIMITATION — read before writing tests

Unlike the Playwright test runner (which opens a fresh page per test by default), **Vitest Browser Mode opens a single page for all tests defined in the same file**. Isolation is **per-file, not per-test**.

**What this means:**

- DOM mutations made by one test persist into the next test in the same file unless you clean up explicitly.
- Global state (event listeners attached to `window`, CSS classes on `document.body`, `localStorage` entries) accumulates across tests.
- Flaky test ordering bugs are common when cleanup is omitted.

**Cleanup pattern — do this in every browser-mode test file:**

```typescript
import { afterEach, beforeEach } from 'vitest'
import { render, cleanup } from 'vitest-browser-react'   // or your framework equivalent

// Option A: explicit cleanup via vitest-browser-react
// cleanup() is async — return the promise so the runner awaits it before the next test
afterEach(() => cleanup())

// Option B: fresh render per test (preferred when tests are independent)
// Each `it` block calls render() itself; cleanup() runs after each.

// Option C: reset shared globals
afterEach(() => {
  document.body.innerHTML = ''
  localStorage.clear()
  window.removeEventListener(/* ... */)
})
```

**Why explicit cleanup still matters:** `vitest-browser-react` auto-cleans the previously rendered component before each test, so the `afterEach` / `cleanup()` pattern is primarily for shared globals (window event listeners, `document.body` classes, `localStorage`) and for explicitness — not for component DOM removal.

**Rule:** never rely on test ordering within a file to set up state for the next test. Each test must arrange its own preconditions, or share them via `beforeEach` — not via leftover DOM from a prior test.

---

## The `vi.spyOn` caveat in Browser Mode

In a Node/jsdom environment, `vi.spyOn(module, 'export')` replaces the binding at runtime. In Browser Mode, **ES module namespaces are sealed by the browser** — you cannot reassign a live binding on an imported module object.

```typescript
// WRONG in Browser Mode — throws TypeError: Cannot assign to read-only property
import * as myModule from './myModule'
vi.spyOn(myModule, 'fetchData')   // fails; namespace is sealed
```

Use `vi.mock` with `spy: true` instead:

```typescript
// CORRECT
vi.mock('./myModule.js', { spy: true })
// All exports are auto-spied; the original implementation is preserved.
// Assertions work as normal:
import { fetchData } from './myModule'
expect(fetchData).toHaveBeenCalledWith('expected-arg')
```

---

## react-nextjs

Stack: Next.js App Router + TypeScript + Vitest 4.1.8 + `vitest-browser-react` 2.2.0

### Install

```bash
npm install -D vitest @vitest/browser-playwright vitest-browser-react
# Optional: npm install -D @vitest/ui   — required for the test:browser:ui script below
```

`vitest-browser-react` provides a `render` function backed by the Vitest Browser Mode locators API (not Testing Library DOM queries). It replaces `@testing-library/react` for browser-mode tests.

### Config (browser project alongside jsdom unit project)

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}'],
          setupFiles: ['./vitest.setup.ts'],
        },
      },
      {
        extends: true,
        plugins: [react()],
        test: {
          name: 'browser',
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
            headless: true,
          },
          include: ['src/**/*.browser.test.{ts,tsx}'],
        },
      },
    ],
  },
})
```

### Component test with locators API

```typescript
// src/components/StickyHeader/StickyHeader.browser.test.tsx
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from 'vitest-browser-react'
import { StickyHeader } from './StickyHeader'

afterEach(() => cleanup())

// Note: render() is async since vitest-browser-react 2.0 — always await it.
describe('StickyHeader', () => {
  it('collapses when scrolled past threshold', async () => {
    // Render inside a tall wrapper so the page overflows and real scrolling is possible
    const { getByRole } = await render(
      <div>
        <StickyHeader threshold={80} />
        <div style={{ height: '2000px' }} />
      </div>
    )
    const header = getByRole('banner')

    // Real scroll — the browser dispatches the scroll event and updates scrollY
    await window.scrollTo(0, 100)

    await expect.element(header).toHaveClass('collapsed')
  })

  it('reports correct height via getBoundingClientRect', async () => {
    const { getByRole } = await render(<StickyHeader threshold={80} />)
    const header = getByRole('banner')
    const rect = (await header.element()).getBoundingClientRect()
    expect(rect.height).toBeGreaterThan(0)   // real layout; not zero like jsdom
  })
})
```

### IntersectionObserver / ResizeObserver test

```typescript
// src/components/LazySection/LazySection.browser.test.tsx
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from 'vitest-browser-react'
import { LazySection } from './LazySection'

afterEach(() => cleanup())

it('renders content once visible in viewport', async () => {
  const { getByText } = await render(<LazySection />)
  // Real IntersectionObserver fires when the element enters the viewport.
  // vitest-browser-react mounts into the real document, so the observer triggers.
  await expect.element(getByText('Loaded content')).toBeVisible()
})
```

### ARIA live-region assertion

When a component announces status updates via an `aria-live` region, assert the region's text content after the triggering action. DOM state ordering is reliable; `axe` complements for region validity (role, politeness) but does not assert content.

```typescript
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { CheckoutForm } from './CheckoutForm'

afterEach(() => cleanup())

it('announces submission error in the live region', async () => {
  const { getByRole } = await render(<CheckoutForm />)

  // Trigger the action that should produce an announcement
  await userEvent.click(getByRole('button', { name: /submit/i }))

  // Assert the live-region content updated — DOM state is the ordering mechanism
  const liveRegion = getByRole('status')   // role="status" implies aria-live="polite"
  await expect.element(liveRegion).toHaveText(/please fill in all required fields/i)
})
```

> Use `getByRole('status')` for `aria-live="polite"` regions and `getByRole('alert')` for `aria-live="assertive"`. Pair with an axe scan to verify the region's role and politeness attribute are valid.

### Viewport control

Use `page` from `vitest/browser` to programmatically resize the viewport inside a test — required for responsive-layout assertions that depend on real CSS media queries or `window.matchMedia`.

```typescript
import { describe, it, expect, afterEach } from 'vitest'
import { page } from 'vitest/browser'
import { render, cleanup } from 'vitest-browser-react'
import { ResponsiveNav } from './ResponsiveNav'

afterEach(() => cleanup())

describe('ResponsiveNav', () => {
  it('collapses to hamburger menu on mobile viewport', async () => {
    // Set viewport before render so the component mounts at the target size
    await page.viewport(375, 667)   // iPhone SE — returns Promise<void>
    const { getByRole } = await render(<ResponsiveNav />)

    // Real CSS media query evaluated in the browser; matchMedia reflects the set size
    await expect.element(getByRole('button', { name: /menu/i })).toBeVisible()

    // Expand to desktop and assert the full nav appears
    await page.viewport(1280, 800)
    await expect.element(getByRole('navigation')).toBeVisible()
  })
})
```

`page` also exposes `screenshot()` and all locator query methods (`getByRole`, `getByText`, etc.).

> All viewport/breakpoint ACs for component-in-isolation tests route to this subsection. For full-page responsive assertions in a running application, see `e2e.md` § "Responsive assertions in E2E".

### Visual regression testing (Vitest 4.0+)

Vitest 4.0 added component-level screenshot comparison. Failing screenshots are saved alongside the reference images for diff review.

```typescript
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { PricingCard } from './PricingCard'

it('matches visual snapshot', async () => {
  const screen = await render(<PricingCard tier="pro" price={49} />)
  await expect(screen.getByRole('article')).toMatchScreenshot('pricing-card-pro')   // component screenshot vs stored reference
})
```

Reference images are stored in `__screenshots__/` alongside the test file. Commit them to version control; CI fails when they drift.

**Platform-suffix caveat:** baseline filenames embed both browser and OS platform (e.g. `pricing-card-pro-chromium-darwin.png` vs `pricing-card-pro-chromium-linux.png`). Baselines committed from a macOS or Windows dev machine will not exist for the Linux CI environment — the first CI run fails on **missing references**, not drift. Generate and update baselines inside the pinned CI environment (e.g. the same version-matched container used by `e2e.md` Option B) rather than committing from a local dev machine.

### Playwright-format traces (Vitest 4.0+)

Vitest 4.0 added Playwright-compatible trace recording. Traces are written on failure and can be opened in the Playwright Trace Viewer for step-by-step debugging.

Enable in config:

```typescript
// vitest.config.ts — inside the browser project
browser: {
  enabled: true,
  provider: playwright(),
  instances: [{ browser: 'chromium' }],
  headless: true,
  trace: 'retain-on-failure',   // writes .zip trace archive when a test fails; valid modes: 'on' | 'off' | 'on-first-retry' | 'on-all-retries' | 'retain-on-failure'
}
```

Open a trace:

```bash
npx playwright show-trace src/components/StickyHeader/__traces__/StickyHeader-browser-test-trace.zip
```

### File layout convention

```
src/
  components/
    StickyHeader/
      StickyHeader.tsx
      StickyHeader.test.tsx         # jsdom unit test (logic, props)
      StickyHeader.browser.test.tsx # Vitest Browser Mode (real layout / observers)
      StickyHeader.stories.tsx      # Storybook story — see ui-component.md
      __screenshots__/              # visual regression reference images (committed)
      __traces__/                   # Playwright-format trace archives (written on failure; not committed)
```

### Golden commands

```jsonc
// package.json
{
  "test:browser": "vitest --project browser",
  "test:browser:ui": "vitest --project browser --ui",
  "test:browser:headed": "vitest --project browser --browser.headless=false"
}
```

### Where to look when it fails

| Artifact | Location | How to open |
|----------|----------|-------------|
| Screenshots (visual regression) | `__screenshots__/` alongside the test file | Open the `.png` diff directly; commit the reference image from the CI environment (platform-suffix caveat above) |
| Traces | `__traces__/` alongside the test file | `npx playwright show-trace <path-to.zip>` |
| Verbose output | — | Pass `--reporter=verbose` to see per-test action logs |
| Repro command | — | `npx vitest run --config vitest.config.ts -t '<exact test name>'` |

Trace mode is set in the config above; see the Traces section.

### Decision log (mandatory — tester must emit this)

Every time the `browser-mode` test type is selected (or any test type is selected in Phase 0), record:

```
Selected test type: browser-mode
Reason: AC depends on [specific browser API, e.g. getBoundingClientRect / IntersectionObserver / matchMedia].
        No multi-page journey or running server required.
Loaded references: agents/testing-refs/browser-mode.md
```

---

## vue

Stack: Vue 3 + Vite + TypeScript + Vitest 4.x + `vitest-browser-vue`

### Install

```bash
npm install -D vitest @vitest/browser-playwright vitest-browser-vue @vitejs/plugin-vue
```

`vitest-browser-vue` provides an async `render` function backed by the Vitest Browser Mode locators API. It replaces `@testing-library/vue` for browser-mode tests. `@vitejs/plugin-vue` is required so Vite can compile `.vue` single-file components.

### Config (browser project alongside jsdom unit project)

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}'],
          setupFiles: ['./vitest.setup.ts'],
        },
      },
      {
        extends: true,
        plugins: [vue()],
        test: {
          name: 'browser',
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
            headless: true,
          },
          include: ['src/**/*.browser.test.{ts,tsx}'],
        },
      },
    ],
  },
})
```

### Component test with locators API

```typescript
// src/components/StickyHeader/StickyHeader.browser.test.ts
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from 'vitest-browser-vue'
import StickyHeader from './StickyHeader.vue'

afterEach(() => cleanup())

// Note: render() is async in vitest-browser-vue — always await it.
describe('StickyHeader', () => {
  it('collapses when scrolled past threshold', async () => {
    const { getByRole } = await render(StickyHeader, {
      props: { threshold: 80 },
    })
    const header = getByRole('banner')

    await window.scrollTo(0, 100)
    await expect.element(header).toHaveClass('collapsed')
  })

  it('reports correct height via getBoundingClientRect', async () => {
    const { getByRole } = await render(StickyHeader, { props: { threshold: 80 } })
    const header = getByRole('banner')
    const rect = (await header.element()).getBoundingClientRect()
    expect(rect.height).toBeGreaterThan(0)
  })
})
```

Vue extras available from `vitest-browser-vue`: `rerender(props)` to update props after initial render; `emitted()` to inspect emitted events. The `attachTo` option is NOT supported — use `container` for document attachment. Always `await render(...)`: sync usage is deprecated in `vitest-browser-vue`.

### IntersectionObserver / ResizeObserver test

```typescript
// src/components/LazySection/LazySection.browser.test.ts
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from 'vitest-browser-vue'
import LazySection from './LazySection.vue'

afterEach(() => cleanup())

it('renders content once visible in viewport', async () => {
  const { getByText } = await render(LazySection)
  // Real IntersectionObserver fires when the element enters the viewport.
  await expect.element(getByText('Loaded content')).toBeVisible()
})
```

### ARIA live-region assertion

```typescript
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from 'vitest-browser-vue'
import { userEvent } from 'vitest/browser'
import CheckoutForm from './CheckoutForm.vue'

afterEach(() => cleanup())

it('announces submission error in the live region', async () => {
  const { getByRole } = await render(CheckoutForm)

  await userEvent.click(getByRole('button', { name: /submit/i }))

  const liveRegion = getByRole('status')   // role="status" implies aria-live="polite"
  await expect.element(liveRegion).toHaveText(/please fill in all required fields/i)
})
```

> Use `getByRole('status')` for `aria-live="polite"` regions and `getByRole('alert')` for `aria-live="assertive"`. Pair with an axe scan to verify the region's role and politeness attribute are valid.

### Viewport control

```typescript
import { describe, it, expect, afterEach } from 'vitest'
import { page } from 'vitest/browser'
import { render, cleanup } from 'vitest-browser-vue'
import ResponsiveNav from './ResponsiveNav.vue'

afterEach(() => cleanup())

describe('ResponsiveNav', () => {
  it('collapses to hamburger menu on mobile viewport', async () => {
    await page.viewport(375, 667)
    const { getByRole } = await render(ResponsiveNav)

    await expect.element(getByRole('button', { name: /menu/i })).toBeVisible()

    await page.viewport(1280, 800)
    await expect.element(getByRole('navigation')).toBeVisible()
  })
})
```

---

## svelte

Stack: Svelte 5 + Vite + TypeScript + Vitest 4.x + `vitest-browser-svelte`

> **Maturity note:** React and Vue browser-mode tooling are mature (high snippet coverage, broad community usage). `vitest-browser-svelte` is stable and maintained but less battle-tested — the snippet corpus is substantially smaller. For Svelte projects, verify the installed version against the package changelog before authoring tests, and record any API gaps in the decision log. The e2e-degradation fallback (Playwright) remains available for cases where `vitest-browser-svelte` does not support the required assertion.

### Install

```bash
npm install -D vitest @vitest/browser-playwright vitest-browser-svelte @sveltejs/vite-plugin-svelte
```

`vitest-browser-svelte` provides an async `render` function backed by the Vitest Browser Mode locators API. `@sveltejs/vite-plugin-svelte` is required so Vite can compile `.svelte` components.

### Config (browser project alongside jsdom unit project)

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,js}'],
          setupFiles: ['./vitest.setup.ts'],
        },
      },
      {
        extends: true,
        plugins: [svelte()],
        test: {
          name: 'browser',
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
            headless: true,
          },
          include: ['src/**/*.browser.test.{ts,js}'],
        },
      },
    ],
  },
})
```

### Component test with locators API

```typescript
// src/components/StickyHeader/StickyHeader.browser.test.ts
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from 'vitest-browser-svelte'
import StickyHeader from './StickyHeader.svelte'

afterEach(() => cleanup())

// Note: render() is async in vitest-browser-svelte — always await it.
describe('StickyHeader', () => {
  it('collapses when scrolled past threshold', async () => {
    const { getByRole } = await render(StickyHeader, {
      props: { threshold: 80 },
    })
    const header = getByRole('banner')

    await window.scrollTo(0, 100)
    await expect.element(header).toHaveClass('collapsed')
  })

  it('reports correct height via getBoundingClientRect', async () => {
    const { getByRole } = await render(StickyHeader, { props: { threshold: 80 } })
    const header = getByRole('banner')
    const rect = (await header.element()).getBoundingClientRect()
    expect(rect.height).toBeGreaterThan(0)
  })
})
```

### IntersectionObserver / ResizeObserver test

```typescript
// src/components/LazySection/LazySection.browser.test.ts
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from 'vitest-browser-svelte'
import LazySection from './LazySection.svelte'

afterEach(() => cleanup())

it('renders content once visible in viewport', async () => {
  const { getByText } = await render(LazySection)
  // Real IntersectionObserver fires when the element enters the viewport.
  await expect.element(getByText('Loaded content')).toBeVisible()
})
```

### ARIA live-region assertion

```typescript
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from 'vitest-browser-svelte'
import { userEvent } from 'vitest/browser'
import CheckoutForm from './CheckoutForm.svelte'

afterEach(() => cleanup())

it('announces submission error in the live region', async () => {
  const { getByRole } = await render(CheckoutForm)

  await userEvent.click(getByRole('button', { name: /submit/i }))

  const liveRegion = getByRole('status')
  await expect.element(liveRegion).toHaveText(/please fill in all required fields/i)
})
```

### Viewport control

```typescript
import { describe, it, expect, afterEach } from 'vitest'
import { page } from 'vitest/browser'
import { render, cleanup } from 'vitest-browser-svelte'
import ResponsiveNav from './ResponsiveNav.svelte'

afterEach(() => cleanup())

describe('ResponsiveNav', () => {
  it('collapses to hamburger menu on mobile viewport', async () => {
    await page.viewport(375, 667)
    const { getByRole } = await render(ResponsiveNav)

    await expect.element(getByRole('button', { name: /menu/i })).toBeVisible()

    await page.viewport(1280, 800)
    await expect.element(getByRole('navigation')).toBeVisible()
  })
})
```

---

## nestjs

> Not applicable — Browser Mode targets UI components rendered in a real browser. NestJS is a
> server-side framework; its tests use `@nestjs/testing` + `supertest` or `vitest` (see `unit.md`
> and `integration.md` for NestJS guidance).

## go

> Not applicable — Browser Mode targets UI components rendered in a real browser. Go backend tests
> use the standard `testing` package and `httptest` (see `unit.md` and `e2e.md` for Go guidance).

## python

> Not applicable — Browser Mode targets UI components rendered in a real browser. Python backend
> tests use `pytest` (see `unit.md` and `e2e.md` for Python guidance).
