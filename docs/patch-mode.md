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
