
# Plan Review (explicit direct mode)

This skill runs only when the operator invokes `/th:plan-review`. It is not an automatic pipeline
phase, a Gate 1 prerequisite, or a post-approval offer. The canonical pipeline remains
`design → waiting_gate1 → implementation → validation → waiting_gate3 → delivery → complete`.

## Input

1. If a feature name is supplied, resolve `workspaces/{feature-name}/01-plan.md` (or the
   configured Obsidian `docs_root`).
2. Without a name, find active workspace plans. If none exist, report that the operator must run
   `/th:design` or `/th:plan` first. If several exist, ask which plan to review.
3. Read the current plan and its state. Never infer a gate release or modify `00-state.md`.

## Review

The coordinator dispatches the requested plan-review lenses directly: `qa-plan` for acceptance
criteria, `security` when the state says the design is sensitive, and `plan-reviewer` for shape.
Each specialist writes only its declared section of the existing review artifact, or returns a
status block for coordinator-owned persistence. The coordinator is the sole writer of
`00-state.md`, events, and the decision ledger.

The report must distinguish a functional defect, a security finding, a structural contradiction,
and an editorial concern. It must include file/section pointers and a concise verdict. A plan
review never edits the plan and never releases either pipeline gate.

## Output

Print the combined `pass|concerns|fail` verdict and the artifact pointer:

```text
Plan review: {pass|concerns|fail} — {one-line finding summary}
Report: workspaces/{feature-name}/reviews/01-plan-review.md
```

If the operator later edits the plan, a new explicit `/th:plan-review` invocation reviews the new
artifact. The pipeline does not automatically re-fire a panel or create a new state.
