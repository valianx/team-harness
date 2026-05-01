# CLAUDE.md — claude-dev-team

> Bootstrap config for Claude Code in this repository. Keep it actionable.

---

## 1. Purpose & Boundaries

**What this repo is.** `claude-dev-team` is a **distribution of a Claude Code agent system**. It packages a curated set of agents (system prompts), skills (slash commands), hooks (OS-native notifications), a ChromaDB-backed knowledge-graph MCP server, and a cross-platform installer that wires everything into a developer's `~/.claude/` + `~/.claude.json`. Target audience: developers on Mario's team who already use Claude Code and want a standardized orchestrated dev-team setup.

**What this repo is NOT.**
- Not an application, library, API, or service.
- Not a runtime — nothing executes from this repo except the installer and the MCP server (after installation).
- No test suite, no build step.
- Not a general-purpose framework — it encodes a specific opinionated workflow (orchestrator + specialized subagents + SDD pipeline).

**External dependencies (required).**
- `uv` — Python toolchain manager. Runs the installer and the ChromaDB MCP server. Install: https://docs.astral.sh/uv/getting-started/installation/
- `gh` — GitHub CLI. Used by `/issue`, `/review-pr`, `/deliver`, and others. Install: https://cli.github.com/
- **context7 API key** — for library docs retrieval. Get one at https://context7.com/ (the installer prompts for it or reads `CONTEXT7_API_KEY` from the environment).

**External dependencies (optional).**
- `d2` CLI — for `/d2-diagram`.
- `likec4` CLI — for `/likec4-diagram`.
- Playwright (auto-installed by the Excalidraw skill on first use).

**Target OS.** Windows, macOS, or Linux.

---

## 2. Repo Map

```
claude-dev-team/
├── agents/              System prompts — one .md per agent
├── skills/              Slash-command definitions
│   ├── *.md             Simple skills (one-file slash commands)
│   ├── d2-diagram/      Complex skills (SKILL.md + references/)
│   ├── excalidraw-diagram/
│   └── likec4-diagram/
├── hooks/               OS-native notification scripts + config template
│   ├── notify-windows.sh
│   ├── notify-mac.sh
│   ├── notify-linux.sh
│   └── config.json      Per-OS hook templates for ~/.claude/settings.json
├── chromadb-mcp/        Knowledge-graph MCP server (Python + ChromaDB)
│   ├── server.py
│   ├── pyproject.toml
│   ├── uv.lock
│   ├── manage-server.sh     Optional: run in SSE mode
│   ├── migrate_knowledge.py Optional: legacy JSONL → ChromaDB
│   └── viewer/app.py        Optional: web UI to inspect the KG
├── bin/
│   ├── install.py       Installer (Python, PEP 723 inline metadata)
│   ├── install.sh       Bootstrap for Unix/macOS (installs uv, invokes install.py)
│   └── install.ps1      Bootstrap for Windows (same via PowerShell)
├── docs/
│   └── knowledge.md     Project knowledge base — decisions, patterns, stack
├── shared-knowledge/    Drop-off for shared KG exports (see folder README)
├── README.md            Human-facing overview
├── CHANGELOG.md         Keep-a-Changelog + semver
├── CLAUDE.md            This file
└── session-docs/        Ephemeral agent session notes (git-ignored)
```

**Ownership boundaries.**
- `agents/` — system prompts only. One `.md` = one agent.
- `skills/` — slash-command entry points. Most are thin: parse args → route to orchestrator. A few are standalone (`/lint`, `/status`, `/memory`, `/tmux`, `/kg-viewer`).
- `hooks/` — keep these **generic and portable** (no personal tokens, no private endpoints). User-specific hooks belong in `~/.claude/hooks/`, not here.
- `chromadb-mcp/` — the KG MCP server source. Runtime state (`.venv/`, `.server.pid`, `server.log`, `__pycache__/`) is git-ignored.
- `bin/install.py` — **stdlib-only** by design. If a dep becomes necessary, declare it in the PEP 723 header and keep the script runnable via `uv run`.

**Ephemeral content** (not committed): `session-docs/`, all runtime artifacts inside `chromadb-mcp/`.

---

## 3. Tech Stack

| Layer | Choice |
|---|---|
| Installer | Python ≥ 3.11 (stdlib only; PEP 723 inline metadata, executed by `uv run`) |
| Bootstrap scripts | Bash (`install.sh`) + PowerShell (`install.ps1`) — ensure `uv` is present, invoke `install.py` |
| Agents / skills | Markdown with YAML frontmatter |
| Complex skills | Markdown + referenced scripts (Python/Node via `uv run` or CLIs) |
| Hooks | Bash scripts (`.sh`) — run via Git Bash on Windows, native on macOS/Linux |
| KG MCP server | Python + ChromaDB (PersistentClient) + FastMCP, run via `uv run` |
| Config | JSON (`hooks/config.json`) + `~/.claude.json` merge for `mcpServers` |
| Visuals | Excalidraw (`.excalidraw` JSON), PNG preview |

**Current version:** `0.1.0` (see `bin/install.py` `__version__` and `CHANGELOG.md`).

**No package manager, no lockfile, no build for the installer.** `bin/install.py` has zero third-party deps by design. `chromadb-mcp/` is the one exception and uses `pyproject.toml` + `uv.lock` (managed by `uv`).

---

## 4. Golden Commands

All commands run from the repo root.

| Intent | Command |
|---|---|
| Install (Unix / macOS) | `./bin/install.sh` |
| Install (Windows PowerShell) | `.\bin\install.ps1` |
| Install (any OS, with `uv` already present) | `uv run bin/install.py` |
| Non-interactive install | `CONTEXT7_API_KEY=<key> uv run bin/install.py` |
| View which files the installer would touch | Run the installer — it reports installed / unchanged / conflicts; never overwrites |
| Resolve a conflict | Delete the conflicting file in `~/.claude/...` and re-run the installer |
| Enable notification hooks | Open `hooks/config.json`, copy the section for your OS, merge it into `~/.claude/settings.json` under `"hooks"` |
| Start the KG MCP in SSE mode | `./chromadb-mcp/manage-server.sh start` (optional; stdio mode is the default and needs no server) |
| Open the KG viewer | `uv run chromadb-mcp/viewer/app.py` |
| Export local KG to JSON | `uv run --directory chromadb-mcp/ python export.py --out shared-knowledge/<name>-<date>.json` |
| Import a shared KG JSON | `uv run --directory chromadb-mcp/ python import.py shared-knowledge/<file>.json` |
| Migrate from legacy Memory MCP | `uv run chromadb-mcp/migrate_knowledge.py --source ~/.claude/knowledge.json` |
| Validate agents/skills health | `/lint` inside Claude Code |
| Run the verification suite (policy-block + structure) | `bash tests/run-all.sh` |
| Run only the policy-block functional tests | `bash tests/test_policy_block.sh` |
| Run only the agent/skill/hook structural tests | `python3 tests/test_agent_structure.py` |

**Not applicable to this repo:** typecheck, unit test of agent prompt behaviour, integration test of the live pipeline, e2e, build, dev server, migrations, deploy. The repo ships declarative assets, an installer, and one MCP server — no code pipeline. The `tests/` suite covers the **two surfaces that ARE testable without a live LLM**: `hooks/policy-block.sh` (functional, ~48 cases) and the structural integrity of the agent / skill / hook `.md` and `.json` files (cross-references, mandatory sections, frontmatter fields, ~98 assertions). It does NOT validate prompt behaviour — that still requires running pipelines through Claude Code.

---

## 5. Architectural Conventions

- **One concern per file.** One agent per `.md` in `agents/`. One skill per `.md` in `skills/` (complex skills get their own subfolder).
- **Frontmatter-driven agents.** Every agent file starts with YAML frontmatter (`name`, `description`, `model`, `color`). `init`, `architect`, `agent-builder` use `opus`; others generally use `sonnet`.
- **Orchestrator is the hub.** Skills never invoke agents directly — they build a task payload and route to `orchestrator`. Exceptions: standalone utilities (`/lint`, `/status`, `/memory`, `/tmux`, `/kg-viewer`).
- **Session-docs as the shared board.** Agents communicate through files in `session-docs/{feature-name}/`, never through return values. `session-docs/` is always git-ignored.
- **Status-block return protocol.** Agents finish with a compact status block; the orchestrator gates on the block without re-reading full session-docs on happy paths.
- **Installer is idempotent and non-destructive.** Conflicts (existing file with different hash) are reported, never overwritten. User must delete manually to force a re-install. `~/.claude.json` is backed up before every merge.
- **Cross-platform first.** All scripts and agents must work on Windows, macOS, and Linux. Avoid Unix-only tools or shell-specific syntax in agent prompts.
- **KG content is technical-only.** The knowledge graph must never store personal data, user profiles, preferences, tokens, or stakeholder names. (Policy document pending — see `docs/knowledge.md` or a future `docs/kg-content-policy.md`.)

**Architectural changes must be reviewed by the `architect` subagent before implementation.** Applies especially to: adding an agent, changing the pipeline flow, modifying the installer's contract with `~/.claude/` or `~/.claude.json`, introducing a new memory layer.

---

## 6. Architecture Decisions
<!-- Populated by the delivery agent after each feature. Empty at init. -->

## 7. Patterns & Conventions
<!-- Populated by the delivery agent after each feature. Empty at init. -->

## 8. Known Constraints
<!-- Populated by the delivery agent after each feature. Empty at init. -->

## 9. Testing Conventions

The repo has a verification suite at `tests/` that covers what is testable without a live LLM:

- **`tests/test_policy_block.sh`** — functional tests for `hooks/policy-block.sh`. Each case feeds a tool-call JSON payload and asserts the output (deny → JSON with `permissionDecision: "deny"`; allow → empty stdout). ~48 cases: `rm` destructive vs safe (`/`, `~`, `$HOME`, `--`, wildcard), git destructive vs safe (`--force`, `--no-verify`, `reset --hard`, `clean -f`), SQL DROP/TRUNCATE, sensitive paths (`.env`, `.pem`, `.ssh/`, `.aws/credentials`, `secrets.*`), allow-list variants (`.env.example`/`.sample`/`.template`), malformed payloads (fail-open).
- **`tests/test_agent_structure.py`** — structural tests across `agents/`, `skills/`, `hooks/`. ~98 assertions in 11 suites covering tool allowlists per agent, the 5-column Roster matrix, the new pipeline phases (1.5 / 2.5 / 3.5 / 3.6 / 4.5), the `tester` / `qa` / `reviewer` / `implementer` / `delivery` contracts, the `PreToolUse` wiring across windows/macos/linux, and the README cross-references.
- **`tests/run-all.sh`** — wrapper that runs both suites and exits 0 if all pass.

**When to add a test.** Any new pattern in `policy-block.sh` (new denylist or allowlist case) MUST be backed by an `assert_deny` / `assert_allow` line. Any new pipeline phase, new agent contract field, or new mandatory section MUST be backed by a `check(...)` line in the appropriate suite of `test_agent_structure.py`. Both files are append-only by design — refactor an assertion only when the assertion itself is wrong.

**What the tests do NOT cover.** Agent prompt behaviour (whether Claude actually applies the implementer's `Reviewability self-check` is a behavioural question), hook integration with Claude Code (whether the harness invokes `policy-block.sh` on every Bash/Write/Edit/NotebookEdit depends on `~/.claude/settings.json`), and live pipeline runs (Phase 2.5 / 4.5 only fire inside a real pipeline). For those, restart Claude Code and smoke-test by hand.

---

## 10. Contribution Workflow (repo-specific)

This repo ships assets to other developers, so the contribution flow matters more than code-level conventions.

- **Develop in `agents/`, `skills/`, `hooks/`, `chromadb-mcp/` directly.** Do not edit `~/.claude/` by hand for changes you intend to share — they'll get overwritten or drift.
- **Propagate via installer.** After editing, run `./bin/install.sh` (or `uv run bin/install.py`) locally to sync into your own `~/.claude/`. The installer refuses to overwrite conflicts, so delete the target file if it already exists with a different hash.
- **Complex skills** live in `skills/{name}/` with a `SKILL.md` plus any `references/`. The installer recursively copies the whole subfolder to `~/.claude/skills/{name}/`.
- **Never commit personal data.** Hooks must be generic (no tokens, no private endpoints). The chromadb-mcp source has the same rule — never commit runtime state, API keys, or machine paths.

---

## 11. Git & Delivery Conventions

- **Branch naming:** `feat/<name>`, `fix/<name>`, `chore/<name>`, `docs/<name>`.
- **Commits:** conventional commits (`feat(agents): …`, `fix(installer): …`, `docs(readme): …`).
- **Always PR, never push to `main` directly.** Even for one-line tweaks — the team relies on the review/audit trail.
- **Changelog:** every user-facing change (new agent, new skill, hook/installer change, MCP change) gets an entry in `CHANGELOG.md` under `[Unreleased]`. Keep a Changelog format, semver.
- **Versioning:** `bin/install.py` carries `__version__`; tag releases in git as `v<major>.<minor>.<patch>`. Current: `0.1.0`.

---

## 12. Subagent Orchestration

Routing table for this repo:

| Intent | Subagent | Output |
|---|---|---|
| Add/modify an agent, add/modify a skill, refactor the pipeline | `architect` + `agent-builder` | Design doc + updated `.md` files |
| Installer changes, hooks refactor, cross-platform fixes | `architect` → `implementer` | Architecture note + code changes |
| ChromaDB MCP changes (schema, API surface, storage layout) | `architect` → `implementer` | Architecture note + code changes; migration if storage touched |
| Tests (if/when introduced) | `tester` | Test plan + tests with factory mocks |
| Acceptance criteria + validation against AC | `qa` | AC list / validation report |
| Docs, CHANGELOG, version bump, branch, commit, PR | `delivery` | Docs + CHANGELOG + commit + PR |
| PR review | `reviewer` | Inline review, approve/request-changes |
| Security review of hooks, installer, or MCP (elevated privileges on user's machine) | `security` | OWASP/CWE-aligned report |
| Visualize agent flow | `diagrammer` / `likec4-diagrammer` / `d2-diagrammer` | Diagram file + preview |

**Escalation rules.**
- Touching `bin/install.py`, `bin/install.sh`, or `bin/install.ps1` → route to `architect` first (installer contract with `~/.claude/` and `~/.claude.json` is load-bearing).
- Adding/removing an agent → route to `architect` + `agent-builder`; also update `README.md` agent roster and the system diagram.
- Hook changes or MCP server changes → flag for `security` review (both execute with the user's privileges).
- Changing the orchestrator pipeline → architecture review mandatory; update `agents/orchestrator.md` + `agents/ref-direct-modes.md` + `agents/ref-special-flows.md` atomically.

---

## 13. When to Ask Humans

- Proposing a new direct mode or a new pipeline phase (changes the mental model).
- Changing the installer's target layout under `~/.claude/` or touching new keys in `~/.claude.json` beyond `mcpServers.memory` / `mcpServers.context7` (breaks existing users or risks clobbering personal config).
- Bundling personal tokens or user-specific hooks into the shared `hooks/` folder.
- Renaming or removing an agent/skill that other agents reference.
- Modifying the KG MCP storage schema (breaks existing KGs on developer machines).

---

## 14. Meta-Note

**This is the repo that produces the agents and skills of the orchestrator system.** A CLAUDE.md edit here does *not* propagate automatically — agents in this repo are read from `agents/*.md` as source artifacts, and developers pick them up via the installer. If you change agent behavior and want it to take effect on your own machine, re-run the installer.
