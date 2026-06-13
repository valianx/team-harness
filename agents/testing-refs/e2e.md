# Testing Reference: e2e tests

> Loaded on demand by the `tester` agent via the Reference Router.
> Stack-agnostic principles first, then per-stack sections keyed `## <stack>`.

## Principles (stack-agnostic)

- E2E tests verify **complete user flows against a running application** — real browser, real server, real network (or a test-seeded variant of it).
- They sit at the top of the pyramid: slowest (browser launch, server startup, network round-trips), highest fidelity, most expensive to maintain.
- When to choose E2E: the behavior requires a real server runtime — async Server Components, Server Actions, middleware/redirects, multi-page flows, database-backed reads.
- Keep the E2E suite **thin and deliberate**: cover the flows that generate business value (login, checkout, critical path). Do not mirror unit or component coverage in E2E.
- Anti-patterns: using E2E for behavior coverable by unit or component tests; brittle selectors (text content, positional CSS); sleep-based waiting instead of auto-wait; no retry / flake management in CI.
- Every E2E that checks a UI surface should also run an axe accessibility scan on that page — page-level a11y cannot be verified in jsdom.
- **Selector hierarchy (user-facing first):** `getByRole` (most robust — mirrors a11y tree, doubles as accessibility check) → `getByLabel` / `getByText` / `getByPlaceholder` → `getByTestId` (last resort, requires `data-testid` markup). **Avoid** CSS selectors and XPath — they couple tests to implementation structure and break silently on refactors.
- **Web-first assertions:** always use `await expect(locator).toBeVisible()`, `toHaveText()`, `toHaveURL()`, etc. instead of manual `waitForSelector` or snapshot-checking booleans. Web-first assertions auto-retry until the condition holds or the timeout expires, eliminating most flakiness from async UI updates.

## react-nextjs

Stack: Next.js App Router + TypeScript + Playwright 1.60 + `@axe-core/playwright`

> **Component-in-isolation tests that need real browser APIs** (layout, observers, animations, real CSS) belong in **Vitest Browser Mode**, not here. See `agents/testing-refs/browser-mode.md`. Use Playwright when the behavior requires a running Next.js server — multi-page flows, Server Actions, middleware, async RSC.

### When to write an E2E test (vs unit or story)

Write E2E when the behavior requires the full Next.js server runtime:
- **async Server Components** — jsdom and Vitest browser mode do not render async RSC. Decompose: extract testable logic into client components with stories; leave the RSC as a thin data-fetch shell exercised only by E2E.
- **Server Actions (full round-trip)** — the complete submit/revalidate/redirect cycle. The action's business logic can be unit-tested as an async function; the round-trip belongs in E2E.
- **Middleware and redirects** — run in the server runtime.
- **Multi-page flows** — login → dashboard → checkout → confirmation.

### Responsive assertions in E2E

For full-page responsive behavior in a running application, use Playwright's viewport emulation. Prefer per-project defaults in `playwright.config.ts`; override inline for one-off assertions.

```typescript
// playwright.config.ts — set a mobile viewport for a whole project
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile-chrome',
      use: {
        ...devices['iPhone 13'],          // sets viewport + userAgent + touch emulation
        // or: viewport: { width: 375, height: 667 }  for a custom size
      },
    },
  ],
})
```

```typescript
// tests/e2e/responsive.spec.ts — inline viewport override for a single test
import { test, expect } from '@playwright/test'

test('home page has no horizontal scroll on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await page.goto('/')
  const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
  expect(bodyWidth).toBeLessThanOrEqual(375)
})
```

> For component-in-isolation responsive tests (no running server), use `page.viewport()` from `vitest/browser` — see `browser-mode.md` § "Viewport control".

### Selectors — user-facing first

Prefer locators in this order. Each lower tier is acceptable only when higher tiers are not available in the current markup.

| Tier | Locator | Notes |
|------|---------|-------|
| 1st | `getByRole('button', { name: 'Pay' })` | Queries the a11y tree; doubles as an accessibility check |
| 2nd | `getByLabel('Card number')` | Relies on `<label>` / `aria-label` association |
| 2nd | `getByText('Thank you')` | Good for static text nodes; substring + case-insensitive matching is the default; use `exact: true` to require a whole-string match |
| 2nd | `getByPlaceholder('Search…')` | For inputs without a label |
| 3rd | `getByTestId('submit-btn')` | Requires `data-testid` attribute; does not check a11y |
| avoid | `locator('.card > button')` | CSS — couples test to DOM structure |
| avoid | `locator('//div[@class="card"]')` | XPath — same problem, harder to read |

`getByRole` is the default first choice — it queries the accessibility tree, so a failing locator is also an accessibility signal.

### Playwright config

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : undefined,
  reporter: process.env.CI ? [['html'], ['github']] : 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',       // capture trace on the first retry; open with: npx playwright show-trace
    screenshot: 'only-on-failure', // attached to the HTML report automatically
    video: 'off',                  // enable per-project if needed for debugging
  },

  // Multi-browser projects — chromium is the default CI target; add firefox/webkit when cross-browser parity matters
  projects: [
    // Setup project runs once before tests (auth, seed data)
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'], // wait for setup before running tests
    },
    // Uncomment for explicit cross-browser coverage:
    // { name: 'firefox',  use: { ...devices['Desktop Firefox'] }, dependencies: ['setup'] },
    // { name: 'webkit',   use: { ...devices['Desktop Safari'] },  dependencies: ['setup'] },
  ],

  // Boot the real Next.js server — required for async RSC and Server Actions
  webServer: {
    command: 'npm run build && npm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000, // Next.js build can take a while
  },
})
```

### Auth — persisted storageState (never re-login per test)

Login is expensive (network round-trip + token exchange). Do it once, save the browser state, and reuse it across tests.

```typescript
// tests/e2e/auth.setup.ts  — runs as the 'setup' project
import { test as setup, expect } from '@playwright/test'
import path from 'path'

const authFile = path.join(__dirname, '../.auth/user.json')

setup('authenticate', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill(process.env.TEST_USER_EMAIL!)
  await page.getByLabel('Password').fill(process.env.TEST_USER_PASSWORD!)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/dashboard')

  // Persist cookies + localStorage → shared by all dependent projects
  await page.context().storageState({ path: authFile })
})
```

```typescript
// playwright.config.ts — inside the chromium project definition
{
  name: 'chromium',
  use: {
    ...devices['Desktop Chrome'],
    storageState: 'tests/.auth/user.json', // injected into every test; no re-login
  },
  dependencies: ['setup'],
},
```

Add `tests/.auth/` to `.gitignore` — it contains session tokens.

### Fixtures over Page Object Model

For small/medium suites, composable fixtures around business actions are easier to maintain than a full Page Object hierarchy. Extract fixtures into a shared file; import the extended `test` in your specs.

```typescript
// tests/e2e/fixtures.ts
import { test as base, expect } from '@playwright/test'

type Fixtures = {
  cartPage: { addItem: (name: string) => Promise<void> }
}

export const test = base.extend<Fixtures>({
  cartPage: async ({ page }, use) => {
    const addItem = async (name: string) => {
      await page.goto('/shop')
      await page.getByRole('button', { name: `Add ${name}` }).click()
      await expect(page.getByRole('status')).toContainText('added')
    }
    await use({ addItem })
  },
})

export { expect }
```

```typescript
// tests/e2e/checkout.spec.ts — imports the extended test, not the base
import { test, expect } from './fixtures'

test('checkout completes and redirects to confirmation', async ({ page, cartPage }) => {
  await cartPage.addItem('T-Shirt')
  await page.getByRole('link', { name: 'Checkout' }).click()
  await page.getByLabel('Card number').fill('4242424242424242')
  await page.getByRole('button', { name: 'Confirm' }).click()
  await expect(page).toHaveURL(/\/confirmation/)
  await expect(page.getByText('Thank you for your purchase')).toBeVisible()
})
```

Use Page Objects when the suite grows large enough that the same page's interactions are referenced in many spec files and fixture composition alone becomes hard to follow. The threshold is roughly 10+ spec files touching the same surface.

### Web-first assertions

Web-first assertions retry automatically until the assertion passes or the timeout fires. This removes the need for manual polling, `waitForSelector`, or `page.waitForTimeout`.

```typescript
// Preferred — web-first, auto-retried
await expect(page.getByRole('status')).toBeVisible()
await expect(page.getByRole('heading', { name: 'Confirmation' })).toHaveText('Order confirmed')
await expect(page).toHaveURL(/\/confirmation/)
await expect(page.getByRole('button', { name: 'Pay' })).toBeEnabled()
await expect(page.getByRole('listitem')).toHaveCount(3)

// Avoid — does not retry, brittle on async updates
const el = await page.$('.status')
expect(await el?.isVisible()).toBe(true)
```

Common web-first assertions: `toBeVisible`, `toBeHidden`, `toBeEnabled`, `toBeDisabled`, `toHaveText`, `toContainText`, `toHaveValue`, `toHaveURL`, `toHaveTitle`, `toHaveCount`.

### Flow test + page-level a11y

```typescript
// tests/e2e/checkout.spec.ts
import { test, expect } from './fixtures'
import { AxeBuilder } from '@axe-core/playwright'

test('checkout completes and redirects to confirmation', async ({ page, cartPage }) => {
  await cartPage.addItem('T-Shirt')
  await page.getByRole('link', { name: 'Checkout' }).click()
  await page.getByLabel('Card number').fill('4242424242424242')
  await page.getByRole('button', { name: 'Confirm' }).click()
  await expect(page).toHaveURL(/\/confirmation/)
  await expect(page.getByText('Thank you for your purchase')).toBeVisible()
})

test('checkout page has no axe violations', async ({ page }) => {
  await page.goto('/cart')
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})
```

### Debugging flaky tests — Trace Viewer

When a test is flaky or failing in CI, open the trace before touching the test code:

```bash
# After a failed CI run, download trace.zip from the HTML report and open locally:
npx playwright show-trace trace.zip

# Or run locally with trace always on to capture a baseline:
npx playwright test --trace on
```

The Trace Viewer shows every action, screenshot, network request, and console log in a timeline. Diagnose the root cause (timing, selector mismatch, missing wait) before changing assertions or adding sleeps.

### App Router gotchas

| Case | Why it is hard | What to do |
|------|----------------|------------|
| async Server Component | jsdom/Vitest Browser Mode do not support it | E2E only. Extract logic into client components with stories; RSC is a thin shell. |
| Server Action (full round-trip) | progressive enhancement, revalidate, redirect | Business logic → unit test; submit round-trip → E2E. |
| Middleware / redirects | Run in server runtime | E2E only. |
| `next/navigation` | Breaks outside Next | In Vitest: `vi.mock('next/navigation', …)`. In Playwright: full real routing. |

### CI — sharding, timeouts, Docker image

```yaml
# .github/workflows/e2e.yml (excerpt)
jobs:
  e2e:
    strategy:
      matrix:
        shard: [1, 2, 3, 4]   # adjust to suite size; 4 shards cuts wall-clock time ~75%
    container:
      image: mcr.microsoft.com/playwright:v1.60.0-noble  # version-matched: matches @playwright/test 1.60.0
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npx playwright test --shard=${{ matrix.shard }}/${{ strategy.job-total }}
        timeout-minutes: 15
        env:
          CI: true
          TEST_USER_EMAIL: ${{ secrets.TEST_USER_EMAIL }}
          TEST_USER_PASSWORD: ${{ secrets.TEST_USER_PASSWORD }}
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report-shard-${{ matrix.shard }}
          path: playwright-report/
          retention-days: 7
```

CI container rules:
- The Docker image tag **must match** the installed `@playwright/test` version — `v1.60.0-noble` matches `@playwright/test@1.60.0` exactly. Mismatched tags cause browser binary resolution failures.
- Set an explicit `timeout-minutes` on the step; never rely on the CI default (usually 6 h).
- Upload the `playwright-report/` artifact on `always()` so HTML reports (with traces and screenshots) are accessible after failures.
- `screenshot: 'only-on-failure'` in `playwright.config.ts` ensures screenshots are embedded in the report without storing them for every passing test.

### Golden commands

```jsonc
// package.json
{
  "test:e2e": "playwright test",
  "test:e2e:ui": "playwright test --ui",
  "test:e2e:debug": "playwright test --debug",
  "test:e2e:headed": "playwright test --headed"
}
```

```bash
# First-time setup — install Playwright and download browser binaries
npm install -D @playwright/test@1.60.0
npx playwright install --with-deps chromium

# Run with trace always on (debugging)
npx playwright test --trace on

# Open last trace
npx playwright show-trace test-results/*/trace.zip
```

### Where to look when it fails

| Artifact | Location | How to open |
|----------|----------|-------------|
| HTML report | `playwright-report/` | `npx playwright show-report` — interactive timeline with steps, screenshots, and traces |
| Traces | `playwright-report/` (also available as standalone `.zip` after CI artifact download) | `npx playwright show-trace <path-to-trace.zip>` |
| Screenshots | `playwright-report/` (embedded in the HTML report) | Open `playwright-report/index.html` and navigate to the failing test |
| Repro command | — | `npx playwright test <file> -g '<exact test name>' --headed` |

Trace mode and CI artifact upload are configured in the Playwright config and CI sections above. For component-in-isolation failures (no running server), see `browser-mode.md` § "Where to look when it fails".

## nestjs

> v1 stub — pointer to source. Full content deferred to a future task.
>
> Principles: NestJS E2E tests use `@nestjs/testing` + `supertest` against a real
> NestJS HTTP adapter (no mock DI). They belong at the controller/module boundary.
> Source: existing vault recipe `NestJS Testing Recipe - Unit, Integration, Contract & Mutation`.

## go

> v1 stub — pointer to source. Full content deferred to a future task.
>
> Principles: Go E2E / acceptance tests spin up a `net/http/httptest.Server` or the
> full binary and drive it with an HTTP client. Source: existing vault recipe
> `Go Testing Recipe - Unit, Mutation & E2E`.

## python

> v1 stub — pointer to source. Full content deferred to a future task.
>
> Principles: use `pytest` + `playwright-pytest` or `requests`/`httpx` against a
> live server started by a session-scoped fixture. Source: existing vault pytest conventions.
