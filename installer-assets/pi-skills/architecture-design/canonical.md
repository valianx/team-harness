
# Architecture design

Reuse the bound file or Page context through [workspace](../workspace/SKILL.md).
Honor the operator's output format and destination. Use declared local storage
for required file artifacts. Main retains the proposal documents and links to
supporting assets in the bound context. Read a supplied issue through the
active host's GitHub tools.

## Write a proposal

Write a proposal when requested, whenever the operator invokes
`architecture-proposal`, or when the operator invokes this skill without
arguments after agreeing on the design. Use decisions from the current
conversation and any supplied draft or issue. Ask only when a missing
decision prevents a faithful draft. Record other unresolved decisions where
they affect the proposal.

By default, deliver a detailed proposal for implementation and a concise
presentation document for the team. Honor any explicitly requested output.
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
