# Implementation phase

Enter only from `phase: implementation` with a valid dual-record
`STAGE-GATE-1` release (`gate1_release: approved` or
`approved-autonomous` plus its matching `stage.gate.release` event). If either
half is absent, malformed, or inconsistent, load `recovery.md`, prepare the
gate with a fresh nonce, and stop.

Read `plan/delivery.md` to form dependency rounds. Before every task dispatch,
preflight its exact `plan/tasks/Task-N.md` and fail closed unless its
`required_invariants`, `required_evidence_anchors`, and
`cross_runtime_preservation` declarations supply every applicable obligation.
Pass only that shard, its named architecture/invariant anchors, frozen identity
when present, and the role's necessary environment; never compensate with a
transcript, implementer history, sibling tasks, or the full plan set. Delegate
bounded, file-scoped work to a fresh V2 `implementer` with `fork_turns: none`;
state that other agents may be editing the repository and unrelated changes
must be preserved. Parallelize only tasks with disjoint ownership. The primary
thread records dispatches and results, waits for all tasks in a round, and
consolidates their evidence.

## Efficient execution, rotation, and tool diagnostics

Wait for a specialist completion or live operator input rather than polling. A
heartbeat may run at most once every 60 seconds; call `list_agents` only for a
live status request, an actual timeout, or recovery. A normal timeout only
continues the directed wait without recap, new analysis, or a new dispatch. The normalized benchmark counts only waits and queries that are
not caused by completion, input, a real timeout, or recovery; the current
policy must keep that count at no more than 30% of the normalized baseline
(at least a 70% reduction) while retaining immediate operator interruption.

Track each active specialist attempt's compaction signal, tool-call count,
cumulative processed-token count, and substantial scope changes. Target at
most 30 tool calls and make a bounded handoff ready at 50 tool calls. Before
continuing after its first compaction, at 75 tool calls, at 8 M cumulative
processed tokens, or after a second substantial scope change, rotate to a
fresh session. The handoff names the exact task, owned files, current
outcome/evidence pointers, and remaining decision or work; it carries no
transcript, raw tool output, or stale prior snapshot. Rotation never waives
required AC evidence, QA, security, Freeze, mandatory suites, or either gate.

Close a terminal implementation attempt and prohibit post-terminal
`followup_task`. The sole exception is one implementer continuation within the
same active task/correction lifecycle, on the same file and AC and limited to at most 3 tool calls; a second feedback item, any
scope expansion, or a substantive correction must use a fresh agent
(V2 `fork_turns: none`) and a bounded `Cause`/`Files`/`AC`/`Correction` packet with the
current frozen anchor and required evidence. A continued attempt never absorbs
another AC, file, or revalidation.

Main separately writes a recoverable handoff and requires a fresh user thread
after its first compaction or before continuing at 100 coordinator tool calls
or 20 M cumulative processed tokens. When that boundary is near, prefer a
completed implementation → validation handoff. This rotation does not create a
nested orchestrator or automatically replace native Main.

Only in this explicitly activated pipeline, preflight resolves the helper's
absolute path relative to the loaded pipeline skill/reference and fails closed
if unavailable; include it in the implementer role packet only as
`bounded_command_path`. Never persist that value in state, events, reports,
summaries, or workspace artifacts. Before executing a command, Main and the
implementer classify its expected output volume from the known command scope
and output mode. Routine commands with an expected small, bounded result run
directly, including targeted file reads and searches, concise status checks,
and focused tests configured for concise results. The direct route is valid only
when the execution tool receives a hard output cap before launch (for example,
its native output-token limit) that is no larger than the known-small result
budget. If no such cap exists or the command can exceed it, classify the volume
as unknown and use the helper before execution. Use the resolved helper only
for large, verbose, or volume-unknown intermediate data such as full suites,
verbose builds, and broad logs, diffs, or searches. Unknown volume selects the
helper; it does not make the wrapper the default for known-small results.

For a command assigned to the bounded route, use
`node <bounded_command_path> -- <argv...>`. Add `--success-diagnostic` before
`--` only when the bounded result text is required. The routing decision occurs
before execution; never probe a command and never reactively retry it through
a different route after its output has entered the transcript.

The helper captures stdout and stderr independently to a 64 KiB maximum buffer
per stream while separately counting all received bytes. Render its envelope
with exit code, duration, per-stream bytes, and `truncated`; render no more than
an 8 KiB sanitized tail per stream. Strip ANSI control sequences and render
binary/control data safely before display. A successful command normally needs
only the envelope; a failing command may use its sanitized failure tail for
diagnosis. If either stream truncates, make a narrow follow-up as a narrower
query through the helper and never replay the original raw/full output or command
just to obtain it. Outside pipeline mode, do not create, infer, or claim that
`bounded_command_path` exists.

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
