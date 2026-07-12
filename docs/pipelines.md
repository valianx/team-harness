# Pipelines reference

This document describes every pipeline th:lider supports. Each section covers when to use the pipeline, the phases it runs, and the artifacts it produces.

For the day-to-day usage walkthrough, see [`docs/how-it-works.md`](./how-it-works.md). For agent contracts and the full routing table, see [`agents/lider.md`](../agents/lider.md), [`agents/orquestador.md`](../agents/orquestador.md), and [`agents/ref-special-flows.md`](../agents/ref-special-flows.md).

## Quick reference

| Pipeline | How to invoke | What it does |
|---|---|---|
| **Feature** | `@th:lider <describe new feature>` | New functionality via SDD flow (architect → implementer → verify → delivery). Default when no other intent is detected. |
| **Bug-fix** | `@th:lider <bug report>` · `/issue #N` (from GitHub issue) | Bug correction with 4-tier classification (0–4). Tier auto-determines ceremony. |
| **Hotfix** | `@th:lider hotfix <urgent fix>` | Fast-path bug-fix that skips architect root-cause. Regression test still mandatory. |
| **Refactor** | `@th:lider refactor <X>` · `@th:lider rename <X>` | Structure-only changes. Existing tests guard against behavior drift. |
| **Security-sensitive** | Auto-triggered by path patterns (`auth/`, `middleware/`, `db/`, etc.) or keywords | Forces `security` agent in parallel during verify. Cannot be downgraded. |
| **Frontend-scope** | Auto-triggered by path patterns (`components/`, `pages/`, `*.tsx`, `*.vue`, CSS) or UI/UX keywords | Adds `ux-reviewer` in Stage 1 (enrich: UI/UX AC) and Stage 3 (validate: accessibility, responsiveness, component reuse). Only critical findings block. |
| **Database changes** | Auto-triggered when diff touches migration files | Architect declares migration strategy; plan-reviewer validates reversibility. |
| **Test pipeline** | `/test-pipeline` · `@th:lider run the test pipeline` | Service-wide test authoring with 80 % branch-coverage gate (max 3 loops). Writes coverage config + test code in worktrees; output: `05-consolidation.md`. |
| **Research** | `/research <topic>` · `@th:lider investigate <X>` | Time-boxed read-only investigation. Output: `research/00-research.md`, no code committed. |
| **Spike** | `/spike <prototype>` · `@th:lider spike <X>` | Throwaway prototype to validate a technical approach. No delivery. |
| **Plan** | `/plan <task>` · `/design <feature>` · `@th:lider give me the work plan` | Stage 1 only (intake → architect → plan-review → STAGE-GATE-1). Stops without implementing. |
| **PR review** | `/review-pr #N` · `@th:lider review PR #N` | 5-phase enriched review with worktree, tier-aware multi-agent dispatch (reviewer + qa + security at Tier 3+), explicit decision menu. |
| **PR review (multi)** | `/review-pr #N --multi` | Multi-reviewer parallel: reviewer-security + reviewer-architecture + reviewer-style consolidated by `reviewer-consolidator`. |

### Reading the table

- **`@th:lider <phrase>`** invocations use intent detection — th:lider classifies the phrase and routes to the appropriate pipeline. Slash-command invocations skip the classification step.
- For full intent-detection patterns and Spanish triggers, see [`agents/lider.md`](../agents/lider.md) Step 6.
- For tier-system details (auto-detection rules, paths, keywords), see the **Bug-fix pipeline** section below.

### Pipelines NOT in this list

`docs/pipelines.md` covers multi-phase pipelines that dispatch multiple agents through staged gates. Standalone utility skills (`/lint`, `/th:pipelines`, `/th:kg`, `/tmux`, `/th-update`, `/trace`, `/background`, `/eval`, `/cross-repo`) and direct modes (`/audit`, `/diagram`, `/translate`, `/security`, `/define-ac`, `/validate`, `/recover`, `/deliver`, `/gcp-costs`, `/th:bootstrap`) are operator-facing surfaces but do not run a multi-phase pipeline. Their contracts live in the respective `skills/*.md` and `agents/*.md` files. th:lider routes them directly (see `agents/lider.md` Step 6 routing table).

---

## Feature pipeline (standard SDD flow)

**When to use.** New features, enhancements, API additions, non-trivial refactors, or any work that requires a design decision before implementation. Default when no special intent is detected. Invoke via `@th:lider <describe new feature>`.

### Discover front-end (before Phase 1)

Every feature pipeline is preceded by the **Discover phase** — th:lider's default intake posture before dispatching the architect. It is interactive and runs at the top-level chat session (not inside a subagent):

1. **Framing gate (B1).** th:lider restates what it understood and asks any clarifying questions. An explicit advance signal from the operator (`dale`, `go`, `plan it`, `procedé`, …) closes Discover. Without an advance signal or a fast-path skip marker (`--fast`, `[TIER: N]`, `@th:lider this is a hotfix:`), th:lider never dispatches the architect.
2. **Intake survey (§5 of `docs/discover-phase.md`).** Four meta-decisions captured immediately after the advance signal: pipeline shape (full / fast), effort, iteration autonomy, and a scope hint.
3. **Spec co-authoring — `00-spec-seed.md`.** If the task is a large or vague scope, the operator and th:lider collaboratively author a one-page spec seed (`00-spec-seed.md`) to anchor the architect's design. This is optional but strongly recommended for ambiguous tasks; th:lider proposes it when `functional_clarity_confirmed: false` after the framing gate.
4. **Approach checkpoint.** Before dispatching the architect, th:lider surfaces the tentative pipeline shape (pipeline type, affected services, security flags) and confirms with the operator. If the auto-classification disagrees with the operator's intent, this is the correction point.
5. **Plan sketches + sketch-guard at STAGE-GATE-1.** Once the architect completes Phase 1, it writes sketch files (`sketches/api-contract.md`, `sketches/data-model.md`, etc.) alongside `01-plan.md`. `hooks/sketch-guard.sh` fires at STAGE-GATE-1 and blocks the gate if a required sketch is missing.

Full contract: [`docs/discover-phase.md`](./discover-phase.md).

### Phases

| Phase | Agent | Output |
|---|---|---|
| Phase 0a — Classify & Intake | th:lider | `00-state.md` initialized, Discover gate, intake survey, KG session started |
| Phase 0b — Specify | th:lider | AC list and scope confirmed in `00-state.md` |
| Phase 1 — Design | architect | `01-plan.md` (merged architecture + task list) + `sketches/` |
| Phase 1.7 — UX Enrich | ux-reviewer (when `frontend_scope: true`) | `reviews/01-ux-review.md`, UI/UX AC appended to `01-plan.md` |
| Phase 1.5 — Plan Ratification | qa-plan | AC validation against Work Plan (written to `reviews/01-plan-review.md § Plan Ratification`) |
| Phase 1.6 — Plan Review | plan-reviewer | verdict written to `reviews/01-plan-review.md` (`**Combined verdict:**`) |
| **STAGE-GATE-1** | operator | Approve or approve-autonomous; sketch-guard validates `sketches/` |
| Phase 2.0 — (bug-fix only) | — | — (see Bug-fix pipeline) |
| Phase 2 — Implementation | implementer | code, `02-implementation.md` |
| Phase 2.5 — Constraint Reconciliation | qa | keep/amend/drop decision when a hidden constraint surfaces |
| Phase 2.7 — Test Authoring | tester (authoring mode) | `03-testing.md` (authoring section); must complete before Phase 3 |
| Phase 3 — Verify | tester (run-only), qa, security* (parallel) | `03-testing.md` (verify section), `reviews/04-validation.md`, `reviews/04-security.md` |
| Phase 3.5 — Acceptance Gate | th:orquestador | re-routes to implementer if any AC is missing a passing test (max 3 loops) |
| Phase 3.75 — Build Verification | th:orquestador | build/lint commands; retry implementer once if fail |
| Phase 3.6 — Acceptance Check | acceptance-checker | verdict appended to `reviews/04-validation.md` |
| **STAGE-GATE-2** | operator | Per-round approval (skipped when operator granted `approve-autonomous` at GATE-1) |
| Phase 4 — Delivery | delivery | CHANGELOG entry, version bump, branch, commit |
| Phase 4.5 — Internal Review | reviewer | advisory top-3 issues |
| **STAGE-GATE-3** | operator | Final ship/amend/abort |
| Phase 5 — GitHub Update | th:orquestador + delivery | PR opened on GitHub post-STAGE-GATE-3 (`Fixes #N`, labels) |
| Phase 6 — KG Capture | th:orquestador | `process-insight` node written to Memory MCP |

*`security` dispatched only when `security-sensitive: true`. `ux-reviewer` dispatched when `frontend_scope: true`.

**STAGE-GATE-1** is mandatory and cannot be skipped. **STAGE-GATE-3** is mandatory and cannot be skipped. **STAGE-GATE-2** fires **per-round** (once per round of tasks, between rounds) and is skipped when the operator granted `approve-autonomous` at GATE-1. A "round" is all tasks that share the same dependency depth; independent tasks run in parallel within a round, and STAGE-GATE-2 fires once when the whole round completes — not once per task.

**Phase ordering note.** Phase 1.7 executes before Phase 1.5 in time (assigned a higher number for observability-identity continuity, following the same precedent as Phase 3.75 which executes before Phase 3.6). Phase 2.7 (test authoring) must complete before Phase 3 (verify).

### Notable artifacts

- `workspaces/{feature}/01-plan.md` — merged design proposal + task list (§ Architecture + § Task List); stays clean at STAGE-GATE-1 — a one-line `**Reviews:**` attestation in the title block is the only review trace
- `workspaces/{feature}/reviews/01-plan-review.md` — plan-review panel output (§ Plan Ratification, § Security Design-Review, § Plan Review + `**Combined verdict:**`, § Panel Rounds); must exist with a Combined verdict before STAGE-GATE-1
- `workspaces/{feature}/sketches/` — api-contract, data-model, ui-wireframe, etc. (presence gated by sketch-guard at STAGE-GATE-1)
- `workspaces/{feature}/00-spec-seed.md` — optional pre-architect spec anchor (Discover phase)
- `workspaces/{feature}/00-state.md` — live pipeline state (TL;DR + phase + agent results)
- `workspaces/{feature}/00-execution-events.jsonl` — append-only JSONL trace (local mode)
- `workspaces/{feature}/00-execution-events.md` — same trace wrapped in YAML frontmatter + code fence (obsidian mode)
- `workspaces/{feature}/00-pipeline-summary.md` — human-readable rollup

---

## Bug-fix pipeline (type: fix)

**When to use.** A known bug needs a focused, scoped fix. Triggered when intent signals contain `bug`, `fix`, `solucionar`, `arreglar`, `corregir`, `regresión`, urgency markers, or a GitHub `bug` label. The same 3-stage backbone as the feature pipeline, with type-specific content shifts.

Full specification: [`agents/ref-special-flows.md`](../agents/ref-special-flows.md) § Bug-fix Flow.

### Differences from the feature pipeline

| Stage | Bug-fix difference |
|---|---|
| Stage 1 | architect runs in **root-cause mode** → `01-root-cause.md` (1 page max) instead of `01-plan.md` |
| Phase 2.0 | tester authors a **failing regression test** in `02-regression-test.md` BEFORE the implementer touches source — mandatory, no fallback |
| Stage 2 — Implementation | implementer runs under **scope discipline**: zero tangential refactors; spotted issues go to `## Follow-ups Spotted` |
| Stage 2 — Verify | `security` agent runs **always** in parallel with `tester` and `qa`, regardless of any other criterion |
| Stage 3 — Delivery | CHANGELOG entry under `### Fixed`; PR title `fix(area): <summary>`; PR body includes mandatory `## Bug Report` section with reproduction steps + root cause + regression test path; `Fixes #N` triggers GitHub auto-close |

### Tier system (0–4)

The bug-fix pipeline is tier-classified at Phase 0a to calibrate ceremony to severity.

| Tier | Name | Phase 1 (root-cause) | Phase 2.0 (regression test) | Phase 3 agents | workspaces |
|---|---|---|---|---|---|
| **0** | Trivial/Cosmetic | Skipped | Skipped | tester only (suite no-regress; no full audit) | **None** — no workspaces created |
| **1** | Docs/Trivial | Skipped — one-sentence prose plan | Conditional skip when no behavior change | tester (no-regress suite) only | Yes — minimal |
| **2** | Light fix | Architect `mode: light-root-cause`, ≤30 lines | Mandatory | tester + qa | Yes — full |
| **3** | Standard fix (default) | Architect `mode: full-root-cause`, 1 page max | Mandatory | tester + qa + security | Yes — full |
| **4** | Critical/Security | `mode: full-root-cause` + mandatory `mcp__memory__search_nodes` Prior Art query | Mandatory | tester + qa + security (extended analysis) | Yes — full + prior-art |

**Tier 0 — no workspaces.** Tier 0 is the genuinely-lite path for trivially cosmetic changes (typo in a comment, whitespace in README, CHANGELOG typo). The implementer makes the fix, runs tests, and opens the PR. No `workspaces/` folder is created. The PR review is the only gate. Auto-classifies when all of: single file touched, ≤5 lines changed, docs/comment/whitespace-only path, no test paths, no system-level files (`agents/*.md`, `skills/*.md`, `cmd/install/*.go`). Auto-promotes to Tier 1+ if any rule breaks during implementation.

**Classification signals.**

- **Signal 1 — Keywords.** Low-tier hints: `typo`, `comment`, `docs`. High-tier triggers: `auth`, `injection`, `token`, `bypass`, `sql`, `xss`, `csrf`, `rce`, `overflow`, `exploit`, `cve`.
- **Signal 2 — File-path patterns.** Tier 1: `*.md`, `docs/**`, `LICENSE`, `CHANGELOG*`. Tier 2: `.github/**`, `scripts/**`, `*.test.*`. Tier 3: `src/**`, `lib/**`, `app/**`, `cmd/**`. Sensitive paths (`auth/**`, `middleware/**`, `api/**`, `db/**`, `security/**`, `crypto/**`, `session/**`) force a minimum of Tier 3, regardless of any other signal.
- **Signal 3 — Operator override.** `[TIER: N]`, `[regression-test: required]`, `[security: required]` markers in the bug report take precedence.

When signals are ambiguous, the default is Tier 3 (conservative). The architect can re-tier mid-flow via `tier_promote` + `tier_promote_rationale` with operator confirmation.

---

## Hotfix sub-flow (type: hotfix)

**When to use.** An urgent single-file or minimal-scope fix that cannot wait for a full root-cause analysis cycle. Triggered by `hotfix` in the request.

Differences from the bug-fix pipeline:

- Phase 1 (architect root-cause) is **skipped entirely**. th:orquestador emits a one-sentence prose plan at STAGE-GATE-1 instead.
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

Migration strategy is mandatory for all database-touching PRs: migrations must be reversible (up + down), follow the project's migration tooling, and be deployed atomically with the code that depends on them. The architect declares the migration strategy in `01-plan.md` and the plan-reviewer validates it.

---

## Test pipeline (/test-pipeline)

**When to use.** Service-wide test authoring and coverage enforcement across multiple components without a feature change. Triggered by `/test-pipeline` or `@th:lider run the test pipeline`.

The test pipeline **writes coverage configuration and test code** — it is not a read-only analysis. It runs inside a worktree, iterates until the coverage gate is met or the loop limit is reached, and commits the result:

1. **Phase 1 — Coverage config.** Sets up or updates the coverage tool for the service.
2. **Phase 2 — Module decomposition.** th:orquestador decomposes the service into testable modules and dispatches `tester` agents in parallel, one per module.
3. **Phase 3 — Test generation (iterative).** Each `tester` agent writes or updates test files for its module. If the 80 % branch-coverage gate is not met, the loop retries (max 3 loops service-wide).
4. **Phase 4 — Consolidation.** Output: `workspaces/test-pipeline/05-consolidation.md` — a quality report with final coverage numbers, gaps, and recommended follow-ups.

**Coverage gate: 80 % branch coverage service-wide is mandatory.** The pipeline iterates until met or max 3 loops. No implementation (feature) or delivery phases run. Source: `skills/test-pipeline/SKILL.md`.

---

## Research / Spike flow (type: research or spike)

**When to use.** Time-boxed investigation of an unknown (technology evaluation, feasibility analysis, performance profiling, cost modeling). No code changes are committed. Triggered by `/research <topic>`, `/spike <prototype>`, `@th:lider investigate <X>`, or `@th:lider spike <X>`.

th:lider routes to read-only direct mode: no `implementer`, no `delivery`, no PR. Output is a `research/00-research.md` spike document with findings, trade-offs, and a recommendation. The operator decides whether to promote to a feature pipeline from there.

---

## Plan flow (`/plan`) and design flow (`/design`)

These are two distinct flows that produce different artifacts and serve different purposes.

### `/plan` — task breakdown to GitHub issues (planning mode)

**When to use.** Breaking a broad scope into parallel tasks with dispatch labels, creating GitHub issues (or `tasks/` files when `gh` is absent) as the output. Triggered by `/plan <scope>` or `/th:plan`.

th:lider runs in **planning mode**: SPECIFY → DESIGN (architect produces `01-planning.md`, a multi-task breakdown with dependency labels) → create one GitHub issue per task. The flow stops after issue creation.

| File | Consumer | Purpose |
|------|---------|---------|
| `01-planning.md` | th:lider (multi-task dispatch) | Break a broad scope into N parallel tasks with BLOCKER/PARALLEL/CONVERGENCE/SEQUENTIAL labels |

**`plan-and-execute` variant.** Appending "and execute" / "ejecutar" to the `/plan` call transitions to `plan-and-execute` mode: after issue creation, th:lider fans out to execute each task through the full pipeline in parallel. See **Parallel dispatch flow** below.

Full contract: `skills/plan/SKILL.md` and [`agents/ref-special-flows.md`](../agents/ref-special-flows.md) § Plan Flow.

### `/design` — Stage 1 design run (design mode)

**When to use.** Design-only run: the operator wants the architecture proposal and task list for a single feature but will not immediately implement. Triggered by `/design <feature>` or `@th:lider give me the work plan`.

Runs Stage 1 (Phase 0–1.6 + STAGE-GATE-1) and stops. The architect produces `01-plan.md` — the merged architecture + task list with per-task Given/When/Then AC. No implementation dispatched. The operator can resume implementation later via `@th:lider implement it`.

| File | Consumer | Purpose |
|------|---------|---------|
| `01-plan.md` | implementer + qa + plan-reviewer | Merged architecture + task list (§ Architecture + § Task List); stays clean — plan-review verdict lives in `reviews/01-plan-review.md` |

---

## Milestone-Build Flow (single-repo `type: plan`)

**When to use.** One project decomposed into milestones (M0…MN), executed as a step-by-step build. The entire build ships as ONE PR under the default `all-tasks-one-pr` Delivery Grouping, opened after all milestones are complete. Triggered by a broad single-repo build request that the architect decomposes into milestones.

**Key invariants:**

- **One workspace — one PR.** The entire build lives in a single workspace; one PR is opened at the end after STAGE-GATE-3. Per-milestone PRs are prohibited.
- **Milestones are commits, not PRs.** Each milestone produces one commit on the feature branch. The `## Milestone Index` table in `00-state.md` tracks `Milestone | Slug | Status | Commit` — no `PR` column per milestone.
- **Flat stage files.** `02-implementation.md`, `03-testing.md`, `reviews/04-validation.md`, and `reviews/04-security.md` are whole-task documents. No per-milestone suffixes (e.g., `02-implementation-m1.md`) and no second-cycle suffixes (e.g., `02b-implementation.md`) are ever created.
- **Independent milestones run in parallel.** The architect annotates each milestone in `01-plan.md` as `independent` or `depends-on-Mx`. Independent milestones are dispatched concurrently in isolated worktrees and converge as serial commits in dependency order.
- **Identity-keyed, not date-keyed.** th:orquestador finds the plan workspace by identity slug (date-agnostic glob + frontmatter confirm). A day rollover never creates a new workspace.

**Gate model:**

| Gate | Fires | Scope |
|------|-------|-------|
| STAGE-GATE-1 | Once | Approve the whole milestone plan (`01-plan.md`) including the dependency graph |
| (per milestone) | per milestone | Implement → one commit on the feature branch → update Milestone Index |
| (verify) | once, whole-task | Flat `03-testing.md` / `reviews/04-validation.md` cover the whole build |
| STAGE-GATE-3 | Once | After ALL milestones complete — ONE PR opened |

Full contract: [`agents/ref-special-flows.md`](../agents/ref-special-flows.md) § Milestone-Build Flow.

---

## Parallel dispatch flow (plan-and-execute)

**When to use.** The operator has 2+ tasks (from `/plan plan-and-execute`, `/th:issue #1 #2 #3`, or a broad scope th:lider decomposes). th:lider fans out to execute each task through the full pipeline in parallel worktrees.

**Entry points:**

- `/th:plan plan-and-execute` → architect produces `01-planning.md` → parallel dispatch
- `/th:issue #1 #2 #3` → multiple issues → parallel dispatch
- Natural-language batch request → th:lider runs Specify + Design (planning mode) → parallel dispatch

**Execution model:**

1. th:lider reads `01-planning.md` for dependency labels (BLOCKER / PARALLEL / CONVERGENCE / SEQUENTIAL) and groups tasks into rounds.
2. Round 1 tasks (no blockers) run in parallel, each in its own worktree, each running the full pipeline.
3. Subsequent rounds are gated: a round starts only after all its blockers in the previous round are complete.
4. Same-repo tasks consolidate into ONE PR by default (the delivery agent merges all task branches into a `batch/<name>-verify` integration branch and opens one consolidated PR). Operator can opt out with "keep them as separate PRs".
5. **No double-gating.** STAGE-GATE-1/2/3 fire inside each child pipeline; the top-level th:lider does not additionally fire them at the batch level.

**Branching strategy.** Round 1 tasks branch from `main`. Round 2 tasks branch from Round 1's feature branch — when Round 1's PR merges, Round 2's PRs auto-rebase cleanly.

Full contract: [`agents/ref-special-flows.md`](../agents/ref-special-flows.md) § Plan Flow § Parallel Dispatch Flow.

---

## Initiative fan-out (multi-project)

**When to use.** A cross-repo initiative involves 2+ projects (e.g., backend + frontend + infra). th:lider groups per-project pipelines under an `overview.md` parent index and fans out Stage 2 lanes in parallel when ≥2 projects clear STAGE-GATE-1.

**Key mechanics:**

- An `overview.md` initiative index is created (detect + confirm gate before creation).
- Each project runs its own full pipeline in a dedicated worktree.
- `--serial` overrides the fan-out and forces sequential project execution.
- Per-project STAGE-GATE-1/2/3 fire inside each project lane; the initiative level does not add additional gates.

Full contract: [`agents/lider.md`](../agents/lider.md) § Parallel Multi-Project Dispatch.

---

## Acceptance gate (Phase 3.5)

**When to use.** Fires automatically between Phase 3 (Verify) and STAGE-GATE-2 for every PR in every pipeline.

Phase 3.5 is th:orquestador re-reading the three verify artifacts (`03-testing.md`, `reviews/04-validation.md`, `reviews/04-security.md`) and the original AC list. If any AC from `01-plan.md § Task List` is missing a passing test or has an unresolved security finding, Phase 3.5 routes back to the `implementer` for a targeted fix before the gate opens. STAGE-GATE-2 never opens on a partial-pass.

---

## gh-fallback graceful degradation

When the `gh` CLI is unavailable or unauthenticated, skills degrade through four tiers rather than failing hard:

| Tier | What it covers |
|---|---|
| A | Read operations via `curl` against the GitHub REST API (requires `$GH_TOKEN` or `$GITHUB_TOKEN`) |
| B | Write operations (PR creation, comments) via `curl` or operator-paste when `curl` write fails |
| C | (reserved) |
| D | Project-board operations skipped silently |

When write via `curl` also fails, `delivery` returns `status: blocked-manual-push`. th:orquestador emits a STOP block with the compare URL and `workspaces/{feature}/inputs/pr-body.md`. The operator opens the PR manually, then replies `pr opened #N` to continue.

Full contract: [`agents/_shared/gh-fallback.md`](../agents/_shared/gh-fallback.md).

See also: [`docs/decisions/gh-fallback-pattern.md`](./decisions/gh-fallback-pattern.md) for the design decision history — the 20 architect open questions (Q-1 through Q-20) with operator decisions and rationale.

---

## Multi-reviewer flow (/review-pr --multi)

**When to use.** PRs larger than 1 500 lines or 8 files, or when the operator explicitly requests multiple focused reviews. Triggered via `/review-pr --multi` or `/review-pr --reviewers security,architecture`.

The `reviewer` agent runs 2–3 focused review passes (one per focus: `general`, `security`, `architecture`, `style`). The `reviewer-consolidator` agent then merges the drafts into a single unified PR review, de-duplicates findings, surfaces contradictions, and derives the final verdict. Only the consolidated review is posted to GitHub.

Review policy: if `.team-harness/review-policy.md` exists in the consumer repo, the reviewer reads it and enforces its declared rules. Scaffold via `/th:bootstrap --scaffold-review-policy`.

Re-review automation: optionally scaffold `.github/workflows/team-harness-rereview.yml` via `/th:bootstrap --scaffold-rereview-workflow`. The workflow posts a PR comment when new commits arrive on a PR that already has a team-harness review.

---

## PR review (enriched) — v2.15.0

**When to use.** Review an open pull request with worktree-accurate file context and tier-aware multi-agent dispatch. Invoke via `/review-pr #N` or `@th:lider review PR #N`. Add `--multi` for parallel focused reviewers (see Multi-reviewer flow above).

The `/review-pr` skill runs a 5-phase pipeline that provides accurate file context, parallel multi-agent analysis, and an explicit operator decision menu.

### Phase 1 — Gather (with worktree)

After fetching PR metadata and the diff, the skill creates a temporary git worktree at the PR's head SHA:

```sh
git worktree add /tmp/team-harness-pr-review-{N} origin/{headRefName}
```

All review agents read files from this worktree (`$WORKTREE/path/to/file`), not from the operator's current checkout. This ensures agents see the exact file state being reviewed — critical for refactor PRs where `main` and the PR branch differ substantially.

A shell `trap` registers cleanup so the worktree is removed even on early exit. The worktree name includes the PR number — concurrent reviews in the same session do not conflict.

The phase also scans for `workspaces/` in the worktree. If found, the PR came from a team-harness pipeline and carries AC that can be used for QA validation.

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

**Trigger:** `/docs <topic>`, `@th:lider documenta en obsidian X`, or any request classified as `type: docs`.

**Purpose:** Generate structured Obsidian documentation for a service, database, API, library, infrastructure setup, or product. Diagram-first layout — every concept gets a visual before prose.

### Phase overview

| Phase | Agent | Output |
|-------|-------|--------|
| 0 — Intake | th:lider | `00-task-intake.md` (topics, vault, folder, language, subject classification) |
| 1 — Research | architect (research mode) | `research/00-research.md` |
| 2a — Write | documenter | Obsidian vault pages + `02-documentation.md` manifest |
| 2b — Diagrams | diagrammer / canvas (conditional) | `.excalidraw.md` and `.canvas` files in vault |
| 3 — Review | qa | `reviews/04-validation.md` |
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

### workspaces

```
workspaces/{feature-name}/
  00-state.md
  00-task-intake.md
  research/00-research.md
  02-documentation.md    # manifest (pages, diagrams, dispatch requests)
  reviews/04-validation.md
```

### QA validation checks

Coverage (research → pages), navigation (index + wikilinks), diagram density (1+ per page), diagram-first layout, cross-link resolution, language consistency, frontmatter validity, no orphan text blocks (5+ paragraphs without a visual).

### Direct mode

The documenter agent can be invoked directly (without the full pipeline) when research is already available. The caller provides the research content, vault path, folder, language, and subject classification. This skips Phases 0, 1, 3 and the DOC-GATE.
