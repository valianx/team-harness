## MODIFIED Requirements

### Requirement: Workflow discovery without role replacement
Team Harness startup context and managed guidance SHALL describe available workflows without replacing the native general agent or activating a pipeline implicitly. Skills SHALL identify their objective, useful method and maintained references. The current general agent SHALL coordinate selected audit, find-bugs, research and GCP workflows and delegate bounded work when useful rather than invoking a nested orchestrator merely to route the request. Spec, pipeline, review-pr, create-pr and find-bugs SHALL remain discoverable. Supported installations SHALL make this guidance available through native instruction discovery without requiring a TH default-agent selection.

#### Scenario: Ordinary session starts
- **WHEN** a supported runtime starts with Team Harness available
- **THEN** its general agent discovers current workflow skills without becoming a replacement identity or activating a pipeline

#### Scenario: Audit or research is requested
- **WHEN** the operator selects audit or research
- **THEN** the current coordinator applies that method and chooses useful specialist work while preserving workspace, language and voice preferences

#### Scenario: GCP infrastructure is requested
- **WHEN** the operator selects GCP infrastructure work
- **THEN** the current coordinator applies that method without a nested orchestrator and preserves workspace, language and voice preferences

#### Scenario: OpenCode uses its native general agent
- **WHEN** Team Harness is installed while OpenCode retains its native or operator-selected general agent
- **THEN** the agent can discover the main TH workflows and configured collaboration guidance without selecting TH-orchestrator

#### Scenario: Functional diagnosis is requested without a PR
- **WHEN** the operator asks for concrete defects in a project or module
- **THEN** the general agent can select find-bugs and distinguish it from architectural audit and review of an existing PR in Codex, Claude Code and OpenCode
