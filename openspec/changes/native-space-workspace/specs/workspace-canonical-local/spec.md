## MODIFIED Requirements

### Requirement: Workflows share a discoverable workspace method
TH SHALL provide an automatically discoverable `workspace` skill for Claude Code,
Codex and OpenCode. General-agent guidance and workflow entrypoints SHALL route
workspace selection and continuity to that skill instead of prescribing competing
methods. Substantive work SHOULD reuse or create a workspace, including direct
work outside a pipeline. Brief conversation and read-only utilities SHALL NOT
create directories or artifacts solely to satisfy this preference.

The method SHALL resolve `workspace-mode: local | obsidian | gpt-space` by own-key
presence. A present canonical key SHALL be authoritative even when its value is
null, invalid or the wrong type; it SHALL NOT fall back to `logs-mode`. With no
canonical key, only valid legacy `local` or `obsidian` selection SHALL be accepted;
invalid legacy selection SHALL report invalid. With neither key, selection SHALL
default to local. Conflicting keys SHALL produce one diagnosis without read-time
repair. Existing effort binding SHALL take precedence over new defaults.

Explicit setup SHALL write matching canonical and legacy selectors for local or
Obsidian. Remote setup SHALL write the canonical selector and verified destination
IDs and remove the stale legacy selector, which cannot represent remote mode.
Ensure, reapply, update and semantic import SHALL preserve existing preference
representation, destination and conflicts; they SHALL seed local only when both
selectors are absent. Imports SHALL treat selector aliases and mode-specific
destination as one preference group and report cross-name conflicts without
shadowing a native selection or importing an incompatible destination.

#### Scenario: Direct work needs retained context
- **WHEN** a direct task produces decisions, investigation, implementation or artifacts worth retaining
- **THEN** Main uses the shared workspace method without requiring explicit invocation or activating a pipeline

#### Scenario: A read-only flow reports status
- **WHEN** a status or report-only resume flow reads an existing effort
- **THEN** it may resolve the workspace but creates no missing workspace, state or artifacts

#### Scenario: Flows respect the configured workspace mode
- **WHEN** work moves between development, research, diagrams, testing, review or delivery in local or Obsidian mode
- **THEN** every flow uses the selected workspace, passes its absolute path to specialists, and treats example paths as relative to that home; a separate artifact destination does not change the workspace mode

#### Scenario: Invalid canonical selection has a valid legacy alias
- **WHEN** `workspace-mode` is present with null, a list, object, boolean or unknown string and `logs-mode` is valid
- **THEN** selection reports invalid once, preserves the configuration bytes and does not use the alias or local default

#### Scenario: Canonical selection is absent
- **WHEN** only a legacy selector exists or both selectors are absent
- **THEN** valid legacy local or Obsidian is preserved, invalid legacy selection reports invalid, and only absence of both keys defaults to local

#### Scenario: Selector values conflict
- **WHEN** canonical and legacy keys disagree, including canonical remote beside legacy local
- **THEN** the canonical key determines selection, one conflict is reported and ordinary reads do not rewrite either key

#### Scenario: Setup explicitly changes the preference
- **WHEN** authorized setup selects local, Obsidian or a verified remote destination
- **THEN** it writes matching selectors for file modes or canonical remote plus verified IDs without a legacy selector, preserving unrelated settings

#### Scenario: Maintenance encounters legacy Obsidian or canonical-only remote
- **WHEN** import, ensure, update or installer reapply encounters legacy-only Obsidian, canonical-only remote, incomplete destination data or conflicting selectors
- **THEN** it preserves that representation and destination, diagnoses invalid or conflicting state, and neither shadows Obsidian nor inserts legacy local beside remote

#### Scenario: Import aliases describe an incompatible preference
- **WHEN** native settings already select a mode or destination and imported settings use another selector name or remote IDs
- **THEN** semantic import preserves the native preference group and reports the cross-name conflict rather than merging an incompatible destination

### Requirement: A pipeline has one canonical persisted workspace identity
Team Harness SHALL resolve one context binding before the first context write.
File context SHALL retain its existing absolute coordinator root, mode, repository
base, date and initiative or feature slug. In Obsidian mode a confirmed
multi-repository initiative SHALL use
`{logs-path}/{logs-subfolder}/{repo_base}/{YYYY-MM-DD}_{initiative}` as its
coordinator root, with each participating service below that root. Existing v1
file identities SHALL validate and round-trip unchanged.

Remote context SHALL identify a verified Space, `workspace` container Page,
effort Page, canonical URL and source associations separately from optional local
operational storage. Remote IDs and URLs MUST NOT occupy `coordinator_root`,
service workspace, Git-root or filesystem-path arguments. Activation, recovery,
trace, pipeline listing, gates and specialist dispatch MUST consume the bound
identity or the same shared resolver and MUST NOT compose an alternative home.
Current flows SHALL NOT require a new control log or mandatory identity file.

#### Scenario: Obsidian multi-repository initiative is activated
- **WHEN** the operator confirms an initiative containing multiple distinct repositories under Obsidian mode
- **THEN** Team Harness creates one coordinator root at `{logs-path}/{logs-subfolder}/{repo_base}/{YYYY-MM-DD}_{initiative}` and places each service workspace below it

#### Scenario: A downstream skill needs the initiative workspace
- **WHEN** trace, recovery, pipeline listing, or another workflow resolves an existing initiative
- **THEN** it confirms the persisted workspace identity and uses that exact root rather than deriving a repo-local, undated, or differently nested path

#### Scenario: Two matching dated initiative directories exist
- **WHEN** identity discovery finds more than one candidate matching the initiative slug
- **THEN** it selects only a unique candidate whose persisted repository identities match, otherwise it stops with an ambiguity report before reading or writing pipeline state

#### Scenario: An existing file identity is reused
- **WHEN** a valid v1 single-repository or initiative identity is read and serialized
- **THEN** its schema version, formulas and machine identity values remain unchanged

#### Scenario: A native Space effort needs a local tool
- **WHEN** a remote context is bound and an operation needs filesystem output
- **THEN** the operation receives a separate real absolute contained operational directory or remains pending, and no remote identifier is treated as a file root

### Requirement: Workspace formulas are canonical for every pipeline shape
Team Harness SHALL define the complete local and Obsidian workspace formulas in
one canonical contract and SHALL project them to every consuming skill and agent.
Single-repository runs and multi-repository initiatives MUST include the run date
in their file workspace identity; initiative roots MUST use the common `repo_base`
rather than treating any participating repository as the coordinator repository.
Existing file formulas and v1 discovery SHALL remain unchanged: local single-repo
uses `{repo-root}/workspaces/{YYYY-MM-DD}_{feature}`, Obsidian single-repo uses
`{logs-path}/{logs-subfolder}/{repo-name}/{YYYY-MM-DD}_{feature}`, local initiative
uses `{common-repository-parent}/{YYYY-MM-DD}_{initiative}`, and Obsidian initiative
uses `{logs-path}/{logs-subfolder}/{repo_base}/{YYYY-MM-DD}_{initiative}`.

Remote initiatives SHALL bind source-associated repositories to one effort Page
without requiring sibling checkout paths. Executable projections SHALL remain
synchronized; instruction consistency SHALL be reviewed against the contract
rather than claimed through tests that search prose for path formulas.

#### Scenario: Skills are generated or linted
- **WHEN** workspace-related canonical inputs or projections are validated
- **THEN** executable generation checks detect stale generated assets and review identifies conflicting instruction formulas, without treating prose-search tests as behavior evidence

#### Scenario: A reference repository supplies evidence only
- **WHEN** an initiative reads a repository that is not a participating writable service
- **THEN** that repository may be recorded as evidence but does not influence `repo_base`, become the coordinator root, or receive a service workspace

#### Scenario: Remote repositories are not siblings
- **WHEN** an effort spans verified repositories in different filesystem parents or on different hosts
- **THEN** they bind to the same effort Page through source association without deriving a common local context root

#### Scenario: Remote research reads another repository
- **WHEN** a remote effort uses an evidence-only repository
- **THEN** that evidence does not redefine the owning project, writable scope or effort identity

### Requirement: Workspace reuse preserves the effort across checkouts
The shared method SHALL prioritize the existing effort's bound file or Page
identity and verified canonical source association over the current directory's
name, current date, changed preferences or per-host paths. Without a binding, it
SHALL use explicit operator input and the active runtime's workspace preferences.
Discovery SHALL use retained IDs or complete candidate reads with verified
project/source association, never a title or newest modification time alone.
Multiple plausible matches or incomplete provenance SHALL stop mutation and
remain explicit. Portable source identity SHALL be distinct from host path
mappings; changed remote identity SHALL require verified association or alias
evidence and origin evidence SHALL omit credentials.

Work without a repository SHALL use its designated working/output directory or
established projectless Page association and SHALL NOT require Git. Multi-repository
remote efforts SHALL retain all verified associations without a sibling-path rule.

#### Scenario: Continuing from a differently named worktree
- **WHEN** a handoff or plan binds the effort to an existing Obsidian workspace and the checkout changes
- **THEN** the next workflow reuses that exact workspace without creating a local or newly dated copy

#### Scenario: A saved handoff is discovered by feature name
- **WHEN** a later session discovers a saved handoff
- **THEN** it checks the recorded absolute workspace and canonical source association before using the context, and resolves missing or conflicting associations without guessing from the checkout basename

#### Scenario: Artifact work has no repository
- **WHEN** the user requests an artifact in an established non-repository working directory
- **THEN** the workspace method uses that context without requiring repository initialization

#### Scenario: A remote effort resumes after defaults or host paths change
- **WHEN** a retained Page binding and source association remain valid after a new default, checkout name, date or host path mapping
- **THEN** the next workflow reuses the exact effort Page and original creation date without creating another context home

#### Scenario: Discovery returns titles without complete provenance
- **WHEN** candidate reads are incomplete or multiple Pages plausibly match the effort
- **THEN** discovery reports pending or ambiguous identity and performs no mutation based on title or recency

#### Scenario: A projectless or multi-repository remote effort resumes
- **WHEN** its established projectless association or verified participating repository associations are available
- **THEN** discovery reuses the bound effort without requiring Git, sibling paths or a new owner inferred from an evidence-only repository

### Requirement: Recovery preserves the original workspace identity
Recovery SHALL read the existing file coordinator identity and repository
bindings or exact remote locator and source associations. Save, resume, recover,
trace and listing SHALL reuse the same effort. A restart, current working
directory change, repository rename or configuration change MUST NOT migrate or
split an active initiative; an unreadable required coordinator workspace MUST
fail closed. Read-only discovery SHALL create neither container nor effort.
Missing tools, offline state, missing, moved, renamed or deleted Pages and access
loss SHALL preserve the locator and report the pending or unavailable operation
without creating a competing home. Independent authorized work MAY continue
when it does not require the unavailable context.

#### Scenario: Recovery starts from a participating service repository
- **WHEN** recovery is invoked from any bound service after a restart
- **THEN** it resolves the same coordinator root by persisted initiative and repository identity and resumes without creating a second dated workspace

#### Scenario: Required coordinator state is unreadable
- **WHEN** the persisted state or coordinator root cannot actually be read or its identity cannot be verified
- **THEN** recovery stops before dispatch or gate release and reports the required unreadable artifact

#### Scenario: A remote handoff is saved and resumed
- **WHEN** Main saves useful resume fields and a later read-only flow resumes, traces or lists the effort
- **THEN** both use the same verified effort Page without requiring local handoff or state copies and the read-only flow creates no Page

#### Scenario: The remote context becomes unavailable
- **WHEN** native tools are missing, access is denied, the host is offline or the bound container or effort is deleted, moved or renamed
- **THEN** the flow preserves its locator, reports the precise pending or unavailable operation and creates no replacement Page or local home

### Requirement: Retained context supports the selected flow without another harness
The workspace skill SHALL preserve assigned artifact ownership and retain useful
objective, decisions, links, progress, evidence and next action in existing notes.
Context notes SHALL use Markdown in local and Obsidian mode without a universal
template or parallel index. In remote mode Main SHALL maintain that context in
the selected effort Page during work, at milestones and at handoff using native
guarded edits and readback. Operational artifacts and deliverables SHALL keep
their useful formats in declared storage; OpenSpec, product code and maintained
tests SHALL remain in their repositories. Remote mode SHALL NOT create a second
Markdown context home or routine local report mirror. Native permissions govern
access. Current pipeline coordination MUST NOT require a legacy control journal,
remote memory, session service or migration on refusal.

Before creating or writing remote context, Main SHALL verify the configured
Space's actual root Page and the container's exact `workspace` title, stored ID,
real parent and Space membership, then verify the effort's parent and association.
Only a complete authorized discovery with zero matches SHALL permit an authorized
create. Pagination, continuing cursors and incomplete flags SHALL prevent an
absence claim. Tool receipts and readback SHALL govern retries: applied patch
operations and ignored `block_deleted` operations SHALL NOT be replayed; omitted
legacy operation status SHALL mean applied. Unknown creation or edit outcomes
SHALL require reconciliation before another write. Observed created IDs SHALL
survive configuration-persistence failure as partial readiness with a repair
action, without creating a replacement. Text Page creation SHALL NOT be claimed
to have an exactly-once guarantee.

#### Scenario: Spec and pipeline share workspace context
- **WHEN** either workflow resolves an existing effort
- **THEN** it reuses the selected context locator and context without adding authorization records.

#### Scenario: Spec and pipeline use the same workspace method
- **WHEN** spec or an explicitly active pipeline resolves its workspace
- **THEN** both reuse the selected artifacts and native coordination without new pipeline permission records.

#### Scenario: Context Harness is absent
- **WHEN** a task selects and maintains a file workspace without Context Harness or Memory MCP
- **THEN** the workspace skill completes using native filesystem operations and existing context, without requesting remote installation or emitting telemetry

#### Scenario: Different flows write context notes
- **WHEN** development, research, review or handoff work retains contextual notes in local or Obsidian mode
- **THEN** it writes useful Markdown notes without requiring a universal template, links operational artifacts and deliverables in their original formats, and preserves fields read by existing consumers

#### Scenario: A remote effort is active during implementation
- **WHEN** planning, investigation, decisions or milestones produce useful retained context
- **THEN** Main updates the same effort Page during the work and at handoff, reads back the actual content and retains no routine Markdown mirror

#### Scenario: Stored container metadata no longer matches
- **WHEN** the stored Page ID has a different title, parent or Space membership, or the effort is outside that container
- **THEN** Main reports destination conflict or unavailable identity before writing and does not silently replace the stored binding

#### Scenario: A child listing has more pages or incomplete reads
- **WHEN** any listing cursor remains or candidate metadata is incomplete, even when the current page is empty
- **THEN** discovery cannot prove absence and no create is attempted until complete verified discovery permits it

#### Scenario: A patch batch partially commits
- **WHEN** the native receipt distinguishes applied, ignored and rejected operations
- **THEN** retry planning excludes applied and ignored operations, treats omitted legacy status as applied and reconciles any unknown commit status before another guarded write

#### Scenario: A create or edit response is uncertain
- **WHEN** an operation may have committed but its result is unknown
- **THEN** Main reconciles observed IDs, child listings and source provenance before another write and does not compensate by deleting or recreating Pages

#### Scenario: Creation succeeds but ID persistence fails
- **WHEN** a created Page is observed but saving its ID locally fails or is uncertain
- **THEN** setup reports partial readiness with that same observed ID and the persistence repair action, and the continuation reuses it

### Requirement: Workflow context uses explicit workspace identity
All substantive TH flows MUST reuse the workspace selected by the workspace skill
in local, Obsidian or remote mode. Dispatch SHALL carry the context locator,
repository/worktree and optional operational directory as separate coordinates.
Main SHALL persist useful advisory returns; specialist and read-only reviewer
access SHALL NOT acquire remote write authority from connector availability.
File-only consumers SHALL receive real absolute contained directories, never
remote IDs or URLs. An unavailable remote update SHALL remain pending while
independent authorized code or checks MAY continue.

Observational hooks MUST use an explicit operational binding and MUST NOT select
an unrelated workspace by modification time or write remote context. Markdown
remains the default retained context format for file modes; specialized
deliverables keep their appropriate formats. Optional local telemetry SHALL NOT
become the context home. Remote memory and telemetry MUST remain optional.

#### Scenario: Ambiguous workspace history
- **WHEN** multiple workspaces exist and a hook has no explicit task binding
- **THEN** it skips its optional write instead of guessing from the newest directory.

#### Scenario: Portable retained context
- **WHEN** a native host runs research, docs, learning or implementation with an Obsidian workspace selected
- **THEN** the flow and specialists reuse that absolute home without requiring a Claude configuration or Memory MCP.

#### Scenario: A remote task is dispatched
- **WHEN** Main assigns bounded work using a remote context
- **THEN** dispatch distinguishes the verified locator, source checkout and any needed operational directory, and Main persists the returned useful context

#### Scenario: A file-only consumer receives a remote locator
- **WHEN** a remote ID, URL, relative path or filesystem root is offered as an operational directory
- **THEN** validation rejects it before writing and requests a valid scoped file destination without changing the context home

#### Scenario: Context updates are pending while code checks are independent
- **WHEN** native remote capability is unavailable but authorized code work or checks need no remote data
- **THEN** that independent work can continue while the same remote locator and pending update remain explicit

#### Scenario: Optional hook storage is absent
- **WHEN** remote context has no explicit local operational binding
- **THEN** hooks perform no optional filesystem write, create no state file and do not become remote writers
