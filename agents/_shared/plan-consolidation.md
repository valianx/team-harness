# Plan consolidation invariant
<!-- Single source of truth for the plan-is-a-snapshot contract.
     Consumed by: agents/{architect,plan-reviewer,qa-plan,qa,orchestrator}.md.
     Edit here; agent files reference this file by section. -->

## Invariant

`01-plan.md` is a snapshot of the final, reconciled plan state — not a log of how the plan was reached. Each canonical field appears exactly once, carrying its final value. When any later-stage input supersedes an earlier value (a plan-reviewer override of an architect default, a ratification gap fix, an operator STAGE-GATE-1 decision changing base/version/scope), the superseded value is **overwritten in place** — never appended beside the new one. Auxiliary deep-detail docs (`04-validation.md`, etc.) are permitted, but their final reconciled outcome must be reflected in `01-plan.md` by detail or by reference.

**No forked plan files.** Never create `01-plan-review.md`, `01-plan-ratification.md`, or any `01-plan-*.md` sibling — every plan-stage outcome folds into a section of the single `01-plan.md` in place (replacing any prior copy of that section).

## Canonical-field set

| Canonical field | Where it appears | Final-value owner |
|---|---|---|
| **Base branch** | PR `Base:` in `## Task List`; any base mention in `## Review Summary` / `### Work Plan` Notes | operator decision at STAGE-GATE-1, else `main` |
| **Version bump (target version)** | suggested-bump note in `## Review Summary` / `### Work Plan` Notes / `## Task List` Notes; the version-site list | operator decision at STAGE-GATE-1, else architect default |

The set above is the minimum mandated by this contract. Each agent may treat additional fields (target scope, PR count) as canonical, but base branch and version bump are the required two that every plan-writer/auditor must track.

## No-forked-file prohibition

No plan-stage agent may create a `01-plan-*.md` sibling file — `01-plan-review.md`, `01-plan-ratification.md`, `01-plan-v2.md`, or any variant. Every plan-stage outcome (plan ratification, plan review, validation verdict) folds into a named section of the single `01-plan.md` in place (replacing any prior copy of that section). Side-files fragment the deliverable and defeat the snapshot invariant.

## Section-ownership map

| Section of `01-plan.md` | Sole writer | Write mode |
|---|---|---|
| `## Review Summary`, `## Architecture` (Work Plan, Services Touched, assessments), `## Task List` (PR sections, AC text, Files) | architect | author; on amend, reconcile-in-place (overwrite superseded canonical fields so each appears exactly once) |
| `## Plan Ratification (Phase 1.5)` | qa-plan (ratify-plan) | append in place; replace any prior copy; when a ratification gap changes a canonical field or AC, edit that field in the plan body in place — do not append a second value |
| `## Plan Review` header + `## Summary` rules table + `**Combined verdict:**` | plan-reviewer | append in place; replace any prior copy |
| `## Plan Review` sub-verdict `**Substance (qa):**` | qa-plan (panel) | replace own labelled line in place |
| `## Plan Review` sub-verdict `**Security design-review (security):**` | security (panel) | replace own labelled line in place |
| AC checkboxes in `## Task List` | qa (validate) | checkbox flip only |
| `## Validation Outcome` | qa (validate) | append in place; replace any prior copy |
| `Status:` field on PR headers | orchestrator / delivery | field edit in place |
| Canonical fields (base, version, scope) when changed by the operator at STAGE-GATE-1 | orchestrator | overwrite superseded values in place so only the operator's final values remain |

## How to reference this file

In your agent, add a one-line cross-reference at the relevant section:

```
**Plan consolidation invariant:** see `agents/_shared/plan-consolidation.md` § "Invariant" and § "Section-ownership map". No forked `01-plan-*.md` files.
```
