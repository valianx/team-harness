# Plugin Migration Guide

This guide covers migration from the Go installer to the Claude Code plugin distribution.

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

The namespace prefix `th:` is mandatory in plugin mode. The lider (`@th:lider`) continues to work unchanged in chat mentions.

### File locations

| Before (installer) | After (plugin) |
|---|---|
| `~/.claude/commands/*.md` | `${CLAUDE_PLUGIN_ROOT}/skills/<name>/SKILL.md` |
| `~/.claude/agents/*.md` | `${CLAUDE_PLUGIN_ROOT}/agents/*.md` |
| `~/.claude/hooks/policy-block.sh` | `${CLAUDE_PLUGIN_ROOT}/hooks/policy-block.sh` |
| `~/.claude.json` mcpServers block | Managed by `/th:setup` via `.team-harness.json` |

### Skill file format

Skills now use the directory format. Each skill lives at `skills/<name>/SKILL.md` instead of a flat `skills/<name>.md`. The installer was updated to copy the entire directory; the plugin auto-discovers all `SKILL.md` files under `skills/`.

---

## What stays the same

- **Agents** — all 19 agents in `agents/` are unchanged. Names, models, and contracts are identical.
- **Pipeline behavior** — all pipelines (feature, fix, hotfix, research, docs, review) run identically.
- **lider as entry point** — `@th:lider` in chat still routes to the same lider.
- **Workspaces** — pipeline workspaces (local `./workspaces/` or Obsidian vault) work identically.
- **Low-cost mode** — only available via the legacy Go installer; the plugin cannot transform frontmatter on install. See [`docs/install.md` § Legacy installer](./install.md#legacy-installer-contributors--offline--ci).
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

# Remove installer-managed hooks (optional — the plugin will register its own)
rm ~/.claude/hooks/policy-block.sh
rm ~/.claude/hooks/notify-*.sh
rm ~/.claude/hooks/notify-stage.sh
```

On Windows (PowerShell):

```powershell
Remove-Item "$env:USERPROFILE\.claude\commands\*.md"
Remove-Item "$env:USERPROFILE\.claude\agents\*.md"
Remove-Item "$env:USERPROFILE\.claude\hooks\policy-block.sh"
Remove-Item "$env:USERPROFILE\.claude\hooks\notify-*.sh"
Remove-Item "$env:USERPROFILE\.claude\hooks\notify-stage.sh"
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

`/th:setup` replaces the interactive prompts the Go installer used to provide. It:
- Reads or creates `.team-harness.json`
- Lets you choose logs-mode (local or Obsidian vault)
- Verifies Memory MCP and context7 connectivity
- Shows a summary of detected agents, active skills, and MCP status

### 4. Verify

```
/th:lider give me the work plan for this task: <any test task>
```

The pipeline should start normally. If agents are missing, run `/plugin reload th`.

---

## Troubleshooting

### Duplicate skills appearing (`/design` AND `/th:design`)

Old installer files and plugin files coexist. Run step 1 above to remove the installer files, then reload Claude Code.

### MCP not connecting after migration

The installer wrote MCP config directly to `~/.claude.json`. After migration, run `/th:setup` to re-verify and reconfigure. The `~/.claude.json` `mcpServers` block written by the installer stays active; `/th:setup` will detect it.

### `/th:setup` not found after install

Run `/plugin reload th` or restart Claude Code. Plugin skills require a reload after first install.

### Orphan cleanup for old flat skill files

If the Go installer left behind flat `.md` files under `~/.claude/commands/` that have no plugin equivalent, run `/th:update` which includes a legacy orphan cleanup step for directory-format migrations.

### Low-cost mode (legacy Go installer only)

The plugin does not transform frontmatter on install. To use low-cost mode (all agents on `sonnet` / `medium` effort), use the legacy Go installer:

```bash
INSTALL_MODE=low-cost curl -fsSL https://valianx.github.io/team-harness/install.sh | bash
```

The Go installer is the legacy install path as of v2.33.0 — it remains functional for this use case. The installer writes to `~/.claude/` and the plugin writes to the plugin root; they can coexist. See [`docs/install.md` § Legacy installer](./install.md#legacy-installer-contributors--offline--ci) for full details.
