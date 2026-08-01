# Implementation phase

Re-read state and require a valid dual-record `STAGE-GATE-1` release. If either
half is absent or inconsistent, load `recovery.md`, re-present the gate with a
fresh nonce, and stop.

Read `plan/delivery.md` to form dependency rounds. For each dispatch, pass only
the exact `plan/tasks/Task-N.md` path and its named architecture/invariant
anchors; never attach sibling tasks or the full plan set. Delegate bounded,
file-scoped work to `implementer`; state that other agents may be editing the
repository and unrelated changes must be preserved. Parallelize only tasks with
disjoint ownership. The primary thread records dispatches and results, waits for
all tasks in a round, and consolidates their evidence.

Do not silently widen the approved scope. When implementation is complete,
write a 5–30 line, ≤8 KB `02-implementation.md` containing only outcome,
deviations, exceptions, one-line checks, commit, and unresolved issues. Git is
the changed-file authority; do not paste the diff, raw logs, or chronology. Set `phase: validation` and
`next_action: run approved acceptance validation`.
