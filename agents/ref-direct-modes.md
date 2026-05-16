---
name: ref-direct-modes
description: Reference file for orchestrator direct modes (diagram, likec4, d2, review, translate, plan-review). Read on-demand by the orchestrator — not a standalone agent.
model: opus
color: cyan
---

# Orchestrator — Direct Mode Reference

This file is read on-demand by the orchestrator when executing a direct mode. It is NOT part of the orchestrator's system prompt.

---

## Plan Review Mode (standalone audit of Stage 1 artifacts)

**When invoked:** the user wants to re-audit a Stage 1 plan after a manual edit, or wants to audit a plan produced under a previous orchestrator run, without re-running the full pipeline. Common trigger: developer hand-edits `01-architecture.md` or `02-task-list.md` and wants to confirm the changes still satisfy the five plan-shape rules before continuing.

**Routing:** the user invokes `/plan-review {feature-name}` (or `audit my plan`, `revisa el plan`, "is my plan compliant?"). Skill payload is `Direct Mode Task: plan-review` with `feature_name`.

**Process:**

1. Glob `session-docs/{feature-name}/`. If the folder does not exist, return a friendly message asking the user to first run `/design` or to confirm the feature name.
2. Confirm `01-architecture.md` and `02-task-list.md` both exist. If only `01-architecture.md` is present, prompt the user: "no `02-task-list.md` — this looks like a legacy plan (pipeline_version 1) or an incomplete design. Run `/design {feature}` to produce both, or invoke `/plan-review` after the architect has emitted the task list."
3. Invoke `plan-reviewer` via Task tool with the standard input contract (feature name + pointers to the three files).
4. Wait for the agent's status block. Read `verdict` and `findings` counts.
5. Print the verdict and findings inline to the user. Direct mode does NOT emit a STAGE-GATE-1 STOP block — there is no pipeline to gate. The user is invoking interactively for information.
6. If `verdict: pass` → confirm "plan-shape OK". If `verdict: concerns` or `fail` → enumerate the findings file:line, one per line, and point the user to `01-plan-review.md` for the full report.

**Behaviour:**
- Read-only. Direct mode never modifies `01-architecture.md` or `02-task-list.md` (consistent with `plan-reviewer`'s tool allowlist).
- The agent writes its report to `01-plan-review.md` (overwriting any prior report) so subsequent direct-mode invocations always reflect the latest plan state.
- Does not append `stage.gate` events to JSONL — there is no pipeline. The agent's `00-execution-log.md` entry is enough.

**Output:**
```
Plan Review (direct mode): {feature-name}
Verdict: {pass | concerns | fail}
Findings:
  Rule 1 (PR-count): {N}
  Rule 2 (per-PR ACs): {N}
  Rule 3 (consolidated docs): {N}
  Rule 4 (cross-references): {N}
  Rule 5 (service identity): {N}

{if any findings:}
Top issues:
  - {file:line — rule — short description}
  ...

Full report: session-docs/{feature-name}/01-plan-review.md
```

---

## Diagram Mode (Excalidraw)

When invoked with `Direct Mode Task: diagram`:

### Step 1 — Architect analyzes codebase context

Invoke `architect` in **research mode** via Task tool with:
- The diagram request (what to visualize)
- Feature name for session-docs
- Instruction: "Analyze the codebase/system to extract the components, relationships, data flows, and boundaries needed to create a diagram. Focus on: what exists, how pieces connect, and what the visual structure should emphasize. Produce a structured analysis in `session-docs/{feature}/00-research.md` — do NOT produce a diagram."

Gate: if `status: failed` → report to user and stop.

### Step 2 — Invoke diagrammer

Invoke `diagrammer` via Task tool with:
- Feature name
- Path to architect's analysis: `session-docs/{feature}/00-research.md`
- Path to skill: `.claude/skills/excalidraw-diagram/`
- Output path: `session-docs/{feature}/diagram.excalidraw`
- **Expected sections:** list the major sections from the architect's analysis

### Step 2.5 — Validate diagrammer output (MANDATORY)

After the diagrammer returns `status: success`, **read the `.excalidraw` file** and check:

1. **Has arrows** — count elements with `"type": "arrow"`. If 0 → REJECT.
2. **Element count reasonable** — comprehensive diagram should have 80+ elements.
3. **Key components present** — scan text elements for key terms from the analysis.

**If validation fails:** re-invoke diagrammer with specific feedback. Max 2 re-invocations.

### Step 3 — Report to user

Present output file path, summary, and renderer setup instructions if needed:
```bash
cd .claude/skills/excalidraw-diagram/references
uv sync
uv run playwright install chromium
```

---

## LikeC4 Diagram Mode

When invoked with `Direct Mode Task: likec4-diagram`:

### Step 1 — Architect analyzes codebase context

Invoke `architect` in **research mode** via Task tool with:
- The diagram request (what to visualize)
- Feature name for session-docs
- Instruction: "Analyze the codebase/system to extract the components, relationships, data flows, and boundaries needed to create a LikeC4 architecture diagram. Focus on: entry points, services, databases, queues, external dependencies, and actors. Produce a structured analysis in `session-docs/{feature}/00-research.md` — do NOT produce a diagram."

Gate: if `status: failed` → report to user and stop.

### Step 2 — Invoke likec4-diagrammer

Invoke `likec4-diagrammer` via Task tool with:
- Feature name
- Path to architect's analysis: `session-docs/{feature}/00-research.md`
- Path to skill: `.claude/skills/likec4-diagram/`
- Output path: `session-docs/{feature}/diagram.c4`

Gate: if `status: failed` → report to user. If `status: blocked` (CLI not installed) → relay install instructions: `npm install -g likec4` or `npx likec4`.

### Step 3 — Report to user

Present output file path, view names, and how to render:
- Preview: `npx likec4 start`
- Export: `npx likec4 export png`

---

## D2 Diagram Mode

When invoked with `Direct Mode Task: d2-diagram`:

### Step 1 — Architect analyzes codebase context

Invoke `architect` in **research mode** via Task tool with:
- The diagram request
- Feature name for session-docs
- Instruction: "Analyze the codebase/system to extract the components, relationships, data flows, and boundaries needed to create a D2 diagram. Produce a structured analysis in `session-docs/{feature}/00-research.md` — do NOT produce a diagram."

Gate: if `status: failed` → report to user and stop.

### Step 2 — Invoke d2-diagrammer

Invoke `d2-diagrammer` via Task tool with:
- Feature name
- Path to architect's analysis: `session-docs/{feature}/00-research.md`
- Path to skill: `.claude/skills/d2-diagram/`
- Output path: `session-docs/{feature}/diagram.d2`

Gate: if `status: failed` → report to user. If `status: blocked` (d2 not installed) → relay install instructions.

### Step 3 — Report to user

Present source file path, SVG output path, and re-render options:
- Dark theme: `d2 --theme 300 diagram.d2 dark.svg`
- Hand-drawn: `d2 --sketch diagram.d2 sketch.svg`
- Better routing: `d2 --layout elk diagram.d2 elk.svg`

---

## Review Mode

When invoked with `Direct Mode Task: review`:

The `/review-pr` skill handles ALL Bash (fetching PR metadata, git diff, etc.) and passes everything inline. The orchestrator and reviewer do ZERO Bash. The skill may request different submodes depending on whether a prior review exists.

### Submode routing

Check the `Submode` field in the task payload:
- `Submode: update-body` → jump to **Step 2b** (Update Body)
- `Submode: reply` → jump to **Step 2c** (Reply)
- No submode or `Submode: fresh` → proceed to **Step 1** (Fresh Review, default)

### Step 1 — Receive pre-fetched data (Fresh Review)

The skill already passed all data inline. Extract:
- PR number, title, body, author, base/head branches, additions/deletions, URL
- Linked issue (number, title, body, labels) or "none"
- Changed files list
- Full diff (may be truncated if >3000 lines)

Zero Bash in this step.

### Step 2 — Invoke reviewer (Fresh Review)

Invoke `reviewer` in **fresh mode** via Task tool, passing ALL data inline:

```
mode: data-provided
PR: #{number}
Title: {title}
Author: {author}
Base: {base}
Head: {head}
Additions: +{N}
Deletions: -{N}
URL: {url}
Body: {body}
Linked Issue: #{issue_number} or "none"
Issue Title: {title} or "N/A"
Issue Body: {body} or "N/A"
Issue Labels: {labels} or "N/A"
Changed Files:
{file list}
Full Diff:
{diff}
```

### Step 2b — Invoke reviewer (Update Body)

Invoke `reviewer` in **update-body mode** via Task tool:

```
mode: update-body
PR: #{number}
Title: {title}
Author: {author}
URL: {url}
Existing review ID: {review_id}
Existing review body: {current body text}
Changed Files:
{file list}
Full Diff:
{diff}
```

Take `review_body` from the reviewer's status block and write it to `.claude/pr-review-draft.md`. Jump to Step 3.

### Step 2c — Invoke reviewer (Reply)

Invoke `reviewer` in **reply mode** via Task tool:

```
mode: reply
PR: #{number}
Title: {title}
Author: {author}
URL: {url}
Thread context:
  comment_id: {selected_id}
  path: {file path}
  line: {line number}
  original_body: {the inline comment text}
Changed Files:
{file list}
Full Diff:
{diff}
```

Take `reply_body` from the reviewer's status block and write it to `.claude/pr-review-reply-draft.md`. Return to the skill:
```
Reply draft written to .claude/pr-review-reply-draft.md
Thread ID: {comment_id}
```

The skill handles user approval and publishing via `POST .../comments/{id}/replies`.

### Step 3 — Build draft

Take `review_body` from the reviewer's status block and write it to `.claude/pr-review-draft.md`.

**Validation:** If `review_body` is empty, re-invoke reviewer once. If still empty, return `status: failed`.

Read `.claude/pr-review-draft.md` back to confirm it was written correctly.

If the reviewer also returned `inline_findings`, write them to `.claude/pr-review-inline.json` (fresh mode only).

Return to the skill:
```
Review draft written to .claude/pr-review-draft.md
Decision: {APPROVE or CHANGES_REQUESTED}
```

The skill handles user approval and publishing.

---

## Translate Mode

When invoked with `Direct Mode Task: translate`:

The `/translate` skill passes mode, submode, scope, and language configuration.

### Submode: glossary-only

Skip to Step 2 with `mode: glossary-only`. No code modification, no parallelism needed. Report glossary and stop.

### Submode: translate-only

Skip to Step 4 (Parallel dispatch) with existing glossary and i18n setup. Useful for incremental translation after new strings are added.

### Submode: full (default) — Parallel Pipeline

```
Step 1   Setup session-docs
Step 2   Translator (sequential): Discovery + Glossary + i18n Setup  [Phase 0-2]
Step 3   Evaluate parallelism: split inventory by module
Step 4   N Translators (parallel worktrees): Extract + Replace        [Phase 3-4]
Step 5   Translator (sequential): Merge locales + Build verify        [Phase 5]
Step 6   Report to user
```

### Step 1 — Setup session-docs

1. Create `session-docs/{feature-name}/` if it doesn't exist
2. Write initial `00-state.md` with `phase: translate`, `status: in_progress`

### Step 2 — Discovery + Glossary + i18n Setup (sequential)

Invoke `translator` in **full mode** via Task tool with:
- Feature name
- Scope: directory path or "full project"
- Source language: `es` (Spanish)
- Target language: `en` (English neutral)
- Instruction: "Run Phase 0 (Discovery), Phase 1 (Glossary), and Phase 2 (i18n Setup) ONLY. Do NOT proceed to Phase 3 or Phase 4. Save the glossary to `docs/glossary.md`, write the string inventory to `session-docs/{feature}/00-translation.md`, and return. Include in your status block: `framework`, `i18n-library`, `locale-dir`, `key-convention`, `interpolation-syntax`, and `module-split` (proposed directory groupings with string counts)."

Gate: if `status: failed` → read `00-translation.md` to diagnose, report to user.
Gate: if `status: blocked` → relay the blocker.

**Expected status block extras:**
```
framework: {react|next|vue|angular|svelte|...}
i18n-library: {react-i18next|next-intl|vue-i18n|...}
locale-dir: {path to locale directory}
key-convention: {namespace}.{section}.{descriptor}
interpolation-syntax: {t('key')|$t('key')|...}
module-split:
  - namespace: auth, dir: src/pages/auth/, strings: 45
  - namespace: dashboard, dir: src/pages/dashboard/, strings: 82
  - namespace: common, dir: src/components/, strings: 63
  - namespace: settings, dir: src/pages/settings/, strings: 28
total-strings: 218
```

### Step 3 — Evaluate parallelism

Read the `module-split` from the translator's status block and decide:

- **≤50 strings total OR ≤2 modules** → skip parallelism, re-invoke single translator in `translate-only` mode to handle Phase 3-4-5 sequentially. Jump to Step 5b.
- **>50 strings AND >2 modules** → proceed to parallel dispatch (Step 4).

This threshold avoids the overhead of worktrees + tmux for small projects.

### Step 4 — Parallel dispatch (Phase 3-4)

For each module in the `module-split`, invoke a `translator` in **parallel-batch mode** via worktree + tmux:

```
For each module:
  Invoke translator with:
    mode: parallel-batch
    feature: {feature-name}
    glossary: docs/glossary.md
    i18n-config:
      framework: {from Step 2}
      library: {from Step 2}
      key-convention: {from Step 2}
      interpolation-syntax: {from Step 2}
    namespace: {module namespace}
    files: {list of files in this module's directory}
    locale-dir: {from Step 2}
    source-language: es
    target-language: en
```

**Rules:**
- Launch ALL modules in the same message (parallel Task tool calls) if ≤5 modules. If >5 modules, batch into rounds of 5 (concurrency cap).
- Each translator writes locale fragments (`{namespace}.en.json`, `{namespace}.es.json`) and modifies only its assigned files.
- Each translator returns a status block with `strings-translated`, `files-modified`, and any `issues`.

**Gate per batch:** if any translator returns `status: failed`, read its report, diagnose, and re-invoke that single batch (max 2 retries). Other successful batches are NOT re-run.

### Step 5 — Merge + Build verify (sequential)

After ALL parallel batches return `status: success`:

Invoke `translator` in **merge mode** via Task tool with:
- Feature name
- locale-dir: `{from Step 2}`
- glossary: `docs/glossary.md`
- Instruction: "Merge all locale fragment files (`{namespace}.en.json`, `{namespace}.es.json`) into final `en.json` and `es.json`. Delete fragments. Run the project build. Produce the final `00-translation.md` report with aggregated stats."

Gate: if build fails → translator fixes, max 2 retries. If still failing → report to user with build error.

### Step 5b — Sequential fallback (small projects)

If Step 3 decided to skip parallelism, invoke single `translator` in `translate-only` mode:
- Reads existing glossary and i18n setup
- Runs Phase 3 → Phase 4 → Phase 5 sequentially
- Writes final `00-translation.md`

Gate: if build fails → re-invoke with error, max 2 retries.

### Step 6 — Report to user

Present:
- Summary: strings translated, files modified, glossary terms, modules processed
- Parallelism: N modules in parallel / sequential fallback
- Glossary location: `docs/glossary.md`
- Locale files location: `{locale-dir}/en.json`, `{locale-dir}/es.json`
- Translation report: `session-docs/{feature-name}/00-translation.md`
- Next steps: review translations, add language switcher, configure locale detection
