## Why

This change started as "the guided lane never mentions `type: fix`, so a bug fix ships without the
regression test and forced security review that `CLAUDE.md:151` requires." Investigation refuted
that framing and found a different, more serious defect underneath it.

**The rule this change was meant to implement is dead.** `docs/dev-mode.md:260` states that
`security_sensitive: true` is forced for `type: fix` and `type: hotfix`. The field's only writer
says the opposite: `agents/ref-pipeline.md:723-724` — "applied uniformly regardless of `type`; it
is never derived from bug tiers or historical markers." The backstop agrees
(`agents/ref-pipeline.md:1422`, headed "every type"). Type-driven sensitivity shipped twice
(`1530bd69`, then re-shipped and re-retired) and was removed both times. `CLAUDE.md:151` points at
`agents/ref-special-flows.md § Bug-fix Flow` as its authority, and that section does not contain
the rule — `security_sensitive` does not appear in the file at all. Implementing the rule would
restore something the repository deliberately removed; the honest repair is to delete the claim.

**Underneath it is a live fail-open in the shared floor classifier.** `FLOOR_CONTENT`
(`skills/verify/scripts/review-fan.mjs:65`) is matched against added diff lines only, because
`readAddedByFile` (`:181-195`) collects lines beginning with `+` and discards the rest. A change
that *removes* a security control at a path outside `FLOOR_PATHS` therefore produces no content
signal and no floor. The pipeline's own backstop names this exact failure and closes it —
`agents/ref-pipeline.md:1428`: "Scans added AND removed lines — removing an auth check is exactly
as relevant as adding one, and an additions-only scan fails open on control removal." The shared
classifier does not. `docs/pipeline-lanes.md:99-100` calls that classifier the single sensitivity
authority and encodes the fail-open in its own wording ("changed paths and added content"), and
`agents/_shared/inline-review-contract.md` binds the same floor — so the leak reaches the guided
lane and every inline review, not one lane.

Removing a control is the shape a regression takes. A floor that only reacts to additions is
blind to precisely the change a security review exists to catch.

**A third defect is a claim the lane cannot keep.** `skills/spec/SKILL.md:38` runs verification
"on an explicit live operator request," while `:81` states "the pull request does not open until
`review-fan.mjs gate` resolves ready." Publication (step 6) carries no precondition that
verification ran, and no hook covers `gh pr create`. The sentence asserts a property the lane has
no producer for.

## What Changes

- The floor classifier evaluates content signals over **both added and removed** diff lines, so
  removing a control is classified exactly as adding one is. Hunk-line collection becomes
  positional — `---`/`+++` count as file headers only between a `diff --git` line and that file's
  first `@@`, after which every `+`/`-` line is content — because a removed `--`-style comment and
  a real `--- a/path` header are byte-identical in isolation and no single-line regex separates
  them.
- The three stale sites asserting the retired bug-fix forcing rule are deleted, and the two
  clauses citing a "risk-metadata table" that does not exist are corrected to the live authority.
  Net prose reduction; no new rule is written.
- The guided lane stops claiming a publication precondition it cannot enforce, and states what it
  actually guarantees.

**Out of scope, recorded not built:** the pipeline's two-revision regression proof (fail at base,
pass at head) has no guided-lane analogue. That is genuine scoping rather than evasion — the proof
rides on `bug_tier`, and the tier is recorded only inside an active pipeline
(`agents/ref-intake-flows.md:260-262`). It is filed as an issue, not implemented here.

## Capabilities

### Modified Capabilities

- `security-classification-floor`: content signals are evaluated over removals as well as
  additions, so a classification cannot resolve benign because the control left rather than
  arrived.
- `spec-direct-lane`: the lane's stated publication guarantee matches what it can produce.
