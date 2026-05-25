# Team Harness

> An agent harness for **Claude Code**. Turns the chat into a Spec-Driven Development pipeline with mandatory human gates and full state captured as files so any session can resume from where the last one left off.

[![Version](https://img.shields.io/github/v/release/valianx/team-harness?label=version&color=blue)](./CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

---

## Install

### Via Plugin (recommended)

1. Add the marketplace:
   ```
   /plugin marketplace add valianx/team-harness
   ```

2. Install the plugin:
   ```
   /plugin install th
   ```

3. Configure:
   ```
   /th:setup
   ```

### Via Binary (alternative — offline / CI / low-cost mode)

**macOS / Linux / WSL**

```bash
curl -fsSL https://valianx.github.io/team-harness/install.sh | bash
```

**Windows (PowerShell)**

```powershell
irm https://valianx.github.io/team-harness/install.ps1 | iex
```

**Windows (cmd.exe)**

```cmd
curl -fsSL https://valianx.github.io/team-harness/install.cmd -o install.cmd && install.cmd
```

The installer walks through three prompts (Memory MCP URL, context7 API key, install mode) and writes agents, skills, and hooks into `~/.claude/`. Restart Claude Code after install.

---

## Quick start

After install, open Claude Code. The entry points are:

- `/th:orchestrator` — the front door to the whole pipeline (or use `@th-orchestrator` in chat)
- `/th:setup` — configure logs-mode, vault path, and verify MCP connectivity
- `/th:update` — update to the latest release

```
@th-orchestrator give me the work plan for this task: <description>
@th-orchestrator implement it
@th-orchestrator open the PR
@th-orchestrator recover <feature>
```

> **The th-orchestrator is the canonical entry point.** Skills like `/th:design`, `/th:deliver`, `/th:recover` are optional shortcuts that route to the same agent under the hood.

---

## Requirements

**Required:**
- [Claude Code](https://docs.claude.com/en/docs/claude-code) — the runtime team-harness depends on
- [context7](https://context7.com/) API key — for library docs retrieval
- A reachable [Memory MCP](https://github.com/valianx/context-harness-mcp) URL — there is no default URL; the installer requires an explicit value

**Recommended:**
- [`gh`](https://cli.github.com/) CLI — for GitHub integration (`/issue`, `/deliver`, `/review-pr`). When absent, skills fall back to `curl` or operator-paste paths.

---

## Documentation

| | |
|---|---|
| [How it works](./docs/how-it-works.md) | Pipeline walkthrough, why a harness, what ships |
| [Pipelines reference](./docs/pipelines.md) | All 8+ pipelines, tier classification, phase tables, gate semantics |
| [Installation guide](./docs/install.md) | Modes, env vars (`INSTALL_MODE`), `--force`, from source, updating |
| [Agents reference](./agents/README.md) | Full agent roster, model/effort matrix, low-cost mode |
| [Configuration reference](./CLAUDE.md) | Architectural conventions, working agreements, subagent routing |
| [Changelog](./CHANGELOG.md) | Release history |

---

## License

[MIT](./LICENSE) © 2026 Mario Gutierrez.
