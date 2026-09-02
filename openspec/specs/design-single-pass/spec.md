# design-single-pass Specification

## Purpose
Collapse the two-architect OpenSpec Design transaction to one dispatch. The overlay pass was transcription policed by deterministic validators, not judgment; a script derives the mechanical content and the planning architect supplies the judgment content in its single pass.

## Requirements

### Requirement: The Design transaction completes with exactly one architect dispatch
For every OpenSpec-bound Design transaction, the pipeline SHALL dispatch exactly one planning architect, which authors the OpenSpec change and the judgment content of the operational plan (specialist routing, file-scope decomposition, invariants). The standing `openspec-overlay` dispatch mode is retired.

#### Scenario: A new workspace enters Design
- **WHEN** the coordinator runs the Design transaction for a new workspace
- **THEN** one architect dispatch produces the change and judgment content, and no second architect dispatch occurs

### Requirement: The validator chain is the unchanged fail-closed backstop
The deterministic validator chain (plan-contract validation and the OpenSpec validators) SHALL remain unchanged and fail-closed. A validator failure SHALL re-enter the same single-pass planning flow; no second standing dispatch mode exists for repair.

#### Scenario: A validator detects an overlay mismatch
- **WHEN** plan-contract validation fails on the assembled plan
- **THEN** the coordinator re-dispatches the planning flow with the failure, and Gate 1 is not presented until the chain passes

### Requirement: The single architect pass has a requirement-count ceiling
`openspec/config.yaml` SHALL record `max_requirements_per_change`. When the authored change delta exceeds it, the architect SHALL stop authoring and return `design_status: oversize` with the requirement count and the split seams it identifies. Before computing the content identity or generating `01-plan.md`, the coordinator SHALL present one live choice — split into changes, accept oversize with a reason recorded in `proposal.md`, or narrow the request — and SHALL record the decision as a `design.oversize` event.

#### Scenario: A refactor produces a plan past the ceiling
- **WHEN** the architect's delta reaches thirteen requirements against a ceiling of twelve
- **THEN** authoring stops, the operator sees the count and proposed seams, and no identity, `01-plan.md`, or Gate 1 is produced until a choice is recorded

#### Scenario: The operator accepts oversize
- **WHEN** the operator selects accept with a reason
- **THEN** the reason is appended to `proposal.md`, the event is recorded, and the single pass resumes to completion
