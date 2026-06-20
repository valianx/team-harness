# Testing References — Manifest

> Read by the `tester` agent Reference Router (Phase 0). Maps test type →
> reference file, and records which stacks each file covers. The router
> resolves `agents/testing-refs/{type}.md` and the `## {stack}` section.

| Type | File | Stacks covered (full) | Stacks stubbed |
|------|------|-----------------------|----------------|
| unit | unit.md | react-nextjs, nestjs | go, python |
| integration | integration.md | react-nextjs, nestjs | go, python |
| e2e | e2e.md | react-nextjs | nestjs, go, python |
| ui-component | ui-component.md | react-nextjs | — (type is FE-only) |
| visual | visual.md | react-nextjs | — (type is FE-only) |
| a11y | a11y.md | react-nextjs | — (type is FE-only) |
| browser-mode | browser-mode.md | react-nextjs | — (type is FE-only; nestjs/go/python: n/a) |
| cross-browser | cross-browser.md | react-nextjs | nestjs, go, python: n/a (browser-only axis) |

> **`cross-browser` axis note:** `cross-browser.md` is loaded **alongside** the warranted `e2e` or
> `browser-mode` reference — never as the sole warranted type. It is loaded **only when the dispatch
> payload carries `cross_browser: true`** (set exclusively by `/th:test-cross-browser`). Absent the
> flag, the tester's behavior is identical to today.

> **Engine-overlap note:** `ui-component` (Storybook + `@storybook/addon-vitest`), `visual` Option C (`toMatchScreenshot` in a browser project), `browser-mode` (`vitest-browser-react`), and `a11y` No-Storybook path (axe-core inside a vitest-browser-react test) all execute inside Vitest Browser Mode (`@vitest/browser-playwright`). When two types are warranted for a single AC, load both reference files and apply each file's boundary note: story = appearance + interaction; browser-mode = raw layout/observer assertions.

## Frontend AC category → test type

Use this table as the first lookup in Phase-0 when the task is frontend. The tester's decision rule points here; AC authors and the Reference Router share the same mapping.

| AC category | Warranted test type | Notes |
|-------------|--------------------|-----------------------------------------|
| Accessibility — ARIA roles | `a11y` | Real-browser axe (Storybook path or no-Storybook vitest-browser-react path); static markup checks may stay jsdom |
| Accessibility — keyboard nav, focus order | `ui-component` or `browser-mode` | axe cannot verify keyboard operability; use story play function + `userEvent.tab()` / keyboard events (`ui-component`), or `document.activeElement` assertions (`browser-mode`); axe as complement only |
| Accessibility — color contrast | `a11y` | Real-browser axe color-contrast rule — Storybook addon path or no-Storybook vitest-browser-react path in a11y.md (runs on the Browser Mode engine); never jsdom axe |
| Accessibility — focus-trap behavior, announcement sequencing | `browser-mode` | Explicit `document.activeElement` / DOM assertions; axe cannot verify focus-trap correctness (axe as complement only) |
| Responsive / breakpoint / viewport behaviour | `browser-mode` or `e2e` | Component in isolation → `browser-mode` (`matchMedia`, real CSS media queries, `ResizeObserver`); running application wins → `e2e` (Playwright viewport emulation) |
| Interaction state — pure logic (loading/empty/error toggling, hook output) | `unit` (jsdom) | No browser-API dependency; jsdom is sufficient and faster |
| Interaction state — hover/active/CSS transition/animation | `browser-mode` or `ui-component` | When the component has stories → `ui-component` (story play function; same real-browser engine); when no story exists or the assertion targets computed style/animation events outside a story → `browser-mode` |
| Visual consistency — spacing, typography, palette | `browser-mode` or `visual` | Use `visual` when a baseline image captures the contract best; use `browser-mode` for computed-style assertions |
| Multi-page journey, auth flow, redirects, Server Actions | `e2e` | Requires a running Next.js server; Playwright E2E (`e2e.md`) |
| Browser APIs outside the enumerated families (clipboard, geolocation, fullscreen, notifications, etc.) | `browser-mode` | Verify the API is available and permission-grantable under the Playwright provider before authoring; record per-API setup in the decision log |

> **Note:** this table is the tester's Phase-0 decision rule anchor. AC authors should align vocabulary with the "AC category" column so the router can resolve the type without ambiguity.

## Path convention

`agents/testing-refs/{type}.md`, section anchor `## {stack}`.

## Fallback

A stubbed or absent `(type, stack)` → use the file's `## Principles` preamble +
repo-discovered conventions; record a reference gap in `03-testing.md`. Never
fabricate a library API; context7 verification stays mandatory.
