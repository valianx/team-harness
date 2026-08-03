# Validation phase

This reference applies only to an explicitly activated pipeline. Validate the approved acceptance
criteria against the actual frozen tree and diff. Delegate executable evidence to `tester`,
criterion-by-criterion review to `qa`, and the required focused audit to `security` when the
sensitivity/risk floor applies. Before each dispatch, preflight the exact task shard and fail
closed if its `required_invariants`, `required_evidence_anchors`, or
`cross_runtime_preservation` declaration lacks an applicable value; do not fill a gap from a
transcript, implementer narrative, sibling task, or full plan. Give tester and QA only the
assigned task-shard paths, current frozen commit/tree, and verification facts/evidence; give
security the same frozen identity plus the changed attack surface and named invariant or
architecture anchors when required. Every tester, QA, and security dispatch uses a fresh
V2 `fork_turns: none` agent. Never attach the full plan set or the implementer's success narrative.
None may edit coordination state, gate fields, or releases. QA may update only the assigned
task-shard AC checkbox mirror; all other manifest and shard fields remain unchanged. Specialists
report only `Cause`, `Files`, implicated `AC`, and `Correction`; Main owns canonical plan fields,
disposition, phase, and routing.

A live operator-requested tester, QA, or security review while Main is inline is an ad-hoc report,
not pipeline validation. It runs without a pipeline workspace, state, events, gates, Stage Gate,
or delivery record and cannot release or infer one.

## Efficient verification evidence

Wait for completion or live operator input, with a heartbeat no more frequent
than 60 seconds. `list_agents` is permitted only for a live status request, a
real timeout, or recovery; a normal timeout resumes the directed wait without
recap, fresh analysis, or another dispatch. The normalized verification
benchmark counts waits and queries unrelated to completion, input, a real
timeout, or recovery, and must remain at or below 30% of its normalized
baseline (a 70% reduction) without losing operator interruption.

Target each validation attempt at at most 30 tool calls and prepare its bounded
handoff at 50 tool calls. Before a validation attempt continues after its first
compaction, at 75 tool calls, at 8 M cumulative processed tokens, or after a
second substantial scope change, rotate it and provide a bounded current
handoff: task, owned surface, current frozen identity, evidence pointers, and
remaining work or decision. Do not reinject transcripts, old tool output, or a
stale snapshot. Rotation preserves every required AC verdict, QA/security
review, Freeze, mandatory suite, and gate.

Treat each terminal tester, QA, or security result as closed and prohibit
post-terminal `followup_task`. Only one recorded micro-correction of the same
file and AC, limited to at most 3 tool calls, may continue that context. A
second feedback item, scope expansion, or substantive correction instead uses
a fresh agent and the bounded `Cause`/`Files`/`AC`/`Correction` packet with the
current frozen anchor and required evidence. Every revalidation after a
correction starts new tester, QA, and security agents on the same current
frozen commit/tree for that validation round; never reuse a prior verifier or
its narrative.

Only in this explicitly activated pipeline, preflight resolves the helper's
absolute path relative to the loaded pipeline skill/reference and fails closed
if unavailable; include it in each validation role packet only as
`bounded_command_path`. Never persist that value in state, events, reports,
summaries, or workspace artifacts. Before execution, Main, tester, QA, and
security classify expected output volume from the known command scope and
output mode. Routine commands with expected small, bounded results run
directly, including targeted reads/searches, concise status checks, and focused
tests configured for concise output. Use the helper only for large, verbose,
or volume-unknown intermediate data such as full suites, verbose builds, and
broad logs, diffs, or searches. Unknown volume selects the helper; it does not
make the wrapper the default for known-small results. Never probe a command or
reactively retry it through another route after output enters the transcript.

For a command assigned to the bounded route, use
`node <bounded_command_path> -- <argv...>`. Add `--success-diagnostic` before
`--` only when the bounded result text is required.

The helper captures each command's stdout and stderr separately with a maximum
64 KiB buffer per stream, total byte counters, and a `truncated` flag. Render
exit code, duration, bytes, `truncated`, and only a sanitized tail of at most 8
KiB per stream; remove ANSI control sequences and render binary/control data
safely. A successful command records only that envelope; on a failure, diagnose
from the sanitized tail rather than replaying the command's full output; on
truncation, make a narrow follow-up through the helper and never replay raw/full
output. Test this contract with ANSI, binary data, one giant
line beyond 64 KiB, and a nonzero failure without replay. Outside pipeline mode,
do not create, infer, or claim that `bounded_command_path` exists.

Wait for all required results. Record one evidence-map row per criterion and one-line command
outcomes; never paste raw runner output or repeat AC text. Use the verification packet first and
open a source section only when the verdict requires it. A failed criterion remains failed; do not
rewrite acceptance criteria to manufacture a pass.

Record each criterion, command, output, failure, skipped check, and rationale.
A failed criterion stays failed; never rewrite acceptance criteria to create a
pass. Post-Gate-1 findings are routed by cause:

Decision-bearing concerns, including structural contradictions between intent,
scope fences, and ACs, continue at `phase: implementation` after Main obtains
a bounded live operator resolution. A transition to `design`, dispatch of
`architect`, and a new Gate 1 are reserved solely for a separate explicit
current live operator request for architect work.

| Finding | Route |
|---|---|
| Mechanical plan defect with no semantic change | Main repairs the canonical field; continue at `phase: implementation`; if Freeze was reached, rebuild Freeze and revalidate; no Gate 1 and `iteration` `+0` |
| Decision-bearing plan concern (intent, scope, behavior, AC meaning, or security-obligation classification) | Main presents a bounded live operator decision, transcribes the approved field, and continues at `phase: implementation` through Freeze and validation; no Gate 1, `iteration` `+0`, and retain the conditional security review when sensitive |
| Explicit current live operator request for architect work | Main records the request, dispatches `architect`, sets `phase: design`, and requires a new Gate 1; `iteration` `+0` |
| Code, test, or documentation defect inside approved scope | Implementation executor (`implementer`, or the eligible `hazlo tú` coordinator), then re-Freeze and revalidate the affected delta; `iteration` `+1` |
| Missing or insufficient evidence | `tester`, then rerun the affected validation; `iteration` `+1` when the correction re-enters validation |
| Correctable security finding in the approved diff | Implementation executor, re-Freeze, and a fresh security audit of the delta; `iteration` `+1` |
| Structural contradiction between intent, scope fence, and ACs | Main obtains a bounded live operator resolution, transcribes the approved field, and continues at `phase: implementation` through Freeze and validation; `iteration` `+0` |
| Non-blocking observation that violates no AC or security floor | Carry it to Gate 3 without silently changing scope; `iteration` `+0` |

Every implementation correction reopens Freeze and invalidates validation that
saw the old tree. Re-run all affected checks, and do not ship until the audit
has seen the current anchor. An operator-approved amend follows the same
implementation → Freeze → validation route. A contradiction is never resolved
by changing an AC in place. Plan repair, operator-decision transcription, and
explicit architect work do not produce an `iteration.start`; only an
implementation/validation correction consumes the `0`–`3` correction budget.

When all required evidence and reviews pass and the Freeze anchor plus committed
identity are still current, copy `freeze_commit_sha`/`freeze_tree_sha` to
`validated_commit_sha`/`validated_tree_sha`, then delegate `delivery` once in
pre-gate preparation mode. It may write only the workspace PR-body and standalone
acceptance-matrix drafts. Version and changelog were committed before Freeze. The
coordinator validates those paths, computes SHA-256 for every exact
artifact, requires the canonical non-symlink fixed filenames under the selected
workspace's `inputs/` directory, and records the title, paths, and digests in
`delivery_preview`; a
missing or contradictory artifact blocks before the gate. Then set `phase:
waiting_gate3`, `status: waiting_for_gate`, a fresh `gate_nonce`, and
`next_action: record Gate 3 decision`. Resolve the recorded default-base tip with
`git ls-remote` and compare its full SHA with `verification_base_ref`; persist
`delivery_base_status` as `current`, `moved`, or `unknown` without fetching or mutating the
validated branch. Present the concise delivery summary, diff composition, size result, base status, and
the exact preview paths/digests with Gate 3's numbered `ship`, `amend`, and
`abort` options; stop for the live
operator reply. Gate release remains a dual record and is not inferred from a
green suite or specialist result.
