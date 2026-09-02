name: lint

Validate the health of agents and skills in this dev-team system. Run all 12 checks below **in sequence**, then show the consolidated report.

**IMPORTANT:** This skill runs directly — do NOT invoke the `th:orchestrator` agent or any other agent. Execute all checks yourself using the tools available to you (Bash, Glob, Read, Grep).

## Voice

See `agents/_shared/operational-rules.md` § "Voice" and § "Language register" for the full
voice and dialect-neutrality contract. It applies to every response this skill produces —
chat replies, status blocks, error messages, and self-corrections alike.

## Check 1 — agnix (config linting)

1. Run: `agnix --strict .`
2. Capture stdout and stderr
3. Classify output lines:
   - Lines containing `error` → errors
   - Lines containing `warn` → warnings
   - Lines containing `info` → infos
4. Result:
   - **PASS** if 0 errors and 0 warnings
   - **WARN** if 0 errors but warnings exist
   - **FAIL** if any errors exist → suggest running `agnix --fix .`

---
name: lint

## Check 2 — Sync between project and global

Compare files in **both directions** between these pairs:

| Project path | Global path |
|---|---|
| `agents/` | `~/.claude/agents/` |
| `.claude/commands/` | `~/.claude/commands/` |

For each pair:
1. Use Glob to list all `.md` files in both directories
2. For files present in both: use Read to compare contents. If they differ, report as **different**
3. For files only in project: report as **missing from global**
4. For files only in global: report as **extra in global** (not necessarily an error — could be other projects)

Result:
- **PASS** if all project files exist in global with identical content
- **WARN** if there are extras in global but project files are synced
- **FAIL** if any project file is missing from global or has different content

---
name: lint

## Check 3 — Agent structure validation

For each `.md` file in `agents/`:

1. **Skip** `orchestrator.md` (it has a different structure as the coordination agent)
2. For all other agent files, check that these **mandatory sections** exist (as `## Section Name` headings):
   - `## Core Philosophy`
   - `## Session Context Protocol`
   - `## Session Documentation`
   - `## Execution Log Protocol`
   - `## Return Protocol`
3. Report which sections are missing from which agents

Result:
- **PASS** if all worker agents have all mandatory sections
- **WARN** — not used for this check
- **FAIL** if any agent is missing any mandatory section

---
name: lint

## Check 4 — Guardrails validation

For each `.md` file in `agents/`:

1. **Skip** these files (they have their own guardrail model or Write/Edit IS their job):
   - `orchestrator.md` — coordination agent, different structure
   - `diagrammer.md`, `d2-diagrammer.md`, `likec4-diagrammer.md` — generate diagram files (Write/Edit is their core function)
   - `init-project.md` — generates CLAUDE.md (Write/Edit is its core function)
2. For each remaining agent, check its tool grants (from frontmatter or Tool Scoping section) and verify:
   - **Agents with Bash access** must have anti-patterns that mention destructive commands (e.g., `rm -rf`, `git push --force`, `drop table`, or similar)
   - **Agents with Write/Edit access** must have a section or statements about what they NEVER do (e.g., `NEVER implement code`, `NEVER modify files directly`)
   - **PR review agents** (`reviewer`, `pr-review-qa`, `pr-review-security`,
     `reviewer-consolidator`) must expose only their documented read/search allowlist, with no
     process execution, filesystem mutation, or delegation. Validate any generated Codex
     projection against the same list; absence means Codex dispatch is unavailable.
3. Report which agents are missing guardrails for their capability level

Result:
- **PASS** if all agents have appropriate guardrails for their tool access
- **WARN** if any agent is missing guardrails (not blocking, but should be fixed)
- **FAIL** if a PR review agent grants an additional capability; other guardrail findings remain
  advisory warnings.

---
name: lint

## Check 5 — orchestrator coherence

Cross-reference the canonical roster against actual agent files.

1. **Read `agents/README.md § Roster`** and extract each `Agent`, `Tools
   (allowlist)`, and `Role` row.
2. **List all `.md` files in `agents/`** excluding `README.md`,
   `ref-*.md`, and `_shared/`.
3. **Cross-check:**
   - every roster agent has exactly one matching `agents/{agent}.md`;
   - every listed agent file appears exactly once in the roster;
   - no retired agent name remains in either surface.
4. **Workspace-output conflicts:** Extract declared report/output paths from
   each agent contract. Report two agents that claim exclusive ownership of the
   same path; do not infer paths from a removed roster column.
5. **Direct modes coherence:** Read `agents/orchestrator.md § Direct routing`.
   For each specialist named there, verify it exists in the roster and as a
   file.

Result:
- **PASS** if roster, files, direct routes, and exclusive outputs agree.
- **WARN** if a contract names a shared output but does not define bounded
  section ownership.
- **FAIL** for a missing/duplicate/retired roster entry, missing agent file,
  nonexistent direct-route specialist, or conflicting exclusive output owner.

---
name: lint

## Check 6 — Cross-agent consistency

Analyze agent definitions for contradictions and overlap.

1. **Role boundary check:** For each agent, extract its "NEVER" statements
   (for example, "NEVER writes code" or "NEVER modify files"). Cross-check
   them against the `Tools (allowlist)` and `Role` columns in
   `agents/README.md § Roster` plus the agent's declared write scope. Report
   any contradiction; do not depend on a removed `Writes code` column.
2. **Workspace-doc write conflicts:** For each agent, search for the workspace doc filename it writes to (from `## Session Documentation` section or output references). Verify no two agents write to the same file. Report conflicts.

Result:
- **PASS** if no contradictions or write conflicts found
- **FAIL** if role boundary contradictions or workspace doc write conflicts exist

---
name: lint

## Check 8 — Hook runtime health

Verify that each wired hook script is healthy and that the runtime environment supports the full gate coverage.

1. **python3 probe:** run `command -v python3`. If absent:
   - Report `[WARN] policy gate running degraded — install python3 for the full secret/entropy scan; the bash fallback still enforces the high-confidence floor`
   - Note: `hooks/dev-guard.sh` is also affected (grep fallback active)
2. **Wired-script-resolves-on-disk:** for each hook script referenced in `.claude-plugin/hooks.json` (and/or `~/.claude/settings.json` when readable), verify the script path resolves on disk via the documented chain:
   - `~/.claude/plugins/cache/team-harness-marketplace/th/<highest-version>/hooks/<script>` (plugin installs)
   - `~/.claude/hooks/<script>` (Go-installer installs)
   - `./hooks/<script>` (team-harness clone)
   For each script that does not resolve via any chain path:
   - Report `[FAIL] <hook-script> wired but not found on disk — gate is dead`

Result:
- **PASS** if python3 is available and all wired hook scripts resolve on disk
- **WARN** if python3 is absent (degraded mode — bash fallback enforces the high-confidence floor; entropy scan unavailable)
- **FAIL** if any wired hook script does not resolve on disk (gate is dead)

---
name: lint

## Check 7 — Model + effort matrix (canonical)

Enforce the canonical `model` + `effort` assignment from the Roster table in `agents/README.md`. Drift between any agent's frontmatter and the README table fails the check.

Canonical matrix (must match exactly):

| Agent | Model | Effort |
|---|---|---|
| `orchestrator` | opus | high |
| `architect` | opus | xhigh |
| `agent-builder` | opus | xhigh |
| `security` | opus | xhigh |
| `adversary` | sonnet | xhigh |
| `reviewer` | sonnet | high |
| `pr-review-qa` | sonnet | high |
| `pr-review-security` | sonnet | high |
| `reviewer-consolidator` | sonnet | medium |
| `qa` | opus | xhigh |
| `gcp-cost-analyzer` | opus | high |
| `init-project` | haiku | medium |
| `implementer` | sonnet | high |
| `tester` | sonnet | high |
| `documenter` | sonnet | high |
| `diagrammer` | sonnet | medium |
| `likec4-diagrammer` | sonnet | medium |
| `d2-diagrammer` | sonnet | medium |
| `translator` | sonnet | medium |
| `delivery` | sonnet | medium |

For each `.md` in `agents/` (excluding `ref-*.md` and `README.md`):

1. Read the YAML frontmatter and extract `model` and `effort`.
2. Look up the expected values for that agent in the matrix above.
3. **Mismatch:** report `FAIL` with the specific field, expected vs. actual.
4. **Forbidden value:** if `effort: low` is present anywhere, report `FAIL` (the project floor is `medium`).
5. **Missing field:** if `effort` is absent on a non-reference agent, report `FAIL`.
6. **Unknown agent:** if an agent file exists but isn't in the matrix, report `WARN` (could be a new agent that hasn't been added to the README yet).

Result:
- **PASS** if every agent matches the canonical matrix and no `effort: low` exists
- **WARN** if an agent file isn't in the matrix
- **FAIL** if any model/effort mismatch, missing `effort`, or `effort: low` is found

---
name: lint

## Check 9 — Skill overlap (SEARCH-BEFORE-CREATE / dedup)

Detect near-duplicate skills so the team does not accumulate redundant slash commands. REPORT-only — this check never deletes or rewrites a skill. Never FAIL.

**Modes:**

- **Standing audit (default):** compare every skill in `skills/` against every other skill and report overlapping pairs.
- **Search-before-create (when `$ARGUMENTS` carries `--against "<name> | <description> | <keywords>"`):** compare one proposed skill against the existing corpus and report the nearest matches, with a verdict: `Proceed (no near-duplicate) | Review (near-duplicate <name> exists — extend it instead)`.

**Dedup heuristic (lexical, deterministic — no model call):**

For each skill, build a comparison profile from its `SKILL.md`:
- `name` — the frontmatter `name` (or directory name if frontmatter is absent).
- `desc_tokens` — lowercased word set of the frontmatter `description`, minus stopwords (`the, a, an, and, or, to, of, for, in, on, with, use, when, this, that, run`).
- `keyword_tokens` — union of `desc_tokens`, the routing class (`orchestrator` | `standalone`), and any verb in the skill name.

Compute three overlap signals per pair (A, B):
1. **Name overlap** — `1.0` if `name_A` is a substring of `name_B` or vice versa; else token-set Jaccard of hyphen-split names.
2. **Description Jaccard** — `|desc_tokens_A ∩ desc_tokens_B| / |desc_tokens_A ∪ desc_tokens_B|`.
3. **Trigger-keyword overlap** — count of shared high-signal keywords after stopword removal.

Classify the pair:
- **`[WARN] near-duplicate`** — description Jaccard ≥ 0.50 **OR** (name overlap ≥ 0.60 AND description Jaccard ≥ 0.30).
- **`[INFO] related`** — description Jaccard in [0.30, 0.50) and not already WARN.
- Below the INFO floor → not reported.

**Expected-overlap allowlist** — pairs in these families are intentionally adjacent; report as `[INFO]` only, never `[WARN]`:
- Diagram family: `diagram`, `d2-diagram`, `likec4-diagram`, `excalidraw-diagram`.
- Obsidian family: `obsidian-markdown`, `obsidian-bases`, `obsidian-cli`, `json-canvas`.

Result:
- **PASS** if no pair exceeds the INFO floor (beyond the allowlist).
- **WARN** if any `near-duplicate` pair is found outside the allowlist (advisory — the operator decides whether to consolidate).
- **Never FAIL** — dedup is advisory; the operator owns the consolidation decision.

---
name: lint

## Check 10 — Skill quality quick-scan

Apply a per-skill quality checklist as a quick scan. REPORT-only — this check never modifies a skill file. Never FAIL.

**Changed-only mode:** when `$ARGUMENTS` carries `--changed`, scan only skills whose `SKILL.md` differs from `git HEAD` (via `git diff --name-only HEAD -- skills/`). If git is unavailable, scan all skills and note the degradation. Without `--changed`, all skills are scanned.

**Quality checklist (Q1–Q5) per skill `SKILL.md`:**

| # | Criterion | Heuristic |
|---|-----------|-----------|
| Q1 | single responsibility | Frontmatter `description` present and ≤ 240 characters; opening line has a primary action verb (no "and also" multi-purpose framing). |
| Q2 | Voice-rule compliance | A `## Voice` block is present OR the skill references `agents/_shared/operational-rules.md`; body contains none of the forbidden enthusiasm/emoji markers (`✅`, `⚠️`, `🎉`, `✨`, "Perfecto", "Excelente", "Great job"). |
| Q3 | Output discipline | An `## Output Discipline` block is present (or an explicit Output Format contract section). |
| Q4 | No orphaned references | Every `agents/<x>.md`, `skills/<x>/`, `docs/<x>.md`, or `hooks/<x>` path referenced in the body resolves on disk. Unresolvable internal path → finding. |
| Q5 | Correct routing classification | The skill's actual behavior (declares "runs directly" / does NOT route to the orchestrator → standalone; builds a task payload and routes → orchestrator) matches its classification in `skills/README.md` Routing. Mismatch → finding. |

Result:
- **PASS** if every scanned skill satisfies Q1–Q5.
- **WARN** if any skill misses any criterion — lists `<skill>: missing <Qn> — <reason>` (advisory).
- **Never FAIL** — quality is advisory (parity with the Check 4 guardrails-are-advisory model).

---
name: lint

## Check 11 — Tools/MCP allowlist minimality

For each `.md` file in `agents/` (excluding `README.md` and `ref-*.md` reference files, which carry no `tools:` frontmatter):

1. Parse the frontmatter `tools:` (and `mcpServers:`, when present) line and extract every `mcp__memory__*` and `mcp__context7__*` entry.
2. For each entry, search the agent's body (everything after the closing `---`) for either the short tool name (`search_nodes`) or the fully-qualified name (`mcp__memory__search_nodes`). A mention preceded, within 60 characters, by a negation cue (`never`, `does not`, `do not`, `no longer`, `avoid`, …) does not count — this excludes a prose aside describing non-use (`"never invokes search_nodes"`) from reading as invocation evidence. Any other mention counts as invoked.
3. An entry with no genuine (non-negated) mention in either form is an unused grant — the agent declares access to an MCP tool it never calls, which is dead schema weight on every cold dispatch of that agent.

**Honesty note on what this check proves.** This is a text-level heuristic over a markdown system prompt, not proof of runtime invocation — a system prompt has no call sites in the code sense, only directives a model may or may not follow. The negation-aware matching narrows the specific false-positive class of a prose-only mention reading as usage; it does not eliminate every way prose can describe a tool without genuinely directing its use.

**Known, documented residuals (do not report as a new finding):** `agents/orchestrator.md`'s `mcp__memory__read_graph` and `agents/ux-reviewer.md`'s two context7 tools — both are deliberate, documented residuals.

Result:
- **PASS** if every agent's MCP grants are each matched by a body invocation (beyond the documented residuals above).
- **WARN** if any agent has an undocumented unused MCP grant — lists `<agent>: unused <tool> — remove from tools:/mcpServers: or add the invoking body text`.
- **FAIL** — not used for this check (mirrors Suite 175's own minimality guard, which is the enforced source of truth; this check is the human-facing summary of the same audit).

---
name: lint

## Check 12 — Authoring standard structure

Enforce the structural half of `docs/agent-authoring.md` deterministically.
File classes and budgets:

| Class | Files | Word budget | Hard cap |
|---|---|---|---|
| specialist | `agents/*.md` (excluding `README.md`, `ref-*.md`, `orchestrator.md`) | 2,000 | 500 lines |
| shared contract | `agents/_shared/*.md` | 1,500 | 500 lines |
| reference | `agents/ref-*.md`, `agents/*/` reference folders | — | TOC required over 100 lines |

For each file in scope:

1. **Budgets:** count words (`wc -w`) and lines (`wc -l`). Over 80% of the
   word budget → WARN naming the file, its count, and the budget. Over the
   hard line cap → FAIL. A reference file has no word budget; over 100 lines
   it must contain a table-of-contents block (a list of its own `##`
   headings) near the top — absence → FAIL.
2. **Description format:** frontmatter `description` present, one line,
   third-person, ≤ 240 characters → otherwise FAIL.
3. **Tools allowlist:** frontmatter `tools:` present and explicit on every
   specialist agent → absence FAIL. (`ref-*.md` and `README.md` carry no
   frontmatter and are exempt.)
4. **Reference depth:** collect `agents/ref-*.md` and `references/` paths
   cited in each reference file's body; a reference citing another reference
   that the reader must open to act (depth two) → WARN naming both files.
5. **Dangling section anchors:** for every cite of the form
   `` `file § "Heading"` `` or `file § Heading`, resolve the file and grep
   its headings for the quoted heading text. A cite whose file or heading
   does not exist → FAIL naming the citing file and the anchor.
6. **Retired phrases:** a contract names the helper that performs a
   deterministic classification and the vocabulary it returns; it never
   restates the helper's flag list, decision procedure, or attempt ordinals.
   Search `agents/**/*.md` and every `skills/**/SKILL.md` for this closed
   list — `classify-agent-failure`, `--contract-signal`, `--attempt {1|2}`,
   `retry-contract`, `agent-contract-invalid`, `absent after retry` — and
   FAIL naming the file and the phrase. This file states the list and is
   therefore not scanned against it; any other file is exempt only through
   the shrink-only map in `tests/test_retired_phrases.py`, whose entry names
   the change that removes it. An exempt file with no remaining phrase also
   FAILs, so the exemption cannot outlive its reason.

Result:
- **PASS** if every file fits budgets and formats and every anchor resolves.
- **WARN** for 80%-budget crossings and depth-two references.
- **FAIL** for a hard-cap breach, missing description/tools, missing TOC, a
  dangling anchor, or a retired phrase outside the exemption map.

---
name: lint

## Arguments

| Argument | Applies to | Description |
|----------|-----------|-------------|
| `--fix` | Check 2 | Auto-sync agents and skill files from project to global `~/.claude/`. Only Check 2 has an auto-fix path; Checks 9 and 10 are always REPORT-only. |
| `--against "<name> \| <description> \| <keywords>"` | Check 9 | Search-before-create mode: compare one proposed skill (by name, description, and trigger keywords) against the existing corpus. Reports the nearest matches and a proceed/review verdict. |
| `--changed` | Check 10 | Changed-only quality scan: restrict Check 10 to skills whose `SKILL.md` differs from `git HEAD`. Without this flag, all skills are scanned. |

---
name: lint

## --fix Mode

If the user invokes `/th:lint --fix` (check if `$ARGUMENTS` contains `--fix`):

After running all checks, **auto-fix sync issues from Check 2:**

1. For each agent file in `agents/` that is missing from `~/.claude/agents/`:
   - Copy the file: `cp agents/{file} ~/.claude/agents/{file}`
   - Report: "Deployed {file} → ~/.claude/agents/"
2. For each agent file that differs between project and global:
   - Overwrite: `cp agents/{file} ~/.claude/agents/{file}`
   - Report: "Updated {file} in ~/.claude/agents/"
3. For each skill `.md` file in `.claude/commands/` (project) that is missing from `~/.claude/commands/`:
   - Copy the file: `cp .claude/commands/{file} ~/.claude/commands/{file}`
   - Report: "Deployed {file} → ~/.claude/commands/"
4. For each skill file that differs:
   - Overwrite: `cp .claude/commands/{file} ~/.claude/commands/{file}`
   - Report: "Updated {file} in ~/.claude/commands/"

Report a summary of fixes applied after the main report.

If `--fix` is NOT present, skip this section entirely.

---
name: lint

## Output Format

Present the consolidated report using this exact format:

```
====================================
  /th:lint — Agent & Skill Health Check
====================================

--- Check 1: agnix config linting ---
Status: {PASS|WARN|FAIL}
{details: error/warning/info counts, or "All clean"}
{if FAIL: "Run `agnix --fix .` to auto-fix errors"}

--- Check 2: Project ↔ Global sync ---
Status: {PASS|WARN|FAIL}
Agents:  {N synced} / {N total} | {details of mismatches}
Skills:  {N synced} / {N total} | {details of mismatches}

--- Check 3: Agent structure ---
Status: {PASS|WARN|FAIL}
{for each agent with issues: "  {agent}: missing {section1}, {section2}"}
{if PASS: "All worker agents have required sections"}

--- Check 4: Guardrails validation ---
Status: {PASS|WARN}
{for each agent with issues: "  {agent}: has {capability} but missing {guardrail}"}
{if PASS: "All agents have appropriate guardrails for their tool access"}

--- Check 5: orchestrator coherence ---
Status: {PASS|WARN|FAIL}
Team table:  {N agents} referenced | {N matched} | {mismatches}
workspaces: {N unique} / {N total} | {conflicts or "no conflicts"}
Direct modes: {N agents} referenced | {mismatches or "all exist"}

--- Check 6: Cross-agent consistency ---
Status: {PASS|FAIL}
Role boundaries: {N checked} | {contradictions or "consistent"}
Write conflicts: {conflicts or "none"}

--- Check 7: Model + effort matrix ---
Status: {PASS|WARN|FAIL}
Agents checked: {N} | {N matched} | {mismatches or "all canonical"}
{for each mismatch: "  {agent}: model {actual}→{expected}, effort {actual}→{expected}"}
{if any effort: low found: "  {agent}: effort 'low' is forbidden — floor is 'medium'"}

--- Check 8: Hook runtime health ---
Status: {PASS|WARN|FAIL}
python3:  {available | WARN: absent — policy gate running degraded}
wired-scripts: {N resolved on disk | FAIL: <script> wired but not found on disk — gate is dead}

--- Check 9: Skill overlap (dedup) ---
Status: {PASS|WARN}
Mode: {standing audit | search-before-create (--against)}
{for each near-duplicate pair: "  [WARN] near-duplicate: <skill-A> ↔ <skill-B> (description Jaccard: 0.XX)"}
{for each related pair outside allowlist: "  [INFO] related: <skill-A> ↔ <skill-B> (description Jaccard: 0.XX)"}
{if --against mode: "Verdict: Proceed (no near-duplicate) | Review (near-duplicate <name> exists — extend it instead)"}
{if PASS: "No near-duplicate skill pairs detected"}

--- Check 10: Skill quality quick-scan ---
Status: {PASS|WARN}
Scope: {all skills | changed-only (--changed)}
{for each skill with issues: "  [WARN] <skill>: missing <Qn> — <reason>"}
{if PASS: "All scanned skills satisfy Q1–Q5"}

--- Check 11: Tools/MCP allowlist minimality ---
Status: {PASS|WARN}
{for each agent with an unused grant: "  [WARN] <agent>: unused <mcp-tool> — remove from tools:/mcpServers: or add the invoking body text"}
{if PASS: "All agents' MCP grants are matched by a body invocation"}

--- Check 12: Authoring standard structure ---
Status: {PASS|WARN|FAIL}
Budgets: {N within} / {N checked} | {for each breach: "  [WARN|FAIL] <file>: NNNN words / NNN lines (budget WWWW / cap CCC)"}
Anchors: {N resolved} / {N cited} | {for each dangling: "  [FAIL] <file>: unresolved anchor <file § heading>"}
{if PASS: "All files fit the authoring standard (docs/agent-authoring.md)"}

====================================
  Result: {X} / 12 checks passed
====================================
{if --fix applied: "\n--- Auto-fix applied ---\n{list of fixes}"}
```

Use these status icons in the output:
- PASS → `[PASS]`
- WARN → `[WARN]`
- FAIL → `[FAIL]`

Count only PASS as "passed" in the final summary. WARN and FAIL do not count as passed.

---

## Output Discipline

See `agents/_shared/output-template.md` § "Output Discipline" for the full contract. Each check runs silently; only the final consolidated report is presented to the operator. Individual tool calls (Bash, Grep, Glob, Read) produce no intermediate chat output.
