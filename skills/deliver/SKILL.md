---
name: deliver
description: Resume an already-validated workspace at its release gate and publish it after explicit operator approval.
---

Analyze the input: $ARGUMENTS

## Route

Always route through the top-level `orchestrator`; never invoke `delivery`
directly.

When a feature name is present, pass:

```text
Direct Mode Task:
- Mode: deliver
- Feature: {feature-name}
```

When no feature name is present:

1. inspect only `workspaces/*/00-state.md`;
2. select the sole workspace with completed verification and an unresolved
   release gate;
3. when several qualify, ask the operator which feature to deliver; and
4. when none qualify, report that no validated workspace is ready.

## Boundary

- This skill does not run sketch checks, tests, CI, or publication commands.
- The orchestrator re-presents any unresolved STAGE-GATE-3 before publishing.
- After `ship`, Phase 4 invokes `delivery` once for changelog, acceptance matrix,
  and PR-body prose, then the orchestrator executes the deterministic mechanics.
- Completion reports the PR URL and current merge state. CI is reported as the
  current snapshot; the flow never waits for CI to finish.
