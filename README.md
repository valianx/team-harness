# Team Harness — Claude Code Agent Orchestration System

> Team Harness is a multi-agent orchestration system for **Claude Code**: the top-level coordinator **`th:leader`** frames each request and spawns a **`th:orchestrator`** per task, which dispatches specialized architect, implementer, tester, QA, security, and delivery agents through a Spec-Driven Development (SDD) pipeline with mandatory human gates.
>
> Every pipeline stage is captured as files on disk, so any session can resume from where the last one stopped.

[![Version](https://img.shields.io/github/v/release/valianx/team-harness?label=version&color=blue)](./CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

> Team Harness runs under both **Claude Code** and **opencode**. Agents, skills, and rules are cross-harness; hooks are single-source TypeScript. See [`docs/lifecycle.md`](./docs/lifecycle.md) for the stage-by-stage maturity of each runtime (author, build, test, release, install, update), the [migration guide](./docs/opencode-migration-guide.md), and the [distribution roadmap](./docs/opencode-distribution-roadmap.md).

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

### Install into opencode

See [`docs/lifecycle.md`](./docs/lifecycle.md) for the current maturity of the opencode runtime. Install Team Harness into opencode with:

**Linux / macOS (bash):**
```
curl -fsSL https://valianx.github.io/team-harness/install-opencode.sh | bash
```

**Windows (PowerShell):**
```
iwr https://valianx.github.io/team-harness/install-opencode.ps1 | iex
```

This installs all agents, skills, commands, and hooks. The bare form requires no environment variables — MCP server registration is optional and skipped when credentials are absent.

To auto-register MCP servers at install time, supply them via environment:

**Linux / macOS:**
```
MEMORY_MCP_URL=https://your-mcp.example.com/mcp \
  CONTEXT7_API_KEY=your-key \
  curl -fsSL https://valianx.github.io/team-harness/install-opencode.sh | bash
```

**Windows:**
```
$env:MEMORY_MCP_URL = "https://your-mcp.example.com/mcp"
iwr https://valianx.github.io/team-harness/install-opencode.ps1 | iex
```

Or to register only Memory MCP (context7 skipped), set only `MEMORY_MCP_URL` in the same way.

To add or update MCP entries after install, re-run with the desired env vars set.

**Environment variables:**

| Variable | Required | Purpose |
|---|---|---|
| `MEMORY_MCP_URL` | Optional | Memory MCP server URL. When set, registered in `opencode.json` at install time. When absent, skipped — configure later. |
| `CONTEXT7_API_KEY` | Optional | context7 API key for library docs retrieval. When set, registers the context7 MCP server. When absent, skipped — configure later. |
| `MEMORY_MCP_BEARER` | Optional at install | opencode resolves `{env:MEMORY_MCP_BEARER}` at runtime. If unset when the install runs, a one-line non-blocking warning is printed; the install still completes. |

The installer writes only the Memory URL literally to `opencode.json`. Both secrets (`MEMORY_MCP_BEARER` and `CONTEXT7_API_KEY`) remain as `{env:}` references resolved by opencode at runtime — they are never written to disk by team-harness.

**Security note:** The downloaded binary is verified against the published `SHA256SUMS` before it runs. The checksum file is served over HTTPS from the GitHub release origin but is not cryptographically signed — verification protects against corruption and tampering of the binary relative to the checksum, not against a compromise of the release origin (TOFU over HTTPS).

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

### Updating (opencode)

Run the dedicated updater bootstrap — it performs a cheap version pre-check (no binary download when already current), downloads and SHA256-verifies the binary, shows the four-bucket diff preview, and applies only changed files:

**Linux / macOS:**
```bash
curl -fsSL https://valianx.github.io/team-harness/update-opencode.sh | bash
```

**Windows (PowerShell):**
```powershell
iwr https://valianx.github.io/team-harness/update-opencode.ps1 | iex
```

Or run the subcommand directly (headless / CI):
```text
install update --runtime opencode --scope global --non-interactive
```

After the update completes, **restart opencode** to activate the refreshed agents, skills, and commands — the update is NOT live in any running opencode session until restart.

The updater reports one of three states:
- **update available** — new files downloaded, diff applied, restart to activate.
- **already current** — no binary downloaded, no files written.
- **installed ahead** — recorded version is newer than this binary; no downgrade performed.

Alternatively, type `/th-update` inside opencode. The command instructs the agent to run the updater above in a terminal.

---

## Quick start

After install, open Claude Code. The top-level session agent is **`th:leader`** — the operator's single point of contact. You drive the pipeline by talking to it directly (no `@mention` needed); `th:leader` frames the request and spawns a `th:orchestrator` per task to run the gated execution pipeline. The entry points are:

- `th:leader` — the top-level session agent; just describe what you want
- `/th:setup` — configure logs-mode, vault path, and verify MCP connectivity
- `/th:update` — update to the latest release

```
give me the work plan for this task: <description>
implement it
open the PR
recover <feature>
```

Learn mode (explain a codebase, library, or concept with a layered teaching pack):

```
/th:learn explain how React hooks work
/th:learn how does the auth layer work in this project
/th:learn how does the LLM work in this ADK project --resume
```

> **`th:leader` is the canonical entry point.** Skills like `/th:design`, `/th:deliver`, `/th:recover` are optional shortcuts that route through the same coordination flow under the hood. See [`docs/agent-tree.md`](./docs/agent-tree.md) for how `th:leader`, `th:orchestrator`, and the leaf specialists relate at runtime.

---

## Orchestrator disposition

The top-level session agent is **`th:leader`** — no marker file or activation command required. It frames each request and spawns a `th:orchestrator` per task; that orchestrator runs the full pipeline automatically (architect → implementer → tester/qa/security → delivery) and welds all three stage gates inside its own transcript. A deterministic gate (`hooks/dev-guard.sh`) fires unconditionally on every outward, irreversible action and gates by destination: pushing to a non-default branch on `origin` (no force, no default-branch destination) proceeds without a prompt, while pushing to the default branch, tag pushes, force pushes, `gh pr create`/`merge`/`review`/`comment`, `gh issue create`/`edit`/`comment`, ClickUp outward writes, and GitHub API writes still require explicit operator approval at the point of execution.

Full contract: docs/dev-mode.md.

---

## Requirements

**Required:**
- [Claude Code](https://docs.claude.com/en/docs/claude-code) — the primary runtime team-harness depends on. opencode is also supported — agents, skills, and rules run as-is; hooks are single-source TypeScript. See [`docs/lifecycle.md`](./docs/lifecycle.md) for the stage-by-stage maturity of each runtime and the [migration guide](./docs/opencode-migration-guide.md)
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
| [Dual-runtime lifecycle](./docs/lifecycle.md) | How a change reaches Claude Code and opencode — author, build, test, release, install, update, activate, deprecate |
| [Pipelines reference](./docs/pipelines.md) | All 8+ pipelines, tier classification, phase tables, gate semantics |
| [Migration guide](./docs/plugin-migration.md) | Migrating from the Go installer to the plugin |
| [Agents reference](./agents/README.md) | Full agent roster, model/effort matrix, low-cost mode |
| [Agent tree](./docs/agent-tree.md) | How `th:leader`, `th:orchestrator`, and the leaf specialists relate at runtime |
| [Configuration reference](./CLAUDE.md) | Architectural conventions, working agreements, subagent routing |
| [Knowledge base](./docs/knowledge.md) | Decisions, patterns, stack notes, and constraints accumulated across features |
| [Integration guide](./docs/integration.md) | context-harness-mcp setup, mcpServers config, 16-tool contract, troubleshooting |
| [Troubleshooting](./docs/troubleshooting.md) | SSH/HTTPS errors, duplicate agents, missing dispatch rule |
| [Changelog](./CHANGELOG.md) | Release history |

---

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the
fork-PR flow and the project's working agreements. By participating you agree to
the [Code of Conduct](./CODE_OF_CONDUCT.md).

---

## License

[MIT](./LICENSE) © 2026 Mario Gutierrez.
