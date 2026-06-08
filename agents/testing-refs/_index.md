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

## Path convention

`agents/testing-refs/{type}.md`, section anchor `## {stack}`.

## Fallback

A stubbed or absent `(type, stack)` → use the file's `## Principles` preamble +
repo-discovered conventions; record a reference gap in `03-testing.md`. Never
fabricate a library API; context7 verification stays mandatory.
