### Added

- New plan-cleanliness Rule 13 (`agents/plan-reviewer.md`) — severity `fail`, no override — rejects any `01-plan.md` content that embeds a reviewer's section (`## Plan Review`, `## Plan Ratification`, `## Validation Outcome`, `## Security Design-Review`, `## Panel Rounds`) or an out-of-place correction/errata marker, with a declared block-quote tolerance and a carve-out for the attestation line, AC checkboxes, and the `Status:` field.

### Changed

- Plan-review panel outputs (qa-plan ratification, conditional security design-review, plan-reviewer shape) moved out of `01-plan.md` into one consolidated agentic-tier file `reviews/01-plan-review.md`; the never-skip gate relocates with them (the panel file with a Combined verdict must exist before STAGE-GATE-1). `01-plan.md` now reaches the gate in its final human-readable form: the architect is the sole consolidating writer of the plan body post-panel, and the plan-reviewer's one-line `**Reviews:**` attestation is the only review trace in the plan. The `## Validation Outcome` fold-in is removed (qa validate mode returns to checkbox flips only). Workspace documents are classified two-tier: operator-facing (plan, sketches, root-cause, overview — human-first format) vs agentic (everything else — compact, low-cost).
