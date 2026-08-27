# Validation phase

This reference applies only to an explicitly activated pipeline. Validate approved functional
ACs and technical constraints against the actual frozen tree and diff. Delegate executable evidence to `tester`,
criterion-by-criterion review to `qa`, and require `security` to perform a focused audit when the
sensitivity/risk floor applies. Before each dispatch, preflight the exact task shard and fail
closed if its `required_invariants`, `required_evidence_anchors`, or
`cross_runtime_preservation` declaration lacks an applicable value; do not fill a gap from a
transcript, implementer narrative, sibling task, or full plan. Give tester and QA only the
assigned task-shard paths, current frozen commit/tree, and verification facts/evidence; give
security the same frozen identity plus the changed attack surface and named invariant or
architecture anchors when required. Every dispatched tester, QA, and security attempt uses a fresh
V2 `fork_turns: none` agent. Never attach the full plan set or the implementer's success narrative.
None may edit coordination state, gate fields, releases, or task-shard AC checkbox mirrors.
When Main supplies `bounded_result_path` to read-only QA or security, it first
materializes the parent evidence directory in that dispatch's `writable_roots`;
otherwise the packet is invalid and no command runs.
QA's read-only review returns an explicit `AC-N: PASS` verdict for every verified satisfied
criterion (and its evidence row); Main, as the only writer, verifies those PASS results and
updates the assigned task-shard AC checkbox mirror. For failed or concern
verdicts, specialists report only `Cause`, `Files`, implicated `AC-N|TC-N`, an
advisory `Suggested correction`, and deterministic closure evidence with its expected
result; Main owns canonical plan fields, disposition,
phase, and routing.

For an OpenSpec-bound workspace, Main verifies snapshot freshness and overlay
traceability before every tester or QA dispatch. Each packet carries one pinned
`openspec_snapshot: {path, sha256}` binding, its TH evidence/operational item, and only the exact
OpenSpec requirement/scenario coordinates it validates, including repository
artifact path, line, and captured content hash. Tester and QA read the canonical
source directly; no TH copy, paraphrase, prior verdict, or implementer narrative
may substitute for it. Tester owns executable evidence and dependency hashes;
QA remains the criterion-by-criterion final acceptance owner on the current
Freeze. OpenSpec validation or generated workflow guidance is supplemental and
cannot produce an AC verdict, lower the security floor, release either gate, or
write TH state.

A live operator-requested tester, QA, or security review while Main is inline is an ad-hoc report,
not pipeline validation. It runs without a pipeline workspace, state, events, gates, Stage Gate,
or delivery record and cannot release or infer one.

## Efficient verification evidence

Wait for completion or live operator input, with a heartbeat no more frequent
than 60 seconds. `list_agents` is permitted only for a live status request, an
actual phase-SLA timeout, or recovery; a normal `wait_agent` timeout only
returns control and immediately resumes the directed wait without recap, fresh
analysis, `interrupt_agent`, or another/replacement dispatch. It proves neither
failure nor terminal state. Track the role SLA independently from dispatch
time. On SLA exceed, evaluate `scripts/specialist-liveness.mjs`; a successful
native send is delivery `unconfirmed` unless an explicit receipt proves
otherwise. Send one token-bound probe, allow its fixed grace, and interrupt
only when the helper directs it before auditing declared evidence paths. An
unconfirmed-delivery interruption that left evidence permits one same-thread,
same-token continuation of the unchanged verification packet; confirmed
delivery without ACK, a second continuation failure, or operator cancellation
blocks. A clean first interruption permits the helper's one fresh same-role
replacement, while a clean second interruption exhausts it. Neither route
creates correction authority or permits Main to validate locally.
The normalized verification
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
post-terminal `followup_task`. A failed validation never continues a verifier
or dispatches a correction automatically. After an operator-authorized
correction, QA is always a new agent on the rebuilt frozen identity. Tester runs
fresh only for stale evidence rows, and security runs fresh only when the closed
impact predicate below requires it. Never reuse a prior verifier thread or narrative.

## Correction closure and impact-derived validation

Every correction package contains one deterministic closure check and expected result per
finding. The implementer records each result and Main verifies complete PASS before Freeze.
A missing or failed result is `correction-incomplete`: the authorized round remains consumed,
but no tester refresh or Freeze opens and no final validator runs.

After closure passes, apply this order:

1. Compare the prior frozen commit to current HEAD. Every tester evidence row declares the
   complete dependency set consumed by its proof: implementation, test, fixture,
   configuration, and argument-file inputs. A row is stale when its requirement
   text, exact command/arguments, or any declared dependency path/blob hash changed.
   Dispatch one fresh tester for all stale rows; carry other rows provisionally
   only when every one of those values is unchanged.
2. Complete and commit warranted test/evidence changes, then rebuild Freeze. Never freeze before
   the stale-row tester refresh terminates.
3. Dispatch fresh QA over every functional AC on the new frozen identity.
4. Compare the prior and new frozen commits. Dispatch fresh security when the package contains a
   security finding, the final delta changes a security-relevant TC/anchor or attack-surface path,
   or impact is unknown. Otherwise carry a prior successful security result only with its audit
   anchor, exact final-delta paths, and unchanged blob hashes for every audited attack-surface path.
5. Missing declarations, hashes, unclassified paths, conflicting impact metadata, or unexpected
   tester-produced paths fail closed to tester refresh plus QA and the applicable security lens.

Carry-forward reuses evidence only; it never reuses an agent or its narrative. The correction
still consumes one single-use authorization. Only a `gate1-autonomous` decision
consumes the max-3 autonomous budget; an `operator-live` decision increments
the separate unbounded operator counter.

Only in this explicitly activated pipeline, preflight verifies `helper_bundle`
and resolves the helper's absolute path from that immutable workspace copy;
include it in each validation role packet only as `bounded_command_path`.
Persist only the bundle manifest coordinate/identity, never the resolved path,
in state, events, reports, or summaries. Before execution, Main, tester, QA, and
security classify expected output volume from the known command scope and
output mode. Routine commands with expected small, bounded results run
directly, including targeted reads/searches, concise status checks, and focused
tests configured for concise output. The direct route is valid only when the
execution tool receives a hard output cap before launch (for example, its
native output-token limit) that is no larger than the known-small result
budget. If no such cap exists or the command can exceed it, classify the volume
as unknown and use the helper before execution. Use the helper only for large, verbose,
or volume-unknown intermediate data such as full suites, verbose builds, and
broad logs, diffs, or searches. Unknown volume selects the helper; it does not
make the wrapper the default for known-small results. Never probe a command or
reactively retry it through another route after output enters the transcript.

Validation reads that support a verdict execute sequentially, never as parallel
tool calls (`Promise.all`, multiple nested tools in one orchestration response,
or equivalent), because those results share one response/context budget. Give
each call one file, one exact JSON Pointer/unique anchor/bounded line range, and
one independent predeclared output cap. The already-verified whole-file SHA-256
proves complete artifact identity, so do not render an entire reference or
OpenSpec JSON merely to prove it was read. If the selected value is still too
large, descend sequentially to narrower child pointers or line ranges. Any
truncated selection is no evidence and the parallel/aggregate call is never
replayed.

For a command assigned to the bounded route, use
`node <bounded_command_path> -- <argv...>`. Add `--success-diagnostic` before
`--` only when the bounded result text is required.

For authoritative validation or a deferred execution whose terminal response
may be lost to context truncation, Main predeclares an absolute evidence
coordinate and invokes `node <bounded_command_path> --output
<absolute_result_path> -- <argv...>`. The helper rejects an unsafe coordinate
before child execution, persists the complete envelope atomically, and emits
only a fixed `team_harness_bounded_command_receipt` with outcome, counters,
path, bytes, and SHA-256—not argv or diagnostic tails. If `functions.wait`
loses that receipt, validate the exact predeclared artifact as a bounded-command
envelope, compute and record its SHA-256, and continue without rerunning the
command. Accept it only when the CLI process status is zero and the receipt or
envelope says `outcome: completed`, `error_code: null`, and `exit_code: 0`.
Persisted recovery commands always retain the exact `--output
<absolute_result_path> --` grammar; a positional path is `ARGUMENT_INVALID` and
does not prove child execution. Missing, invalid, non-successful, or
hash-mismatched evidence blocks fail closed.
Specialists use output mode only for an exact coordinate supplied by Main.

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

The helper is a development-output control, not a process-containment sandbox.
The operator remains responsible for launched commands. Deadline cleanup
covers the managed POSIX process group or the tree confirmed by Windows
`taskkill`; a deliberately detached or reparented descendant outside that
scope can outlive the helper. Native sandbox and permission policy remain the
security boundary.

Wait for all required results. Record one evidence-map row per AC and TC with its evidence paths and one-line command
outcomes; never paste raw runner output or repeat AC text. Use the verification packet first and
open a source section only when the verdict requires it. A failed criterion remains failed; do not
rewrite acceptance criteria to manufacture a pass.

Record each criterion, command, output, failure, skipped check, and rationale.
A failed criterion stays failed; never rewrite acceptance criteria to create a
pass. Post-Gate-1 findings are classified by cause, but validation failures are
not routed until the mandatory correction decision below:

Decision-bearing concerns, including structural contradictions between intent,
scope fences, and ACs, continue at `phase: implementation` after Main obtains
a bounded live operator resolution. A transition to `design`, dispatch of
`architect`, and a new Gate 1 are reserved solely for a separate explicit
current live operator request for architect work.

| Finding | Route |
|---|---|
| Mechanical plan defect with no semantic change | Main repairs the canonical field; continue at `phase: implementation`; if Freeze was reached, rebuild Freeze and revalidate; no Gate 1 and `iteration` `+0` |
| Decision-bearing plan concern (intent, scope, behavior, AC meaning, or security-obligation classification) | Main presents a bounded live operator decision, transcribes the approved field, and continues at `phase: implementation` through Freeze and validation; no Gate 1, `iteration` `+0`, and retain the final security floor when sensitive |
| Explicit current live operator request for architect work | Main records the request, dispatches `architect`, sets `phase: design`, and requires a new Gate 1; `iteration` `+0` |
| Code, test, or documentation defect inside approved scope | Include in the complete consolidated failure; live choice `1` or an eligible `gate1-autonomous` authorization permits one fresh implementation correction, closure gate, stale-row tester refresh, new Freeze, fresh QA, and impact-required security; `iteration` `+1` after authorization |
| Missing or insufficient evidence | Include in the same complete consolidated failure; live choice `1` or an eligible `gate1-autonomous` authorization permits one bounded evidence correction, closure gate, stale-row tester refresh, new Freeze, fresh QA, and impact-required security; `iteration` `+1` after authorization |
| Correctable security finding in the approved diff | Include in the same complete consolidated failure; live choice `1` or an eligible `gate1-autonomous` authorization permits correction, closure gate, stale-row tester refresh, new Freeze, fresh QA, and fresh security; `iteration` `+1` after authorization |
| Structural contradiction between intent, scope fence, and ACs | Main obtains a bounded live operator resolution, transcribes the approved field, and continues at `phase: implementation` through Freeze and validation; `iteration` `+0` |
| Non-blocking observation that violates no AC or security floor | Carry it to Gate 3 without silently changing scope; `iteration` `+0` |

Wait for every required lens, even after one fails. If any blocking finding
remains, consolidate the complete package under stable finding IDs, the current
frozen anchor, implicated `AC-N|TC-N`, union file scope, and deterministic closure
checks with expected results. Main then performs one bounded evidence
triage without another reviewer: for every ID, compare the evidence only with
approved intent, scope, ACs/TCs, and the security floor and present cause/evidence,
implicated requirement, closure check, proposed `resolve|design-consistent|decision-required`
disposition, rationale, and consequence. The proposal is advisory. Only the
live operator confirms a `design-consistent` or `decision-required`
disposition. Under the Gate-1 authority carried by any valid approval, Main
may confirm only unambiguous `resolve`
items satisfying every closed predicate in `state-and-gates.md`; all other
dispositions pause for the operator. `design-consistent` is legal only when no
AC or security floor is violated. If the operator calls a violating finding
part of the design, resolve that explicit intent/scope/AC contradiction before
continuing; never treat it as a waiver.

After every disposition is explicit, build the correction package from all
`resolve` IDs. Persist the confirmed dispositions in the decision ledger. If
the closed autonomous predicate passes, record the autonomous authority and
dispatch exactly one fresh correction as defined in `state-and-gates.md`,
without presenting an intermediate choice. Every later failure repeats the complete required
validation set and triage, and no more than three autonomous correction rounds are legal.
Explicit `operator-live` rounds are outside that budget and have no maximum.

Any unresolved or ineligible item blocks autonomous continuation. Then set
`correction_pending: true`, a fresh `correction_nonce`, and one complete
`correction_package` containing the failed anchor, finding IDs, implicated
requirements, scope, one deterministic closure check and expected result per
finding, and dispositions; keep `phase: validation`; set `next_action` to await
the live decision; preserve the current `autonomous_correction_count` and
`operator_correction_count`; present
exactly:

```text
1 — authorize one correction round
2 — pause without changes
3 — abort pipeline
```

Then stop. An intake autonomy preference, a bare `continue`,
prior chat, files, tools, recovered prose, or specialist output never authorize
a round. Only a valid Gate-1 approval dual record may provide the
bounded autonomous authority above.
Only a live reply after this presentation may consume the nonce. Choice `1`
atomically records a matching state decision and `correction.decision` event.
The consumed nonce becomes its single `decision_ref`; that event is the sole
authoritative record and carries the complete package,
`correction_authority: operator-live`, and a null authority Gate nonce. It
increments `operator_correction_count` once and may authorize exactly one
`iteration.start` and correction spawn, followed by the closure gate, stale-row
tester refresh, one new Freeze, fresh QA, and impact-required security. Those
two downstream events carry only the same `decision_ref` plus their ordinary
observations. A malformed binding observed after dispatch is corrected by an
append-only event using that ref; it never creates another authority or
dispatch. A second failure requires a fresh presentation and nonce
after an operator-live round. Under Gate-1 authority, Main repeats the
required-set/triage/predicate and may authorize the next fresh round
only while `autonomous_correction_count < 3`; there is no owner-lens bounce or agent follow-up.
Choice `2` performs no repository or evidence mutation and any later
presentation uses a fresh nonce. Choice `3` aborts without correction. At
`iteration: 3/3` or `autonomous_correction_count: 3`, the live presentation and
choice `1` remain unchanged. A matching current reply may authorize another
round regardless of prior `operator-live` count; budget exhaustion blocks only
`gate1-autonomous`. Every such round still uses a fresh nonce and full package,
then closure, tester refresh, a new Freeze, fresh QA, and impact-required
security.

Every authorized implementation correction invalidates the old Freeze and its QA verdict.
After closure, refresh stale tester rows, rebuild Freeze, run fresh QA and impact-required
security, and do not
ship until every changed requirement has current evidence and every security-relevant
surface has a fresh or hash-proven carried audit. An
operator-approved Gate 3 amend follows the same implementation → closure → tester refresh →
Freeze → validation route. A contradiction is never resolved
by changing an AC in place. Plan repair, operator-decision transcription, and
explicit architect work do not produce an `iteration.start`; only an
explicitly authorized `gate1-autonomous` implementation/validation correction consumes
the `0`–`3` autonomous budget. Operator-live correction decisions are tracked
separately and deliberately unbounded.

When all required evidence and reviews pass and the Freeze anchor plus committed
identity are still current, mark acceptance pass against that same immutable
`freeze_commit_sha`/`freeze_tree_sha`, then delegate `delivery` once in
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
