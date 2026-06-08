# Testing Reference: unit tests

> Loaded on demand by the `tester` agent via the Reference Router.
> Stack-agnostic principles first, then per-stack sections keyed `## <stack>`.

## Principles (stack-agnostic)

- Unit tests verify the behavior of a **single function, hook, reducer, or utility** in isolation — no network, no database, no filesystem.
- They sit at the base of the pyramid: fast (milliseconds per test), zero external dependencies, runnable offline.
- When to choose unit over integration: the subject has no meaningful orchestration concern — it transforms input to output or manages local state. If mocking away all dependencies leaves a trivially thin test, the meaningful behavior is in the composition — write an integration test instead.
- Anti-patterns: testing implementation details (internal state shape, private method call counts); using real I/O; one giant test per module instead of one test per behavior.
- Each test must be independent and runnable in any order — no shared mutable state between tests.

## react-nextjs

Stack: Next.js App Router + TypeScript + Vitest 4.x + RTL (jsdom)

### When to write a unit test (vs story or E2E)

- Pure functions, hooks, reducers, and utils that have no meaningful visual output.
- Route handlers (`app/api/**/route.ts`) — tested as request/response without a server.
- Client components whose logic the story does not exercise (complex conditional rendering driven by hook state).
- Do NOT unit-test async Server Components — jsdom does not support them. Use Playwright E2E.

### Vitest config (two-project setup)

```typescript
// vitest.config.ts — unit project (jsdom)
import { defineConfig } from 'vitest/config'
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
      // storybook project defined separately — see ui-component.md
    ],
  },
})
```

```typescript
// vitest.setup.ts
import '@testing-library/jest-dom/vitest'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from './src/test/msw/server'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
```

### Hook / util test

```tsx
// src/hooks/useCart.test.ts
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { useCart } from './useCart'

describe('useCart', () => {
  it('accumulates item totals', () => {
    const { result } = renderHook(() => useCart())
    act(() => result.current.add({ id: '1', price: 100 }))
    expect(result.current.total).toBe(100)
  })
})
```

### Mocking next/navigation and next-intl

```tsx
import { vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import messages from '../messages/es.json'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/checkout',
  useSearchParams: () => new URLSearchParams(),
}))

function renderIntl(ui: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>,
  )
}
```

### Route handler test (app/api/**/route.ts)

```typescript
// src/app/api/transactions/route.test.ts
import { describe, it, expect } from 'vitest'
import { GET } from './route'

it('returns 200 with item list', async () => {
  const res = await GET(new Request('http://localhost/api/transactions'))
  expect(res.status).toBe(200)
  expect(await res.json()).toHaveProperty('items')
})
```

### File layout conventions

```
src/
  hooks/
    useCart.ts
    useCart.test.ts          # Vitest + RTL renderHook
  app/
    api/transactions/route.ts
    api/transactions/route.test.ts   # route handler as request/response
  components/
    Button/
      Button.tsx
      Button.test.tsx        # only when the story does not cover logic branches
      Button.stories.tsx     # canonical component test surface — see ui-component.md
```

## nestjs

Stack: NestJS / Express / Koa + Jest or Vitest

### When to write a unit test

- Service methods with business logic and mocked repositories.
- Utility functions, validators, guards, pipes, interceptors in isolation.
- Do NOT unit-test the NestJS DI container or module wiring — that belongs in integration tests.

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
> Principles: use the standard `testing` package; table-driven tests; `testify/assert`
> for assertions; `gomock` or `testify/mock` for interfaces; avoid global state.

## python

> v1 stub — pointer to source. Full content deferred to a future task.
>
> Source: existing vault pytest conventions.
>
> Principles: `pytest` fixtures for dependency injection; `unittest.mock.patch` for
> external calls; parametrize for data-driven cases; keep unit scope to a single
> function or class method.
