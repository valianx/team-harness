# Plan-Structure Gate — Historical Contract and Site Enumeration

> **[SUPERSEDED — canonical v3/two-posture contract]** This document is retained as migration
> and plan-quality reference material. The automatic `plan_structure` scan, Phase 1.5a state,
> event, dispatch, bounce loop, and gate authority described below are retired. Current `pipeline`
> runs use the canonical `design → waiting_gate1 → implementation → validation → waiting_gate3 →
> delivery → complete` machine; `inline` direct work creates no workspace, state, events, or gates.
> Use `docs/plan-shards.md`, the architect/QA contracts, and explicit `/th:plan-review` for current
> plan quality. Nothing in this historical file releases a gate or authorizes a dispatch.
>
> Historical source for the former Stage-1 deterministic plan-structure contract: the canonical
> Layer-1 check set, the `plan_structure: pass|fail` verdict, and the enumeration of every
> execution site that dispatches or consumes this contract. Mirrors `docs/code-hygiene-gate.md`
> one-for-one (two layers, fixed check set, site enumeration, byte-consistency rule) — that file
> is the template this one followed structurally; the two gates checked unrelated properties (plan
> shape vs. comment hygiene) and share no command or pattern set. **Formerly sibling to
> `docs/patch-mode.md § "Stage-1 Selective Panel Re-Firing"` as a bucket-5 feeder — that
> classifier is retired (`docs/patch-mode.md § "Stage-1 Selective Panel Re-Firing — RETIRED"`),
> so this file no longer feeds anything; the `plan_structure` producer/consumer map below is
> historical only.**

---

## 1. Why two layers (historical, non-gating)

Before this gate existed, plan-ratification (`qa-plan`, Phase 1.5) carried both mechanical checks
(does the AC count match the summary table, are cross-references dangling) and genuine judgment
(can the plan satisfy each AC, is each AC evidentiary-sound) in one large dispatch — mechanical work
masquerading as reasoning. A round-3 `qa-plan` run shipped a stale AC count (25 vs the true 31)
precisely because no deterministic scan cross-checked the table against the actual AC blocks; a
fixed script cannot miscount the way a judgment pass under context pressure can. This gate closes
that gap with two complementary layers, mirroring `docs/code-hygiene-gate.md § 1`:

- **Layer 1 — deterministic, mechanical, pre-ratification.** The orchestrator runs a fixed set of
  structural checks over `01-plan.md` itself, before any `qa-plan` dispatch. No judgment, no model
  call — a script decides.
- **Layer 2 — judgment, holistic, in-ratification.** `qa-plan` (mode: `ratify-plan`) audits
  AC soundness and plan capability — properties a fixed check cannot express.

Both layers consume the same check set and the same operational definitions defined in this
file — one source of truth, never two independently-maintained copies. Right-sizing `qa-plan`
from `opus` to `sonnet` (`agents/qa-plan.md`, Task-4 scope) is possible precisely because Layer 1
now owns everything a script CAN decide, leaving only genuine judgment on the model.

---

## 2. Layer 1 — Phase 1.5a Plan-Structure Scan (historical, non-gating)

> **Retired:** no current orchestrator invocation runs this scan or emits `plan_structure`.
> The checks below are retained only as deterministic plan-quality guidance for authors and the
> explicit plan-review flow.

**Historical owner:** `agents/ref-pipeline.md` — this was not a subagent dispatch, but a Bash gate
the former orchestrator ran itself. It is no longer an active gate.

**Historical timing:** immediately before any Phase 1.5 `qa-plan` dispatch, for every plan that reached Phase
1.5 — i.e., every plan that does NOT take the self-authored-plan panel carve-out
(`agents/ref-pipeline.md § "Phase 1.5 — Plan Ratification"`, T2-AC-2). A self-authored plan
(hotfix / Tier-1-fix / express one-line plan) is a fixed 3-4 line task list with no
`### Summary` table, no multi-task DAG, and no cross-task `Files:` field to check — the
carve-out's own deterministic self-check item "at least one task exists" already covers the
degenerate case, so Phase 1.5a does not run separately for it.

**Checks (historical reference — current authors and explicit reviewers may use these as guidance):**

1. **AC-count-vs-`### Summary`-table reconciliation.** The total AC count declared in
   each `01-plan.md § Task Index` AC count matches its task shard's actual `- [ ]`/`- [x]` AC bullets
   across every task's `#### Acceptance Criteria` block. A mismatch in EITHER direction (table
   overstates or understates) is a violation.
2. **Dangling `T{n}-AC-{m}` cross-references.** Every `T{n}-AC-{m}`-shaped reference anywhere in
   `01-plan.md` (Work Plan notes, Multi-site invariant tables, Risk tables, cross-task
   dependencies) resolves to an AC that actually exists in Task `n`'s `#### Acceptance Criteria`
   block. A reference to a task or an AC number that does not exist is a violation.
3. **DAG acyclicity + real `Depends on:` targets.** Every `Depends on:` value names a task that
   exists in this same plan (never a task number outside the declared range, never a name from a
   different feature), and the resulting dependency graph — built from every task's `Depends on:`
   field — contains no cycle.
4. **Cross-task file-disjointness.** No file appears in the `Files:` field of two different tasks
   unless the plan explicitly declares shared-file coordination for that file (a `Notes:` line
   naming the shared file and the single-owner-per-step rule from the Work Plan). An undeclared
   file overlap is a violation — it is exactly the seam that causes an intra-PR same-file conflict
   later in Stage 2.

**Verdict handling:**

| Result | Action |
|---|---|
| Clean | Historical behavior: emit `plan_structure` (`verdict: pass`) and proceed to `qa-plan`. Current behavior: no event or automatic dispatch. |
| Violations found | Historical behavior: emit `plan_structure` (`verdict: fail`) and bounce to `architect`. Current behavior: surface the issue through the normal design correction or explicit `/th:plan-review`. |
| Command error | Historical behavior escalated rather than silently passing. Current design checks remain fail-closed, but this document has no gate authority. |

**Historical iteration budget.** The former scan shared the max-3 Stage-1 budget; current v3 has
one normal design correction and no automatic structure loop.

---

## 3. Layer 2 — `qa-plan` judgment scope (historical, non-gating)

> **Retired automatic path:** `qa-plan` is dispatched only by an explicit `/th:plan-review`;
> it no longer waits on a `plan_structure: pass` event or participates in an automatic loop.

**Historical owner:** `agents/qa-plan.md`, `mode: ratify-plan`, once dispatched after the former
Layer 1 returned `plan_structure: pass`. Current `qa-plan` dispatch requires explicit
`/th:plan-review` and does not consume that event.

**What it audits (requires judgment; NOT expressible as a fixed check):**

1. **AC soundness.** Each task-level AC describes an observable outcome or a meaningful
   acceptance-significant invariant and admits appropriate `test`, `command`, or `inspection`
   evidence under `agents/_shared/ac-evidence.md`.
2. **Plan capability.** At least one plan step would genuinely produce each AC's outcome. Merely
   restating the criterion, naming a file, or promising a test is not semantic coverage.

Layer 1's four mechanical checks are explicitly OUT of `qa-plan`'s scope after this gate exists —
re-checking them in Layer 2 would be the exact duplicated-maintenance seam this two-layer split
exists to remove. `qa-plan`'s ratification table in `reviews/01-plan-review.md § Plan Ratification`
covers AC soundness + plan capability only; it does not restate the AC count or cross-reference check.

---

## 4. Exit-code / escalation contract (historical, non-gating)

The Layer-1 scan is a set of structural checks (table-count comparison, string-pattern
cross-reference resolution, graph-cycle detection, set-intersection) rather than a single pinned
`grep` pipeline (unlike `docs/code-hygiene-gate.md`'s Layer 1, which is one fixed command) — the
four checks above are independently computable from a parsed `01-plan.md`, and any one of them
failing to execute (a malformed table, an unparseable `Depends on:` value) is an **escalation**,
never a silent "no violations found." A broken check must not be misread as a clean plan.

---

## 5. Site enumeration (historical, non-gating)

Every execution path that dispatches or gates this contract, as a separate site class. A consumer
of the `plan_structure` field enumerated without its producer (or vice versa) is a false-green
gate by construction — see `docs/knowledge.md` node
`multi-site-contract-all-execution-paths-must-match`.

| Invariant | Site class | File | Anchor / field |
|---|---|---|---|
| Layer 1 scan — primary dispatch path | scan-site A1 | `agents/ref-pipeline.md` | `## Phase 1.5a — Plan-Structure Scan` |
| Layer 1 scan — skip condition (self-authored-plan carve-out) | scan-site A2 | `agents/ref-pipeline.md` | `## Phase 1.5 — Plan Ratification` § "Skip when — self-authored-plan panel carve-out" |
| `plan_structure` PRODUCER | producer B1 | `agents/ref-pipeline.md` | `## Phase 1.5a` verdict-handling table |
| `plan_structure` CONSUMER — Phase 1.5 gate | consumer C1 | `agents/ref-pipeline.md` | `## Phase 1.5a` (blocks `qa-plan` dispatch on `fail`) |
| Layer 2 judgment scope | judgment | `agents/qa-plan.md` | § Ratify-Plan (judgment-layer-only scope, Task-4 scope) |
| Observability | event | `agents/ref-pipeline.md` (event enum) + `docs/observability.md` | `plan_structure` |

**Rule for any future edit to this contract:** touching one row of this table without touching
every other row in the same change is the failure mode this gate exists to prevent.

---

## 6. Current non-gating plan-quality and I/O guidance

The active plan contract is `sharded-v1`: `01-plan.md` is the compact manifest and operator
summary; architecture, delivery/dependencies, conditional invariants, and task/AC contracts
live in `plan/architecture.md`, `plan/delivery.md`, `plan/invariants.md`, and
`plan/tasks/Task-N.md`. Each canonical fact has one owning shard and the manifest indexes every
task. Use the historical checks above as review inputs without copying canonical prose between
shards.

Target budgets in `docs/plan-shards.md` and `docs/output-contract-patterns.md` constrain compact
prose and I/O, not required projects, tasks, ACs, invariants, findings, or controls. When required
content exceeds a target, preserve it and report a bounded `size_reason: required-items`; never
omit a required item or block solely on size. Pipeline work keeps the full canonical lifecycle;
inline work remains workspace-free direct work.

## 7. Cross-reference (historical)

See `docs/code-hygiene-gate.md` for the structural template this file mirrors (two-layer
deterministic + judgment pattern, site-enumeration table, byte-consistency rule) — the two gates
check unrelated properties and share no command or pattern set. This gate no longer feeds a
correction classifier — `docs/patch-mode.md § "Stage-1 Selective Panel Re-Firing — RETIRED"` names
why bucket 5 (and every other bucket) is retired.
