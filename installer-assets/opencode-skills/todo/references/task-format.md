# obsidian-tasks Emoji Format — Serialization Spec

Authoritative reference for the `/th:todo` skill. All task lines and note files the skill
writes MUST conform to the rules in this document.

---

## 1. Task-line anatomy

A valid task is a single Markdown list item with a spaced checkbox:

```
- [ ] [<global_filter>] <description> [<tags>] <emoji-metadata-block>
```

- **Checkbox**: `- [ ]` (open) or `- [x]` (done). The skill uses only these two states.
- **`<global_filter>`**: when `obsidian_tasks.global_filter` is non-empty (e.g. `#task`), include
  that string after the checkbox and before the description, separated by a space.
- **`<description>`**: verb-first, one line only. No multi-line content. See §5.
- **`<tags>`**: `@context` and `+Project` tags placed AFTER the description and BEFORE the
  emoji metadata block. When `global_filter` equals a tag (e.g. `#task`), that tag is the
  global-filter token above — the operator's `@context`/`+Project` tags still come here.
- **`<emoji-metadata-block>`**: all emoji fields flush at the end of the line. Nothing may
  follow the metadata block (see §2 — backwards-parsing rule).

---

## 2. Backwards-parsing rule (CRITICAL)

The obsidian-tasks plugin parses each line **backwards** from the end. It reads emoji
metadata fields until it encounters unrecognized content. Any plain text or unrecognized
token appearing after the metadata block terminates parsing — fields before that token are
silently ignored.

**Consequence:** the metadata block must be the very last thing on the line. Never put
plain text, links, or any other content after the first emoji signifier.

---

## 3. Single-line constraint

The plugin reads only the first line of each checklist item. Multi-line descriptions are
not supported. Long descriptions belong exclusively in the `## Description` section of the
note body — never on the task line.

---

## 4. Canonical field order

After `<description>` and `<tags>`, the emoji metadata block MUST follow this exact order:

| Position | Field | Emoji | Value |
|----------|-------|-------|-------|
| 1 | Priority | 🔺 / ⏫ / 🔼 / 🔽 / ⏬ | emoji only (no value text) |
| 2 | Recurrence | 🔁 | `every <rule>` |
| 3 | On-completion | 🏁 | `keep` or `delete` |
| 4 | Created | ➕ | YYYY-MM-DD |
| 5 | Start | 🛫 | YYYY-MM-DD |
| 6 | Scheduled | ⏳ | YYYY-MM-DD |
| 7 | Due | 📅 | YYYY-MM-DD |
| 8 | Cancelled | ❌ | YYYY-MM-DD |
| 9 | Done | ✅ | YYYY-MM-DD |
| 10 | Id | 🆔 | 6-char `[a-z0-9]` |
| 11 | Depends on | ⛔ | comma-separated ids |

Omit any field that has no value. Normal priority (no emoji) is omitted entirely.

**`➕ created` (position 4) comes BEFORE `🛫` start, `⏳` scheduled, and `📅` due.**
This is a common ordering mistake — the created field is always emitted before the other
date fields.

---

## 5. Emoji ↔ field reference table

| Field | Emoji | Dataview field | Value format | Example |
|-------|-------|----------------|--------------|---------|
| Priority: Highest | 🔺 | `priority:: highest` | emoji only | `- [ ] Fix outage 🔺` |
| Priority: High | ⏫ | `priority:: high` | emoji only | `- [ ] Review PR ⏫` |
| Priority: Medium | 🔼 | `priority:: medium` | emoji only | `- [ ] Update docs 🔼` |
| Priority: Normal | *(omit)* | `priority:: normal` | omit entirely | `- [ ] Buy coffee` |
| Priority: Low | 🔽 | `priority:: low` | emoji only | `- [ ] Archive notes 🔽` |
| Priority: Lowest | ⏬ | `priority:: lowest` | emoji only | `- [ ] Someday ⏬` |
| Created date | ➕ | `created:: ` | YYYY-MM-DD | `➕ 2026-06-18` |
| Start date | 🛫 | `start:: ` | YYYY-MM-DD | `🛫 2026-06-20` |
| Scheduled date | ⏳ | `scheduled:: ` | YYYY-MM-DD | `⏳ 2026-06-21` |
| Due date | 📅 | `due:: ` | YYYY-MM-DD | `📅 2026-06-25` |
| Done date | ✅ | `completion:: ` | YYYY-MM-DD | `✅ 2026-06-22` |
| Cancelled date | ❌ | `cancelled:: ` | YYYY-MM-DD | `❌ 2026-06-19` |
| Recurrence | 🔁 | `repeat:: ` | `every <rule>` | `🔁 every week` |
| On-completion | 🏁 | `onCompletion:: ` | `keep` or `delete` | `🏁 delete` |
| Task ID | 🆔 | `id:: ` | 6-char `[a-z0-9]` | `🆔 a3f9k2` |
| Depends on | ⛔ | `dependsOn:: ` | comma-separated ids | `⛔ a3f9k2,b5h1x0` |

---

## 6. Date rules

- **Format:** `YYYY-MM-DD` only, with leading zeros. No times, no relative words, no
  locale-specific formats.
- **Normalization:** the skill normalizes operator input before writing:
  - Relative words ("today", "tomorrow", "next week") → resolved to absolute `YYYY-MM-DD`
    based on the current date at skill execution time.
  - Loose numerics ("2026-6-1") → zero-padded ("2026-06-01").
  - Un-normalizable input → rejected with: `Date "<input>" is not understood. Use YYYY-MM-DD.`
- **No date is ever written in a non-`YYYY-MM-DD` format.** If normalization cannot
  produce a valid `YYYY-MM-DD`, the operation aborts — nothing is written.

---

## 7. Priority mapping

| Operator input | Emoji | Level |
|----------------|-------|-------|
| `highest` | 🔺 | Highest |
| `high` | ⏫ | High |
| `medium` | 🔼 | Medium |
| *(omit / `none`)* | *(none)* | Normal (default) |
| `low` | 🔽 | Low |
| `lowest` | ⏬ | Lowest |

Priority emoji are inserted as Unicode code points, never copy-pasted from rendered text.
The `⏫` (high-priority) emoji has a known issue when copied from web pages due to
non-breaking space and Unicode variation selectors — inserting programmatically avoids
this entirely.

**Use priority selectively.** Defaulting every task to high priority renders the field
meaningless. Omit it (normal) unless the task is genuinely elevated.

---

## 8. `🆔` id scheme

- **Format:** 6-character lowercase alphanumeric — `[a-z0-9]{6}`. Example: `a3f9k2`.
- **Generation:** random draw. On collision with an existing id in the tasks folder,
  redraw until unique. Scan existing notes' `id` frontmatter field and inline `🆔` values
  to establish the collision set.
- **Placement in line:** position 10 in the canonical order (before `⛔ dependsOn`).
- **Dual write:** the same id is written in two places per note:
  1. YAML frontmatter `id:` field.
  2. Inline task line `🆔 <id>`.
- **The id never changes.** `edit` does not modify the `🆔` id. The filename is not
  renamed when the description changes — the id keeps the file uniquely addressable.
- **Tasks without an id** (e.g. existing inline tasks not created by this skill) cannot be
  targeted by `done`/`edit`-by-id. The skill reports this rather than guessing.

---

## 9. Recurrence rules

- All recurrence rules start with `every` (after the `🔁` emoji).
- Supported intervals: `every [N] days/weeks/months/years`, `every weekday`,
  `every week on <Day>`, `every month on the <Nth>`, `every month on the last`.
- Append `when done` to base recalculation on the completion date rather than the
  original due date.
- **Recurrence requires at least one date field** (`📅` due, `⏳` scheduled, or `🛫`
  start). A recurring task without any date does not function in date-based searches.
  The skill rejects `create`/`edit` attempts that set recurrence without any date with:
  `A recurring task needs at least one of --due/--scheduled/--start.`
- **When a recurring task is completed:** the original task line receives `✅ <date>`;
  a new open `- [ ]` instance with recalculated dates is written one line above the
  original (matching the plugin's placement rule). The date recalculation priority is:
  Due → Scheduled → Start (use whichever is present, in that priority order).

---

## 10. On-completion behavior

- `🏁 keep` (default) — the completed task line stays in place.
- `🏁 delete` — removes the completed instance. For a non-recurring one-note-per-task
  note this means deleting the note file.
- The `default_on_completion` config field provides the vault-level default; per-task
  `--on-completion` overrides it for a single task.

---

## 11. Filename / slug scheme

**Slug algorithm — apply steps in this exact order (validation before truncation):**

1. Lowercase the entire description string.
2. Replace every character NOT in `[a-z0-9]` with `-`. This single pass removes `/`, `\`,
   `.`, `:`, NUL, spaces, and every other non-alphanumeric character — including the
   components of `..` and of any absolute path. This step runs on the FULL string before
   any truncation.
3. Collapse consecutive `-` characters into a single `-`.
4. Trim any leading or trailing `-`.
5. Truncate to 40 characters.
6. Trim a trailing `-` that may have been exposed by truncation.
7. If the result is empty, use `task`.

**Invariant:** the slug produced by these steps contains only `[a-z0-9-]` and cannot
contain a path separator (`/`, `\`), a dot (`.`), a `..` segment, a colon, or a NUL byte.
Validation (step 2) precedes truncation (step 5), so truncation can never reintroduce a
removed character.

**Filename:** `<slug>-<id>.md`. The `🆔` id suffix makes every filename unique by
construction. If, defensively, the exact filename already exists on disk (id collision),
regenerate the id and rebuild the filename.

**Windows reserved device names:** because the filename always ends in `-<id>.md`, no slug
value — including one that reduces to `con`, `prn`, `aux`, `nul`, `com1`–`com9`, or
`lpt1`–`lpt9` — produces a bare reserved-name file. The suffix guarantees the filename is
never a reserved name.

Examples:
- description `Review authentication PR` + id `a3f9k2` → `review-authentication-pr-a3f9k2.md`
- description `Buy groceries @home` + id `zx8p1q` → `buy-groceries-home-zx8p1q.md`
- description `Update docs` + id `m0k3j9` → `update-docs-m0k3j9.md`

---

## 12. Note file structure

Each task note is a Markdown file at `<tasks_folder>/<slug>-<id>.md`:

```markdown
---
status: todo
priority: high
created: 2026-06-18
start: 2026-06-20
scheduled: 2026-06-21
due: 2026-06-25
tags: [work, Security]
id: a3f9k2
recurrence: "every week"
on_completion: keep
---

- [ ] #task Review authentication PR @work +Security ⏫ ➕ 2026-06-18 🛫 2026-06-20 ⏳ 2026-06-21 📅 2026-06-25 🆔 a3f9k2

## Description

<full free-form detail — links, sub-steps, the Who/What/When framing>
```

**Frontmatter is a derived mirror, not a source of truth.** The inline task line is
canonical — the plugin reads only the line. Frontmatter is regenerated from the parsed
line on every write (`done`, `edit`). On any conflict between frontmatter and the line,
the line wins.

Frontmatter field mapping:
- `status`: `todo` when `[ ]`, `done` when `[x]`. On `done`, add a `done:` date field.
- `priority`: the word form of the priority emoji, or `normal` when omitted.
- `created`: the `➕` value.
- `start`: the `🛫` value (omit field when absent).
- `scheduled`: the `⏳` value (omit field when absent).
- `due`: the `📅` value (omit field when absent).
- `tags`: extracted `@context`/`+Project` tag values (normalized, as an array).
- `id`: the `🆔` value.
- `recurrence`: the `🔁` rule string, or `""` when absent.
- `on_completion`: the `🏁` value, or the `default_on_completion` config value when absent.

---

## 13. Canonical worked examples

**Full task (all fields):**
```
- [ ] #task Review authentication PR @work +Security ⏫ ➕ 2026-06-18 🛫 2026-06-20 ⏳ 2026-06-21 📅 2026-06-25 🆔 a3f9k2
```

**Simple task (due date only, no priority):**
```
- [ ] Buy groceries @home 📅 2026-06-19 🆔 zx8p1q
```

**Recurring task:**
```
- [ ] Archive Q1 invoices +Finance 🔽 🔁 every month on the last ➕ 2026-06-18 📅 2026-06-30 🆔 m0k3j9
```

**Completed task:**
```
- [x] Review authentication PR @work +Security ⏫ ➕ 2026-06-18 📅 2026-06-25 ✅ 2026-06-22 🆔 a3f9k2
```

Note in the examples above: `➕ created` (position 4) always precedes `🛫`, `⏳`, and
`📅` (positions 5–7).

---

## 14. Parse/serialize algorithm

When the skill reads an existing task line (for `done` or `edit`), it MUST:

1. Strip the leading `- [ ]` or `- [x]` checkbox marker.
2. Extract the global_filter token if non-empty (exact string match at start of remainder).
3. Scan backwards from the end of the line, extracting each recognized emoji field and
   its value, stopping when an unrecognized token is encountered.
4. The remaining text (before the first recognized emoji field, scanning backwards) is the
   description + tags. Extract `@...` and `+...` tokens as tags; the rest is description.
5. To serialize after modification: assemble fields in the canonical order from §4,
   omitting absent fields. Produce a single line. Verify nothing follows the last emoji
   field.

The backwards-parsing rule is why the metadata block must be flush at the end — the parser
stops at the first unrecognized token scanning from the right.

---

## 15. Dataview-format refusal

When `obsidian_tasks.task_format == "dataview"`, the skill's write operations (`create`,
`done`, `edit`) refuse with:

```
Vault is in Dataview task format; /th:todo writes emoji format only.
Switch the obsidian-tasks plugin to Emoji format, or run setup after switching.
```

`list` may still read files (reading is format-tolerant). `setup` persists the detected
`dataview` value and warns the operator that write operations will refuse until the plugin
format is changed.

---

*Sources: obsidian-tasks documentation (https://publish.obsidian.md/tasks/); DefaultTaskSerializer
source at src/Layout/TaskLayoutOptions.ts (canonical field order). Research consolidated
2026-06-18.*
