# Design — cost-convergence-improvements

Decisions behind the deltas; each is the resolution of an audit-measured failure, not a preference.

## D1. Full-scope-once-with-memory, never delta-bounding

Two independent measurements rejected the obvious fix: the 54% incident (delta-scoped remediation rounds that never converged while one full-scope pass produced the plan) and this audit's per-dispatch fixed-context finding (bounding a dispatch saves nothing because fixed context dominates; the saving is in not re-deriving). The convergence contract therefore keeps every re-review at full scope and adds memory instead: an exhaustive class-sweep obligation on the first pass, and a persistent ledger every later pass must diff against. The two-halves rule in `dispatch-contract.md` is untouched.

## D2. The ledger is coordination state with one writer

`findings-ledger.md` lives in `reviews/` but follows the coordination-state ownership rule: only the coordinator appends (from fan status blocks and operator dispositions); verifiers read it and classify against it, never edit it. This keeps the single-writer invariant of `orchestrator-state.md` intact and makes the ledger trustworthy as a baseline — a verifier cannot rewrite history to make its round look novel.

## D3. Ratchet terminates on severity, classification attributes blame

The round-opening set is severity-only: open critical/high findings open a correction round regardless of classification, so the security floor is never weakened by bookkeeping. Classification (`new_in_delta | pre_existing_missed | reopened`) exists for two other purposes: `pre_existing_missed` marks a first-pass coverage defect (measurable per lens, emitted in iteration events), and an operator-ruled or accepted-residual entry cannot be re-raised without new evidence of a different root cause. Sub-floor findings ship as PR-body concerns — visible to the human reviewer, never a round generator. This composes with the closed exception list from `gate-single-approve-autonomy`: a surviving broke-it or a non-correctable concern outside the ledger's residual set still pauses; ledger residuals themselves are excluded from the exception-pause set and never block auto-ship. The severity floor the ratchet reads is the one already in force, including its two fail-closed security conditions: a correctable `broke-it` and an incomplete-changed-control result are floor conditions by construction, so no severity label makes either a residual. Termination therefore needs severity as data, not as prose judgment — the reasoning lenses emit id, severity, and class in their status blocks, and the coordinator transcribes them.

## D4. The overlay was transcription, so a script does it

The second architect dispatch was never contracted as review — it projects the plan the first architect just wrote into the overlay representation, and every mismatch class it could introduce is already caught by the deterministic validator chain (`plan-contract.mjs`, openspec validators). Judgment content (routing, scope decomposition, invariants) moves into the single planning pass; mechanical content (coordinates, hashes, scaffolds) moves into `openspec-overlay.mjs`. Validator failure re-dispatches the same planning flow; no standing second dispatch mode remains.

## D5. Review invalidation keys on code identity

`mergeStateStatus` folding into "code changed" made a CI check finishing mid-review restart Gather and every lens on an unchanged head — pure waste under any threat model. Invalidation now requires head/commits/code-hash movement; mergeability and conversation drift are reported, not acted on, and `base_oid`/`merge_base_oid` movement still downgrades the verdict line so a stale base is visible. The same reasoning reaches the composed context hash, which binds artifacts, dispatches and the operator's publish approval: leaving mergeability inside it would move the discarded work to the approval boundary instead of removing it. The security lens fires on evidence (sensitive-token or executable-suffix hit), not on the absence of certainty, and the resolved reason is shown so a not-required outcome stays visible.

## D6. The direct lane fills a real gap and feeds the archive

Between plain inline (no durable record) and the pipeline floor (6 dispatches, 3 opus, ~3 live stops) there was nothing. `/th:spec` is deliberately coordinator-only: the value of a short task's spec is written intent and task decomposition, not specialist fan-out — and its one optional review is full-scope by D1. Hard routers (security floor, public-contract break, multi-specialist, irreversible) keep pipeline-worthy work out; the lane's own escalation rule stops it when scope grows. Both entry points write the same `openspec/changes/` schema, so archive treats them identically.

## D7. Archive is operator-confirmed, never silent

`openspec archive` merges spec deltas into the living base — a repo mutation after the PR's review boundary — so it stays behind a one-line Y/n, consistent with the existing outward-action posture. Its trigger is a confirmed merge, not close itself: publish-only delivery ends at a draft PR, so terminal close usually precedes the merge and can only record a pending offer. The archive commit therefore never rides the run's own PR; it ships as its own branch and pull request like any other repository mutation. The backfill of the two merged changes is a one-time chore that creates `openspec/specs/`; from then on proposals can declare Modified Capabilities and stop re-deriving context.
