# workspace-canonical-local Specification

## Purpose
Work has one configured local or Obsidian home for useful context and continuity.
The shared workspace skill serves direct and specialized flows; an active pipeline
retains its existing persisted identity and authority in that selected home.

## Requirements

### Requirement: A pipeline has one canonical persisted workspace identity
Team Harness SHALL resolve a workspace identity once before the first state write and SHALL persist its absolute coordinator root, mode, repository base, date, and initiative or feature slug. In Obsidian mode a confirmed multi-repository initiative SHALL use `{logs-path}/{logs-subfolder}/{repo_base}/{YYYY-MM-DD}_{initiative}` as its coordinator root, with each participating service below that root. Activation, recovery, trace, pipeline listing, gates, and specialist dispatch MUST consume the persisted identity or the same shared resolver and MUST NOT compose an alternative path locally.

#### Scenario: Obsidian multi-repository initiative is activated
- **WHEN** the operator confirms an initiative containing multiple distinct repositories under Obsidian mode
- **THEN** Team Harness creates one coordinator root at `{logs-path}/{logs-subfolder}/{repo_base}/{YYYY-MM-DD}_{initiative}` and places each service workspace below it

#### Scenario: A downstream skill needs the initiative workspace
- **WHEN** trace, recovery, pipeline listing, or another workflow resolves an existing initiative
- **THEN** it confirms the persisted workspace identity and uses that exact root rather than deriving a repo-local, undated, or differently nested path

#### Scenario: Two matching dated initiative directories exist
- **WHEN** identity discovery finds more than one candidate matching the initiative slug
- **THEN** it selects only a unique candidate whose persisted repository identities match, otherwise it stops with an ambiguity report before reading or writing pipeline state

### Requirement: Workspace formulas are canonical for every pipeline shape
Team Harness SHALL define the complete local and Obsidian workspace formulas in one canonical contract and SHALL project them to every consuming skill and agent. Single-repository runs and multi-repository initiatives MUST include the run date in their workspace identity; initiative roots MUST use the common `repo_base` rather than treating any participating repository as the coordinator repository.

#### Scenario: Skills are generated or linted
- **WHEN** workspace-related canonical inputs or projections are validated
- **THEN** generation or lint fails if a consumer embeds a conflicting path formula or omits the date or initiative repository base required by the canonical resolver

#### Scenario: A reference repository supplies evidence only
- **WHEN** an initiative reads a repository that is not a participating writable service
- **THEN** that repository may be recorded as evidence but does not influence `repo_base`, become the coordinator root, or receive a service workspace

### Requirement: Recovery preserves the original workspace identity
Recovery SHALL read the persisted coordinator identity and repository bindings from the existing workspace. A restart, current working directory change, repository rename, or configuration change MUST NOT migrate or split an active initiative; an unreadable required coordinator workspace MUST fail closed.

#### Scenario: Recovery starts from a participating service repository
- **WHEN** recovery is invoked from any bound service after a restart
- **THEN** it resolves the same coordinator root by persisted initiative and repository identity and resumes without creating a second dated workspace

#### Scenario: Required coordinator state is unreadable
- **WHEN** the persisted state or coordinator root cannot actually be read or its identity cannot be verified
- **THEN** recovery stops before dispatch or gate release and reports the required unreadable artifact

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
- **WHEN** a status or resume flow reads an existing effort
- **THEN** it may resolve the workspace but creates no missing workspace, state or artifacts

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
