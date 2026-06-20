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

After a localized patch, the orchestrator re-runs only the verifier(s) whose domain the patch touched:

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

Phase C of the pipeline-collaboration-cost-redesign program executed this pattern manually: a plan-review Rule-1 failure was resolved by a bounded architect re-dispatch (collapse 2 PRs into 1, substance untouched) followed by a selective plan-reviewer re-run (the qa ratify-plan sub-run was NOT re-executed because plan substance was unchanged). Phase D (this change) institutionalizes that manual precedent into the pipeline contract.
