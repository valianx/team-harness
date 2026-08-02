# Validation phase

This reference applies only to an explicitly activated pipeline. Validate the approved acceptance
criteria against the actual frozen tree and diff. Delegate executable evidence to `tester`,
criterion-by-criterion review to `qa`, and the required focused audit to `security` when the
sensitivity/risk floor applies. Give tester and QA only the assigned task-shard paths plus the
verification packet; give security the packet and changed attack surface plus named invariant or
architecture anchors when required. Never attach the full plan set. None may edit coordination
state, gate fields, or releases. QA may update only the assigned task-shard AC checkbox mirror;
all other manifest and shard fields remain unchanged. Specialists report only `Cause`, `Files`,
implicated `AC`, and `Correction`; Main owns canonical plan fields, disposition, phase, and routing.

A live operator-requested tester, QA, or security review while Main is inline is an ad-hoc report,
not pipeline validation. It runs without a pipeline workspace, state, events, gates, Stage Gate,
or delivery record and cannot release or infer one.

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

When all required evidence and reviews pass and the Freeze anchor is still
current, delegate `delivery` once in pre-gate preparation mode. It may write only
the workspace PR-body, standalone acceptance-matrix, and changelog-fragment
drafts. The coordinator validates those paths, computes SHA-256 for every exact
artifact, requires the canonical non-symlink fixed filenames under the selected
workspace's `inputs/` directory, and records the title, paths, and digests in
`delivery_preview`; a
missing or contradictory artifact blocks before the gate. Then set `phase:
waiting_gate3`, `status: waiting_for_gate`, a fresh `gate_nonce`, and
`next_action: record Gate 3 decision`. Present the concise delivery summary and
the exact preview paths/digests with Gate 3's numbered `ship`, `amend`, and
`abort` options; stop for the live
operator reply. Gate release remains a dual record and is not inferred from a
green suite or specialist result.
