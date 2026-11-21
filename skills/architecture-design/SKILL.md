---
name: architecture-design
description: Design a system or write a detailed architecture proposal and a concise document for team review.
---

# Architecture design

Reuse the bound file or Page context through [workspace](../workspace/SKILL.md).
Honor the operator's output format and destination. Use declared local storage
for required file artifacts. Main retains the proposal documents and links to
supporting assets in the bound context. Read a supplied issue through the
active host's GitHub tools.

## Write a proposal

Write a proposal when requested, whenever the operator invokes
`architecture-proposal`, or when the operator invokes this skill without
arguments with a design under discussion. Use the current conversation and
any supplied draft or issue. Work from what is known and identify open
decisions. Ask only when a missing input prevents a useful draft.

By default, export two review PDFs from editable sources: a detailed
engineering proposal and a concise team proposal. The operator validates
decisions as the design evolves. Honor any explicitly requested output.
Follow the [solution proposal guide](references/solution-proposal.md) to write
and review both documents from the same decisions.

## Continue architecture design

For design work in progress, clarify outcomes, scope, constraints and decisions
using the supplied sources and project context. Reuse existing authority and
ask only for a missing material decision. Main coordinates and evaluates
specialist evidence.

Reuse existing OpenSpec intent and reconcile design changes there. Internal
OpenSpec planning keeps its own artifacts. Reuse the method for affected data
models and frontend wireframes. [sketch](../sketch/SKILL.md)

End design-only work with the proposed solution and open decisions. Continue
implementation when already authorized. In an active pipeline, build on its
current plan and shared phases. [Shared development phases](../spec/references/development-phases.md)
