# Adversary Cost Model — Per-Round Accounting and the R1 Deferred Measurement

> Documents the token-accounting assumptions behind this repo's `adversary`
> resource-management fix (R1-R5, `01-plan.md` adversary-resource-management), the
> arithmetic baseline projection derived from those assumptions, and the deferred
> live-run measurement plan that resolves the two unknowns the design itself flags
> as unfalsifiable in-suite (`01-plan.md § Review Summary § Confidence Score`).
> Sibling to `docs/cost-and-caching.md` (general caching/cost reference) and
> `docs/output-contract-patterns.md § 6` (the before/after measurement method this
> plan's own deferred-measurement plan reuses).

---

## 1. Why this document exists

The plan's own confidence on the ≤25%-of-baseline cost target is **MEDIA, not HIGH**
(`01-plan.md § Review Summary § Confidence Score`): the target is demonstrable
structurally (the four reduction mechanisms exist and are wired) but not
demonstrable as a number inside this repo's test suite — only a live pipeline run
measures the actual percentage. This document is the honest, falsifiable arithmetic
that stands in for the number until a live run replaces it, plus the concrete plan
for taking that live measurement.

## 2. Measured baseline (the anchor, not an assumption)

From `00-execution-events` (zippy runs 2026-07-17/18, recorded in this task's own
`00-knowledge-context.md`):

| Run | Adversary tokens | % of run | Dispatches | Per-dispatch |
|---|---|---|---|---|
| sot-cutover-http PR-A (8.66M total) | 1.65M | 19.1% | 8 | ~206k |
| sot-cutover-http PR-B (10.32M total) | 1.42M | 13.8% | 8 | ~177k |

Both runs share the same shape: a transport-migration PR where most touched files
sit under `api/`/`auth/` — a **security-saturated** run, in the sense used
throughout this document. Blended baseline used below: **8 dispatches/run, ~190k
tokens/dispatch (midpoint of 177k-206k), ~1.52M tokens/run total** — consistent
with, not narrower than, the measured 1.42M-1.65M range.

## 3. Per-round token accounting (documented assumptions)

None of the figures in this section are measured — they are documented assumptions
derived from the mechanisms R1-R5 wire (`01-plan.md § Proposed Approach`), stated
explicitly so the projection in § 4 is falsifiable rather than asserted.

| Round type | Input tokens (assumption) | Output tokens (R4 formula, avg 2 changed controls: `800 + 600×2`) | Total/round |
|---|---|---|---|
| Round 1 (`Re-verification scope: full`) — first attack on a task | ~130,000 | ~2,000 | ~132,000 |
| Round 2+ (`Re-verification scope: localized {delta}`) — delta-scoped re-verify | ~38,000 | ~2,000 | ~40,000 |

**Basis for the input figures.** Round 1 reads the full workspace input manifest
(design, plan AC, implementation, `reviews/04-security.md`) exactly as the
pre-R1-R5 baseline did — no reduction is claimed for round 1's input cost. Round
2+ reads only the named delta (files changed since the previous round, the
specific finding under re-verification, plus the still-mandatory
`reviews/04-security.md` read) per R3 — bounded scope, not a cache-ratio claim;
the ~38k figure assumes the delta stays small relative to the full workspace, the
common case for a Case-D bounced finding or a staleness re-gate.

**Basis for the dispatch-mix weight.** A blended per-dispatch average is needed to
compare against the plan's own stated "~2x" per-dispatch reduction (HIGH
confidence, independent of R5's filtering rate — `01-plan.md § Confidence Score`).
Assuming a typical iteration pattern of **60% round-1 / 40% round-2+** dispatches
within a run's adversary dispatch count:

```
blended per-dispatch = 0.60 × 132,000 + 0.40 × 40,000 = 79,200 + 16,000 = ~95,200
```

`~95k` against the baseline's `~190k` is a ~2x reduction — consistent with the
plan's independently-stated per-dispatch confidence, not a new claim.

## 4. Dispatch-count reduction under R5 (the unmeasured lever)

`01-plan.md § Confidence Score` names this explicitly as unknown #1: "cuántas
tareas de un run típico 'cambian un control' vs sólo 'tocan una ruta sensible'
determina la tasa de filtrado de R5" — not measurable in-suite. The filtration
rate `f` (fraction of `security_floor_applies`-true dispatches that ALSO have
`changes_security_control: true`, and therefore still trigger `adversary`) is a
**documented assumption**, not a derived or measured figure:

| Run shape | `f` (assumption) | Dispatches under R5 (8 × f, rounded) |
|---|---|---|
| Mixed typical run (most sensitive-path touches are non-control, e.g. a new read-only endpoint under `api/`) | ~35% | ~3 |
| Security-saturated run (this repo's own baseline shape — a transport migration where nearly every touched file changes an auth/session control) | ~90% | ~7 |

## 5. Arithmetic baseline projection

Using § 2's baseline (8 dispatches × ~190k = ~1.52M tokens/run) and § 3/§ 4's
assumptions:

| Run shape | New dispatches | New per-dispatch | New total | Ratio vs baseline |
|---|---|---|---|---|
| Mixed typical | 3 | ~95k | ~285k | **~19%** |
| Security-saturated (baseline shape) | 7 | ~95k | ~665k | **~44%** |

**The honest reading, stated without softening.** On a mixed typical run, the
arithmetic lands inside the ≤25% target. On a run shaped like this repo's own
measured baseline — security-saturated — the arithmetic lands at **~40-50%**, a
~2x improvement, not the ~4x implied by ≤25%. This matches `01-plan.md § Review
Summary`'s own stated MEDIA confidence and its own explicit acknowledgment: R5's
dispatch-count lever depends on the run's mix of merely-sensitive-path tasks vs
control-changing tasks, and a security-saturated run has few of the former to
filter. The R2/R3/R4 per-dispatch mechanisms (§ 3) hold at ~2x regardless of run
shape — what varies with run shape is R5's dispatch-count lever alone.

**What this arithmetic does NOT claim.** It is not a proof that any future run
lands at exactly 19% or 44% — `f` (§ 4) is an assumption, not a measurement. It is
a falsifiable projection under stated assumptions, replacing an unstated or
implicit claim with one that a live run can directly contradict or confirm (§ 6).

## 6. Deferred measurement plan (the live-run resolution)

Reuses the before/after method already established in
`docs/output-contract-patterns.md § 6` — no new instrumentation.

**Metric.** The `adversary` row's `%` column in the `## Cost` section's per-agent
table in `00-pipeline-summary.md` (`docs/observability.md § Cost rollup`) —
adversary's token share of the total run — plus the underlying token count, so
the ratio against this document's baseline (§ 2) can be computed directly.

**Data source.** `00-execution-events.{jsonl,md}` `phase.end` events, aggregated
by the orchestrator into `00-pipeline-summary.md § Cost` at the checkpoints
`docs/observability.md § Cost rollup` already defines (STAGE-GATE-1, Stage-2
close, every `iteration.start`, `pipeline.complete`/`end`) — the same trace this
task's own `00-knowledge-context.md` baseline table (§ 2) was read from.

**Method.**

1. On the next representative live pipeline run with `security_sensitive: true`
   in `00-state.md`, read the `## Cost` section's adversary token total and
   dispatch count at `pipeline.complete`/`end`.
2. Classify the run's shape: **mixed** (most `security_sensitive` tasks in the
   run do not also set `changes_security_control: true`) or **saturated** (most
   do) — read directly from each task's `00-state.md § Current State` across the
   run.
3. Compute the ratio: `new run's adversary tokens / this document's § 2 blended
   baseline (~1.52M), normalized by dispatch count when the runs are not
   directly comparable in size`.
4. Compare against threshold: a **mixed**-shape run landing above **25%** of
   baseline is a projection miss and should be escalated per `01-plan.md §
   Review Summary`'s own stated fallback options — (a) remove the `adversary`
   agent, or (b) restrict it to a narrower scenario set (already partially
   implemented by R5; a miss means R5's `f` assumption in § 4 was too generous
   and the trigger needs further tightening). A **saturated**-shape run landing
   in the **~40-50%** range is the expected, non-blocking outcome per § 5 — it
   confirms the honest projection rather than contradicting it.

**Executor.** `qa` or `tester`, on the next representative live pipeline run —
this is a validate-mode/audit-mode check against a real run's own
`00-pipeline-summary.md`, not a new test file. This repo has a live-measurement
precedent for exactly this shape of check: the baseline table in § 2 above was
itself produced this way, from two live runs' `00-execution-events`.
