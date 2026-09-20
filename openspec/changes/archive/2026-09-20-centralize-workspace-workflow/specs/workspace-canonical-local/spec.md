## ADDED Requirements

### Requirement: Workflows share a discoverable workspace method
TH SHALL provide an automatically discoverable `workspace` skill for Claude Code,
Codex and OpenCode. General-agent guidance and workflow entrypoints SHALL route
workspace selection and continuity to that skill instead of prescribing competing
methods. Substantive work SHOULD reuse or create a workspace, including direct
work outside a pipeline. Brief conversation and read-only utilities SHALL NOT
create directories or artifacts solely to satisfy this preference.

#### Scenario: Direct work needs retained context
- **WHEN** a direct task produces decisions, investigation, implementation or artifacts worth retaining
- **THEN** Main uses the shared workspace method without requiring explicit invocation or activating a pipeline

#### Scenario: A read-only flow reports status
- **WHEN** a status or report-only resume flow reads an existing effort
- **THEN** it may resolve the workspace but creates no missing workspace, state or artifacts

#### Scenario: Flows respect the configured workspace mode
- **WHEN** work moves between development, research, diagrams, testing, review or delivery in local or Obsidian mode
- **THEN** every flow uses the selected workspace, passes its absolute path to specialists, and treats example paths as relative to that home; a separate artifact destination does not change the workspace mode

### Requirement: Workspace reuse preserves the effort across checkouts
The shared method SHALL prioritize the existing effort's bound absolute workspace
and canonical source identity over the current directory's name, the current date
or changed preferences. Without a binding, it SHALL use explicit operator input
and the active runtime's workspace preferences. Multiple plausible matches SHALL
be surfaced rather than resolved by modification time. Work without a repository
SHALL use its designated working/output directory and SHALL NOT require Git.

#### Scenario: Continuing from a differently named worktree
- **WHEN** a handoff or plan binds the effort to an existing Obsidian workspace and the checkout changes
- **THEN** the next workflow reuses that exact workspace without creating a local or newly dated copy

#### Scenario: A saved handoff is discovered by feature name
- **WHEN** a later session discovers a saved handoff
- **THEN** it checks the recorded absolute workspace and canonical source association before using the context, and resolves missing or conflicting associations without guessing from the checkout basename

#### Scenario: Artifact work has no repository
- **WHEN** the user requests an artifact in an established non-repository working directory
- **THEN** the workspace method uses that context without requiring repository initialization

### Requirement: Retained context supports the selected flow without another harness
The workspace skill SHALL preserve the existing flow's artifact ownership and
write scope. It SHALL retain only useful objective, decisions, source links,
progress, evidence and next action in that flow's existing notes or handoff, without
requiring a parallel index, schema, event log, remote memory or session service.
OpenSpec sources SHALL remain in their owning repository. Pipeline authority and
identity SHALL remain with its existing helpers and contracts. Native permissions
SHALL govern access, with no automatic migration or fallback copy on refusal.

#### Scenario: Spec and pipeline use the same workspace method
- **WHEN** spec or an explicitly active pipeline resolves its workspace
- **THEN** each preserves its own artifacts and authority, and merely selecting a workspace creates no pipeline state or gate

#### Scenario: Context Harness is absent
- **WHEN** a task selects and maintains its workspace without Context Harness or Memory MCP
- **THEN** the workspace skill completes using native filesystem operations and existing context, without requesting remote installation or emitting telemetry
