---
name: ref-special-flows
description: Reference to research, testing and other supporting skills; not a standalone agent.
model: opus
color: cyan
---

# Supporting workflows

Read the current installed skill for the selected capability. The current
general agent coordinates bounded specialists when independent work helps;
no fixed role chain or agent count is needed.

## Research Flow

Use `research` for external evidence and technology decisions. Frame the
question, inspect relevant project needs, use primary sources, compare viable
options and state uncertainty. Follow up only on gaps that affect the decision.

## Research-Code Flow

Use `research-code` for implementation evidence and cross-repository traces.
Ground conclusions in source locations and distinguish code behavior from
documentation. Use `cross-repo` when the question concerns shared contracts.

## Spike Flow

Use `skills/spike/SKILL.md` for the experiment method: state the hypothesis and
success signal, record a known baseline, choose scratch or worktree isolation as
the change requires, and clean up only spike-owned material when the operator
discards it. The coordinator reports evidence and lets the operator choose
formalize, discard, or investigate; no fixed dispatch chain is implied.

## Plan and Milestone-Build Flow

Use `spec` for intent and tasks. A milestone list can clarify dependencies and
delivery order when the objective spans several increments. Keep one useful
overview instead of duplicating acceptance across nested workspaces. Use
`pipeline` when the operator chooses broader coordination.

## Bug-fix and Hotfix Flow

Reproduce or establish the defect, locate its cause, repair the affected
behavior, and verify it with relevant evidence. Add regression coverage where
it meaningfully protects the fix. Urgency changes prioritization, not native
permissions. Avoid assigning a workflow through universal tier numbers.

## Database Changes Flow

Inspect schema consumers, data assumptions and migration behavior. Evaluate
compatibility, rollback and data preservation for the actual change. Use
relevant integration evidence and obtain any missing operational decision.

## Refactor Flow

State which observable behavior remains stable, keep changes coherent, and
use existing checks plus targeted evidence to verify that behavior.

## Test Pipeline Flow

Use `skills/test-pipeline/SKILL.md` for broader service or module testing. Resolve
the target and requested flags, inspect the repository's own behavior and
coverage goals, coordinate independent modules when useful, run relevant checks,
and report results and limits. There is no TH-wide coverage percentage or
mandatory module fan-out.

## Documentation Flow

Use `skills/docs/SKILL.md` to establish the audience and questions, resolve the
configured vault and destination, research current sources, write source-grounded
pages, add diagrams when they clarify the subject, and check accuracy, links,
navigation, and usability. The coordinator may delegate bounded research,
writing, diagram, or QA work and consolidates the result. Keep only durable
product knowledge in the vault; the skill owns the detailed method.

## Learn (Teaching) Flow

Use `learn` and the mentor when helpful. Start from the learner's question and
level, explain through concrete examples, and adapt to feedback. A teaching
pack is an optional durable artifact, not a prerequisite to answer.
