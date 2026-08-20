## Purpose

Collapse the two-architect OpenSpec Design transaction to one dispatch. The overlay pass was transcription policed by deterministic validators, not judgment; a script derives the mechanical content and the planning architect supplies the judgment content in its single pass.

## ADDED Requirements

### Requirement: The Design transaction completes with exactly one architect dispatch
For every OpenSpec-bound Design transaction, the pipeline SHALL dispatch exactly one planning architect, which authors the OpenSpec change and the judgment content of the operational plan (specialist routing, file-scope decomposition, invariants). The standing `openspec-overlay` dispatch mode is retired.

#### Scenario: A new workspace enters Design
- **WHEN** the coordinator runs the Design transaction for a new workspace
- **THEN** one architect dispatch produces the change and judgment content, and no second architect dispatch occurs

### Requirement: The overlay skeleton is derived mechanically
The pipeline scripts SHALL derive the overlay's mechanical content — traceability coordinates and content hashes, the Gate-1 index scaffold, and execution-shard scaffolds — from the validated change and snapshot, without a model pass.

#### Scenario: The change passes CLI validation
- **WHEN** the authored change validates strictly
- **THEN** the script emits the overlay skeleton bound to the validated change's coordinates and hashes, ready for the judgment content authored in the same planning dispatch

### Requirement: The validator chain is the unchanged fail-closed backstop
The deterministic validator chain (plan-contract validation and the OpenSpec validators) SHALL remain unchanged and fail-closed. A validator failure SHALL re-enter the same single-pass planning flow; no second standing dispatch mode exists for repair.

#### Scenario: A validator detects an overlay mismatch
- **WHEN** plan-contract validation fails on the assembled plan
- **THEN** the coordinator re-dispatches the planning flow with the failure, and Gate 1 is not presented until the chain passes
