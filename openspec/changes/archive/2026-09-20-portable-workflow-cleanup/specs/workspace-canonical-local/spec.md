## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Workflow context uses explicit workspace identity
All substantive TH flows MUST reuse the workspace selected by the workspace skill in local or Obsidian mode. Observational hooks MUST use an explicit workspace binding and MUST NOT select an unrelated workspace by modification time. Markdown is the default retained context format; specialized deliverables keep their appropriate formats. Remote memory and telemetry MUST remain optional.

#### Scenario: Ambiguous workspace history
- **WHEN** multiple workspaces exist and a hook has no explicit task binding
- **THEN** it skips its optional write instead of guessing from the newest directory.

#### Scenario: Portable retained context
- **WHEN** a native host runs research, docs, learning or implementation with an Obsidian workspace selected
- **THEN** the flow and specialists reuse that absolute home without requiring a Claude configuration or Memory MCP.
