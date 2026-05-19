# CLAUDE.md — claude-dev-team

> Bootstrap config for Claude Code in this repository. Keep it actionable.

---

## 1. Purpose & Boundaries

**What this repo is.** `claude-dev-team` is a **distribution of a Claude Code agent system**. It packages a curated set of agents (system prompts), skills (slash commands), hooks (OS-native notifications), a knowledge-graph MCP server (current backend: ChromaDB), and a cross-platform installer that wires everything into a developer's `~/.claude/` + `~/.claude.json`. Target audience: developers on Mario's team who already use Claude Code and want a standardized orchestrated dev-team setup.

**What this repo is NOT.**
- Not an application, library, API, or service.
- Not a runtime — nothing executes from this repo except the installer and the MCP server (after installation).
- No test suite, no build step.
- Not a general-purpose framework — it encodes a specific opinionated workflow (orchestrator + specialized subagents + SDD pipeline).

**External dependencies (required).**
- `gh` — GitHub CLI. Used by `/issue`, `/review-pr`, `/deliver`, and others. Install: https://cli.github.com/
- **context7 API key** — for library docs retrieval. Get one at https://context7.com/ (the installer prompts for it or reads `CONTEXT7_API_KEY` from the environment).

**External dependencies (required for the deprecated Python fallback only).**
- `uv` — Python toolchain manager. Only needed if you run `bin/install.py` directly (deprecated fallback). The new Go binary installer requires only `curl` + `bash` (Unix/macOS) or PowerShell (Windows). Install: https://docs.astral.sh/uv/getting-started/installation/

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
├── knowledge-graph/        Knowledge-graph MCP server (Python + ChromaDB)
│   ├── server.py
│   ├── pyproject.toml
│   ├── uv.lock
│   ├── manage-server.sh     Optional: run in SSE mode
│   ├── migrate_knowledge.py Optional: legacy JSONL → ChromaDB
│   └── viewer/app.py        Optional: web UI to inspect the KG
├── cmd/
│   └── install/         Go installer source (cross-compiled to GH Release assets)
│       ├── main.go
│       ├── prompts.go
│       ├── preservation.go
│       ├── claude_json.go
│       ├── files.go
│       ├── manifest.go
│       ├── context7.go
│       ├── install_kg.go
│       ├── legacy.go
│       ├── summary.go
│       ├── util.go
│       ├── platform.go
│       └── preservation_test.go
├── bin/
│   ├── install.py       DEPRECATED — Python installer (fallback; removed next major)
│   ├── install.sh       Bootstrap for Unix/macOS (downloads Go binary from GH Release)
│   └── install.ps1      Bootstrap for Windows (same via PowerShell)
├── .github/
│   └── workflows/
│       └── release.yml  Cross-compile workflow: tag v* → 5 binaries + SHA256SUMS
├── go.mod               Go module (github.com/valianx/claude-dev-team, Go 1.23)
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
- `knowledge-graph/` — the KG MCP server source. Runtime state (`.venv/`, `.server.pid`, `server.log`, `__pycache__/`) is git-ignored.
- `cmd/install/` — Go installer source. No third-party deps (stdlib-only). Compiled with `CGO_ENABLED=0` for static single-file binaries.
- `bin/install.py` — **deprecated** fallback (one release). Do not add logic here; new logic goes in `cmd/install/`.

**Ephemeral content** (not committed): `session-docs/`, all runtime artifacts inside `knowledge-graph/`.

---

## 3. Tech Stack

| Layer | Choice |
|---|---|
| Installer | Go 1.23+ (cross-compiled static binaries shipped as GH Release assets; source at `cmd/install/main.go`). `bin/install.py` kept as deprecated fallback for one release. |
| Bootstrap scripts | Bash (`install.sh`) + PowerShell (`install.ps1`) — detect OS+arch, download the right Go binary from the latest GH Release, exec it. No `uv` or Python required. |
| Agents / skills | Markdown with YAML frontmatter |
| Complex skills | Markdown + referenced scripts (Python/Node via `uv run` or CLIs) |
| Hooks | Bash scripts (`.sh`) — run via Git Bash on Windows, native on macOS/Linux |
| KG MCP server | Python + ChromaDB (PersistentClient) + FastMCP, run via `uv run` |
| Config | JSON (`hooks/config.json`) + `~/.claude.json` merge for `mcpServers` |
| Visuals | Excalidraw (`.excalidraw` JSON), PNG preview |

**Current version:** `1.1.0` (see `bin/install.py` `__version__` and `CHANGELOG.md`).

**No package manager, no lockfile, no build for the installer.** `bin/install.py` has zero third-party deps by design. `knowledge-graph/` is the one exception and uses `pyproject.toml` + `uv.lock` (managed by `uv`).

---

## 4. Golden Commands

All commands run from the repo root.

| Intent | Command |
|---|---|
| Install (Unix / macOS) | `./bin/install.sh` |
| Install (Windows PowerShell) | `.\bin\install.ps1` |
| Non-interactive install (memory backend) | `CONTEXT7_API_KEY=<key> ./bin/install.sh` |
| Non-interactive install (context-harness backend) | `CONTEXT7_API_KEY=<key> KG_BACKEND=context-harness CONTEXT_HARNESS_URL=https://<url>/mcp ./bin/install.sh` |
| Force-reset MCP config in ~/.claude.json | `./bin/install.sh` then pass `--force` (downloads binary + runs it with `--force`; use only when intentionally resetting) |
| Build installer from source (requires Go 1.23+) | `go build ./cmd/install` |
| Deprecated fallback (requires `uv`) | `uv run bin/install.py` |
| View which files the installer would touch | Run the installer — it reports installed / unchanged / conflicts; never overwrites |
| Resolve a conflict | Delete the conflicting file in `~/.claude/...` and re-run the installer |
| Enable notification hooks | Open `hooks/config.json`, copy the section for your OS, merge it into `~/.claude/settings.json` under `"hooks"` |
| Start the KG MCP in SSE mode | `./knowledge-graph/manage-server.sh start` (optional; stdio mode is the default and needs no server) |
| Open the KG viewer | `uv run knowledge-graph/viewer/app.py` |
| Export local KG to JSON | `uv run --directory knowledge-graph/ python export.py --out shared-knowledge/<name>-<date>.json` |
| Import a shared KG JSON | `uv run --directory knowledge-graph/ python import.py shared-knowledge/<file>.json` |
| Migrate from legacy Memory MCP | `uv run knowledge-graph/migrate_knowledge.py --source ~/.claude/knowledge.json` |
| Validate agents/skills health | `/lint` inside Claude Code |
| Run the free verification suite (policy-block + structure + YAML frontmatter) | `bash tests/run-all.sh` |
| Run only the policy-block functional tests | `bash tests/test_policy_block.sh` |
| Run only the agent/skill/hook structural tests | `python3 tests/test_agent_structure.py` |
| Run only the agent YAML frontmatter validator | `uv run --with PyYAML python tests/test_agent_frontmatter.py` |
| Run the behavioral suite (dispatches orchestrator via `claude -p`, ~$1/run) | `bash tests/run-behavioral.sh` |

**Not applicable to this repo:** typecheck, unit test of agent prompt behaviour, integration test of the live pipeline, e2e, build, dev server, migrations, deploy. The repo ships declarative assets, an installer, and one MCP server — no code pipeline. The `tests/` suite covers the **three surfaces that ARE testable without a live LLM**: `hooks/policy-block.sh` (functional, ~48 cases), the structural integrity of the agent / skill / hook `.md` and `.json` files (~282 assertions across 16 suites), and the YAML frontmatter parseability of every `agents/*.md` (~19 files — catches the silent-agent-drop class of bug). It does NOT validate prompt behaviour — that still requires running pipelines through Claude Code.

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

## 6. Mandatory Working Agreements

> These are the minimum agreements that keep the codebase aligned across humans, agents, and outside contributors. They apply to every change in this repo, whether it goes through the orchestrator pipeline or is a manual commit. If a rule conflicts with a more specific instruction in §5 Architectural Conventions, the more specific one wins — but the rules below are the floor, not the ceiling.

### 6.1 Pre-work (read before you touch code)

- Read CLAUDE.md (this file) front to back, paying attention to §3 Tech Stack and §4 Golden Commands.
- Read README.md and scan `docs/` for any file titled `knowledge.md`, `architecture.md`, or a specific area README.
- Read the most recent `[Unreleased]` block of CHANGELOG.md to understand work in flight.

### 6.2 During-work

- Use a feature branch named `feat/<kebab>`, `fix/<kebab>`, `chore/<kebab>`, `docs/<kebab>`, or `refactor/<kebab>` — never commit on `main` or `master`.
- Use conventional-commit messages (`feat(area): …`, `fix(area): …`, `docs(area): …`, `refactor(area): …`, `chore(area): …`).
- Never push to `main`/`master` directly — every change ships via pull request.
- Never bypass policy gates (`git commit --no-verify`, `git push --force`/`--force-with-lease` to a shared branch, disabling hooks, deleting `.git/hooks/*`).

### 6.3 Post-work (deliverables for any user-facing change)

- Add a one-line entry under `## [Unreleased]` of CHANGELOG.md in the matching subsection (Added / Changed / Fixed / Removed / Security).
- If §3 Tech Stack or §4 Golden Commands of CLAUDE.md changed, update those sections in the same PR — do not let CLAUDE.md drift from the repo.
- If the change establishes a decision, pattern, or constraint that future work must respect, append a one-line bullet to `docs/knowledge.md` with the matching tag prefix (`[decisión]`, `[patrón]`, `[stack]`, `[restricción]`).
- If the repo has an OpenAPI spec (`openapi/openapi.yaml` or similar) and the change touches endpoints, bump `info.version` in the same commit as the spec change — never in a separate commit.

### 6.4 Governance (when to stop and escalate to a human)

- Stop and ask before any irreversible operation (production data migration, breaking API change, deletion of a public surface, force-push to a shared branch).
- Stop and ask when the requirement is ambiguous in a way that two different interpretations produce visibly different behaviour — do not pick one silently.
- Stop and ask when the change touches authentication, authorization, secrets, payments, or PII handling — these are always security-sensitive regardless of the rest of the change.

### 6.5 Anti-patterns (do not, ever)

- Do not commit secrets, tokens, API keys, `.env` files, certificates, or private keys — even temporarily, even on a feature branch.
- Do not `rm -rf` shared paths (`/`, `~`, `$HOME`, project root, `node_modules` of a shared workspace, `.git`); use the project's clean script or scoped paths only.
- Do not delete, rewrite, or skip tests to make a build green — fix the code or fix the test with a documented rationale in the PR body.

---

## 7. Architecture Decisions
<!-- Populated by the delivery agent after each feature. Empty at init. -->

## 8. Patterns & Conventions
<!-- Populated by the delivery agent after each feature. Empty at init. -->

## 9. Known Constraints
<!-- Populated by the delivery agent after each feature. Empty at init. -->

## 10. Testing Conventions

The repo has a verification suite at `tests/` that covers what is testable without a live LLM:

- **`tests/test_policy_block.sh`** — functional tests for `hooks/policy-block.sh`. Each case feeds a tool-call JSON payload and asserts the output (deny → JSON with `permissionDecision: "deny"`; allow → empty stdout). ~48 cases: `rm` destructive vs safe (`/`, `~`, `$HOME`, `--`, wildcard), git destructive vs safe (`--force`, `--no-verify`, `reset --hard`, `clean -f`), SQL DROP/TRUNCATE, sensitive paths (`.env`, `.pem`, `.ssh/`, `.aws/credentials`, `secrets.*`), allow-list variants (`.env.example`/`.sample`/`.template`), malformed payloads (fail-open).
- **`tests/test_agent_structure.py`** — structural tests across `agents/`, `skills/`, `hooks/`. ~282 assertions in 16 suites covering tool allowlists per agent, the 5-column Roster matrix, the pipeline phases (1.5 / 1.6 / 2.5 / 3.5 / 3.6 / 4.5), per-agent contract sections (`tester` / `qa` / `reviewer` / `implementer` / `delivery` / `architect` / `orchestrator`), session-docs hygiene guardrails (Files I write / MUST NOT write, no parallel review files, no iteration history in analysis docs), the inviolable Phase 1.6 gate with its inline fallback, the self-describing task-list contract (Status field + AC checkbox mirror), the `PreToolUse` wiring across windows/macos/linux, and the README cross-references.
- **`tests/test_agent_frontmatter.py`** — YAML frontmatter validity for every `agents/*.md`. Uses PyYAML via `uv run --with PyYAML python` to catch the silent-agent-drop class of bug (an unquoted `": "` inside a description breaks YAML parsing; Claude Code then silently drops the agent from the registered `subagent_type` list with no error surfaced). 19 agents currently parse cleanly.
- **`tests/run-all.sh`** — wrapper that runs all three suites and exits 0 if all pass.

**When to add a test.** Any new pattern in `policy-block.sh` (new denylist or allowlist case) MUST be backed by an `assert_deny` / `assert_allow` line. Any new pipeline phase, new agent contract field, or new mandatory section MUST be backed by a `check(...)` line in the appropriate suite of `test_agent_structure.py`. Any new agent file in `agents/` is picked up automatically by `test_agent_frontmatter.py` — no manual addition needed; the test fails immediately if its YAML does not parse. All three files are append-only by design — refactor an assertion only when the assertion itself is wrong.

**What the tests do NOT cover.** Agent prompt behaviour (whether Claude actually applies the implementer's `Reviewability self-check` is a behavioural question), hook integration with Claude Code (whether the harness invokes `policy-block.sh` on every Bash/Write/Edit/NotebookEdit depends on `~/.claude/settings.json`), and live pipeline runs (Phase 2.5 / 4.5 only fire inside a real pipeline). For those, restart Claude Code and smoke-test by hand.

---

## 11. Contribution Workflow (repo-specific)

This repo ships assets to other developers, so the contribution flow matters more than code-level conventions.

- **Develop in `agents/`, `skills/`, `hooks/`, `knowledge-graph/` directly.** Do not edit `~/.claude/` by hand for changes you intend to share — they'll get overwritten or drift.
- **Propagate via installer.** After editing, run `./bin/install.sh` (or `uv run bin/install.py`) locally to sync into your own `~/.claude/`. The installer refuses to overwrite conflicts, so delete the target file if it already exists with a different hash.
- **Complex skills** live in `skills/{name}/` with a `SKILL.md` plus any `references/`. The installer recursively copies the whole subfolder to `~/.claude/skills/{name}/`.
- **Never commit personal data.** Hooks must be generic (no tokens, no private endpoints). The knowledge-graph source has the same rule — never commit runtime state, API keys, or machine paths.

---

## 12. Git & Delivery Conventions

Git & delivery rules are now part of §6 Mandatory Working Agreements (see During-work and Post-work sub-blocks). This section is intentionally a pointer to keep one source of truth.

---

## 13. Subagent Orchestration

Routing table for this repo:

| Intent | Subagent | Output |
|---|---|---|
| Add/modify an agent, add/modify a skill, refactor the pipeline | `architect` + `agent-builder` | Design doc + updated `.md` files |
| Installer changes, hooks refactor, cross-platform fixes | `architect` → `implementer` | Architecture note + code changes |
| Knowledge-graph MCP changes (schema, API surface, storage layout) | `architect` → `implementer` | Architecture note + code changes; migration if storage touched |
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

**Universal rule — auto-takeover on `blocked-no-dispatch` (applies regardless of how the orchestrator was invoked):**

When the `orchestrator` subagent returns a response containing **"Dispatch handoff — top-level Claude takes over now"**, or when an existing `session-docs/{feature}/00-state.md` has `status: blocked-no-dispatch`, top-level Claude **MUST** take over dispatch immediately. This is not a user-decision point — the user already authorised the pipeline; the nested-context Task strip is a runtime detour, not a new authorisation. The takeover protocol is:

1. Do NOT ask the user "should I take over?" The directive in the orchestrator's response is itself the authorisation.
2. Do NOT re-invoke `@orchestrator` or any skill that routes via `Task(subagent_type=orchestrator, ...)` — that recreates the nested context and the boot probe will fail again.
3. Follow the **Takeover playbook** embedded in the orchestrator's response (or, if no response is present and you're entering from `00-state.md`, follow the `## Handoff` section of that file): read `00-state.md`, read `agents/{next-agent}.md`, dispatch the named `next-agent` directly via `Task` from the top-level session, parse its status block, update `00-state.md`, continue through the remaining phases.
4. Respect gate semantics during the takeover. STAGE-GATE-2 between PRs is skipped silently iff `autonomous: true`; STAGE-GATE-3 always stops for human approval regardless of autonomy.
5. Top-level Claude still inherits the "you NEVER write code/tests/docs" contract during the takeover — dispatch agents for each phase, do not write `02-implementation.md` / `03-testing.md` / `04-validation.md` / `04-security.md` / `05-delivery.md` / `06-acceptance-check.md` inline.
6. Report to the user only at pipeline completion, at a mandatory STAGE-GATE, or when a non-recoverable failure needs human input.

This rule applies to **every** entry mode: `@orchestrator` mention, skill routing (`/issue`, `/recover`, `/plan`, `/design`, `/deliver`, `/validate`, `/research`, `/spike`, `/test`, etc.), or another agent's referral. The `blocked-no-dispatch` state is the system's documented self-healing path — leaving it open for the user to resolve manually defeats the purpose.

---

## 14. When to Ask Humans

- Proposing a new direct mode or a new pipeline phase (changes the mental model).
- Changing the installer's target layout under `~/.claude/` or touching new keys in `~/.claude.json` beyond `mcpServers.memory` / `mcpServers.context7` (breaks existing users or risks clobbering personal config).
- Bundling personal tokens or user-specific hooks into the shared `hooks/` folder.
- Renaming or removing an agent/skill that other agents reference.
- Modifying the KG MCP storage schema (breaks existing KGs on developer machines).

---

## 15. Meta-Note

**This is the repo that produces the agents and skills of the orchestrator system.** A CLAUDE.md edit here does *not* propagate automatically — agents in this repo are read from `agents/*.md` as source artifacts, and developers pick them up via the installer. If you change agent behavior and want it to take effect on your own machine, re-run the installer.
