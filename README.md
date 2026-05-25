# Team Harness

> An agent harness for **Claude Code**. Turns the chat into a Spec-Driven Development pipeline with mandatory human gates and full state captured as files so any session can resume from where the last one left off.

[![Version](https://img.shields.io/github/v/release/valianx/team-harness?label=version&color=blue)](./CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

---

## Install

1. Add the marketplace:
```
/plugin marketplace add valianx/team-harness
```

2. Install the plugin:
```
/plugin install th
```

3. Configure MCP servers and logs mode:
```
/th:setup
```

`/th:setup` configures the two required MCP servers (Memory and context7) and the **logs mode** — where pipeline workspaces are stored:

| Mode | Where | When to use |
|---|---|---|
| `local` | `./workspaces/` in each project | Default. Simple, no extra config. |
| `obsidian` | Obsidian vault path you provide | Cross-project visibility. Workspaces appear as searchable notes in your vault. |

### Update

1. Pull the latest version:
```
/plugin marketplace update team-harness-marketplace
```

2. Reload:
```
/reload-plugins
```

---

## Quick start

After install, open Claude Code. The entry points are:

- `/th:orchestrator` — the front door to the whole pipeline (or use `@th:orchestrator` in chat)
- `/th:setup` — configure logs-mode, vault path, and verify MCP connectivity
- `/th:update` — update to the latest release

```
@th:orchestrator give me the work plan for this task: <description>
@th:orchestrator implement it
@th:orchestrator open the PR
@th:orchestrator recover <feature>
```

> **The orchestrator is the canonical entry point.** Skills like `/th:design`, `/th:deliver`, `/th:recover` are optional shortcuts that route to the same agent under the hood.

---

## Requirements

**Required:**
- [Claude Code](https://docs.claude.com/en/docs/claude-code) — the runtime team-harness depends on
- [context7](https://context7.com/) API key — for library docs retrieval
- A reachable [Memory MCP](https://github.com/valianx/context-harness-mcp) URL — there is no default URL; `/th:setup` requires an explicit value

**Recommended:**
- [`gh`](https://cli.github.com/) CLI — for GitHub integration (`/th:issue`, `/th:deliver`, `/th:review-pr`). When absent, skills fall back to `curl` or operator-paste paths.

---

## Documentation

| | |
|---|---|
| [How it works](./docs/how-it-works.md) | Pipeline walkthrough, why a harness, what ships |
| [Pipelines reference](./docs/pipelines.md) | All 8+ pipelines, tier classification, phase tables, gate semantics |
| [Migration guide](./docs/plugin-migration.md) | Migrating from the Go installer to the plugin |
| [Agents reference](./agents/README.md) | Full agent roster, model/effort matrix, low-cost mode |
| [Configuration reference](./CLAUDE.md) | Architectural conventions, working agreements, subagent routing |
| [Troubleshooting](./docs/troubleshooting.md) | SSH/HTTPS errors, duplicate agents, missing dispatch rule |
| [Changelog](./CHANGELOG.md) | Release history |

---

## License

[MIT](./LICENSE) © 2026 Mario Gutierrez.
