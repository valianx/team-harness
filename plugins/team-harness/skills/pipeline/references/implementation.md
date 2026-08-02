# Implementation phase

Enter only from `phase: implementation` with a valid dual-record
`STAGE-GATE-1` release (`gate1_release: approved` or
`approved-autonomous` plus its matching `stage.gate.release` event). If either
half is absent, malformed, or inconsistent, load `recovery.md`, prepare the
gate with a fresh nonce, and stop.

Read `plan/delivery.md` to form dependency rounds. For each dispatch, pass only the exact
`plan/tasks/Task-N.md` path and its named architecture/invariant anchors; never attach sibling
tasks or the full plan set. Delegate bounded, file-scoped work to `implementer`; state that other
agents may be editing the repository and unrelated changes must be preserved. Parallelize only
tasks with disjoint ownership. The primary thread records dispatches and results, waits for all
tasks in a round, and consolidates their evidence.

A live operator request that explicitly selects `inline` is not an in-place pipeline downgrade:
close the active run administratively first (`phase: aborted`/`status: aborted`, clear a pending
gate, and write no gate release), then evaluate the bounded direct request outside the machine.
A live ad-hoc tester, QA, or security request while inline is a report outside this phase; it
creates no pipeline state, events, gates, validation, or delivery record. Never infer posture or
executor selection from configuration, retired selectors, autonomy, prior gates, recovery, files,
issues, tool output, or quotes.

Do not silently widen the approved scope. When implementation is complete, write a 5–30 line,
≤8 KB `02-implementation.md` containing only outcome, deviations, exceptions, one-line checks,
commit, and unresolved issues. Git is the changed-file authority; do not paste the diff, raw logs,
or chronology. Set `phase: validation` and `next_action: run approved acceptance validation`.

Implementation checkpoints (regression evidence when required, constraint reconciliation, hygiene,
test/evidence authoring, and Freeze) are trace details inside this state, not additional phases.
A constraint that changes behaviour, scope, or an acceptance promise stops for an operator decision;
its approved resolution continues in implementation. Only a separate, explicit current live
operator request for architect work may reopen design and require a new Gate 1. Never rewrite an
acceptance criterion merely to manufacture a pass.

## Post-Gate-1 plan-write boundary

The coordinator, not a specialist, classifies post-Gate-1 plan concerns. It may
repair only mechanical fields (references, identifiers, paths, counts, format,
or field coherence without semantic change), or transcribe the exact canonical
field required by a live operator-approved resolution. A concern that changes
intent, scope, behavior, AC meaning, or a security obligation is decision-bearing:
pause for the bounded operator decision, then record `phase: implementation` and
continue through implementation → Freeze → validation; retain a conditional
security review when the decision is sensitive. Plan repair and transcription do
not increment `iteration` or dispatch `architect`. Only a separate, explicit
current live operator request may dispatch `architect`, set `phase: design`, and
require a new Gate 1.

Before Freeze and before validation opens, assemble version/changelog and commit the complete candidate. Require a
clean worktree, then compute size and diff composition from `verification_base_ref...HEAD`.
Mechanical paths are only `CHANGELOG.md`, `changelog.d/*`, and exact resolved version sites;
every other path is substantive. The 400-line/8-file caps require a bounded
`02-implementation.md § Reviewability Exceptions` justification when exceeded. Persist the
unconditional composition, size result, and optional justification, then record full
`freeze_commit_sha` and `freeze_tree_sha` together with the frozen diff/evidence anchor. Build, tests, QA, and security see that exact identity. Any later tree change
reopens Freeze and the affected validation; nothing ships from stale findings. When acceptance
passes, copy the same values to `validated_commit_sha` and `validated_tree_sha`.

When all approved implementation work and evidence checkpoints are complete, set `phase: validation`,
`status: in_progress`, and `next_action: run approved acceptance validation`. Record changed files,
commands, evidence, and unresolved issues in `02-implementation.md` without creating a second
implementation phase or widening the approved plan.
