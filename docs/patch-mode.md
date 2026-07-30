# Patch Mode — Delta-Granular Iteration Contract

Patch mode institutionalizes the observation from Phase C of the pipeline-collaboration-cost-redesign program: when a verifier fails and the failure scope is bounded, the producer edits only the named elements and the orchestrator re-runs only the verifier whose domain was touched. This is faster and cheaper than full re-dispatch while preserving all pipeline invariants.

## Core Concept: Blast Radius

Every verifier that writes a `failure-brief.md` declares a **blast radius** — the scope of the failure — using one of two values:

- **`localized {IDs}`** — the failure is confined to specific, named elements (AC identifiers, Work Plan Step IDs, files, or functions). A targeted edit resolves it without touching the rest of the implementation or design.
- **`structural`** — the failure implicates the overall design, multiple interconnected components, or the verifier cannot name the affected elements with confidence. Requires a full re-dispatch.

**The verifier declares blast radius; the orchestrator reads and routes.** The orchestrator never infers blast radius from the brief content — doing so would require re-reading the full workspace files (5-15K tokens each), defeating the purpose of the brief.

## Classification Rules

The verifier (tester / qa) declares blast radius in the `failure-brief.md` entry:

```markdown
**Blast radius:** localized {AC-2, STEP-3} | structural
```

**Default is `structural`.** When uncertain, declare `structural`. The fail-safe direction is always toward full re-dispatch, never toward a narrower patch.

**When to declare `localized`:**
- The failure names specific AC identifiers (e.g., `AC-3`, `AC-5`) and nothing else.
- A single file or a few lines need to change; the rest of the implementation is correct.
- The named elements are self-contained — fixing them does not cascade to other components.

**When to declare `structural`:**
- The failure reflects a design assumption that is wrong.
- Multiple AC fail together for the same underlying reason.
- The verifier cannot enumerate the affected elements without reading the full workspace.
- Any ambiguity or uncertainty exists.

## BOUNDED-PATCH Contract (Producer Side)

When the orchestrator dispatches a producer with `Blast radius: localized {IDs}`, the producer applies the **BOUNDED-PATCH** contract:

1. **Edit only the elements named in `{IDs}`.** Do not touch anything outside the named scope.
2. **Emit a diff summary** describing what changed and why.
3. **Do NOT re-derive the architecture (architect) / re-implement the feature (implementer).** The rest of the work product is correct; the patch is surgical.

When `Blast radius: structural`, the standard full re-dispatch contract applies — the producer re-derives/re-implements as normal.

## Selective Verifier Re-Run (Orchestrator Side)

After a localized patch, the orchestrator re-runs only the verifier(s) whose domain the patch touched. Re-dispatching the same agent within the 5-minute subagent cache TTL reuses that agent's warm cache, so keep selective re-runs prompt (see `docs/cost-and-caching.md`).

| Case | Localized re-run | Full re-run (structural) |
|------|-----------------|--------------------------|
| A (impl) | `tester` + `qa` | `tester` + `qa` |
| B (design) | `plan-reviewer` only | all verifiers |
| C (criteria) | all verifiers (criteria changes always touch everything) | all verifiers |

**No security-lens re-run exists in this table.** `security` and `adversary` do not participate in Phase-3 patch iterations: they run exactly ONCE per delivery group at the Pre-Delivery Security Audit (`agents/ref-pipeline.md § "Phase 3 — Verify"`), over the consolidated final diff, after all patch iterations have closed — so no patch can stale their verdict and no patch triggers their re-dispatch. Their findings are disposed by the operator at STAGE-GATE-3, never routed into this table. The audit's position is itself the staleness protection: nothing ships that the audit did not see, and the only re-audit is the single operator-caused amend re-run (`agents/ref-pipeline.md § "Re-audit on amend"`).

## Cost-Ordered Patch-Iteration Re-Run Sequencing

> Extends the Selective Verifier Re-Run table above (§ "Selective Verifier Re-Run") with an
> ordering layer: WHICH verifiers re-run per Case is unchanged; this section fixes the ORDER and
> the gating between them within one iteration. Wired at
> `agents/ref-pipeline.md § "Cost-ordered re-run — R0 → R1 → R2"` (inserted after the Case →
> routing table in `§ "Iteration"`); cross-referenced at `docs/pipeline-lanes.md § 7`.

**Scope.** Applies to Case A with `Blast radius: localized {IDs}`. `Blast radius:
structural` never narrows — see "Structural fail-safe" below.

**Why this exists.** The Case → routing table's "Verifier re-run" column names a SET of verifiers
per Case, re-dispatched in full on every iteration. Sequencing the same set by cost-per-signal —
cheapest first, each stage gating the next — spends zero reasoning-lens tokens on a patch that a
deterministic re-run already rejects, without changing which lenses are eligible to run or the
combined-verdict formula they feed.

### Owner attribution — by brief header, not by Case letter

The **finding-owner** is the lens named in the `## Iteration {N} — {agent}` header of the
`failure-brief.md` entry (`agents/ref-pipeline.md § "Iteration"`) — the lens
that raised the blocking finding — NOT the Case letter, which only routes the producer.
**Case → producer; brief author → owner.** Multi-owner: when more than one lens appealed in
iteration N, the owner set is the set of `{agent}` values across that iteration's headers; every
owner must close before R2 is eligible.

### The three stages, per localized iteration (Case A)

- **R0 — Deterministic test gate (always first, cheapest).** Before dispatching any reasoning
  lens, the orchestrator runs the frozen suite deterministically — a direct Bash run, the same
  pattern as the Phase 2.8 Freeze's build verification. Red is a confirmed regression: append a Case A brief
  entry (`Blast radius: localized {failing test IDs}`), bounce to the producer immediately, and
  spend zero lens tokens. Green enables R1.
- **R1 — Owner-lens re-verification (delta-scoped).** With R0 green, re-dispatch ONLY the owner
  lens (`qa` or `tester`, per the header-based attribution above); the delta-scope descriptor is
  the brief's `Blast radius: localized {IDs}` field. Owner still open (`fail`) → append a brief
  entry, bounce to the producer, zero tokens spent on the non-owner lens. Owner closed (`pass`) →
  enables R2.
- **R2 — Single consolidated final-state confirmation (delta-scoped, non-owner lens).** With
  every owner closed, the orchestrator issues exactly ONE delta-scoped dispatch of the non-owner
  lens over the final patched state — NOT a fresh full base pass. The combined verdict is computed
  over both lenses' final verdicts with the unchanged formula (`agents/ref-pipeline.md § "Gate —
  combined verdict"`). A fail on any lens in R2 opens a new iteration (counts against max-3).

**How R2 differs from a fresh base pass.** The base pass runs both lenses in parallel, each
reviewing the full diff. R2 runs only the non-owner lens, delta-scoped. It is cheaper on two
axes: (a) fewer lenses, (b) delta-scope instead of a full diff review. Stateless-dispatch honesty
(§ "Stateless-Dispatch Honesty" below) still applies: every lens still reads its inputs at
dispatch start; the saving is fewer lenses, fewer generation tokens, and delta-scoped reads —
never zero-read.

**Structural fail-safe.** For `Blast radius: structural`, R0 still runs first, but the R1
"owner-only" and R2 "confirmation" stages collapse: the COMPLETE Case-row verifier set runs.
A structural change is never narrowed to a localized patch's R1/R2 shape.

### Byte-consistency requirement (3-site invariant)

| Site | File | Anchor |
|------|------|--------|
| Canonical contract | `docs/patch-mode.md` (this file) | § Cost-Ordered Patch-Iteration Re-Run Sequencing |
| Orchestrator wiring | `agents/ref-pipeline.md` | § "Cost-ordered re-run — R0 → R1 → R2" |
| Cross-reference | `docs/pipeline-lanes.md` | § 7 |

A future edit to the sequencing rule at one site without the other two desynchronizes the
contract — the same failure mode § "Byte-consistency requirement" (Stage-1 panel re-firing,
below) already guards against, at the same pattern.

## Coherence Gate (Mandatory — Never Skipped)

After every localized patch, the orchestrator runs a coherence gate to confirm the patch did not introduce inconsistency. The gate is selective (cheaper) but never absent:

- **Patch of implementation (Case A localized):** dispatch `qa` in validate mode on the patched AC IDs. Pass → clear iteration. Fail → new iteration (counts against max-3).
- **Patch of plan (Case B localized):** dispatch `plan-reviewer` on the updated `01-plan.md`. Pass → clear iteration. Fail/concerns → new iteration.

**Patch mode makes iteration cheaper, not gateless.** This is the invariant: every localized path still goes through a gate before proceeding.

## Stateless-Dispatch Honesty (Trade-off Limit)

The bounded patch constrains **OUTPUT reasoning**: the producer does not re-derive the architecture or re-implement the feature. It does NOT eliminate **input re-reads**.

Because dispatch is stateless (no memory between runs), the dispatched producer reads `01-plan.md` and `failure-brief.md` at the start of every run. The actual savings are:

- **Fewer generation tokens:** the producer reasons and writes only the named elements, not the full design/implementation.
- **Fewer verifier re-runs:** only the verifier whose domain was touched re-runs, not the full parallel set.

What patch mode does NOT save: the cost of the producer reading the workspace inputs. The plan does not over-promise zero-read or zero-cost.

## Post-Compaction Recoverability

The `**Blast radius:**` field is part of the plain-text markdown template of `failure-brief.md`. It is not stored in a status block or ephemeral in-memory field. A resuming agent that reads `failure-brief.md` after context compaction can reconstruct the blast radius from the file. This is the same recovery path used for `**Root cause type:**`.

## Precedent

Phase C of the pipeline-collaboration-cost-redesign program executed this pattern manually: a plan-review Rule-1 failure was resolved by a bounded architect re-dispatch (collapse 2 tasks into 1, substance untouched) followed by a selective plan-reviewer re-run (the qa ratify-plan sub-run was NOT re-executed because plan substance was unchanged). Phase D (this change) institutionalizes that manual precedent into the pipeline contract.

---

## Stage-1 Selective Panel Re-Firing — RETIRED

**This entire mechanism is retired, not reduced.** It classified an operator correction that
re-opened Stage 1 into one of five buckets and selectively re-fired only the panel lenses each
bucket implicated, carrying the rest forward with an explicit label. The coordinator fusion
removes the Stage-1 correction-round apparatus this mechanism was iteration machinery for: the
panel's lenses now run exactly once, a `fail` presents its finding verbatim at STAGE-GATE-1
rather than withholding the plan, and a finding travels into implementation only by becoming an
AC of its owning task through the operator's `edit` reply
(`agents/ref-pipeline.md § "Finding disposition — the panel runs once, then a finding travels
only as an AC"`). There is no second round for this mechanism to classify, so bucket
classification, selective re-firing, carried-forward sub-verdicts, and the cross-round
intersection index all lose their subject. Nothing replaces them.

**What survives, restated on its own terms rather than as a bucket.** `security` is never carried
forward on a security-surface touch: `agents/security.md` retains its own no-carry-forward rule
for the case where an operator `edit` lands a criterion on the security-relevant design surface —
see `agents/security.md` for the current statement of that rule. `qa-plan` and `plan-reviewer`
each emit their verdict once and do not wait for a re-fire (`agents/qa-plan.md`,
`agents/plan-reviewer.md`).

**Prompt-caching stable-prefix discipline (§ "Prompt-caching stable-prefix discipline" pattern
above) still applies to any panel-agent dispatch** — placing stable content (the plan, the
relevant `CLAUDE.md` sections, the agent's own system prompt) ahead of anything dispatch-specific
remains good practice for cache efficiency; it no longer has a round-specific delta to place at
the end, because there are no rounds.
