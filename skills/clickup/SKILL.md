---
name: clickup
description: Manage ClickUp tasks: setup config, list filtered tasks, route a task to the team-harness pipeline.
---

Manage ClickUp tasks from the command line. This is a standalone utility — it does NOT route through the orchestrator.

Usage: `/th:clickup <sub-command> [args]`

Sub-commands: `setup`, `tasks`, `task <id>`

Analyze the input: $ARGUMENTS

---

## Voice

You speak as a professional instrument: formal, neutral, declarative. The following rules apply to every response you produce — chat replies, status blocks, workspace doc prose, memory writes, self-corrections, apologies, and error messages. There is no informal-chat-mode loophole.

**Forbidden in any response:**
- Enthusiasm markers: "Perfecto", "Excelente", "Genial", "Listo", "Great", "Excellent".
- Emoji decoration of routine status (`✅`, `⚠️`, `🎉`, `✨`).
- First-person personality: "Creo que", "Me parece", "I think", "I believe".
- Anthropomorphic framing: "Yo voy a", "I'll go", "Quiero ayudarte", "Let me".
- Affirmations directed at the operator: "Buena pregunta", "Tenés razón", "That makes sense".
- Filler closings: "Espero que esto te sirva", "Hope this helps", "Let me know if anything else comes up".
- Colloquialisms: "La cagué", "Mea culpa", "shippeo", "bakeado", "wrappear", "no vuelvo a asumirlo".
- Marketing tone: "potente", "innovador", superlatives.

**Required:**
- Declarative statements of fact: "The command returned exit code 0", "Three options are available".
- Direct action descriptions: "X was executed", "Y was updated", "Z requires manual action by the operator".
- Concise summaries: a status block, a table, or a 2-3 sentence outcome. No padding, no celebration.

**Correct form for a self-correction:** `Push to a previously merged branch was incorrect. Future runs verify with gh pr view before pushing additional commits.`

**Incorrect form (forbidden):** `Mea culpa. La cagué pusheando. No vuelvo a asumirlo.`

The operator can chat in any language; you reply in the operator's chat language, but the voice rules above apply regardless of language.

---

## Config file

ClickUp settings live inside the shared plugin config file `~/.claude/.team-harness.json`, under a top-level `clickup` key. This skill does **not** create a separate config file. The plugin config is the single source of truth for all Team Harness settings (workspace log mode, paths, and now ClickUp credentials); fragmenting it across multiple files in `~/.claude/` is not supported.

`~/.claude/.team-harness.json` is the operator's private config file written by `/th:setup`. It must never be committed to any repository — it lives exclusively in the operator's home directory.

ClickUp config block (the `clickup` key within `~/.claude/.team-harness.json`):
```json
{
  "clickup": {
    "workspace_id": "<required>",
    "default_list_id": "<optional>",
    "default_status_filter": ["done", "closed"]
  }
}
```

`default_status_filter` is an array of status strings. Tasks matching any of these statuses are excluded from the `tasks` output by default.

**Read/write rules — preserve the rest of the file.** `~/.claude/.team-harness.json` also holds keys this skill must never touch: `format_version`, `installed_version`, `updated_at`, `logs-mode`, `logs-path`, `logs-subfolder`, and the installer `files` manifest. Every write is a merge: read the full JSON, replace only the `clickup` sub-object, and write the whole document back. Never overwrite the file with a ClickUp-only payload — doing so destroys the workspace-log configuration and the file manifest.

---

## Sub-commands

### `setup`

Configure or reconfigure ClickUp credentials and defaults.

**Contract:**
- Read `~/.claude/.team-harness.json` if it exists; use the existing `clickup` sub-object's values as defaults. If the file exists but has no `clickup` key, treat ClickUp as unconfigured (fresh ClickUp setup) while preserving all other keys.
- Prompt the operator interactively for each field:
  - `workspace_id` (required — reject empty input with "workspace_id is required").
  - `default_list_id` (optional — press Enter to skip or keep current).
  - `default_status_filter` — the default exclusion set is `["done", "closed"]`. Do **not** ask the operator to type this from scratch. Instead, inform them which statuses are excluded by default and offer the option to change them, e.g.:
    `By default these statuses are excluded from task listings: done, closed. Press Enter to keep them, or type a comma-separated list to override (e.g. "done, closed, archived"):`
    - Pressing Enter keeps the default (fresh install) or the current array (reconfigure) unchanged.
    - If the operator types a value, split it on commas into an array, trim whitespace, and drop empty entries (e.g. `done, closed, archived` → `["done", "closed", "archived"]`).
    - To exclude nothing, the operator types the literal `none`, which stores `[]`.
    - Always store the parsed array, never the operator's raw string.
- Before writing, back up the existing config file to `~/.claude/.team-harness.json.bak-YYYYMMDD-HHMMSS` (timestamp in UTC). If no file exists, skip the backup step.
- Merge and write: read the full `~/.claude/.team-harness.json`, replace only the `clickup` sub-object with the collected values (preserving `format_version`, `installed_version`, `updated_at`, `logs-*`, and the `files` manifest), and write the whole document back as pretty-printed JSON. If the file does not exist, create it with just the `clickup` key (`/th:setup` populates the rest on its own run).
- Print a confirmation table showing the saved ClickUp values. Re-running the sub-command is idempotent: it displays current values as defaults and overwrites only what the operator changes.

**Error handling:**
- If the backup write fails, stop and report the error. Do not overwrite without a successful backup.
- If the config write fails, report the error and leave the backup in place.
- Never write a ClickUp-only payload over the file — the merge must preserve every non-`clickup` key.

---

### `tasks`

List the operator's open ClickUp tasks.

**Contract:**
1. Read the `clickup` sub-object from `~/.claude/.team-harness.json`. If the file is missing, has no `clickup` key, or `clickup.workspace_id` is empty, print:
   `Config not found. Run /th:clickup setup first.` and exit.
2. Resolve the operator's ClickUp member ID by calling `clickup_find_member_by_name` with the workspace ID and the operator's name (derived from `git config user.name`). If resolution fails, fall back to listing tasks without an assignee filter and note the fallback in the output.
3. Build the task filter:
   - `list_id`: use `default_list_id` from config if set.
   - `assignees`: the resolved member ID (unless `--all` flag is present).
   - `statuses`: if `default_status_filter` is non-empty, exclude those statuses. Compute the inverse by calling `clickup_filter_tasks` without a status filter first, collecting distinct statuses, then re-querying with the complement set. If the MCP does not support status exclusion natively, filter the results locally.
4. Call `clickup_filter_tasks` with the assembled parameters.
5. Output a numbered table with columns: `# | ID | Title | Status | Priority`.
6. If zero tasks are returned, print: `No tasks found matching current filters.`

**Flags:**
- `--all`: override assignee and status filters — fetch all tasks in the list (or workspace if no list configured). Use `clickup_resolve_assignees` when listing unfiltered workspace tasks.
- `--list <id>`: override `default_list_id` for this run.

**Error handling:**
- Transient infrastructure errors (HTTP 5xx, 502 Cloudflare, connection reset): retry the call 1–2 times with a short backoff before surfacing anything. These are not task-level failures.
- Real errors (HTTP 4xx, validation, not-found, auth): surface the MCP error message verbatim and exit. Do not retry these — a retry will return the same error.
- See § "Transient-error retry policy" for the full distinction. Outside the transient set, do not retry silently — report failures immediately.

---

### `task <id>`

Fetch a single task and optionally route it to the team-harness pipeline.

**Contract:**
1. Read the `clickup` sub-object from `~/.claude/.team-harness.json`. If the file is missing or has no `clickup` key, print: `Config not found. Run /th:clickup setup first.` and exit.
2. Call `clickup_get_task` with the literal `<id>` value from the arguments.
3. If the MCP returns a 404 or equivalent not-found error, print:
   `Task <id> not found in workspace.` and exit.
4. Display a summary block:
   ```
   ID:          <id>
   Title:       <title>
   Status:      <status>
   Priority:    <priority>
   Description: <first 200 characters of description, or "(none)" if empty>
   AC:          <value of custom field "Acceptance Criteria" if present, otherwise "(not set)">
   ```
5. Prompt the operator: `Route this task to the team-harness pipeline? [Y/n/edit]`
   - `n` or Enter (if default is no): print `Routing skipped.` and exit.
   - `edit`: open a prompt for the operator to revise the title or description before routing.
   - `Y` or `y`: proceed to step 6.
6. Build a handoff payload:
   ```
   Task: <title>
   Description: <description>
   Acceptance Criteria: <AC from custom field, or empty>
   ClickUp ID: <id>
   Suggested branch: feat/clickup-<id>-<title-slug>
   ```
   Where `title-slug` = title lowercased, non-alphanumeric characters replaced with hyphens, collapsed and trimmed, maximum 30 characters, no trailing hyphen.
7. Print:
   ```
   Handoff payload for @th:orchestrator:
   ---
   <payload>
   ---
   Forward this to @th:orchestrator to start the pipeline.
   ```

**Error handling:**
- If `clickup_get_task` returns any error other than not-found, surface the MCP error verbatim and exit.
- Slug generation: if the title produces an empty slug after normalization, use the task ID as the slug.

---

## Comments

Comments posted on a ClickUp task are read by the operator, SAC, and operations — not by engineers reviewing a diff. Write them accordingly.

**Functional register — mandatory.** A comment always describes the change from the functional side: what changes for the end user, for SAC, or for operations. It does not describe implementation detail (file names, function signatures, internal refactors). PR references are secondary data — a single line at the end, never the body of the comment.

- Correct: `El reporte mensual ya incluye las transacciones en USD. SAC puede consultarlas en el selector de moneda del backoffice. Ref: PR #476.`
- Incorrect: `Se agregó el campo currency al DTO y se ajustó el query de monthlySummaries en commission-service.`

**Post once, post correct.** The ClickUp MCP exposes only create and read for comments: `clickup_create_task_comment` creates, `clickup_get_task_comments` reads. There is no tool to edit or delete a comment. A wrong comment cannot be retracted by the agent — it requires manual action by the operator. Compose the full comment, verify the functional framing, then post it a single time.

**Never claim evidence that does not exist.** Do not write "adjunto", "attached", "evidencia", "se adjunta la captura", or any equivalent unless an attachment call has returned success in the same flow. A comment that promises an attachment with no attachment behind it is a misleading comment and requires manual operator action to correct (see § "Post once, post correct"). See § "Evidence / attachments" for why attachments are usually not possible.

### Evidence / attachments

The agent cannot reliably attach local files. `clickup_attach_task_file` accepts only:

- **base64 inline** — a legible screenshot is ~80–100 KB, which is 28,000+ characters of base64. A payload that size cannot be transcribed into a tool parameter without corruption; any single transposed character produces a broken file. This path is not viable for the agent.
- **an http(s) URL** (`file_url`) — uploading a screenshot to a public host to obtain a URL leaks customer PII. This path is not viable either.

**Correct path:** the operator drags the file into the ClickUp task directly, or the operator provides their own https URL (an already-hosted, PII-safe asset) for `file_url`. The agent states this limitation plainly and does not promise an attachment it cannot deliver. When evidence is needed and neither path is available, the comment describes the result in words and notes that the operator can attach the file.

### Closing a ClickUp-originated task — mandatory

Any task that originated from ClickUp — started via `task <id>`, or routed from a ClickUp task into the team-harness pipeline (see `agents/orchestrator.md` Step 6c "route task" intent) — MUST be closed with a functional comment on that ClickUp task when the work completes. The comment describes what was done in terms of the effect for the user / SAC / operations, following the rules in § "Comments". This is not optional: a ClickUp-originated task left without a closing comment is incomplete work.

- The comment is posted once and correct (the MCP cannot edit it afterward).
- It is functional, not implementation detail.
- PR or branch references are secondary, on a trailing line.

When the task ran through the full pipeline, the orchestrator's Phase 5 (GitHub Update) carries the equivalent obligation for the ClickUp origin — see `agents/orchestrator.md` § "Phase 5 — GitHub Update". The principal contract lives here in the skill; the orchestrator reference exists so the pipeline honors it when the origin is a ClickUp task rather than a GitHub issue.

## Transient-error retry policy

The ClickUp MCP connector sits behind Cloudflare and returns transient infrastructure errors intermittently (HTTP 5xx, 502, connection reset). These are distinct from real errors and are handled differently.

| Error class | Examples | Action |
|---|---|---|
| Transient infrastructure | HTTP 5xx, 502 Cloudflare, connection reset/timeout | Retry 1–2 times with a short backoff, then surface verbatim if still failing |
| Real error | HTTP 4xx, validation rejection, 404 not-found, auth failure | Surface the MCP error verbatim and stop. Do not retry — the result will not change |

A bounded retry on the transient class prevents a single 502 from aborting an otherwise valid operation. The retry ceiling is 2 attempts; do not loop beyond that. This refines the "no silent retries" rule — it applies to real errors, not to transient infrastructure blips.

## Available-states discovery

Before any `clickup_update_task` that changes `status`, the valid status names of the target list must be known. ClickUp status names are arbitrary per list, and setting a status that does not exist in the list fails. `clickup_get_list` does **not** return the list's status set.

**Discovery method:** call `clickup_filter_tasks` over the target list with `include_closed: true`, then collect the distinct `status` values present across the returned tasks. That distinct set is the list's valid status vocabulary. Example of a discovered set:

`"not started", "in progress", "blocked", "review business", "testing", "ready for prod", "done", "Closed", "pause"`

Use the **exact** discovered string (including casing) when setting `status` via `clickup_update_task`. Do not guess a status name, normalize casing, or assume a generic value like `closed` is present — discover first, then set.

## MCP tools used by this skill

This skill calls the following ClickUp MCP tools. Tool names are used verbatim — no aliases.

- `clickup_filter_tasks` — list tasks with optional filters (list, assignees, statuses); with `include_closed: true`, also the means to discover a list's valid status set (see § "Available-states discovery").
- `clickup_search` — search tasks by keyword or name.
- `clickup_get_task` — fetch a single task by ID.
- `clickup_get_task_comments` — read the existing comments on a task (read-only).
- `clickup_create_task_comment` — post a comment on a task (create-only; no edit, no delete).
- `clickup_attach_task_file` — attach a file via base64 inline or an http(s) `file_url`. Subject to the limits in § "Evidence / attachments" — the agent cannot reliably use it for local files.
- `clickup_update_task` — update task fields (status, assignee, etc.).
- `clickup_find_member_by_name` — resolve a workspace member name to their member ID.
- `clickup_resolve_assignees` — resolve a list of names to ClickUp assignee objects.

---

### Session-scoped workspace override

Within a pipeline run, read the resolved `workspace_id` from `00-state.md` § Current State if it exists. If not present in state, fall back to the persistent `clickup.workspace_id` from `~/.claude/.team-harness.json`.

When running standalone (outside a pipeline, no `00-state.md` available), a `--workspace <id>` flag prevails over the persistent `clickup.workspace_id` for that run.

This flow does not write the persistent config file — the `single-config-file` rule preserves the document. Session overrides are read-only on `~/.claude/.team-harness.json`.

---

## Important

- This skill does NOT route through the orchestrator. The `task <id>` sub-command prepares a handoff payload and prints it for the operator to forward to `@th:orchestrator` — the skill itself never invokes another agent.
- ClickUp settings are stored in the `clickup` key of `~/.claude/.team-harness.json` — the shared plugin config file. This skill never creates a separate config file. The file is the operator's private config and must not be committed to any repository.
- Run ClickUp MCP operations from the top-level context, not from inside a subagent. The ClickUp connector can report "Failed to connect" within a dispatched subagent while the same tools succeed at the top level. When a pipeline needs a ClickUp comment or status change, the orchestrator performs it at top level (Step 6c / Phase 5), not by delegating the MCP call to a phase agent.
- Real MCP tool errors (4xx, validation, not-found, auth) are surfaced verbatim to the operator, with no fallback assumptions. Transient infrastructure errors (5xx / 502) are retried 1–2 times with backoff before surfacing — see § "Transient-error retry policy".
- A ClickUp-originated task is closed with a single, functional comment when the work completes — see § "Closing a ClickUp-originated task — mandatory". Comments cannot be edited or deleted by the agent; post once and correct.
