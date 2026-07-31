# Validation phase

Validate against the approved acceptance criteria and actual diff. Delegate
executable checks to `tester`, criterion-by-criterion review to `qa`, and a
focused audit to `security` when the changed surface or repository policy
requires it. Give every specialist the immutable plan/workspace coordinates and
forbid coordination-state edits.

Wait for all required results. Record commands, outputs, failures, skipped
checks and rationale in the workspace. A failed criterion remains failed; do
not rewrite acceptance criteria to manufacture a pass.

If fixes are required, return only the bounded delta to implementation and
re-run affected validation. When acceptance passes, set `phase: delivery` and
`next_action: prepare local delivery evidence`.
