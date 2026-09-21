# workspace-canonical-local Specification

## Purpose
Work has one configured local or Obsidian home for useful context and continuity.
The shared workspace skill serves direct and specialized flows; an active pipeline
retains its existing identity and useful context in that selected home.

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
The workspace skill SHALL preserve assigned artifact ownership and retain useful
objective, decisions, links, progress, evidence and next action in existing notes.
Context notes SHALL use Markdown in local and Obsidian mode without a universal
template or parallel index. Operational artifacts and deliverables keep their
useful formats; OpenSpec remains in its repository. Native permissions govern
access. Current pipeline coordination MUST NOT require a legacy control journal,
remote memory, session service or migration on refusal.

#### Scenario: Spec and pipeline share workspace context
- **WHEN** either workflow resolves an existing effort
- **THEN** it reuses the absolute home and context without adding authorization records.

#### Scenario: Spec and pipeline use the same workspace method
- **WHEN** spec or an explicitly active pipeline resolves its workspace
- **THEN** both reuse the selected artifacts and native coordination without new pipeline permission records.

#### Scenario: Context Harness is absent
- **WHEN** a task selects and maintains its workspace without Context Harness or Memory MCP
- **THEN** the workspace skill completes using native filesystem operations and existing context, without requesting remote installation or emitting telemetry

#### Scenario: Different flows write context notes
- **WHEN** development, research, review or handoff work retains contextual notes in either workspace mode
- **THEN** it writes useful Markdown notes without requiring a universal template, links operational artifacts and deliverables in their original formats, and preserves fields read by existing consumers

### Requirement: Sketches support requested design review across workflows
TH SHALL expose on-demand sketches in Claude Code, Codex and OpenCode for direct,
spec and pipeline work. Useful text sketches use Markdown and HTML UI previews
remain available. Main SHALL link agreed sketches to canonical intent and consult
them when implementing or validating the affected surface. Sketches MUST NOT add
an automatic gate or require a complete unrelated sketch set.

#### Scenario: A frontend preview helps
- **WHEN** the user requests a preview during spec or pipeline work
- **THEN** Main creates the relevant sketch in the same selected workspace and incorporates agreed decisions without a second approval ceremony.

#### Scenario: The user requests a preview during spec work
- **WHEN** the user asks to see the proposed interface, contract or interaction before implementation
- **THEN** Main creates or reuses the relevant sketch in the same local or Obsidian workspace and presents it through the existing spec discussion, without a second gate or pipeline state

#### Scenario: Direct work needs only a wireframe
- **WHEN** the user requests a standalone UI sketch without a pipeline
- **THEN** Main can provide a low-fidelity HTML wireframe linked from Markdown context without generating unrelated sketches or approving product implementation

### Requirement: Workflow context uses explicit workspace identity
All substantive TH flows MUST reuse the workspace selected by the workspace skill in local or Obsidian mode. Observational hooks MUST use an explicit workspace binding and MUST NOT select an unrelated workspace by modification time. Markdown is the default retained context format; specialized deliverables keep their appropriate formats. Remote memory and telemetry MUST remain optional.

#### Scenario: Ambiguous workspace history
- **WHEN** multiple workspaces exist and a hook has no explicit task binding
- **THEN** it skips its optional write instead of guessing from the newest directory.

#### Scenario: Portable retained context
- **WHEN** a native host runs research, docs, learning or implementation with an Obsidian workspace selected
- **THEN** the flow and specialists reuse that absolute home without requiring a Claude configuration or Memory MCP.

### Requirement: Working artifacts stay outside consumer commits
Across repositories using TH, the shared workspace and PR preparation workflows
SHALL keep task plans, execution reports, evidence, logs and scratch scripts out
of commits and PRs. They SHALL use the selected workspace or permitted temporary
storage and suitable ignore conventions. A necessary durable project artifact
SHALL remain eligible for inclusion with its role explained, including canonical
OpenSpec, maintained tests/tooling, product assets and documentation. File format
or generation alone SHALL NOT decide retention, and this guidance SHALL NOT
delete or untrack unrelated existing work.

#### Scenario: Consumer prepares a PR after a spec or pipeline run
- **WHEN** a consumer repository has working reports, scratch scripts and local provider assets produced during the task
- **THEN** TH inspects the candidate and keeps those task-only files outside the commit and PR in both local and Obsidian mode

#### Scenario: A generated artifact is part of the delivered product
- **WHEN** a generated file, test fixture or Markdown document has a necessary maintained project role
- **THEN** TH may include it with that role explained instead of excluding it merely because it was generated during the task

#### Scenario: Existing tracked files are unrelated
- **WHEN** artifact preparation discovers previously tracked work outside the requested change
- **THEN** TH preserves it and limits candidate cleanup to the authorized change
