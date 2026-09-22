## Why

TH already provides planning, implementation, testing and delivery methods, but their handoffs do not make the expected work visible as one development journey. Operators cannot readily tell which tools actually ran, TEA appears confined to validation, and the CRAP calculator lacks a clear current workflow invocation.

## What Changes

- Present four visible phases: Spec, Implementation, Validation and Publication. Reuse current skills, canonical OpenSpec and the selected workspace rather than adding a workflow engine.
- Make each phase's inputs, work, outputs and completion evidence explicit. Continue to the requested endpoint under existing authorization, including entry or resumption at a later phase.
- Extend the existing operator plan with selected capabilities, reasons, scope, pending work, actual outcomes and evidence links. Reuse unaffected evidence and expose omissions without treating recommendations as orders.
- Show TEA across the lifecycle: test-design in Spec, selected ATDD/automation or infrastructure work during implementation, and test-review/trace plus selected NFR analysis during validation.
- Integrate real CRAP measurement in validation using the existing runner and project metric collectors, with explicit missing-data handling and a real-stack demonstration. Replace obsolete current-use guidance about mandatory Freeze/cleaner gates without redesigning legacy helper contracts.
- Align spec, optional pipeline, implement, validate, verify and create-pr handoffs, including native discovery, artifact hygiene and archive before final candidate review.

## Capabilities

### New Capabilities

- `four-phase-development`: Observable phase outcomes, capability selection, continuation, real CRAP diagnostics and publication handoff across supported native runtimes.

### Modified Capabilities

- `spec-direct-lane`: The existing operator plan exposes phases and capability evidence without becoming a second scope or authority record.
- `external-verification-workflows`: TEA's selected implementation and non-functional methods join its existing spec design, test-review and trace responsibilities.

## Impact

Shared workflow guidance, spec plan template, coordinating skill/role references and generated Codex/OpenCode projections; CRAP usage documentation and existing regression/scenario coverage. Working designs and provider reports stay in the local or Obsidian workspace. Canonical planning artifacts remain in OpenSpec. No new provider dependency is required merely to explain phases; selected metric collectors use their official distributions.

## Non-Goals

No replacement general agent, permission hooks, gate/state engine, forced pipeline activation, blanket installation/execution of every provider, duplicate upstream methods, automatic merge, historical-spec purge, new multi-language metrics framework, or broad rewrite of legacy quality-runner contracts. Existing direct work and existing-PR review remain available.
