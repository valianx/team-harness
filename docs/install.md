# Installation guide

Detailed installation reference. For the **quick one-liner**, see the [README](../README.md#install).

---

## One-liner install

The three commands in the README's Install section are the canonical install path. The bootstrap script detects your OS and architecture, downloads the latest released binary from GitHub Releases, and runs it. Agents, skills, and hooks are embedded in the binary (no separate downloads) and written directly to `~/.claude/`.

After install, **restart Claude Code** to pick up the new agents and MCP servers.

---

## What the installer asks

On an interactive terminal, the installer walks through three prompts in order:

1. **Memory MCP URL** — paste the public URL of your Knowledge Graph MCP server (typically [`context-harness-mcp`](https://github.com/valianx/context-harness-mcp) deployed to Railway, Render, Fly, your own server, or any Docker host). There is **no default URL** — paste your URL or the full JSON snippet from your `context-harness-mcp /dashboard`.
2. **context7 API key** — for library docs retrieval. Get one at [context7.com](https://context7.com/). Preserved from a prior install if already configured.
3. **Install mode** — `[s] standard` (default) or `[l] low-cost`. Press Enter to accept standard.

---

## Install modes

| Mode | Who it's for | What changes |
|---|---|---|
| `standard` (default) | Operators on Max / Team plans | Agent files copied byte-identical; canonical quality contract |
| `low-cost` | Operators on Free / Pro / tight personal budget | Rewrites agent `model:` / `effort:` frontmatter in-flight; all agents run on `sonnet` |

Low-cost trades documented quality for lower API cost. Standard is the default precisely because Max / Team operators should stay there. See [`agents/README.md §"Low-cost mode"`](../agents/README.md#low-cost-mode) for the full matrix and trade-off analysis.

---

## Non-interactive install (CI / scripts)

Set env vars instead of prompting:

```bash
MEMORY_MCP_URL=https://your-mcp.example.com/mcp \
CONTEXT7_API_KEY=ctx7sk-... \
INSTALL_MODE=standard \
curl -fsSL https://valianx.github.io/team-harness/install.sh | bash
```

| Env var | Required? | Notes |
|---|---|---|
| `MEMORY_MCP_URL` | Yes (for fresh install) | Preserved from existing `~/.claude.json` if already set |
| `MEMORY_MCP_BEARER` | Optional | JWT for authenticated MCPs |
| `CONTEXT7_API_KEY` | Recommended | Empty = context7 features disabled |
| `INSTALL_MODE` | Optional | `standard` (default) or `low-cost` |

---

## Reset existing config

Pass `--force` to reset existing `mcpServers` entries:

```bash
curl -fsSL https://valianx.github.io/team-harness/install.sh | bash -s -- --force
```

The installer is idempotent. Unchanged files are skipped; conflicting files (yours differ from the repo) are reported, never silently overwritten.

---

## From source (contributors)

```bash
git clone https://github.com/valianx/team-harness.git
cd team-harness
go run ./cmd/install
```

`go run ./cmd/install` builds from local source. The `//go:embed` directive snapshots `agents/`, `skills/`, and `hooks/` at compile time, so the binary reflects your working tree exactly. The bootstrap scripts (`./bin/install.sh` / `.\bin\install.ps1`) always download the released binary — they don't use the local clone.

---

## Updating

Re-run the one-liner. The installer detects existing files; unchanged files are skipped, conflicts are reported.

```bash
curl -fsSL https://valianx.github.io/team-harness/install.sh | bash
```

---

## Requirements

- [Claude Code](https://docs.claude.com/en/docs/claude-code) — the runtime team-harness depends on
- [`gh`](https://cli.github.com/) CLI — for the `delivery` flow (PRs, issues, releases)
- [context7](https://context7.com/) API key — for library docs retrieval
- A reachable [Memory MCP](https://github.com/valianx/context-harness-mcp) URL — for the knowledge graph

No Python, no `uv` — the binary is stdlib-only Go.
