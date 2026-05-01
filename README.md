# claude-dev-team

A standardized, opinionated Claude Code agent system for software teams: 16 agents, 27 skills (3 of which are complex multi-file skills), OS-native notification hooks, a ChromaDB-backed knowledge-graph MCP server, and a cross-platform installer that wires everything into your `~/.claude/`.

## Install

### Requirements

- [Claude Code](https://docs.claude.com/en/docs/claude-code) already installed.
- [`uv`](https://docs.astral.sh/uv/getting-started/installation/) — Python toolchain manager. If missing, the bootstrap scripts install it for you.
- [`gh`](https://cli.github.com/) — GitHub CLI.
- A **context7 API key**. Get one at [context7.com](https://context7.com/).

### One-liner

Clone the repo and run the bootstrap script for your OS:

```bash
git clone https://github.com/valianx/claude-dev-team.git
cd claude-dev-team

# Unix / macOS
./bin/install.sh

# Windows (PowerShell)
.\bin\install.ps1
```

If `uv` is already installed, you can skip the bootstrap:

```bash
uv run bin/install.py
```

### Non-interactive install

Set `CONTEXT7_API_KEY` in the environment to skip the prompt (useful for CI or re-runs):

```bash
CONTEXT7_API_KEY=ctx7sk-... uv run bin/install.py
```

### What the installer does

1. Copies agents, skills, hooks, and the ChromaDB MCP server into `~/.claude/`.
2. Backs up `~/.claude.json` (timestamped) and merges `mcpServers.memory` and `mcpServers.context7` entries into it.
3. Reports installed / unchanged / conflicts. **It never overwrites existing files**; a different hash is reported as a conflict. To replace a conflicting file, delete it manually and re-run.

After installation, restart Claude Code so it picks up the new MCP servers.

### Enable notification hooks (optional)

1. Open `hooks/config.json` in this repo.
2. Copy the `hooks` object for your OS (`windows`, `macos`, or `linux`).
3. Merge it into `~/.claude/settings.json` under the `"hooks"` key.

### Uninstall

Delete the installed files from `~/.claude/` (agents, skills, hooks, chromadb-mcp). Restore `~/.claude.json` from the timestamped backup the installer created.

---

## What you get

### Agents (`agents/`)

| Agent | Role |
|---|---|
| `orchestrator` | Central hub. Coordinates the pipeline and all other agents. |
| `architect` | Architecture design, research, planning, audits. |
| `implementer` | Production code. |
| `tester` | Test suites with factory mocks. |
| `qa` | Acceptance criteria definition and validation. |
| `acceptance-checker` | External audit comparing original spec vs delivered artifacts (Phase 3.6). |
| `delivery` | Docs, changelog, version, branch, commit, PR. |
| `reviewer` | GitHub PR review. |
| `security` | OWASP / CWE / ASVS audits. |
| `diagrammer`, `likec4-diagrammer`, `d2-diagrammer` | Architecture diagrams (Excalidraw, LikeC4, D2). |
| `translator` | i18n discovery, glossary, translation. |
| `gcp-cost-analyzer` | GCP cost / resource inventory reports. |
| `init` | Bootstrap `CLAUDE.md` in any repo. |
| `agent-builder` | Create / improve agents and skills. |

The full canonical roster (with model + effort matrix) lives in [`agents/README.md`](./agents/README.md).

### Skills (`skills/`)

Slash-commands that route into the orchestrator (except the standalone utilities `/lint`, `/status`, `/memory`, `/tmux`, `/kg-viewer`):

`/issue`, `/plan`, `/design`, `/research`, `/spike`, `/test`, `/test-pipeline`, `/validate`, `/define-ac`, `/security`, `/audit`, `/review-pr`, `/deliver`, `/diagram`, `/likec4-diagram`, `/d2-diagram`, `/translate`, `/init`, `/recover`, `/eval`, `/gcp-costs`, `/cross-repo`, plus the standalone utilities above and `/background` (fire-and-forget dispatch for trivially scoped tasks; eligibility-gated, does not invoke the orchestrator).

### Hooks (`hooks/`)

Generic OS-native notification scripts: `notify-windows.sh` (PowerShell toast), `notify-mac.sh` (`osascript`), `notify-linux.sh` (`notify-send`).

### Knowledge-graph MCP (`chromadb-mcp/`)

ChromaDB-backed MCP server that gives Claude Code semantic memory across projects. Ships with a web viewer, a legacy migration tool, and `export.py` / `import.py` for non-destructive KG sharing between developers.

Every KG operation (view, edit, share, run the server, migrate) is documented in [`chromadb-mcp/README.md`](./chromadb-mcp/README.md) — that file is the canonical reference.

---

## How the agent system works

The orchestrator coordinates a **Spec-Driven Development** pipeline with redundant acceptance gates:

```
Specify (AC) → Design → Plan Ratification → Implement → Verify (test + validate + security)
            → Acceptance Gate → Acceptance Check (conditional) → Deliver → KG Save
```

Phase highlights:
- **Plan Ratification (1.5)** — `qa` confirms every AC maps to a Work Plan step before any code is written.
- **Acceptance Gate (3.5)** — orchestrator re-reads test, validation and security artifacts; routes back if any AC lacks a passing test or PASS verdict.
- **Acceptance Check (3.6)** — independent `acceptance-checker` audits the original spec against delivered artifacts. Runs only on complex changes, multi-file diffs, or after any verify iteration.

Every feature, fix, or refactor the team takes on flows through the orchestrator. The developer reads the plan before the pipeline proceeds, and every generated PR goes through human review.

See [`CLAUDE.md`](./CLAUDE.md) for the full internal contract and conventions.

---

## Updating the system

Pull the latest changes and re-run the installer:

```bash
git pull
./bin/install.sh      # or: uv run bin/install.py
```

The installer is idempotent. Unchanged files are skipped silently; conflicting files (yours differ from the repo) are reported so you can choose to keep or replace them.

---

## Contributing

Develop against the source files in `agents/`, `skills/`, `hooks/`, and `chromadb-mcp/` — not against `~/.claude/` directly. After editing, run the installer locally to propagate into your own `~/.claude/`.

Follow conventional commits (`feat(agents): ...`, `fix(installer): ...`, `docs(readme): ...`), always open a PR (never push to `main` directly), and add an entry to `CHANGELOG.md` under `[Unreleased]`.

See [`CLAUDE.md`](./CLAUDE.md) for the full contribution workflow and the agent-level conventions.

---

## License

[MIT](./LICENSE) © 2026 Mario Gutierrez.
