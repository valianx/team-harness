# Implementer stack guardrails

Read only the section matching the stack and surface changed by the assigned task. Local repository conventions and pinned versions outrank this reference.

## NestJS and OpenTelemetry

- Initialize the OpenTelemetry SDK before `NestFactory.create()`; import its bootstrap first.
- Keep the `@opentelemetry/*` family on one compatible release train.
- In `@opentelemetry/resources` v2 use `resourceFromAttributes(...)` and `defaultResource()`, not the removed `Resource` class.
- For `@opentelemetry/sdk-logs` v0.214+, pass `logRecordProcessors` to the `LoggerProvider` constructor.
- After a major OpenTelemetry upgrade, smoke-test runtime startup.

## Next.js, shadcn/ui, and React

- Determine the installed shadcn/ui generation from local dependencies and components. Base UI uses `render={...}` and `data-open`/`data-closed`; do not apply Radix `asChild`/`data-state` patterns to it.
- Follow the repository's existing `middleware` or `proxy` convention; new Next.js 16+ surfaces prefer `proxy`.
- An auto-fetching hook starts in loading state when it fetches on mount.
- A client-only dynamic component uses a dimension-matched loading fallback when the surrounding UI requires layout stability.
- Add route-segment `loading.tsx` only when the changed App Router detail route needs a server-loading boundary.
- Select reactive Zustand data and derive from it; do not hide reactive state behind a non-reactive getter.
