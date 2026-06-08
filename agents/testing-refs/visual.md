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
3. **Neither**: document the gap in `03-testing.md` and let the operator decide which to adopt before writing visual tests.

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
- Store baseline PNGs in the repo under `tests/e2e/__snapshots__/` (Playwright default). Review them in PRs just as you would review code.
- If the baseline does not exist yet, Playwright writes it on first run (`--update-snapshots`). Commit the initial baselines in a separate PR before enabling CI enforcement.
