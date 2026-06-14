---
name: setup
description: Configure Team Harness — MCP servers, workspace mode, and orchestrator dispatch rule. Run after installing the plugin or to reconfigure.
---

Configure the Team Harness system. Run this after installing the plugin or to reconfigure existing settings.

## Steps

### 0. Version-staleness guard (run first, before any configuration)

Before configuring anything, verify that this setup skill is running on the latest published `th` version. A stale plugin runs stale setup/update logic; catching it here prevents the operator from configuring against an out-of-date contract. This guard is advisory — it warns and recommends, but never hard-blocks: the operator may choose to proceed.

This mirrors `/th:update` Steps 1–4. Run quietly; emit operator-facing output only when a staleness warning or an inconclusive-check note is warranted.

1. **Refresh the marketplace catalog.** Run `claude plugin marketplace update team-harness-marketplace`. If `claude` is not on PATH, or the command fails (for example, offline), do NOT block setup: note one line (`Version-staleness check skipped: <reason>.`) and continue to Step 1. The guard is advisory; an inability to check is not a reason to halt configuration.

2. **Read the latest available version.** Read `~/.claude/plugins/marketplaces/team-harness-marketplace/.claude-plugin/marketplace.json` (refreshed by the previous command) with the Read tool — not a shell `cat` — so the path resolves portably on Windows, macOS, and Linux. Take the `version` field of the `th` entry under `plugins`. If the file is missing, note the path checked and continue to Step 1 (do not fabricate a version).

3. **Capture the installed version.** Run `claude plugin list` and parse the `th@team-harness-marketplace` block for its `Version:` value. If the plugin is not listed (for example, a Go-installer install), skip the comparison and continue to Step 1.

4. **Compare (semantic-version ordering).**
   - **Installed < latest (stale):** WARN the operator and RECOMMEND updating before continuing. Present:
     ```
     Setup is running on a stale th version.
       installed version  <X>
       latest version     <Y>
     Recommended: run /th:update, then /reload-plugins, then re-run /th:setup
     so configuration runs against the current contract.
     ```
     Ask whether to proceed with setup anyway or stop to update first. If the operator proceeds, continue to Step 1. Do NOT hard-block.
   - **Installed == latest:** continue to Step 1 silently (no version output).
   - **Installed > latest:** note both versions and that the catalog may not have propagated the latest release yet, then continue to Step 1.

This guard never writes any file; it only reads versions and, when stale, advises the operator.

### 1. Detect installation mode

Read `~/.claude/.team-harness.json`. If the file exists, this is a reconfiguration — show current values. If missing, this is a first-time setup — create the file with defaults.

### 2. Configure MCP servers

The system requires two MCP servers: **Memory** (Knowledge Graph) and **context7** (library docs).

**Memory MCP:**
1. Ask the user for the Memory MCP URL. Example format: `https://your-mcp.example.com/mcp`
2. Optionally ask for a bearer token (if the server requires authentication).
3. Read `~/.claude.json` and merge the memory MCP entry:
   ```json
   "memory": {
     "type": "url",
     "url": "<user-provided-url>",
     "headers": { "Authorization": "Bearer <token>" }
   }
   ```
   Omit `headers` if no token was provided.
4. Back up `~/.claude.json` before writing (copy to `~/.claude.json.bak-YYYYMMDD-HHMMSS`).

**context7 MCP:**
1. Ask the user for their Context7 API key. Get one at https://context7.com/
2. Merge the context7 MCP entry:
   ```json
   "context7": {
     "command": "npx",
     "args": ["-y", "@upstash/context7-mcp"],
     "env": {
       "DEFAULT_MINIMUM_TOKENS": "10000",
       "CONTEXT7_API_KEY": "<user-provided-key>"
     }
   }
   ```

If both entries already exist in `~/.claude.json`, show current values and ask whether to keep or change each one.

### 3. Configure workspace output mode

Ask the user to choose where pipeline workspaces are stored:

- **local** (default) — `./workspaces/` relative to each project
- **obsidian** — stored in an Obsidian vault for cross-project visibility

If obsidian mode:
1. Ask for the vault path (absolute path to vault root).
2. Ask for the subfolder within the vault (default: `work-logs`).
3. Verify the vault path exists. If not, warn and ask to confirm or re-enter.

### 3.5. Configure default language

Ask the operator for the default language for agent responses and workspace prose. This setting persists across all future sessions.

- **Prompt:** `Default language for agent responses (ISO 639-1 code, e.g. en, es, pt, fr, de). Press Enter to keep current value or use "en" as default:`
- Show the current configured value from `~/.claude/.team-harness.json` `language` field (if present) as the default hint.
- Accept any two-letter ISO 639-1 code (`[a-z]{2}`). Validate: if the input is not exactly 2 lowercase letters, warn and ask again.
- If the operator presses Enter without input, keep the existing value (or `en` if none is set).
- Persist the chosen value as the `language` key in `~/.claude/.team-harness.json` via **merge-write of the complete document**: read the full JSON, replace or add only the `language` key, write the whole document back. Never emit a partial payload — this preserves `logs-mode`, `logs-path`, `logs-subfolder`, `files`, `clickup`, `pricing`, and all other existing keys.

### 4a. Write orchestrator dispatch rule

Read the canonical block from `managed-blocks/orchestrator-dispatch-rule.md` (resolved from the plugin cache: `~/.claude/plugins/cache/team-harness-marketplace/th/<highest-version>/skills/setup/managed-blocks/orchestrator-dispatch-rule.md`).

Read `~/.claude/CLAUDE.md`. Apply idempotently: if both the start and end markers of the orchestrator-dispatch-rule block are present, replace the content between those markers (inclusive) with the canonical block. Otherwise append the block at the end of the file.

Also check for legacy markers (`<!-- th-orchestrator-inline-rule:start -->` or `<!-- th-orchestrator-dispatch-rule:start -->`) and replace them with the current version.

The canonical block (source of truth in `managed-blocks/orchestrator-dispatch-rule.md`):

<!-- orchestrator-dispatch-rule:start -->
## orchestrator dispatch

**Foundation — the top-level agent IS the orchestrator.** Team Harness runs on Claude Code's native general-agent architecture: the top-level agent has `Task` and dispatches leaf agents (th:architect, th:implementer, th:tester, th:qa, th:security, th:delivery) DIRECTLY. This is not a mode — it is the CC architecture. No filesystem marker is required. Inline orchestration at top level is PERMITTED at all times; it is the expected and correct behavior. Executing the orchestrator role inline when the agent is itself running as a subagent inside another orchestrator is the ad-hoc improvisation that weakens gate enforcement and is PROHIBITED — use the opencode/legacy FALLBACK described below.

**Development tasks route through the full pipeline.** Route each development task (features, fixes, refactors, enhancements, hotfixes, issue work, review) through the full pipeline (architect → implementer → tester + qa + security → delivery) with quality gates at each stage boundary. Do not skip stages or substitute yourself for a subagent — the pipeline runs in full or stops with a real error.

**Operator-declared fast path.** The operator — and only the operator — may request a lighter pipeline; the orchestrator never shrinks it on its own. Declarations: `--fast` for a very small change (a version bump, a one-line edit) skips the plan review, qa, and security stages; `[TIER: 0]` / `[TIER: 1]` for trivial or docs-only fixes; or Simple Mode keywords (`simple`, `just implement`, `skip tests`). In every case Specify and Delivery still run — every change is spec'd, branched, committed, and shipped as a PR — and security still runs on security-sensitive paths (`auth`, `api`, `db`, `crypto`, `session`) regardless of the declaration.

**Respect `~/.claude/.team-harness.json` configuration.** This file controls workspace output mode (`logs-mode`: local or obsidian), vault path (`logs-path`), subfolder (`logs-subfolder`), and default language (`language`). The orchestrator reads this at pipeline start. Do not override these values or hard-code paths — the operator configured them via `/th:setup`.

**Language propagation.** The configured `language` governs two surfaces: (a) pipeline dispatch — when dispatching the orchestrator, resolve the operator's language using the 4-level precedence chain and include it in the prompt: `Operator language: {code}. Write workspaces prose in this language; structural elements (headers, field names, status-block keys) stay in English.` Precedence: (1) session override in `00-state.md` → (2) `language` key in `~/.claude/.team-harness.json` → (3) detection from the operator's first message → (4) `en`; (b) non-pipeline sessions — the `session-start.sh` unified SessionStart hook reads the same config key and injects a one-time `additionalContext` directive instructing the agent to respond in the configured language for the whole session. An explicit per-session override from the operator takes precedence over the hook directive for that session. This ensures both pipeline agents and ordinary conversational turns respond in the operator's configured language.

**Outward-action gate.** Outward actions (git push, gh pr merge/review/comment, GitHub API writes, ClickUp MCP writes) require explicit operator approval via the deterministic gate `hooks/dev-guard.sh`, which fires UNCONDITIONALLY. The agent cannot auto-approve these actions. Security floors are non-waivable. Full contract: `docs/dev-mode.md § Outward-Action Gate`.

**Report team-harness problems via `/th:report-issue`.** When a bug, gap, or improvement is detected in the `th` plugin itself — its agents, skills, or any orchestrator behavior — report it with `/th:report-issue <bug|feature|docs|question> "<summary>"`, not with `gh issue create` directly and not by editing files under the plugin cache (those edits are transient and are overwritten on the next `th:update`). The skill builds the correct issue pattern (Summary, Environment with `th`/Claude Code/OS versions), de-duplicates against open issues, and requires confirmation before creating; a manual `gh issue create` skips that pattern and the dedup check.

**FALLBACK — opencode/legacy nested-context path.** When `th:orchestrator` is invoked via `Agent(subagent_type='th:orchestrator', ...)` from a nested context (e.g. opencode or a chained dispatch) and the harness strips its `Task` tool, the orchestrator emits a `dispatch_handoff` directive. Top-level Claude MUST parse the `dispatch_handoff` JSON, dispatch the named agent via `Task`, and continue the pipeline. This takeover machinery is RETAINED for opencode compatibility but is NOT the primary path on the CC foreground path (where nested subagents retain `Task`). Full protocol: `docs/subagent-orchestration.md`.
<!-- orchestrator-dispatch-rule:end -->

### 4e. Copy the developer-mode output style

Copy the output style idempotently from the plugin cache (`~/.claude/plugins/cache/team-harness-marketplace/th/<highest-version>/`), overwriting any existing version. Create the target directory if absent.

1. **Output style** (the optional strong floor): `output-styles/developer-mode.md` -> `~/.claude/output-styles/developer-mode.md`.

After the copy, tell the operator:

```
Orchestrator disposition configured.
  Gate:    outward actions (git push, gh pr merge/review/comment) require explicit approval (unconditional)
  Style:   /config -> Output style -> developer-mode  (optional — replaces coding instructions with orchestrator contract)
```

**The `developer-mode` output style is NOT force-installed** (`force-for-plugin` is false). The orchestration disposition is always active; the output style is an opt-in strong floor for operators who want `keep-coding-instructions: false`. Force-for-plugin is intentionally omitted to preserve the per-operator escape hatch (see `docs/dev-mode.md § Default-on disposition`).

### 4c. Write voice-rule block

Read the canonical block from `managed-blocks/voice-rule.md` (resolved from the plugin cache: `~/.claude/plugins/cache/team-harness-marketplace/th/<highest-version>/skills/setup/managed-blocks/voice-rule.md`).

Read `~/.claude/CLAUDE.md`. Apply idempotently: if both the start and end markers of the voice-rule block are present, replace the content between those markers (inclusive) with the canonical block. Otherwise append the block at the end of the file.

The canonical block (source of truth in `managed-blocks/voice-rule.md`):

<!-- voice-rule:start -->
## Voice — neutral register, no regional idioms

Use neutral, standard language that reads the same to a reader from any country. Do NOT use country-specific idioms, regionalisms, or local slang of any particular nation. This applies to every response, in any language — there is no informal-chat-mode exception.

- Prefer the standard, neutral form of a word over its regional or colloquial variant.
- No localisms, no dialect slang, no colloquial anglicisms (`shippeo`, `bakeado`, `wrappear`) — use the formal equivalent (`publicar`, `incorporado`, `encapsular`).
- Keep the tone declarative and professional; the reader's country should not be inferable from word choice.
<!-- voice-rule:end -->

### 5. Write manifest

Write `~/.claude/.team-harness.json` with:
```json
{
  "format_version": "1",
  "installed_version": "<read from plugin or 'plugin'>",
  "updated_at": "<current ISO timestamp>",
  "logs-mode": "<local|obsidian>",
  "logs-path": "<vault path or empty>",
  "logs-subfolder": "<subfolder or empty>",
  "language": "<ISO 639-1 code, e.g. 'en' or 'es'; omit key if not configured>"
}
```

Preserve ALL existing fields (like `files`, `clickup`, `pricing`) if the manifest already exists. Use the **merge-write-whole-document** contract: read the full JSON, replace or add only the keys this step owns (`format_version`, `installed_version`, `updated_at`, `logs-mode`, `logs-path`, `logs-subfolder`, and optionally `language`), write the whole document back. NEVER emit a partial payload — that would destroy `files`, `clickup`, `pricing`, and any other operator-configured key.

The `language` key is written only when the operator provided a value in Step 3.5; if they left it blank and no prior value existed, omit the key entirely (absence of the key means detection-based behavior, which is the default).

### 6. Verify connectivity

Test each MCP server:
- **Memory:** call `mcp__memory__read_graph` (or equivalent). Report success or failure.
- **context7:** call `mcp__context7__resolve-library-id` with a test query like `react`. Report success or failure.

If a server fails, show the error and suggest troubleshooting steps (check URL, check API key, check network).

### 6b. Runtime probe — python3 presence

After MCP config, run one python3 presence probe and act on the result. This step is advisory — setup always completes regardless of the outcome.

Run: `command -v python3`

**If python3 is available:** continue silently (no output for this step; the summary row will show `python3: available`).

**If python3 is absent:**

Report the degraded-mode advisory:
```
python3 not found on PATH.
  The policy gate (hooks/policy-block.sh) will run in degraded mode:
    - Bash denylist and sensitive-path checks still enforced (bash fallback active)
    - HIGH_CONFIDENCE_SECRETS scan still enforced (bash fallback active)
    - Medium-confidence entropy scan NOT available (requires python3)
  For full coverage, install python3.
```

Then offer an explicit consent prompt:

## python3

```
Install python3 now for full secret/entropy scan coverage? [Y/n]
```

**On `n` (decline or no input):** print the above degraded-mode advisory summary and continue to Step 7. No install attempted. Setup completes normally.

**On `Y` (consent):** run the OS-appropriate install command:

- **Windows:** run `winget install -e --id Python.Python.3.12`
  - If `winget` is absent: print `winget not found. Install python3 manually: https://www.python.org/downloads/` and continue.
  - If the command exits non-zero: print the error and the manual URL, then continue.
- **macOS:** run `brew install python3`
  - If `brew` is absent: print `brew not found. Install python3 manually: https://www.python.org/downloads/` and continue.
  - If the command exits non-zero: print the error and continue.
- **Linux:** detect the available manager in order (`apt-get` → `dnf` → `pacman`):
  - `apt-get`: run `sudo apt-get install -y python3`
  - `dnf`: run `sudo dnf install -y python3`
  - `pacman`: run `sudo pacman -S --noconfirm python`
  - The skill never escalates privileges itself. If `sudo` elevation fails, print the exact command for the operator to run manually and continue.
  - If no manager is found: print manual install instructions and continue.

**Post-install re-probe:** after a consented install, run `command -v python3` again.
- If python3 is now on PATH: report `python3 installed — full secret/entropy scan now active.`
- If python3 is still absent (re-probe fails): **Windows caveat** — a winget-installed python3 may not appear on PATH in the current Git Bash session. When the re-probe fails immediately after a reported-successful winget install, report `python3 installed — restart the terminal for PATH refresh` (not an error). On other platforms: report the degraded-mode advisory and continue.

**Failed install, absent manager, or elevated command declined:** fall back to the degraded-mode advisory printed above. The bash fallback floor (hooks/policy-block.sh bash path) remains the enforcement guarantee. This path changes nothing in the hook's runtime behaviour.

---

### 7. Show summary

Display a structured summary:

```
Team Harness setup complete.

  Memory MCP:  connected (https://your-mcp.example.com/mcp)
  context7:    connected (API key: ****...abcd)
  Workspaces:  obsidian (D:\vault\Work\work-logs)
  Agents:      22 registered
  Skills:      38 available

  Entry point: /th:orchestrator or talk to Claude directly
  Reconfigure: /th:setup
```

### 8. Idempotency

This skill can be run multiple times safely. Each run:
- Shows current config values as defaults
- Only writes files that changed
- Backs up `~/.claude.json` before every write
- Never deletes existing MCP server entries (only adds or updates memory + context7)

---

## Output Discipline

See `agents/_shared/output-template.md` § "Output Discipline" for the full contract. Step 6 (MCP verification) is the primary silent-on-success operation in this skill: a successful connectivity probe produces no operator-facing output beyond the final summary table in Step 7. A failed probe surfaces one line of error + one line of suggestion, then continues to Step 7 to report the failure in the summary.
