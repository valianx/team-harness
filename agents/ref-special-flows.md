---
name: ref-special-flows
description: Reference file for th-orchestrator special flows (research, spike, plan, parallel dispatch, refactor, docs, simple). Read on-demand by the th-orchestrator — not a standalone agent.
model: opus
color: cyan
---

# th-orchestrator — Special Flows Reference

This file is read on-demand by the th-orchestrator when executing a special flow. It is NOT part of the th-orchestrator's system prompt.

---

## Research Flow

When the user asks to investigate, compare technologies, evaluate a migration, or study an approach:

1. **Intake** — classify as `research`
2. **MANDATORY — Query KG** — call `search_nodes` with 1-2 semantic queries. Write `00-knowledge-context.md` if results found. If the Knowledge Graph MCP fails, log "KG: unavailable" and continue.
3. **Invoke `architect` in research mode** — explicitly instruct: "This is a research task, produce `00-research.md`"
4. **Skip Phases 2-5** (no implementation, testing, validation, or delivery)
5. **Present** the research report to the user
6. **Ask** the user how to proceed (implement, discard, or investigate further)

---

## Spike Flow

When the user wants to quickly test a technical hypothesis without full pipeline ceremony:

1. **Intake** — classify as `spike`, complexity always `simple`
2. **MANDATORY — Query KG** — call `search_nodes` with 1-2 semantic queries. Write `00-knowledge-context.md` if results found.
3. **Skip Design** — no architecture proposal needed
4. **Prepare minimal spec context** — just: description, what to test, success criteria (passed inline to the implementer dispatch)
5. **Invoke `implementer`** with: "This is a spike — write exploratory code to test: {description}. No tests needed. Focus on proving whether {hypothesis} works. Document what you found in `02-implementation.md`."
6. **Skip Phases 3-5** (no testing, validation, delivery, or GitHub update)
7. **Present results** to the user:
   ```
   Spike complete: {summary}

   Options:
   1. Formalize as feature → I'll create an issue with findings as technical context
   2. Discard → I'll revert the changes (git checkout)
   3. Investigate further → I'll run another spike or a /research
   ```
8. **Act on user's choice:**
   - Formalize: create GitHub issue using **SDD template** — include spike findings in Technical Context. **Detection + fallback:** see `agents/_shared/gh-fallback.md` § "Tier B — create an issue". When `has_gh=true`: `gh issue create`. When `has_gh=false` and token + GitHub origin available: curl POST. When neither: write SDD body to `session-docs/{feature}/inputs/issue-create.md` and prompt operator to paste it into GitHub, then reply with the new issue number. Ask: "Issue created (or paste required). Run full pipeline now?"
   - Discard: `git checkout -- .` to revert (confirm with user first). Clean up session-docs.
   - Investigate: continue as directed.

---

## Plan Flow

Two modes: `plan` (analysis only) and `plan-and-execute` (analysis + full pipeline per task).

**Distinction from normal pipeline mode.** Plan flow's architect output is `01-planning.md` — a task breakdown for **multi-task batch orchestration** across worktrees, with dispatch labels (BLOCKER / PARALLEL / CONVERGENCE / SEQUENTIAL) and size estimates. This is structurally different from `01-plan.md`, which the architect produces in **normal pipeline mode** (single-feature, sequential PRs, per-PR ACs in Given/When/Then). The two files coexist for different consumers:

| File | Mode | Consumer | Purpose |
|---|---|---|---|
| `01-planning.md` | planning mode (`/plan`, `/plan plan-and-execute`) | th-orchestrator (multi-task dispatch) | break a broad scope into N parallel tasks |
| `01-plan.md` | design mode (normal pipeline) | implementer + qa + plan-reviewer | merged architecture + task list (§ Architecture + § Task List) |

Inside each task dispatched by `plan-and-execute`, the child th-orchestrator runs the full single-feature pipeline (Stage 1 → STAGE-GATE-1 → Stage 2 → STAGE-GATE-2 between PRs → Stage 3 → STAGE-GATE-3), which DOES produce its own `01-plan.md` for that task's PRs. The parent batch th-orchestrator gates at task boundaries via the multi-task progress tracker — it does NOT additionally fire STAGE-GATE-1/2/3 at the batch level. **No double-gating.**

### Planning phase (both modes)

1. **Intake** — classify as `plan` or `plan-and-execute`. Do NOT move GitHub issues to "In Progress" yet.
2. **MANDATORY — Query KG** — call `search_nodes` with 2-3 semantic queries. Write `00-knowledge-context.md` if results found.
3. **Specify** — full SPECIFY as normal (codebase investigation, AC, scope). Update GitHub issue if `needs-specify: true`.
4. **Design (planning mode)** — invoke `architect` in planning mode. Architect produces task breakdown in `01-planning.md`. **Does NOT produce `01-plan.md`** — that file belongs to design mode.
5. **Validate sizing** — read `01-planning.md`. If any task has >20 AC or looks like a full feature, re-invoke architect to split. Max 1 retry.
6. **Create tasks** — **Detection + fallback:** see `agents/_shared/gh-fallback.md` § "Detection probe" and § "Tier B — create an issue" and § "Tier A — list repo labels". Use the standard detection probe to set `has_gh`.
   - **gh available:** create one GitHub issue per task via `gh issue create` using **SDD issue template**. Labels from repo (`gh label list`), assignee `@me`, project board if exists. Comment on parent issue.
   - **gh unavailable, token + GitHub origin available:** use curl Tier B fallback to create issues and Tier A curl to read labels.
   - **neither available:** write each task as markdown in `session-docs/{feature-name}/tasks/` (existing fallback path, unchanged).
7. **Report** created tasks to user.

**Mode: `plan`** → STOP after reporting.

**Mode: `plan-and-execute`** → proceed to Parallel Dispatch (see below).

---

## Parallel Dispatch Flow (DEFAULT for 2+ tasks)

Parallel dispatch is defined in the th-orchestrator's **Multi-Task Orchestration** section. It is the **default behavior** whenever the th-orchestrator has 2+ tasks, regardless of entry point.

**Entry points that lead here:**
- `/plan plan-and-execute` → architect produces task breakdown → dispatch
- `/issue #1 #2 #3` → multiple issues → dispatch
- User requests batch/parallel work → th-orchestrator runs Specify + Design (planning mode) → dispatch
- th-orchestrator identifies broad scope needing breakdown → auto plan-and-execute → dispatch

When multiple tasks exist:
1. The th-orchestrator reads `01-planning.md` for dependency info (if available) or analyzes dependencies itself
2. Follows the **Multi-Task Orchestration** flow (dependency analysis → rounds → hooks + inotifywait → event-driven monitoring)
3. Each worktree runs a full pipeline via `/issue #{number}`

### Branching strategy

Tasks in later rounds depend on code from earlier rounds. Use **branch-from-parent**:
- Round 1 tasks branch from `main`
- Round 2 tasks branch from Round 1's feature branch (not main)
- When Round 1's PR merges, Round 2's PRs auto-rebase cleanly

This mirrors how human teams work with dependent features.

---

## Bug-fix Flow

When `type: fix` is classified (Phase 0a Step 7), the th-orchestrator runs the **Bug-fix Pipeline** — the same 3-stage shell as feature flow, with type-specific content shifts. The pipeline is **tier-classified (1-4)** based on bug content keywords, impacted file paths, and operator override. The tier determines which artifacts are produced and which agents run: Tier 1 (docs/trivial) skips the architect entirely and conditionally skips the pre-fix regression test; Tier 2 (light) uses an abbreviated root-cause + tester + qa; Tier 3 (standard, the PR #50 default) runs the full pipeline + security; Tier 4 (critical/security) adds mandatory prior-art memory query and extended security analysis. The "security runs always for bugs" rule from PR #50 is preserved for Tier 3+; auto-escalation favors high-tier signals so any fix touching a security-sensitive path lands at Tier 3+ regardless of the operator's hint.

### Tier System (4 tiers)

The Tier System modulates the Bug-fix Pipeline depth so trivial fixes skip ceremony and critical fixes get prior-art research and extended analysis. The th-orchestrator emits `bug_tier: 1 | 2 | 3 | 4` at Phase 0a Step 7 (Classify), in addition to the existing `type: fix | hotfix`.

#### Tier table

| Tier | Name | Phase 1 (root-cause) | Phase 2.0 (pre-fix regression test) | Phase 3 agents | Session-docs | Estimated agent runs |
|---|---|---|---|---|---|---|
| **0** | Trivial/Cosmetic | **Skip** | **Skip** | tester only (suite no-regress; no full audit) | **NONE** — no session-docs created | ~1 |
| **1** | Docs/Trivial | **Skip** — no `01-root-cause.md`. th-orchestrator emits one-sentence prose plan at STAGE-GATE-1 (same surface as `type: hotfix`). | **Conditional skip** — only when there is no behavior change (see condition below). | tester (suite no-regress) only | Yes — `00-state.md`, `01-plan.md` | ~3 |
| **2** | Light fix | Inline `01-root-cause.md` — 1 paragraph for `## Mechanism` + 1 paragraph for `## Scope of Fix`, no extended sections. Architect dispatched with `mode: light-root-cause`. | Mandatory | tester + qa | Yes — full | ~5 |
| **3** | Standard fix | Full `01-root-cause.md` (current PR #50 default). Architect dispatched with `mode: full-root-cause`. `## Prior Art` section optional. | Mandatory | tester + qa + security | Yes — full | ~7 |
| **4** | Critical/Security | Full `01-root-cause.md` + **mandatory `## Prior Art` section** (architect invokes `mcp__memory__search_nodes`). Architect dispatched with `mode: full-root-cause`. | Mandatory | tester + qa + security (**extended analysis** — adjacent-code surface + prior-art cross-reference) | Yes — full + prior-art | ~9 |

#### Tier 1 regression-test conditional skip

The Tier 1 candidate skips Phase 2.0 ONLY when ALL of these conditions hold:
- Tier is `1` (auto-classified or operator-declared via `[TIER: 1]`).
- All touched paths match `*.md`, `LICENSE`, `CHANGELOG*`, `docs/**/*`, code comments, or non-functional string literals (informational error messages, log messages with no runtime branching on the content).
- No `*.test.*`, `*.spec.*`, or `tests/` paths touched.
- Operator did NOT declare `[regression-test: required]`.

Otherwise — UI strings (Tier 2 minimum, pragmatic not permissive), dev-tooling, test-fixture changes, etc. — Tier 1 still requires a regression test, OR the candidate is auto-promoted to Tier 2 at classification time. The conditional skip is recorded in `00-state.md` as `regression_test_status: skipped`, in the JSONL trace as `phase.skipped` with `reason: tier-1-no-behavior-change`, and in `01-plan.md` (§ Task List) by mutating the `<TBD-Phase-2.0>` placeholder to `<skipped — Tier 1 no-behavior-change>`.

#### Auto-classification signals

The th-orchestrator combines three signals at Phase 0a Step 7.

**Signal 1 — Keywords in the bug report** (operator's plain-text request and any linked issue body):
- **High-tier triggers (escalate to Tier 4, case-insensitive whole-word match):** `auth`, `injection`, `xss`, `csrf`, `secret`, `token`, `permission`, `bypass`, `vulnerability`, `cve`, `leak`, `exposed`, `unauthorized`.
- **Low-tier hints (Tier 1 candidate):** `typo`, `trivial`, `fix rápido`, `quick fix`, `cosmetic`, `documentation`, `comment fix`, `whitespace`.

**Signal 2 — File-path patterns** (use Phase 0b Step 1 codebase investigation results if the operator mentioned files; otherwise re-evaluate after Phase 1):
- **Tier 1 paths:** `*.md`, `LICENSE`, `CHANGELOG*`, `docs/**/*`, code-comments-only changes.
- **Tier 2 paths:** `.github/**`, `scripts/**`, `*.config.*`, `*.toml`, root-level `package.json` (only when changes are non-dep), `tests/**`, `__tests__/**`, `*.test.*`, `*.spec.*`, `mocks/**`, `fixtures/**`.
- **Tier 3 paths (default for production code):** `src/**`, `lib/**`, `app/**`, `cmd/**` (when no security signals).
- **Security-sensitive paths** (force `security-sensitive: true` and minimum Tier 3): `auth/**`, `middleware/**`, `api/**`, `db/**`, `security/**`, `crypto/**`, `session/**`, `**/middleware/**`, any path with `auth` or `permission` in the name.
- **Tier 4 paths:** same as Tier 3 sensitive paths COMBINED with a Signal 1 high-tier keyword match.

**Signal 3 — Operator override** (literal markers in the operator's request):
- `[TIER: 0|1|2|3|4]` — forces the declared tier, overrides auto-classification. For `[TIER: 0]`, the orchestrator validates the diff qualifies; auto-promotion applies if rules are violated.
- `[regression-test: required]` — forces Tier 2 minimum on a Tier 1 candidate.
- `[security: required]` — forces Tier 3 minimum.

#### Tier 0 auto-detection rules

Auto-classify as Tier 0 ONLY when ALL of the following hold:
- Single file touched in the proposed diff.
- ≤5 lines changed total (insertions + deletions).
- Path matches one of: `*.md` (docs), code-file comments only (diff shows only `//` or `#` or `<!-- -->` changes), CHANGELOG entries, whitespace-only changes.
- No `*.test.*`, `*.spec.*`, or `tests/` paths touched.
- Path does NOT match `cmd/install/main.go`, `agents/*.md`, or `skills/*.md` — these have system-level impact and are Tier 1 minimum.

**Tier 0 operator cannot force for system-level files.** Even with `[TIER: 0]`, changes touching `agents/*.md`, `skills/*.md`, or `cmd/install/*.go` always promote to Tier 1 minimum.

**Tier 0 auto-promotion:** if any rule is violated (e.g., diff grows from 3 lines to 8 lines during implementation), the orchestrator detects and promotes with `tier_promote: 1` and a rationale. No ceremony floor bypassed retroactively.

#### Auto-escalation rules

- **High-tier signal sobrescribes lower-tier classification.** Path priority > keyword priority > size hints. Example: path `auth/handlers.ts` + report "typo in error message" → Tier 3, not Tier 1. The sensitive path wins.
- **Tier 0 promotes before Tier 1 rules apply.** Tier 0 is checked first; if it does not qualify, classification falls through to Tier 1 signals normally.
- **Architect can re-tier in Phase 1.** If during root-cause analysis the architect discovers the scope is wider than the initial classification suggests, the architect emits `tier_promote: <new_tier>` with `tier_promote_rationale: <1-line>` in its status block. The th-orchestrator surfaces both to the operator for confirmation before continuing. Operator-in-loop, same protocol as `type_reclassify`.
- **Default: Tier 3 when in doubt.** Conservative. Ambiguous signals or unclassifiable paths default to Tier 3.

#### Worked examples

**Example Tier 0 — typo in CHANGELOG, no session-docs:**
- Operator request: "fix typo in CHANGELOG.md: 'reseved' should be 'reserved'"
- Signal 1: `typo` (low-tier hint).
- Signal 2: `CHANGELOG.md` — single file, ≤5 lines, docs-only, no system-level path.
- Signal 3: none.
- Classification: `bug_tier: 0` (auto). All Tier 0 conditions satisfied.
- Pipeline: no session-docs created. Implementer makes the fix. Tester runs suite no-regress. PR is opened. PR review is the only gate. ~1 agent run total.

**Example Tier 0 — whitespace fix in README:**
- Operator request: "trailing whitespace on line 42 of README.md"
- Signal 1: `whitespace` (low-tier hint).
- Signal 2: `README.md` — single file, ≤5 lines, docs-only, whitespace-only change.
- Signal 3: none.
- Classification: `bug_tier: 0` (auto). All Tier 0 conditions satisfied.
- Pipeline: no session-docs, no STAGE-GATEs. Implementer makes the fix, runs tests, opens PR. ~1 agent run total.

**Example A — Tier 1, regression-test skipped:**
- Operator request: "fix typo in README.md: 'recieve' should be 'receive'"
- Signal 1: `typo` (low-tier hint).
- Signal 2: `README.md` matches Tier 1 path pattern.
- Signal 3: none.
- Classification: `bug_tier: 1` (auto). All touched paths match `*.md`, no test paths touched, no `[regression-test: required]` declaration → Phase 2.0 skipped.
- Pipeline: th-orchestrator skips Phase 1 (no architect). Phase 1.6 plan-reviewer runs against the minimal `01-plan.md`. STAGE-GATE-1 with one-sentence prose plan. Phase 2 (implementer fixes the typo). Phase 3 (tester suite no-regress + qa simplified validation). No security. ~3 agent runs total.

**Example B — Tier 2, light fix:**
- Operator request: "fix bug in .github/workflows/ci.yml — the matrix doesn't include Python 3.12"
- Signal 1: none high-tier.
- Signal 2: `.github/**` matches Tier 2 path pattern.
- Signal 3: none.
- Classification: `bug_tier: 2` (auto).
- Pipeline: th-orchestrator dispatches architect with `mode: light-root-cause`. `01-root-cause.md` contains 1-paragraph `## Mechanism` + 1-paragraph `## Scope of Fix` + `## Regression Test Approach` (the regression test asserts the matrix includes 3.12). Phase 2.0 mandatory — tester authors failing test. Phase 2 (implementer adds 3.12 to matrix). Phase 3 (tester + qa, no security). ~5 agent runs total.

**Example C — Tier 3 with security-path auto-escalation:**
- Operator request: "typo in error message from `src/auth/middleware.ts`: 'unautorized' should be 'unauthorized'"
- Signal 1: `unauthorized` is a high-tier trigger keyword. Also `typo` is a low-tier hint.
- Signal 2: `src/auth/middleware.ts` is a security-sensitive path → forces minimum Tier 3.
- Signal 3: none.
- Classification: `bug_tier: 3` (path priority > keyword priority; sensitive path wins over the typo hint). The keyword `unauthorized` would normally trigger Tier 4, but here it appears as part of the error-message text being fixed, not as the bug class; the architect can promote to Tier 4 in Phase 1 if root-cause analysis reveals the underlying logic is actually broken.
- Pipeline: th-orchestrator dispatches architect with `mode: full-root-cause`. `01-root-cause.md` full template (Prior Art optional). Phase 2.0 mandatory. Phase 2 (implementer fixes the typo). Phase 3 (tester + qa + security — defense-in-depth on sensitive path). ~7 agent runs total. If the architect surfaces a tier-promote, the operator decides between Tier 3 and Tier 4.

### Full session-docs artifact set (type: fix)

Every bug-fix pipeline produces the backbone artifacts; the tier modulates which Phase-1 / Phase-2.0 / Phase-3 artifacts are generated.

| Artifact | Tier 1 | Tier 2 | Tier 3 | Tier 4 | Content notes |
|---|---|---|---|---|---|
| `01-plan.md` | **Yes (always)** | Yes | Yes | Yes | Bug report content + reproduction steps (§ Review Summary) + tasks of the fix (§ Task List). Minimum 4 lines; Tier 1 may be 3 lines when Phase 2.0 is skipped (reproduce-or-cite, fix, verify) |
| `00-state.md` | Yes | Yes | Yes | Yes | Standard schema, `type: fix`, `bug_tier: N`, `bug_tier_source` |
| `00-execution-events.jsonl` / `.md` | Yes | Yes | Yes | Yes | Standard event trace (`.jsonl` local mode, `.md` obsidian mode) |
| `00-pipeline-summary.md` | Yes | Yes | Yes | Yes | Standard rollup |
| `01-root-cause.md` | **No (Phase 1 skipped)** | Yes — `mode: light-root-cause`, ≤30 lines | Yes — `mode: full-root-cause`, 1 pg max | Yes — `mode: full-root-cause` + mandatory `## Prior Art`, 1 pg max + ≤15 lines | file:line + mechanism + scope |
| `01-plan.md § Plan Review` | Yes | Yes | Yes | Yes | plan-reviewer appends this section; includes Rules 7 + 8 (gated on `type: fix | hotfix`) |
| `02-regression-test.md` | **Conditional skip** — only when no behavior change (see Tier 1 condition above); otherwise Yes | Yes | Yes | Yes | tester's failing test (path + content + how to run) BEFORE implementer touches anything |
| `02-implementation.md` | Yes | Yes | Yes | Yes | implementer's report |
| `03-testing.md` | Yes — suite no-regress only | Yes | Yes | Yes | tester's post-fix verification |
| `04-validation.md` | Yes — Tier 1 simplified template (≤15 lines, no per-AC table) | Yes — default bug-fix contract | Yes — default bug-fix contract | Yes — default bug-fix contract | qa validation |
| `04-security.md` | **No** | **No** | **Yes (mandatory)** | **Yes (mandatory + extended analysis)** | security agent — see "Why security is tier-gated" below |
| `00-state.md § Delivery` | Yes | Yes | Yes | Yes | delivery agent appends this section |
| `04-validation.md § Drift Analysis` | Conditional (per existing complexity/iteration gate) | Conditional | Conditional | Conditional | acceptance-checker appends this section |

**Why security is tier-gated.** PR #50 set `security-sensitive: true` for every bug as a defense-in-depth override. The Tier System refines that override: security runs for every Tier 3+ bug (Tier 4 includes extended analysis cross-referencing prior art), and Tier 1 / Tier 2 fixes skip security because the impacted scope is non-functional (docs, dev-tooling, test infra). The auto-escalation rule guarantees that any fix touching a security-sensitive path (`auth/**`, `middleware/**`, `api/**`, etc.) lands at Tier 3+ at classification time — so a Tier 1 / Tier 2 run cannot accidentally bypass security on sensitive paths. Many bugs have non-obvious security implications (input-validation bugs that are actually injection, race conditions that are TOCTOU vulnerabilities, error-handling bugs that leak information); the path-pattern auto-escalation captures these without forcing security on every typo-in-docs fix.

### Phase structure (type: fix)

| Phase | Owner | Output | Notes |
|---|---|---|---|
| 0a Intake | th-orchestrator | `00-state.md` initial | KG session start, KG query, CLAUDE.md read, type classified as `fix`, `bug_tier` classified (1-4), `security-sensitive: true` forced for Tier 3+ |
| 0b Specify | th-orchestrator | Spec context (bug-report format) passed inline to architect; architect incorporates into `01-plan.md` § Review Summary | Reported behaviour / Expected behaviour / Reproduction steps / Environment / AC (AC-1 reproduction-no-longer-bug, AC-2 regression-test-exists for Tier 2-4; Tier 1 uses implicit "cited issue is fixed") |
| 0.5 Bootstrap | th-orchestrator | — | Same as feature flow |
| 1 Root-cause | architect (mode: root-cause + sub-mode) | `01-root-cause.md` (Tier 2-4 only) | **Tier 1: skipped.** Tier 2: `mode: light-root-cause`, ≤30 lines. Tier 3: `mode: full-root-cause`, 1 pg max. Tier 4: `mode: full-root-cause` + mandatory `## Prior Art`. |
| 1.5 Plan ratification | qa (mode: ratify-plan) | append to `01-root-cause.md` | Usually skipped for `type: fix` (≤3 AC) |
| 1.6 Plan review | plan-reviewer | `01-plan.md § Plan Review` | Rules 1-6 plus Rules 7 + 8 (gated on `type: fix | hotfix`). For Tier 1: Rule 7 is no-op (no `01-root-cause.md`); Rule 8 conditional on Phase 2.0 run |
| STAGE-GATE-1 | th-orchestrator | STOP block | Plan-reviewer verdict + TL;DR from `01-root-cause.md` + PR Summary from `01-plan.md` (§ Task List). Tier 1: one-sentence prose plan replaces TL;DR copy |
| **2.0 Regression Test** | tester (mode: pre-fix-regression) | `02-regression-test.md` (Tier 2-4 mandatory; Tier 1 conditional skip) | Tier 1 with no-behavior-change: skipped (`pre_fix_test_required: false`). Tier 2-4: mandatory, no fallback |
| 2 Implement | implementer | `02-implementation.md` | Scope-discipline contract: zero tangential refactors |
| 2.5 Reconcile | th-orchestrator + qa (reconcile) | — | Same as feature flow |
| 3 Verify | tester + qa + security (tier-gated) | `03-testing.md`, `04-validation.md`, `04-security.md` (Tier 3+) | Tier 1: tester (suite no-regress) + qa (simplified). Tier 2: tester + qa. Tier 3: tester + qa + security. Tier 4: tester + qa + security (extended analysis) |
| 3.5 Acceptance gate | th-orchestrator | — | Same as feature flow; regression test must still be in suite (Tier 2-4) or `regression_test_status: skipped` confirmed (Tier 1) |
| 3.6 Acceptance check | acceptance-checker | `04-validation.md § Drift Analysis` | Conditional per existing gates |
| 4 Delivery | delivery | `00-state.md § Delivery` | CHANGELOG `### Fixed`, PR title `fix(area):`, Bug Report section in PR body, `Fixes #N` |
| 4.5 Internal review | reviewer (mode: internal) | — | Conditional per diff-size gate |
| STAGE-GATE-3 | th-orchestrator | STOP block | ship / amend / abort |
| 5 GitHub update | th-orchestrator | — | Comment with regression test path + Before/After (regression test omitted for Tier 1 skipped) |
| 6 KG save | th-orchestrator | — | `process-insight` describes failure mode learned, not feature shipped |

### Phase 2.0 — Regression Test Authoring (mandatory, never skipped)

**Why this slots between STAGE-GATE-1 and Phase 2.** The human at STAGE-GATE-1 approves the approach (root-cause + regression-test plan). After approval, the tester writes the failing test. The implementer is dispatched at Phase 2 with a test that is already failing. The contract: "make this test pass without breaking the rest." This is the cleanest test-driven bug-fix pattern.

**Operator override (rejects the architect's documented exit hatch):** **Regression test is mandatory always, no exceptions, no fallback.** The architect's design doc proposed a manual-repro-script fallback for race/timing/environment-dependent bugs. The fallback is **rejected**. If the tester cannot author a regression test, the pipeline blocks with `status: blocked` and surfaces to the operator. There is no exit hatch.

**Dispatch:** th-orchestrator invokes `tester` via Task with:
- Feature name for session-docs
- Pointer to `01-plan.md` (§ Review Summary — reproduction steps + expected behaviour + AC)
- Pointer to `01-root-cause.md` (Regression Test Approach section)
- `mode: pre-fix-regression`
- Instruction: "Write a failing test that captures the bug described in `01-plan.md` § Review Summary (reproduction steps). The test MUST fail against the current codebase. Do NOT modify any source code — test files only. Output the test path in your status block; write your summary to `02-regression-test.md`."

**Gate (th-orchestrator):**

| `status` | `tests_failing_as_expected` vs `tests_added` | Action |
|---|---|---|
| `success` | equal AND `suite_still_passing: true` | Proceed to Phase 2. Mutate `<TBD-Phase-2.0>` placeholder in `01-plan.md` (§ Task List) to `regression_test_path` |
| `success` | unequal OR `suite_still_passing: false` | Route back to tester; treat as iteration of Phase 2.0 (max-3) |
| `failed` with `regression_test_status: bug-not-reproducible` | n/a | Route back to architect — root-cause is wrong. Re-run Phase 1, then Phase 2.0. Counts toward Phase 1.6 iteration budget |
| `blocked` | n/a | Cannot author a test. Pipeline blocks with `status: blocked`; surface to operator. **No fallback** |

### Implementer scope-discipline contract (for `type: fix` / `type: hotfix`)

Documented inline in `agents/implementer.md` under `## Scope discipline for type: fix and type: hotfix (Bug-fix Mode)`. Zero tangential refactors. Spotted issues go to `## Follow-ups Spotted`, not into the diff. The `[SCOPE-DRIFT: file X required for AC-N]` annotation pattern (existing for feature flow) routes back to the architect to update `01-root-cause.md` and re-run Phase 1.6.

### Plan-reviewer Rules 7 + 8 (gated on `type: fix | hotfix`)

Documented in `agents/plan-reviewer.md`. Fire only when the th-orchestrator's task payload declares `type: fix` or `type: hotfix`:

- **Rule 7** — `01-root-cause.md` declares a `## Regression Test Approach` section with Test layer (unit / integration / e2e), Test scaffold, Failing assertion. Size cap on `01-root-cause.md` ≤120 lines (>120 = `concerns` finding).
- **Rule 8** — every PR in `01-plan.md` (§ Task List) has an AC referencing the regression test path: `VERIFY: regression test exists at <path>` (or `<TBD-Phase-2.0>` before Phase 2.0 runs).

### qa validate-mode for `type: fix | hotfix`

`agents/qa.md` validate mode adds two boolean fields to the status block:
- `regression_test_referenced: true | false` — confirms the per-AC mapping in `04-validation.md` cross-references `02-regression-test.md`
- `reproduction_steps_validated: true | false` — confirms the AC-1 (reproduction-no-longer-bug) was checked against `01-plan.md` § Review Summary (Reproduction steps)

### Type classification — auto-detect bug-fix vs hotfix

The th-orchestrator's Phase 0a Step 7 classification logic uses these signal lists:

- **`fix`** — request describes broken/incorrect behaviour; keywords: `bug`, `solucionar`, `arreglar`, `corregir`, `fixear`, `debuguear`, `regresión`, `error en`, `no funciona`, `está rompiendo`, GitHub label `bug`.
- **`hotfix`** — all signals of `fix` PLUS urgency markers (`hotfix`, `urgente`, `crítico`, `production down`, `usuarios afectados`) AND scope ≤2 files (inferred from Phase 0b Step 1) AND single causal site described by operator.

**Operator override:** the operator can force a classification by saying so directly. E.g., `@th-orchestrator this is a hotfix:` forces `type: hotfix`.

**Architect re-classification (operator-in-loop):** during Phase 1, if the architect determines the bug is actually a missing feature, the architect emits `type_reclassify: true` and a 1-line rationale in its status block. The th-orchestrator surfaces both the rationale and the AC list to the operator for decision. The architect does not auto-route.

### Multi-bug requests

Routes through existing `plan-and-execute` flow. Each bug is one sub-task in `01-planning.md`; each sub-task dispatches as its own worktree running the full bug-fix pipeline via Multi-Task Orchestration. No new batch-bug-fix path is created.

### KG process-insight semantics for bugs

`agents/th-orchestrator.md` Phase 6 reuses the existing `process-insight` schema. Content shifts semantically: the observation describes the **failure mode learned**, not the feature shipped. Example good capture: `nestjs-typeorm-decimal-stringification — TypeORM returns decimal columns as strings; arithmetic on the returned value produces string concatenation. Discovered while fixing aggregation-totals-mismatch in zippy-commission-api.`

---

## Hotfix sub-flow (type: hotfix)

The Hotfix sub-flow is a tighter variant of the Bug-fix Flow for trivially scoped defects with urgency markers. **Phase 1 (Root-Cause Analysis) is skipped entirely** — no architect dispatch, no `01-root-cause.md`. Everything else from the Bug-fix Flow is preserved, including Phase 2.0 (mandatory regression test), Phase 4 delivery routing (`### Fixed` CHANGELOG, `fix(area): ... (hotfix)` PR title), and Phase 6 (KG save). The Phase 4 PR title appends `(hotfix)` to signal urgency to the reviewer.

### Skipped phases (relative to type: fix)

- Phase 1 — no architect dispatch, no `01-root-cause.md`.

### Modified phases

- Phase 0b — bug-report intake same as `type: fix`, but the AC list is tighter (typically only AC-1 reproduction-no-longer-bug and AC-2 regression-test-exists).
- Phase 1.5 and 1.6 — still run. Plan ratification + plan review operate against the regression test + task list + 1-sentence prose plan emitted by the th-orchestrator inline at STAGE-GATE-1. plan-reviewer Rules 7 + 8 still apply.
- STAGE-GATE-1 — uses a tighter STOP block with a one-sentence prose plan from the th-orchestrator.

### Unchanged from `type: fix`

- Phase 2.0 (Regression Test) — **still mandatory**. The operator override "regression test is mandatory always" applies to hotfixes too.
- Phase 2 (Implementation) — scope-discipline contract still applies.
- Phase 3 (Verify) — `security` agent still runs always (defense-in-depth override).
- Phase 3.5 (Acceptance Gate) — same.
- Phase 3.6 (Acceptance Check) — already skipped by existing gate for hotfix + single-file fix.
- STAGE-GATE-2 — irrelevant in practice (hotfix is typically 1 PR / 1 round).
- Phase 4 (Delivery) — same `### Fixed` routing; PR title gains `(hotfix)` suffix.
- Phase 4.5 (Internal Review) — already skipped by existing gate for hotfix + single-file fix.
- STAGE-GATE-3 — always mandatory.
- Phases 5 (GitHub Update) and 6 (KG Save) — same.

### Session-docs artifact set (type: hotfix)

Every artifact required by `type: fix` is also required by `type: hotfix`, **with one exception**: `01-root-cause.md` is omitted (Phase 1 skipped). `01-plan.md` is **still produced** (§ Task List minimum: 4-line task list — reproduce, regression test, fix, verify). All other artifacts in the table above for `type: fix` are produced for `type: hotfix` too — `01-plan.md § Plan Review`, `02-regression-test.md`, `02-implementation.md`, `03-testing.md`, `04-validation.md`, `04-security.md`, `00-state.md § Delivery`, `04-validation.md § Drift Analysis`.

### Operator-facing surface

v1 detects hotfix by keyword in natural language (auto-classification + operator override). The `/hotfix` slash command is deferred to v2.

---

## Security-Sensitive Flow (extended)

1. Design is mandatory with extended security analysis
2. Phase 3 launches `security` agent in parallel with tester+qa (automatic — triggered by `security-sensitive: true`)
3. Critical/High findings block delivery → iterate with implementer (Case D)
4. Medium/Low/Info findings are warnings in delivery report, do NOT block
5. If any security risk unresolved after max iterations → document in `04-security.md` and proceed

---

## Database Changes Flow

1. Design must include migration strategy
2. Implementation must include migration files
3. Validation must verify migration safety and rollback
4. Delivery must document rollback procedure

---

## Refactor Flow

When `type: refactor`:

1. **Specify** — ACs focus on `VERIFY:` format (same API, same behavior, improved structure)
2. **Design** — architect focuses on target structure, not new features. The single-file output contract applies: `01-plan.md` (pipeline_version 2). Per-PR ACs in refactor mode use the `VERIFY:` format predominantly rather than Given/When/Then — both formats are accepted by the `plan-reviewer` Rule 2 regex.
3. **Implement** — implementer receives: "This is a refactor. Do NOT change behavior. Existing tests are your contract. Only change structure/organization. Per-PR scope from `01-plan.md` (§ Task List) `Files:` field still applies."
4. **Verify** — tester runs **existing tests first** before writing new ones. If existing tests fail → the refactor broke something. New tests only for structural improvements (e.g., new module boundaries).
5. **Delivery** — as normal, gated by STAGE-GATE-3.

The key difference: existing passing tests are the safety net. If they break, the refactor is wrong. **The 3-stage gates still apply**: STAGE-GATE-1 (human approves the refactor plan), STAGE-GATE-2 between PRs in autonomous-skippable interactive mode, STAGE-GATE-3 before push.

---

## Test Pipeline Flow

A dedicated pipeline for achieving **80% branch coverage service-wide**. Decomposes a service into modules, dispatches tester agents in parallel, and iterates until the coverage gate is met.

**Entry:** `/test-pipeline [path] [--skip-security] [--modules x,y] [--coverage-only]`

### Phase 0 --- Analyze & Decompose

**Owner:** th-orchestrator

1. **Resolve target** --- use service path from skill (or cwd). Validate it contains source code.
2. **Detect stack** --- read `package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, etc. Detect test framework from config files (`jest.config.*`, `vitest.config.*`, `pytest.ini`, etc.).
3. **Scan module boundaries** --- scan the `src/` (or equivalent) directory for top-level domains/modules. A "module" is a top-level directory containing business logic (services, controllers, repositories, components). Exclude:
   - Infrastructure directories (`config/`, `utils/`, `common/`, `shared/`, `types/`, `interfaces/`)
   - Generated code (`generated/`, `__generated__/`, `prisma/client/`)
   - Entry points (`main.ts`, `app.ts`, `index.ts` at root level)
4. **Detect existing coverage** --- check for existing test files, coverage reports, and coverage configuration.
5. **Identify shared code** --- `utils/`, `common/`, `shared/` directories. Treat as their own test task if they contain non-trivial logic.
6. **Detect missing test infra** --- check for `mocks/` or `factories/` directory, test setup file.
7. **Module sizing** --- if a module has >20 source files, split into sub-modules.
8. **Produce task list:**

   | Type | Task | Round | Dependencies |
   |------|------|-------|-------------|
   | BLOCKER | Coverage exclusions config | 1 | none |
   | BLOCKER | Test infrastructure setup (conditional) | 1 | none |
   | PARALLEL | Test module: {module-A} | 2 | Round 1 |
   | PARALLEL | Test module: {module-B} | 2 | Round 1 |
   | PARALLEL | Test module: shared/utils | 2 | Round 1 |

9. **If `--modules` flag provided** --- skip decomposition, create tasks only for specified modules.
10. **Write session-docs:**
    - `session-docs/test-pipeline/00-state.md` --- initial pipeline state
    - `session-docs/test-pipeline/batch-progress.md` --- task table (reusing multi-task format)

### Phase 1 --- Blocker Round

**Owner:** th-orchestrator dispatches, tester agent executes

**These tasks MUST complete before any parallel test task starts.**

#### Task 1A: Coverage Exclusions Config (always runs)

Invoke tester with:
```
Test-Pipeline Task:
- Mode: coverage-config
- Feature: test-pipeline-coverage-config
- Service path: {path}
- Stack: {detected framework}
- Instruction: Configure the project's coverage tool to exclude non-testable files.
  Exclude: config files, entry points, type definitions, constants/enums,
  barrel exports, migrations, test files, generated code, static assets.
  Read existing coverage config first --- extend, never overwrite.
  Write session-docs summary when done.
```

#### Task 1B: Test Infrastructure Setup (conditional --- only if missing)

Only created if Phase 0 detected the project lacks a `mocks/`/`factories/` directory or test setup file.

Invoke tester with:
```
Test-Pipeline Task:
- Mode: test-infra
- Feature: test-pipeline-test-infra
- Service path: {path}
- Stack: {detected framework}
- Instruction: Set up foundational test infrastructure.
  Create mocks directory with index, create common test utilities,
  create test setup file if missing.
  Do NOT write any module-specific tests --- only shared infrastructure.
  Write session-docs summary when done.
```

**Dispatch rules:**
- If both 1A and 1B exist → dispatch in parallel (they are independent)
- If only 1A → run in current session (no worktree needed)
- Wait for ALL blocker tasks to complete before Phase 2

### Phase 2 --- Parallel Test Round

**Owner:** th-orchestrator dispatches via Multi-Task Orchestration

**Reuses existing parallel dispatch mechanism:** worktrees + tmux, max 5 concurrent, eager slot-filling, Stop hooks + inotifywait.

#### Per-module task payload

Invoke tester with:
```
Test-Pipeline Task:
- Mode: module-test
- Feature: test-pipeline-{module-name}
- Module: {module-name}
- Module path: {path to module directory}
- Service path: {service root}
- Stack: {detected framework}
- Coverage target: aim for >= 85% branch coverage per module (overshot intentionally --- the service-wide gate is 80% and rounding/overlap means per-module must exceed 80% to guarantee the aggregate passes)
- Skip security: {true/false from --skip-security flag}
- Instruction:
  1. TESTER PHASE: Write comprehensive tests for all files in {module path}.
     Use factory pattern for mocks. Cover the module's behavior systematically
     (happy paths, error cases, edge cases, input validation).
     Follow existing test patterns. No AC to map --- cover source files.
  2. QUALITY CHECK: After tests pass, run coverage for this module only.
     Report: files tested, branch coverage %, uncovered branches.
  3. SECURITY SCAN (unless skip-security): Review the module's source files
     for security issues. Check: injection risks, auth boundary violations,
     secrets handling, input validation gaps, unsafe data access patterns.
     Report findings with file:line references.
  4. Write session-docs summary to session-docs/test-pipeline-{module-name}/03-testing.md
```

#### Branching

All Round 2 module tasks branch from the same base (commit where Round 1 completed). No inter-module dependency.

#### Dispatch mechanics

Reuse Multi-Task Orchestration Steps 1-6 exactly:
- `batch-progress.md` already created in Phase 0
- All module tasks have dispatch label `PARALLEL`
- Launch via `claude --worktree {module-name} --tmux --dangerously-skip-permissions` with Stop hooks
- `inotifywait` (or poll fallback) for completions
- Eager slot-filling when a module completes

#### Internal fix loop

Each tester agent has its own fix loop (max 3 attempts). If a module fails after 3 internal attempts, it reports `status: failed`. The th-orchestrator records it in `batch-progress.md` but does NOT re-launch automatically.

#### Gap iteration (re-launched from Phase 3)

When Phase 3 sends tasks back:
- Only re-launch modules with coverage gaps
- The tester receives specific context: "these files/functions need more tests on these uncovered branches"
- Do NOT re-test files that already have adequate coverage

### Phase 3 --- Coverage Gate

**Owner:** th-orchestrator

**⚠️ THE 80% BRANCH COVERAGE GATE IS NON-NEGOTIABLE. 79.99% IS A FAILURE. THERE IS NO "CLOSE ENOUGH".**

**Rules:**
- 78.99% = FAIL → iterate
- 79.5% = FAIL → iterate
- 79.99% = FAIL → iterate
- 80.00% = PASS
- Do NOT proceed to Phase 4 unless coverage >= 80% OR max iterations (3) exhausted
- Do NOT rationalize that "it's close enough" — the gate is binary: >= 80% or iterate

1. **Collect results** --- read all `session-docs/test-pipeline-{module}/03-testing.md` files. Extract: module name, tests created, tests passing, branch coverage %, security findings.

2. **Run coverage service-wide** --- execute the project's test coverage command across the ENTIRE test suite:
   ```bash
   # For Jest:
   npx jest --coverage --coverageReporters=json-summary
   # For Vitest:
   npx vitest run --coverage --reporter=json
   # Read the JSON summary to get the exact branch coverage percentage
   ```
   **CRITICAL:** Read the actual coverage output. Parse the branch coverage number. Compare it numerically against 80. Do NOT eyeball it or approximate.

3. **Evaluate gate (STRICTLY):**

   | Condition | Action |
   |-----------|--------|
   | branch coverage >= 80.00% | PASS --- proceed to Phase 4 |
   | branch coverage < 80.00% AND iteration < 3 | FAIL --- Gap Analysis → re-launch Phase 2 |
   | branch coverage < 80.00% AND iteration = 3 | BLOCKED --- proceed to Phase 4 with BLOCKED status, report to user that manual intervention is needed |

   **There is no fourth option. "Close to 80%" is not a pass.**

4. **Gap Analysis** (MANDATORY when < 80%):
   a. Parse the coverage report (JSON summary or detailed report) to identify EXACTLY which files have uncovered branches
   b. Group uncovered branches by module
   c. Prioritize: files with most uncovered branches first, focus on files where small effort yields biggest coverage gain
   d. Calculate how many more branches need coverage to cross 80%: `needed = (0.80 * total_branches) - covered_branches`
   e. Generate new tasks ONLY for modules with gaps, including specific context:
      - Which files need more tests (with exact uncovered branch counts)
      - Which functions/methods have uncovered branches
      - What kind of tests are likely needed (error paths, edge cases, early returns, null checks)
   f. Update `batch-progress.md` with new gap tasks
   g. Increment iteration counter in `00-state.md`
   h. Report to user: "Coverage at {N}%, need {M} more branches covered. Iterating ({iter}/3)."
   i. Return to Phase 2 with gap-specific tasks

5. **Report to user:**
   ```
   Coverage Gate: {N}% branches (target: 80%)
   Status: PASS | ITERATING ({N}/3) — need {M} more branches | BLOCKED
   Modules with gaps: {list with uncovered branch counts}
   ```

### Phase 4 --- Consolidation & Report

**Owner:** th-orchestrator

1. **Merge per-module results** --- aggregate: tests created, tests passing, coverage, security findings from all `03-testing.md` files.

2. **Security consolidation** --- merge all per-module security findings:
   - Deduplicate findings across modules
   - Sort by severity (Critical > High > Medium > Low > Info)
   - Flag cross-module patterns (e.g., "3 modules have unvalidated input")

3. **Write final report** to `session-docs/test-pipeline/05-consolidation.md`:
   ```markdown
   # Test Pipeline: {service-name}
   **Date:** {date}
   **Service:** {path}
   **Stack:** {framework}

   ## Coverage Summary
   | Metric | Value | Target | Status |
   |--------|-------|--------|--------|
   | Branch coverage | {N}% | 80% | MET / BLOCKED |
   | Statement coverage | {N}% | --- | --- |
   | Files covered | {N}/{total} | --- | --- |
   | Tests created | {N} | --- | --- |
   | Tests passing | {N}/{total} | --- | --- |
   | Iterations | {N}/3 | --- | --- |

   ## Per-Module Results
   | Module | Tests | Passing | Branch Cov | Security | Status |
   |--------|-------|---------|-----------|----------|--------|
   | {module} | {N} | {N} | {N}% | {N} findings | DONE/PARTIAL/FAILED |

   ## Security Findings
   | Severity | Count | Modules Affected |
   |----------|-------|-----------------|
   | Critical | {N} | {list} |
   | High | {N} | {list} |
   | Medium | {N} | {list} |

   ### Details
   - **[{Severity}]** {finding} --- {file:line} --- {remediation}

   ## Coverage Gaps (if BLOCKED)
   | File | Uncovered Branches | Module | Priority |
   |------|-------------------|--------|----------|
   | {file} | {description} | {module} | HIGH/MEDIUM/LOW |

   ## Failed Modules
   | Module | Error | Recommendation |
   |--------|-------|---------------|
   | {module} | {error summary} | {what to do} |

   ## Recommendations
   1. {prioritized next step}
   ```

4. **Cleanup:**
   - Remove worktrees: `git worktree remove {path}` for completed worktrees
   - Clean results: `rm -rf /tmp/batch-results/`
   - Do NOT auto-remove failed worktrees

5. **Update `00-state.md`** --- mark pipeline as `completed` (if MET) or `blocked` (if BLOCKED).

6. **Report to user:**
   ```
   Test Pipeline: {status}
   Coverage: {N}% branches (target: 80%)
   Tests: {N} created, {N} passing
   Security: {N} findings ({breakdown by severity})
   Iterations: {N}/3
   Report: session-docs/test-pipeline/05-consolidation.md
   ```

### Session-docs structure

```
session-docs/
  test-pipeline/                        # th-orchestrator coordination
    00-state.md                         # pipeline checkpoint
    00-execution-events.jsonl           # event trace (th-orchestrator only, local mode)
    00-execution-events.md              # event trace (th-orchestrator only, obsidian mode)
    01-plan.md                          # service analysis & task list (§ Review Summary + § Task List)
    batch-progress.md                   # multi-task tracking
    05-consolidation.md                 # final merged report
  test-pipeline-coverage-config/        # Round 1 blocker
    00-execution-events.jsonl           # local mode
    00-execution-events.md              # obsidian mode
    03-testing.md
  test-pipeline-test-infra/             # Round 1 blocker (conditional)
    00-execution-events.jsonl           # local mode
    00-execution-events.md              # obsidian mode
    03-testing.md
  test-pipeline-{module-name}/          # Round 2 per-module (one per module)
    00-execution-events.jsonl           # local mode
    00-execution-events.md              # obsidian mode
    03-testing.md
```

### Key rules

- **80% branch coverage is non-negotiable** --- iterate until met or max 3 loops
- Blocker tasks (Round 1) MUST complete before any module test task
- Each module gets its own worktree --- no mixing
- Coverage gate runs the ENTIRE test suite, not per-module
- Failed modules are reported, not auto-retried
- If `--coverage-only` flag: skip Phase 2, run only Phase 1 + consolidated coverage measurement

---

## Documentation Flow

When the user asks to document a service, database, API, library, infrastructure, or product — typically via `/docs` or conversational requests like "documenta en obsidian el servicio X", "document the auth service", "genera documentación del API de pagos".

### Phase 0 — Intake

1. **Read vault config** — read `~/.claude/config/obsidian-vaults.json`. If missing, stop and ask the operator for the vault path. If a `--vault` flag was passed, use that vault entry; otherwise use the `default` vault.
2. **Parse topics** — extract what to document. Multi-topic detection: commas, "and"/"y", or enumerated lists produce multiple doc tasks.
3. **Parse language** — `--lang <code>` flag or explicit language request. Default: `en`. The language applies to all prose in the documentation; structural elements (YAML keys, Mermaid syntax, code blocks) remain in English.
4. **Parse folder** — `--folder <name>` flag or derived from topic name (kebab-case).
5. **Classify doc subject** per topic: `service` | `database` | `api` | `library` | `infrastructure` | `product`. This classification guides the architect's research scope and the documenter's page structure.
6. **Prepare spec context** with: topics, vault path, folder, language, subject classification per topic. This context is passed inline to the architect dispatch; the architect incorporates it into `01-plan.md` § Review Summary.
7. **Write initial `00-state.md`** — `type: docs`, `phase: 0`.

### Phase 1 — Research (per topic)

Invoke `architect` in **research mode** with explicit scope per subject classification:

| Subject | Architect Research Scope |
|---------|--------------------------|
| `service` | Source code, CLAUDE.md, README, CHANGELOG, docs/, API endpoints, config, architecture |
| `database` | Migrations, schema files, models/entities, ER relationships, indexes, access patterns |
| `api` | Route definitions, OpenAPI spec, middleware, request/response types, auth, error handling |
| `library` | Public API surface, exports, usage patterns in codebase, package metadata |
| `infrastructure` | Dockerfile, docker-compose, CI/CD workflows, deploy scripts, env vars, monitoring |
| `product` | All of the above — full-scope investigation |

Instruction to architect: "Research mode. Investigate {topic} for documentation purposes. Produce `00-research.md` covering architecture, components, data flows, configuration, and key decisions. The output will be consumed by the documenter agent — be thorough but structured."

**Multi-topic:** if 2+ topics, dispatch one architect research per topic in parallel (separate session-docs subfolders or sequential research rounds into the same `00-research.md` with clear section separation).

Output: `00-research.md` in `session-docs/{feature-name}/`.

### Phase 2a — Write

Invoke `documenter` with the research findings and metadata:

```
Task context:
- research: session-docs/{feature-name}/00-research.md
- vault_path: {from Phase 0}
- folder: {from Phase 0}
- language: {from Phase 0}
- subject: {classification from Phase 0}
```

The documenter:
1. Reads `00-research.md`
2. Plans the page set (index + sub-pages based on subject classification)
3. Writes all pages to the vault folder with diagram-first layout
4. Writes `02-documentation.md` manifest listing all pages, diagram counts, and Excalidraw/Canvas dispatch requests

Output: Obsidian vault pages + `session-docs/{feature-name}/02-documentation.md`.

### Phase 2b — Diagrams (conditional)

Read `02-documentation.md`. If the manifest lists Excalidraw or Canvas dispatch requests:

- **Excalidraw requests:** dispatch `diagrammer` (Excalidraw agent) per flagged page. Input: the `00-research.md` section relevant to the diagram + the target path in the vault. The diagrammer writes `.excalidraw.md` files directly to the vault folder.
- **Canvas requests:** dispatch canvas creation using the json-canvas skill pattern. Input: the page structure from the manifest + node/edge relationships. Output: `.canvas` file in the vault folder.

If no external diagram requests, skip Phase 2b.

**Multi-topic parallel:** when documenting multiple topics, each topic's Phase 2a + 2b runs independently. If worktrees are available, dispatch in parallel.

### Phase 3 — Review

Invoke `qa` in validation mode. The QA agent reads `00-research.md` (the source of truth) and the vault folder (the output) and validates:

| Check | Criterion | Verdict |
|-------|-----------|---------|
| **Coverage** | Every major section in `00-research.md` has a corresponding doc page | PASS / FAIL |
| **Navigation** | Index page exists with wikilinks to all sub-pages | PASS / FAIL |
| **Diagram density** | Every page has at least 1 diagram (Mermaid or Excalidraw embed) | PASS / FAIL |
| **Diagram-first layout** | Diagrams appear before their explanatory text | PASS / FAIL |
| **Cross-links** | All `[[wikilinks]]` resolve to real pages in the folder | PASS / FAIL |
| **Language** | All prose matches the specified language | PASS / FAIL |
| **Frontmatter** | Every page has valid YAML frontmatter with tags and aliases | PASS / FAIL |
| **No orphan text** | No section longer than 5 paragraphs without a visual | PASS / FAIL |

Output: `04-validation.md` with per-check verdict + overall PASS/FAIL.

### DOC-GATE — Human Checkpoint

Present to the operator:

```
Documentation complete: {topic(s)}
Vault: {path}
Folder: {folder name}
Pages: {count} | Diagrams: {inline + external count}
QA: {PASS or FAIL with details}

Options:
1. Approve — documentation is complete
2. Revise — {specific feedback} → documenter iterates on flagged pages
```

If **revise**: feed the operator's feedback + QA findings back to the documenter for targeted page updates. Max 3 iteration rounds. After each iteration, re-run QA (Phase 3) on the updated pages only.

If **approve**: write `00-state.md` with `status: complete`.

### Multi-Topic Orchestration

When 2+ topics are detected at Phase 0:

```
Phase 0:  Parse all topics + shared metadata (vault, language)
Phase 1:  Architect researches each topic (parallel if worktrees available)
Phase 2a: Documenter writes each topic (parallel if worktrees available)
Phase 2b: Diagram dispatch per topic (parallel)
Phase 3:  QA validates ALL topics together (cross-topic wikilinks, consistent style)
DOC-GATE: Single gate for all topics
```

Each topic gets its own session-docs subfolder pattern: `session-docs/docs-{topic-name}/`. The QA phase validates across all topics to ensure consistency.

### Session-docs for documentation pipeline

```
session-docs/{feature-name}/
  00-state.md              # Pipeline state (type: docs)
  01-plan.md               # Topics, vault, folder, language, subject classification (§ Review Summary) + task breakdown (§ Task List)
  00-research.md           # Architect research findings
  02-documentation.md      # Documenter manifest (pages, diagrams, dispatch requests)
  04-validation.md         # QA validation report
```

### Direct mode (for other agents)

Other agents or top-level Claude can invoke the documenter directly without the full pipeline, when research is already available:

```
Task(subagent_type=documenter, prompt="
  Research file: {path to research or structured input}
  Vault path: {vault path}
  Folder: {folder name}
  Language: {en|es|...}
  Subject: {service|database|api|library|infrastructure|product}
")
```

This skips Phases 0, 1, 3 and the DOC-GATE. The caller is responsible for research quality and review.

---

## User-Initiated Simple Mode

**Only the user can request simple mode.** The th-orchestrator NEVER auto-classifies as simple.

When the user explicitly says "simple", "just implement", "skip design", "no tests needed", or equivalent:

1. **Acknowledge** the skip: "Skipping {phase} as requested."
2. **Skip only what was requested:**
   - "skip design" → skip Phase 1 (Design), proceed from Specify → Implement
   - "skip tests" → skip tester in Phase 3, still run qa
   - "just implement" → skip Design + Verify, proceed from Specify → Implement → Delivery
   - "simple" → skip Design, still run Verify (tests + qa)
3. **Never skip Specify (Phase 0b)** — the spec is always needed, even for simple tasks
4. **Never skip Delivery (Phase 4)** — every change needs a branch, commit, and PR
5. **Log the skip** in `00-state.md` under Hot Context: "User requested skip: {what was skipped}"
