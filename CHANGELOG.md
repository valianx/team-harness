# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added (verification suite for harness changes)

- **`tests/` folder.** First test suite for the repo. Covers the two surfaces that are testable without a live LLM: `hooks/policy-block.sh` (functional) and the structural integrity of the agent / skill / hook `.md` / `.json` files (cross-references, mandatory sections, frontmatter fields).
  - `tests/test_policy_block.sh` — ~48 cases over `rm` destructive vs safe (`/`, `~`, `$HOME`, `--`, wildcard), `git` destructive vs safe (`--force`, `--no-verify`, `reset --hard`, `clean -f`), SQL `DROP`/`TRUNCATE`, sensitive paths (`.env`, `.pem`, `.ssh/`, `.aws/credentials`, `secrets.*`), allow-list variants (`.env.example`/`.sample`/`.template`), malformed payloads (fail-open).
  - `tests/test_agent_structure.py` — ~98 assertions across 11 suites: tool allowlists per agent, the 5-column Roster matrix, new pipeline phases (1.5 / 2.5 / 3.5 / 3.6 / 4.5), the `tester` / `qa` / `reviewer` / `implementer` / `delivery` contracts, the `PreToolUse` wiring across windows/macos/linux, README cross-references.
  - `tests/run-all.sh` — wrapper, exit 0 iff all suites pass.
  - CLAUDE.md § 4 Golden Commands and § 9 Testing Conventions updated with how to run and what's covered.

### Fixed

- **`hooks/policy-block.sh` regex now matches `rm -rf -- /` and `rm -rf -- ~`.** The previous patterns required the destructive target to follow `rm -rf` directly; users who write `rm -rf -- /` (POSIX option terminator) bypassed the gate. Patterns updated to allow an optional `-- ` between the flags and the target. Caught by the new functional tests.

### Added (harness hardening — capability scoping, tracing, gates)

- **Tool allowlist per agent (capability scoping).** Every agent's frontmatter now declares a `tools:` allowlist, the runtime restricts the agent to that set. Read-only auditors (`architect`, `security`, `qa`, `acceptance-checker`) lose `Bash` entirely so they cannot mutate the host even by accident. Builders keep `Bash` but the harness gates destructive commands at `PreToolUse` (next entry). `agents/README.md` Roster table is now a 5-column matrix (Model + Effort + Tools + Role); a new "Earn the tools" principle joins "Earn the model and effort". Implements Anthropic's *"permission surface = agency boundary"*.
- **PreToolUse policy gate (`hooks/policy-block.sh`).** Cross-platform bash + python3 hook that reads tool call JSON from stdin and emits a hook decision. Hard runtime guardrail backing the prompt-level `NEVER` rules in agent definitions. Blocks: `rm -rf` targeting `/`, `~`, `$HOME`, or bare wildcard; `git push --force` / `-f` / `--force-with-lease`; `git reset --hard`; `git clean -f`; `--no-verify` on commit/rebase/push; `DROP TABLE/DATABASE/SCHEMA`, `TRUNCATE TABLE` via shell; writes to `.env` (any non-`.example`/`.sample`/`.template` variant), `*.pem`, `id_rsa*`/`id_ed25519*`/`id_ecdsa*`/`id_dsa*`, anything under `.ssh/`, `.aws/credentials`, `.aws/config`, `credentials.json`, `secrets.{yaml,yml,json,toml}`. Wired into `hooks/config.json` for windows/macos/linux. Documented in `hooks/README.md` § "Policy gate" with what it does, what it doesn't (it is not a sandbox), and how to scope an exception.
- **JSONL execution events trace (`00-execution-events.jsonl`).** Append-only, machine-readable log emitted by the orchestrator from each agent's status block. Schema: `pipeline.start/end`, `phase.start/end`, `gate.pass/fail` (Phase 1.5/3.5/3.6), `iteration.start`, `policy.deny`, `compaction.trigger` events, with fields `ts`, `event`, `feature`, `phase`, `agent`, `status`, `duration_ms`, `tokens_in`, `tokens_out`, `verdict`, `iteration`, `summary`, `extra`. Complements the existing markdown `00-execution-log.md` (human-readable) and `pipeline-metrics.json` (end-of-run aggregate). jq-friendly; survives compaction since it lives on disk. Implements Anthropic's *"wire tracing in on day one"*. Token fields enable cost tracking without SDK introspection — the orchestrator approximates from input/output sizes using the same heuristic as `tokens_estimated`.

### Added (pipeline gates and reconciliation)

- **Test-ratchet gate at Phase 3.5.** Tester's status block now reports `tests_count`, `tests_deleted`, and `tests_deleted_reason`. The orchestrator captures the baseline on the first iteration and compares on each subsequent iteration. Deletions with no reason or with forbidden patterns ("broken", "flaky", "couldn't make them pass") fail the gate and route back to `tester` with: "Restore the deleted tests and fix the underlying issue instead." Counts toward the max-3 iteration budget. Prevents the ICLR 2024 *"early victory problem"* where evaluators delete tests across iterations to make the suite green. Outcome recorded in `00-execution-events.jsonl` (`gate.pass` / `gate.fail` with `extra.tests_before` / `.tests_after` / `.tests_deleted`).
- **Phase 2.5 — Constraint Reconciliation (formalised).** The previous informal "orchestrator reconciles inline" behaviour for `[CONSTRAINT-DISCOVERED]` annotations now distinguishes trivial from non-trivial constraints. Trivial (cosmetic, semantic equivalents) keep the fast path. Non-trivial (changes to user-visible contract, behavioural promises, batch sizes that affect latency, or any constraint on a complex task) invoke `qa` in a new `reconcile` mode. `qa` decides per AC: keep / amend / drop, without rewriting AC itself. If 1+ AC drops, the orchestrator stops and confirms with the user before continuing — the mid-task requirement-change failure mode Cognition reported as dominant for Devin. New `qa` operating mode added to `agents/qa.md` parallel to `ratify-plan` and `define-ac`; output appends to `04-validation.md` under `## Reconciliation Decisions (Phase 2.5)`.
- **Phase 4.5 — Internal Review (advisory).** After Phase 4 (Delivery) and before Phase 5 (GitHub Update), the orchestrator invokes `reviewer` in a new `internal` mode that reviews the freshly-pushed diff locally and surfaces the top 3 highest-severity issues to the user. Does NOT publish to GitHub — verdict is advisory and never blocks delivery. Gated by diff size: skipped on diffs ≤50 lines AND ≤2 files, on hotfix single-file fixes; runs on complex / >50 lines / >2 files / security-sensitive. Cuts review-fatigue without replacing the human review (Cognition: *"the bottleneck shifted from writing code to reviewing it"*). New `reviewer` operating mode added alongside `fresh` / `update-body` / `reply`.

### Added (completion criteria, compaction, dispatch)

- **`done.yml` formal completion criteria.** Single, evaluable YAML file written by the orchestrator at three points (Phase 0b initial, Phase 3 fills tests/qa/security, Phase 3.5 fills AC counts and ratchet) and read by `delivery` at the top of Phase 4. Schema: `ac_count`, `ac_passed`, `tests_passing`, `tests_count`, `qa_verdict`, `security_findings_critical/high`, `all_ac_have_tests`, `test_ratchet_passed`, `acceptance_check_verdict`, `done` (computed), `done_reasons[]`. `delivery` aborts with `status: blocked` if `done == false`. Why not redundant with Phase 3.5: 3.5 is the runtime gate (does the pipeline progress?); `done.yml` is the durable record (audit, tooling, separate auditor). Both must agree — if 3.5 says proceed but `done.yml` evaluates to false, abort and surface the bug. Implements Anthropic's *"define completion criteria in external, testable files"*.
- **Mid-pipeline compaction trigger.** Phase 6's existing handoff prompt covers the inter-feature boundary; this adds the intra-feature boundary. When the cumulative orchestrator context (estimated cheaply from JSONL `tokens_in/out` + 5K overhead) exceeds ~40% of the effective window, the orchestrator expands `00-state.md` with a `## Rebuild Hints` section (current phase, iteration, hot context, session-doc pointers, exact next action) and prompts the user with `/compact` vs `/clear` options between phases — never mid-phase, never auto-deciding. Anti-spam: fires at most once per phase boundary; no re-prompt unless the budget grows by another 15 percentage points. Logged in `00-execution-events.jsonl` as `compaction.trigger`. Anchored to harness-design's finding that long-context scenarios collapse agent success past 40-50%.
- **`/background` skill for fire-and-forget dispatch.** New standalone skill (no orchestrator routing) for trivially scoped, fast-path tasks: typo fixes, version bumps, dependency upgrades, missing `loading.tsx`, copy changes. Eligibility gate (Phase 1) rejects anything that needs verification, has security surface, touches secrets/auth, requires tests to confirm, or has implicit AC. Phase 2 builds a single `claude -p ... --output-format stream-json --permission-mode acceptEdits --allowedTools "..." > /tmp/log 2>&1 &` command the user pastes into a new terminal or tmux pane. The skill does NOT run the command — the user owns the actual fire. The dispatched session inherits `~/.claude/` config including `policy-block.sh` PreToolUse hook, so destructive commands stay blocked even in the background. For multiple parallel tasks, `/tmux` remains the right tool.

### Added (Reviewability Contract — implementer + delivery + reviewer)

- **Reviewability Contract in `agents/implementer.md`.** Adds a new Non-Negotiable bullet alongside SOLID / Clean Code / DRY: functions ≤ 40 lines, ≤ 4 parameters, nesting depth ≤ 3; **golden-path structure** (validation/early returns up top, happy path linear, errors at the bottom); **one concern per commit** (no mixing refactor + feature, no mixing reformatting + functional change); comments only when the WHY is non-obvious (no comments that restate WHAT); test names describe behaviour (`returns_400_when_token_is_expired`, not `test_auth_1`). Phase 3 self-review gains a Reviewability sub-checklist mirroring the caps. The `02-implementation.md` template gains a `## Reviewability Exceptions` block: when a function legitimately needs to exceed a cap (long state machine, config builder where extraction would obscure intent), the reason is documented inline so the reviewer doesn't have to guess. Gate is "explained or under cap", not "under cap or hidden". Source: Cognition Devin 2025 review, ICLR 2024 cognitive-load research.
- **Reviewability size gate in `agents/delivery.md` (new Step 9d).** Before staging files, delivery checks the diff against the human-reviewer caps: `≤ 400 lines AND ≤ 8 files` passes silently; `400-1000 lines` or `8-20 files` requires a justification in `02-implementation.md` `## Reviewability Exceptions` (embedded in the PR body under `## Size justification`); `> 1000 lines` or `> 20 files` always aborts with a suggested split strategy (refactor first, feature second, each as its own PR).
- **Structured PR body in `agents/delivery.md` (Step 11.2 / 11.3).** Replaces the previous free-form template (Summary / Changes / Tests / Acceptance Matrix / DoD / Version) with a sectioned template optimised for the reviewer's mental model: **Main change** in the user's voice, **File map** grouped by intent, **How to review** with suggested reading order, **Risk and blast radius** with rollback plan, **Before / after** when behaviour visibly changes, **Acceptance Matrix** + **Definition of Done** + **Version** kept from the previous template, plus conditional sections for **Pre-PR Review** (paste from `04-internal-review.md` if Phase 4.5 ran) and **Size justification** (when Step 9d flagged the diff). Conditional sections are omitted entirely when not applicable — no empty headings. Devin reported this kind of restructuring as the difference between 34% and 67% merge rate.
- **Reviewability score block in `agents/reviewer.md`.** First thing the reviewer computes; goes at the top of `review_body` (in Spanish) before "Evaluación del Objetivo". Score tiers: **alta** (≤ 200 lines AND ≤ 4 files AND 0 functions over caps AND no refactor+feature mixing — 5-10 min review), **media** (200-400 lines OR 4-8 files OR 1-2 functions over caps OR minor mixing — 15-30 min), **baja** (> 400 lines OR > 8 files OR 3+ functions over caps OR significant mixing — 30-90 min, with an explicit "split before reviewing" recommendation). Score is informational — does NOT change `event` (APPROVE / REQUEST_CHANGES); a clean diff with low reviewability still merges, a tiny diff with one critical still gets REQUEST_CHANGES. Caps mirror the implementer's contract.

### Fixed (documentation drift)

- **Top-level `README.md`**: corrected counts ("18 agents, 30 skills" → "16 agents, 27 skills (3 of which are complex multi-file)"), added missing `acceptance-checker` row, broke out `gcp-cost-analyzer` into its own row instead of a generic "plus" footer, and updated the pipeline diagram to reflect Phase 1.5 (Plan Ratification), 3.5 (Acceptance Gate) and 3.6 (Acceptance Check).
- **`shared-knowledge/README.md`**: removed stale "to be built — see roadmap" caveat from the export/import flow; the tools live in `chromadb-mcp/` and are referenced consistently.
- **`hooks/README.md`**: removed leftover "binds three events" sentence — the default set is two events (Notification + PostToolUseFailure) since `Stop` was removed from the default.

### Added

- **Auto-verification gates before delivery.** The pipeline now has two redundant acceptance gates that prevent shipping when AC are not fully covered:
  - `agents/orchestrator.md` new **Phase 3.5 — Acceptance Gate**: between Verify and Delivery, the orchestrator re-reads `00-task-intake.md`, `03-testing.md`, `04-validation.md`, `04-security.md` and confirms every AC has both a passing test (in tester's AC Coverage) and a `PASS` (in qa's validation). On mismatch, routes back to implementer (still bounded by max 3 iterations) or aborts with `status: blocked` if AC counts diverge between docs.
  - `agents/delivery.md` new **Step 0 — Acceptance Gate**: re-verifies the same artifacts before any branch / commit. Aborts with `status: failed` if any AC is missing PASS, missing a test, or if security has unresolved Critical / High findings.
- **Definition of Done in delivery.** New `agents/delivery.md` Step 9b runs the project's quality gates (lint, typecheck, tests, build — discovered from CLAUDE.md or the project manifest) before staging files. Any failure aborts delivery.
- **Acceptance traceability matrix.** New `agents/delivery.md` Step 9c writes `session-docs/{feature-name}/acceptance-matrix.md` with one row per AC mapping to test (file:line), QA evidence (file:line) and security status. The matrix is embedded in the PR body (Step 11.2 / 11.3) so reviewers see acceptance coverage at a glance.

### Added (Anthropic harness-design principles applied)

- **Phase 1.5 — Plan Ratification (cheap loop guard).** New phase in `agents/orchestrator.md` between Design and Implementation. Invokes `qa` in new `ratify-plan` mode (added to `agents/qa.md`) with the AC list and the architect's Work Plan. The qa agent only checks coverage (does every AC map to at least one Work Plan step?), not code. If any AC is uncovered, routes back to architect before any code is written. Cost: ~3-5K tokens. Saves: an entire implementer + tester + qa + security iteration when the Work Plan was incomplete (~20-50K tokens). Skipped on `complexity: standard` with <4 AC. This is the "sprint contract" pattern from Anthropic's harness-design article.
- **Final-state handoff at end of Phase 6.** The orchestrator now writes a `## Final state — ready for handoff` block to `00-state.md` after KG save and surfaces a prompt instructing the user to run `/compact` or `/clear` before the next feature. Implements Anthropic's "context resets over compaction" pattern explicitly at feature boundaries. Without this, sessions running 3-4 features back-to-back accumulate 50-100K tokens of stale context.
- **Pipeline metrics expanded.** `pipeline-metrics.json` now includes per-phase `tokens_estimated`, `iterations.root_causes` with case classification (A/B/C/D), and `estimation_accuracy` (estimated vs actual minutes for planning-mode tasks). New phases (`ratify_plan`, `acceptance_gate`, `acceptance_check`) are tracked with their verdicts. Powers the "progressive harness simplification" workflow: lets you see, over time, which gates catch real bugs and which produce false alarms.

### Changed (cost-effectiveness gating)

- **Phase 3.6 (acceptance-checker) is now conditional.** Runs only when `complexity: complex`, when >3 files were touched across modules, when any verify iteration occurred, or when the user passes `--audit` explicitly. On simple changes (`complexity: standard`, ≤3 files, 0 iterations) it is skipped with a one-line log. Implements Anthropic's "evaluator is worth the cost only when the task sits beyond what the model does reliably solo" — for trivial fixes the existing Phase 3 + 3.5 gates are sufficient.
- **Agent-time sizing recalibrated for Opus 4.7 / Sonnet 4.6.** `agents/architect.md` (planning mode) tightens the XS/S/M/L bands (XS: 10-20 → 5-15 min, S: 20-45 → 15-30, M: 45-90 → 30-60, L: 90-180 → 60-150). Adds anti-sandbagging rules — explicit "default to LOW end", "do NOT add safety margins", "do NOT estimate as if you were a human team" — and named multipliers (×1.3 for new stack, ×1.5 for risky migration, ×2.0 for spike) that DO NOT stack. The pipeline-metrics `estimation_accuracy` field surfaces persistent over-estimation so the architect can self-correct over time.

### Changed (review-pr context hygiene)

- **`/review-pr` now reminds the user to run `/compact` after each review.** Each invocation accumulates 5-30K tokens in the main context (PR data, full diff, file lists from `gh` / `git` outputs, status blocks). Subagents die between PRs but the main context does not — successive reviews in the same session compound linearly. `skills/review-pr.md` Step 15 now includes a mandatory reminder block in the final response with an estimated token weight per review and an explicit `/compact` instruction. This is the cheapest way to keep multi-PR review sessions from bloating: zero infra, just discipline.

### Added (acceptance auditor)

- **New `acceptance-checker` agent (sonnet@medium).** Independent reviewer invoked between Phase 3.5 (orchestrator's acceptance gate) and Phase 4 (Delivery). Compares the **original spec** (the "Original Description" block written verbatim at intake) against the actually delivered artifacts (`02-implementation.md`, `03-testing.md`, `04-validation.md`, `04-security.md`). Catches three failure modes the existing gates can miss: (1) silent scope reduction (AC was rewritten to match what could be implemented, not what was asked), (2) implementation drift (code does what AC says but not what the user described in plain language), (3) coverage gaps in implicit non-functional requirements (perf, a11y, security). Returns a non-binding `verdict` (`pass` / `concerns` / `fail`) on its status block; the orchestrator decides whether to ship, iterate, or surface concerns to the user. Output: `session-docs/{feature-name}/06-acceptance-check.md`.
- **Phase 3.6 — Acceptance Check** added to `agents/orchestrator.md`. Runs once per pipeline (not per iteration), only after Phase 3.5 passes. The new agent is added to the team table, the roster in `agents/README.md`, and the canonical matrix enforced by `/lint` Check 7.

### Changed

- **Iteration routing now reads only `failure-brief.md`.** When Phase 3 verify fails, the orchestrator no longer re-reads `03-testing.md`, `04-validation.md`, or `04-security.md` in full (5-15K tokens each). Instead, `tester` / `qa` / `security` append a compact iteration entry to `session-docs/{feature-name}/failure-brief.md` as part of their Return Protocol when they fail. The orchestrator reads ONLY the brief to decide routing (Case A / B / C / D). Full session-docs remain available for debugging when the brief is unclear, but happy-path iteration touches only the brief.
- **Batch worktrees emit one-line events instead of copying `00-state.md`.** The Stop hook now writes `{task}|{status}|{summary}` (≤300 bytes) and PostToolUse writes `{task}|{phase}` (~50 bytes) to `/tmp/batch-results/`. Previously each event copied the entire `00-state.md` (5-15K tokens). The parent orchestrator's context now scales linearly at ~300 bytes per task instead of multiple kilobytes; if it needs more detail it opens the worktree's `00-state.md` on demand.

### Fixed

- **Phase 6 token-cost anti-pattern removed.** `agents/orchestrator.md` no longer calls `read_graph` from the Knowledge Save phase. The previous "Auto-consolidate check" loaded the entire knowledge graph (often 100K+ tokens) on every pipeline just to count entities — token cost scaled linearly with KG size. Dedup now relies exclusively on the targeted `search_nodes` call already done in step 2 (vector search, top-N, cheap regardless of graph size). Periodic whole-graph consolidation is surfaced to the user via `/memory consolidate` instead of running automatically.

### Added (earlier in this cycle)

- **Stack guardrails distilled from the knowledge graph.** Recurring pitfalls observed across past pipelines are now codified into the agent prompts so they are caught at design / implementation time, not at runtime:
  - `agents/implementer.md` Phase 0: NestJS + OpenTelemetry guardrail (SDK before `NestFactory.create()`, align the `@opentelemetry/*` family on upgrades, smoke-test runtime after major bumps, `Resource` removal in `@opentelemetry/resources` v2.x).
  - `agents/implementer.md` Phase 2 Frontend: Next.js + shadcn/ui + React guardrails (shadcn v3 vs v4 `asChild` → `render`, Next.js 16 `middleware.ts` deprecation, auto-fetching hook initial state, `next/dynamic({ ssr: false })` skeleton sizing, App Router `loading.tsx` per detail segment, Zustand selector reactivity).
  - `agents/tester.md` new "Common Testing Pitfalls (NestJS / Node)" section: TypeORM entity coverage cap, `setImmediate` mocking pattern, `error?.message || String(error)` branch coverage, env vars before `require()` in Koa/Express controller mocks, fake timers for `moment.utc()` and date-range boundary tests.
  - `agents/architect.md` new "Domain Heuristics" subsection: PostgreSQL high-volume time-series partitioning rules (no `synchronize: true`, partition key in every unique constraint, summary tables for full-history aggregations, TypeORM decimal transformer) and multi-currency / multi-country financial aggregation contract.
  - `agents/delivery.md` new Step 8c: API gateway re-sync notice for services behind Apigee / Kong / AWS API Gateway.

### Changed

- **Knowledge graph write policy hardened.** `agents/orchestrator.md` Phase 6 (Knowledge Save), `skills/memory.md` (consolidate / create paths), and `docs/kg-content-policy.md` now spell out concrete redaction rules with examples drawn from real past violations: no absolute paths with a user identifier (`C:/Users/<name>/...`), no PR / issue numbers, no developer names, `[project]` entities must be named after the bare repo. Each agent that can write to the KG runs a short pre-write checklist before calling `create_entities` / `add_observations`.
- **Earn the model AND the effort.** Reassigned the 15 agents along two dials: `model` (opus for analysis/coordination, sonnet for execution-against-plan) and `effort` (`max` for irreversible analysis, `high` for solid analytical work, `medium` as floor for everything else — `low` is forbidden by policy). Seven agents move to `sonnet` (`implementer`, `tester`, `delivery`, `diagrammer`, `d2-diagrammer`, `likec4-diagrammer`, `translator`); the other eight stay on `opus` with explicit effort levels. The canonical matrix lives in `agents/README.md` and is enforced by a new `/lint` check (Check 7).
- **`/lint` Check 7 added.** Validates that every agent's `model` + `effort` frontmatter matches the canonical matrix in `agents/README.md`, fails on `effort: low`, and warns on unknown agents.
- **`agent-builder.md` "Earn the model" section** rewritten to cover both `model` and `effort` dials and reference the canonical matrix.
- **Notifications default is now quiet.** Removed the `Stop` event from `hooks/config.json` (it fires on every Claude response and creates notification fatigue during active work). The default set is now `Notification` (idle / permission prompts) + `PostToolUseFailure` only. Developers who want a ping when long runs finish can opt in by following the "Opt-in: notify when Claude finishes a turn" section in `hooks/README.md`.

### Added

- **MIT License** (`LICENSE`) — repo is now under MIT, copyright 2026 Mario Gutierrez. `README.md` updated accordingly.
- Contributor README in each top-level system folder: `agents/`, `hooks/`, `skills/`, `chromadb-mcp/`. Each describes the file conventions, how to add or modify artifacts, and routing / runtime details. These READMEs are **not** copied into `~/.claude/` — the installer skips them.
- `chromadb-mcp/README.md` is now the **canonical reference** for every KG operation (view, edit, share, run the server, migrate), replacing scattered docs. Top-level `README.md` points to it.

### Changed

- `bin/install.py` now skips `README.md` files when copying, so contributor docs can live alongside the artifacts without polluting a developer's `~/.claude/`.

## [0.2.0] — 2026-04-22

### Added

- **Manifest-based safe updates.** The installer now writes `~/.claude/.claude-dev-team-manifest.json` tracking which files it installed and their hashes. On re-run, files whose current hash matches the manifest are safely overwritten with the new version (this is a clean update). Files modified locally are still reported as conflicts and left untouched. Adds an `updated` counter to the summary.
- **UTF-8 stdout** forced in `bin/install.py` so Unicode characters (em-dashes, etc.) render correctly in Windows terminals.

### Changed

- **Repo structure simplified.** Moved `hooks-config.json` → `hooks/config.json` (cohesion: all hooks material in one place). Removed `diagram.excalidraw` / `diagram_preview.png` (outdated visuals, will be redone in a future release). Removed `settings.json` from the repo (was personal to the original maintainer).
- **`README.md` rewritten** with installation instructions at the top, target OS and dependency requirements, and a tight overview of what the system ships. English throughout.
- **`docs/kg-content-policy.md` translated to English** to match the system-wide documentation convention.
- **`agents/README` removed** — redundant with `README.md` and out of date.

### Removed

- `settings.json` (personal) — also purged from git history.
- `diagram.excalidraw` and `diagram_preview.png` (obsolete).
- `agents/README` (redundant).

## [0.1.0] — 2026-04-22

Initial release of the `claude-dev-team` agent system distribution.

### Added

- **Installer.** Cross-platform Python installer at `bin/install.py` (PEP 723 inline metadata, zero third-party deps) with bootstrap scripts `bin/install.sh` (Unix / macOS) and `bin/install.ps1` (Windows). Copies agents, skills, hooks, and the ChromaDB MCP server into `~/.claude/`. Non-destructive: existing files with different hashes are reported as conflicts and never overwritten.
- **MCP registration.** Installer surgically merges `mcpServers.memory` and `mcpServers.context7` into `~/.claude.json` with a timestamped backup (`~/.claude.json.bak-YYYYMMDD-HHMMSS`). Prompts for `CONTEXT7_API_KEY` interactively or reads it from the environment.
- **Knowledge-graph MCP server** (`chromadb-mcp/`): stdio FastMCP server, optional SSE runner (`manage-server.sh`), web viewer (`viewer/app.py`), legacy migration tool (`migrate_knowledge.py`).
- **KG sharing.** `chromadb-mcp/export.py` dumps the local KG to JSON; `chromadb-mcp/import.py` merges a JSON into the local KG non-destructively (dedup observations, idempotent relations).
- **`shared-knowledge/` folder** as the agreed drop-off location for KG exports, with a README describing the workflow.
- **KG content policy** (`docs/kg-content-policy.md`) — technical memory only; no personal data, credentials, client/stakeholder info, or volatile references.
- **Policy filter in `orchestrator.md`** Phase 6 (Knowledge Save) enforcing the policy on every `create_entities` / `add_observations` call.
- **macOS notification hook** (`hooks/notify-mac.sh`) for parity with existing Linux and Windows hooks. `hooks-config.json` gained a `macos` section.

### Required dependencies

- `uv` — Python toolchain manager (runs installer and MCP server).
- `gh` — GitHub CLI (used by several skills).
- **context7 API key** — for library docs retrieval.
