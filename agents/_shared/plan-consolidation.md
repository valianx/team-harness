# Plan consolidation invariant
<!-- Single source of truth for the plan-is-a-snapshot contract.
     Consumed by: agents/{architect,plan-reviewer,qa-plan,qa,orchestrator}.md.
     Edit here; agent files reference this file by section. -->

## Invariant

`01-plan.md` is a snapshot of the final, reconciled plan state — not a log of how the plan was reached. Each canonical field appears exactly once, carrying its final value. When any later-stage input supersedes an earlier value (a plan-reviewer override of an architect default, a ratification gap fix, an operator STAGE-GATE-1 decision changing base/version/scope), the superseded value is **overwritten in place** — never appended beside the new one. Auxiliary deep-detail docs (`reviews/04-validation.md`, etc.) are permitted, but their final reconciled outcome must be reflected in `01-plan.md` by detail or by reference.

The plan-review panel's own outcomes (ratification, security design-review, shape audit, combined verdict) are NOT reflected in `01-plan.md` by detail or fold-in — they live exclusively in `reviews/01-plan-review.md`. `01-plan.md` carries only the one-line `**Reviews:**` attestation pointing at that file.

**Single consolidating writer of the plan body (Stage 1).** The architect owns the entire content of `01-plan.md` during Stage 1 — including every refinement the panel's findings require. When a finding lands, the architect fixes the erroneous section **in place**; no writer ever appends a correction note beside the section it corrects, and no writer other than the architect edits the plan body. The record of what changed and why lives in `reviews/01-plan-review.md` § "Panel Rounds" and in the execution-events file — never as an accretion inside `01-plan.md` itself. This is what makes `01-plan.md` read as written correctly the first time at STAGE-GATE-1.

**No forked root-level plan files.** Never create `01-plan-review.md`, `01-plan-ratification.md`, or any `01-plan-*.md` sibling in the ROOT of the workspace — every plan-stage panel outcome (ratification, plan review, security design-review) is written to the single canonical `reviews/01-plan-review.md` (closed list; no other review-outcome side-file is permitted).

## Canonical-field set

| Canonical field | Where it appears | Final-value owner |
|---|---|---|
| **Base branch** | `Base:` column in `### Delivery Grouping` (`## Task List`); any base mention in `## Review Summary` / `### Work Plan` Notes | operator decision at STAGE-GATE-1, else `main` |
| **Version bump (target version)** | suggested-bump note in `## Review Summary` / `### Work Plan` Notes / `## Task List` Notes; the version-site list | operator decision at STAGE-GATE-1, else architect default |

The set above is the minimum mandated by this contract. Each agent may treat additional fields (target scope, PR count) as canonical, but base branch and version bump are the required two that every plan-writer/auditor must track.

## No-forked-file prohibition

No plan-stage agent may create a `01-plan-*.md` sibling file in the root of the workspace — `01-plan-review.md`, `01-plan-ratification.md`, `01-plan-v2.md`, or any variant. Every panel-stage outcome (plan ratification, plan review, security design-review) is written to the single canonical `reviews/01-plan-review.md` (closed list — no other side-file is permitted). `01-plan.md` retains only the `**Reviews:**` attestation line for these outcomes. Root-level side-files fragment the deliverable and defeat the snapshot invariant.

## Section-ownership map

| Section | File | Sole writer | Write mode |
|---|---|---|---|
| `## Review Summary`, `## Architecture` (Work Plan, Services Touched, assessments), `## Task List` (task sections, AC text, Files, Delivery Grouping) | `01-plan.md` | architect | author; on amend, reconcile-in-place (overwrite superseded canonical fields so each appears exactly once) |
| `## Plan Ratification (Phase 1.5)` | `reviews/01-plan-review.md` | qa-plan (ratify-plan) | append in place; replace any prior copy; when a ratification gap changes a canonical field or AC, edit that field in the plan body in place — do not append a second value |
| `## Plan Review` header + `## Summary` rules table + `**Combined verdict:**` | `reviews/01-plan-review.md` | plan-reviewer | append in place; replace any prior copy |
| `## Plan Review` sub-verdict `**Substance (qa):**` | `reviews/01-plan-review.md` | qa-plan (panel) | replace own labelled line in place |
| `## Plan Review` sub-verdict `**Security design-review (security):**` | `reviews/01-plan-review.md` | security (panel) | replace own labelled line in place |
| `## Security Design-Review` (top-level skeleton section, condition-gated) | `reviews/01-plan-review.md` | security (panel) | fill the skeleton's own `**Verdict:**` line in place; the worst-of combine reads the `## Plan Review` sub-verdict above, not this section |
| `**Reviews:**` attestation line (plan title block) | `01-plan.md` | plan-reviewer | replace own labelled line in place, once per panel round |
| AC checkboxes in `## Task List` | `01-plan.md` | qa (validate) | checkbox flip only — no `## Validation Outcome` fold-in; the plan stays in final state pre-implementation, the verdict lives in `reviews/04-validation.md`, progress is read off the checkboxes and `Status:` |
| `Status:` field on task headers | `01-plan.md` | orchestrator / delivery | field edit in place |
| Canonical fields (base, version, scope) when changed by the operator at STAGE-GATE-1 | `01-plan.md` | orchestrator | overwrite superseded values in place so only the operator's final values remain |

## Write-scope on `01-plan.md` (closed list)

Every writer's permitted edit to `01-plan.md` is enumerated below. A writer not listed here has **no** write access to `01-plan.md` — if it needs to record a finding, it writes to `reviews/01-plan-review.md` instead.

| Writer | Permitted write on `01-plan.md` | When |
|---|---|---|
| architect | the entire plan body (author + in-place refinement) | Stage 1 |
| plan-reviewer | ONLY the `**Reviews:**` line in the title block (replace-in-place) | close of each panel round |
| orchestrator | reconciliation of canonical fields decided by the operator at STAGE-GATE-1 (overwrite-in-place); `Status:` transitions | gate / post-gate |
| qa (validate) | ONLY AC checkbox flips | Phase 3 |
| delivery | `Status: merged` | Phase 4 |
| ux-reviewer | AC additions appended to `## Task List` (per-task AC block, contiguous numbering after the architect's last AC) — narrative stays in `reviews/01-ux-review.md` | Phase 1.7 (enrich, Stage 1, before ratification) |
| qa-plan, security, tester, implementer, and everyone else | NONE | — |

(The Stage-2 mechanisms — `[CONSTRAINT-DISCOVERED]` annotations by the implementer/architect and orchestrator-applied amendments after Phase 2.5 — are out of scope for this table; they are unchanged.)

## How to reference this file

In your agent, add a one-line cross-reference at the relevant section:

```
**Plan consolidation invariant:** see `agents/_shared/plan-consolidation.md` § "Invariant" and § "Section-ownership map". No forked `01-plan-*.md` sibling in the workspace root; panel outputs live in `reviews/01-plan-review.md`.
```
