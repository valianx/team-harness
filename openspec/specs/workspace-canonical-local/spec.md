# workspace-canonical-local Specification

## Purpose
Pipeline coordination state has one canonical home — the repository — on every runtime. Obsidian becomes a one-way, non-authoritative export instead of a live external dependency of the state machine.

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
