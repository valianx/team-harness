
# Plan Review (explicit direct mode)

This skill runs only when the operator invokes `/th:plan-review`. It is an
on-demand review of existing OpenSpec and plan artifacts, not a pipeline phase
or approval prerequisite.

## Input

1. Use the explicitly supplied absolute workspace and read its `01-plan.md`
   and bound OpenSpec change. If no workspace is supplied, ask the caller to
   select one; do not search by date, mtime, or newest directory.
2. Read the current OpenSpec artifacts and the plan. Use supplied validation or
   review notes and, for a corrected plan, any supplied relevant delta, previous
   findings or versions. Unavailable history does not block review or require
   reconstructing unrelated conversations. Do not require a generated projection
   identity.
3. Never modify planning sources or coordinator state.

## Review

The coordinator dispatches exactly one read-only review per explicit invocation.
Claude Code and OpenCode use their semantic `plan-reviewer` role. Codex has no registered
`plan-reviewer`: read the canonical [role guidance](../../agents/plan-reviewer.md)
and pass its body to one available native read-only review assignment, preserving
that assignment's existing model, effort, tools and permissions. The review checks
canonical OpenSpec coherence and `01-plan.md` projection fidelity; it does not
define acceptance, run a security design panel or create a second semantic plan.
Main may persist the returned report at `{workspace}/reviews/01-plan-review.md`.

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
