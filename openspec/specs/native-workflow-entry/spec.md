# native-workflow-entry Specification

## Purpose
Let the native general agent discover and use Team Harness workflows while retaining native coding behavior and the operator's configured collaboration preferences.

## Requirements

### Requirement: Workflow discovery without role replacement
Team Harness startup context and managed guidance SHALL describe available workflows without replacing the native general agent or activating a pipeline implicitly. Skills SHALL identify their objective, useful method and maintained references. The current general agent SHALL coordinate selected audit and research workflows and delegate bounded work when useful rather than invoking a nested orchestrator merely to route the request. Spec, pipeline, review-pr and create-pr SHALL remain discoverable.

#### Scenario: Ordinary session starts
- **WHEN** a supported runtime starts with Team Harness available
- **THEN** its general agent discovers current workflow skills without becoming a replacement identity or activating a pipeline

#### Scenario: Audit or research is requested
- **WHEN** the operator selects audit or research
- **THEN** the current coordinator applies that method and chooses useful specialist work while preserving workspace, language and voice preferences

### Requirement: Preserve useful collaboration context
Team Harness SHALL preserve voice guidance, language and English-learning preferences, workspace/Obsidian configuration, specialist coordination and recoverable workflow methods. Session discovery, traces, notifications and precompact context SHALL remain available independently of retired execution guards. Native runtime permissions SHALL govern execution; TH SHALL NOT weaken or replace the operator's configured policy.

#### Scenario: Configured workspace and language
- **WHEN** session settings select Spanish, English learning and an Obsidian workspace
- **THEN** all three preferences remain in the session context alongside workflow discovery
- **AND** the managed voice guidance and workflow skills remain distributed

#### Scenario: Permission hooks have been retired
- **WHEN** a session uses the updated distribution
- **THEN** useful context and observation continue without a TH allow, ask or deny interceptor

### Requirement: Retire style distribution
Team Harness SHALL stop shipping, recommending and copying the developer-mode output style during setup and update. Native Codex and OpenCode installation paths SHALL remain supported without adding a parallel hook layer.

#### Scenario: Fresh setup or repeated update
- **WHEN** setup or update runs against the new release
- **THEN** it does not install or recreate the retired output style
- **AND** it continues synchronizing the useful managed guidance

### Requirement: Conservative migration guidance
Setup and update SHALL provide migration guidance for an existing developer-mode selection. The guidance SHALL distinguish known unmodified TH files from custom or unverified styles, preserve unrelated settings and content, and report any unresolved active selection. It SHALL prefer a supported native style switch without claiming that a restart is always required.

#### Scenario: Stock style remains selected
- **WHEN** the active selection resolves to a verified unmodified TH developer-mode style
- **THEN** the procedure switches to the native default using the supported host control or narrowly scoped settings change and verifies the result before removing that stock file

#### Scenario: Customized or ambiguous installation
- **WHEN** a matching style has user modifications, uncertain ownership or a higher-precedence selection that the current operation cannot change
- **THEN** the procedure preserves that content and reports the exact remaining migration action without claiming complete deactivation

### Requirement: Retired enforcement is absent from supported distributions
Setup, update and reload SHALL neither install nor require retired TH permission/process guards, their exclusive launchers or generated outputs. Retiring a disconnected adapter SHALL preserve shared session and workspace consumers. Missing retired hook files SHALL NOT trigger a reinstall, runtime failure or restart request.

#### Scenario: Fresh installation and repeated update
- **WHEN** the supported runtime is installed or updated repeatedly
- **THEN** no retired guard is registered or recreated and retained skills, agents and context remain available

### Requirement: Retirement preserves operator configuration and migration
Retirement SHALL leave native permission settings and unrelated or customized user content unchanged. Cleanup SHALL remove only artifacts whose TH ownership and unchanged content can be established, and report uncertain leftovers without claiming complete removal. Current managed voice/discovery updates and historical ownership migration SHALL remain available after deleting the uncalled legacy Claude helper.

#### Scenario: A legacy installation contains custom content
- **WHEN** an old TH path contains modified or unattributed content
- **THEN** update preserves it, explains the remaining action and does not change native permissions to compensate for retired hooks

### Requirement: Local handoff reuses clear task authorization
The save-session skill SHALL preserve what worked, what must not be retried and the next step in the configured workspace. An explicit request to save that handoff with an unambiguous destination SHALL authorize the scoped local write without a second confirmation ceremony. Ambiguous destinations or overwriting unrelated content SHALL require clarification; no external publication or native permission bypass is implied.

#### Scenario: Save is explicitly requested
- **WHEN** the operator asks to save the current session and its workspace is known
- **THEN** the coordinator derives the useful handoff, saves it through native permissions and reports its location

#### Scenario: Several workspaces could be the target
- **WHEN** the request does not establish which workspace should receive the handoff
- **THEN** the coordinator asks for that missing destination before writing
