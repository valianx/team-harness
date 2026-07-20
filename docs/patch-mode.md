# Patch Mode — Delta-Granular Iteration Contract

Patch mode institutionalizes the observation from Phase C of the pipeline-collaboration-cost-redesign program: when a verifier fails and the failure scope is bounded, the producer edits only the named elements and the orchestrator re-runs only the verifier whose domain was touched. This is faster and cheaper than full re-dispatch while preserving all pipeline invariants.

## Core Concept: Blast Radius

Every verifier that writes a `failure-brief.md` declares a **blast radius** — the scope of the failure — using one of two values:

- **`localized {IDs}`** — the failure is confined to specific, named elements (AC identifiers, Work Plan Step IDs, files, or functions). A targeted edit resolves it without touching the rest of the implementation or design.
- **`structural`** — the failure implicates the overall design, multiple interconnected components, or the verifier cannot name the affected elements with confidence. Requires a full re-dispatch.

**The verifier declares blast radius; the orchestrator reads and routes.** The orchestrator never infers blast radius from the brief content — doing so would require re-reading the full workspace files (5-15K tokens each), defeating the purpose of the brief.

## Classification Rules

The verifier (tester / qa / security) declares blast radius in the `failure-brief.md` entry:

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
| A (impl) | `tester` + `qa` (security skipped unless patch touches security-sensitive code) | `tester` + `qa` + `security` |
| B (design) | `plan-reviewer` only | all verifiers |
| C (criteria) | all verifiers (criteria changes always touch everything) | all verifiers |
| D (security-only) | `security` only — plus mandatory coherence gate (`qa` validate on patched AC IDs, per § Coherence Gate) | `security` only |

## Cost-Ordered Patch-Iteration Re-Run Sequencing

> Extends the Selective Verifier Re-Run table above (§ "Selective Verifier Re-Run") with an
> ordering layer: WHICH verifiers re-run per Case is unchanged; this section fixes the ORDER and
> the gating between them within one iteration. Wired at `agents/orchestrator.md § "If any agent
> fails → ITERATE"` (the R0/R1/R2 subsection, inserted after the Case → routing table and before
> the Security-verdict staleness re-gate); cross-referenced at `docs/pipeline-lanes.md § 7`.

**Scope.** Applies to Case A and Case D with `Blast radius: localized {IDs}`. `Blast radius:
structural` never narrows — see "Structural fail-safe" below.

**Why this exists.** The Case → routing table's "Verifier re-run" column names a SET of verifiers
per Case, re-dispatched in full on every iteration. That set can include the most expensive
reasoning lenses (`security`, `adversary`) even when a cheap deterministic test suite alone would
have caught the regression. Sequencing the same set by cost-per-signal — cheapest first, each
stage gating the next — spends zero reasoning-lens tokens on a patch that a deterministic re-run
already rejects, without changing which lenses are eligible to run or the worst-of formula they
feed.

### Owner attribution — by brief header, not by Case letter

The **finding-owner** is the lens named in the `## Iteration {N} — {agent}` header of the
`failure-brief.md` entry (`agents/orchestrator.md § "If any agent fails → ITERATE"`) — the lens
that raised the blocking finding — NOT the Case letter, which only routes the producer. When an
implementer patch (producer = `implementer`, a Case A shape) closes a finding raised by `security`
or `adversary`, the brief's author is `security`/`adversary`, so the owner is `security`/
`adversary`. **Case → producer; brief author → owner.** Multi-owner: when more than one lens
appealed in iteration N, the owner set is the set of `{agent}` values across that iteration's
headers; every owner must close before R2 is eligible.

### The three stages, per localized iteration (Case A / Case D)

- **R0 — Deterministic test gate (always first, cheapest).** Before dispatching any reasoning
  lens, the orchestrator runs the frozen suite deterministically — a direct Bash run, the same
  pattern as Phase 3.75 build verification. Red is a confirmed regression: append a Case A brief
  entry (`Blast radius: localized {failing test IDs}`), bounce to the producer immediately, and
  spend zero lens tokens. Green enables R1.
- **R1 — Owner-lens re-verification (delta-scoped).** With R0 green, re-dispatch ONLY the owner
  lens (per the header-based attribution above). **The delta-scope descriptor depends on which
  lens owns the finding — these are two distinct real mechanisms, never substituted for each
  other:**
  - Owner is **`adversary`** → the dispatch carries the real `**Re-verification scope:**
    localized {files, finding-IDs}` field (`agents/adversary.md:118`; the Case-D re-dispatch
    contract at `agents/orchestrator.md:1123`) — NOT a `Blast radius` field standing in for it.
    The brief's `Blast radius: localized {IDs}` is still present, but as the brief's own
    classification/routing field, never as the adversary's re-attack descriptor.
  - Owner is **`security`/`qa`/`tester`** → the delta-scope descriptor is the brief's `Blast
    radius: localized {IDs}` field — these lenses have no `Re-verification scope` field of their
    own; that field is specific to `adversary`.
  - Owner still open (`fail`/`broke-it`/`risks-found`) → append a brief entry, bounce to the
    producer (for an `adversary` owner, evaluate the whack-a-mole escalation trigger first — see
    `docs/patch-mode.md § Whack-a-Mole Structural Escalation`), zero tokens spent on non-owner
    lenses. Owner closed (`pass`/`could-not-break`/`clean`) → enables R2.
- **R2 — Single consolidated final-state confirmation (delta-scoped, non-owner lenses).** With
  every owner closed, the orchestrator issues exactly ONE consolidated dispatch covering the
  non-owner lenses from this task's base-pass set, over the final patched state, delta-scoped —
  NOT a fresh full base pass. A non-owner `adversary` lens carries its own `**Re-verification
  scope:** localized {...}` in this dispatch. **`{...}` is explicitly the files changed since the
  previous round** — the same delta descriptor the Case-D adversary re-dispatch fields already
  define (`agents/orchestrator.md § "Case-D adversary re-dispatch fields"`, `:1123`), reused
  verbatim for this non-owner-confirmation case, never narrowed to the owning lens's own
  finding-IDs alone. The worst-of is computed over the final verdicts of
  ALL lenses with the unchanged formula and mappings (§ "Gate — worst-of combined verdict",
  `agents/orchestrator.md:1078-1085`). A fail on any lens in R2 opens a new iteration (counts
  against max-3).

**How R2 differs from a fresh base pass.** The base pass runs all four lenses in parallel, each
reviewing the full diff. R2 runs only the non-owner lenses, delta-scoped. It is cheaper on two
axes: (a) fewer lenses, (b) delta-scope instead of a full diff review. **Security exception:**
when the staleness re-gate (`agents/orchestrator.md § "Security-verdict staleness re-gate"`)
fires, the security+adversary portion of R2 is a FRESH re-run (the adversary re-attacks the
changed surface from scratch; the re-dispatch carries `**Re-verification scope:** localized {the
changed surface}` per that same section, without treating any prior `could-not-break` as frozen).
Stateless-dispatch honesty (§
"Stateless-Dispatch Honesty" above) still applies: every lens still reads its inputs at dispatch
start; the saving is fewer lenses, fewer generation tokens, and delta-scoped reads — never
zero-read.

**Structural fail-safe.** For `Blast radius: structural`, R0 still runs first, but the R1
"owner-only" and R2 "confirmation" stages collapse: the COMPLETE Case-row verifier set runs.
A structural change is never narrowed to a localized patch's R1/R2 shape.

### Reconciliation with the security-verdict staleness re-gate (non-negotiable)

1. **Owner is `security` or `adversary` AND the security surface changed:** the owner set clamps
   to BOTH `{security, adversary}` in R1 whenever `adversary_floor_applies == true` — this is
   exactly the existing "a stale verdict re-runs BOTH" rule already stated verbatim at
   `agents/orchestrator.md § "Security-verdict staleness re-gate"` ("the security stage —
   `security` unconditionally on the security-relevant surface, `adversary` additionally when
   `adversary_floor_applies == true` — MUST re-run before delivery or push proceeds"); this
   subsection does not restate a narrower version of that clause, it defers to it by reference.
   That pair does NOT then go to R2 as a delta-trust confirmation; R2 covers `tester`+`qa` only in
   that iteration.
2. **Owner is `qa`/`tester` but the patch touched the security surface:** the staleness re-gate
   fires independently of ownership — the FULL trigger at `agents/orchestrator.md § "Security-
   verdict staleness re-gate"` governs, not a narrower "design-surface-only" reading. That trigger
   fires on either limb, and both limbs apply here unchanged: (a) an edit to the security-relevant
   design surface (the enforcement model, a validation, an allowlist, a rate limit, an
   early-return, an error handler, or any other element of the canonical control vocabulary), OR
   (b) new implementation files that touch auth/API/DB/crypto/session paths, or that add/modify
   any element of the canonical control vocabulary regardless of path. Either limb makes the
   security+adversary portion of R2 a FRESH re-run (no skip, no delta-trust). The sequencing never
   lets a stale security verdict survive to delivery.

   **Recompute-and-recache trigger extended to this branch (closes a mechanism gap this claim
   used to leave open for limb (b)).** When it is specifically limb (b) that fires here — a
   Case-A/D patch iteration owned by `qa`/`tester` adds new implementation files touching
   auth/API/DB/crypto/session paths, or adds/modifies any canonical-control-vocabulary element,
   while `adversary_floor_applies` is still cached `false` from a base pass where
   `changes_security_control` was `false` — force-set `changes_security_control: true` for the
   remainder of the task, applying the same force-set/recompute pairing discipline
   `agents/orchestrator.md § "Unified rule governing every security_sensitive-force-set site"`
   establishes for every additional force-set site added anywhere in that file (never an inline
   re-derivation of the pairing). This force-set fires the SAME "Recompute-and-recache
   `adversary_floor_applies`" mechanism (`agents/orchestrator.md § "Security-verdict staleness
   re-gate"`) that already reacts to a Case-B `changes_security_control` change — it now ALSO fires
   on this limb-(b)-during-Case-A/D-patch trigger, so `adversary_floor_applies` is recomputed and
   the cached field is rewritten in `00-state.md § Current State` BEFORE R2 proceeds. Without this
   extension, the "FRESH re-run" claim two sentences above would hold for `security` but not for
   `adversary` on this trigger; with it, `adversary` is dispatched on the newly-discovered control
   rather than silently skipped on a stale cached `false`.

   **Known, disclosed limitation (this fix closes the gap only for a task with an
   already-recorded security/adversary verdict — it does not re-arm classification for a task
   never classified `security_sensitive` at all; out of scope for this fix).** The extension
   above operates entirely inside the Security-verdict staleness re-gate (`agents/orchestrator.md
   § "Security-verdict staleness re-gate"`), whose own opening sentence gates every trigger it
   lists — including this one — on occurring "AFTER a security/adversary verdict is recorded."
   That precondition holds for a task that WAS classified `security_sensitive: true` at some
   point (a verdict exists for the re-gate, and this extension, to apply to). It does NOT hold
   for a task that was never classified `security_sensitive` at Design time (correctly, at the
   time — the original diff touched nothing sensitive) and passed the Phase-2-close backstop
   cleanly, so no verdict was ever recorded. If a LATER Case-A/D patch, owned by `qa`/`tester`,
   introduces a brand-new security control for such a task, neither `security` nor `adversary`
   runs: nothing in `agents/orchestrator.md` re-arms `security_sensitive`/`security_floor_applies`
   for a task mid-Phase-3-iteration, and the Phase-2-close backstop that would have force-set that
   classification (`agents/orchestrator.md § "Coordination note — three distinct Phase-2-close
   mechanisms"`) runs once, before Phase 3, and is never re-triggered by a later iteration. This
   residual is pre-existing — independent of, and not introduced by, this cost-ordered re-run
   sequencing — and closing it is explicitly out of scope for this fix; closing it is recommended
   as a candidate for a dedicated follow-up issue tracking re-arming task security-classification
   mid-Phase-3-iteration, but no such issue has been filed yet and nothing in this pipeline forces
   one to be filed before or after this fix ships. Separately, the "recomputed... rewritten...
   BEFORE R2 proceeds" ordering the extension above depends on (the "Recompute-and-recache trigger
   extended to this branch" paragraph above) is likewise **prose-instructed discipline, not a
   mechanical guarantee** — matching the monotonic-`N` precedent (`agents/orchestrator.md §
   "N is strictly monotonic-increasing per dispatch"`), no new enforcement mechanism is introduced
   here: no automated check currently confirms the recompute-and-rewrite actually completed before
   R2 dispatches, so a skipped or delayed recompute (e.g., a session interruption between the
   force-set and the orchestrator's own `00-state.md` write) could silently leave
   `adversary_floor_applies` stale for that dispatch with nothing to catch it.

### Reconciliation with the adversary per-round report-integrity scan

Whichever stage (R1 as owner, or R2 as confirmation) dispatches `adversary`, the orchestrator
declares the next monotonic `adversary_rounds: N` BEFORE the dispatch and runs the per-round
report-integrity scan (`agents/orchestrator.md:1045-1074`) AFTER it returns — unchanged. Sequencing
changes WHEN/HOW OFTEN these lenses run, never WHAT they do when they run.

### Byte-consistency requirement (3-site invariant)

| Site | File | Anchor |
|------|------|--------|
| Canonical contract | `docs/patch-mode.md` (this file) | § Cost-Ordered Patch-Iteration Re-Run Sequencing |
| Orchestrator wiring | `agents/orchestrator.md` | § "If any agent fails → ITERATE" — R0/R1/R2 subsection |
| Cross-reference | `docs/pipeline-lanes.md` | § 7 (two-lens floor) |

A future edit to the sequencing rule at one site without the other two desynchronizes the
contract — the same failure mode `docs/patch-mode.md § Byte-consistency requirement` (Stage-1
panel re-firing) already guards against, at the same pattern.

## Whack-a-Mole Structural Escalation

> Decides WHEN a Phase-3 patch iteration stops dispatching the implementer for another bounded
> patch and instead pivots to a fresh `architect` re-design. Wired at `agents/orchestrator.md §
> "If any agent fails → ITERATE"` (the escalation subsection, inserted immediately after the
> R0/R1/R2 subsection's "Reconciliation with the adversary per-round report-integrity scan"
> paragraph and before the Security-verdict staleness re-gate).

**Scope.** Evaluates ONLY at R1 of the R0/R1/R2 sequencing (§ "Cost-Ordered Patch-Iteration
Re-Run Sequencing" above), and ONLY when the R1 owner set includes `adversary` — whether
`adversary` alone, or as part of the security+adversary clamp (§ "Reconciliation with the
security-verdict staleness re-gate" item 1 above). It NEVER evaluates at R0 or R2, and it never
interacts with the structural fail-safe (§ "Structural fail-safe" above): `Blast radius:
structural` collapses R0 straight to the COMPLETE Case-row verifier set, bypassing R1/R2
narrowing entirely — this detector's R1-scoped evaluation point is simply not reached on that
branch.

**Why this exists.** The Case → routing table already routes Case B to a full architect
re-design when the blast radius is `structural`, but only via the failing verifier's OWN
blast-radius classification — nothing triggers automatically on the signature "the remediation
closed some breaks but opened new ones on its own surface," or on "N consecutive rounds still
break the same changed control." Without an automatic trigger, the structural pivot is
manual/improvised under pressure, discovered only after burning tactical iterations (precedent:
PR #499's denylist-vs-positive-grammar pivot; #501's `broke-it` ×3, pivoted only at 3/3). This
section automates that pivot at the earliest point the evidence supports it.

### Evaluation point (AC-25)

The detector evaluates immediately after an `adversary` round in R1 (as owner) returns
`broke-it` AND the per-round report-integrity scan (`agents/orchestrator.md § "Adversary
per-round report-integrity scan"`) ACCEPTS the round as clean. It NEVER evaluates on a `status:
blocked` (collision) round or an integrity-scan-failed round — that scan's own verdict-handling
table already routes those to a re-dispatch with the next monotonic `N`, BEFORE any detector
evaluation is possible; a rejected round is never whack-a-mole input. **Secondary evaluation
point:** when the security-verdict staleness re-gate forces a FRESH security+adversary re-run
inside R2 (§ "Reconciliation with the security-verdict staleness re-gate" above) and that FRESH
adversary round also returns `broke-it`, the same detector applies over the same round-report
series — the evaluation mechanics are identical; only the R1-vs-R2 dispatch context differs.

### Detector — two variants, OR (AC-16, AC-17)

**Variant 1 — new-surface (fires immediately).** Let B(N) be the set of control IDs carrying a
`broke-it` verdict in round N, read from `reviews/04-adversary-r{N}.md § Attempts by Control`
(`agents/adversary.md § Output Contract`). **B(N-1) is NOT literally round N-1** — it is the
break-set of the most recent round PRIOR to N that the per-round report-integrity scan (§
"Reconciliation with the adversary per-round report-integrity scan" below) ACCEPTED as clean,
skipping over any intervening integrity-rejected round (a collision or a check-1-4 failure); a
rejected round carries no valid break-set and is never read as this baseline, consistent with this
section's own "invalid data is never whack-a-mole input" rule (§ "Reconciliation with the
adversary per-round report-integrity scan" below). Fires when **`B(N-1) \ B(N) ≠ ∅`** (at least one
previously broken control is CONFIRMED closed this round) **AND** **`B(N) \ B(N-1) ≠ ∅`** (at
least one NEW control is broken on the patch's own remediation surface). This is the moving-target
signature: the remediation closes some breaks while opening others — evidence of a design-model
problem, not a bounded implementation slip.

**Variant 2 — consecutive (threshold N=2).** `adversary_consecutive_broke_it` (new `00-state.md`
field, § "Byte-consistency requirement" below) increments by 1 for every integrity-clean
`adversary` round that returns `broke-it` on a changed/hard-point control, and resets to 0 on a
`could-not-break` verdict. Fires when the counter reaches 2 — the 2nd consecutive round —
deliberately BEFORE the implementer's max-3-iteration budget (`agents/orchestrator.md § "Max 3
iterations"`) is exhausted: a threshold of 3 would trigger exactly at budget exhaustion, too late
for the early-pivot this section exists to provide.

**Known, disclosed limitation (detector coverage gap — an analytical limitation of the two-variant
design as approved, out of scope for a mechanism fix here).** A remediation sequence that
interleaves genuine `could-not-break` rounds between recurring-but-distinct breaks defeats both
variants: Variant 1 compares only adjacent rounds N-1/N, so a clean round immediately preceding a
new break makes `B(N-1) \ B(N) = ∅` and the variant can never fire on that pair; Variant 2 resets
its counter to 0 on any `could-not-break`, so it never reaches its threshold under the same
interleaving. The pattern `broke-it, could-not-break, broke-it, could-not-break, ...` — which can
arise either from a genuinely unrelated reopening of a similar flaw OR from a genuine
moving-target design defect (the same interleave a real design fault produces; a missed case is
not necessarily a benign one) — falls through both variants undetected regardless of cause. This
is a genuine, known limitation of the two-variant design as approved at STAGE-GATE-1, not an
implementation bug, and closing it (e.g., a wider comparison window across more than two rounds)
is out of scope for this fix — expanding the detector's own comparison logic now would be a scope
increase beyond what was approved, not a correction of what was built; it is recorded here as a
candidate for a future redesign consideration, not a defect blocking this task. A case missed by
both variants still falls through to the pre-existing max-3-iteration operator-escalation floor
(`agents/orchestrator.md § "Max 3 iterations"`) below, which DOES still catch it — only later than
this detector's early-pivot optimization would have. This gap is not strictly equivalent to a
pre-feature baseline, however: this feature's own delta-scoped R1 re-attack (§ "Cost-Ordered
Patch-Iteration Re-Run Sequencing" above, the `**Re-verification scope:** localized {...}` field)
raises the base rate of narrow, could-not-break rounds relative to a full-scope base-pass-only
world — a narrow-delta `could-not-break` is weaker evidence than the full-scope one it replaces,
yet Variant 2 zeroes its counter identically on either — so the interleaving-evasion pattern is
relatively MORE reachable under this feature's own cost-ordered re-run sequencing than it would be
in a hypothetical world without it. This is a known gap in the added optimization's coverage, not
a new regression or a security bypass.

### Action on trigger (AC-18–AC-22, AC-28)

Either variant firing triggers the SAME action sequence:

1. **Does not consume an implementer iteration (AC-18).** The failed `adversary` round that
   triggered detection is the terminal signal for this iteration, not a fresh implementer bounce
   — the escalation below replaces the default bounce-to-producer that the R0/R1/R2 sequencing's
   R1 "owner still open" branch would otherwise take.
2. **Preempts R2 for this iteration (AC-19).** R2 only ever runs once every R1 owner has closed
   (§ "The three stages, per localized iteration" above); an `adversary` owner returning
   `broke-it` means R1 did not close, so R2 was never going to run in this iteration regardless.
   The escalation intercepts exactly that "R1 owner did not close" branch — R2 is trivially
   preempted (it was never reachable), and the redesign pivot below replaces the bounce.
3. **IF `structural_escalations` is below its cap (default 1): pivots to a FRESH `architect`
   re-design (Case B structural form) (AC-20, AC-28).** The
   dispatch carries the **ACCUMULATED break-set** — every break vector from every round belonging
   to the CURRENT whack-a-mole detection episode for the CURRENT task, never only the triggering
   round or the original AC alone — as the design SPECIFICATION. **This is the contiguous run of
   adversary rounds since this task's own base-pass round (or since the last fresh base pass
   reset the episode), never a filesystem-wide glob over `reviews/04-adversary-r*.md`.** This
   pipeline's `adversary_rounds` counter is shared and monotonic ACROSS TASKS in a multi-task run
   (§ "Adversary per-round report-integrity scan" above) — a literal glob over every file matching
   that pattern would pull an unrelated, already-closed task's break vectors into this task's
   redesign spec. The orchestrator derives the current episode's round range from the persisted
   `whack_a_mole_episode_start_round` field (`agents/orchestrator.md § "Current State"` schema)
   through the triggering round — a NAMED, persisted field, never unstructured `00-state.md`
   history reconstruction or filesystem enumeration. **The re-design dispatch payload MUST
   additionally instruct the architect to research externally BEFORE designing:**
   WebSearch/WebFetch for known solution patterns and established mitigations for the broken
   control's problem class, plus context7 when a third-party API or library is involved. This is
   a producer/consumer directive — the orchestrator MUST include it explicitly in the payload;
   the architect's passive tool availability is not sufficient, since nothing previously
   instructed its use inside this specific remediation loop. The resulting re-design MUST carry a
   prior-art/research-citation section that either cites the patterns/mitigations found or
   explicitly states that no applicable prior art was found. The architect produces one coherent
   design and overwrites `01-plan.md` in place. **ELSE (the cap is already consumed):** escalates
   directly to the operator (`status: blocked`) with the accumulated break-set and all prior
   design iterations, per § "Budget interaction" below — never a second redesign.
4. **Re-runs plan-review (Phase 1.6) + security design-review (Phase 1.5 panel) before
   re-implementing (AC-21).** The redesign is never fast-tracked straight to the implementer.
5. **Consumes one structural escalation; re-implementation runs a fresh base pass (AC-22, AC-23,
   AC-24 — see the budget section below for the corrected framing).**

### Budget interaction — implementer iterations vs. structural escalations (AC-23, AC-24)

`structural_escalations` (new `00-state.md` field) caps architect-redesign pivots at **1 by
default**. A SECOND whack-a-mole trigger after the redesign already consumed that escalation
scales to the operator (`status: blocked`) with the accumulated break-set and BOTH design
iterations attached — never an unbounded redesign loop.

The implementer's max-3-iteration budget is reserved for genuine implementation bugs — a break
the CURRENT design already prohibits but the code got wrong. The fresh base pass that follows a
**detector-triggered** redesign (§ "Action on trigger" above) receives a FRESH max-3 implementer
budget, because it targets a NEW design model; the prior tactical iterations were spent against a
DIFFERENT, now-discarded design model.

**A `structural` redesign reached via the Case → routing table (Case B, `structural` blast
radius) rather than via this detector does NOT reset the implementer budget through this
mechanism.** That path is governed entirely by the pre-existing Case-routing rules
(`agents/orchestrator.md § "If any agent fails → ITERATE"` Case table) and is unrelated to
`structural_escalations`, which increments ONLY on a detector-triggered redesign (§ "Detector"
above) — a routing-table-reached redesign never touches that counter and never grants a fresh
budget by this paragraph.

**`structural_escalations` is monotonic per task and is NEVER reset by a redesign or by a fresh
base pass — only the implementer iteration budget resets** (corrected framing, per the security
design-review recommendation at `reviews/01-plan-review.md § Security Design-Review`). Resetting
the escalation counter itself, rather than only the implementer's tactical budget, would let the
`structural_escalations` cap = 1 floor above be silently defeated by an unbounded sequence of
redesign→fresh-base-pass→redesign cycles, each one individually "fresh" but collectively
unbounded — exactly the loop AC-23 exists to cap. Only the implementer's iteration budget is
scoped to a design model and legitimately resets with it; the escalation count is scoped to the
TASK and must persist across every design model the task goes through.

**The fresh base pass zeroes `adversary_consecutive_broke_it`** (corrected framing, mirrors the
implementer-budget reset). The counter is bound to the discarded design model's controls — a
`broke-it` streak recorded against the OLD design carries no signal about the NEW design's
controls, and carrying it forward would let a single stale count trigger Variant 2 prematurely
against a design the adversary has not yet attacked even once. `structural_escalations` and
`adversary_consecutive_broke_it` are independent counters with independent reset rules: the
escalation count is task-scoped and monotonic (never resets); the consecutive-broke-it count is
design-model-scoped and resets both on a `could-not-break` verdict (§ "Detector" above) and on
every fresh base pass following a redesign.

**Prose-instructed discipline, not a mechanical guarantee (matching the monotonic-`N` precedent
`agents/orchestrator.md § "N is strictly monotonic-increasing per dispatch"`; no new enforcement
mechanism is introduced here).** Three residuals in this section share that character, none
independently gated by an automated check: (1) the cap-and-escalate sequence above has no wired
gate between "a second trigger is detected" and "`structural_escalations` is persisted and the
operator is notified" — a session interruption between those two steps could silently lose the
increment or the escalation, letting a redesign proceed as if it were the first; (2) the external-
research directive (§ "Action on trigger" step 3, AC-28) is a dispatch-construction instruction
with no downstream check confirming it was included in the payload or that the resulting design's
prior-art section reflects genuine research rather than a placeholder; (3) the detector's own
evaluation point (§ "Evaluation point" above) has no persisted `00-state.md` marker recording
"evaluated for round N," so a session interruption between an integrity-clean `broke-it` round and
the detector's evaluation could silently skip that round's check.

**Fail-closed-on-unconfirmable-persistence-state (AC-30) — closes residual (1)'s compounding
risk.** Whenever the orchestrator cannot positively confirm, from `00-state.md` and its
corroborating trace (`00-execution-events.{jsonl,md}`), that the persisted `structural_escalations`/
`whack_a_mole_episode_start_round` values accurately reflect every redesign this task has actually
undergone — e.g., on resume after an interruption, when evidence of a redesign exists (a landed
architect revision to `01-plan.md`, a fresh base pass having run) without a matching persisted
escalation increment — the orchestrator FAILS CLOSED: treats the cap as already consumed (never as
available), escalates directly to the operator (`status: blocked`) with the ambiguity stated
explicitly, and NEVER grants a FRESH implementer budget against unconfirmed persistence state. This
mirrors the existing fail-closed-on-absence discipline already applied to `changes_security_control`
(`agents/orchestrator.md § "Adversary floor predicate"`) and to the `adversary_round_sizes`
absent-baseline check (`agents/orchestrator.md § "Adversary per-round report-integrity scan"` check
3) — unlike those two fields, there is no sound way to re-derive a lost escalation COUNT from
on-disk evidence alone, so escalating to the operator (not a safe-substitute recompute) is the only
sound resolution. This converts residual (1)'s previously-unbounded redesign-compounding risk into
a bounded operator escalation, while leaving the fresh-max-3-budget-per-redesign policy (AC-24, §
"Budget interaction" above) intact for the ordinary, confirmed-state case.

Residuals (2) and (3) remain bounded exactly as before — fail-SAFE (a missed trigger costs a
delayed escalation or an extra tactical iteration, never a silent security bypass), backstopped by
the pre-existing max-3-iteration operator-escalation floor
(`agents/orchestrator.md § "Max 3 iterations"`). Residual (1)'s own ultimate bound is now the
fail-closed-escalate rule immediately above, not max-3.

### Reconciliation with the adversary per-round report-integrity scan (AC-25, cross-reference)

The detector is downstream of, never a substitute for, the per-round report-integrity scan (§
"Reconciliation with the adversary per-round report-integrity scan" above, `agents/orchestrator.md
§ "Adversary per-round report-integrity scan"`). A round rejected by that scan (a collision or any
of its four checks) is re-dispatched with the next monotonic `N` before any whack-a-mole
evaluation is attempted — invalid data is never whack-a-mole input.

### No parallel dispatch predicate (AC-26)

The detector reads EXISTING state only — the adversary round-report series
(`reviews/04-adversary-r*.md § Attempts by Control`), `adversary_verdict`, the authoritative
`adversary_rounds: N` counter (§ "Adversary per-round report-integrity scan" above), and the
per-control break-sets it derives from those reports — and adds exactly two new fields to
`00-state.md § Current State`: `adversary_consecutive_broke_it` and `structural_escalations`. It
introduces no rival dispatch predicate and preserves `adversary_floor_applies` /
`security_floor_applies` / the Case → routing table / the worst-of formula verbatim — the
cost-ordered re-run sequencing's invariants are extended, never contradicted, by this section. A
third field, `whack_a_mole_episode_start_round` (declared in `agents/orchestrator.md § "Current
State"` schema), is added purely as episode-boundary bookkeeping for § "Action on trigger" step 3
above's round-range computation — read-only, never a dispatch predicate, so the no-rival-predicate
claim above is unaffected.

### Known, disclosed limitation — setter coverage

The setter that populates `whack_a_mole_episode_start_round` on its limb-(b) path
(`agents/orchestrator.md § "Recompute-and-recache trigger extended to this branch"`) is scoped
specifically to a Case-A/D patch, owned by `qa`/`tester`, that force-sets
`changes_security_control: true` mid-iteration. It does not cover a distinct, pre-existing
mechanism: a task already classified `security_sensitive: true` at Design (a `security` verdict is
already on record, satisfying the staleness re-gate's own "AFTER a security/adversary verdict is
recorded" precondition) but `changes_security_control: false` at the base pass (so
`adversary_floor_applies` was cached `false` and `adversary` never ran at the base pass) can later
have `changes_security_control` flipped to `true` by a Case-B architect correction — firing the
staleness re-gate's own 4th trigger bullet and the older "Recompute-and-recache
`adversary_floor_applies` whenever this re-gate fires on a `changes_security_control` change"
mechanism (`agents/orchestrator.md § "Security-verdict staleness re-gate"`), a genuinely different
code path from the limb-(b) extension above. On this route, `adversary` is also dispatched for the
first time for that task, and neither of this field's two setter branches fires —
`whack_a_mole_episode_start_round` stays `null`, reproducing the same undefined-round-range worst
case (§ "Action on trigger" step 3 above) via a route this fix does not touch.

This is bounded, not a security bypass: `security`/`adversary` themselves still run correctly on
this route; the gap affects only the completeness of the accumulated break-set fed to a
hypothetical future architect redesign, on a narrow precondition (a task already-classified-sensitive
later gaining a security-relevant control via a plan correction, not via ordinary implementation).
Closing it requires generalizing the setter to a mechanism-agnostic rule (set the field on ANY first
dispatch of `adversary` for the task's current episode, regardless of which named mechanism caused
it) — recommended as a candidate for the same follow-up issue tracking re-arming task
security-classification mid-Phase-3-iteration (`agents/orchestrator.md § "Known, disclosed
limitation (this fix closes the gap only for a task with an already-recorded security/adversary
verdict…)"`), since both residuals share the same root shape: a setter/classification mechanism
enumerated by NAME rather than by a general trigger-agnostic condition.

### Byte-consistency requirement (2-site invariant) (AC-27)

| Site | File | Anchor |
|------|------|--------|
| Canonical contract | `docs/patch-mode.md` (this file) | § Whack-a-Mole Structural Escalation |
| Orchestrator wiring | `agents/orchestrator.md` | § "If any agent fails → ITERATE" — whack-a-mole escalation subsection |

A future edit to the escalation rule at one site without the other desynchronizes the contract —
the same failure mode § "Byte-consistency requirement" above (the cost-ordered re-run sequencing's
own 3-site invariant) already guards against, at the same pattern.

## Coherence Gate (Mandatory — Never Skipped)

After every localized patch, the orchestrator runs a coherence gate to confirm the patch did not introduce inconsistency. The gate is selective (cheaper) but never absent:

- **Patch of implementation (Case A/D localized):** dispatch `qa` in validate mode on the patched AC IDs. Pass → clear iteration. Fail → new iteration (counts against max-3).
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

## Stage-1 Selective Panel Re-Firing

> Extends the Stage-2 BOUNDED-PATCH pattern above (blast radius, selective verifier re-run,
> stateless-dispatch honesty) into Stage 1 — the plan-review panel's own iteration mechanics.
> Wired at `agents/orchestrator.md § "Correction-classification — selective panel re-firing"`
> (T2-AC-11/12/13/15); consumed by `agents/plan-reviewer.md` (carried-forward + combined-verdict
> recomputation, T4-AC-6) and `agents/qa-plan.md` / `agents/security.md` (delta-scoped review
> awareness, T4-AC-5).

### Why this exists

The Stage-1 panel (`architect` → `qa-plan` → `security` (when sensitive) → `plan-reviewer`) is a
major cost center when an operator correction re-opens Stage 1: re-firing all four lenses at full
cost for a one-line editorial tightening, or for a correction that touches only the security
surface, wastes tokens the panel's own design does not need to spend. The fan-out (how many
lenses exist) stays untouched — the four lenses remain separate specialist agents (§ "Specialist
separation" below). The fix is on the ITERATION axis: how often each lens re-fires, and over how
much.

### The correction classifier — ordered, first-match-wins, fail-safe toward MORE review

The full panel runs in full exactly ONCE, at initial design. Thereafter, any operator correction
that re-opens Stage 1 (a STAGE-GATE-1 `reject {reason}`, an `edit`-then-`approve`, or a
leader-relayed mid-Stage-1 correction) is classified by this ordered procedure — the FIRST bucket
whose trigger predicate matches wins:

| # | Bucket | Trigger predicate | Routed lens(es) |
|---|--------|--------------------|------------------|
| 1 | Broad structural | Adds/removes a task; changes Delivery Grouping, the DAG/`Depends on:` edges, or `### Services Touched`; or the operator's reason names a re-architecture | **Full panel** — `architect` full re-design + `qa-plan` + `security` (if sensitive) + `plan-reviewer` |
| 2 | Security-relevant surface touched | Adds/removes/modifies any element of the security-relevant design surface — a floor, a waiver, an enforcement model, a sensitive-path control, a security/adversary dispatch condition, or any AC that gates access | **`security`** + `plan-reviewer` consolidator — `qa-plan` carried forward |
| 3 | Coverage change, non-security | AC added/removed/reworded on a non-security surface (the AC set changed) | **`qa-plan`** + `plan-reviewer` consolidator — `security` carried forward |
| 4 | Editorial / operator-decided reduction | A rewording or a reduction the operator has already explicitly and unambiguously decided, on a non-security, non-coverage surface (e.g. dropping a resolved decisions-bullet, tightening prose) | **Deterministic sanity check only** — no LLM lens; all sub-verdicts carried forward |
| 5 | Shape/consistency-only | A purely mechanical concern (stale count, dangling cross-ref) | **Deterministic checks only** (the Phase-1.5a scan, `docs/plan-structure-gate.md`) — all sub-verdicts carried forward |

**Fail-safe rules.** A correction spanning multiple buckets takes the UNION of their lenses (a
security-sensitive AC reword → `security` + `qa-plan`). An ambiguous or unclear-scope correction
routes to the FULL PANEL — the same fail-safe direction as the Stage-2 "default to structural"
rule above; never resolve ambiguity toward a narrower, cheaper path.

**Priority ordering is deliberate, not arbitrary.** Bucket 2 (security-surface) fires BEFORE
bucket 4 (editorial/operator-decided reduction) so that a reduction which happens to touch the
security surface routes to `security` (cheap, delta-scoped) rather than to the no-agent bucket —
dropping the budget-STOP is the canonical example: it is an editorial reduction on its face, but
it also removed a fail-open security vector, so it correctly routes through bucket 2.

**Announce + operator override.** The orchestrator announces its classification and routing in
ONE line before dispatching: `Correction classified: bucket {N} ({label}) → routing to
{lens(es)}.` The operator may reply to force a full panel for that correction instead — an
explicit override of the classifier's own result, always available, never silently ignored.

### Delta-scoped Stage-1 review — the `Correction scope:` field

When a routed lens re-fires (buckets 1-3), its dispatch carries a
`**Correction scope:** localized {AC-IDs, section-names} | structural` field — the exact Stage-1
analog of the Stage-2 `**Blast radius:**` field above. For a `localized` scope, the dispatched
lens reviews ONLY the changed AC/section + its blast radius, treating unchanged, already-passed
AC/sections as **frozen/trusted** — not re-read, not re-reviewed. A `structural` scope re-reviews
the whole plan.

**Stateless-dispatch honesty carries over verbatim (§ "Stateless-Dispatch Honesty" above).** The
re-firing lens still reads its inputs at dispatch start — `01-plan.md`, the correction
text/`failure-brief.md` entry. The saving is fewer generation tokens and fewer re-read sections,
never zero-read. Do not over-promise a saving this mechanism does not deliver.

### Carried-forward sub-verdicts + combined-verdict recomputation

When fewer than all lenses re-fire, each non-firing lens's most recent sub-verdict AND its
open-findings ledger are carried forward into `reviews/01-plan-review.md` and EXPLICITLY LABELLED:

```
(carried forward from round N — surface unchanged this round)
```

— never silently presented as fresh. The combined verdict is recomputed as
**worst-of over {fresh sub-verdicts} ∪ {carried-forward sub-verdicts}**, preserving each lens's
own severity→verdict mapping (a carried `security` `risks-found` still maps by its highest open
severity). When NO LLM lens re-fires (buckets 4/5), the orchestrator — not `plan-reviewer` —
records a `§ Panel Rounds` row: "deterministic-only pass, all sub-verdicts carried forward from
round N, combined verdict unchanged," with the deterministic check as the sole gate for that
round. Otherwise, whenever ANY LLM lens fires, `plan-reviewer` re-fires as the always-cheap
consolidator (it is the sole writer of the combined verdict + `**Reviews:**` attestation),
delta-scoped the same way as the firing lens(es).

**`security` is NEVER carried forward on a security-surface touch (fail-safe, non-negotiable).**
A `security` sub-verdict is never carried forward when the correction touched the
security-relevant surface (bucket 2 always forces a fresh `security` run) — this is the Stage-1
analog of the existing Stage-2 "security-verdict staleness re-gate" (`agents/orchestrator.md §
"If any agent fails → ITERATE"`). When in doubt whether a correction touches the security-relevant
surface, classify it as bucket 2 (or route to the full panel per the fail-safe rule above) —
never assume non-security and carry the `security` sub-verdict forward on doubt.

### Specialist separation — a design principle, not a mechanism change

The four lenses (`architect`, `qa-plan`, `security`, `plan-reviewer`) stay separate agents. The
cost fix here is on the ITERATION axis (selective re-firing) — never the FAN-OUT axis (merging
the lenses into one reasoning agent). Distinct lenses catch distinct classes of bug that a merged
agent would miss or dilute (a security-specialist lens found real Highs a general-purpose
reasoning pass did not surface), and merging would bloat a single agent's context beyond the
bounded-subagent principle this pipeline is built on. A future design proposing to merge any two
of these four lenses is a regression against this principle, not a refinement of it.

### Prompt-caching stable-prefix discipline

When constructing ANY panel-agent dispatch across rounds (`qa-plan` / `security` /
`plan-reviewer`, whether the initial full-panel dispatch or a selective re-fire), place the
STABLE content — the `01-plan.md` content, the relevant CLAUDE.md sections, and the agent's own
system prompt — at the FRONT of the dispatch context, and the round-specific delta — the
`Correction scope:` brief + the changed sections — at the END. Repeated re-reads across rounds
then hit the subagent prefix cache (~0.1x input cost) instead of paying full input cost on every
round (`docs/cost-and-caching.md`; the 5-minute subagent cache TTL). This compounds with the
delta-scoped review above: a small, stable-prefixed, delta-only dispatch is cheaper to generate
AND cheaper to read.

### Byte-consistency requirement (fenced multi-site invariant)

The correction-classification procedure, the `Correction scope:` field, and the carried-forward
labeling contract above must be byte-consistent across:

| Site | File | Anchor |
|------|------|--------|
| Canonical contract | `docs/patch-mode.md` (this file) | § Stage-1 Selective Panel Re-Firing |
| Orchestrator wiring | `agents/orchestrator.md` | § "Correction-classification — selective panel re-firing" |
| Combined-verdict consolidator | `agents/plan-reviewer.md` | § combined verdict under selective re-firing (Task-4 scope) |

A future edit to any one row without touching the other two is exactly the failure mode this
table exists to prevent — a classification rule the orchestrator applies that `plan-reviewer`
does not know how to render is a gap, not a refinement.
