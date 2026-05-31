# CLAUDE.md — team-harness

> Bootstrap config for Claude Code in this repository. Keep it actionable.

---

## 1. Purpose & Boundaries

**What this repo is.** `team-harness` is a **pure distribution of a Claude Code agent system** (today; a future v2 will abstract over the runtime — see README Roadmap). It packages a curated set of agents (system prompts), skills (slash commands), hooks (OS-native notifications), and a cross-platform Go installer that wires everything into a developer's `~/.claude/` + `~/.claude.json`. The Memory MCP server (Knowledge Graph) is an **external service** — it lives outside this repo and is configured by a single URL during install. Target audience: developers on Mario's team who already use Claude Code and want a standardized orchestrated dev-team setup.

**What this repo is NOT.**
- Not an application, library, API, or service.
- Not a runtime — nothing executes from this repo except the installer and the MCP server (after installation).
- No test suite, no build step.
- Not a general-purpose framework — it encodes a specific opinionated workflow (orchestrator + specialized subagents + SDD pipeline).

**External dependencies (required).**
- **context7 API key** — for library docs retrieval. Get one at https://context7.com/ (the installer prompts for it or reads `CONTEXT7_API_KEY` from the environment).
- **Memory MCP URL** — public URL of a running MCP-compatible server (e.g., `context-harness-mcp` deployed to Railway/Render/Fly/Docker, or a local container). The installer prompts for it (interactive TTY) or reads `MEMORY_MCP_URL` from the environment (non-interactive / CI). **No default URL** — empty input is rejected and missing env var exits the installer with an explicit error. The previous silent fallback was removed because it produced misleading "connection refused" diagnostics for operators whose actual MCP lived on a different host. Every install requires the operator to provide their URL explicitly. Example format only: `https://your-mcp.example.com/mcp` — substitute the actual host of your own deployment.

**External dependencies (recommended).**
- `gh` — GitHub CLI. Enables full GitHub integration for `/issue`, `/review-pr`, `/deliver`, and others. Install: https://cli.github.com/ — When absent or unauthenticated, skills use `curl` against the GitHub REST API (if `$GH_TOKEN`/`$GITHUB_TOKEN` is set) or fall back to operator-paste paths with `blocked-manual-push` status. See `agents/_shared/gh-fallback.md` for the degradation contract.

**External dependencies (optional).**
- `d2` CLI — for `/d2-diagram`.
- `likec4` CLI — for `/likec4-diagram`.
- Playwright (auto-installed by the Excalidraw skill on first use).

**Target OS.** Windows, macOS, or Linux.

---

## 2. Repo Map

```
team-harness/
├── agents/              System prompts — one .md per agent
├── skills/              Slash-command definitions
│   ├── *.md             Simple skills (one-file slash commands)
│   ├── d2-diagram/      Complex skills (SKILL.md + references/)
│   ├── excalidraw-diagram/
│   ├── likec4-diagram/
│   ├── obsidian-markdown/
│   ├── obsidian-bases/
│   ├── json-canvas/
│   └── obsidian-cli/
├── hooks/               OS-native notification scripts + config template
│   ├── notify-windows.sh
│   ├── notify-mac.sh
│   ├── notify-linux.sh
│   ├── notify-stage.sh  Cross-platform stage-end wrapper (orchestrator calls this at each Stage boundary)
│   └── config.json      Per-OS hook templates for ~/.claude/settings.json
├── cmd/
│   └── install/         Go installer source (cross-compiled to GH Release assets)
│       ├── main.go
│       ├── modes.go          InstallMode type, low-cost matrix, in-flight transformer
│       ├── modes_test.go     Unit + integration tests for the transformer
│       ├── prompts.go
│       ├── preservation.go
│       ├── claude_json.go
│       ├── files.go
│       ├── manifest.go
│       ├── context7.go
│       ├── summary.go
│       ├── util.go
│       ├── platform.go
│       └── preservation_test.go
├── bin/
│   ├── install.sh       Bootstrap for Unix/macOS (downloads Go binary from GH Release)
│   ├── install.ps1      Bootstrap for Windows (same via PowerShell)
│   └── install.cmd      Bootstrap for Windows cmd.exe (same via curl)
├── .github/
│   └── workflows/
│       ├── release.yml  Cross-compile workflow: tag v* → 5 binaries + SHA256SUMS
│       └── pages.yml    Publish bootstrap scripts to GitHub Pages on release
├── assets.go            go:embed entry point (package teamharness) — embeds agents/, skills/, hooks/
├── go.mod               Go module (github.com/valianx/team-harness, Go 1.23)
├── docs/
│   └── knowledge.md     Project knowledge base — decisions, patterns, stack
├── README.md            Human-facing overview
├── CHANGELOG.md         Keep-a-Changelog + semver
├── CLAUDE.md            This file
└── workspaces/        Ephemeral agent session notes (git-ignored)
```

**Ownership boundaries.**
- `agents/` — system prompts only. One `.md` = one agent.
- `skills/` — slash-command entry points. Most are thin: parse args → route to orchestrator. A few are standalone (`/lint`, `/status`, `/memory`, `/tmux`, `/th-update`).
- `hooks/` — keep these **generic and portable** (no personal tokens, no private endpoints). User-specific hooks belong in `~/.claude/hooks/`, not here.
- `cmd/install/` — Go installer source. Uses `charm.land/huh/v2` for TUI. Compiled with `CGO_ENABLED=0` for static single-file binaries.

**Ephemeral content** (not committed): `workspaces/`.

---

## 3. Tech Stack

| Layer | Choice |
|---|---|
| Installer | **Legacy.** Go 1.23+ (cross-compiled binaries shipped as GH Release assets; `cmd/install/main.go` is the source). Agents, skills, and hooks are embedded at compile time via `//go:embed all:agents skills hooks` in `assets.go` (repo root) — the binary is self-contained and requires no repo clone at runtime. The `all:` prefix includes `agents/_shared/` which holds cross-cutting snippets. TUI powered by `charm.land/huh/v2` (bubbletea, lipgloss transitive). Deprecated as canonical install path since v2.33.0; use the plugin for new installs. |
| Bootstrap scripts | **Legacy.** Bash (`install.sh`) + PowerShell (`install.ps1`) + cmd.exe (`install.cmd`) — detect OS+arch and download the released binary from the deterministic `releases/latest/download/` URL (no GitHub API call). Served at `https://valianx.github.io/team-harness/install.{sh,ps1,cmd}` via a GitHub Pages workflow. Zero Python, zero `uv` required. See `bin/README.md`. |
| Agents / skills | Markdown with YAML frontmatter |
| Complex skills | Markdown + referenced scripts (Python/Node via `uv run` or CLIs) |
| Hooks | Bash scripts (`.sh`) — run via Git Bash on Windows, native on macOS/Linux |
| Memory MCP | External service (e.g., `context-harness-mcp` on Railway/Render/Fly/Docker). Configured by URL in `~/.claude.json`. Not bundled in this repo. |
| Config | JSON (`hooks/config.json`) + `~/.claude.json` merge for `mcpServers` |
| Visuals | Excalidraw (`.excalidraw` JSON), PNG preview |
| Distribution | Claude Code plugin (`th`) via custom marketplace (`valianx/team-harness`) — canonical install path. Go installer (legacy alternative for offline/CI/low-cost mode). |

**Current version:** `2.40.4` (see `.claude-plugin/plugin.json` `version` field — canonical source of truth for the plugin marketplace. `CHANGELOG.md` tracks the release history).

**Install modes.** The installer offers two modes (interactive prompt or `INSTALL_MODE` env var):

- `standard` (default) — copies agent files byte-identical to the source-repo `agents/*.md`. Canonical quality contract; recommended for operators on Anthropic Max or Team plans.
- `low-cost` — rewrites `model:` and `effort:` frontmatter in-flight during install, using the canonical matrix declared in `cmd/install/modes.go`. All 17 agents run on `sonnet`; effort is `medium` or `high` per agent. Suitable for developers on lower-tier Anthropic plans (Free, Pro, tight personal budget). Trade-offs, per-agent assignments, and the full matrix are documented in [`agents/README.md §"Low-cost mode"`](./agents/README.md#low-cost-mode).

**Dependencies.** The installer uses `charm.land/huh/v2` for the interactive TUI (form inputs, masked secrets, select groups, progress spinner). Transitive deps: bubbletea v2, lipgloss v2, bubbles v2. Binary size: 7.9–8.5 MB across targets. No package manager or build step beyond `go build`.

---

## 4. Golden Commands

All commands run from the repo root.

| Intent | Command |
|---|---|
| Install plugin | `/plugin marketplace add valianx/team-harness` then `/plugin install th` then `/th:setup` |
| Build installer from source (contributors) | `go run ./cmd/install` |
| Validate agents/skills health | `/th:lint` inside Claude Code |
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
- **orchestrator is the hub.** Skills never invoke agents directly — they build a task payload and route to `orchestrator`. Exceptions: standalone utilities (`/th:lint`, `/th:status`, `/th:memory`, `/th:tmux`, `/th:update`).
- **Workspaces as the shared board.** A workspace is the shared working directory for a single pipeline session — the place where agents and the operator collaborate. Each pipeline run creates its own isolated workspace, separate from all others. Agents use it as their primary communication channel (each reads previous agents' output and writes its own). The operator uses it as a review surface to inspect decisions, risks, and outcomes. Agents communicate through files in `workspaces/{feature-name}/`, never through return values. `workspaces/` is always git-ignored.
- **Dual-mode workspaces.** Pipeline workspaces can be output to a local `./workspaces/` directory (default) or to a configured Obsidian vault (`work-logs/{repo-name}/{date}_{feature}/`). The mode is configured via `logs-mode` in `~/.claude/.team-harness.json`. The orchestrator resolves the base path once at pipeline start and passes it to every agent — agents are unaware of the mode. When Obsidian mode is active, files receive YAML frontmatter with repo, feature, pipeline, date, and agent metadata.
- **Human-first document format.** Every workspace doc file uses a two-section layout: `## Review Summary` (human-readable decisions, risks, trade-offs — scannable in under 2 minutes) followed by `## Technical Detail` (full content for agent-to-agent communication). This applies in both local and Obsidian modes.
- **Status-block return protocol.** Agents finish with a compact status block; the orchestrator gates on the block without re-reading full workspaces on happy paths.
- **Installer always overwrites embedded files.** Agents, skills, and hooks are canonical bytes from the repo; direct edits to `~/.claude/agents/*.md` (or skills/hooks) are not a supported customization path and are replaced on every install. Unchanged files (hash-match) are skipped. `~/.claude.json` is backed up before every merge. Operator-specific identity (`mcpServers.memory` URL/bearer, context7 API key) uses a Keep/Change preservation menu and is never silently clobbered.
- **Session-scoped config override whitelist** — overridable (chat → `00-state.md` only): `logs-mode`, `logs-path`, `logs-subfolder`, `clickup.workspace_id`. Excluded → /th:setup: MCP URL, context7, model, effort.
- **Single config file — `~/.claude/.team-harness.json`.** All Team Harness settings live in one operator-private file: workspace log mode (`logs-mode`, `logs-path`, `logs-subfolder`), the installer `files` manifest, version metadata, and any skill-specific settings (e.g. ClickUp credentials under a `clickup` key). Skills MUST NOT create their own config files in `~/.claude/` (no `clickup.json`, no per-skill `.json`) — a setting belongs under a namespaced key inside `.team-harness.json`. Every write is a merge: read the full document, replace only the owned key, write the whole document back. Never overwrite the file with a skill-only payload — that destroys the log config and the manifest. The sole exception is `~/.claude/settings.json`, which is Claude Code's own native file (hook wiring, permissions) and is owned by the harness, not by Team Harness.
- **Cross-platform first.** All scripts and agents must work on Windows, macOS, and Linux. Avoid Unix-only tools or shell-specific syntax in agent prompts.
- **KG content is technical-only.** The knowledge graph must never store personal data, user profiles, preferences, tokens, or stakeholder names. See `docs/kg-content-policy.md`.
- **KG passive capture on delivery.** The `delivery` agent persists one `process-insight` node per successfully-completed task (Step 11.5 of its workflow). The insight is synthesised from workspaces + the CHANGELOG entry and describes what was learned that future tasks can reuse — not what changed (that's the CHANGELOG). The call is best-effort: if the Memory MCP server is unreachable or the task has no reusable learning, the step logs and skips. This builds team knowledge automatically without operator curation.
- **Pipeline observability is mandatory.** Every pipeline run produces two observability artifacts in `workspaces/{feature}/`: `00-execution-events.jsonl` (local mode) or `00-execution-events.md` (obsidian mode) — append-only event trace, machine-readable, queryable with `jq` — and `00-pipeline-summary.md` (human-readable rollup, rewritten in full at every phase transition). Both are written exclusively by the orchestrator (agents return tool-usage counts in their status blocks; the orchestrator propagates them into the `tools` field of `phase.end` events and aggregates them into the summary). Every KG write emits a reason-coded `kg_write` event (`attempted`/`succeeded` counters + the closed vocabulary `ok | skipped:mcp-down | skipped:malformed-call | skipped:policy-filtered`), aggregated by `/trace` into a write-integrity rollup so a silently-skipped KG write is never invisible. The `/trace <feature>` skill is the canonical 30-second answer to "did this pipeline work and were the tools effective?" and detects both formats automatically. The legacy `pipeline-metrics.json` / `done.yml` artifacts are deprecated. Writing observability events is mandatory, not best-effort: skipping appends to save tokens deletes the only signal we have on pipeline health.
- **Documentation freshness via context7.** Every decision involving a third-party library's API or configuration syntax must be verified against context7 before code is generated. Training-snapshot knowledge is treated as potentially stale. Mandatory triggers per agent are documented in `docs/context7-usage.md` §2 (architect, implementer, tester, security, translator); `init` is a light reference. Every consulting agent emits `context7_consult: hit:N miss:N skipped:M` in its status block — even when all counts are zero, the line's presence signals the agent considered freshness. Absence of context7 ≠ excuse to ignore the check: fall back to training knowledge and document the fallback in the workspace doc's `## Documentation Consulted` section.
- **Bug-fix flow forces security review and mandatory regression test.** For `type: fix` and `type: hotfix`, `security-sensitive: true` is forced at Phase 0a Step 7 — the `security` agent runs at Phase 3 in parallel with `tester` and `qa` regardless of any other criterion. Defense-in-depth rationale: many bugs have non-obvious security implications (input-validation bugs that are actually injection, race conditions that are TOCTOU vulnerabilities, error-handling bugs that leak information), and fixes can introduce new vulnerabilities. The Bug-fix Pipeline also adds **Phase 2.0 — Regression Test Authoring** between STAGE-GATE-1 and Phase 2: the tester authors a failing test BEFORE the implementer touches source code. The regression test is mandatory always; there is no fallback path. The implementer runs under a scope-discipline contract that forbids tangential refactors. Tier classification (1-4) determines architect participation, regression-test gating, and Phase 3 agent set: Tier 1 (docs/trivial) skips the architect and conditionally skips the pre-fix regression test when no behavior change; Tier 2 (light) uses inline root-cause + tester + qa; Tier 3 (standard, default) is the full pipeline + security; Tier 4 (critical/security) adds mandatory memory prior-art query and extended security analysis. Security still runs always for Tier 3+ by default; the path-pattern auto-escalation forces sensitive paths to Tier 3+ at classification time so Tier 1 / Tier 2 cannot bypass security on `auth/**` / `middleware/**` / `api/**` / `db/**` / `security/**` / `crypto/**` / `session/**`. Full flow definition: `agents/ref-special-flows.md` § Bug-fix Flow § Tier System.
- **Plan-review panel centralization** — `plan-review` runs up to 3 reviewers (qa ratify-plan → security design-review conditional → plan-reviewer last) into ONE `01-plan.md`; zero side-files; one `## Plan Review` + combined verdict. See `agents/ref-direct-modes.md`.

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
- If the change establishes a decision, pattern, or constraint that future work must respect, append a one-line bullet to `docs/knowledge.md` with the matching tag prefix (`[decision]`, `[pattern]`, `[stack]`, `[constraint]`).
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

## 7. Voice and Language Guide

> This section codifies the voice, vocabulary, and language conventions for every operator-facing surface in this repo. It is normative for humans and agents. The four guidelines below evolved from observed friction with the pre-2026-05 voice (enthusiasm markers in status blocks, phase-number jargon leaking into operator copy, Spanish prose in skill files). The rules are deliberately tight — a tool that speaks like a professional instrument frees the operator to focus on the actual work, which is designing solutions and solving problems.

### 7.1 Voice — formal, neutral, helpful-tool

Operator-facing copy presents facts, options, and outcomes. It does not perform emotion, friendship, opinion, or salesmanship. These rules apply to every response the agent produces — chat replies, status blocks, workspace doc prose, memory writes, self-corrections, and any other operator-facing surface — not only to text committed to the repo. There is no informal-chat-mode loophole.

**OUT** — what never appears in committed copy:

- Enthusiasm markers: `¡Perfecto!`, `Excelente`, `Genial`, `Listo`, emoji decoration (`✅`, `⚠️`, `🎉`, `✨`) of routine status messages.
- First-person personality: `Creo que…`, `Me parece que…`, `I think…`, `My recommendation…`. The agent has analyses and recommendations, not preferences.
- Anthropomorphic framing: `Yo voy a…`, `I'm going to…`, `Quiero ayudarte a…`. Use neutral construction: `The system…`, `The process…`, `Next…`.
- Marketing tone: `potente`, `innovador`, `the best way`, superlatives. Describe capabilities; do not promote them.
- Affirmations directed at the operator: `Buena pregunta`, `That makes sense`, `Totally right`. Answer directly.
- Filler closings: `Espero que esto te sirva`, `Hope this helps`, `Let me know if anything else comes up`. The operator knows how to continue.
- Colloquialisms: `bakeado` / `baked in`, `shippeo` / `I'll ship`, `wrappear` / `to wrap`. Use formal equivalents: `incorporated`, `publish`, `encapsulate`.

**IN** — what conformant copy looks like:

- Declarative statements of fact: `The command returned exit code 0`, `The test passed`, `Three options are available`.
- Clear option presentation: `Three options: (A) … (B) … (C) …`. Recommendation, if any, is stated as a noted preference with rationale: `Option A is recommended because X`.
- Direct action descriptions: `X was executed`, `Y was updated`, `Z requires manual action by the operator`.
- Concise summaries: a status block, a table, or a 2-3 sentence outcome. No padding, no celebration.

Example — agent reporting the close of a verification phase:

```
Bad:  ✓ Phase 3/7 — Verify — completed
        Agent: tester ✅ | qa ✅ | security ✅
        Perfecto, todo limpio. Lista para la siguiente fase.

Good: Verify complete.
        tester: pass | qa: pass | security: clean
        Next: acceptance gate.
```

### 7.1.1 Internal chatter — IN/OUT table

The table below defines which operations are silent vs operator-facing. Extended
examples and edge cases are in `docs/voice-guide.md`.

| Category | On success | On failure | Rationale |
|----------|-----------|------------|-----------|
| Config load (read `.team-harness.json`, resolve paths) | SILENT — log `operation.*` event | one-line error + suggestion | The operator does not need to see each config read |
| MCP verify (memory / context7 connectivity probe) | SILENT — log `operation.*` event | one-line error + suggestion | Connectivity OK is noise; failure is actionable |
| Initialization / boot sequence | SILENT | one-line error + suggestion | Already the established pattern for the orchestrator boot |
| Phase-transition status blocks | PERMITTED (operator-facing) | PERMITTED | The operator needs to know which stage is active |
| Tool error (any tool call fails) | n/a | SURFACE one-line summary + next-step; full output → events | Errors are always reported — never raw dumps |

**Internal chatter** = mechanical progress on steps the operator did not ask to see (config, connectivity, init). **Operator-facing** = decisions, plans, results, STOP blocks, and stage transitions. When uncertain: output that answers something the operator asked is operator-facing; output that narrates how the system reaches that answer is Internal chatter.

### 7.2 Vocabulary — dev-natural verbs at the operator surface

The three things a developer already knows how to ask for — a work plan, an implementation, a PR — map cleanly onto the three pipeline stages. The operator never learns `Phase 1.5`, `Phase 3.6`, or `STAGE-GATE-2`. Those are internal mechanics.

| Operator asks for | Maps to | Internal mechanics (operator never sees) |
|---|---|---|
| "give me the work plan" / "design X" | Stage 1 — Analysis | Intake / Specify / Design / Plan Ratification / Plan Review / STAGE-GATE-1 |
| "implement it" | Stage 2 — Implementation | Implementer / Tester / QA / Security / Acceptance Gate / Acceptance Checker |
| "open the PR" / "ship it" | Stage 3 — Delivery | Delivery / Internal Review / STAGE-GATE-3 / KG capture |

**Rule:** operator-visible status blocks, STOP-block templates, install prompts, error messages, and skill help text use dev-natural verbs (`plan`, `implement`, `validate`, `review`, `recover`, `ship`). Phase numbers and gate identifiers appear only in contributor surfaces (this `CLAUDE.md`, `agents/*.md` instructional sections, workspace doc templates internal to the pipeline state machine).

**Permitted exceptions:**

- **STAGE-GATE-{1,2,3} identifiers in STOP-block headers.** The identifier is a durable label referenced by `00-state.md`, the JSONL trace, the test suite, and the hook payloads. The label stays in the header line; the surrounding prose uses dev-natural verbs.
- **`/status` output.** When the operator explicitly invokes `/status`, surfacing the `Stage` / `Phase` columns is appropriate — the operator is asking about pipeline mechanics.
- **`/trace` output.** Same rule as `/status`.

### 7.3 Language — English-only repo content

Every committed artefact is in English. workspaces prose follows the operator's chat language (structure stays English). Live chat is not a committed artefact — operator may chat in any language.

**Documented exceptions:** security/reviewer report bodies (Spanish per contract), orchestrator Step 6 routing table (bilingual intent patterns). Full language boundary table, workspaces rules, and contributor checklist are in `docs/voice-guide.md`.

---

## 7b. Document Hygiene

CLAUDE.md is a quick-reference surface — it tells agents *where to look*, not *everything to know*. Detailed content lives in `docs/`.

### File size cap

**CLAUDE.md must stay under 40 KB.** Claude Code warns above this threshold and performance degrades. The delivery agent checks file size after every update; if CLAUDE.md exceeds 35 KB, it must offload the largest non-structural section to `docs/` before committing. Structural sections (§1-§7) are exempt — they shrink by extracting detailed tables/protocols to docs/ files (as done with §7.4-7.6 → `docs/voice-guide.md` and §14 protocol → `docs/subagent-orchestration.md`).

### Section size rules

| Section | Max entries in CLAUDE.md | Overflow target |
|---------|------------------------|-----------------|
| Architecture Decisions (§8) | 10 | `docs/decisions.md` |
| Patterns & Conventions (§9) | 10 | `docs/patterns.md` |
| Known Constraints (§10) | 10 | `docs/constraints.md` |
| Testing Conventions (§11) | 10 | `docs/testing.md` |

When a section exceeds its limit, the delivery agent extracts older entries to the overflow file and replaces the section body with a pointer:

```
See `docs/decisions.md` for the full log. Recent entries kept inline below.
```

### What belongs in CLAUDE.md vs docs/

| CLAUDE.md | docs/ |
|-----------|-------|
| Golden commands (copy-paste ready) | Extended decision rationale |
| Tech stack summary (one table) | Migration guides, ADRs |
| Current conventions (active rules) | Historical patterns, superseded decisions |
| Architectural boundaries (one-liners) | Detailed constraint analysis |
| Pointers to docs/ files | The detailed content itself |

### docs/ structure

| File | Content | Updated by |
|------|---------|-----------|
| `docs/knowledge.md` | Flat bullets with tag prefixes — the agent pre-read file | delivery agent |
| `docs/decisions.md` | Architecture decisions overflow (date + decision + rationale) | delivery agent (auto-offload) |
| `docs/patterns.md` | Patterns overflow (pattern + example path) | delivery agent (auto-offload) |
| `docs/constraints.md` | Constraints overflow (constraint + detail) | delivery agent (auto-offload) |
| `docs/testing.md` | Testing conventions overflow (convention + description) | delivery agent (auto-offload) |

The delivery agent creates overflow files on first offload. Agents read `docs/knowledge.md` before every task; overflow files are read on-demand when the CLAUDE.md pointer section is relevant.

---

## 8. Architecture Decisions
<!-- Populated by the delivery agent after each feature. Empty at init. -->

## 9. Patterns & Conventions
<!-- Populated by the delivery agent after each feature. Empty at init. -->

## 10. Known Constraints
<!-- Populated by the delivery agent after each feature. Empty at init. -->

## 11. Testing Conventions

> Full reference (test files, per-suite scope, when to add a test, what is NOT covered): `docs/testing.md`.

Structural suites registered by literal (self-referential guards assert these names live here):
**Suite 34** — plan-review panel centralization. **Suite 35** — KG MCP tool-name contract.
**Suite 36** — KG write-integrity beacon. **Suite 37** — KG write-policy `_shared` snippet
consolidation. **Suite 38** — review-pipeline-guardrails (scope discipline, AI-authored lens,
worktree behavioral verification, agent-level publish invariant). **Suite 39** — pr-a-takeover-contract
(nested-dispatch takeover contract: next-agent binding, consume-side guard, dispatch_handoff schema,
dispatch.blocked emit, manifest gate-label, §14 cross-ref). **Suite 40** — pr-b-security-failopen
(fail-closed security gating: hotfix Tier-3 hard floor + override-clamp, deterministic re-tier GATE
at Phase 2-close, boot type=null classify-first + security-defaults-RUN, plan-review keyword
trigger + visible-skip). **Suite 41** — pr-c-hotfix-correctness (hotfix flow correctness: Phase 1.6
runs for hotfix, non-reproducible hotfix auto-promote, orchestrator authors Review Summary before
STAGE-GATE-1, type-aware STAGE-GATE-1 guard). **Suite 42** — pr-d-frontend-wiring (frontend-scope
ux-reviewer wiring: Phase 1 enrich dispatch 1.7-ux-enrich, Phase 3 validate dispatch 3.4-ux-validate,
Phase 3.5 UX gate critical-blocks-only, Phase 3.6 04-ux-validation.md pointer, checklist+observability,
inline/nested fallback, ux-reviewer AC-sink → 01-plan.md § Task List).

---

## 12. Contribution Workflow (repo-specific)

This repo ships assets to other developers, so the contribution flow matters more than code-level conventions.

- **Develop in `agents/`, `skills/`, `hooks/` directly.** Do not edit `~/.claude/` by hand for changes you intend to share — they'll get overwritten or drift.
- **Propagate via installer.** After editing, run `./bin/install.sh` locally to sync into your own `~/.claude/`. The installer always overwrites files that differ from the embedded bytes, so your local changes are applied immediately.
- **Complex skills** live in `skills/{name}/` with a `SKILL.md` plus any `references/`. The installer recursively copies the whole subfolder to `~/.claude/skills/{name}/`.
- **Never commit personal data.** Hooks must be generic (no tokens, no private endpoints).

---

## 13. Git & Delivery Conventions

Git & delivery rules are now part of §6 Mandatory Working Agreements (see During-work and Post-work sub-blocks). This section is intentionally a pointer to keep one source of truth.

---

## 14. Subagent Orchestration

**The `orchestrator` agent is the canonical entry point for every development workflow.** Operators drive the pipeline by talking to it conversationally (e.g., `@th:orchestrator give me the work plan for this task: X`, `@th:orchestrator implement it`, `@th:orchestrator open the PR`) and the orchestrator's Step 6 intent-detection classifies the request and dispatches the right phase or direct mode. Skills (slash commands like `/design`, `/deliver`, `/recover`, `/issue`) are optional shortcuts that route into the same orchestrator under the hood — they give a deterministic entry without the intent-detection step plus a few extras (e.g., `/design #N` fetches a GitHub issue automatically), but the orchestrator-conversational path covers every workflow. Treat the orchestrator as the single front door; do not surface slash commands as "the better way" to operators who prefer chat. **All repo artefacts (code, configs, agents, skills, docs, commits, PR bodies, CHANGELOG) are written in English. Operators may chat in any language; the orchestrator's intent-detection patterns accept Spanish and English. The English-only rule applies to what is committed to the repository, not to live chat.**

Routing table for this repo:

| Intent | Subagent | Output |
|---|---|---|
| Add/modify an agent, add/modify a skill, refactor the pipeline | `architect` + `agent-builder` | Design doc + updated `.md` files |
| Installer changes, hooks refactor, cross-platform fixes | `architect` → `implementer` | Architecture note + code changes |
| Tests (if/when introduced) | `tester` | Test plan + tests with factory mocks |
| Acceptance criteria + validation against AC | `qa` | AC list / validation report |
| Docs, CHANGELOG, version bump, branch, commit, PR | `delivery` | Docs + CHANGELOG + commit + PR |
| PR review | `reviewer` | Inline review, approve/request-changes |
| Security review of hooks, installer, or MCP (elevated privileges on user's machine) | `security` | OWASP/CWE-aligned report |
| Visualize agent flow | `diagrammer` / `likec4-diagrammer` / `d2-diagrammer` | Diagram file + preview |
| Documentation (`type: docs`) | orchestrator → `architect` (research mode) → `documenter` → `diagrammer` (conditional) → `qa` | `00-research.md` + Obsidian vault pages + `02-documentation.md` manifest + `04-validation.md` |
| Frontend-scope tasks (`frontend-scope: true`) | Standard pipeline + `ux-reviewer` (enrich after architect in Stage 1, validate in parallel in Stage 3) | `01-ux-review.md` + `04-ux-validation.md` |
| Bug fix (`type: fix`) | orchestrator → `architect` (root-cause mode) → `tester` (Phase 2.0 regression test) → `implementer` (scope-discipline) → `tester` + `qa` + `security` (always, parallel) → `delivery` | `01-root-cause.md` + `02-regression-test.md` + full feature backbone + `### Fixed` CHANGELOG + `fix(area):` PR title |
| Hotfix (`type: hotfix`) | same as bug fix, Phase 1 skipped (no `01-root-cause.md`); orchestrator emits 1-sentence prose plan at STAGE-GATE-1 | full feature backbone minus `01-root-cause.md`; PR title appends `(hotfix)` suffix |

**Escalation rules.**
- Touching `bin/install.sh`, `bin/install.ps1`, or any file under `cmd/install/` → route to `architect` first (installer contract with `~/.claude/` and `~/.claude.json` is load-bearing).
- Adding/removing an agent → route to `architect` + `agent-builder`; also update `README.md` agent roster and the system diagram.
- Hook changes or MCP server changes → flag for `security` review (both execute with the user's privileges).
- Changing the orchestrator pipeline → architecture review mandatory; update `agents/orchestrator.md` + `agents/ref-direct-modes.md` + `agents/ref-special-flows.md` atomically.

> **Limitation — nested-context dispatch.** When `orchestrator` runs nested (not top-level), the `Task` tool is stripped. The orchestrator emits a `dispatch_handoff` directive; top-level Claude takes over automatically. Full protocol in `docs/subagent-orchestration.md`.

**Universal rule — auto-takeover on `blocked-no-dispatch`:** when the orchestrator returns "Dispatch handoff — top-level Claude takes over now", or `00-state.md` has `status: blocked-no-dispatch`, top-level Claude **MUST** take over dispatch immediately. Parse the `dispatch_handoff` JSON, dispatch the named agent via `Task`, and continue the pipeline. This is not a user-decision point. Full takeover protocol (8 steps), handoff JSON schema, and `blocked-manual-push` handling are in `docs/subagent-orchestration.md`.

---

## 15. When to Ask Humans

- Proposing a new direct mode or a new pipeline phase (changes the mental model).
- Changing the installer's target layout under `~/.claude/` or touching new keys in `~/.claude.json` beyond `mcpServers.memory` / `mcpServers.context7` (breaks existing users or risks clobbering personal config).
- Bundling personal tokens or user-specific hooks into the shared `hooks/` folder.
- Renaming or removing an agent/skill that other agents reference.

---

## 16. Meta-Note

**This is the repo that produces the agents and skills of the orchestrator system.** A CLAUDE.md edit here does *not* propagate automatically — agents in this repo are read from `agents/*.md` as source artifacts, and developers pick them up via the installer. If you change agent behavior and want it to take effect on your own machine, re-run the installer.
