---
name: plan-review
description: Audit a Stage 1 plan on explicit operator request.
---

# Plan Review (explicit direct mode)

This skill runs only when the operator invokes `/th:plan-review`. It is not an automatic pipeline
phase, a Gate 1 prerequisite, or a post-approval offer. The canonical pipeline remains
`design → waiting_gate1 → implementation → validation → waiting_gate3 → delivery → complete`.

## Input

1. If a feature name is supplied, resolve `workspaces/{feature-name}/01-plan.md` (or the
   configured Obsidian `docs_root`) and its bound OpenSpec change.
2. Without a name, find active workspace plans. If none exist, report that the operator must run
   `/th:design` or `/th:plan` first. If several exist, ask which plan to review.
3. Read the compact projection, current OpenSpec artifacts, strict-validation result, and pinned
   identity. Never infer a gate release or modify `00-state.md`.

## Review

The coordinator dispatches exactly one surviving `plan-reviewer`. It checks canonical OpenSpec
coherence and `01-plan.md` projection fidelity. It does not define acceptance, run a security
design panel, or create a second semantic plan. The coordinator alone may persist the returned
report and remains the sole writer of `00-state.md`, events, and the control log.

The report must distinguish a functional defect, a security finding, a structural contradiction,
and an editorial concern. It must include file/section pointers and a concise verdict. A plan
review never edits the plan and never releases either pipeline gate.

This single-reviewer mode does not dispatch the dedicated `security`
specialist. Always make that omission visible in the operator result:
`Security specialist: not run — invoke /th:security for a separate security
assessment.` This notice is not a security pass and does not add an automatic
panel.

## Output

Print the combined `pass|concerns|fail` verdict and the artifact pointer:

```text
Plan review: {pass|concerns|fail} — {one-line finding summary}
Security specialist: not run — invoke /th:security for a separate security assessment.
Report: workspaces/{feature-name}/reviews/01-plan-review.md
```

If OpenSpec changes, Main regenerates `01-plan.md`; only a new explicit `/th:plan-review`
invocation reviews the new identity. The pipeline never re-fires a panel automatically.
