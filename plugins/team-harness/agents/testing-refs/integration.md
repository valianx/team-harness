# Testing Reference: integration tests

> Loaded on demand by the `tester` agent via the Reference Router.
> Stack-agnostic principles first, then per-stack sections keyed `## <stack>`.

## Principles (stack-agnostic)

- Integration tests verify that **multiple units compose correctly** — they mock the network boundary but not the internal wiring between modules.
- They sit in the middle of the pyramid: slower than units (real module init, mock I/O setup), faster than E2E (no browser, no server process).
- When to choose integration over unit: the subject orchestrates multiple collaborators (service + repository + cache) and the interesting behavior is in the composition, not in any single unit.
- When to choose integration over E2E: the behavior does not require a real HTTP server or browser — mocked network responses are sufficient to exercise the meaningful paths.
- Anti-patterns: standing up a real database or external service (that is E2E territory); testing internal implementation details of individual collaborators; one monolithic test per module instead of per behavior.
- Each test must clean up its mocks and any shared state to avoid cross-test contamination.

## react-nextjs

Stack: Next.js App Router + TypeScript + Vitest 4.x + RTL + MSW 2.x

### When to write an integration test (vs unit or story)

- A slice of the UI that composes multiple client components + a data-fetch hook + network interaction.
- A workflow that involves form state, validation, and a mocked API response.
- Do NOT duplicate behavior already covered by a Storybook play function. If a story already exercises the interaction path via MSW override, an RTL integration test adds no value.
- Do NOT write integration tests for async Server Components — use Playwright E2E.

### MSW shared handler setup

```typescript
// src/test/msw/handlers.ts
import { http, HttpResponse } from 'msw'

export const handlers = [
  http.get('/api/transactions', () =>
    HttpResponse.json({ items: [{ id: '1', amount: 100 }] }),
  ),
]

// src/test/msw/server.ts (Node — Vitest)
import { setupServer } from 'msw/node'
import { handlers } from './handlers'
export const server = setupServer(...handlers)
```

The same handlers file is consumed by:
- `vitest.setup.ts` (project `unit`) — wraps Vitest lifecycle
- `msw-storybook-addon` (Storybook stories) — see ui-component.md

### Integration test with RTL + MSW

```tsx
// src/features/cart/CartSlice.test.tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { server } from '../test/msw/server'
import { http, HttpResponse } from 'msw'
import { CartSlice } from './CartSlice'

it('shows empty-state message when the API returns an empty list', async () => {
  server.use(
    http.get('/api/transactions', () => HttpResponse.json({ items: [] })),
  )
  render(<CartSlice />)
  await waitFor(() =>
    expect(screen.getByText('No hay transacciones')).toBeVisible(),
  )
})
```

### Mocking next-intl in an integration test

```tsx
import { NextIntlClientProvider } from 'next-intl'
import messages from '../messages/es.json'

function renderIntl(ui: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>,
  )
}
```

### RSC note

MSW intercepts client-side and route-handler fetches reliably. A Server Component's data-fetching happens in the server runtime and is not interceptable by MSW in-process. Validate those paths via Playwright E2E with seeded test data.

## nestjs

Stack: NestJS + Jest or Vitest (integration = NestJS Test module, real DI, mocked I/O)

### When to write an integration test

- Module wiring: ensure the NestJS DI container resolves all dependencies correctly.
- Service + repository composition: real service calling a mocked (TypeORM test-repo or `jest.fn()`) repository.
- Controller + service: HTTP request through the NestJS Test module without a real HTTP server.

### Common pitfalls (preserved verbatim from prior tester.md § Common Testing Pitfalls)

When the project is NestJS / Express / Koa, walk through these checks during Phase 1 (test plan) — they shape how you mock and what coverage you can realistically chase:

- **TypeORM entity coverage cap.** Decorators with `nullable: true` count as branches that are never exercised in normal tests; entity files cap naturally at ~56-80% branch coverage. If you are chasing >80% global branch coverage, exclude `**/entities/**` from coverage collection in the framework config. Don't fight the cap inline.
- **Background callbacks (`setImmediate` / `setTimeout` for fire-and-forget).** If the service uses `setImmediate(() => method().catch(...))` for fire-and-forget work, the test must (1) replace `globalThis.setImmediate` with a capturer, (2) execute the captured callback via `Promise.resolve().then(fn)` to track the inner promise, (3) use a short timeout (≤50ms) so orphaned timer handles do not keep the Jest worker alive between specs.
- **`error?.message || String(error)` branches.** To cover the right-hand side of the `||`, reject the mocked dependency with a raw string (`mockRejectedValue('raw-error-message')`), not `new Error(...)`. Both branches need coverage.
- **Mocks of Koa / Express controllers with env vars.** Set `process.env.X` **before** `require()`-ing the controller module — env reads at module-load time will lock to whatever was set at first import. Prefer `jest.mock(path, () => factory)` and put the `require()` of the mock *inside* the factory function so re-mocks do not leak across files.
- **Time-sensitive tests (`moment.utc()`, date ranges, boundary assertions).** Always use the framework's fake timer + system-time tools: `jest.useFakeTimers()` + `jest.setSystemTime(date)` (Jest), or `vi.useFakeTimers()` + `vi.setSystemTime(date)` (Vitest). `moment.utc()` respects fake timers. Cover boundary cases: `00:00:00 UTC`, `23:59:59 UTC`, and the offset where the local TZ flips day (e.g. `02:00 UTC` for Santiago).
- **Date-range pickers exclusive on `to`.** When the code under test uses `[from, to)` (inclusive `from`, exclusive `to`), assert `dateTo - dateFrom === 86_400_000` for a one-day range — NOT `dateTo - dateFrom === 86_399_999` and NOT `=== 86_400_001`.

These pitfalls have been observed repeatedly across NestJS services. Surface them in the test plan rather than re-discovering them through failing tests.

## go

> v1 stub — pointer to source. Full content deferred to a future task.
>
> Source: existing vault recipe `Go Testing Recipe - Unit, Mutation & E2E`.
>
> Principles: use `httptest.NewRecorder` + `httptest.NewRequest` to test handlers
> without a live server; use interface mocks (via `gomock` or manual fakes) for
> repository and external-service dependencies.

## python

> v1 stub — pointer to source. Full content deferred to a future task.
>
> Source: existing vault pytest conventions.
>
> Principles: use `pytest` with `unittest.mock.patch` or `responses` (for HTTP);
> `pytest-django` `TestCase` or `pytest-flask` app context for framework wiring tests.
