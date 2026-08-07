# Plan consolidation invariant
<!-- Single source of truth for the sharded plan-is-a-snapshot contract.
     Consumed by: agents/{architect,plan-reviewer,qa-plan,qa,orchestrator}.md.
     Edit here; agent files reference this file by section. -->

## Invariant

The `sharded-v1` plan set defined by `docs/plan-shards.md` is a snapshot of the final,
reconciled plan state — not a log of how the plan was reached. Each canonical field or fact
appears exactly once in its owning artifact. When later input supersedes an earlier value,
overwrite the smallest owning field or section; never append the new value beside the old one
and never regenerate unrelated shards. Auxiliary deep-detail docs (`reviews/04-validation.md`,
etc.) are permitted, but their final reconciled outcome must be reflected in the owning shard
by detail or by reference.

The plan-review panel's outcomes live exclusively in `reviews/01-plan-review.md`. `01-plan.md` carries only the one-line `**Reviews:**` attestation pointing at that file.

**Single consolidating writer of the plan set (Stage 1).** The architect owns `01-plan.md` and `plan/**` during Stage 1. When a finding lands, it edits only the owning shard. `reviews/01-plan-review.md` remains a current snapshot: `§ Panel Rounds` retains one compact row per round; superseded finding bodies are replaced, not retained. Detailed history lives only in the execution-events file.

**No forked root-level plan files.** Never create `01-plan-review.md`, `01-plan-ratification.md`, or any `01-plan-*.md` sibling in the ROOT of the workspace — every plan-stage panel outcome (ratification, plan review, security design-review) is written to the single canonical `reviews/01-plan-review.md` (closed list; no other review-outcome side-file is permitted).

## Canonical-field set

| Canonical field | Where it appears | Final-value owner |
|---|---|---|
| **Base branch** | `plan/delivery.md` | operator decision at STAGE-GATE-1, else `main` |
| **Version bump (target version)** | `plan/delivery.md` | operator decision at STAGE-GATE-1, else architect default |

The set above is the minimum mandated by this contract. Each agent may treat additional fields (target scope, PR count) as canonical, but base branch and version bump are the required two that every plan-writer/auditor must track.

## No-forked-file prohibition

No plan-stage agent may create a `01-plan-*.md` sibling file in the root of the workspace — `01-plan-review.md`, `01-plan-ratification.md`, `01-plan-v2.md`, or any variant. Every panel-stage **outcome** (plan ratification, plan review, security design-review) is written to the single canonical `reviews/01-plan-review.md` (closed list — no other side-file is permitted). `01-plan.md` retains only the `**Reviews:**` attestation line for these outcomes. Root-level side-files fragment the deliverable and defeat the snapshot invariant.

This closes the set of panel *outcomes*, not the set of files under `reviews/`. A panel **input** authored by a non-panel agent gets its own file with its own single owner — `reviews/01-closure-rubric.md` (architect) and `reviews/01-ux-review.md` (ux-reviewer) are the two. Giving each author its own file is what keeps the panel's file free of foreign writers.

## Section-ownership map

| Section | File | Sole writer | Write mode |
|---|---|---|---|
| operator summary, classification, plan manifest, task status index | `01-plan.md` | architect | author; on amend, edit owning fields only |
| decisions, services, assessments, file-level work plan | `plan/architecture.md` | architect | author; amend owning section only |
| dependency and PR grouping, base and version | `plan/delivery.md` | architect | author; amend owning field only |
| cross-project or multi-site invariants | `plan/invariants.md` | architect | author when needed; amend owning invariant only |
| task scope, files, seams, notes, AC text and checkboxes | `plan/tasks/Task-N.md` | architect | one canonical shard per task; amend owning field only |
| Closure rubric (ownership closure, provenance, removed-control) | `reviews/01-closure-rubric.md` | architect | author; rewrite in place on amend |
| `## Plan Ratification` | `reviews/01-plan-review.md` | qa-plan (ratify-plan, explicit `/th:plan-review` only) | replace own section in place; surface any required plan/AC correction to `architect` — qa-plan never edits the plan body |
| `## Plan Review` header + `## Summary` rules table + `## Findings` + `## Recommendation to orchestrator` + `**Combined verdict:**` | `reviews/01-plan-review.md` | plan-reviewer | append in place; replace any prior copy |
| `## Panel Rounds` | `reviews/01-plan-review.md` | plan-reviewer | append exactly one compact row per round; never retain prior finding bodies |
| `## Plan Review` sub-verdict `**Substance (qa):**` | `reviews/01-plan-review.md` | qa-plan (panel) | replace own labelled line in place |
| `## Plan Review` sub-verdict `**Security design-review (security):**` | `reviews/01-plan-review.md` | security (panel) | replace own labelled line in place |
| `## Security Design-Review` (top-level skeleton section, condition-gated) | `reviews/01-plan-review.md` | security (panel) | fill the skeleton's own `**Verdict:**` line in place; the worst-of combine reads the `## Plan Review` sub-verdict above, not this section |
| `**Reviews:**` attestation line (plan title block) | `01-plan.md` | plan-reviewer | replace own labelled line in place, once per panel round |
| AC checkboxes | `plan/tasks/Task-N.md` | qa (validate) | checkbox flip only; verdict remains in `reviews/04-validation.md` |
| task `Status` cell | `01-plan.md` task index | orchestrator | field edit in place |
| base/version changed by the operator at STAGE-GATE-1 | `plan/delivery.md` | orchestrator | overwrite owning fields in place |

## Write-scope on the plan set (closed list)

Every writer's permitted edit is enumerated below. A writer not listed has no write access to `01-plan.md` or `plan/**`; findings go to `reviews/01-plan-review.md`.

| Writer | Permitted plan-set write | When |
|---|---|---|
| architect | all plan artifacts (author + smallest-shard refinement) | Stage 1, or a new design pass explicitly requested by the live operator after Gate 1 |
| plan-reviewer | ONLY the `**Reviews:**` line in the title block (replace-in-place) | close of each panel round |
| orchestrator | deterministic pre-Gate-1 format normalization (canonical index order, existing task routes, uniquely named heading levels, AC/TC literal grammar); mechanical canonical-field repairs that preserve every security obligation; canonical-field transcription of one bounded operator decision; and task-index status transitions | closed format normalization before Gate 1; all other repairs post-Gate-1; never dispatch `architect` automatically |
| qa (validate) | ONLY AC checkbox flips in assigned task shards | Phase 3 |
| delivery | task-index status to `merged` | Phase 4 |
| ux-reviewer | AC additions in affected task shards, contiguous numbering — narrative stays in `reviews/01-ux-review.md` | Phase 1.7 (enrich, Stage 1, before ratification) |
| qa-plan, security, tester, implementer, and everyone else | NONE | — |

(Stage-2 `[CONSTRAINT-DISCOVERED]` annotations are placed in the affected task shard by the **orchestrator**, transcribing an implementer's status field; the implementer never writes the plan set.)

Before Gate 1, the coordinator may run the deterministic format repair exactly
once after failed validation. Its closed transformations are canonical index
column order, existing task routes in the manifest, uniquely named required
heading levels, and recognizable AC/TC delimiter, checkbox, and
Given/When/Then casing. It applies all eligible transformations transactionally
and cannot create missing content or change task values, counts, AC/TC prose,
scope, decisions, architecture content, delivery, branches, or PR grouping. It
records per-artifact before/after hashes and operations, reruns validation, and consumes no architect
correction or iteration.

After Gate 1, the coordinator is the only owner of canonical plan-field edits: it may
repair a mechanical defect, transcribe a bounded resolution explicitly approved by the
live operator, and perform the existing status transitions. Those edits continue at
`phase: implementation` and do not create a new architect pass or automatic Gate 1.

**Security-obligation boundary.** Any security-obligation change is never mechanical: it
is decision-bearing and requires one bounded live operator decision. The coordinator
transcribes that decision and continues `implementation → Freeze → fresh security audit →
validation`; architect is prohibited unless the live operator separately and explicitly
requests architect work; `iteration` delta: `0`. Only that request may set
`phase: design` and open a new Gate 1.

Specialists do not select a phase, edit canonical plan text, or dispatch the next agent;
QA's checkbox-only mirror remains the existing validation exception. Only a fresh live
operator request for architect work permits `phase: design` and a new Gate 1.

## Final-result finding coordinates

Tester, QA, security, and adversary findings that block acceptance use one
coordinate set: `Cause`, `Files`, implicated `AC`, and `Correction`. A defect or
coverage gap inside the approved scope returns to implementation; the
coordinator reopens Freeze and requests a fresh audit of a sensitive delta.
Only a structural contradiction between intent, scope, and AC requires an operator
decision. That decision continues at `implementation` unless the live operator separately
and explicitly requests architect work; only that request may open `design` and a new
Gate 1. No validator rewrites an AC or edits coordination state to manufacture PASS.

## Write-tool discipline (shared review files)

This section governs `Edit`/`Write` usage on `reviews/01-plan-review.md` — the panel's shared, multi-writer review artifact (`plan-reviewer`, `qa-plan` and `security` write into it; `adversary` does **not** — it owns no section here and writes only its `reviews/04-adversary.md` or `reviews/04-adversary-amend-{N}.md` report). It is a rule of the panel as a whole, not an exception carved out for one agent.

**The rule.** Every panel agent uses `Edit` on a review file that already exists. `Write` is reserved for the initial creation of the agent's own review file — never for a file that already exists, never for a file owned by another agent, never for a shared file. When `reviews/01-plan-review.md` already exists (created by whichever panel agent ran first this round), every subsequent writer edits it in place with `Edit`; none of them re-`Write`s it whole.

On an existing file, `old_string` is anchored exclusively to the writer's own section or its own labelled line (e.g., `**Substance (qa):**`, `**Security design-review (security):**`, `**Combined verdict:**`) — never a string shared with another agent's section. `replace_all: true` is PROHIBITED on this file: a `true` value applies the substitution everywhere the string matches, including inside a section this agent does not own.

**Why both anchoring rules matter — they separate the noisy failure from the silent one.** A full `Write` over an existing file destroys every heading and sub-verdict label at once — the header-survival check (`agents/ref-pipeline.md § "Header-survival check (panel dispatch integrity)"`) sees the loss and blocks. A broad `old_string` or a `replace_all: true` over a string common to more than one section corrupts another agent's prose while leaving every heading and every sub-verdict label intact — it passes that check by construction. The two restrictions in this section are what closes that second, silent failure mode; the check alone cannot.

**Capacity vs. contract — a declared asymmetry, not a gap.** `Edit` is a CAPACITY: it is declared in an agent's frontmatter `tools:` line, and a structural test can assert its presence. The "`Write` only for the writer's own file's initial creation" rule is a CONTRACT the tool grant cannot impose: a tool grant is not path-scoped — an agent holding `Write` can reach any file its permissions allow, and no frontmatter check distinguishes "creates its own file" from "overwrites someone else's." Stating the restriction as if the grant enforced it would be exactly the kind of unverified assertion this mechanism exists to remove. What actually detects a violation of this contract is the header-subset (header-survival) check the orchestrator runs around every panel dispatch on `reviews/01-plan-review.md` (`agents/ref-pipeline.md § "Header-survival check (panel dispatch integrity)"`) — that check catches the noisy failure (a full-file loss); it does not catch a content corruption that leaves every header and label intact. That blind spot is a residual covered by this write-tool discipline as a CONTRACT the writing agent is trusted to follow, never a CHECK the orchestrator independently verifies — recorded plainly in `01-plan.md § Security Assessment`.

**Why the plan set carries no equivalent check.** `plan-reviewer`'s one sanctioned plan write is the `**Reviews:**` attestation. Structure validation checks the manifest and required shards before the gate. A complete, well-formed rewrite by a reviewer remains a contract risk rather than an independently detected content risk.

## How to reference this file

In your agent, add a one-line cross-reference at the relevant section:

```
**Plan consolidation invariant:** see `agents/_shared/plan-consolidation.md` § "Invariant" and § "Section-ownership map". No forked `01-plan-*.md` sibling in the workspace root; panel outputs live in `reviews/01-plan-review.md`.
```
