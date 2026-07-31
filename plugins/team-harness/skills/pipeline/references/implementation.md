# Implementation phase

Re-read state and require a valid dual-record `STAGE-GATE-1` release. If either
half is absent or inconsistent, load `recovery.md`, re-present the gate with a
fresh nonce, and stop.

Translate the approved plan into dependency rounds. Delegate bounded,
file-scoped work to `implementer`; state that other agents may be editing the
repository and unrelated changes must be preserved. Parallelize only tasks with
disjoint ownership. The primary thread records dispatches and results, waits for
all tasks in a round, and consolidates their evidence.

Do not silently widen the approved scope. When implementation is complete,
record its commands, changed files, and unresolved issues in
`02-implementation.md`; set `phase: validation` and
`next_action: run approved acceptance validation`.
