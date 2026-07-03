---
name: ref-intake-flows
description: Reference file for orchestrator Phase 0a conditional intake sub-flows (milestone continuity, initiative create-or-join, initiative detection + confirm, language/english-learning intent handling, ClickUp conversational intents). Read on-demand by the orchestrator — not a standalone agent.
model: opus
color: cyan
---

# orchestrator — Intake Sub-Flows Reference

This file is read on-demand by the orchestrator during Phase 0a intake. It is NOT part of the orchestrator's system prompt.

**LAZY-LOAD DIRECTIVE — consumers read only the section they need.** Do NOT read this entire file on every invocation. Each section below is triggered by its own condition in `agents/orchestrator.md` Phase 0a (a 1-2 line trigger + pointer replaces the full body at the original site) — locate the top-level section heading for the active trigger and read only that section. Every section heading below is preserved exactly so all `§ "Section Name"` pointers and structural-test anchors continue to resolve.

---

## Milestone Continuity

Triggered from `agents/orchestrator.md` Phase 0a Step 1d, before composing a fresh `docs_root`.

**Milestone-continuity detect-and-continue (multi-milestone `type: plan` builds only).** Before composing a fresh `docs_root`, run this check: if the incoming task is a milestone execution (e.g., "implement M0", "build M2") that belongs to an existing plan, detect the plan workspace by identity and resume the SAME plan workspace instead of creating a new top-level sibling.

Detection algorithm:
1. Extract the plan identity slug from the task description (e.g., "v1-mvp-build" from "implement M0 of v1-mvp-build").
2. Glob `{base_path}/*_{plan-slug}/` (date-agnostic) and confirm by reading `00-state.md` frontmatter (`feature:` == `plan-slug`).
3. On first confirmed match: set `plan_workspace = {matched-path}`; use `plan_workspace` as `docs_root` for this pipeline run. Do NOT create a `{NN}_{milestone-slug}/` sub-folder — milestones are commits within ONE flat workspace, not nested child workspaces.
4. Update the plan's `00-state.md` milestone index (see **Milestone Index** below): replace the row for this milestone in-place (if it exists) or append it (if absent). Never duplicate a row for the same milestone slug.
5. On no confirmed match OR if the task is not a milestone execution: fall through to the standard workspace creation below.

**Milestone Index.** When a milestone build uses the plan workspace as `docs_root`, the plan's `00-state.md` carries a `## Milestone Index` table (one row per milestone, replace-in-place). The orchestrator maintains this table using a read-modify-write protocol identical to the initiative JOIN (read full `00-state.md`, replace the row for this milestone slug, write the whole file back):
```
## Milestone Index
| Milestone | Slug | Status | Commit |
|-----------|------|--------|--------|
| M0 | m0-skeleton | implementing | — |
| M1 | m1-api | pending | — |
```
Status values: `pending` → `implementing` → `complete`. The `Commit` column records the commit sha after each milestone lands on the single feature branch. No per-milestone `PR` column — milestones are commits, not PRs. A single build-level PR is recorded once at the end (when ALL milestones are complete). Replace the row in-place; never append a duplicate row for the same slug.

**Parallelization.** Independent milestone implementations MUST be PARALLELIZED whenever the `01-plan.md` dependency annotations allow, reusing the #285 in-message concurrent-`Task` mechanism at milestone granularity within ONE workspace. Dependent milestones serialize in dependency order. Each parallel lane works in an isolated worktree; at the convergence barrier the orchestrator applies each lane's diff as ONE COMMIT to the single feature branch in dependency order (committed serially, never concurrently). The result is one feature branch, one commit per milestone (in dependency order), ONE PR at the end.

This reuses the #283/#285 identity-keyed-resolution pattern: the plan workspace is the single home; the milestone index in the plan's `00-state.md` tracks per-milestone status and commit shas; stage files (`02-implementation.md`, `03-testing.md`, `04-security.md`, `04-validation.md`) are FLAT, whole-task documents covering the entire build — not split or suffixed per milestone.

---

## Initiative Create-or-Join

Triggered from `agents/orchestrator.md` Phase 0a Step 1f, only when `initiative` is non-null in `00-state.md`.

1f. **CONDITIONAL — Initiative create-or-join (only when `initiative` is non-null in `00-state.md`).** If `initiative == null`, this step is a complete no-op — skip silently. Otherwise:

**Find or create the overview file (date-agnostic JOIN rule):**
- Resolve `overview_path` using the **date-agnostic glob + frontmatter-confirm** rule (an initiative spans multiple days; the folder carries the day-1 date prefix, not today's):
  1. **Locate candidates by date-agnostic glob:**
     - Obsidian: glob `{logs-path}/{logs-subfolder}/{repo_base}/*_{slug}/overview.md` — the `*_` wildcard absorbs any `{YYYY-MM-DD}_` prefix so a day-30 run still matches the day-1 folder.
     - Local: glob `{common-parent-of-sibling-repos}/*_{slug}/overview.md` (the parent directory of the current cwd repo, confirmed at Step 6d-initiative).
  2. **Confirm by frontmatter:** for each candidate, read its `overview.md` frontmatter and confirm `initiative: {slug}` equals the target slug. The frontmatter slug is the authoritative key — it never changes.
  3. **JOIN on first confirmed match** — read-modify-write the existing `overview.md`. **CREATE only if no candidate confirms** — when creating, the new folder carries today's date prefix (`{YYYY-MM-DD}_{slug}`) which becomes the day-1 anchor for all subsequent runs.
- **JOIN**: read the file, find the row for this project slug in `## Projects`. If the row exists, replace it in-place with the current values; if absent, append a new row. Never duplicate a row for the same project. This is idempotent: re-running the same project's pipeline updates its single row rather than accumulating rows.
- **CREATE**: write the full `overview.md` template (see `## overview.md Template` section in `agents/orchestrator.md`) with this project as the first row.

**Write the initial project row** (project, branch-at-Design, status):
```
| {project-slug} | {current-branch or —} | — | — | planning |
```
Branch-at-Design is the current git branch if already on a feature branch, or `—` if still on main/develop (the branch is set by the delivery agent once the PR is opened).

**Read-modify-write protocol:** read the full `overview.md`, edit only this project's row (or append it), update `updated:` in the frontmatter to today's date, and write the whole file back. Never write a partial payload. This is the cross-run join rule: keyed by `project` slug; replace-in-place if the row exists, append if absent.

**Concurrency/idempotency rule:** rows are keyed by `project` slug and are mutually independent — two concurrent runs editing different rows do not logically conflict. Last-writer-wins on the narrative sections (`## Review Summary`, `## Big-Picture Plan`, `## Functional Description`) is acceptable because those sections are descriptive, not a gate.

**Best-effort posture:** if the overview write fails (path unavailable, permission error, file locked), log one WARN line and continue — the per-project pipeline NEVER fails or blocks on an overview-write error. The WARN is the only signal; the operator resolves it manually if needed.

**Obsidian mode:** if the `{YYYY-MM-DD}_{initiative}/` directory does not yet exist, create it before writing `overview.md`. The per-project workspace uses `{logs-path}/{logs-subfolder}/{repo_base}/{YYYY-MM-DD}_{initiative}/{project}/` from Step 2 (no `{date}_{feature}` leaf).

---

## Initiative Detection and Confirm

Triggered from `agents/orchestrator.md` Phase 0a Step 6d-initiative, during Discover, after framing and before the intake survey.

**Step 6d-initiative — Initiative detection + confirm (runs during Discover, after framing, before the intake survey).**

**Purpose:** detect whether this task is part of a multi-project initiative and, only with explicit operator confirmation, set the `initiative` slug that gates the path-resolution branch and the `overview.md` lifecycle.

**Three detection signals** (any one *proposes*; none *auto-creates*; all three require confirmation):

1. **Operator declaration (primary).** The operator explicitly names an initiative in the task — e.g. "this is part of the migration-2026 initiative", "junto con el backend repo". The orchestrator extracts the freeform label, slugifies it to `[a-z0-9-]` max 60 chars (same rule as feature-name), and proposes it.
2. **Existing-initiative-folder inspection (join aid).** At Discover time, inspect for an existing `overview.md` using the date-agnostic glob: obsidian mode → glob `{logs-path}/{logs-subfolder}/{repo_base}/*_{slug}/overview.md` and confirm by `initiative:` frontmatter; local mode → glob `{common-parent-of-cwd-repo}/*_{slug}/overview.md` and confirm by frontmatter. A confirmed match surfaces a candidate to **join** — show the slug and ask the operator.
3. **Sibling-directory inspection (proposal aid only).** If the cwd repo's parent contains sibling repos (directories with their own `.git`), the orchestrator may note this as a *prompt to ask* — never as an automatic trigger. **Generic-root guard:** if the parent directory basename matches any of `projects`, `repos`, `src`, `code`, `dev`, `work`, `git`, `home` (case-insensitive), do NOT propose initiative grouping on directory layout alone — a flat parent is not an initiative signal.

**After any signal fires**, emit a confirmation prompt naming the proposed/joined initiative slug and the resulting overview location:

```
This task appears to be part of initiative "{slug}".
   Overview location: {logs-path}/{logs-subfolder}/{repo_base}/{YYYY-MM-DD}_{slug}/overview.md
Keep this name (Y), enter a different name (type it), or skip the initiative (n)?
```

Then WAIT. Do NOT auto-advance. Do NOT set `initiative` or create any folder before an explicit operator response.

- **On Y (accept proposed name):** set `initiative: {slug}` in `00-state.md § Current State`. Proceed to Step 6d-initiative-join (Phase 0a, `agents/orchestrator.md`) during intake.
- **On a different name typed by the operator:** re-slugify the operator's input to `[a-z0-9-]` max 60 chars (same rule as the feature-name slug). Set `initiative` to that re-slugified value. If an existing `overview.md` is found under the new slug (same date-agnostic join-aid inspection as detection signal 2), JOIN it; otherwise CREATE. Proceed to Step 6d-initiative-join as usual. This path is also gated behind explicit operator input — it is a third explicit choice, not an auto-advance.
- **On n (or no signal fires):** set `initiative: null` in `00-state.md § Current State`. Proceed exactly as today — zero behaviour change.

**Never auto-create.** No initiative folder, no `overview.md`, and no `initiative` state field is written without explicit operator confirmation. The confirmation prompt is the hard gate. This sub-step follows the same patient-intake / advance-signal model as the rest of Discover — it never dispatches a subagent and never auto-advances.

---

## Language and English-Learning Intent Handling

Triggered from `agents/orchestrator.md` Phase 0a Step 6a, when the intent matches a `language-set` or `english-learning-set` row (the intent-pattern table itself stays in `agents/orchestrator.md`).

**Language-set intent handling.** When the intent matches a `language-set` row:

- **(b) Persistent-default-set** (explicit persistence marker present): Before writing to config, display the following confirmation block and WAIT for a response:
  ```
  About to set the default language to "<X>" (persistent write to ~/.claude/.team-harness.json).
  This affects all future sessions. The current session also switches to "<X>".
  Confirm? [Y/n]:
  ```
  - On **Y**: perform a merge-write of `~/.claude/.team-harness.json` — read the full document, replace or add only the `language` key, write the whole document back (never a partial payload). Then update `operator_language` in `00-state.md § Current State` for the current session.
  - On **n**: offer to apply the change as an ephemeral session override instead (intent (c) path). Do NOT write the config file.
- **(c) Session-override** (no persistence marker, or ephemeral marker present): update only `operator_language` in `00-state.md § Current State`. Do NOT write `~/.claude/.team-harness.json`. This is the ephemeral path and the default when the intent is ambiguous. The config JSON is NEVER written without an explicit persistence signal.

**English-learning-set intent handling.** When the intent matches an `english-learning-set` row:

- **(b′) Persistent-set** (explicit persistence marker present): Before writing to config, display the following confirmation block and WAIT for a response:
  ```
  About to set english-learning correction mode to "<on|off>" (persistent write to ~/.claude/.team-harness.json).
  This affects all future sessions. The current session also switches to "<on|off>".
  Confirm? [Y/n]:
  ```
  - On **Y** (enabling): perform a merge-write of `~/.claude/.team-harness.json` — read the full document, replace or add only the `english_learning` key (boolean `true`), write the whole document back (never a partial payload). Then record `english_learning: true` in `00-state.md § Current State`. Then ask a separate immersion question: `Also set English as the response language for immersion? [y/N]:` — on `y`, perform a further merge-write adding the `language` key (`"en"`) and record `operator_language: en` in `00-state.md § Current State`; on `n`/Enter, leave `language` unchanged.
  - On **Y** (disabling): perform a merge-write of `~/.claude/.team-harness.json` — read the full document, replace or add only the `english_learning` key (boolean `false`). Do NOT modify the `language` key on disable. Then record `english_learning: false` in `00-state.md § Current State`.
  - On **n**: offer to apply the change as an ephemeral session-only override instead (intent (c′) path). Do NOT write the config file.
- **(c′) Session-toggle** (no persistence marker, or ephemeral marker present): record the on/off state in `00-state.md § Current State` only. When enabling: record `english_learning: true` (independent of `operator_language`). When disabling: record `english_learning: false` only (do NOT modify `operator_language`). Do NOT write `~/.claude/.team-harness.json`. This is the ephemeral path and the default when the intent is ambiguous. The config JSON is NEVER written without an explicit persistence signal.

---

## ClickUp Conversational Intents

Triggered from `agents/orchestrator.md` Phase 0a Step 6c, when the utterance contains a ClickUp task identifier.

**Step 6c — ClickUp conversational intents (MCP-direct, no pipeline).**

ClickUp ops are routed to MCP tools directly when the operator references a specific task.
This is NOT a direct mode and NOT the full pipeline — the orchestrator calls the MCP tool,
reports the result, and exits the routing step. The pipeline is not engaged.

**Trigger condition.** The utterance MUST contain a task identifier:
- literal `task <ID>` where ID is alphanumeric (ClickUp task IDs match `[0-9a-z]+`)
- `#<ID>` (prefix form)
- `task "<name>"` or `task '<name>'` (quoted name)
- `task <name>` (unquoted name) only when the rest of the utterance starts with one of the action verbs below.

If no task identifier is present, fall through to Step 6a (the utterance is handled as a regular
intent — pipeline routing applies).

| Intent Pattern (es/en) | MCP Tool | Notes |
|------------------------|----------|-------|
| "deja/dejá un comentario corto en task \<id\|name\>: \<texto\>" / "leave a short comment on task \<id\|name\>: \<text\>" / "comenta en task \<id\|name\>: \<texto\>" | `clickup_create_task_comment` | Comment body is the literal text after the colon. Before calling `clickup_create_task_comment`, render a preview block showing the target task id, workspace, and the verbatim comment body, then wait for explicit operator approval — canonical block format and edit/cancel reply vocabulary in `skills/clickup/SKILL.md § "Comment preview gate (mandatory)"`. The gate holds in autonomous runs. |
| "cambia/cambiá el estado de task \<id\|name\> a \<status\>" / "set state of task \<id\|name\> to \<status\>" / "set status of task \<id\|name\> to \<status\>" | `clickup_update_task` | Before calling `clickup_update_task`, render a preview block showing the target task id and the new status value, then wait for explicit operator approval (edit/cancel vocabulary as in `skills/clickup/SKILL.md § "Comment preview gate"`). Pass status verbatim from operator (no enum validation — see Status pass-through note). |
| "cerrame/cierra/close task \<id\|name\>" / "close task \<id\|name\>" | `clickup_update_task` | Before calling `clickup_update_task`, confirm with the operator: "Set task \<id\> to closed — proceed? [Y/n]". Default status `closed`. If MCP rejects, prompt operator for the workspace's actual closed-status name. |
| "marca/marcá task \<id\|name\> como \<state\>" / "mark task \<id\|name\> as \<state\>" | `clickup_update_task` | Before calling `clickup_update_task`, render a preview block showing the target task id and the new state, then wait for explicit operator approval. Pass `<state>` verbatim. |
| "rutea/ruteá task \<id\|name\> al pipeline" / "route task \<id\|name\> to pipeline" / "open task \<id\|name\> in the pipeline" | none (delegation) | Equivalent to `/th:clickup task <id>`. Run the skill's `task <id>` flow inline, then route the handoff payload back into Step 7 (Classify) as full pipeline. Record `clickup_task_id` (the routed `<id>`) and `clickup_task_url` (`https://app.clickup.com/t/<id>`) in `00-state.md § Current State` at intake, so Phase 5 can post the mandatory functional closing comment even after compaction/recovery. |
| "muestra/mostrá task \<id\|name\>" / "show task \<id\|name\>" | `clickup_get_task` | Read-only; print summary. |

**Name-vs-ID resolution.** When the operator references a task by name (not ID):
1. Call `clickup_search` with the name as query.
2. If 0 matches: ask the operator to refine. Do not call the action tool.
3. If 1 match: present `ID | Title | Status` and confirm `[Y/n]` before calling the action tool.
4. If 2-5 matches: present a numbered list; ask the operator to pick a number; confirm before calling.
5. If >5 matches: report the count and ask the operator to refine the name.
Never call the action MCP tool without an explicit confirmation when the input is by name.

**Status pass-through.** ClickUp workspaces define arbitrary statuses per list. The orchestrator
passes the operator's literal status string to `clickup_update_task`. If the MCP returns an
invalid-status error, surface the error message verbatim and ask the operator for the correct
status name. No hardcoded enum.

**MCP tools referenced (verbatim).** `clickup_filter_tasks`, `clickup_search`,
`clickup_get_task`, `clickup_create_task_comment`, `clickup_update_task`,
`clickup_find_member_by_name`, `clickup_resolve_assignees`.
