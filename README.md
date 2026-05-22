# Team Harness

> An **agent harness for Claude Code**. Turns the chat into a Spec-Driven Development pipeline with mandatory human gates, agent-then-human review at every transition, and full state captured as files so any session — yours, a teammate's, tomorrow's — can resume from where the last one left off.

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](./CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![Tests](https://img.shields.io/badge/tests-3%20suites-success.svg)](./tests)

---

## What this is

A **harness**, not a prompt pack. You install it once and Claude Code becomes a development pipeline:

- Every feature opens a `session-docs/{feature}/` folder with `00-state.md` as the single source of truth — any session can resume cold by reading it.
- The work is split into **3 stages** with **mandatory human gates** between them. Even in autonomous mode you keep two gates (plan approval and push approval).
- Specialised agents own each phase (`architect` designs, `implementer` writes code, `qa` validates, `plan-reviewer` audits the plan-shape, `delivery` ships). The `orchestrator` routes between them.
- Hard policy enforcement at `PreToolUse`: destructive commands, force-pushes to shared branches, writes to `.env` / `.pem` / `.ssh/` are denied before the shell sees them.

---

## Install

```bash
git clone https://github.com/valianx/team-harness.git
cd team-harness
./bin/install.sh         # Unix / macOS
# .\bin\install.ps1      # Windows (PowerShell)
```

Requirements: [Claude Code](https://docs.claude.com/en/docs/claude-code), [`gh`](https://cli.github.com/) (for orchestrator delivery flow), and a [context7](https://context7.com/) API key. Zero Python, zero `uv` — the bootstrap downloads a prebuilt Go binary from the latest GitHub Release and the agents talk to your external Memory MCP via HTTP.

The installer prompts for one thing: the **Memory MCP URL**. This is the public URL of your Knowledge Graph MCP server — typically [`context-harness-mcp`](https://github.com/valianx/context-harness-mcp) deployed to Railway, Render, Fly, your own server, or any Docker host of your choice. There is **no default URL** — paste your Knowledge Graph MCP URL or the full JSON snippet from your `context-harness-mcp /dashboard`. For non-interactive installs, set `MEMORY_MCP_URL` (and optionally `MEMORY_MCP_BEARER`) before running the installer.

For unattended installs:

```bash
MEMORY_MCP_URL=https://your-mcp.example.com/mcp \
CONTEXT7_API_KEY=ctx7sk-... \
./bin/install.sh
```

Pass `--force` to reset existing `mcpServers` entries: `./bin/install.sh --force`.

Restart Claude Code after install so it picks up the new agents and MCP servers. The installer is idempotent and never overwrites existing files (conflicts are reported, not silenced).

---

## How it works

A walkthrough of what happens when you ask for a feature.

**You type something like:** `/design add a daily reports endpoint`.

**Stage 1 — Analysis.** The `orchestrator` creates `session-docs/daily-reports/` and routes to the `architect`. The architect reads `docs/knowledge.md`, the codebase, and any prior session-docs; produces `01-architecture.md` (the design proposal) and `02-task-list.md` (one section per PR, with Given/When/Then acceptance criteria). `qa` runs Phase 1.5 to confirm every AC maps to a Work Plan step. `plan-reviewer` runs Phase 1.6 to audit the plan-shape (one PR per service, AC format, consolidated documents, cross-references). You receive **STAGE-GATE-1** — a STOP block with the TL;DR, the human-review decisions, and the PR table. Reply `approve` (per-PR stops in Stage 2) or `approve autonomous` (skip the per-PR stops).

**Stage 2 — Implementation, one PR at a time.** PRs run in parallel rounds computed from their `Depends on:` field (round 1 is everything with no dependencies). For each PR the `implementer` writes code strictly scoped to that PR's `Files:`. If a hidden constraint surfaces, the implementer annotates it and Phase 2.5 **Constraint Reconciliation** decides keep / amend / drop. The `tester` writes tests, the `qa` validates against the AC list, `security` audits if the change is security-sensitive — all in parallel. The Acceptance Gate (Phase 3.5) re-reads the three artifacts; if any AC is missing a passing test it routes back to the implementer. Phase 3.6 (`acceptance-checker`) independently compares the original spec against the delivered work. **STAGE-GATE-2** fires between PRs — unless you granted autonomy at GATE-1.

**Stage 3 — Delivery.** `delivery` updates the CHANGELOG, bumps the version, creates the feature branch, commits with conventional messages. Phase 4.5 **Internal Review** runs the `reviewer` advisory-mode on the freshly-pushed diff and surfaces the top 3 issues. **STAGE-GATE-3** is your final stop — reply `ship` / `amend` / `abort`. On `ship`, the PR opens on GitHub.

**Resume any time.** All state lives in files. `/recover {feature-name}` reads `00-state.md` and continues from `next_action`. Works across compactions, across sessions, across machines (as long as `session-docs/` travels with the repo).

**Self-describing progress.** Open `02-task-list.md` at any point and you see PR-level `Status:` (`pending | in-progress | verified | merged | blocked`) and AC checkboxes flipped to `- [x]` on PASS. No cross-referencing required.

---

## What's inside

The system ships **17 agents**, **28 skills** (slash commands), and three OS-native notification scripts plus a `PreToolUse` policy gate. The Knowledge Graph MCP server runs as an external service — see the Install section. Full per-component contracts in [`CLAUDE.md`](./CLAUDE.md).

### Agents

The pipeline runs on specialised agents. Highlights:

| Agent | Role |
|---|---|
| `orchestrator` | Routes the pipeline, owns gates and state. |
| `architect` | Design, research, planning. Writes `01-architecture.md` and `02-task-list.md`. |
| `implementer` | Production code. Scoped to one PR's `Files:`. |
| `tester` | Test suites with factory mocks; test-ratchet enforced. |
| `qa` | AC validation, plan ratification, constraint reconciliation. |
| `plan-reviewer` | Plan-shape audit (Phase 1.6, read-only). |
| `acceptance-checker` | Original-spec vs delivered audit (Phase 3.6). |
| `delivery` | CHANGELOG, version, branch, commit, PR. |
| `reviewer` | GitHub PR review and internal advisory review. |
| `security` | OWASP / CWE / ASVS audits. |

Full roster (with model + effort matrix) in [`agents/README.md`](./agents/README.md). Also ships: `diagrammer` / `likec4-diagrammer` / `d2-diagrammer` (architecture diagrams), `translator` (i18n), `gcp-cost-analyzer`, `init`, `agent-builder`.

### Skills

Slash-commands. Most route into the orchestrator; four are standalone utilities (`/lint`, `/status`, `/memory`, `/tmux`). Use what you need — common entries are `/design`, `/recover`, `/deliver`, `/review-pr`, `/issue`, `/background`.

### Hooks

`hooks/policy-block.sh` is the `PreToolUse` gate: 48 tested cases deny destructive Bash, force-push, no-verify, SQL DROP/TRUNCATE, writes to secret-bearing paths. Allow-list variants (`.env.example`, `.sample`, `.template`) explicitly permitted. Notification scripts (`notify-windows.sh` / `notify-mac.sh` / `notify-linux.sh`) are optional — merge their config block into `~/.claude/settings.json` to enable.

### Knowledge graph (external MCP service)

Semantic memory across projects. Agents call the Memory MCP server at the URL you configured during install. The server (`context-harness-mcp` or any MCP-compatible service) lives outside this repo — deploy it to Railway, Render, Fly, a VPS, or run it locally via Docker. Reference: [`docs/kg-content-policy.md`](./docs/kg-content-policy.md).

---

## Why a harness

The harness exists because chat-driven Claude Code, run unguided, has documented failure modes that compound over a feature's lifetime:

| Without a harness | With this harness |
|---|---|
| Acceptance criteria drift silently mid-task | `[CONSTRAINT-DISCOVERED]` annotations + Phase 2.5 reconciliation force keep/amend/drop to be a deliberate decision |
| Plans accumulate iteration cruft (`v1 → v6`, "previously decided", parallel review files) | `architect` forbids version markers; `qa` cannot write sibling review files — analysis docs read as one polished pass |
| Reviews get punted to the human ("the harness blocked it") | Phase 1.6 plan-review is inviolable — subagent or inline fallback, never escalated to the user without an audit |
| Multi-PR splits leave the WHY in nobody's head | Base PRs carry `Cleanup PR:` with operational rationale; secondary PRs carry `Base PR:` back-reference |
| "Did the AC pass?" requires reading three files | `02-task-list.md` self-describes: `Status:` per PR + AC checkboxes flipped on PASS |
| Agents silently disappear when their frontmatter has invalid YAML | Suite 3 parses every agent and fails on broken YAML |
| Destructive commands slip through inattention | `PreToolUse` policy blocks `rm -rf`, force push, secret-file writes |

Each row is a real failure mode encountered and patched. See [`docs/knowledge.md`](./docs/knowledge.md) for the canonical pattern / decision log.

---

## Verification

```bash
bash tests/run-all.sh
```

| Suite | Catches | Count |
|---|---|---|
| `test_policy_block.sh` | Destructive-command leakage at `PreToolUse` | 48 cases |
| `test_agent_structure.py` | Missing contract sections, drift between agents, role conflicts, model+effort matrix | 282 assertions across 16 sub-suites |
| `test_agent_frontmatter.py` | Silent-agent-drop class of bug (invalid YAML in agent frontmatter) | 19 agents |

Prompt behaviour itself only validates in live pipelines — restart Claude Code and smoke-test by hand.

---

## Updating

```bash
git pull
./bin/install.sh
```

The installer is idempotent. Unchanged files are skipped; conflicting files (yours differ from the repo) are reported so you can choose.

---

## Roadmap

**Today.** Team Harness is built on **Claude Code** specifically — the agents, skills, hooks, and installer assume the Claude Code CLI, the `Task(subagent_type=…)` dispatch model, the `~/.claude/` layout, and the slash-command surface. There is no abstraction layer over the runtime.

**v2 — provider abstraction.** A future major version will introduce a runtime layer that lets the same agent + skill + hook artifacts target other agentic systems (OpenAI Assistants, LangGraph, local-model harnesses, etc.) without rewriting prompts. The orchestration model (Stage 1 / 2 / 3 + parallel verify + mandatory human gates) is provider-agnostic; the bindings are not. Naming the repo `team-harness` instead of `claude-dev-team` is the first step in that direction — the brand stops claiming a vendor before the code is ready to back it up.

No timeline yet. PRs welcome that explore the abstraction shape without breaking the current Claude Code path.

---

## Contributing

Develop against the source files in `agents/`, `skills/`, `hooks/` — not `~/.claude/` directly. After editing, re-run the installer to propagate. Working agreements (enforced — see [`CLAUDE.md` §6](./CLAUDE.md)):

- Feature branch (`feat/<kebab>`, `fix/<kebab>`, `chore/<kebab>`, `docs/<kebab>`, `refactor/<kebab>`) — never commit on `main`.
- Conventional-commit messages.
- Never push to `main` directly — every change ships via pull request.
- Every user-facing change updates `CHANGELOG.md` under `[Unreleased]`.

---

## License

[MIT](./LICENSE) © 2026 Mario Gutierrez.
