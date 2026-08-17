# Testing Reference: visual tests

> Loaded on demand by the `tester` agent via the Reference Router.
> Stack-agnostic principles first, then per-stack sections keyed `## <stack>`.

## Principles (stack-agnostic)

- Visual regression tests verify that **rendered output matches a known baseline** — catching unintentional layout shifts, color changes, or broken components introduced by a refactor or dependency update.
- They sit alongside E2E at the top of the pyramid: slow (screenshot comparison), sensitive to rendering environment (OS fonts, GPU, container version), and expensive to maintain if baselines drift.
- When to choose visual tests: the component or page has a clearly defined visual contract (a design system token, a brand color, a specific layout grid) that automated functional assertions cannot cover adequately.
- Keep the baseline environment **pinned** (same container, same OS, same font stack in CI) — environment variance is the primary source of flake in visual suites.
- Anti-patterns: running visual tests on components in active development (constant baseline churn); storing baselines in a repo without a clear owner; using pixel-perfect comparison (use a tolerance threshold instead).
- The agent NEVER installs a paid visual vendor. If the repo already uses Chromatic or another vendor, extend it — do not introduce a second tool.

## react-nextjs

Stack: Next.js App Router + TypeScript

### Choose what the repo already has

Detect which visual approach the repo uses before writing any tests. Never install a second tool:

1. **Chromatic** (hosted): present if `package.json` contains `chromatic` or the CI pipeline has a `chromatic` step.
2. **Playwright `toHaveScreenshot`** (self-hosted): present if `playwright.config.ts` exists and the E2E suite already uses screenshot assertions, or if the `visual` scripts in `package.json` reference Playwright.
3. **Vitest Browser Mode component screenshots** (Vitest 4.0+): present if `vitest.config.ts` contains a project with `test.browser` enabled (look for `browser: { enabled: true }`). See Option C below.
4. **Neither**: document the gap in `03-testing.md` and let the operator decide which to adopt before writing visual tests.

### Option A: Chromatic (hosted, story-based)

Chromatic runs against the Storybook story corpus. Each story variant (light/dark × ES/EN matrix from `preview.tsx`) becomes a separate visual snapshot. Requires a `CHROMATIC_PROJECT_TOKEN` secret in CI.

```bash
# Run on changed stories only (recommended in CI)
npx chromatic --only-changed

# Run all stories (full baseline rebuild)
npx chromatic
```

CI golden command (in `package.json`):

```jsonc
{
  "test:visual": "chromatic --only-changed"
}
```

No additional test files are needed — Chromatic consumes the existing story matrix automatically.

### Option B: Playwright `toHaveScreenshot` (self-hosted)

Use for full-page or flow screenshots where story-level granularity is not sufficient (e.g., a multi-step form at each step).

**Pin the container in CI** to avoid font/OS rendering variance:

```yaml
# .github/workflows/visual.yml
jobs:
  visual:
    runs-on: ubuntu-latest
    container: { image: mcr.microsoft.com/playwright:v1.60.0-noble }
```

```typescript
// tests/e2e/visual.spec.ts — mark with @visual to allow selective skip
import { test, expect } from '@playwright/test'

test('home page @visual', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveScreenshot('home.png', { maxDiffPixelRatio: 0.01 })
})

test('checkout form step-1 @visual', async ({ page }) => {
  await page.goto('/cart')
  await expect(page).toHaveScreenshot('checkout-step1.png', { maxDiffPixelRatio: 0.01 })
})
```

Updating baselines after an intentional change:

```bash
npx playwright test --grep @visual --update-snapshots
```

### Guidance notes

- Use `maxDiffPixelRatio: 0.01` (1% pixel difference tolerance) as a starting point; tighten or loosen per component.
- Store baseline PNGs in the repo. Playwright's default snapshot location is the `<spec-file>-snapshots/` directory adjacent to the spec file (configurable via `snapshotPathTemplate` in `playwright.config.ts`). Review them in PRs just as you would review code.
- If the baseline does not exist yet, Playwright writes it on first run (`--update-snapshots`). Commit the initial baselines in a separate PR before enabling CI enforcement.

### Option C: Vitest Browser Mode component screenshots (Vitest 4.0+)

Use when the repo already has a Vitest browser project (`test.browser` enabled in `vitest.config.ts`) and you need component-level screenshot comparison without setting up Chromatic or a full Playwright visual suite.

```typescript
// src/components/PricingCard/PricingCard.browser.test.tsx
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { PricingCard } from './PricingCard'

it('matches visual snapshot', async () => {
  const screen = await render(<PricingCard tier="pro" price={49} />)
  await expect(screen.getByRole('article')).toMatchScreenshot('pricing-card-pro')   // component screenshot vs stored reference
})
```

Reference images are stored in `__screenshots__/` alongside the test file. Commit them to version control; CI fails when they drift.

**Platform-suffix caveat:** Vitest embeds both browser and OS platform in baseline filenames (e.g. `pricing-card-pro-chromium-darwin.png` vs `pricing-card-pro-chromium-linux.png`). Baselines committed from a macOS or Windows dev machine do not exist for Linux CI — the first CI run fails on **missing references**, not drift. The remedy is the same as Option B: generate and update baselines inside the pinned CI environment (the version-matched container). See `browser-mode.md` § "Visual regression testing (Vitest 4.0+)" for the full setup.

Update baselines after an intentional visual change:

```bash
vitest run --project browser --update
```

Use this option at component granularity; for full-page or multi-step flow screenshots, prefer Option B (Playwright).
