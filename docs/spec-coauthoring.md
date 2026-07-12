# Spec Co-Authoring + Approach Checkpoint — Phase E2 Contract

This document defines the two front-of-pipeline mechanisms added in Phase E2 (on top of the Discover phase + intake survey introduced in E1, v2.46.0). It is the full contract; `CLAUDE.md §5` carries a one-line pointer.

---

## 1. Overview

E2 adds two mechanisms inside the existing E1 Discover container, without adding new pipeline loops or stages:

- **Spec co-authoring (1.3):** the developer seeds intent/approach/decomposition/gotchas in `00-spec-seed.md` before the architect runs. The architect consumes the seed as a **strong prior** and CAN DISSENT when the seeded approach is deficient.
- **Approach checkpoint (1.4, Variant B):** the architect emits `### Proposed Approach` first and declares `approach_freedom: high|low` in the status block. The orquestador gates on that declaration: `low` → auto-confirm; `high` → one lightweight STOP.

Both mechanisms are bidirectional: the developer catches over-engineering; the architect catches a defective approach. Neither replaces Specify (Phase 0b), Design (Phase 1), ratify-plan (Phase 1.5), or plan-review (Phase 1.6).

---

## 2. Spec co-authoring — `00-spec-seed.md`

### 2.1 When the lider offers seeding

During Discover open (Step 6d, `docs/discover-phase.md §4`), after the advance signal and intake survey but before dispatching the architect, the lider offers the operator a chance to seed the spec:

```
Antes de arrancar el diseño, ¿querés sembrar el spec?
(Optional) Podés responder cualquiera de estas preguntas — las que tenés, las que no las dejás vacías:

1. Intención: ¿Por qué lo estás pidiendo? ¿Qué problema resuelve?
2. Enfoque: ¿Cómo lo harías? (si tenés una idea — opcional)
3. Descomposición: ¿En qué partes lo dividirías?
4. Gotchas: ¿Qué sabés que muerde? ¿Dónde esperás problemas?

Respondé con lo que tengas, o decí "skip" para arrancar directo.
```

The scope hint captured in the intake survey (`survey_scope_hint`) serves as a fifth, lighter seed — it seeds file scope and is already written to `00-state.md`. The orquestador passes it to the architect without re-asking.

### 2.2 The `00-spec-seed.md` artefact

When the operator provides any seeding response, the lider writes `{docs_root}/00-spec-seed.md`. Format:

```markdown
# Spec Seed: {feature-name}
**Date:** {timestamp}
**Source:** dev-seed

## Intent
{operator's text, or "(not provided)"}

## Approach
{operator's text, or "(not provided)"}

## Decomposition
{operator's text, or "(not provided)"}

## Gotchas
{operator's text, or "(not provided)"}

## Scope hint (from intake survey)
{survey_scope_hint value, or "(not provided)"}
```

**Attribution rules:**
- The operator's text carries the `dev-seed` mark (header `**Source:** dev-seed`).
- When the architect rigorizes the seed (expands, corrects, contradicts), the architect appends a second section at the bottom:

```markdown
---
**Source:** architect-rigorization
**Date:** {timestamp}

## Architect notes on seed
{what was expanded, corrected, or overridden — plain prose}
```

`00-spec-seed.md` is a **shared board** between the developer and the architect. It is never overwritten — only appended with the second section above.

### 2.3 `00-state.md` flags

When `00-spec-seed.md` is written, the orquestador sets in `00-state.md § Current State`:

```
- spec_seed_present: {true|false}
- spec_seed_dissents: {true|false}
```

`spec_seed_dissents` is written by the orquestador AFTER reading the architect's status block: `true` when the status block declares `spec_seed_dissent: true`; `false` otherwise.

### 2.4 Invariants

- **Optional:** an operator who does not want to seed says "skip" (or equivalent). The `00-spec-seed.md` file is NOT created; `spec_seed_present: false`; the architect runs in standard mode.
- **Prior, not order:** the seed is a strong prior. The architect reads it first and reasons from it — but does not treat it as a mandate. Alternatives that the seed did not consider are still evaluated.
- **No security fields from seed:** no seed content writes `security_sensitive` or any gate status. Those are determined by path-pattern auto-escalation only (`discover-phase.md HI-2`).
- **No gate skipped:** `spec_seed_present: true` never marks any Phase Checklist item as skipped. It adds context to the architect, not permissions to the pipeline.

---

## 3. Architect consumes the seed

### 3.1 Phase 0b Step 5 payload

The lider adds to the in-memory dispatch payload (alongside the existing 9 fields):

- **`spec_seed` (pointer):** `"00-spec-seed.md present — read it as your primary prior before codebase exploration"` (or `"no spec seed — standard mode"` when `spec_seed_present: false`)
- **`scope_hint`:** the `survey_scope_hint` value from `00-state.md` (or `null`)

### 3.2 Phase 1 dispatch instruction

The Phase 1 dispatch prompt includes:

> "If `00-spec-seed.md` is present: consume it as a **strong prior** — start from the developer's intent/approach/decomposition/gotchas rather than exploring from scratch. The `scope_hint` replaces broad codebase exploration for file-scope discovery. Document in the architect-rigorization section of `00-spec-seed.md` what you expanded, corrected, or overrode.
>
> The seed is a **prior, not a mandate.** Evaluate alternatives the seed did not consider. If the seeded approach is deficient, write `### Architect Dissent on Seed` in `01-plan.md § Review Summary` with your rationale."

### 3.3 Architect workflow with seed

1. **Read `00-spec-seed.md` first** (before codebase exploration).
2. Use the intent/approach/decomposition to orient the design. Use the scope-hint as the starting point for file discovery.
3. Evaluate alternatives even when an approach is given — the prior is strong but not exclusive.
4. After completing the design: append the `architect-rigorization` section to `00-spec-seed.md` documenting what changed.
5. If dissenting: write `### Architect Dissent on Seed` in `01-plan.md § Review Summary`.

---

## 4. Bidirectional dissent

### 4.1 When the architect dissents

If the architect determines that the seeded approach is deficient (wrong pattern, incorrect decomposition, likely to cause a class of problem), the architect writes a `### Architect Dissent on Seed` subsection inside `## Review Summary` of `01-plan.md`:

```markdown
### Architect Dissent on Seed

> {1-2 sentence summary of the disagreement: what the seed proposed and why it is deficient.}
> {The approach actually taken, and the rationale.}
> {Any open question for the operator if the fork is genuinely ambiguous.}
```

**Mandatory when:** `spec_seed_dissent: true` is declared in the architect's status block.

**Omitted when:** no seed (`spec_seed_present: false`) or no dissent (`spec_seed_dissent: false`).

The orquestador reads the architect's status block after Phase 1 and sets `spec_seed_dissents` in `00-state.md` accordingly.

### 4.2 plan-reviewer check

Rule 6 of `agents/plan-reviewer.md` is extended: when `spec_seed_dissents: true` in `00-state.md`, the plan-reviewer verifies that `### Architect Dissent on Seed` is present in `01-plan.md § Review Summary`. Absence is a Rule 6 `fail`.

When `spec_seed_present: false` or `spec_seed_dissents: false`, the check is a no-op (no false positive).

### 4.3 Why `## Review Summary` (not inline)

STAGE-GATE-1 copies `## Review Summary` verbatim into the STOP block (`orquestador.md § STAGE-GATE-1`). The dissent must be where the operator already looks — inline markers in the plan body would be missed at the gate.

---

## 5. Approach checkpoint (Variant B)

### 5.1 What it is

A single lightweight gate within Phase 1 (Design) that catches a fundamentally wrong approach before the architect writes the full Work Plan and AC list. It does NOT add a blocking Phase Checklist item. It collapses automatically when there are no material alternatives.

### 5.2 How it works (Variant B — the implemented variant)

The architect runs a **single dispatch** in `mode: design`. At the START of the design pass (before the Work Plan details), the architect:

1. Writes `### Proposed Approach` (≤1 paragraph + alternatives table if `approach_freedom: high`).
2. Declares in the status block:
   - `approach_freedom: high | low`
   - `approach_alternatives: [alt1, alt2, ...]` (only when `high`)

**Orquestador gating:**

| `approach_freedom` | Orquestador action |
|--------------------|---------------------|
| `low` | Mark `[~auto-confirmed: approach_freedom:low]` in Phase Checklist; continue to Work Plan details; no STOP. |
| `high` | Emit a lightweight STOP showing `### Proposed Approach`; ask operator for direction. On confirm → re-dispatch (counts against max-3 budget for Phase 1). On direction-change → re-dispatch with operator's chosen approach. |

The approach status line in the Phase Checklist:

```
- [ ] 1.0-approach-check — approach checkpoint [~auto-confirmed: approach_freedom:low]
```

This line is non-blocking (same pattern as `1.7-ux-enrich` at `orquestador.md`): it is marked `[~auto-confirmed: ...]` when the architect declared `low`, never blocks the Phase Checklist gate.

### 5.3 Observability

The approach-check sub-step emits events in `{docs_root}/{events_file}`:

```jsonl
{"ts":"…","event":"phase.start","feature":"…","phase":"1.0-approach-check","agent":"orquestador"}
{"ts":"…","event":"phase.end","feature":"…","phase":"1.0-approach-check","agent":"orquestador","status":"auto-confirmed|confirmed|adjusted","extra":{"approach_freedom":"low|high"}}
```

### 5.4 Collapse rule

When `approach_freedom: low` the checkpoint collapses into the normal Phase 1 flow with no visible STOP. It is still recorded in the Phase Checklist and observability events — it is not skipped, just auto-confirmed.

### 5.5 Re-dispatch on approach adjustment

When the operator adjusts the approach (`approach_freedom: high` STOP → operator direction → re-dispatch), the architect re-runs from its own Phase 0 (codebase re-read), incorporating the operator's direction. The re-dispatch counts against the max-3 Phase 1 iteration budget.

### 5.6 Why Variant B (not Variant A)

Variant A (separate sub-phase 1.0 with two architect dispatches) was evaluated and rejected:

- It requires two opus dispatches (sketch + detail), even though the architect must read the codebase to judge `approach_freedom` — the first run is never "wasted" context.
- It adds a new node to the state-machine (a separate phase ID between 0b and 1 requires new phase tracking machinery).
- It risks escalating the checkpoint into a second plan-review by sheer proximity.

Variant B achieves the same outcome (one lightweight STOP on genuine forks) within the existing Phase 1 contract, with no new phase node and no double dispatch on the common case (`approach_freedom: low`).

---

## 6. `00-state.md` new fields

Add to `## Current State` template:

```
- spec_seed_present: {true|false}
  # true when 00-spec-seed.md was written during Discover; false = no seed
- spec_seed_dissents: {true|false}
  # true when architect declared spec_seed_dissent: true in Phase 1 status block; false otherwise
- approach_checkpoint: {auto-confirmed|confirmed|adjusted|null}
  # null before Phase 1; auto-confirmed when approach_freedom:low; confirmed when operator approved high-freedom approach; adjusted when operator changed direction and architect re-ran
```

Recovery: all three are plain-text `key: value` pairs. Any agent resuming after context compaction reads them directly without re-interrogating the manifest.

Add to `## Recovery Instructions`:

```
- spec_seed_present / spec_seed_dissents: indicate whether a spec seed exists and whether the architect dissented. If spec_seed_present: true, 00-spec-seed.md exists at docs_root.
- approach_checkpoint: the outcome of Phase 1 approach check. null = not yet reached; auto-confirmed = common case; confirmed / adjusted = operator participated.
```

---

## 7. PR body — `Spec-seed:` line

The delivery agent adds a conditional line in `## Main change` (below the existing `Intake survey:` line) when `spec_seed_present: true`:

```
**Spec-seed:** dev-seed=yes, architect-dissent={yes|no}
```

**Omitted when:** `spec_seed_present: false`.

**Prohibition (same as `Intake survey:`):** this line MUST NOT include `security_sensitive`, any gate status, or any field beyond the enumeration above.

---

## 8. Variant A (not implemented — documented for reference)

If the operator ever requests switching to Variant A, the contract is:

- A new sub-phase `1.0-approach-sketch` between Phase 0b and Phase 1.
- The orquestador dispatches the architect with `mode: approach-sketch` (reduced effort), producing ONLY `### Proposed Approach` and declaring grados-de-libertad.
- On no freedom → auto-confirm; on freedom → STOP.
- On approval → second dispatch `mode: design` (full), reusing `01-plan.md` scaffold.
- Phase Checklist line `1.0-approach-sketch` is a skippable line (same pattern as `1.7-ux-enrich`).

Variant A was not implemented because it requires a second opus dispatch in the non-trivial case, which is the dominant cost concern that E2 is trying to reduce.
