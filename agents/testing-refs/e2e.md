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

## react-nextjs

Stack: Next.js App Router + TypeScript + Playwright 1.60 + `@axe-core/playwright`

### When to write an E2E test (vs unit or story)

Write E2E when the behavior requires the full Next.js server runtime:
- **async Server Components** — jsdom and Vitest browser mode do not render async RSC. Decompose: extract testable logic into client components with stories; leave the RSC as a thin data-fetch shell exercised only by E2E.
- **Server Actions (full round-trip)** — the complete submit/revalidate/redirect cycle. The action's business logic can be unit-tested as an async function; the round-trip belongs in E2E.
- **Middleware and redirects** — run in the server runtime.
- **Multi-page flows** — login → dashboard → checkout → confirmation.

### Playwright config

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && npm run start',  // real server for async RSC / Server Actions
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
})
```

### Flow test + page-level a11y

```typescript
// tests/e2e/checkout.spec.ts
import { test, expect } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'

test('checkout completes and redirects to confirmation', async ({ page }) => {
  await page.goto('/cart')
  await page.getByRole('button', { name: 'Pay' }).click()
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

### App Router gotchas

| Case | Why it is hard | What to do |
|------|----------------|------------|
| async Server Component | jsdom/browser mode do not support it | E2E only. Extract logic into client components with stories; RSC is a thin shell. |
| Server Action (full round-trip) | progressive enhancement, revalidate, redirect | Business logic → unit test; submit round-trip → E2E. |
| Middleware / redirects | Run in server runtime | E2E only. |
| `next/navigation` | Breaks outside Next | In Vitest: `vi.mock('next/navigation', …)`. In Playwright: full real routing. |

### Golden commands

```jsonc
// package.json
{
  "test:e2e": "playwright test",
  "test:e2e:ui": "playwright test --ui"
}
```

CI container: use `mcr.microsoft.com/playwright:v1.60.0-noble` to ensure browser binaries match the installed version.

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
