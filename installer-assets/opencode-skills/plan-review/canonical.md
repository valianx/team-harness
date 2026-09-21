
# Plan Review (explicit direct mode)

This skill runs only when the operator invokes `/th:plan-review`. It is an
on-demand review of existing OpenSpec and plan artifacts, not a pipeline phase
or approval prerequisite.

## Input

1. Use the explicitly supplied absolute workspace and read its `01-plan.md`
   and bound OpenSpec change. If no workspace is supplied, ask the caller to
   select one; do not search by date, mtime, or newest directory.
2. Read the current OpenSpec artifacts and the plan. Use existing validation or
   review notes when supplied; do not require a generated projection identity.
3. Never modify planning sources or coordinator state.

## Review

The coordinator dispatches exactly one `plan-reviewer`. It checks canonical
OpenSpec coherence and `01-plan.md` projection fidelity. It does not define
acceptance, run a security design panel, or create a second semantic plan. Main
may persist the returned report at `{workspace}/reviews/01-plan-review.md`.

The report must distinguish a functional defect, a security finding, a structural contradiction,
and an editorial concern. It must include file/section pointers and a concise verdict. A plan
review never edits the plan or changes pipeline state.

This mode does not dispatch the dedicated `security` specialist unless the
operator explicitly requests that separate assessment.

## Output

Print the combined `pass|concerns|fail` verdict and the artifact pointer:

```text
Plan review: {pass|concerns|fail} — {one-line finding summary}
Report: {workspace}/reviews/01-plan-review.md
```

If OpenSpec changes, Main regenerates `01-plan.md`; only a new explicit
`/th:plan-review` invocation reviews the updated artifacts. No panel is
re-fired automatically.
