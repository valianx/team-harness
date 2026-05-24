# Pipelines reference

This document describes every pipeline the th-orchestrator supports. Each section covers when to use the pipeline, the phases it runs, and the artifacts it produces.

For the day-to-day usage walkthrough, see [`docs/how-it-works.md`](./how-it-works.md). For agent contracts and the full routing table, see [`agents/th-orchestrator.md`](../agents/th-orchestrator.md) and [`agents/ref-special-flows.md`](../agents/ref-special-flows.md).

## Quick reference

| Pipeline | How to invoke | What it does |
|---|---|---|
| **Feature** | `@th-orchestrator <describe new feature>` | New functionality via SDD flow (architect → implementer → verify → delivery). Default when no other intent is detected. |
| **Bug-fix** | `@th-orchestrator <bug report>` · `/issue #N` (from GitHub issue) | Bug correction with 4-tier classification (0–4). Tier auto-determines ceremony. |
| **Hotfix** | `@th-orchestrator hotfix <urgent fix>` | Fast-path bug-fix that skips architect root-cause. Regression test still mandatory. |
| **Refactor** | `@th-orchestrator refactor <X>` · `@th-orchestrator rename <X>` | Structure-only changes. Existing tests guard against behavior drift. |
| **Security-sensitive** | Auto-triggered by path patterns (`auth/`, `middleware/`, `db/`, etc.) or keywords | Forces `security` agent in parallel during verify. Cannot be downgraded. |
| **Frontend-scope** | Auto-triggered by path patterns (`components/`, `pages/`, `*.tsx`, `*.vue`, CSS) or UI/UX keywords | Adds `ux-reviewer` in Stage 1 (enrich: UI/UX AC) and Stage 3 (validate: accessibility, responsiveness, component reuse). Only critical findings block. |
| **Database changes** | Auto-triggered when diff touches migration files | Architect declares migration strategy; plan-reviewer validates reversibility. |
| **Test pipeline** | `/test-pipeline` · `@th-orchestrator run the test pipeline` | Service-wide coverage analysis. No code changes; produces a prioritized test list. |
| **Research** | `/research <topic>` · `@th-orchestrator investigate <X>` | Time-boxed read-only investigation. Output: `01-research.md`, no code committed. |
| **Spike** | `/spike <prototype>` · `@th-orchestrator spike <X>` | Throwaway prototype to validate a technical approach. No delivery. |
| **Plan** | `/plan <task>` · `/design <feature>` · `@th-orchestrator give me the work plan` | Stage 1 only (intake → architect → plan-review → STAGE-GATE-1). Stops without implementing. |
| **PR review** | `/review-pr #N` · `@th-orchestrator review PR #N` | 5-phase enriched review with worktree, tier-aware multi-agent dispatch (reviewer + qa + security at Tier 3+), explicit decision menu. |
| **PR review (multi)** | `/review-pr #N --multi` | Multi-reviewer parallel: reviewer-security + reviewer-architecture + reviewer-style consolidated by `reviewer-consolidator`. |

### Reading the table

- **`@th-orchestrator <phrase>`** invocations use intent detection — the orchestrator classifies the phrase and routes to the appropriate pipeline. Slash-command invocations skip the classification step.
- For full intent-detection patterns and Spanish triggers, see [`agents/th-orchestrator.md`](../agents/th-orchestrator.md) Step 6.
- For tier-system details (auto-detection rules, paths, keywords), see the **Bug-fix pipeline** section below.

### Pipelines NOT in this list

`docs/pipelines.md` covers multi-phase pipelines that dispatch multiple agents through staged gates. Standalone utility skills (`/lint`, `/status`, `/memory`, `/tmux`, `/th-update`, `/trace`, `/background`, `/eval`, `/cross-repo`) and direct modes (`/audit`, `/diagram`, `/translate`, `/security`, `/define-ac`, `/validate`, `/recover`, `/deliver`, `/gcp-costs`, `/init`) are operator-facing surfaces but do not run a multi-phase pipeline. Their contracts live in the respective `skills/*.md` and `agents/*.md` files. The orchestrator routes them directly (see `agents/th-orchestrator.md` Step 6 routing table).

---

## Feature pipeline (standard SDD flow)

**When to use.** New features, enhancements, API additions, non-trivial refactors, or any work that requires a design decision before implementation. Default when no special intent is detected. Invoke via `@th-orchestrator <describe new feature>`.

### Phases

| Phase | Agent | Output |
|---|---|---|
| Phase 0a — Classify & Read | th-orchestrator | `00-state.md` initialized, KG session started |
| Phase 0b — Intake | th-orchestrator | `00-task-intake.md` |
| Phase 1 — Design | architect | `01-architecture.md`, `02-task-list.md` |
| Phase 1.5 — Plan Ratification | qa | AC validation against Work Plan |
| Phase 1.6 — Plan Review | plan-reviewer | `01-plan-review.md` — pass/concerns/fail verdict |
| **STAGE-GATE-1** | operator | Approve or approve-autonomous |
| Phase 2.0 — (bug-fix only) | — | — (see Bug-fix pipeline) |
| Phase 2 — Implementation | implementer | code, `02-implementation.md` |
| Phase 2.5 — Constraint Reconciliation | qa | keep/amend/drop decision when a hidden constraint surfaces |
| Phase 3 — Verify | tester, qa, security (parallel) | `03-testing.md`, `04-validation.md`, `04-security.md` |
| Phase 3.5 — Acceptance Gate | th-orchestrator | re-routes to implementer if any AC is missing a passing test |
| Phase 3.6 — Acceptance Check | acceptance-checker | `06-acceptance-check.md` — independent spec-vs-delivery comparison |
| **STAGE-GATE-2** | operator | Per-PR approval (skipped with autonomy) |
| Phase 4 — Delivery | delivery | CHANGELOG entry, version bump, branch, commit |
| Phase 4.5 — Internal Review | reviewer | `05-internal-review.md` — advisory top-3 issues |
| **STAGE-GATE-3** | operator | Final ship/amend/abort |
| Phase 5 — GitHub | delivery | PR opened on GitHub (`Fixes #N`, labels) |
| Phase 6 — KG Capture | th-orchestrator | `process-insight` node written to Memory MCP |

**STAGE-GATE-1** is mandatory and cannot be skipped. **STAGE-GATE-3** is mandatory and cannot be skipped. **STAGE-GATE-2** fires between PR batches and is skipped when the operator granted `approve autonomous` at GATE-1.

### Notable artifacts

- `session-docs/{feature}/01-architecture.md` — design proposal
- `session-docs/{feature}/02-task-list.md` — PR table with Given/When/Then AC per PR and `Status:` field
- `session-docs/{feature}/01-plan-review.md` — plan-reviewer verdict
- `session-docs/{feature}/00-state.md` — live pipeline state (TL;DR + phase + agent results)
- `session-docs/{feature}/00-execution-events.jsonl` — append-only JSONL trace
- `session-docs/{feature}/00-pipeline-summary.md` — human-readable rollup

---

## Bug-fix pipeline (type: fix)

**When to use.** A known bug needs a focused, scoped fix. Triggered when intent signals contain `bug`, `fix`, `solucionar`, `arreglar`, `corregir`, `regresión`, urgency markers, or a GitHub `bug` label. The same 3-stage backbone as the feature pipeline, with type-specific content shifts.

Full specification: [`agents/ref-special-flows.md`](../agents/ref-special-flows.md) § Bug-fix Flow.

### Differences from the feature pipeline

| Stage | Bug-fix difference |
|---|---|
| Stage 1 | architect runs in **root-cause mode** → `01-root-cause.md` (1 page max) instead of `01-architecture.md` |
| Phase 2.0 | tester authors a **failing regression test** in `02-regression-test.md` BEFORE the implementer touches source — mandatory, no fallback |
| Stage 2 — Implementation | implementer runs under **scope discipline**: zero tangential refactors; spotted issues go to `## Follow-ups Spotted` |
| Stage 2 — Verify | `security` agent runs **always** in parallel with `tester` and `qa`, regardless of any other criterion |
| Stage 3 — Delivery | CHANGELOG entry under `### Fixed`; PR title `fix(area): <summary>`; PR body includes mandatory `## Bug Report` section with reproduction steps + root cause + regression test path; `Fixes #N` triggers GitHub auto-close |

### Tier system (0–4)

The bug-fix pipeline is tier-classified at Phase 0a to calibrate ceremony to severity.

| Tier | Name | Phase 1 (root-cause) | Phase 2.0 (regression test) | Phase 3 agents | Session-docs |
|---|---|---|---|---|---|
| **0** | Trivial/Cosmetic | Skipped | Skipped | tester only (suite no-regress; no full audit) | **None** — no session-docs created |
| **1** | Docs/Trivial | Skipped — one-sentence prose plan | Conditional skip when no behavior change | tester (no-regress suite) only | Yes — minimal |
| **2** | Light fix | Architect `mode: light-root-cause`, ≤30 lines | Mandatory | tester + qa | Yes — full |
| **3** | Standard fix (default) | Architect `mode: full-root-cause`, 1 page max | Mandatory | tester + qa + security | Yes — full |
| **4** | Critical/Security | `mode: full-root-cause` + mandatory `mcp__memory__search_nodes` Prior Art query | Mandatory | tester + qa + security (extended analysis) | Yes — full + prior-art |

**Tier 0 — no session-docs.** Tier 0 is the genuinely-lite path for trivially cosmetic changes (typo in a comment, whitespace in README, CHANGELOG typo). The implementer makes the fix, runs tests, and opens the PR. No `session-docs/` folder is created. The PR review is the only gate. Auto-classifies when all of: single file touched, ≤5 lines changed, docs/comment/whitespace-only path, no test paths, no system-level files (`agents/*.md`, `skills/*.md`, `cmd/install/*.go`). Auto-promotes to Tier 1+ if any rule breaks during implementation.

**Classification signals.**

- **Signal 1 — Keywords.** Low-tier hints: `typo`, `comment`, `docs`. High-tier triggers: `auth`, `injection`, `token`, `bypass`, `sql`, `xss`, `csrf`, `rce`, `overflow`, `exploit`, `cve`.
- **Signal 2 — File-path patterns.** Tier 1: `*.md`, `docs/**`, `LICENSE`, `CHANGELOG*`. Tier 2: `.github/**`, `scripts/**`, `*.test.*`. Tier 3: `src/**`, `lib/**`, `app/**`, `cmd/**`. Sensitive paths (`auth/**`, `middleware/**`, `api/**`, `db/**`, `security/**`, `crypto/**`, `session/**`) force a minimum of Tier 3, regardless of any other signal.
- **Signal 3 — Operator override.** `[TIER: N]`, `[regression-test: required]`, `[security: required]` markers in the bug report take precedence.

When signals are ambiguous, the default is Tier 3 (conservative). The architect can re-tier mid-flow via `tier_promote` + `tier_promote_rationale` with operator confirmation.

---

## Hotfix sub-flow (type: hotfix)

**When to use.** An urgent single-file or minimal-scope fix that cannot wait for a full root-cause analysis cycle. Triggered by `hotfix` in the request.

Differences from the bug-fix pipeline:

- Phase 1 (architect root-cause) is **skipped entirely**. The th-orchestrator emits a one-sentence prose plan at STAGE-GATE-1 instead.
- Phase 2.0 (regression test) is **still mandatory**. There is no fallback.
- PR title appends `(hotfix)` suffix: `fix(area): <summary> (hotfix)`.

Full specification: [`agents/ref-special-flows.md`](../agents/ref-special-flows.md) § Hotfix sub-flow.

---

## Refactor flow (type: refactor)

**When to use.** Code restructuring with no observable behavior change. Triggered by `refactor`, `rename`, `reorganize`, or similar intent.

Key constraints: the `tester` agent verifies that existing tests still pass (no net-new test coverage is written for a pure refactor). The `qa` agent validates against a `VERIFY-format` AC list (no functional regression). Security runs only if the refactor touches sensitive paths.

---

## Security-sensitive flow

**When to use.** Any change touching `auth/**`, `middleware/**`, `api/**`, `db/**`, `security/**`, `crypto/**`, `session/**`, or flagged by the operator with `[security: required]`.

Security-sensitive flows force `security-sensitive: true` at Phase 0a Step 7, regardless of the pipeline type. The `security` agent runs at Phase 3 in parallel with `tester` and `qa`. For Tier 4 bug-fixes, the security agent runs extended analysis (adjacent-code surface beyond the diff).

---

## Database changes flow

**When to use.** Any feature or fix that adds, removes, or alters database schema, indexes, or migrations.

Migration strategy is mandatory for all database-touching PRs: migrations must be reversible (up + down), follow the project's migration tooling, and be deployed atomically with the code that depends on them. The architect declares the migration strategy in `01-architecture.md` and the plan-reviewer validates it.

---

## Test pipeline (/test-pipeline)

**When to use.** Service-wide test coverage analysis or a structured test pass across multiple components without a feature change. Triggered by `/test-pipeline` or `@th-orchestrator run the test pipeline`.

The `tester` agent runs in coverage mode, reports coverage gaps, and produces a prioritized list of tests to add. No implementation or delivery phases run.

---

## Research / Spike flow (type: research or spike)

**When to use.** Time-boxed investigation of an unknown (technology evaluation, feasibility analysis, performance profiling, cost modeling). No code changes are committed. Triggered by `/research <topic>`, `/spike <prototype>`, `@th-orchestrator investigate <X>`, or `@th-orchestrator spike <X>`.

The th-orchestrator routes to read-only direct mode: no `implementer`, no `delivery`, no PR. Output is a `01-research.md` spike document with findings, trade-offs, and a recommendation. The operator decides whether to promote to a feature pipeline from there.

---

## Plan flow (type: plan)

**When to use.** Design-only run: the operator wants `01-architecture.md` + `02-task-list.md` but will not immediately implement. Triggered by `/plan`, `/design`, or `@th-orchestrator give me the work plan`.

Runs Stage 1 (Phase 0–1.6 + STAGE-GATE-1) and stops. No implementation dispatched. The operator can resume implementation later via `@th-orchestrator implement it`.

---

## Acceptance gate (Phase 3.5)

**When to use.** Fires automatically between Phase 3 (Verify) and STAGE-GATE-2 for every PR in every pipeline.

Phase 3.5 is the th-orchestrator re-reading the three verify artifacts (`03-testing.md`, `04-validation.md`, `04-security.md`) and the original AC list. If any AC from `02-task-list.md` is missing a passing test or has an unresolved security finding, Phase 3.5 routes back to the `implementer` for a targeted fix before the gate opens. STAGE-GATE-2 never opens on a partial-pass.

---

## gh-fallback graceful degradation

When the `gh` CLI is unavailable or unauthenticated, skills degrade through four tiers rather than failing hard:

| Tier | What it covers |
|---|---|
| A | Read operations via `curl` against the GitHub REST API (requires `$GH_TOKEN` or `$GITHUB_TOKEN`) |
| B | Write operations (PR creation, comments) via `curl` or operator-paste when `curl` write fails |
| C | (reserved) |
| D | Project-board operations skipped silently |

When write via `curl` also fails, `delivery` returns `status: blocked-manual-push`. The th-orchestrator emits a STOP block with the compare URL and `session-docs/{feature}/inputs/pr-body.md`. The operator opens the PR manually, then replies `pr opened #N` to continue.

Full contract: [`agents/_shared/gh-fallback.md`](../agents/_shared/gh-fallback.md).

See also: [`docs/decisions/gh-fallback-pattern.md`](./decisions/gh-fallback-pattern.md) for the design decision history — the 20 architect open questions (Q-1 through Q-20) with operator decisions and rationale.

---

## Multi-reviewer flow (/review-pr --multi)

**When to use.** PRs larger than 1 500 lines or 8 files, or when the operator explicitly requests multiple focused reviews. Triggered via `/review-pr --multi` or `/review-pr --reviewers security,architecture`.

The `reviewer` agent runs 2–3 focused review passes (one per focus: `general`, `security`, `architecture`, `style`). The `reviewer-consolidator` agent then merges the drafts into a single unified PR review, de-duplicates findings, surfaces contradictions, and derives the final verdict. Only the consolidated review is posted to GitHub.

Review policy: if `.team-harness/review-policy.md` exists in the consumer repo, the reviewer reads it and enforces its declared rules. Scaffold via `/init --scaffold-review-policy`.

Re-review automation: optionally scaffold `.github/workflows/team-harness-rereview.yml` via `/init --scaffold-rereview-workflow`. The workflow posts a PR comment when new commits arrive on a PR that already has a team-harness review.

---

## PR review (enriched) — v2.15.0

**When to use.** Review an open pull request with worktree-accurate file context and tier-aware multi-agent dispatch. Invoke via `/review-pr #N` or `@th-orchestrator review PR #N`. Add `--multi` for parallel focused reviewers (see Multi-reviewer flow above).

The `/review-pr` skill runs a 5-phase pipeline that provides accurate file context, parallel multi-agent analysis, and an explicit operator decision menu.

### Phase 1 — Gather (with worktree)

After fetching PR metadata and the diff, the skill creates a temporary git worktree at the PR's head SHA:

```sh
git worktree add /tmp/team-harness-pr-review-{N} origin/{headRefName}
```

All review agents read files from this worktree (`$WORKTREE/path/to/file`), not from the operator's current checkout. This ensures agents see the exact file state being reviewed — critical for refactor PRs where `main` and the PR branch differ substantially.

A shell `trap` registers cleanup so the worktree is removed even on early exit. The worktree name includes the PR number — concurrent reviews in the same session do not conflict.

The phase also scans for `session-docs/` in the worktree. If found, the PR came from a team-harness pipeline and carries AC that can be used for QA validation.

### Phase 2 — Tier classification

The PR's changed file list is auto-classified into a tier. The tier determines which agents run.

| Tier | Paths / signals | Agents dispatched |
|---|---|---|
| 0 | Docs only (`*.md`, `LICENSE`, `CHANGELOG*`) | reviewer only |
| 1 | Single-file or test-only changes | reviewer only |
| 2 | Dev-tooling, configs (`.github/**`, `*.json`, `*.yml`) | reviewer + qa (if AC found, else skipped) |
| 3 | Production code (`src/**`, `lib/**`, `cmd/**`, `app/**`, `pkg/**`) | reviewer + qa + security (parallel) |
| 4 | Security-sensitive paths (`auth/**`, `middleware/**`, `db/**`, etc.) OR security keyword in PR body | reviewer + qa + security (extended) |

**Auto-escalation:** any Tier-4 path or keyword escalates to Tier 4 regardless of other signals.

**Operator override:** append `[TIER: N]` to the `/review-pr` call (e.g., `/review-pr #45 [TIER: 4]`).

**Without `--multi`:** Tier 3+ runs single reviewer (general focus) + qa + security in parallel.

**With `--multi`:** Tier 3+ runs reviewer-security + reviewer-architecture + reviewer-style (all from `agents/reviewer.md` parameterised) + qa + security agent. The `reviewer-consolidator` merges all drafts.

### Phase 3 — Multi-agent parallel dispatch

Agents are dispatched in parallel based on tier. Each writes its draft to a dedicated file:

| Agent | Draft file | When dispatched |
|---|---|---|
| reviewer (general or per-focus) | `.claude/pr-review-draft.md` (or `.claude/pr-review-draft-{focus}.md`) | Always |
| qa (`pr-review-qa` mode) | `.claude/pr-review-qa.md` | Tier 2+ with AC, or Tier 3/4 |
| security (`pr-review-security` mode) | `.claude/pr-review-security.md` | Tier 3/4 |

If 2+ draft files exist, `reviewer-consolidator` merges them into `.claude/pr-review-final.md`. Single-draft case skips consolidation.

**Consolidator output structure:**
- Header: tier, agents that ran
- Critical findings (inline, evidence-based, deduped by file:line, with per-agent attribution)
- High-priority suggestions (body, with `file.ts:42` refs)
- Lower-priority observations
- Contradictions section (when reviewer focuses disagree)

### Phase 4 — Decision menu

The operator receives the consolidated draft and an explicit menu:

```
Review draft ready. Decide action:
  (a) approve              — APPROVE event, body + inline comments posted
  (b) request changes      — REQUEST_CHANGES event, body + inline comments posted
  (c) comment only         — COMMENT event, body posted without approval state
  (d) defer                — save draft to disk, do not publish
  (e) cancel               — discard draft, do not publish

Recommendation: {auto-suggested based on findings}
Choose [a/b/c/d/e]:
```

Recommendation logic: 0 criticals + 0 high → `(a) approve`; 0 criticals + 1+ high → `(c) comment only`; 1+ critical → `(b) request changes`.

`(c) comment only` posts the review using GitHub's `COMMENT` event — the body is visible on the PR but no approval state is set. This is suitable when findings are informational or when the reviewer wants to flag concerns without blocking the merge.

`(d) defer` saves the draft and exits cleanly. The operator can publish later with `/review-pr {N} --resume-from-draft`.

### Phase 5 — Publish + cleanup

Atomic `gh api POST .../reviews` with `body + event + comments[]`. The `event` field maps directly from the operator's choice. Worktree and all temp draft files are removed after publishing (or by the EXIT trap on early exit).

The context prune reminder (`/compact`) is printed at the end — PR review context is heavy (5–30K tokens).

---

## Documentation Pipeline

**Trigger:** `/docs <topic>`, `@th-orchestrator documenta en obsidian X`, or any request classified as `type: docs`.

**Purpose:** Generate structured Obsidian documentation for a service, database, API, library, infrastructure setup, or product. Diagram-first layout — every concept gets a visual before prose.

### Phase overview

| Phase | Agent | Output |
|-------|-------|--------|
| 0 — Intake | th-orchestrator | `00-task-intake.md` (topics, vault, folder, language, subject classification) |
| 1 — Research | architect (research mode) | `00-research.md` |
| 2a — Write | documenter | Obsidian vault pages + `02-documentation.md` manifest |
| 2b — Diagrams | diagrammer / canvas (conditional) | `.excalidraw.md` and `.canvas` files in vault |
| 3 — Review | qa | `04-validation.md` |
| DOC-GATE | operator | approve / revise (max 3 iterations) |

### Diagram requirements

Every documentation page must have at least one diagram. Selection guide:

| Content Type | Diagram | Format |
|-------------|---------|--------|
| Flows, pipelines, decisions | Mermaid flowchart | Inline |
| Auth flows, API calls, sequences | Mermaid sequence | Inline |
| Database schema | Mermaid ER | Inline |
| State machines, lifecycle | Mermaid state | Inline |
| System architecture overview | Excalidraw | External (Phase 2b) |
| Concept maps, navigation | Canvas | External (Phase 2b) |

### Multi-topic support

When 2+ topics are detected ("documenta X, Y, y Z"), each topic runs Phase 1 + 2a + 2b independently (parallel if worktrees available). QA validates all topics together for cross-topic consistency.

### Language

Default: English. Override with `--lang <code>`. Prose follows the specified language; structural elements (YAML, Mermaid, code blocks) stay in English.

### Session-docs

```
session-docs/{feature-name}/
  00-state.md
  00-task-intake.md
  00-research.md
  02-documentation.md    # manifest (pages, diagrams, dispatch requests)
  04-validation.md
```

### QA validation checks

Coverage (research → pages), navigation (index + wikilinks), diagram density (1+ per page), diagram-first layout, cross-link resolution, language consistency, frontmatter validity, no orphan text blocks (5+ paragraphs without a visual).

### Direct mode

The documenter agent can be invoked directly (without the full pipeline) when research is already available. The caller provides the research content, vault path, folder, language, and subject classification. This skips Phases 0, 1, 3 and the DOC-GATE.
