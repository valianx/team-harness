# Plugin Migration Guide

This guide covers migration from the retired Claude Code binary path to the
native Claude Code plugin distribution. The Go installer remains available for
explicit OpenCode and Codex subcommands.

---

## What changed

### Skill invocation

| Before (installer) | After (plugin) |
|---|---|
| `/design` | `/th:design` |
| `/deliver` | `/th:deliver` |
| `/plan` | `/th:plan` |
| `/research` | `/th:research` |
| `/recover` | `/th:recover` |
| `/review-pr` | `/th:review-pr` |
| `/th-update` | `/th:update` |
| All other `/skill-name` commands | `/th:skill-name` |

The namespace prefix `th:` is mandatory in plugin mode. The coordinator (`@th:orchestrator`) continues to work unchanged in chat mentions.

### File locations

| Before (installer) | After (plugin) |
|---|---|
| `~/.claude/commands/*.md` | `${CLAUDE_PLUGIN_ROOT}/skills/<name>/SKILL.md` |
| `~/.claude/agents/*.md` | `${CLAUDE_PLUGIN_ROOT}/agents/*.md` |
| Retired Team Harness policy hooks | No plugin replacement; native permissions and approvals remain the action boundary |
| Existing `~/.claude.json` mcpServers block | Preserved as user-owned native configuration; `/th:setup` does not copy or replace it |

### Skill file format

Skills now use the directory format. Each skill lives at `skills/<name>/SKILL.md` instead of a flat `skills/<name>.md`. The installer was updated to copy the entire directory; the plugin auto-discovers all `SKILL.md` files under `skills/`.

---

## What stays the same

- **Agents** — all 19 agents in `agents/` are unchanged. Names, models, and contracts are identical.
- **Pipeline behavior** — all pipelines (feature, fix, hotfix, research, docs, review) run identically.
- **orchestrator as entry point** — `@th:orchestrator` in chat still routes to the same coordinator.
- **Workspaces** — pipeline workspaces (local `./workspaces/` or Obsidian vault) work identically.
- **Low-cost mode** — available only where the selected native engine supports the installer transform; Claude Code uses the plugin's native model settings.
- **`.team-harness.json` manifest** — config file location and format unchanged.

---

## Step-by-step migration

### 1. Uninstall old installer files

The installer wrote files to `~/.claude/`. Remove them to avoid duplicate skills appearing as both `/skill-name` and `/th:skill-name`:

```bash
# Remove installer-managed skill files
rm ~/.claude/commands/*.md

# Remove installer-managed agent files (if you have no custom agents)
rm ~/.claude/agents/*.md

# Do not remove arbitrary user hooks. Remove only legacy files recorded as
# Team Harness-owned by the installer ledger, if they are still present.
```

On Windows (PowerShell):

```powershell
Remove-Item "$env:USERPROFILE\.claude\commands\*.md"
Remove-Item "$env:USERPROFILE\.claude\agents\*.md"
# Preserve unrelated user hooks and native permission settings.
```

### 2. Install the plugin

In Claude Code:

```
/plugin marketplace add valianx/team-harness
/plugin install th
```

### 3. Run setup

```
/th:setup
```

`/th:setup` configures the native plugin installation. It:
- Reads or creates `.team-harness.json`
- Lets you choose logs-mode (local or Obsidian vault)
- Preserves existing MCP registrations and credentials
- Configures Context7 only when explicitly selected, then shows a summary of detected agents and active skills

### 4. Verify

```
/th:orchestrator give me the work plan for this task: <any test task>
```

The pipeline should start normally. If agents are missing, run `/reload-plugins` and follow the host's activation guidance.

---

## Troubleshooting

### Duplicate skills appearing (`/design` AND `/th:design`)

Old installer files and plugin files coexist. Run step 1 above to remove the installer files, then activate the plugin through the host's reload command.

### MCP not connecting after migration

Existing MCP configuration remains in the native runtime. Inspect it with the
runtime's MCP command and repair only the selected integration. `/th:setup`
does not provision Memory or Context Harness and does not copy credentials;
Context7 is an independent, explicit option.

### `/th:setup` not found after install

Run `/reload-plugins`. Reconnect only when the host reports that reload cannot activate the plugin.

### Orphan cleanup for old flat skill files

If the Go installer left behind flat `.md` files under `~/.claude/commands/` that have no plugin equivalent, run `/th:update` which includes a legacy orphan cleanup step for directory-format migrations.

### Low-cost mode

Use the selected native runtime's model configuration. The compatibility
bootstrap scripts do not install Claude Code files; with no subcommand they
only print the native marketplace path.
