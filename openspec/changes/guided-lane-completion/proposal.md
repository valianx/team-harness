## Why

A completed pipeline run measured 6,100,000 tokens over 25h04m for a medium change (+2,432/−350, 104 files). Validation consumed roughly 3,260,000 of those tokens — 53% — because every correction round re-opened full scope: implementer, tester, a Freeze rebuild (executed five times), then a full-scope QA and a full-scope adversary. Fixed dispatch context added roughly 693,000 input tokens, of which the four adversary dispatches carried about 455,000, 93% of it re-reading the same 79,000-word frozen diff. 45.4% of that review surface (56 of 104 files, 1,262 of 2,782 changed lines) was runtime-projection mirrors that five deterministic checkers already prove byte-equal or regenerable.

The quality record of the same run does not favour the machinery either. An independent review run outside the pipeline surfaced three confirmed regressions that two full internal validation rounds had missed, and internal QA missed a functional acceptance criterion twice. The two mechanisms that demonstrably earned their cost were the adversary lens under a derived security floor and the re-audit of corrections: fix commits were the run's most defect-dense commits, with round-1 fixes changing a mechanism without changing the property and one hygiene defect introduced by the round-4 fix itself.

Published industry practice points the same way. Anthropic measures multi-agent systems at roughly 15× the tokens of chat, names coding as the domain where the multiplier pays off least, and reports a three-agent harness costing 20× a solo agent while keeping only independent fresh-context evaluation as models improved. Cognition's revised position is that multi-agent works when writes stay single-threaded and additional agents contribute intelligence rather than actions, with a fresh-context review loop as its one production success. CR-Bench measures reviewer agents at 27–33% recall against 3–5% precision, with signal-to-noise collapsing under reflexive re-review — repeated full-scope review rounds mostly manufacture findings.

Team Harness already ships the pieces of the cheaper flow but split across two lanes that do not compose. `/th:spec` carries written intent, inline implementation and publication; the inline review contract carries independent per-lens verification over an immutable committed range. Between them sit four gaps: the lane forbids re-verifying anything it fixed, any security dimension ejects the whole task to the pipeline instead of raising the verification bar, written intent never reaches the verifiers as criteria, and the verification fan has no invocation surface. Cost observability cannot arbitrate any of this: all 27 dispatches of the measured run reported `PER_ATTEMPT_METRICS_UNAVAILABLE`, and roughly 650,000 tokens stayed unattributed.

## What Changes

- The guided lane gains a terminating verification loop: one full-scope review, then exactly one delta-scoped closure pass per applied fix, checking the fix and nothing else. Full scope is never re-run inside the lane.
- A security dimension discovered in flight stops for a live three-way operator choice — raise the bar in-lane under a ship-blocking conjunction, take the pipeline, or narrow scope — instead of a pipeline-only offer. The floor's categories are displayed at the choice; the conjunction, not the machinery, is what ports.
- Authored `openspec/changes/<change>/` artifacts bind into the review package as criteria with their own provenance, so verifiers check the diff against written intent rather than only against live operator text.
- A review request naming several lenses is one review, not a second specialist need; the lane's `multi-specialist` hard router is stated to exclude review lenses.
- A `/th:verify` skill gives the verification fan an explicit invocation surface, replacing conversational-only activation.
- The frozen review diff may exclude path prefixes that a locally executed deterministic checker proves byte-equal or regenerable at the frozen tree, under preconditions that keep the exclusion auditable, keep QA's independently derived scan list consistent, and never touch a path that is only semantically checked.
- Routing offers `/th:spec` presumptively whenever its predicate passes instead of optionally, and the posture guidance renders three options rather than two.
- The dangling `docs/pipeline-lanes.md § 2a` sensitivity authority, cited by eight canonical sites since its section was removed, is restored as a real anchor.
- Cost observability records what is deterministically measurable — per-attempt wall time derived from the coordinator's own events, a per-dispatch declared-input budget, and an explicit unattributed-coordinator line — and states plainly that per-attempt token components remain unavailable on Claude Code.

**Enforcement mandate (applies to every requirement):** no rule in this change ships as prose alone. Every requirement lands as an executable producer that constructs the artifact the rule governs, or as a deterministic checker that fails when the rule is broken; the prose that remains documents the contract that executable enforces. A rule with neither a live producer nor a consumer is not a deliverable, because it degrades silently — and because prose is the surface that degrades hardest across the Codex and opencode projections, while the scripts those projections carry byte-for-byte do not.

**Editing mandate (applies to every task):** rewrite affected sections whole rather than appending qualifiers, keep every duplicated predicate carrier consistent in the same task that changes the predicate, and regenerate runtime projections rather than hand-editing them.

## Capabilities

### New Capabilities

- `guided-lane-verification`: terminating fix-then-delta closure, live security-dimension choice, written intent as review criteria, lens count separated from specialist count, explicit invocation surface.
- `review-surface-economy`: auditable exclusion of checker-verified paths from the frozen review surface, with locally executed checker evidence as the precondition.
- `lane-routing-predicate`: presumptive spec-lane offer, three-option posture guidance, restored sensitivity authority, carrier consistency.
- `dispatch-cost-observability`: deterministic per-attempt wall time and declared-input budget, explicit unattributed accounting, no estimation of token components.

### Modified Capabilities

None.

## Impact

- New executables: `skills/verify/scripts/review-fan.mjs` (builds the anchored review package, derives the security floor, binds written intent, refuses a second full scope, and decides the ship-blocking join) and `skills/pipeline/scripts/review-surface.mjs` (runs the covering checkers locally and emits the eligible exclusion pathspec and its packet enumeration), both triplicated into the runtime projections.
- Lane and review contracts: `skills/spec/SKILL.md`, `agents/_shared/inline-review-contract.md`, `agents/inline-reviewer.md`.
- New skill: `skills/verify/SKILL.md` plus its generated projections and the `skills/modes/SKILL.md` catalog row.
- Review surface: the Freeze frozen-diff construction and staleness rules in `agents/ref-pipeline.md`, the changed-files table contract in `docs/verification-packet.md`, and QA's git-anchored scan-list derivation in `agents/qa.md`.
- Routing carriers: `agents/orchestrator.md`, `docs/pipeline-lanes.md`, `agents/ref-direct-modes.md`, `agents/ref-intake-flows.md`, `skills/spec/SKILL.md`, `CLAUDE.md` §5, and `skills/setup/managed-blocks/orchestrator-dispatch-rule.md`; the stale inlined copy in `skills/setup/SKILL.md` is reconciled to its declared source of truth.
- Observability: `agents/_shared/orchestrator-state.md` event and aggregate contracts, the `attempt_metrics` doctrine in the packaged observability reference, and `skills/pipeline/scripts/openspec-events.mjs` validation.
- Every canonical edit propagates to `plugins/team-harness/` and, for skills, to `installer-assets/opencode-skills/` through `tools/codex-runtime/sync-skills.mjs`; Codex agent TOMLs regenerate through `tools/codex-runtime/generate.mjs`.
- Deterministic suites: new `tests/test_review_fan.mjs` and `tests/test_review_surface.mjs`; extended `tests/test_pipeline_contract.py` (carrier equality, resolvable section anchors, absence of any verifier-side review-scope clause), `tests/test_openspec_events.mjs`, and `tests/test_codex_runtime.py`; plus a version bump and changelog fragment.

## Non-goals

- No change to the pipeline's own correction budget, ratchet, convergence ledger, or gate contract; the convergence mechanism shipped in v3.16.0 stays untouched and unmeasured by this change.
- No weakening of the security floor's category list, of its ambiguous-is-sensitive default, or of the requirement that a floor lens returning a blocker blocks the ship.
- No exclusion of any path that is only semantically checked, including `runtime/codex/instructions/**` and every hand-authored Codex or opencode override skill directory.
- No estimation, splitting, transcript mining, or native-identifier correlation to manufacture per-attempt token components; unavailable stays unavailable.
- No parallel-writer fan-out, and no second implementation agent in the guided lane.
- No archive-base backfill; `openspec/specs/` remains empty until its own change lands.
