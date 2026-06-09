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
│   └── testing-refs/    On-demand reference library (tester agent)
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
│   ├── notify-stage.sh  Stage-end wrapper (orchestrator calls at Stage boundaries)
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
├── go.mod               Go module (Go 1.23)
├── docs/
│   └── knowledge.md     Project knowledge base
├── README.md            Human-facing overview
├── CHANGELOG.md         Keep-a-Changelog + semver
├── CLAUDE.md            This file
└── workspaces/        Ephemeral agent session notes (git-ignored)
```

**Ownership boundaries.**
- `agents/` — system prompts only. One `.md` = one agent.
- `skills/` — slash-command entry points. Most are thin: parse args → route to orchestrator. A few are standalone (`/lint`, `/th:pipelines`, `/th:kg`, `/tmux`, `/th-update`).
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

**Current version:** `2.64.0` (see `.claude-plugin/plugin.json` `version` field — canonical source of truth for the plugin marketplace. `CHANGELOG.md` tracks the release history).

**Install modes.** The installer offers two modes (interactive prompt or `INSTALL_MODE` env var):

- `standard` (default) — copies agent files byte-identical to the source-repo `agents/*.md`. Canonical quality contract; recommended for operators on Anthropic Max or Team plans.
- `low-cost` — rewrites `model:` and `effort:` frontmatter in-flight using the matrix in `cmd/install/modes.go`; all 17 agents run on `sonnet`. Suitable for Free/Pro plan operators. See [`agents/README.md §"Low-cost mode"`](./agents/README.md#low-cost-mode).

**Dependencies.** TUI: `charm.land/huh/v2` (bubbletea v2, lipgloss v2, bubbles v2 transitive). Binary size: 7.9–8.5 MB. No build step beyond `go build`.

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

**Not applicable to this repo:** typecheck, unit test of agent prompt behaviour, integration test of the live pipeline, e2e, build, dev server, migrations, deploy. The repo ships declarative assets, an installer, and one MCP server — no code pipeline. See `docs/testing.md` for the full test-suite registry and scope.

---

## 5. Architectural Conventions

- **One concern per file.** One agent per `.md` in `agents/`. One skill per `.md` in `skills/` (complex skills get their own subfolder).
- **Frontmatter-driven agents.** Every agent file starts with YAML frontmatter (`name`, `description`, `model`, `color`). `init`, `architect`, `agent-builder` use `opus`; others generally use `sonnet`.
- **orchestrator is the hub.** Skills never invoke agents directly — they build a task payload and route to `orchestrator`. Exceptions: standalone utilities (`/th:lint`, `/th:pipelines`, `/th:kg`, `/th:tmux`, `/th:update`).
- **Workspaces as the shared board.** A workspace is the shared working directory for a single pipeline session. Each pipeline run creates its own isolated workspace. Agents communicate through files in `workspaces/{feature-name}/` (each reads prior agents' output, writes its own); the operator uses it as a review surface. Never through return values. `workspaces/` is always git-ignored.
- **Dual-mode workspaces.** Output to local `./workspaces/` (default) or a configured Obsidian vault (`work-logs/{repo-name}/{date}_{feature}/`), via `logs-mode` in `~/.claude/.team-harness.json`. The orchestrator resolves the base path once at start and passes it to every agent. Obsidian mode adds YAML frontmatter (repo, feature, pipeline, date, agent).
- **Initiative layer (opt-in).** Groups per-project pipelines under an `overview.md` parent index; layout `{repo_base}/{YYYY-MM-DD}_{initiative}/{project}/`. detect + confirm gate (never auto-created). `initiative: null` = today's exact behaviour. Supports **parallel multi-project dispatch** (v2.61.0): when ≥2 projects each clear their own STAGE-GATE-1, the orchestrator fans out Stage-2 implement+verify lanes concurrently (opt-in, operator-confirmed; `--serial` always wins). Full contracts: `agents/orchestrator.md § overview.md Template`; `agents/orchestrator.md § Parallel Multi-Project Dispatch`; `docs/discover-phase.md § 11`.
- **Human-first document format.** Every workspace doc file uses a two-section layout: `## Review Summary` (human-readable decisions, risks, trade-offs — scannable in under 2 minutes) followed by `## Technical Detail` (full content for agent-to-agent communication). This applies in both local and Obsidian modes.
- **Status-block return protocol.** Agents finish with a compact status block; the orchestrator gates on the block without re-reading full workspaces on happy paths.
- **Installer always overwrites embedded files.** Agents, skills, and hooks are canonical bytes from the repo; direct edits to `~/.claude/agents/*.md` (or skills/hooks) are not a supported customization path and are replaced on every install. Unchanged files (hash-match) are skipped. `~/.claude.json` is backed up before every merge. Operator-specific identity (`mcpServers.memory` URL/bearer, context7 API key) uses a Keep/Change preservation menu and is never silently clobbered.
- **Session-scoped config override whitelist** — overridable (chat → `00-state.md` only): `logs-mode`, `logs-path`, `logs-subfolder`, `clickup.workspace_id`. Excluded → /th:setup: MCP URL, context7, model, effort.
- **Chat-settable persistent key — `language`** — ISO 639-1 in `.team-harness.json`; not in session-override whitelist. Write needs persistence marker + Y/n confirmation gate; without it → session-override only.
- **Single config file — `~/.claude/.team-harness.json`.** All Team Harness settings in one file: `logs-mode`/`logs-path`/`logs-subfolder`, installer manifest, version metadata, skill-specific keys (e.g. ClickUp under `clickup`). Skills MUST NOT create their own config files in `~/.claude/` — use namespaced keys inside `.team-harness.json`. Every write is a merge (read full doc, replace only owned key, write whole doc back); never partial payload. Exception: `~/.claude/settings.json` (Claude Code's own file, owned by the harness).
- **Cross-platform first.** All scripts and agents must work on Windows, macOS, and Linux. Avoid Unix-only tools or shell-specific syntax in agent prompts.
- **KG content is technical-only.** The knowledge graph must never store personal data, user profiles, preferences, tokens, or stakeholder names. See `docs/kg-content-policy.md`.
- **KG passive capture on delivery.** The `delivery` agent persists one `process-insight` node per successfully-completed task (Step 11.5 of its workflow). The insight is synthesised from workspaces + the CHANGELOG entry and describes what was learned that future tasks can reuse — not what changed (that's the CHANGELOG). The call is best-effort: if the Memory MCP server is unreachable or the task has no reusable learning, the step logs and skips. This builds team knowledge automatically without operator curation.
- **Delivery post-create check (Step 11.4).** After `gh pr create`, queries merge state + CI with bounded backoff; `CONFLICTING`/failing-CI reported explicitly (never as clean); graceful skip when `gh` absent.
- **Pipeline observability is mandatory.** Every pipeline run produces `00-execution-events.jsonl` (local mode) or `00-execution-events.md` (obsidian mode) and `00-pipeline-summary.md`. Writing events is mandatory, not best-effort. **Exception:** Tier 0 fixes (single-file ≤5-line trivial/docs, `workspaces: NONE` by design) are explicitly exempt from this observability invariant — they produce no workspace in which to write the events file. Full contract: `docs/observability.md`.
- **Documentation freshness via context7.** Every decision involving a third-party library's API or configuration syntax must be verified against context7 before code is generated. Training-snapshot knowledge is treated as potentially stale. Mandatory triggers per agent are documented in `docs/context7-usage.md` §2 (architect, implementer, tester, security, translator); `init` is a light reference. Every consulting agent emits `context7_consult: hit:N miss:N skipped:M` in its status block — even when all counts are zero, the line's presence signals the agent considered freshness. Absence of context7 ≠ excuse to ignore the check: fall back to training knowledge and document the fallback in the workspace doc's `## Documentation Consulted` section.
- **Bug-fix flow forces security review and mandatory regression test.** For `type: fix` and `type: hotfix`, `security-sensitive: true` is forced — security runs at Phase 3 always. **Phase 2.0 — Regression Test Authoring** runs between STAGE-GATE-1 and Phase 2; the regression test is mandatory always. Full flow definition: `agents/ref-special-flows.md` § Bug-fix Flow § Tier System.
- **Patch mode + selective verifier re-run.** Localized verifier failure: producer edits named elements only; orchestrator re-runs only the affected domain; coherence gate follows. Default is structural (full re-dispatch). Full contract: `docs/patch-mode.md`.
- **Plan-review panel centralization** — `plan-review` runs up to 3 reviewers into ONE `01-plan.md`; worst-of combined verdict; preserve-in-place sub-verdicts; vacuous-success guard. See `agents/ref-direct-modes.md`.
- **Discover phase + intake survey + spec co-authoring + approach checkpoint.** Default intake is patient — architect fires on advance signal only; fast-path for clear tasks. Intake survey captures meta-decisions (shape, effort, autonomy, scope-hint) in `00-state.md`. Depth DIAL, not a stage switch; security floors non-surveyable. E2: spec co-authoring (`00-spec-seed.md`, bidirectional dissent) + approach checkpoint (`approach_freedom:high|low`). See `docs/discover-phase.md` (E1), `docs/spec-coauthoring.md` (E2).
- **Dev mode — default-on, top-level orchestrator.** Default as of v2.56.0: `/th:setup`/`/th:update` write `~/.claude/.dev-mode-active` (`dev_mode: true`) unless `dev_mode_choice: "off"` in `.team-harness.json`. Top-level agent adopts orchestrator role, dispatches via Task. Inline orchestration permitted ONLY when marker present; without it, prohibited. `/dev-mode off` removes marker + persists opt-out; `/dev-mode on` re-activates. Outward actions gated by `dev-guard.sh`. `developer-mode` output style is the optional strong floor (`keep-coding-instructions: false`). `force-for-plugin` NOT set (decouples gate; removes escape hatch). Security floors non-waivable. See `docs/dev-mode.md`.
- **Obsidian interlinking.** Step 11.6 3-tier MOC, knowledge allowlist: `docs/obsidian-linking.md`. Plan consolidation (no forks, 3h): `agents/_shared/plan-consolidation.md`.
- **Milestone standard.** Milestones = commits, NOT PRs and NOT deliverables. One task = one workspace = one PR (after ALL milestones). Stage files are FLAT, whole-task documents (no per-milestone subsections; `-m{N}` suffixed files and `{NN}_{milestone}/` folders PROHIBITED). Milestone breakdown with dependency annotations lives ONLY in `01-plan.md`. Independent milestones PARALLELIZED (reuse #285 concurrent-`Task`); dependent serialize; one commit per milestone on the single feature branch. See `agents/ref-special-flows.md § Milestone-Build Flow`.

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

- Write a CHANGELOG fragment to `changelog.d/{pr-slug}.md` (preferred) rather than editing `## [Unreleased]` inline. Each PR writes one file; no two PRs in the same session can conflict. The delivery agent assembles all fragments into the versioned CHANGELOG section at release cut (Step 9e). Fragment format: a standard Keep-a-Changelog subsection block (`### Added`, `### Changed`, `### Fixed`, `### Security`) with one-line entries. Slug rule: lowercase branch name with non-alphanumeric characters replaced by hyphens, matching `[a-z0-9-]+`. Direct `## [Unreleased]` edits are acceptable as a fallback when `changelog.d/` cannot be used (e.g., pre-convention repos).
- If §3 Tech Stack or §4 Golden Commands of CLAUDE.md changed, update those sections in the same PR — do not let CLAUDE.md drift from the repo.
- If the change establishes a decision, pattern, or constraint that future work must respect, append a one-line bullet to `docs/knowledge.md` with the matching tag prefix (`[decision]`, `[pattern]`, `[stack]`, `[constraint]`).
- If the repo has an OpenAPI spec (`openapi/openapi.yaml` or similar) and the change touches endpoints, bump `info.version` in the same commit as the spec change — never in a separate commit.
- **If the change touches distributed plugin assets — `agents/`, `skills/`, or `hooks/` — you MUST bump the plugin version in `.claude-plugin/plugin.json` AND the `th` entry in `.claude-plugin/marketplace.json` (matched semver) as part of shipping it.** The marketplace serves by version: without a bump, `claude plugin update` sees no change and the new agents/skills/hooks sit on `main` but never reach any installed `~/.claude/`. Match the bump to the change (patch / minor / major). This applies whether the change ships via the orchestrator pipeline (the `delivery` agent does it) or a manual merge.

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

See `docs/voice-guide.md` for the full Bad/Good example and extended rationale.

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
- **`/th:pipelines` output.** When the operator explicitly invokes `/th:pipelines`, surfacing the `Stage` / `Phase` columns is appropriate — the operator is asking about pipeline mechanics.
- **`/trace` output.** Same rule as `/th:pipelines`.

### 7.3 Language — English-only repo content

Every committed artefact is in English. workspaces prose follows the operator's chat language (structure stays English). Live chat is not a committed artefact — operator may chat in any language.

**Documented exceptions:** security/reviewer report bodies (Spanish per contract), orchestrator Step 6 routing table (bilingual intent patterns). Full language boundary table, workspaces rules, and contributor checklist are in `docs/voice-guide.md`.

---

## 7b. Document Hygiene

CLAUDE.md is a quick-reference surface — it points to `docs/`, not duplicates it. If CLAUDE.md exceeds **35 KB**, the delivery agent must offload the largest non-structural section to `docs/` before committing. Hard cap: **40 KB**.

See `docs/document-hygiene.md` for section-size rules, overflow targets, and what-belongs-where tables.

---

## 8. Architecture Decisions
<!-- Populated by the delivery agent after each feature. Empty at init. -->

## 9. Patterns & Conventions
<!-- Populated by the delivery agent after each feature. Empty at init. -->

## 10. Known Constraints
<!-- Populated by the delivery agent after each feature. Empty at init. -->

## 11. Testing Conventions

Per-suite scope, golden commands, and what the tests do NOT cover: see `docs/testing.md` (canonical suite registry — Suites 34–42 and beyond are registered there, not here).

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

**The `orchestrator` agent is the canonical entry point for every development workflow.** Operators drive the pipeline conversationally; the orchestrator's Step 6 intent-detection dispatches the right phase or direct mode. Skills (slash commands like `/design`, `/deliver`, `/recover`, `/issue`) are optional shortcuts into the same orchestrator. All repo artefacts are written in English; live chat accepts Spanish and English.

Routing table and escalation rules: see `docs/subagent-orchestration.md § Routing Table and Escalation Rules`.

**Inline orchestration at top level — observable-flag gate (SEC-DR-2):** executing the orchestrator role inline at top level is PERMITTED ONLY when `~/.claude/.dev-mode-active` contains `dev_mode: true`. In that case the top-level agent IS the orchestrator — it has `Task` available and dispatches leaf agents directly without a `dispatch_handoff`. Without the marker present, executing orchestration inline — including reading `agents/orchestrator.md` "as reference" — is the ad-hoc improvisation that weakens gate enforcement and is PROHIBITED. The discriminant is the filesystem marker, not a subjective judgment about which output style is active. In dev mode, outward/irreversible actions (git push to a remote, gh pr merge/review/comment, and equivalent API calls via any binary) are gated by the deterministic hook `dev-guard.sh`; they are escalated to operator approval (`ask`) and CANNOT be executed inline by rationalisation. For dev mode details and the security floor non-waivability invariant, see `docs/dev-mode.md`.

**How to enter dev mode:** run `/dev-mode` — it starts developer mode in the current session immediately (writes the marker `~/.claude/.dev-mode-active` containing `dev_mode: true`, shows the `DEVELOPER MODE ACTIVE` banner, adopts the orchestrator contract), no `/clear` required. While the marker is present, the `SessionStart` hook (`hooks/dev-mode-session-start.sh`) auto-resumes dev mode in every new session and surfaces the banner instantly via `systemMessage`. `/dev-mode off` removes the marker (operator-confirmed) and returns to normal mode. A persistent alternative is the `developer-mode` output style via `/config` -> Output style -> `developer-mode`, which replaces the built-in SWE instructions on reload; the marker remains the observable flag either way.

**FALLBACK — nested-handoff/takeover:** when dev mode is not active, the canonical invocation is `Agent(subagent_type='th:orchestrator', ...)`. When that invocation is nested and the `Task` tool is stripped, the orchestrator emits a `dispatch_handoff` directive; top-level Claude takes over automatically. This nested-handoff/takeover machinery is the safety net for invocations WITHOUT dev mode — it is not the primary path. Full protocol in `docs/subagent-orchestration.md`.

**Universal rule — auto-takeover on `blocked-no-dispatch`:** when the orchestrator returns "Dispatch handoff — top-level Claude takes over now", or `00-state.md` has `status: blocked-no-dispatch`, top-level Claude **MUST** take over dispatch immediately. Parse the `dispatch_handoff` JSON, dispatch the named agent via `Task`, and continue the pipeline. This is not a user-decision point. Full takeover protocol (8 steps), handoff JSON schema, and `blocked-manual-push` handling are in `docs/subagent-orchestration.md`.

---

## 15. When to Ask Humans

- Proposing a new direct mode or a new pipeline phase (changes the mental model).
- Changing the installer's target layout under `~/.claude/` or touching new keys in `~/.claude.json` beyond `mcpServers.memory` / `mcpServers.context7` (breaks existing users or risks clobbering personal config).
- Bundling personal tokens or user-specific hooks into the shared `hooks/` folder.
- Renaming or removing an agent/skill that other agents reference.

---

## 16. Meta-Note

**This is the repo that produces the agents and skills of the orchestrator system.** A CLAUDE.md edit here does *not* propagate automatically — agents are read from `agents/*.md` as source artifacts and deployed via the installer. To apply a local agent change, re-run the installer.

- **Setup/update model** — `/th:setup` owns KEYS (once); `/th:update` owns FILES + FLOWS each release. Fixed-path `~/.claude/` artifacts need explicit sync. See `docs/setup-update-model.md`.
