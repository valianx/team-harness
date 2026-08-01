# Validation phase

This reference applies only to an explicitly activated pipeline. Validate the approved acceptance
criteria against the actual frozen tree and diff. Delegate executable evidence to `tester`,
criterion-by-criterion review to `qa`, and the required focused audit to `security` when the
sensitivity/risk floor applies. Give tester and QA only the assigned task-shard paths plus the
verification packet; give security the packet and changed attack surface plus named invariant or
architecture anchors when required. Never attach the full plan set. None may edit coordination
state, gate fields, or releases.

A live operator-requested tester, QA, or security review while Main is inline is an ad-hoc report,
not pipeline validation. It runs without a pipeline workspace, state, events, gates, Stage Gate,
or delivery record and cannot release or infer one.

Wait for all required results. Record one evidence-map row per criterion and one-line command
outcomes; never paste raw runner output or repeat AC text. Use the verification packet first and
open a source section only when the verdict requires it. A failed criterion remains failed; do not
rewrite acceptance criteria to manufacture a pass.

Record each criterion, command, output, failure, skipped check, and rationale.
A failed criterion stays failed; never rewrite acceptance criteria to create a
pass. Findings are routed by cause:

| Finding | Route |
|---|---|
| Code, test, or documentation defect inside approved scope | Implementation executor (`implementer`, or the eligible `hazlo tú` coordinator), then re-Freeze and revalidate the affected delta |
| Missing or insufficient evidence | `tester`, then rerun the affected validation |
| Correctable security finding in the approved diff | Implementation executor, re-Freeze, and a fresh security audit of the delta |
| Structural contradiction between intent, scope fence, and ACs | Present to the operator; reopen `design` only after an explicit decision and release a new Gate 1 |
| Non-blocking observation that violates no AC or security floor | Carry it to Gate 3 without silently changing scope |

Every implementation correction reopens Freeze and invalidates validation that
saw the old tree. Re-run all affected checks, and do not ship until the audit
has seen the current anchor. An operator-approved amend follows the same
implementation → Freeze → validation route. A contradiction is never resolved
by changing an AC in place.

When all required evidence and reviews pass, set `phase: waiting_gate3`,
`status: waiting_for_gate`, a fresh `gate_nonce`, and
`next_action: record Gate 3 decision`. Present the concise delivery summary and
Gate 3's numbered `ship`, `amend`, and `abort` options; stop for the live
operator reply. Gate release remains a dual record and is not inferred from a
green suite or specialist result.
