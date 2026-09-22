## MODIFIED Requirements

### Requirement: Phase entry preserves continuity and authorized scope
Entering or resuming a phase SHALL recover the existing objective, canonical tasks, workspace, candidate evidence and authorized endpoint: planning, local completion, PR preparation or PR publication. Main SHALL complete missing prerequisites within that scope and reuse unaffected work, without requiring invocation of each selected tool or redundant approval at each transition. An implementation request SHALL include its applicable Validation phase: Main SHALL continue directly after implementation without waiting for another operator message, unless the operator explicitly requests an earlier stop. The phases SHALL remain separately observable; a genuine missing decision or unavailable prerequisite SHALL remain explicit rather than becoming a phase approval ceremony or a fabricated success. Codex, Claude Code and OpenCode SHALL expose equivalent phase guidance through their native entry points. Existing direct work, explicitly selected pipeline and existing-PR review SHALL retain their distinct purposes.

#### Scenario: The operator authorizes work through PR publication
- **WHEN** material decisions are resolved and prerequisites can be satisfied within scope
- **THEN** Main continues through all four phases using the existing authority and selected review decision without requiring separate prompts for each tool

#### Scenario: Validation is requested on an existing implementation
- **WHEN** the effort has usable intent, tests and a selected workspace
- **THEN** Main resumes from those inputs, completes missing selected assessments and avoids creating another spec or workspace merely because entry occurred at a later phase

#### Scenario: A correction affects part of the evidence
- **WHEN** a review leads to a scoped change
- **THEN** Main returns to implementation and renews affected checks, preserving original reviewer results and other still-applicable evidence without claiming an old candidate-bound receipt belongs to a new candidate

#### Scenario: Another supported host consumes the flow
- **WHEN** the same objective is continued through Claude Code or OpenCode instead of Codex
- **THEN** the native agent can discover the same phases and handoffs while retaining the configured local or Obsidian workspace and that host's execution permissions

#### Scenario: The endpoint is local completion
- **WHEN** the authorized work completes its applicable implementation and validation without a PR requirement
- **THEN** Main records local delivery and remaining limits in the same workspace without creating a PR or representing missing external publication as incomplete product work

#### Scenario: The operator requests implementation without naming validation
- **WHEN** the operator requests implementation and has not specified an earlier stop
- **THEN** Main completes implementation and proceeds immediately to applicable validation in the same effort, reports each phase and its actual evidence, and does not require another message or infer PR publication authority

#### Scenario: The operator explicitly requests a stop before validation
- **WHEN** the authorized endpoint explicitly excludes validation
- **THEN** Main honors that endpoint, reports completed implementation and focused checks accurately, and leaves the excluded assessments pending without claiming validated completion

#### Scenario: Validation needs a genuinely missing decision
- **WHEN** a selected check depends on a material decision not settled by the existing scope
- **THEN** Main requests only that decision, states the dependent check as pending, continues independent authorized work, and does not treat the phase transition itself as the missing approval
