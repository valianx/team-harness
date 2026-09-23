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

- **Canonical roles** — the snapshot has 30 invocable canonical role files. Codex
  projects 20 generated TOML agents from that source; see the runtime roster for
  the projection and its separate scope.
- **Workflow coordination** — the native general agent coordinates the selected
  workflow. Pipeline use is explicit, specialists are bounded and optional, and
  current coordination has no TH gate records.
- **orchestrator as entry point** — `@th:orchestrator` remains a routing
  instruction; runtime adapters execute it in the current Main thread.
- **Workspaces** — local and Obsidian destinations remain supported where the
  active runtime has configured or selected them; migration does not assume one
  host's preferences transfer automatically to another.
- **Model selection** — native defaults remain operator-owned. OpenCode's
  provider tier is an explicit opt-in installer option; it is not a migration
  default.
- **`.team-harness.json` manifest** — the config document remains merge-owned
  by the active runtime and unrelated values stay preserved.

---

## Step-by-step migration

### 1. Review old installer files

The retired installer wrote files to `~/.claude/`. To avoid duplicate skills,
inspect its ownership ledger and preview each legacy path before removal. The
ledger is necessary but not sufficient: compare each candidate's bytes or
digest with trusted installer stock (or the matching current plugin file) and
remove only when both the recorded ownership and content match. Preserve a
modified file, an unrecorded path, or any path without trusted stock; this
includes custom commands even when their names overlap a Team Harness skill.

If the ledger is absent, malformed or does not identify a path, leave that path
in place and continue with plugin installation and host reload. Do not use
wildcards or recursive removal against `~/.claude/commands/`,
`~/.claude/agents/` or `~/.claude/skills/`. Apply the same rule in Bash and
PowerShell.

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

Old installer files and plugin files coexist. Follow step 1's ownership-ledger
procedure, preserve any unverified file, then activate the plugin through the
host's reload command.

### MCP not connecting after migration

Existing MCP configuration remains in the native runtime. Inspect it with the
runtime's MCP command and repair only the selected integration. `/th:setup`
does not provision Memory or Context Harness and does not copy credentials;
Context7 is an independent, explicit option.

### `/th:setup` not found after install

Run `/reload-plugins`. Reconnect only when the host reports that reload cannot activate the plugin.

### Orphan cleanup for old flat skill files

If flat `.md` files remain under `~/.claude/commands/`, compare each path with
the ownership ledger and the plugin's current skill tree. Remove only a
verified Team Harness-owned legacy file; preserve custom or unverified files.
`/th:update` refreshes the plugin and managed blocks but is not a generic
directory cleanup command.

### Low-cost mode

Use the selected native runtime's model configuration. Claude Code keeps its
native settings; OpenCode tiering is explicit and provider-scoped. The
compatibility bootstrap scripts do not install Claude Code files; with no
subcommand they only print the native marketplace path.
