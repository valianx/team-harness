---
name: setup
description: Configure Team Harness — MCP servers, workspace mode, and orchestrator dispatch rule. Run after installing the plugin or to reconfigure.
---
name: setup

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

### 4. Write orchestrator dispatch rule

Read `~/.claude/CLAUDE.md`. If it does not contain the orchestrator dispatch rule (look for `<!-- orchestrator-dispatch-rule:start -->`), append this block:

```markdown
<!-- orchestrator-dispatch-rule:start -->
## orchestrator dispatch

Invoke the orchestrator as a subagent: `Agent(subagent_type='th:orchestrator', ...)`. The orchestrator dispatches phase agents (th:architect, th:implementer, th:tester, th:qa, th:security, th:delivery, etc.) internally via Task. Do not execute the orchestrator role inline at top level — the orchestrator's contract is its system prompt, and inline execution weakens enforcement of pipeline gates.

When dispatching the orchestrator, detect the operator's chat language and include it in the prompt: `Operator language: {code}. Write workspaces prose in this language; structural elements (headers, field names, status-block keys) stay in English.` This ensures the orchestrator and all downstream agents write in the operator's language.
<!-- orchestrator-dispatch-rule:end -->
```

If the rule already exists (markers found), replace the block between markers with the version above. This ensures the subagent_type matches the plugin namespace.

Also check for legacy markers (`<!-- th-orchestrator-inline-rule:start -->` or `<!-- th-orchestrator-dispatch-rule:start -->`) and replace them with the current version.

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
