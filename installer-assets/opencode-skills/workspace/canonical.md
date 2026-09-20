
# Workspace

Give the effort one place for useful working context. Main uses this skill when
starting or continuing substantive work, including research, implementation,
reviews and artifact creation. Other flows delegate workspace decisions here;
they retain their own output formats and authority. No explicit invocation is
needed. Prefer reusing an existing workspace even for a small follow-up.

Brief conversation needs no empty directory or note. Read-only status, preview
and report-only `resume-session` may resolve and read a workspace but do not create or
update one. A specialist receives the selected absolute workspace from Main and
uses only the artifacts and write scope assigned to it.

## Select the effort's home

1. Reuse the workspace already bound to the effort in the conversation, plan,
   handoff or pipeline identity. Check its source/repository association before
   using it. A different checkout name, date or configuration does not move an
   existing effort. An explicit relocation request is a separate scoped action.
2. Without that binding, honor an explicit workspace destination or read only the active
   runtime's relevant `logs-mode`, `logs-path` and `logs-subfolder` preferences.
   Claude Code uses its TH settings; Codex and OpenCode use their native TH
   settings, including configured scope overrides. Do not read another host's
   configuration or print a complete config containing unrelated credentials.
3. Look for an existing effort in that configured location using its task/change
   identity and source links. For Git worktrees, identify the owning project from
   Git's worktree/common-directory information rather than treating the checkout
   basename as a new project. Keep the current code checkout unchanged. If several
   plausible efforts remain, ask which one; do not choose the newest directory.
4. For genuinely new work, choose a descriptive task slug and retain its creation
   date. Use the configured Obsidian location or the project's local `workspaces/`
   directory. Work without a repository uses its established working/output
   directory or explicit workspace destination; it does not need Git initialization.
   If no destination can be established, ask only for that missing choice.

Every flow respects the selected local/Obsidian mode. Workspace paths such as
`workspaces/{feature}/` in flow instructions are templates for this absolute home,
not an instruction to create a repository-local copy. A requested artifact output
location does not change the workspace mode. Before writing, resolve existing
parent directories to their physical targets; if a symlink/junction redirects
outside the selected home, surface that destination conflict rather than silently
writing there. This location check does not replace native access controls.

Use the existing read-only [workspace identity helper](../pipeline/scripts/workspace-identity.mjs)
for repository-backed layouts. It is an imported library, not a command that
discovers settings or repository identity for you. Supply verified project
bindings and preferences; reuse a persisted pipeline identity unchanged. Keep
existing pipeline discovery, service bindings and authority in that flow.
Direct/spec work may reuse its path calculation without writing pipeline state.
For projectless work, use `<working-directory>/workspaces/<date>_<task>` locally
or `<logs-path>/<logs-subfolder>/<project-name>/<date>_<task>` in Obsidian; derive
the project name from the established work context, not an unrelated shell cwd.

For a saved handoff, [resume-session](../resume-session/SKILL.md) uses its existing
read-only lookup after this skill has established the correct base and effort.
Neither that lookup nor pipeline discovery finds arbitrary unbound work across
the filesystem. Report missing or ambiguous context honestly.

## Keep context useful

Create only artifacts the task needs. Record the workspace's absolute location,
project/source association (Git common directory for repository work, established
working directory otherwise), objective, important decisions, progress, evidence
links and next step in the flow's existing plan, report or handoff as applicable.
For a task without such a note, a short handoff is enough when continuity matters;
use [save-session](../save-session/SKILL.md). No parallel index, fixed folder tree,
new identity schema or event log is required for ordinary work.

Refresh context when decisions or progress materially change and at handoff or
completion, not after every tool call. Link to canonical OpenSpec in its owning
repository rather than duplicating requirements or tasks in workspace notes.
Keep scratch files and execution evidence outside tracked product files; retain
reusable product code, tests and documentation in their normal repository homes.
Honor an explicit output destination: a deliverable may live elsewhere while its
workspace note links to it. Obsidian mode does not create a second local copy.
Helpers that own isolated operational runs, such as PR-review capture/worktrees,
retain those locations and cleanup contracts. Link useful results from the effort's
workspace rather than moving or duplicating their protected artifacts.

Selecting a workspace does not activate a pipeline, approve work, require another
agent or contact Context Harness/Memory MCP. Native permissions govern access.
On an actual refusal, explain the unavailable path and continue independent work;
do not widen permissions, silently relocate or create a competing fallback copy.
Preserve existing notes and unrelated work. Cleanup or migration follows the
user's requested scope, not directory age or successful task completion.
