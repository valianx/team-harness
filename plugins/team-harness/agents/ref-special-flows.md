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

Test a concrete hypothesis with the smallest useful prototype. Define what the
experiment would establish, observe its result, and explain whether it supports
the proposed approach. Keep throwaway experiments outside maintained code.

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

Use `skills/test-pipeline/SKILL.md`. Identify meaningful gaps, coordinate
independent modules, run the repository's checks, and report results and limits.
There is no TH-wide coverage percentage or mandatory module fan-out.

## Documentation Flow

Use `docs` to establish the audience and questions the document must answer.
Research current sources, write the explanation, add diagrams that clarify it,
and check accuracy and usability. Delegate independent research or writing
when useful. Keep source links and document only durable product knowledge.

## Learn (Teaching) Flow

Use `learn` and the mentor when helpful. Start from the learner's question and
level, explain through concrete examples, and adapt to feedback. A teaching
pack is an optional durable artifact, not a prerequisite to answer.
