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

Read `~/.claude/CLAUDE.md`. If it does not contain the orchestrator dispatch rule (look for `<!-- orchestrator-dispatch-rule:start -->`), append this block:

```markdown
<!-- orchestrator-dispatch-rule:start -->
## orchestrator dispatch

**When to use:** For any development task — features, bug fixes, refactors, enhancements, hotfixes — always route through the orchestrator. Do not implement, test, or deliver directly. The orchestrator coordinates the full pipeline (architect → implementer → tester + qa + security → delivery) and enforces quality gates at each stage boundary.

**How to invoke:** `Agent(subagent_type='th:orchestrator', ...)`. The orchestrator dispatches phase agents (th:architect, th:implementer, th:tester, th:qa, th:security, th:delivery, etc.) internally via Task. Do not execute the orchestrator role inline at top level — the orchestrator's contract is its system prompt, and inline execution weakens enforcement of pipeline gates.

**Full pipeline is the default.** Every development task runs the complete pipeline unless the operator explicitly requests a direct mode (research, design, validate, deliver, review). Do not skip stages or substitute yourself for a subagent — the pipeline runs in full or stops with a real error.

**Operator-declared fast path.** The operator — and only the operator — may request a lighter pipeline; the orchestrator never shrinks it on its own. Declarations: `--fast` for a very small change (a version bump, a one-line edit) skips the plan review, qa, and security stages; `[TIER: 0]` / `[TIER: 1]` for trivial or docs-only fixes; or Simple Mode keywords (`simple`, `just implement`, `skip tests`). In every case Specify and Delivery still run — every change is spec'd, branched, committed, and shipped as a PR — and security still runs on security-sensitive paths (`auth`, `api`, `db`, `crypto`, `session`) regardless of the declaration.

**Respect `~/.claude/.team-harness.json` configuration.** This file controls workspace output mode (`logs-mode`: local or obsidian), vault path (`logs-path`), and subfolder (`logs-subfolder`). The orchestrator reads this at pipeline start. Do not override these values or hard-code paths — the operator configured them via `/th:setup`.

**Language propagation.** When dispatching the orchestrator, detect the operator's chat language and include it in the prompt: `Operator language: {code}. Write workspaces prose in this language; structural elements (headers, field names, status-block keys) stay in English.` This ensures the orchestrator and all downstream agents write in the operator's language.
<!-- orchestrator-dispatch-rule:end -->
```

If the rule already exists (markers found), replace the block between markers with the version above. This ensures the subagent_type matches the plugin namespace.

Also check for legacy markers (`<!-- th-orchestrator-inline-rule:start -->` or `<!-- th-orchestrator-dispatch-rule:start -->`) and replace them with the current version.

### 4b. Write nested-dispatch-takeover rule

Read `~/.claude/CLAUDE.md`. If the file does not contain the nested-dispatch-takeover block (look for `<!-- nested-dispatch-takeover:start -->`), append the block below at the end of the file.

If the block already exists (markers found), replace the content between the markers with the canonical version below. This is the idempotence contract: insert if missing, replace between markers if present. Do NOT add migration logic for legacy markers — this block is new in v2.33.1 and has no prior marker variants.

```markdown
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
<!-- nested-dispatch-takeover:end -->
```

### 4c. Write voice-rule block

Read `~/.claude/CLAUDE.md`. If the file does not contain the voice-rule block (look for `<!-- voice-rule:start -->`), append the block below at the end of the file. If the block already exists (markers found), replace the content between the markers with the canonical version below. This is the idempotence contract: insert if missing, replace between markers if present.

```markdown
<!-- voice-rule:start -->
## Voice — neutral register, no regional idioms

Use neutral, standard language that reads the same to a reader from any country. Do NOT use country-specific idioms, regionalisms, or local slang of any particular nation. This applies to every response, in any language — there is no informal-chat-mode exception.

- Prefer the standard, neutral form of a word over its regional or colloquial variant.
- No localisms, no dialect slang, no colloquial anglicisms (`shippeo`, `bakeado`, `wrappear`) — use the formal equivalent (`publicar`, `incorporado`, `encapsular`).
- Keep the tone declarative and professional; the reader's country should not be inferable from word choice.
<!-- voice-rule:end -->
```

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
