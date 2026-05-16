---
name: ref-special-flows
description: Reference file for orchestrator special flows (research, spike, plan, parallel dispatch, refactor, simple). Read on-demand by the orchestrator — not a standalone agent.
model: opus
color: cyan
---

# Orchestrator — Special Flows Reference

This file is read on-demand by the orchestrator when executing a special flow. It is NOT part of the orchestrator's system prompt.

---

## Research Flow

When the user asks to investigate, compare technologies, evaluate a migration, or study an approach:

1. **Intake** — classify as `research`
2. **MANDATORY — Query KG** — call `search_nodes` with 1-2 semantic queries. Write `00-knowledge-context.md` if results found. If ChromaDB MCP fails, log "KG: unavailable" and continue.
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
4. **Write minimal `00-task-intake.md`** — just: description, what to test, success criteria
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
   - Formalize: create GitHub issue via `gh issue create` using **SDD template** — include spike findings in Technical Context. Ask: "Issue created. Run full pipeline now?"
   - Discard: `git checkout -- .` to revert (confirm with user first). Clean up session-docs.
   - Investigate: continue as directed.

---

## Plan Flow

Two modes: `plan` (analysis only) and `plan-and-execute` (analysis + full pipeline per task).

**Distinction from normal pipeline mode.** Plan flow's architect output is `01-planning.md` — a task breakdown for **multi-task batch orchestration** across worktrees, with dispatch labels (BLOCKER / PARALLEL / CONVERGENCE / SEQUENTIAL) and size estimates. This is structurally different from `02-task-list.md`, which the architect produces in **normal pipeline mode** (single-feature, sequential PRs, per-PR ACs in Given/When/Then). The two files coexist for different consumers:

| File | Mode | Consumer | Purpose |
|---|---|---|---|
| `01-planning.md` | planning mode (`/plan`, `/plan plan-and-execute`) | orchestrator (multi-task dispatch) | break a broad scope into N parallel tasks |
| `02-task-list.md` | design mode (normal pipeline) | implementer + qa + plan-reviewer | list of sequential PRs with per-PR ACs |

Inside each task dispatched by `plan-and-execute`, the child orchestrator runs the full single-feature pipeline (Stage 1 → STAGE-GATE-1 → Stage 2 → STAGE-GATE-2 between PRs → Stage 3 → STAGE-GATE-3), which DOES produce its own `02-task-list.md` for that task's PRs. The parent batch orchestrator gates at task boundaries via the multi-task progress tracker — it does NOT additionally fire STAGE-GATE-1/2/3 at the batch level. **No double-gating.**

### Planning phase (both modes)

1. **Intake** — classify as `plan` or `plan-and-execute`. Do NOT move GitHub issues to "In Progress" yet.
2. **MANDATORY — Query KG** — call `search_nodes` with 2-3 semantic queries. Write `00-knowledge-context.md` if results found.
3. **Specify** — full SPECIFY as normal (codebase investigation, AC, scope). Update GitHub issue if `needs-specify: true`.
4. **Design (planning mode)** — invoke `architect` in planning mode. Architect produces task breakdown in `01-planning.md`. **Does NOT produce `02-task-list.md`** — that file belongs to design mode.
5. **Validate sizing** — read `01-planning.md`. If any task has >20 AC or looks like a full feature, re-invoke architect to split. Max 1 retry.
6. **Create tasks** — check `gh auth status`:
   - **gh available:** create one GitHub issue per task via `gh issue create` using **SDD issue template**. Labels from repo (`gh label list`), assignee `@me`, project board if exists. Comment on parent issue.
   - **gh unavailable:** write each task as markdown in `session-docs/{feature-name}/tasks/`.
7. **Report** created tasks to user.

**Mode: `plan`** → STOP after reporting.

**Mode: `plan-and-execute`** → proceed to Parallel Dispatch (see below).

---

## Parallel Dispatch Flow (DEFAULT for 2+ tasks)

Parallel dispatch is defined in the orchestrator's **Multi-Task Orchestration** section. It is the **default behavior** whenever the orchestrator has 2+ tasks, regardless of entry point.

**Entry points that lead here:**
- `/plan plan-and-execute` → architect produces task breakdown → dispatch
- `/issue #1 #2 #3` → multiple issues → dispatch
- User requests batch/parallel work → orchestrator runs Specify + Design (planning mode) → dispatch
- Orchestrator identifies broad scope needing breakdown → auto plan-and-execute → dispatch

When multiple tasks exist:
1. The orchestrator reads `01-planning.md` for dependency info (if available) or analyzes dependencies itself
2. Follows the **Multi-Task Orchestration** flow (dependency analysis → rounds → hooks + inotifywait → event-driven monitoring)
3. Each worktree runs a full pipeline via `/issue #{number}`

### Branching strategy

Tasks in later rounds depend on code from earlier rounds. Use **branch-from-parent**:
- Round 1 tasks branch from `main`
- Round 2 tasks branch from Round 1's feature branch (not main)
- When Round 1's PR merges, Round 2's PRs auto-rebase cleanly

This mirrors how human teams work with dependent features.

---

## Hotfix Flow

Same full pipeline as any other development task (Specify → Design → Implement → Verify → Delivery). The only difference: Design can be shorter (focus on the fix, not full architecture). Iteration still applies if tests fail.

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
2. **Design** — architect focuses on target structure, not new features. The dual-output contract still applies: `01-architecture.md` AND `02-task-list.md` (pipeline_version 2). Per-PR ACs in refactor mode use the `VERIFY:` format predominantly rather than Given/When/Then — both formats are accepted by the `plan-reviewer` Rule 2 regex.
3. **Implement** — implementer receives: "This is a refactor. Do NOT change behavior. Existing tests are your contract. Only change structure/organization. Per-PR scope from `02-task-list.md` `Files:` field still applies."
4. **Verify** — tester runs **existing tests first** before writing new ones. If existing tests fail → the refactor broke something. New tests only for structural improvements (e.g., new module boundaries).
5. **Delivery** — as normal, gated by STAGE-GATE-3.

The key difference: existing passing tests are the safety net. If they break, the refactor is wrong. **The 3-stage gates still apply**: STAGE-GATE-1 (human approves the refactor plan), STAGE-GATE-2 between PRs in autonomous-skippable interactive mode, STAGE-GATE-3 before push.

---

## Test Pipeline Flow

A dedicated pipeline for achieving **80% branch coverage service-wide**. Decomposes a service into modules, dispatches tester agents in parallel, and iterates until the coverage gate is met.

**Entry:** `/test-pipeline [path] [--skip-security] [--modules x,y] [--coverage-only]`

### Phase 0 --- Analyze & Decompose

**Owner:** Orchestrator

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
    - `session-docs/test-pipeline/00-task-intake.md` --- service path, stack, module list, task list, coverage baseline
    - `session-docs/test-pipeline/00-state.md` --- initial pipeline state
    - `session-docs/test-pipeline/batch-progress.md` --- task table (reusing multi-task format)

### Phase 1 --- Blocker Round

**Owner:** Orchestrator dispatches, tester agent executes

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

**Owner:** Orchestrator dispatches via Multi-Task Orchestration

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

Each tester agent has its own fix loop (max 3 attempts). If a module fails after 3 internal attempts, it reports `status: failed`. The orchestrator records it in `batch-progress.md` but does NOT re-launch automatically.

#### Gap iteration (re-launched from Phase 3)

When Phase 3 sends tasks back:
- Only re-launch modules with coverage gaps
- The tester receives specific context: "these files/functions need more tests on these uncovered branches"
- Do NOT re-test files that already have adequate coverage

### Phase 3 --- Coverage Gate

**Owner:** Orchestrator

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

**Owner:** Orchestrator

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
  test-pipeline/                        # orchestrator coordination
    00-state.md                         # pipeline checkpoint
    00-execution-log.md                 # all agents append
    00-task-intake.md                   # service analysis & task list
    batch-progress.md                   # multi-task tracking
    05-consolidation.md                 # final merged report
  test-pipeline-coverage-config/        # Round 1 blocker
    00-execution-log.md
    03-testing.md
  test-pipeline-test-infra/             # Round 1 blocker (conditional)
    00-execution-log.md
    03-testing.md
  test-pipeline-{module-name}/          # Round 2 per-module (one per module)
    00-execution-log.md
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

## User-Initiated Simple Mode

**Only the user can request simple mode.** The orchestrator NEVER auto-classifies as simple.

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
