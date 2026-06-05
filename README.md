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

Run the update command, then reload:

```
/th:update
/reload-plugins
```

`/th:update` refreshes the marketplace catalog, downloads the new version into the plugin cache, and syncs the managed `~/.claude/CLAUDE.md` blocks. `/reload-plugins` (or restarting Claude Code) activates it — that step is operator-driven and cannot be automated.

> **Note — manual fallback, only if `/th:update` fails.** Run the three steps yourself, then reload:
> ```
> claude plugin marketplace update team-harness-marketplace
> claude plugin update th@team-harness-marketplace
> /reload-plugins
> ```
> The catalog refresh (`marketplace update`) alone does **not** download files — `claude plugin update` is the step that fetches the new version. This is exactly what `/th:update` automates, so prefer the command above and use this sequence only for troubleshooting.

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

## Developer mode

Team Harness runs the orchestrated pipeline in **developer mode** — the **default disposition** as of v2.56.0. `/th:setup` and `/th:update` activate it automatically. Without it, the top-level agent handles your request **directly** (normal Claude Code behavior, no pipeline). To exit: `/dev-mode off` — the choice persists across future updates.

- **Enter:** `/dev-mode` — starts immediately in the current session, no `/clear` needed.
- **Exit:** `/dev-mode off`.

`/dev-mode` writes the marker `~/.claude/.dev-mode-active`, shows the `DEVELOPER MODE ACTIVE` banner, and the top-level agent adopts the orchestrator role — routing development tasks through the pipeline and dispatching leaf agents directly. While the marker is present, every new session auto-resumes developer mode: a `SessionStart` hook surfaces the banner **instantly** (rendered by Claude Code, not the model) and loads the disposition silently. A deterministic gate (`hooks/dev-guard.sh`) requires explicit operator approval for outward, irreversible actions (`git push`, `gh pr merge`/`review`/`comment`, GitHub API writes) at the point of execution — the agent cannot publish or push on its own.

A persistent alternative is the `developer-mode` output style (`/config` → Output style → `developer-mode`), which replaces the system prompt on reload.

Full contract: docs/dev-mode.md.

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
| [Vision](./docs/vision.md) | Where team-harness is headed — the developer amplified by a trusted agent team |
| [Roadmap](./docs/roadmap.md) | What we are building next — the sequenced path toward the vision |
| [How it works](./docs/how-it-works.md) | Pipeline walkthrough, why a harness, what ships |
| [Pipelines reference](./docs/pipelines.md) | All 8+ pipelines, tier classification, phase tables, gate semantics |
| [Migration guide](./docs/plugin-migration.md) | Migrating from the Go installer to the plugin |
| [Agents reference](./agents/README.md) | Full agent roster, model/effort matrix, low-cost mode |
| [Configuration reference](./CLAUDE.md) | Architectural conventions, working agreements, subagent routing |
| [Integration guide](./INTEGRATION.md) | context-harness-mcp setup, mcpServers config, 16-tool contract, troubleshooting |
| [Troubleshooting](./docs/troubleshooting.md) | SSH/HTTPS errors, duplicate agents, missing dispatch rule |
| [Changelog](./CHANGELOG.md) | Release history |

---

## License

[MIT](./LICENSE) © 2026 Mario Gutierrez.
