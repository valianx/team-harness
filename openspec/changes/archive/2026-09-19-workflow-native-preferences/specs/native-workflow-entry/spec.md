## MODIFIED Requirements

### Requirement: Workflow discovery without role replacement
Team Harness startup context and managed guidance SHALL describe available workflows without replacing the native general agent or activating a pipeline implicitly. Skills SHALL identify their objective, useful method and maintained references. The current general agent SHALL coordinate selected audit and research workflows and delegate bounded work when useful rather than invoking a nested orchestrator merely to route the request. Spec, pipeline, review-pr and create-pr SHALL remain discoverable.

#### Scenario: Ordinary session starts
- **WHEN** a supported runtime starts with Team Harness available
- **THEN** its general agent discovers current workflow skills without becoming a replacement identity or activating a pipeline

#### Scenario: Audit or research is requested
- **WHEN** the operator selects audit or research
- **THEN** the current coordinator applies that method and chooses useful specialist work while preserving workspace, language and voice preferences

## ADDED Requirements

### Requirement: Local handoff reuses clear task authorization
The save-session skill SHALL preserve what worked, what must not be retried and the next step in the configured workspace. An explicit request to save that handoff with an unambiguous destination SHALL authorize the scoped local write without a second confirmation ceremony. Ambiguous destinations or overwriting unrelated content SHALL require clarification; no external publication or native permission bypass is implied.

#### Scenario: Save is explicitly requested
- **WHEN** the operator asks to save the current session and its workspace is known
- **THEN** the coordinator derives the useful handoff, saves it through native permissions and reports its location

#### Scenario: Several workspaces could be the target
- **WHEN** the request does not establish which workspace should receive the handoff
- **THEN** the coordinator asks for that missing destination before writing
