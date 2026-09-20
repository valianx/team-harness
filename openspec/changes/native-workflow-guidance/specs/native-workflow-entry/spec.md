## MODIFIED Requirements

### Requirement: Workflow discovery without role replacement
Team Harness startup context and managed guidance SHALL describe available workflows without replacing the native general agent or activating a pipeline implicitly. Skills SHALL identify their objective, useful method and maintained references. The current general agent SHALL coordinate selected audit, research and GCP workflows and delegate bounded work when useful rather than invoking a nested orchestrator merely to route the request. Spec, pipeline, review-pr and create-pr SHALL remain discoverable. Supported installations SHALL make this guidance available through native instruction discovery without requiring a TH default-agent selection.

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
- **THEN** the agent can discover the four main TH workflows and the configured collaboration guidance without selecting TH-orchestrator

### Requirement: Preserve useful collaboration context
Team Harness SHALL preserve voice guidance, language and English-learning preferences, workspace/Obsidian configuration, specialist coordination and recoverable workflow methods. Session discovery, traces, notifications and precompact context SHALL remain available independently of retired execution guards. Native runtime permissions SHALL govern execution; TH SHALL NOT weaken or replace the operator's configured policy. A workflow requiring an external workspace SHALL use the active runtime's access mechanism without provisioning settings belonging to another runtime.

#### Scenario: Configured workspace and language
- **WHEN** session settings select Spanish, English learning and an Obsidian workspace
- **THEN** all three preferences remain in the session context alongside workflow discovery
- **AND** the managed voice guidance and workflow skills remain distributed

#### Scenario: Permission hooks have been retired
- **WHEN** a session uses the updated distribution
- **THEN** useful context and observation continue without a TH allow, ask or deny interceptor

#### Scenario: Codex uses an external workspace
- **WHEN** a Codex pipeline uses a configured Obsidian or other external workspace
- **THEN** the coordinator uses Codex's native access boundary, preserves the workspace identity, and neither reads nor modifies Claude permission settings
- **AND** an actual access denial is reported as that native limitation without inventing another permission system

### Requirement: Inline review uses observable native role evidence
Inline review SHALL use the selected installed reviewer definition and native read-only dispatch. TH SHALL NOT require a session marker or proof of loaded profile bytes that the host does not expose. The coordinator SHALL verify the installed managed definition, keep immutable target and coverage checks, and state any activation visibility limit without claiming in-memory attestation. An unavailable native read-only role or invalid selected definition SHALL remain unavailable. A restart SHALL be proposed only for an independently demonstrated activation need. Every inline-review entry point, including Codex init, SHALL use the same evidence boundary.

#### Scenario: Native reviewer is available but loaded bytes are not observable
- **WHEN** the installed managed definition is verified and the host provides the native read-only reviewer role without loaded-byte attestation
- **THEN** the review proceeds with that visibility limit reported and no added session-marker or restart requirement

#### Scenario: Selected definition or native boundary is unavailable
- **WHEN** the installed definition is untrusted or the host cannot supply the required native read-only role
- **THEN** the coordinator reports the missing prerequisite without substituting a writable reviewer or claiming review success

#### Scenario: Review starts through Codex init
- **WHEN** an inline review enters through init with a verified installed definition and native read-only dispatch
- **THEN** it follows the same prerequisites as the shared review contract without requesting profile_session or unavailable loaded-byte proof

## ADDED Requirements

### Requirement: Installation preserves native agent selection and unrelated instructions
OpenCode installation and update SHALL preserve an absent default-agent setting and every existing operator selection, including an ambiguous legacy TH-orchestrator selection. A different default agent SHALL NOT be treated as installation drift. TH instruction registration SHALL be idempotent and preserve unrelated instruction entries and settings. Uninstall SHALL remove only its own instruction association and SHALL preserve unrelated agent choices; it SHALL clear a TH agent selection only when removing that owned agent to avoid a dangling selection.

#### Scenario: Fresh installation or custom agent
- **WHEN** installation runs with no default-agent key, or with a native/custom agent selected
- **THEN** that absence or selection remains unchanged and the TH guide is registered once without changing native permissions

#### Scenario: Repeated update with existing TH selection
- **WHEN** update runs repeatedly with TH-orchestrator already selected and unrelated instructions present
- **THEN** it preserves that selection and the unrelated instructions, does not duplicate its guide, and does not infer whether the legacy selection was intentional

#### Scenario: Uninstall after a later user selection
- **WHEN** TH is uninstalled after the operator selects another agent or adds other instructions
- **THEN** those choices remain and only TH-owned instruction associations are removed

#### Scenario: Selected TH agent is uninstalled
- **WHEN** uninstall removes the owned TH agent currently selected as default
- **THEN** it clears that obsolete selection while preserving all unrelated settings
