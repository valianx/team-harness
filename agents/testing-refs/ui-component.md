# Testing Reference: ui-component tests

> Loaded on demand by the `tester` agent via the Reference Router.
> Stack-agnostic principles first, then per-stack sections keyed `## <stack>`.

## Principles (stack-agnostic)

- UI component tests verify **rendering, interactivity, and accessibility of a single component** in an isolated environment — no real network, no real routing.
- They sit between unit and E2E: faster than E2E (no server, no browser navigation), higher fidelity than unit (real DOM, real styles, real event dispatch).
- When to choose a component test: the subject renders a visual surface that a user interacts with, and the meaningful assertions are about what the user sees and can do — not about internal hook state or service calls.
- The component test surface and the story surface should be **one and the same** wherever possible. A story with a `play` function IS the component test — no duplication needed.
- Anti-patterns: asserting internal state or refs instead of rendered output; using `fireEvent` when `userEvent` models real interactions; testing implementation details (which internal function was called); writing component tests for async Server Components (use E2E instead).

## react-nextjs

Stack: Next.js App Router + TypeScript + Storybook 10.x + `@storybook/addon-vitest` (Vitest browser mode)

### Decision: story-as-test

The canonical component test surface is the **Storybook story**, executed by `@storybook/addon-vitest` in a real browser via Vitest browser mode. Each story that carries a `play` function becomes a blocking test in CI. The a11y addon runs axe automatically on every story (configured to `test: 'error'`).

RTL + jsdom is the fallback for non-story components (utilities with JSX, hooks tested via `renderHook`). See unit.md for that path.

### Setup

```bash
# One-command setup (detects installed versions, generates config):
npx storybook add @storybook/addon-vitest
```

This generates `vitest.config.ts` (with a `storybook` project) and `.storybook/vitest.setup.ts`. Review the output before committing.

Manual setup if needed:

```typescript
// vitest.config.ts — storybook project (browser mode)
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      // unit project — see unit.md
      {
        extends: true,
        plugins: [
          storybookTest({ configDir: path.join(dirname, '.storybook') }),
        ],
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            provider: playwright(),  // Vitest 4: function call, not string 'playwright'
            headless: true,
            instances: [{ browser: 'chromium' }],
          },
          setupFiles: ['./.storybook/vitest.setup.ts'],
        },
      },
    ],
  },
})
```

```typescript
// .storybook/vitest.setup.ts — wires a11y addon to the storybook project
import { beforeAll } from 'vitest'
import { setProjectAnnotations } from '@storybook/nextjs-vite'
import * as a11yAddonAnnotations from '@storybook/addon-a11y/preview'
import * as previewAnnotations from './preview'

const annotations = setProjectAnnotations([previewAnnotations, a11yAddonAnnotations])
beforeAll(annotations.beforeAll)  // runs Storybook's beforeAll (incl. axe)
```

```tsx
// .storybook/preview.tsx — global decorators: theme, next-intl, MSW
import type { Preview } from '@storybook/nextjs-vite'
import { NextIntlClientProvider } from 'next-intl'
import { initialize, mswLoader } from 'msw-storybook-addon'
import es from '../messages/es.json'
import en from '../messages/en.json'

initialize()  // MSW service worker for stories

const messages = { es, en }

const preview: Preview = {
  parameters: { a11y: { test: 'error' } },  // axe failures fail the test, not just warn
  globalTypes: {
    locale: { defaultValue: 'es', toolbar: { items: ['es', 'en'] } },
    theme:  { defaultValue: 'light', toolbar: { items: ['light', 'dark'] } },
  },
  loaders: [mswLoader],
  decorators: [
    (Story, ctx) => (
      <NextIntlClientProvider locale={ctx.globals.locale} messages={messages[ctx.globals.locale]}>
        <div data-theme={ctx.globals.theme} className={ctx.globals.theme}>
          <Story />
        </div>
      </NextIntlClientProvider>
    ),
  ],
}
export default preview
```

### Writing a story as a component test

```tsx
// src/components/Button/Button.stories.tsx
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn } from 'storybook/test'
import { Button } from './Button'

const meta: Meta<typeof Button> = {
  component: Button,
  args: { onClick: fn() },
}
export default meta
type Story = StoryObj<typeof Button>

export const Primary: Story = { args: { variant: 'primary', children: 'Save' } }

// Interaction assertion — runs as a test under addon-vitest
export const ClicksOnce: Story = {
  args: { children: 'Submit' },
  play: async ({ canvas, args, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Submit' }))
    await expect(args.onClick).toHaveBeenCalledOnce()
  },
}
```

- The **light/dark × ES/EN** variants come from the global toolbar in `preview.tsx`; addon-vitest runs the story under configured globals.
- The **axe check** runs automatically per story (from `.storybook/vitest.setup.ts` + `a11y.test: 'error'`). No per-component addition needed.

### Story with MSW network override

```tsx
export const EmptyState: Story = {
  parameters: {
    msw: { handlers: [http.get('/api/transactions', () => HttpResponse.json({ items: [] }))] },
  },
}
```

### Golden commands

```jsonc
// package.json
{
  "test": "vitest run",              // units + stories
  "test:storybook": "vitest run --project=storybook"
}
```

### File layout

```
src/
  components/
    Button/
      Button.tsx
      Button.stories.tsx   # canonical component test surface
      Button.test.tsx      # only for logic branches the story cannot cover
.storybook/
  main.ts
  preview.tsx
  vitest.setup.ts
vitest.config.ts
```
