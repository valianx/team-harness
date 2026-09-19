## MODIFIED Requirements

### Requirement: Preserve useful collaboration context
Team Harness SHALL preserve voice guidance, language and English-learning preferences, workspace/Obsidian configuration, specialist coordination and recoverable workflow methods. Session discovery, traces, notifications and precompact context SHALL remain available independently of retired execution guards. Native runtime permissions SHALL govern execution; TH SHALL NOT weaken or replace the operator's configured policy.

#### Scenario: Configured workspace and language
- **WHEN** session settings select Spanish, English learning and an Obsidian workspace
- **THEN** all three preferences remain in the session context alongside workflow discovery
- **AND** the managed voice guidance and workflow skills remain distributed

#### Scenario: Permission hooks have been retired
- **WHEN** a session uses the updated distribution
- **THEN** useful context and observation continue without a TH allow, ask or deny interceptor

## ADDED Requirements

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
