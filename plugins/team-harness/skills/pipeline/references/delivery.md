# Delivery phase

Require passing acceptance evidence. Delegate local delivery preparation with
`plan/delivery.md`, conditional `plan/invariants.md`, and accepted evidence
pointers only; do not attach architecture or task shards unless a named
delivery fact is absent. Request version/changelog proposal, commit and PR-body
draft, changed-file summary, and review evidence. Preparation must not push,
create or mutate a PR, merge, tag, release, or publish.

Keep the delivery artifact at ≤60 lines and ≤12 KB. Point at canonical diff,
test, and review evidence instead of restating it. The primary thread consolidates the final diff and evidence, then presents
`STAGE-GATE-3` with `ship`, `amend`, and `abort`. Stop for the live operator
reply even when Stage Gate 1 granted autonomous iteration.

Only a valid dual-record `ship` release permits the specifically previewed
outward actions, and each action still requires normal Codex/runtime approval.
An `amend` decision returns to the smallest affected phase and invalidates the
old delivery evidence. Never force-push or publish broader scope than shown.
