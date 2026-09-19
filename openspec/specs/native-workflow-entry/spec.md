# native-workflow-entry Specification

## Purpose
Let the native general agent discover and use Team Harness workflows while retaining native coding behavior and the operator's configured collaboration preferences.

## Requirements

### Requirement: Workflow discovery without role replacement
Team Harness startup context and its managed general-agent guide SHALL describe available workflows without imposing a replacement identity, loading an orchestrator contract unconditionally or requiring a developer-mode banner. They SHALL identify spec, pipeline, review-pr and create-pr and direct the agent to the selected current skill.

#### Scenario: Ordinary session starts
- **WHEN** a Claude session starts with or without Team Harness settings
- **THEN** the general agent receives workflow discovery without becoming `th:orchestrator` or activating a pipeline

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
