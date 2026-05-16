# claude-dev-team

A standardized, opinionated Claude Code agent system for software teams: 17 agents, 28 skills (3 of which are complex multi-file skills), OS-native notification hooks (including a `PreToolUse` policy gate that blocks destructive commands), a ChromaDB-backed knowledge-graph MCP server, and a cross-platform installer that wires everything into your `~/.claude/`.

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
| `plan-reviewer` | Read-only audit of Stage 1 artifacts against five plan-shape rules (Phase 1.6, before STAGE-GATE-1). |
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

ChromaDB-backed MCP server that gives Claude Code semantic memory across projects. The KG stores **9 entity types** (`pattern`, `error`, `constraint`, `decision`, `tool-gotcha`, `process-insight`, `project`, `service`, `stack-profile`) and **5 relation types** (`relates_to`, `belongs-to`, `calls`, `uses-stack`, `depends-on`) — see [`docs/kg-content-policy.md`](./docs/kg-content-policy.md) for the canonical vocabulary. Ships with a web viewer, a legacy migration tool, and `export.py` / `import.py` for non-destructive KG sharing between developers.

Every KG operation (view, edit, share, run the server, migrate) is documented in [`chromadb-mcp/README.md`](./chromadb-mcp/README.md) — that file is the canonical reference.

---

## How the agent system works

The orchestrator coordinates a **Spec-Driven Development** pipeline organised in **three stages** with mandatory human checkpoints at the close of Stage 1 and Stage 3, and a default-on per-PR checkpoint in Stage 2 that the user can disable by granting autonomy at Stage 1:

```
STAGE 1 — Analysis
  Specify → Design (01-architecture.md + 02-task-list.md) → Plan Ratification → Plan Review
  → STAGE-GATE-1 (mandatory human STOP)
STAGE 2 — Implementation (per PR)
  Implement → Constraint Reconciliation → Verify (test + validate + security)
  → Acceptance Gate → Acceptance Check (conditional)
  → STAGE-GATE-2 (between PRs; skipped silently if autonomous granted at GATE-1)
STAGE 3 — Delivery
  Deliver → Internal Review (advisory) → STAGE-GATE-3 (mandatory human STOP)
  → GitHub Update → KG Save
```

Phase highlights:
- **Dual-output design (1)** — the architect writes `01-architecture.md` (design proposal) AND `02-task-list.md` (list of PRs with per-PR acceptance criteria in Given/When/Then format) by default. One PR per service is the default; splits require a documented temporal-prod reason from a closed list (coexistence window / production-signal dependency / cross-repo deploy gate).
- **Plan Ratification (1.5)** — `qa` confirms every AC maps to a Work Plan step before any code is written.
- **Plan Review (1.6)** — `plan-reviewer` audits Stage 1 artifacts against five plan-shape rules: one PR per service, per-PR ACs in GWT, consolidated documents (no version markers, strikethrough, "previously decided"), cross-references, service identity. Read-only verdict pass/concerns/fail before STAGE-GATE-1.
- **STAGE-GATE-1** — mandatory human approval of the plan. Reply `approve` (proceed with per-PR stops) or `approve autonomous` (skip STAGE-GATE-2 between PRs). Cannot be skipped.
- **Constraint Reconciliation (2.5)** — when implementer or architect annotated `[CONSTRAINT-DISCOVERED]` against an AC, trivial constraints are reconciled inline; non-trivial ones invoke `qa` (mode `reconcile`) to decide keep / amend / drop. Drops require user confirmation.
- **Acceptance Gate (3.5)** — orchestrator re-reads test, validation and security artifacts for the current PR; routes back if any AC lacks a passing test or PASS verdict. Test-ratchet is enforced here.
- **Acceptance Check (3.6)** — independent `acceptance-checker` audits the original spec against delivered artifacts. Runs only on complex changes, multi-file diffs, or after any verify iteration.
- **STAGE-GATE-2** — between PRs in Stage 2. Default STOP per PR; silently skipped when the user granted autonomy at GATE-1 or promoted at a prior GATE-2.
- **Internal Review (4.5)** — advisory pass: `reviewer` triages the freshly-pushed diff (mode `internal`, no GitHub publish) and surfaces the top 3 highest-severity issues to the user. Skipped on tiny diffs and hotfixes.
- **STAGE-GATE-3** — mandatory human approval before push to GitHub. Reply `ship` / `amend` / `abort`. Cannot be skipped in any mode (push is irreversible).

Every gate's outcome is recorded in `session-docs/{feature-name}/00-execution-events.jsonl` (machine-readable trace) and a `done.yml` formal completion file. `delivery` aborts if `done == false`. Tool capability is scoped per agent in frontmatter; destructive Bash commands and writes to sensitive files are blocked at `PreToolUse` by `hooks/policy-block.sh`. Diffs above the reviewability cap (>400 lines or >8 files) require an explicit justification or are split into multiple PRs.

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
