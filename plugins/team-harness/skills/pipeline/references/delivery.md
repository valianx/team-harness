# Delivery phase

Require passing acceptance evidence. Delegate local delivery preparation to
`delivery`: version/changelog proposal, commit and PR-body draft, changed-file
summary, and review evidence. Preparation must not push, create or mutate a PR,
merge, tag, release, or publish.

The primary thread consolidates the final diff and evidence, then presents
`STAGE-GATE-3` with `ship`, `amend`, and `abort`. Stop for the live operator
reply even when Stage Gate 1 granted autonomous iteration.

Only a valid dual-record `ship` release permits the specifically previewed
outward actions, and each action still requires normal Codex/runtime approval.
An `amend` decision returns to the smallest affected phase and invalidates the
old delivery evidence. Never force-push or publish broader scope than shown.
