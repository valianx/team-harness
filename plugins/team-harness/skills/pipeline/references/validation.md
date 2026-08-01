# Validation phase

Validate against the approved acceptance criteria and actual diff. Delegate
executable checks to `tester`, criterion-by-criterion review to `qa`, and a
focused audit to `security` when the changed surface or repository policy
requires it. Give tester and QA only the assigned task-shard paths plus the
verification packet. Give security the packet and changed attack surface; add
only named invariant or architecture anchors when required. Never attach the
full plan set. Forbid coordination-state edits.

Wait for all required results. Record one evidence-map row per criterion and
one-line command outcomes; never paste raw runner output or repeat AC text.
Use the verification packet first and open a source section only when the
verdict requires it. A failed criterion remains failed; do not rewrite
acceptance criteria to manufacture a pass.

If fixes are required, return only the bounded delta to implementation and
re-run affected validation. When acceptance passes, set `phase: delivery` and
`next_action: prepare local delivery evidence`.
