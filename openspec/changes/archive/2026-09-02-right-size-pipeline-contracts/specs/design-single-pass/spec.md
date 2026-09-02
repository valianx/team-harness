## ADDED Requirements

### Requirement: The single architect pass has a requirement-count ceiling
`openspec/config.yaml` SHALL record `max_requirements_per_change`. When the authored change delta exceeds it, the architect SHALL stop authoring and return `design_status: oversize` with the requirement count and the split seams it identifies. Before computing the content identity or generating `01-plan.md`, the coordinator SHALL present one live choice — split into changes, accept oversize with a reason recorded in `proposal.md`, or narrow the request — and SHALL record the decision as a `design.oversize` event.

#### Scenario: A refactor produces a plan past the ceiling
- **WHEN** the architect's delta reaches thirteen requirements against a ceiling of twelve
- **THEN** authoring stops, the operator sees the count and proposed seams, and no identity, `01-plan.md`, or Gate 1 is produced until a choice is recorded

#### Scenario: The operator accepts oversize
- **WHEN** the operator selects accept with a reason
- **THEN** the reason is appended to `proposal.md`, the event is recorded, and the single pass resumes to completion
