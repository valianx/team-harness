## Why

The 2026-08-18 cost-and-velocity audit (9 lanes, 99 file:line-grounded findings, telemetry from 8 real vault runs) established that pipeline cost is round-count-driven, not dispatch-size-driven: a clean run costs 1.6h while correction-bearing runs accumulate 3–12 full validation packets, 174–197K+ specialist tokens (lower bound), and 3–20h. Non-convergence is contract-legal, not a run defect: every round dispatches a fresh full-scope QA with the prior report overwritten, later-round "genuinely new evidence" is explicitly legitimized, exhaustiveness is contracted only for deterministic diagnostics, and no termination criterion exists — measured as 21 same-class hardening findings dripped one packet at a time across waves v7–v12, and a Stage-1 panel at 7→6→8→8→5 new findings per round ("no decline in rate"). Fixed costs compound it: every new workspace pays a second serial opus architect solely to transcribe the plan into the overlay representation, `/th:review-pr` restarts every lens when a CI check finishes mid-review on an unchanged head, and the OpenSpec lifecycle is truncated — archive has never run, so no living spec base exists and planning markdown accumulates in product diffs. The measured 54% delta-round incident and this audit both rule out delta-bounding reviews; the prescribed shape is full-scope-once-with-memory.

## What Changes

- Reasoning verifiers (qa, adversary, security) get a convergence contract: an exhaustive class-sweep obligation in the first pass with a mandatory coverage declaration; a persistent append-only findings ledger that every re-review must read and classify against (`new_in_delta | pre_existing_missed | reopened`), with operator rulings and waivers fed forward; and a ratchet termination rule — a re-review round with zero open critical/high findings is convergence-complete, sub-floor findings ship as PR concerns and never open a round. Review scope stays full; nothing is delta-bounded.
- The Design transaction collapses to one architect dispatch: the openspec-overlay dispatch is retired; pipeline scripts derive the overlay skeleton (coordinates, hashes, index and shard scaffolds) mechanically from the validated change, and the planning architect completes the judgment content in its single pass. The deterministic validator chain is unchanged.
- `/th:review-pr` keys lens invalidation on code identity only (head, commits, code hash): mergeability and conversation drift become informational preview lines instead of restarting Gather and every lens; the pre-publish freshness restart is capped at 1; the security lens requires a concrete trigger instead of defaulting to required on indeterminate classification.
- A direct OpenSpec lane (`/th:spec`) serves short tasks without pipeline activation: the coordinator authors proposal+tasks, validates strictly, gets one conversational approval, implements inline on a feature branch, and archives after merge — zero specialist dispatches, no workspace/state/gate ceremony, with hard routers keeping security-floor and public-contract work in the pipeline.
- The archive half of the OpenSpec lifecycle is wired in: once a run's PR is confirmed merged, the flow offers `openspec archive` behind a one-line confirmation — at terminal close when the merge is already confirmed there, otherwise as a recorded pending offer — and the two merged changes are backfill-archived to create the initial `openspec/specs/` base.

**Editing mandate (applies to every task):** when a contract file changes, rewrite the affected section as a whole so the full text reads in one coherent order; never append patch paragraphs to existing prose; target net prose reduction in every touched file.

## Capabilities

### New Capabilities

- `validation-convergence`: class-sweep exhaustive first pass, coverage declaration, persistent findings ledger with mandatory classification and waiver feed-forward, ratchet termination, convergence counts in iteration events.
- `design-single-pass`: one architect dispatch per Design transaction; script-derived overlay skeleton; unchanged fail-closed validators.
- `pr-review-drift-tolerance`: code-identity-only lens invalidation, informational drift reporting, capped pre-publish restart, trigger-based security lens requirement.
- `spec-direct-lane`: `/th:spec` — direct OpenSpec flow for short tasks with routing predicate and escalation rule.
- `openspec-archive-lifecycle`: operator-confirmed archive at the confirmed-merge point of both flows; backfill of merged changes into the living spec base.

### Modified Capabilities

None.

## Impact

- Rewrites the iteration/correction and Design-transaction sections of `agents/ref-pipeline.md` (including the Phase-3 advance conjunct and acceptance re-assertion); edits `agents/qa.md`, `agents/adversary.md`, `agents/security.md` (sweep, coverage declaration, and the id/severity/class finding transport), `agents/architect.md` (openspec modes), `agents/implementer.md` (finding identity), `agents/_shared/orchestrator-state.md` (ledger ownership, event schema row, terminal close), `agents/_shared/gate-contract.md` (residuals excluded from exception-pause concerns), `agents/_shared/output-template.md` (report retention), and `docs/observability.md` (`iteration.start` producer contract).
- Reconciles every prose carrier of the correctable-must-correct rule so none states it unconditionally: `docs/patch-mode.md`, `docs/how-it-works.md`, `docs/adversary-cost-model.md`, `agents/ref-special-flows.md`, `skills/pipelines/SKILL.md`, and CLAUDE.md.
- Extends `skills/pipeline/scripts/openspec-overlay.mjs` to derive the overlay skeleton; `plan-contract.mjs` validation unchanged; `openspec-recovery.mjs` resume semantics reconciled with the retired dispatch.
- Edits `skills/review-pr/scripts/review_context.py` (`compare_contexts`, `finalize_hashes` with its schema-version bump, `classify_security_change`, `command_select_security`) and `skills/review-pr/SKILL.md` restart and preview rules.
- Adds `skills/spec/SKILL.md` and routing entries in `agents/orchestrator.md` / `agents/ref-direct-modes.md` / `docs/pipeline-lanes.md`, plus `skills/setup/managed-blocks/orchestrator-dispatch-rule.md` when the escalation guidance offers the lane; updates `docs/openspec-integration.md` and the delivery/terminal-close prose; backfill-archives the two merged changes on their own pull request.
- Mirrors the hand-authored Codex carriers (`runtime/codex/instructions/*.md`, `plugins/team-harness/skills/{pipeline,design,implement,validate,deliver,recover}/**`), which no generator refreshes; migrates the deterministic suites anchored on changed literals and registers new ones in `docs/testing.md`; regenerates and commits all generated runtime projections; version and changelog per the internal distribution rule.

## Non-goals

- The audit's P1/P2 levers are deferred: hygiene reclassification under the severity floor, QA evidence carry-forward, base-advance reconcile without a null packet, consumer-less bookkeeping deletion, intake boundary classification, Discover collapse, scoped intermediate suites, OpenSpec Lite mode and `config.yaml` tailoring, Codex token telemetry.
- No delta-bounding of any review scope; the dispatch-contract two-halves rule is untouched.
- No weakening of security floors: critical/high findings still open correction rounds, the derived security floor and adversary dispatch are unchanged, a correctable `broke-it` and an incomplete-changed-control result stay validation failures that no severity label converts into a ledger residual, and `policy-block`/`dev-guard`/`gcp-guard` are untouched.
- No change to merge authority or outward-action approval rules.
