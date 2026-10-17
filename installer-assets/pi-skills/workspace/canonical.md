
# Workspace

Give the effort one place for useful working context. Main uses this skill when
starting or continuing substantive work, including research, implementation,
reviews and artifact creation. Other flows delegate workspace decisions here;
they retain their artifact ownership and native coordination. No explicit invocation is
needed. Prefer reusing an existing workspace even for a small follow-up.

Brief conversation needs no empty directory or note. Read-only status, preview
and report-only `resume-session` may resolve and read a workspace but do not create or
update one. Main gives specialists the context locator, source checkout and any
needed absolute operational directory separately. Specialists use their assigned
scope and return useful context for Main to retain; connector availability grants
no additional write authority.

## Select the effort's home

1. Reuse the effort's bound file identity or native Page locator before consulting
   new defaults, including invalid defaults. Verify its source association. A new
   checkout name, date, host path or preference does not move an existing effort.
   Unverifiable bindings remain explicit; they do not authorize another home.
2. Without a binding, honor an explicit destination or read only relevant settings
   from the active runtime, including its scope overrides. Resolve `workspace-mode`
   by own-key presence: `local | obsidian | gpt-space`. A present invalid canonical
   value is invalid even beside valid `logs-mode`. Only an absent canonical key
   permits legacy `local | obsidian`; only absence of both defaults to local.
   Diagnose conflicting selectors once without repairing configuration. Do not
   read another host's settings or print unrelated credentials.
3. Discover an existing effort through retained IDs or complete candidate reads
   with verified task and source association. Git common-directory information
   helps identify a file checkout; a checkout basename, Page title or newest
   modification time does not establish portable project identity. Multiple
   plausible candidates or incomplete provenance stop mutation.
4. For new work, retain a descriptive slug and creation date. File modes use their
   existing layout below. For `gpt-space`, follow [native Space](references/native-space.md)
   to verify the configured Space and its exact `workspace` container, then reuse
   or create the source-bound effort beneath that Page. General documentation
   stays outside this branch. Read-only flows create neither container nor effort.

Every flow respects the selected context mode. Workspace paths such as
`workspaces/{feature}/` in flow instructions are templates for this absolute home,
not an instruction to create a repository-local copy. In remote mode they name
logical content in the effort, not a filesystem path. A requested artifact output
location does not change context mode. File-only tools receive a separately
declared absolute operational directory, never a Page ID or URL. Reject relative
paths and filesystem roots. Before file writes, verify real directory containment
and physical parent targets; surface redirected destinations as conflicts. Native
access controls remain authoritative.

Use [workspace-context.mjs](scripts/workspace-context.mjs) for selector and binding
validation. Binding results are `ready`, `invalid` or `pending`; a remote binding keeps
Space, container and effort IDs, URL, source associations, date and slug separate
from `operational_directory`. These pure helpers neither discover credentials nor
perform native operations. File bindings adapt the existing read-only
[workspace identity helper](../pipeline/scripts/workspace-identity.mjs) without
changing v1 identities or formulas. Supply verified inputs and reuse persisted
identities unchanged. Direct/spec work can reuse file path calculation without
writing pipeline state.
For projectless work, use `<working-directory>/workspaces/<date>_<task>` locally
or `<logs-path>/<logs-subfolder>/<project-name>/<date>_<task>` in Obsidian; derive
the project name from established work context. Remote projectless work uses its
established project association and requires no Git initialization. Remote
initiatives may span non-sibling repositories and hosts. Retain portable verified
source identity separately from host paths, remove credentials from origin
evidence and require verified alias/association evidence for a changed identity.
Evidence-only sources do not become owners or redefine the effort.

For a saved handoff, [resume-session](../resume-session/SKILL.md) uses the same
binding and its file lookup or logical Page reference. Neither lookup nor pipeline
discovery finds arbitrary unbound efforts. Missing native tools, access loss,
offline state or moved/deleted/renamed Pages preserve the locator and pending
operation. Independent authorized work may continue when it needs no unavailable
context. Do not create a replacement Page or local context home.

## Keep context useful

Write context notes as Markdown (`.md`) in the selected file workspace in local
and Obsidian mode: plans, research, decisions, review summaries and handoffs.
Use headings and links that help the task; the common format requires no universal
template, extra frontmatter or Obsidian-specific syntax. Preserve fields or anchors
that existing readers need. In remote mode Main retains useful context in the
same effort Page during work, at milestones and at handoff using native guarded
edits and readback. There is no second Markdown context home or routine local
report mirror. Use [native Space](references/native-space.md) for receipt and
reconciliation decisions.

Machine state, JSON, builds, render sources, immutable review captures and other
operational files keep their required formats in declared file storage. Code,
canonical OpenSpec, maintained tests and deliverables keep their own locations.
Link useful evidence from the effort. A bare local path is not a portable remote
attachment; an unsupported upload remains pending.

Create only artifacts the task needs. For substantive artifact work, establish
principal output grouping, annex treatment, format/destination and requested
access in the existing context at intake; preserve them through delivery.

Record the absolute file location or exact remote locator, verified portable
project/source association and relevant host mappings, objective, decisions,
progress, evidence links and next step in the flow's existing plan or handoff.
For a task without such a note, a short handoff is enough when continuity matters;
use [save-session](../save-session/SKILL.md). No parallel index, fixed folder tree,
new identity file or event log is required for ordinary work.

Refresh context when decisions or progress materially change and at handoff or
completion, not after every tool call. Link to canonical OpenSpec in its owning
repository rather than duplicating requirements or tasks in workspace notes.
In every repository using TH, keep working plans, reports, execution evidence,
logs and scratch scripts out of commits and PRs. Use the selected workspace or
temporary storage and the repository's ignore conventions; local provider installs
can use Git's local excludes. Include a file only when it has a necessary durable
role, such as product code, maintained tests/tooling, canonical OpenSpec or project
documentation. Judge that role from its purpose, not its extension or generator.
Preserve unrelated tracked files; this guidance does not authorize deleting or
untracking them. PR preparation uses [create-pr](../create-pr/SKILL.md) to inspect
the candidate and explain any necessary retained artifact.
Honor an explicit output destination: a deliverable may live elsewhere while its
workspace note links to it. Obsidian mode does not create a second local copy.
Helpers that own isolated operational runs, such as PR-review capture/worktrees,
retain those locations and cleanup contracts. Link useful results from the effort's
workspace rather than moving or duplicating their protected artifacts.

Selecting a workspace does not activate a pipeline, approve work, require another
agent or contact Context Harness/Memory MCP. Native permissions govern access.
On an actual refusal, explain the unavailable operation and continue independent work;
do not widen permissions, silently relocate or create a competing fallback copy.
Preserve existing notes and unrelated work. Cleanup or migration follows the
user's requested scope, not directory age or successful task completion.
