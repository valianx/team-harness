---
name: setup
description: Configure Team Harness — MCP servers, workspace mode, and orchestrator dispatch rule. Run after installing the plugin or to reconfigure.
---

Configure the Team Harness system. Run this after installing the plugin or to reconfigure existing settings.

## Steps

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

### 4a. Write orchestrator dispatch rule

Read the canonical block from `managed-blocks/orchestrator-dispatch-rule.md` (resolved from the plugin cache: `~/.claude/plugins/cache/team-harness-marketplace/th/<highest-version>/skills/setup/managed-blocks/orchestrator-dispatch-rule.md`).

Read `~/.claude/CLAUDE.md`. Apply idempotently: if both the start and end markers of the orchestrator-dispatch-rule block are present, replace the content between those markers (inclusive) with the canonical block. Otherwise append the block at the end of the file.

Also check for legacy markers (`<!-- th-orchestrator-inline-rule:start -->` or `<!-- th-orchestrator-dispatch-rule:start -->`) and replace them with the current version.

The canonical block (source of truth in `managed-blocks/orchestrator-dispatch-rule.md`):

<!-- orchestrator-dispatch-rule:start -->
## orchestrator dispatch

**Precondition — developer mode gates the pipeline.** The orchestrator and its pipeline run ONLY when developer mode is active (the `developer-mode` output style is loaded; observable via the filesystem marker `~/.claude/.dev-mode-active` containing `dev_mode: true`). **Without developer mode, the top-level agent handles the request DIRECTLY** — normal behavior, no orchestrator, no pipeline, no workspace. Developer mode is the opt-in; direct is the default. (The one exception is reporting team-harness problems via `/th:report-issue`, below — that never requires dev mode.)

**In developer mode — the agent IS the orchestrator.** When dev mode is active the top-level agent has `Task` and dispatches leaf agents (th:architect, th:implementer, th:tester, th:qa, th:security, th:delivery) DIRECTLY — no `dispatch_handoff`. It routes each development task (features, fixes, refactors, enhancements, hotfixes, issue work, review) through the full pipeline (architect → implementer → tester + qa + security → delivery) with quality gates at each stage boundary. Executing the orchestrator role inline is PERMITTED ONLY when the developer-mode output style is active (the contract is loaded); doing it WITHOUT dev mode — including reading `agents/orchestrator.md` "as reference" — is the ad-hoc improvisation that weakens gate enforcement and is PROHIBITED (without dev mode, work directly). If the operator explicitly invokes `Agent(subagent_type='th:orchestrator', ...)` outside dev mode, the nested-handoff/takeover machinery in `docs/subagent-orchestration.md` is the FALLBACK — but it is not the default path.

**Full pipeline is the default within dev mode.** When dev mode is active, a development task runs the complete pipeline unless the operator explicitly requests a lighter path. Do not skip stages or substitute yourself for a subagent — the pipeline runs in full or stops with a real error.

**Operator-declared fast path.** The operator — and only the operator — may request a lighter pipeline; the orchestrator never shrinks it on its own. Declarations: `--fast` for a very small change (a version bump, a one-line edit) skips the plan review, qa, and security stages; `[TIER: 0]` / `[TIER: 1]` for trivial or docs-only fixes; or Simple Mode keywords (`simple`, `just implement`, `skip tests`). In every case Specify and Delivery still run — every change is spec'd, branched, committed, and shipped as a PR — and security still runs on security-sensitive paths (`auth`, `api`, `db`, `crypto`, `session`) regardless of the declaration.

**Respect `~/.claude/.team-harness.json` configuration.** This file controls workspace output mode (`logs-mode`: local or obsidian), vault path (`logs-path`), and subfolder (`logs-subfolder`). The orchestrator reads this at pipeline start. Do not override these values or hard-code paths — the operator configured them via `/th:setup`.

**Language propagation.** When dispatching the orchestrator, detect the operator's chat language and include it in the prompt: `Operator language: {code}. Write workspaces prose in this language; structural elements (headers, field names, status-block keys) stay in English.` This ensures the orchestrator and all downstream agents write in the operator's language.

**Report team-harness problems via `/th:report-issue`.** When a bug, gap, or improvement is detected in the `th` plugin itself — its agents, skills, or any orchestrator behavior — report it with `/th:report-issue <bug|feature|docs|question> "<summary>"`, not with `gh issue create` directly and not by editing files under the plugin cache (those edits are transient and are overwritten on the next `th:update`). The skill builds the correct issue pattern (Summary, Environment with `th`/Claude Code/OS versions), de-duplicates against open issues, and requires confirmation before creating; a manual `gh issue create` skips that pattern and the dedup check.
<!-- orchestrator-dispatch-rule:end -->

### 4d. Write dev-mode block

Read the canonical block from `managed-blocks/dev-mode.md` (resolved from the plugin cache: `~/.claude/plugins/cache/team-harness-marketplace/th/<highest-version>/skills/setup/managed-blocks/dev-mode.md`).

Read `~/.claude/CLAUDE.md`. Apply idempotently: if both the start and end markers of the dev-mode block are present, replace the content between those markers (inclusive) with the canonical block. Otherwise append the block at the end of the file.

The canonical block (source of truth in `managed-blocks/dev-mode.md`):

<!-- dev-mode:start -->
## dev mode

**What it is:** An opt-in session mode where the top-level agent adopts the orchestrator role and dispatches leaf agents directly via Task — no nested subagent, no dispatch_handoff round-trip. Normal mode (general assistant) is the default; developer mode is the precondition for the orchestrated pipeline.

**Start it (in-session, no reload):** run `/dev-mode`. The skill starts developer mode in the current session immediately — it writes the marker `~/.claude/.dev-mode-active` (`dev_mode: true`), prints the DEVELOPER MODE banner, and adopts the orchestrator operating contract. No `/clear` is required.

**Auto-resume on new sessions:** while the marker is present, the `SessionStart` hook (`hooks/dev-mode-session-start.sh`) loads the disposition into context at the start of every new session, so each chat opens in developer mode and shows the banner on its first reply. The marker is the single source of truth. The determination is loaded silently — the agent never narrates it or re-inspects the marker.

**Stop it:** run `/dev-mode off`. The skill removes the marker (`dev-guard.sh` intercepts the removal with `permissionDecision: "ask"` — the operator confirms) and returns to normal mode; new sessions then open in normal mode.

**Persistent alternative (optional):** the `developer-mode` output style — `/config` -> Output style -> `developer-mode` to enable, `/config` -> Output style -> Default to disable — replaces the built-in software engineering instructions with the orchestrator contract (`keep-coding-instructions: false`) and applies on reload. It is equivalent; the marker remains the observable flag either way.

**What dev mode does:** development tasks route through the full pipeline (architect -> implementer -> tester + qa + security -> delivery) with all gates enforced. Outward actions (git push, gh pr merge/review/comment, GitHub API writes) require explicit operator approval via the deterministic gate `hooks/dev-guard.sh`. Security floors are non-waivable — dev mode is a disposition signal, not a stage-switch. Full contract: `docs/dev-mode.md`.

**What dev mode does NOT do:** it does not skip stages, waive gates, or relax security checks. Ambiguous tasks are routed to the pipeline or confirmed — never handled inline without gates. Outward actions cannot be executed inline by rationalisation — the gate escalates them to operator approval.
<!-- dev-mode:end -->

### 4e. Copy the developer-mode output style and the /dev-mode skill

Both files are copied idempotently from the plugin cache (`~/.claude/plugins/cache/team-harness-marketplace/th/<highest-version>/`), overwriting any existing version. Create the target directories if absent.

1. **Output style** (the disposition): `output-styles/developer-mode.md` -> `~/.claude/output-styles/developer-mode.md`.
2. **`/dev-mode` skill** (the toggle): `skills/dev-mode/SKILL.md` -> `~/.claude/skills/dev-mode/SKILL.md`. This is a USER-LEVEL skill so the bare `/dev-mode` command is available (plugin skills are namespaced; a bare command requires a user-level skill).

**Activation is opt-in (NOT forced); the toggle is the `/dev-mode` skill, not the `/config` menu.** After copying, tell the operator:

`Developer mode installed. To enter it: run /dev-mode, then /clear (or a new session). To exit: /dev-mode off, then /clear. (The /clear is required because the output style replaces the system prompt and applies on reload.)`

`/dev-mode` writes `outputStyle: developer-mode` to settings + the marker `~/.claude/.dev-mode-active`; `/dev-mode off` reverses both. The `/config` -> Output style menu remains an equivalent manual path.

**The `developer-mode` output style is NOT force-installed** (`force-for-plugin` is false). Normal mode remains the default.

### 4b. Write nested-dispatch-takeover rule

Read the canonical block from `managed-blocks/nested-dispatch-takeover.md` (resolved from the plugin cache: `~/.claude/plugins/cache/team-harness-marketplace/th/<highest-version>/skills/setup/managed-blocks/nested-dispatch-takeover.md`).

Read `~/.claude/CLAUDE.md`. Apply idempotently: if both the start and end markers of the nested-dispatch-takeover block are present, replace the content between those markers (inclusive) with the canonical block. Otherwise append the block at the end of the file.

Do NOT add migration logic for legacy markers — this block is new in v2.33.1 and has no prior marker variants. The canonical block includes a guard: if `next_dispatch.agent == th:orchestrator`, the handoff is malformed — the consumer must dispatch the phase agent from `00-state.md` (or `th:architect` at boot), never `th:orchestrator` itself.

The canonical block (source of truth in `managed-blocks/nested-dispatch-takeover.md`):

<!-- nested-dispatch-takeover:start -->
## nested-dispatch-takeover

**When this fires:** A subagent response contains the phrase `Dispatch handoff — top-level Claude takes over now`, or an existing `workspaces/{feature}/00-state.md` has `status: blocked-no-dispatch`. Cause: the orchestrator was invoked from a nested context (another agent, a chained dispatch) and the Claude Code harness stripped its `Task` tool as an anti-recursion safety measure.

**Minimum actions (do NOT ask the operator for permission — the original task is the authorisation):**

1. Parse the `dispatch_handoff` JSON block embedded in the subagent's response (or read it from the `## Handoff` section of `00-state.md` if `state_ref` is provided).
2. Dispatch the named agent directly via `Task(subagent_type={next_agent}, ...)` from the top-level session. Do NOT re-invoke `@th:orchestrator` or any skill that routes through it — that recreates the nested context and the same Task strip happens again.
3. Read the full flow for the detected task type (`agents/ref-special-flows.md` for `fix`/`hotfix`/`docs`; `agents/orchestrator.md` phase sections for `feature`/`refactor`/`enhancement`). Execute EVERY stage and honor EVERY gate of the detected flow — skipping any is a defect, not a shortcut. See the **Takeover Pipeline Manifest** in `docs/subagent-orchestration.md` for the ordered stage/gate list with per-type annotations.

**Full protocol:** see `docs/subagent-orchestration.md` in the `team-harness` repo (Takeover Pipeline Manifest + 8-step takeover contract, handoff JSON schema, `blocked-manual-push` handling).

**Red herring:** if `~/.claude/agents/` does not exist, this is NOT a failure. Plugin-installed agents live under `~/.claude/plugins/cache/.../th/<version>/agents/`. The `subagent_type` strings are namespaced (`th:architect`, `th:implementer`, etc.) and the harness resolves them from the plugin path.

**Path & name resolution:** all `docs/…` and `agents/…` paths referenced above (`docs/subagent-orchestration.md`, `agents/ref-special-flows.md`, `agents/orchestrator.md`) are repo-relative for contributors with a `team-harness` clone. For plugin installs (no repo clone), the same files live under `~/.claude/plugins/cache/team-harness-marketplace/th/<highest-version>/` — resolve `<highest-version>` to the highest semver directory present (multiple versions may be cached after updates; the newest is canonical). The `dispatch_handoff` JSON stores `next_dispatch.agent` in **prefixed** form (`th:architect`) — use it verbatim for `Task(subagent_type=…)`, but **strip the `th:` prefix** to derive the agent's file path (`th:architect` → `agents/architect.md`); team-harness agents are flat, so a prefix-strip suffices.

**Guard:** if `next_dispatch.agent == th:orchestrator`, the handoff is malformed — dispatch the phase agent from `00-state.md` (or `th:architect` at boot), never `th:orchestrator` itself. See `docs/subagent-orchestration.md § dispatch_handoff Schema` for the canonical schema and `§ Takeover Protocol` step 4 for the full consume-side guard.
<!-- nested-dispatch-takeover:end -->

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
  "logs-subfolder": "<subfolder or empty>"
}
```

Preserve existing fields (like `files`) if the manifest already exists.

### 6. Verify connectivity

Test each MCP server:
- **Memory:** call `mcp__memory__read_graph` (or equivalent). Report success or failure.
- **context7:** call `mcp__context7__resolve-library-id` with a test query like `react`. Report success or failure.

If a server fails, show the error and suggest troubleshooting steps (check URL, check API key, check network).

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
