# Plan-Structure Gate — Contract and Site Enumeration

> Single source of truth for the Stage-1 deterministic plan-structure contract: the canonical
> Layer-1 check set, the `plan_structure: pass|fail` verdict, and the enumeration of every
> execution site that dispatches or consumes this contract. Mirrors `docs/code-hygiene-gate.md`
> one-for-one (two layers, fixed check set, site enumeration, byte-consistency rule) — that file
> is the template this one follows structurally; the two gates check unrelated properties (plan
> shape vs. comment hygiene) and share no command or pattern set. Sibling to `docs/patch-mode.md
> § Stage-1 Selective Panel Re-Firing` (the iteration mechanics this gate's Layer-1 scan feeds
> bucket 5 of).

---

## 1. Why two layers

Before this gate existed, plan-ratification (`qa-plan`, Phase 1.5) carried both mechanical checks
(does the AC count match the summary table, are cross-references dangling) and genuine judgment
(is coverage complete, is each AC testable) in one `opus`-tier dispatch — mechanical work
masquerading as reasoning. A round-3 `qa-plan` run shipped a stale AC count (25 vs the true 31)
precisely because no deterministic scan cross-checked the table against the actual AC blocks; a
fixed script cannot miscount the way a judgment pass under context pressure can. This gate closes
that gap with two complementary layers, mirroring `docs/code-hygiene-gate.md § 1`:

- **Layer 1 — deterministic, mechanical, pre-ratification.** The orchestrator runs a fixed set of
  structural checks over `01-plan.md` itself, before any `qa-plan` dispatch. No judgment, no model
  call — a script decides.
- **Layer 2 — judgment, holistic, in-ratification.** `qa-plan` (mode: `ratify-plan`) audits
  coverage completeness and AC-testability soundness — properties a fixed check cannot express.

Both layers consume the same check set and the same operational definitions defined in this
file — one source of truth, never two independently-maintained copies. Right-sizing `qa-plan`
from `opus` to `sonnet` (`agents/qa-plan.md`, Task-4 scope) is possible precisely because Layer 1
now owns everything a script CAN decide, leaving only genuine judgment on the model.

---

## 2. Layer 1 — Phase 1.5a Plan-Structure Scan (deterministic)

**Owner:** `agents/orchestrator.md` — not a subagent dispatch, a Bash gate the orchestrator runs
itself (same shape as the Phase 2.6 Code-Hygiene Scan and the Phase 2-close scope/backstop
checks).

**When:** immediately before any Phase 1.5 `qa-plan` dispatch, for every plan that reaches Phase
1.5 — i.e., every plan that does NOT take the self-authored-plan panel carve-out
(`agents/orchestrator.md § "Self-authored-plan panel carve-out"`, T2-AC-2). A self-authored plan
(hotfix / Tier-1-fix / express one-line plan) is a fixed 3-4 line task list with no
`### Summary` table, no multi-task DAG, and no cross-task `Files:` field to check — the
carve-out's own deterministic self-check item "at least one task exists" already covers the
degenerate case, so Phase 1.5a does not run separately for it.

**Checks (canonical — the orchestrator's inline scan must not re-derive or paraphrase this set):**

1. **AC-count-vs-`### Summary`-table reconciliation.** The total AC count declared in
   `01-plan.md § Task List → ### Summary` matches the actual count of `- [ ]`/`- [x]` AC bullets
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
| Clean | Emit `plan_structure` (`verdict: pass`) to `{events_file}` as a structural trace event only — **never operator-facing prose**. Proceed to `qa-plan` (Layer 2, judgment-only ratify-plan). |
| Violations found | Emit `plan_structure` (`verdict: fail`, `extra: {check, detail}`). Bounce to `architect` under the BOUNDED-PATCH contract (`agents/architect.md § BOUNDED-PATCH contract`) with the specific mechanical failure named — never a vague "the plan has issues." Do NOT dispatch `qa-plan` until the re-scan passes. |
| Command error | Escalate — never a silent pass. A check that cannot run (malformed markdown table, a `Depends on:` value that cannot be parsed) is an escalation, the same "escalate-never-silently-pass" contract `docs/code-hygiene-gate.md § 3.1` states for its own exit-code handling. |

**Iteration budget.** Shares the same max-3 budget as Phase 1.6 (Plan Review) — a `plan_structure`
bounce is a Stage-1 iteration, not a fresh, independently-tracked budget.

---

## 3. Layer 2 — `qa-plan` judgment scope (ratify-plan mode)

**Owner:** `agents/qa-plan.md`, `mode: ratify-plan`, dispatched ONLY after Layer 1 returns
`plan_structure: pass` (Task-4 scope for the file itself; this section states the scope
boundary the orchestrator's Phase 1.5 dispatch already assumes).

**What it audits (requires judgment; NOT expressible as a fixed check):**

1. **Coverage completeness.** Every feature-level AC (from the operator-facing spec / `01-plan.md
   § Review Summary`) is covered by at least one task-level AC in `§ Task List` — a semantic
   match, not a string match, since a task AC can satisfy a feature AC with different wording.
2. **AC-testability soundness.** Each task-level AC's Given/When/Then or `VERIFY:` statement is
   internally sound and actually tests the claim it makes — not vacuous, not circular, not
   testing an unrelated property under the AC's stated name.

Layer 1's four mechanical checks are explicitly OUT of `qa-plan`'s scope after this gate exists —
re-checking them in Layer 2 would be the exact duplicated-maintenance seam this two-layer split
exists to remove. `qa-plan`'s ratification table in `reviews/01-plan-review.md § Plan Ratification`
covers coverage + testability only; it does not restate the AC count or the cross-reference check.

---

## 4. Exit-code / escalation contract

The Layer-1 scan is a set of structural checks (table-count comparison, string-pattern
cross-reference resolution, graph-cycle detection, set-intersection) rather than a single pinned
`grep` pipeline (unlike `docs/code-hygiene-gate.md`'s Layer 1, which is one fixed command) — the
four checks above are independently computable from a parsed `01-plan.md`, and any one of them
failing to execute (a malformed table, an unparseable `Depends on:` value) is an **escalation**,
never a silent "no violations found." A broken check must not be misread as a clean plan.

---

## 5. Site enumeration

Every execution path that dispatches or gates this contract, as a separate site class. A consumer
of the `plan_structure` field enumerated without its producer (or vice versa) is a false-green
gate by construction — see `docs/knowledge.md` node
`multi-site-contract-all-execution-paths-must-match`.

| Invariant | Site class | File | Anchor / field |
|---|---|---|---|
| Layer 1 scan — primary dispatch path | scan-site A1 | `agents/orchestrator.md` | `## Phase 1.5a — Plan-Structure Scan` |
| Layer 1 scan — skip condition (self-authored-plan carve-out) | scan-site A2 | `agents/orchestrator.md` | `## Phase 1.5 — Plan Ratification` § "Skip when — self-authored-plan panel carve-out" |
| `plan_structure` PRODUCER | producer B1 | `agents/orchestrator.md` | `## Phase 1.5a` verdict-handling table |
| `plan_structure` CONSUMER — Phase 1.5 gate | consumer C1 | `agents/orchestrator.md` | `## Phase 1.5a` (blocks `qa-plan` dispatch on `fail`) |
| `plan_structure` CONSUMER — correction classifier bucket 5 | consumer C2 | `docs/patch-mode.md` | § Stage-1 Selective Panel Re-Firing, bucket 5 (shape/consistency-only) |
| Layer 2 judgment scope | judgment | `agents/qa-plan.md` | § Ratify-Plan (judgment-layer-only scope, Task-4 scope) |
| Observability | event | `agents/orchestrator.md` (event enum) + `docs/observability.md` | `plan_structure` |

**Rule for any future edit to this contract:** touching one row of this table without touching
every other row in the same change is the failure mode this gate exists to prevent.

---

## 6. Cross-reference

See `docs/code-hygiene-gate.md` for the structural template this file mirrors (two-layer
deterministic + judgment pattern, site-enumeration table, byte-consistency rule) — the two gates
check unrelated properties and share no command or pattern set. See `docs/patch-mode.md § Stage-1
Selective Panel Re-Firing` for how this gate's `plan_structure` verdict feeds the correction
classifier's bucket 5.
