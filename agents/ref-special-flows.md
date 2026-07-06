---
name: ref-special-flows
description: Reference file for orchestrator special flows (research, spike, plan, parallel dispatch, refactor, docs, simple). Read on-demand by the orchestrator — not a standalone agent.
model: opus
color: cyan
---

# orchestrator — Special Flows Reference

This file is read on-demand by the orchestrator when executing a special flow. It is NOT part of the orchestrator's system prompt.

**LAZY-LOAD DIRECTIVE — consumers read only the section they need.** Do NOT read this entire file on every invocation. Locate the top-level section heading for the active flow (e.g., Bug-fix Flow, Research Flow, Docs Flow) and read only that section. Load additional sections only when the flow cross-references them explicitly. Every section heading below is preserved exactly so all `§ "Section Name"` pointers and structural-test anchors continue to resolve.

---

## Research Flow

When the user asks to investigate, compare technologies, evaluate a migration, or study an approach:

1. **Intake** — classify as `research`
2. **MANDATORY — Query KG** — call `search_nodes` with 1-2 semantic queries. Write `00-knowledge-context.md` if results found. If the Knowledge Graph MCP fails, log "KG: unavailable" and continue.
3. **Fan-out web research (parallel haiku lanes)** — dispatch N `researcher` (haiku) agents in parallel (default N=3, hard cap 5). Each lane receives a distinct search angle and the structured findings contract:
   - Compose N distinct angles for the topic (e.g., `official-docs`, `benchmarks`, `known-issues`, `migration-guides`, `community-adoption`). Cap at 5.
   - Dispatch each `researcher` with: `angle`, `topic`, `relevance_criteria`, and a per-lane `findings_file` path (`workspaces/{feature}/research/research-findings-{angle}.md`).
   - Run all N lanes concurrently using the existing concurrent-`Task` pattern.
   - **Fail-open lane handling:** gate on each lane's status block. If a lane returns `status: failed` or `findings: 0`, record a `research.lane.skipped` event in `{events_file}` and continue with the remaining lanes. The flow never blocks on a single dead lane.
4. **Consolidate** — dispatch `research-consolidator` (sonnet) with the list of findings files, the topic, and output path `workspaces/{feature}/research/00-research.md`. The consolidator deduplicates claims, surfaces `### Conflicting sources` explicitly (never silently picks a winner), and produces consolidated cited findings.
5. **Invoke `architect` in research mode** — explicitly instruct: "This is a research task. Pre-digested consolidated findings are in `workspaces/{feature}/research/00-research.md` — read that file as your primary evidence base instead of running raw web searches. You may spot-fetch to fill specific gaps the consolidator flagged, but the bulk of web search has already been done. Produce your research analysis report, appending your synthesis and recommendation to `research/00-research.md`."
6. **Skip Phases 2-5** (no implementation, testing, validation, or delivery)
7. **Present** the research report to the user
8. **Ask** the user how to proceed (implement, discard, or investigate further)
9. **Act on user's choice:**
   - **Implement:** reclassify the pipeline and re-enter the full pipeline with all gates:
     a. Determine the new type: `refactor` if the research identified structural changes to existing code; `feature` if it identified new functionality to build.
     b. Append reclassification event: `{"ts":"<ISO>","event":"pipeline.reclassify","from":"research","to":"<new_type>","reason":"operator chose implement"}`.
     c. Update `00-state.md`: set `type:` to the new classification, reset `phase:` to `0b`, set `status: in_progress`. Add to Hot Context: `Reclassified from research to {type}. research/00-research.md is input context for design.`
     d. Re-enter the full pipeline at **Phase 0b (Specify)**. The `research/00-research.md` feeds the architect's design phase as prior analysis — it is NOT a substitute for `01-plan.md`.
     e. **All gates are mandatory:** STAGE-GATE-1, Phase 3 (verify), STAGE-GATE-3. The Phase Gate Prerequisites (§ Phase Checkpointing in `orchestrator.md`) enforce this mechanically.
     f. If the architect produced a `01-plan.md` during the research session (e.g., the operator asked for a plan before deciding to implement), that plan enters the normal ratification flow (Phase 1.5 → 1.6 → STAGE-GATE-1). It does NOT bypass design review.
   - **Discard:** clean up workspaces, mark pipeline as `complete` with `summary: research discarded by operator`.
   - **Investigate further — bounded gap-closure loop (orchestrator-owned):** After each consolidation+synthesis round, the orchestrator reads the `## Coverage gaps` fenced block from `research/00-research.md` and evaluates the gate:

     **Gate condition (ALL must hold):** `(≥1 gap with material:true AND web_closeable:true)` AND `research_round < 3`.

     **On gate FIRE (dispatch a follow-up round):**
     1. Increment `research_round` in `00-state.md § Current State` (starts at 1 after round 1).
     2. Emit `research.round.start` event: `{"ts":"<ISO>","event":"research.round.start","round":<N>,"lanes":<K>}`.
     3. Compose follow-up angles ONLY from gate-passing gaps (one lane per gap). Clamp to ≤ 5 lanes for the round (anti-runaway guard). If gate-passing gaps exceed 5, dispatch 5 lanes covering the most material gaps and emit `research.round.skipped` event: `{"ts":"<ISO>","event":"research.round.skipped","round":<N>,"skipped_gap_ids":[...]}`.
     4. Dispatch `researcher` (haiku) lanes in parallel (fail-open: `research.lane.skipped` on dead lanes).
     5. Re-dispatch `research-consolidator` to amend the SAME `research/00-research.md` in place (reconcile-don't-accrete — no `00-research-v2.md`).
     6. Re-dispatch `architect` in research mode to re-synthesize the SAME `research/00-research.md` in place.
     7. After architect returns, emit `research.gap.gate` event and re-evaluate the gate. Repeat from step 1 if the gate fires again AND `research_round < 3`.

     **On gate NO-FIRE (terminate loop):** Determine the termination reason:
     - `no-material-closeable-gaps` — the gaps block has no entry with both `material:true` AND `web_closeable:true`.
     - `round-cap-reached` — `research_round` has reached 3 (round 1 + at most 2 gap-closure rounds is the cost bound).
     - `all-gaps-closed` — the gaps block is `- none`.

     Emit `research.gap.gate` event: `{"ts":"<ISO>","event":"research.gap.gate","verdict":"stop","material_closeable_count":<N>,"round":<R>}`.
     Emit `research.loop.terminated` event: `{"ts":"<ISO>","event":"research.loop.terminated","reason":"<termination-reason>","round":<R>}`.

     The architect writes a mandatory `## Residual Gaps` section to `research/00-research.md` naming the termination reason and listing every still-open gap. The bounded stop is never silent.

     **Structural signals (mandatory):**
     - `research_round: N` in `00-state.md § Current State` (N = current round number; set to 1 at the start of the initial research flow).
     - `research.round.start` event at each round start.
     - `research.gap.gate` event at each gate evaluation (both `verdict: loop` on fire and `verdict: stop` on no-fire).
     - `research.round.skipped` event when gate-passing gaps exceed the per-round lane cap of 5 (the dispatch is clamped and the event makes the clamp observable).
     - `research.loop.terminated` event with the termination reason.

     **Operator-initiated investigation:** if the operator asks to investigate further at any point after the loop has terminated, re-invoke architect in research mode with the operator's refined scope, amending the same `research/00-research.md` in place.

---

## Research-Code Flow

When the operator asks to investigate how the codebase works, trace a flow in real files, understand a subsystem or concern across files, or research a codebase question that may also have an external-knowledge facet:

1. **Intake** — classify as `research-code` (read-only)
2. **MANDATORY — Query KG** — call `search_nodes` with 1-2 semantic queries. Write `00-knowledge-context.md` if results found. If the Knowledge Graph MCP fails, log "KG: unavailable" and continue.
3. **Decompose into code lanes via the three-strategy ladder (first applicable strategy wins):**

   | # | Strategy | When it applies | Lane = |
   |---|----------|-----------------|--------|
   | 1 | **By subsystem / directory** | The repo has clear top-level boundaries and the question spans them | One disjoint path-set per lane (e.g., lane A = `agents/`, lane B = `hooks/ + tests/`) |
   | 2 | **By concern** | The question is cross-cutting and a directory split would fragment it (e.g., "how is error-handling done?") | One concern per lane: `auth`, `data/persistence`, `error-handling`, `config`, `transport` — each lane greps the whole repo for its concern |
   | 3 | **By question facet** | The question is a single compound question ("does X cause Y, and is Z safe?") | One sub-question per lane, each scoped to the files that answer it |

   **Non-overlap rule (mandatory):** The orchestrator states each lane's boundary (its path-set or concern) explicitly in the dispatch. Boundaries MUST partition the search space — no two lanes own the same file for the same purpose. Overlap wastes sonnet spend and produces duplicate findings the consolidator then has to dedup.

   **Default scope:** current repo. **Cross-repo scope:** when the operator passes ≥2 repo paths (`--multi-repo`), repo is the outermost partition key. Each lane is scoped to ONE repo. A lane that spans two repos is only valid when the question explicitly addresses a cross-repo seam, in which case that seam is its own dedicated lane.

4. **Optionally compose ≤2 web lanes** (the existing haiku `researcher` agent) when the question has an external-knowledge facet — a library, framework, or spec the codebase consumes. These web lanes run in parallel alongside the code lanes. Hybrid = code lanes + optional web lanes. When no external-knowledge facet exists, use code lanes only.
5. **Fan-out all lanes in parallel (fail-open):**
   - Dispatch N `code-researcher` (sonnet) code lanes and up to 2 `researcher` (haiku) web lanes concurrently using the concurrent-`Task` pattern.
   - **Fail-open lane handling:** gate on each lane's status block. If a lane returns `status: failed` or `findings: 0`, record a `research.lane.skipped` event in `{events_file}` and continue with the remaining lanes. The flow never blocks on a single dead lane.
6. **Consolidate** — dispatch `research-consolidator` (sonnet) with the full list of findings files (both code-lane and web-lane paths), the topic, and output path `workspaces/{feature}/research/00-research.md`. The consolidator merges code evidence and web evidence into one document, surfaces `## Conflicting Sources` (web-vs-web), and `## Code vs Docs Conflicts` (code-vs-docs — the primary value of the hybrid approach). Never silently picks a winner.
7. **Invoke `architect` in research mode** — same instruction as the Research Flow: "This is a research task. Pre-digested consolidated findings are in `workspaces/{feature}/research/00-research.md` — read that file as your primary evidence base. Produce your research analysis report, appending your synthesis and recommendation to `research/00-research.md`."
8. **Skip Phases 2-5** (no implementation, testing, validation, or delivery)
9. **Present** the research report to the user
10. **Ask** the user how to proceed (implement, discard, or investigate further)
11. **Act on user's choice** — same options as Research Flow (implement → full pipeline reclassification; discard → clean up; investigate further → bounded gap-closure loop below).
12. **Bounded gap-closure loop (orchestrator-owned) — extended gate:** After each consolidation + synthesis round, the orchestrator reads the `## Coverage gaps` fenced block from `research/00-research.md` and evaluates the gate:

    **Gate condition (ANY must hold, AND round cap must not be reached):**
    `((≥1 gap with material:true AND web_closeable:true) OR (≥1 gap with material:true AND code_closeable:true)) AND research_round < 3`.

    **On gate FIRE (dispatch a follow-up round):**
    1. Increment `research_round` in `00-state.md § Current State` (starts at 1 after round 1).
    2. Emit `research.round.start` event: `{"ts":"<ISO>","event":"research.round.start","round":<N>,"lanes":<K>}`.
    3. Compose follow-up lanes ONLY from gate-passing gaps:
       - For each gap with `material:true AND web_closeable:true` → dispatch one `researcher` (haiku) web lane.
       - For each gap with `material:true AND code_closeable:true` → dispatch one `code-researcher` (sonnet) code lane.
       - Clamp to ≤5 lanes total for the round (anti-runaway guard). If gate-passing gaps exceed 5, dispatch 5 lanes covering the most material gaps and emit `research.round.skipped` event: `{"ts":"<ISO>","event":"research.round.skipped","round":<N>,"skipped_gap_ids":[...]}`.
    4. Dispatch web and code lanes in parallel (fail-open: `research.lane.skipped` on dead lanes).
    5. Re-dispatch `research-consolidator` to amend the SAME `research/00-research.md` in place (reconcile-don't-accrete — no `00-research-v2.md`).
    6. Re-dispatch `architect` in research mode to re-synthesize the SAME `research/00-research.md` in place.
    7. After architect returns, emit `research.gap.gate` event and re-evaluate the gate. Repeat from step 1 if the gate fires again AND `research_round < 3`.

    **On gate NO-FIRE (terminate loop):** Determine the termination reason — the same three reasons as the Research Flow:
    - `no-material-closeable-gaps` — the gaps block has no entry with both `material:true` AND either `web_closeable:true` OR `code_closeable:true`.
    - `round-cap-reached` — `research_round` has reached 3.
    - `all-gaps-closed` — the gaps block is `- none`.

    Emit `research.gap.gate` event: `{"ts":"<ISO>","event":"research.gap.gate","verdict":"stop","material_closeable_count":<N>,"material_code_closeable_count":<M>,"round":<R>}`.
    Emit `research.loop.terminated` event: `{"ts":"<ISO>","event":"research.loop.terminated","reason":"<termination-reason>","round":<R>}`.

    The architect writes a mandatory `## Residual Gaps` section to `research/00-research.md` naming the termination reason and listing every still-open gap — including code-only-residual gaps (gaps where `material:true` but neither `web_closeable` nor `code_closeable`, or gaps that code lanes tried to close but could not). The bounded stop is never silent.

    **Structural signals (mandatory):** same set as Research Flow — `research_round`, `research.round.start`, `research.gap.gate`, `research.round.skipped`, `research.loop.terminated` — all apply unchanged.

### `/th:cross-repo` boundary (explicitly distinct)

`/th:research-code --multi-repo <paths>` and `/th:cross-repo` are NOT the same:

| Dimension | `/th:research-code --multi-repo` | `/th:cross-repo` |
|-----------|----------------------------------|-----------------|
| **Purpose** | Evidence-gathering research: "what does this code actually do, across these repos?" | Flow/invariant auditor: "does this system obey its contracts and invariants?" |
| **Route** | Routes through the orchestrator (this flow); produces one consolidated `research/00-research.md` | Standalone skill; does NOT route through the orchestrator; uses tmux fan-out |
| **Output** | One `research/00-research.md` with hybrid evidence + conflict detection + gap-closure loop | Per-repo architect+security+qa+tester audits; `00-consolidated.md`; profile/contract validation |
| **Agents** | `code-researcher` (sonnet) + optional `researcher` (haiku) + `research-consolidator` + `architect` | `architect`, `security`, `qa`, `tester` (per repo); separate workspaces per repo |
| **When to use** | "How does the retry logic work across the gateway and the worker services?" | "Does the payment service honor the idempotency contract declared in the API profile?" |

Use `/th:research-code --multi-repo` when the question is about understanding code behavior. Use `/th:cross-repo` when the question is about contract compliance and invariant validation.

---

## Spike Flow

When the user wants to quickly test a technical hypothesis without full pipeline ceremony:

**Observability:** spike mode is a named observability exemption — it writes no `00-state.md` and no `00-execution-events` file. Its workspace is intentionally invisible to `/th:pipelines` and `/th:recover`. See `docs/observability.md § Lightweight direct-mode exemptions`.

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
   3. Investigate further → I'll run another spike or a /th:research
   ```
8. **Act on user's choice:**
   - Formalize: create GitHub issue using **SDD template** — include spike findings in Technical Context. **Detection + fallback:** see `agents/_shared/gh-fallback.md` § "Tier B — create an issue". When `has_gh=true`: `gh issue create`. When `has_gh=false` and token + GitHub origin available: curl POST. When neither: write SDD body to `workspaces/{feature}/inputs/issue-create.md` and prompt operator to paste it into GitHub, then reply with the new issue number. Ask: "Issue created (or paste required). Run full pipeline now?"
   - Discard: `git checkout -- .` to revert (confirm with user first). Clean up workspaces.
   - Investigate: continue as directed.

---

## Plan Flow

Two modes: `plan` (analysis only) and `plan-and-execute` (analysis + full pipeline per task).

**Distinction from normal pipeline mode.** Plan flow's architect output is `01-planning.md` — a task breakdown for **multi-task batch orchestration** across worktrees, with dispatch labels (BLOCKER / PARALLEL / CONVERGENCE / SEQUENTIAL) and size estimates. This is structurally different from `01-plan.md`, which the architect produces in **normal pipeline mode** (single-feature, sequential tasks, per-task ACs in Given/When/Then). The two files coexist for different consumers:

| File | Mode | Consumer | Purpose |
|---|---|---|---|
| `01-planning.md` | planning mode (`/th:plan`, `/th:plan plan-and-execute`) | orchestrator (multi-task dispatch) | break a broad scope into N parallel tasks |
| `01-plan.md` | design mode (normal pipeline) + **milestone build** (single-repo `type: plan`) | implementer + qa + plan-reviewer | merged architecture + task list (§ Architecture + § Task List); milestone-build home |

**Milestone build disambiguation.** A `type: plan` single-repo milestone build is a third, distinct consumer for `01-plan.md`. The architect writes the milestone decomposition INTO `01-plan.md` (Work Plan with milestones M0…MN). This is NOT `01-planning.md` (multi-task batch). See the milestone-build section below for the full contract.

Inside each task dispatched by `plan-and-execute`, the child orchestrator runs the full single-feature pipeline (Stage 1 → STAGE-GATE-1 → Stage 2 → STAGE-GATE-2 between tasks → Stage 3 → STAGE-GATE-3), which DOES produce its own `01-plan.md` for that task's own sub-tasks. The parent batch orchestrator gates at task boundaries via the multi-task progress tracker — it does NOT additionally fire STAGE-GATE-1/2/3 at the batch level. **No double-gating.**

### Planning phase (both modes)

1. **Intake** — classify as `plan` or `plan-and-execute`. Do NOT move GitHub issues to "In Progress" yet.
2. **MANDATORY — Query KG** — call `search_nodes` with 2-3 semantic queries. Write `00-knowledge-context.md` if results found.
3. **Specify** — full SPECIFY as normal (codebase investigation, AC, scope). Update GitHub issue if `needs-specify: true`.
4. **Design (planning mode)** — invoke `architect` in planning mode. Architect produces task breakdown in `01-planning.md`. **Does NOT produce `01-plan.md`** — that file belongs to design mode.
5. **Validate sizing** — read `01-planning.md`. If any task has >20 AC or looks like a full feature, re-invoke architect to split. Max 1 retry.
6. **Create tasks** — **Detection + fallback:** see `agents/_shared/gh-fallback.md` § "Detection probe" and § "Tier B — create an issue" and § "Tier A — list repo labels". Use the standard detection probe to set `has_gh`.
   - **gh available:** create one GitHub issue per task via `gh issue create` using **SDD issue template**. Labels from repo (`gh label list`), assignee `@me`, project board if exists. Comment on parent issue.
   - **gh unavailable, token + GitHub origin available:** use curl Tier B fallback to create issues and Tier A curl to read labels.
   - **neither available:** write each task as markdown in `workspaces/{feature-name}/tasks/` (existing fallback path, unchanged).
7. **Report** created tasks to user.

**Mode: `plan`** → STOP after reporting.

**Mode: `plan-and-execute`** → proceed to Parallel Dispatch (see below).

---

## Milestone-Build Flow (single-repo `type: plan`)

A milestone build is when one project is decomposed into milestones (M0…MN) and the operator executes each milestone as a step of the plan. This is the **one-build-one-workspace model**: one task = one plan (`01-plan.md`) = one workspace, shipping under the default `all-tasks-one-pr` Delivery Grouping as ONE PR (opened only when ALL milestones are complete).

**Governing invariant:** a build is identified by IDENTITY, never the date. The orchestrator MUST NEVER create a new plan or workspace because the date changed. No code path may branch "new date → new workspace."

**Milestone definition.** A milestone is an internal unit of work-division WITHIN ONE TASK that maps to ONE COMMIT on the single feature branch. Milestones are NOT deliverables and NOT PRs — they are commit-sized steps that (a) produce a clean granular history and (b) can be PARALLELIZED when independent. The task ships as ONE PR at the end after all milestones are complete.

**PROHIBITED — per-milestone artifact splitting:** Per-milestone-suffixed filenames (e.g., `02-implementation-m{N}.md`, `03-testing-m1.md`) and `{NN}_{milestone}/` child folders (e.g., `01_m0-skeleton/`, `02_m1-api/`) are explicitly PROHIBITED. Agents that create these are in defect.

**Stage files are FLAT, whole-task, and there is exactly ONE set per workspace.** No suffix of ANY kind is permitted on a stage filename. This prohibits not only per-milestone suffixes (`02-implementation-m{N}.md`) and `{NN}_{milestone}/` child folders, but ALSO any "second-cycle" / "second delivery cycle" suffix such as `02b-implementation.md`, `03b-testing.md`, `04b-*.md`. There is no "second delivery cycle" convention in team-harness — inventing an undocumented file-naming convention is itself a defect. One task = one workspace = one set of stage files (`02-implementation.md`, `03-testing.md`, `reviews/04-security.md`, `reviews/04-validation.md`), each whole-task. A second PR or a second pass within the same workspace REUSES these flat files; it never mints a parallel suffixed set.

**Operator-authority invariant — the pipeline never divides a task.** A single task's plan and its implementation are NEVER autonomously divided by the pipeline — not into multiple delivery groups, not into multiple stage-cycles, not into multiple workspaces. Dividing a scope into multiple workspaces is the OPERATOR's responsibility and decision. If the architect or orchestrator judges a scope too large for one task, it SURFACES that judgment to the operator (a decision in `01-plan.md § Review Summary → ### Decisions for human review`, or a STAGE-GATE STOP) — the operator decides whether to split into multiple workspaces. No agent splits a task's plan or implementation on its own authority.

**Reconciling clause — decomposition vs division.** This invariant governs DIVISION of a single task; it does NOT prohibit the orchestrator's always-run decomposition analysis (`agents/orchestrator.md` Step 9). A scope that decomposes into genuinely-independent tasks is identified by that analysis and handed to Multi-Task Orchestration, which consolidates the result into one PR by default — that is not "dividing a task." Decomposition operates at the TASK-IDENTIFICATION axis (finding independent tasks up front, always run, autonomous); this invariant governs the DELIVERY axis (never fragment one already-identified task, never mint separate operator-facing workspaces without operator sign-off). The two are complementary, not in tension.

**Third parallelism axis — intra-task execution-lane fan-out (distinct from both of the above).** The lane-decomposition mechanism (`agents/orchestrator.md § Phase 2 — Implementation → Intra-task execution-lane decomposition`) is a THIRD, narrower axis, distinct from both TASK-IDENTIFICATION (the decomposition analysis above) and the inter-task DAG scheduler (`Depends on:` rounds, `agents/orchestrator.md` Stage-2 scheduler): it fans out the EXECUTION of a SINGLE already-approved, already-undivided task into bounded parallel implementer lanes — one per architect-declared, file-disjoint seam — when the task's `Files:` count meets `LANE_DECOMPOSE_MIN_FILES` and its seams are genuinely disjoint. The DELIVERABLE (plan, commit set, PR) is never divided; only EXECUTION may fan out into bounded lanes, capped at `LANE_CAP` per task and `GLOBAL_ROUND_CONCURRENCY_CAP` per round — a task whose lanes fan out still ships as exactly one plan, one implementation record, one commit set, one PR. Full contract, caps, and the seam-not-disjoint fallback: `agents/orchestrator.md § Phase 2 — Implementation → Intra-task execution-lane decomposition` and `docs/parallel-batch-implementation.md § Intra-task lane fan-out`.

### Batch consolidation vs the anti-split invariant

These two rules are the same constraint read from two directions:

- **Anti-split invariant (single-task reading):** A single task is NEVER split across multiple delivery groups. The Operator-authority invariant above is the governing statement — no agent divides a task's plan or implementation on its own authority. A single task always belongs to exactly one group in `§ Delivery Grouping`.
- **Consolidation default (multi-task reading):** A same-repo batch of independent tasks consolidates into ONE PR by default (`Delivery Grouping: all-tasks-one-pr`). The orchestrator's `## Multi-Task Orchestration` **Consolidation default** paragraph is the governing statement — all task branches merge into one `batch/<name>-verify` branch, the version bumps once, the changelog is one consolidated entry, and exactly one PR covers all batch work. Do NOT open one PR per batched task.

Read together: a task is never SPLIT across delivery groups (anti-split), and a same-repo batch consolidates INTO one PR by default (consolidation default). There is no contradiction — one rule prevents explosion outward (splitting a task across groups), the other prevents explosion inward (one PR per task in a batch). Neither rule claims a fixed "one task = one PR" identity; the actual task-to-PR mapping is declared per plan by `§ Delivery Grouping`.

**Operator opt-out.** The operator — and only the operator — may override the consolidation default by requesting separate PRs ("keep them as separate PRs" / "separate PRs"). On opt-out, each task ships as its own PR via serial merge (open Task-N+1's PR only after Task-N's PR lands on fresh `main`; never stacked). The orchestrator never chooses separate PRs on its own authority.

**Genuine blocker (the only non-opt-out reason for separate PRs in a same-repo batch).** Absent an operator opt-out, the orchestrator splits a batch into separate PRs ONLY for: (a) an UNRESOLVABLE merge conflict between task branches at consolidation Step 5a; or (b) a temporal-prod / cross-repo deploy reason from the plan-reviewer's existing closed list — `coexistence window`, `production signal`, `cross-repo deploy gate` (see `agents/plan-reviewer.md § Rule 1`). No new blocker categories exist.

**Same delivery flow alignment.** The consolidated batch ships via the same delivery flow and the same PR lifecycle as a single task — the same `delivery` agent (orchestrator Step 5d), the same review → merge → worktree-teardown lifecycle (teardown on PR merge per `docs/worktree-discipline.md` Rule 3). There is no separate batch-delivery path. The only structural difference is that delivery operates on the `batch/<name>-verify` integration branch (Step 5a) rather than a single task branch.

**Stage files are FLAT, whole-task documents.** `02-implementation.md`, `03-testing.md`, `reviews/04-security.md`, and `reviews/04-validation.md` cover the ENTIRE build in one file each — no per-milestone subsections. One workspace: one commit per milestone (in dependency order), accumulated on the single feature branch.

**Milestone Index (summary).** The plan's `00-state.md` `## Milestone Index` table tracks one row per milestone with a `Commit` column (commit sha per milestone). No per-milestone `PR` column. A single build-level PR is recorded once at the end.

```
## Milestone Index
| Milestone | Slug | Status | Commit |
|-----------|------|--------|--------|
| M0 | m0-skeleton | complete | abc1234 |
| M1 | m1-api | implementing | — |
```

### Plan artifact: `01-plan.md`

The plan artifact for a milestone build is **`01-plan.md`** — the architect writes the milestone decomposition (Work Plan with milestones M0…MN) into `01-plan.md` as the build home. The milestone breakdown — WITH per-milestone **dependency annotations** (independent vs depends-on-Mx) — lives ONLY in `01-plan.md`. This is distinct from:
- `01-planning.md` (planning-mode batch: multi-task dispatch via `/th:plan`, consumed by the multi-task dispatcher — preserved, not renamed)

### One-build-one-workspace structure (FLAT whole-task stage files)

```
{plan_workspace}/                 ← the ONE workspace = the ONE task (e.g., 2026-06-08_v1-mvp-build/)
  00-state.md                     ← pipeline state + Milestone Index (Commit column; single build-level PR)
  00-knowledge-context.md         ← KG results (if any)
  00-execution-events.md          ← event trace
  01-plan.md                      ← milestone breakdown w/ per-milestone DEPENDENCY annotations (independent vs depends-on-Mx)
  02-implementation.md            ← FLAT whole-task implementer report (NO per-milestone subsections)
  03-testing.md                   ← FLAT whole-task tester report
  reviews/04-security.md                  ← FLAT whole-task security report (tier-gated)
  reviews/04-validation.md                ← FLAT whole-task qa report
  00-pipeline-summary.md          ← rollup
```

One flat workspace. ONE file of each stage type, each covering the WHOLE TASK with no per-milestone subsections. NO child workspaces, NO `{NN}_{milestone-slug}/` sub-folders, NO suffixed files of any kind — e.g., `02-implementation-m1.md` and `02b-implementation.md` are both PROHIBITED. The milestone breakdown lives ONLY in `01-plan.md`.

The `02-implementation.md`, `03-testing.md`, `reviews/04-security.md`, and `reviews/04-validation.md` are FLAT, whole-task documents. They cover the entire build in one file — not split by milestone.

### Milestone execution: detect-and-continue by identity

When the operator says "implement M0" (or "build M1", "execute milestone X"), the orchestrator:

1. Extracts the plan identity slug from the task description.
2. Runs the date-agnostic glob + frontmatter confirm (identical to the initiative JOIN rule) to locate the plan workspace by identity.
3. On confirmed match: resumes the SAME plan workspace as `docs_root` — this is the detect-and-continue path. No new top-level sibling workspace is created; no `{NN}_{milestone-slug}/` sub-folder is nested.
4. On no match: treats the task as a standalone pipeline (normal behavior).

The detect-and-continue check runs in `orchestrator.md` **Step 1d** before composing a fresh `docs_root`. Milestone execution continues inside the plan's workspace instead of minting a sibling `{date}_{feature}` folder.

### Independent milestones: parallelization + convergence

**Parallelization.** The milestone breakdown in `01-plan.md` carries per-milestone dependency annotations (`independent` vs `depends-on-Mx`). Independent milestone implementations MUST be PARALLELIZED whenever dependencies allow, reusing the #285 in-message concurrent-`Task` mechanism at MILESTONE granularity within ONE workspace. Dependent milestones serialize in dependency order.

**Convergence (race-free, one commit per milestone).** Each parallel lane implements its milestone in an isolated worktree (no file-system race between lanes). At the convergence barrier the orchestrator applies each completed lane's diff as ONE COMMIT to the single feature branch, in dependency order. Commits are applied serially to the branch — never concurrently — so the history is deterministic: one commit per milestone, dependency-ordered.

**Result:** one feature branch, one commit per milestone (in dependency order), ONE PR opened at the end after STAGE-GATE-3.

**Concurrency cap.** Reuse `batch_concurrency` (default 5); a milestone fan-out larger than the cap splits into waves using the same eager slot-fill rule as the worktree batch model.

### Build-level milestone index

The plan's `00-state.md` carries a `## Milestone Index` table. The orchestrator maintains it with the same read-modify-write rule as the initiative parent index: read full `00-state.md`, replace the row for this milestone slug in-place (never duplicate), write the whole file back.

```markdown
## Milestone Index
| Milestone | Slug | Status | Commit |
|-----------|------|--------|--------|
| M0 | m0-skeleton | complete | abc1234 |
| M1 | m1-api | implementing | — |
| M2 | m2-worker | pending | — |

Build PR: #42 (recorded once when ALL milestones are complete)
```

Status values: `pending` → `implementing` → `complete`. One row per milestone; replace-in-place; no duplicate rows. The `Commit` column records the commit sha after each milestone lands. The `PR` column is REMOVED — milestones are commits, not PRs. A single build-level PR is recorded once at the end.

### Gate model (once each)

| Gate | Fires | Scope |
|------|-------|-------|
| STAGE-GATE-1 | ONCE | Approve the whole milestone plan (`01-plan.md`) including the dependency graph + parallelization layout. NOT per-milestone. |
| (implement) | per milestone | Implement milestone (parallel where independent, serial where dependent) → ONE COMMIT on the single feature branch (dependency order) → update Milestone Index status + record the commit sha. NO per-milestone PR, NO per-milestone gate. |
| (verify) | once, whole-task | The flat whole-task `03-testing.md` / `reviews/04-validation.md` (and `reviews/04-security.md` if tier-gated) cover the whole task. No gate fires per milestone. |
| STAGE-GATE-3 | ONCE | After ALL milestones are complete (functionality complete). ONE PR opened with all milestone commits. NOT per-milestone. |

---

## Parallel Dispatch Flow (DEFAULT for 2+ tasks)

Parallel dispatch is defined in the orchestrator's **Multi-Task Orchestration** section. It is the **default behavior** whenever the orchestrator has 2+ tasks, regardless of entry point. **Scope note:** this is single-project, multi-task dispatch — ungated by a parallelism confirm. It is distinct from the multi-PROJECT initiative fan-out (`agents/orchestrator.md § Parallel Multi-Project Dispatch`), which is scoped to ≥2 projects and IS confirm-gated.

**Entry points that lead here:**
- `/th:plan plan-and-execute` → architect produces task breakdown → dispatch
- `/th:issue #1 #2 #3` → multiple issues → dispatch
- User requests batch/parallel work → orchestrator runs Specify + Design (planning mode) → dispatch
- orchestrator identifies broad scope needing breakdown → auto plan-and-execute → dispatch

When multiple tasks exist:
1. The orchestrator reads `01-planning.md` for dependency info (if available) or analyzes dependencies itself
2. Follows the **Multi-Task Orchestration** flow (dependency analysis → rounds → hooks + inotifywait → event-driven monitoring)
3. Each worktree runs a full pipeline via `/th:issue #{number}`

### Branching strategy

Tasks in later rounds depend on code from earlier rounds. Use **branch-from-parent**:
- Round 1 tasks branch from `main`
- Round 2 tasks branch from Round 1's feature branch (not main)
- When Round 1's PR merges, Round 2's PRs auto-rebase cleanly

This mirrors how human teams work with dependent features.

---

## Bug-fix Flow

When `type: fix` is classified (Phase 0a Step 7), the orchestrator runs the **Bug-fix Pipeline** — the same 3-stage shell as feature flow, with type-specific content shifts. The pipeline is **tier-classified (1-4)** based on bug content keywords, impacted file paths, and operator override. The tier determines which artifacts are produced and which agents run: Tier 1 (docs/trivial) skips the architect entirely and conditionally skips the pre-fix regression test; Tier 2 (light) uses an abbreviated root-cause + tester + qa; Tier 3 (standard, the PR #50 default) runs the full pipeline + security; Tier 4 (critical/security) adds mandatory prior-art memory query and extended security analysis. The "security runs always for bugs" rule from PR #50 is preserved for Tier 3+; auto-escalation favors high-tier signals so any fix touching a security-sensitive path lands at Tier 3+ regardless of the operator's hint.

### Tier System (4 tiers)

The canonical Tier table, Tier 0 auto-detection rules, auto-classification signals (Signal 1/2/3), Tier 1 regression-test conditional skip, auto-escalation rules, and worked examples are defined in `orchestrator.md § "Bug tier"` (Phase 0a Step 7). That is the single authoritative source — the orchestrator runs classification at Phase 0a Step 7 and `[TIER: 0]` operator override is defined there. See `orchestrator.md § "Bug tier"` for the complete Tier table, all signal definitions, the auto-escalation rules, and worked examples. The summary below covers only the Bug-fix Pipeline flow behavior; all Tier-classification decisions are governed by the canonical source.

**Quick reference — Tier names and Pipeline effects (see `orchestrator.md § "Bug tier"` for the authoritative table):**
- **Tier 0 (Trivial/Cosmetic):** no workspaces, no gates (PR review is the only gate), implementer runs inline. No `00-state.md`, no `01-plan.md`, no workspaces folder.
- **Tier 1 (Docs/Trivial):** workspaces created; architect skipped; Tier 1 regression-test conditional skip — only when no behavior change; tester only (suite no-regress) at Phase 3.
- **Tier 2 (Light fix):** architect dispatched in light-root-cause mode; regression test mandatory; tester + qa at Phase 3.
- **Tier 3 (Standard fix):** architect dispatched in full-root-cause mode; regression test mandatory; tester + qa + security at Phase 3.
- **Tier 4 (Critical/Security):** same as Tier 3 plus mandatory KG prior-art query (`mcp__memory__search_nodes`) and extended security analysis.

**Auto-classification signals (canonical definition in `orchestrator.md § "Bug tier"`):**
- **Signal 1 — Keywords in the bug report:** high-tier triggers (escalate to Tier 4): `auth`, `injection`, `xss`, `csrf`, `secret`, `token`, `permission`, `bypass`, `vulnerability`, `cve`, `leak`, `exposed`, `unauthorized`. Low-tier hints (Tier 1 candidate): `typo`, `trivial`, `quick fix`, `cosmetic`, `whitespace`.
- **Signal 2 — File-path patterns:** security-sensitive paths (force Tier 3+, `security-sensitive: true`): `auth/**`, `middleware/**`, `api/**`, `db/**`, `security/**`, `crypto/**`, `session/**`, any path with `auth` or `permission` in name. File-path patterns drive the re-tier GATE at Phase 2 close.
- **Signal 3 — Operator override:** `[TIER: 0|1|2|3|4]` forces declared tier; `[regression-test: required]` forces Tier 2 minimum; `[security: required]` forces Tier 3 minimum.

**Auto-escalation rules:** high-tier signal sobrescribes lower-tier classification. Path priority > keyword priority > size hints. Default: Tier 3 when in doubt (conservative).

**`type: hotfix` Tier 3 floor:** a hotfix is always Tier 3 minimum — auto-classification MUST NOT assign a hotfix a tier below 3. The override-clamp (`[TIER: 0/1/2]` on a hotfix) is silently raised to Tier 3. See `orchestrator.md § "Bug tier"` for the full floor rule.

**Auto-promotion Tier 1 → Tier 2:** a Tier 1 candidate is auto-promoted to Tier 2 when any condition for the regression-test skip fails (e.g., UI strings, test-fixture changes). The promotion is recorded in `00-state.md` and announced to the operator.

**Worked examples:** see `orchestrator.md § "Bug tier"` § Worked examples for the complete set. Representative cases: Tier 0 (typo in CHANGELOG, no workspaces); Tier 1 (docs string fix, no architect); Tier 2 (config change, light root-cause); Tier 3 (production code bug, full pipeline); Tier 4 (auth bypass — security-escalation example with Signal 1 + Signal 2 combined).

#### Tier 1 regression-test conditional skip

The Tier 1 candidate skips Phase 2.0 ONLY when ALL of these conditions hold (canonical definition in `orchestrator.md § "Bug tier"`): Tier is `1`; all touched paths are docs/comments/non-functional strings; no test paths touched; operator did NOT declare `[regression-test: required]`. Otherwise the candidate is auto-promoted to Tier 2. The conditional skip is recorded in `00-state.md` as `regression_test_status: skipped`.

#### Worked examples

**Example Tier 0 — typo in CHANGELOG, no workspaces:**
- Operator request: "fix typo in CHANGELOG.md: 'reseved' should be 'reserved'"
- Signal 1: `typo` (low-tier hint).
- Signal 2: `CHANGELOG.md` — single file, ≤5 lines, docs-only, no system-level path.
- Signal 3: none.
- Classification: `bug_tier: 0` (auto). All Tier 0 conditions satisfied.
- Pipeline: no workspaces created. Implementer makes the fix. Tester runs suite no-regress. PR is opened. PR review is the only gate. ~1 agent run total.

**Example Tier 0 — whitespace fix in README:**
- Operator request: "trailing whitespace on line 42 of README.md"
- Signal 1: `whitespace` (low-tier hint).
- Signal 2: `README.md` — single file, ≤5 lines, docs-only, whitespace-only change.
- Signal 3: none.
- Classification: `bug_tier: 0` (auto). All Tier 0 conditions satisfied.
- Pipeline: no workspaces, no STAGE-GATEs. Implementer makes the fix, runs tests, opens PR. ~1 agent run total.

**Example A — Tier 1, regression-test skipped:**
- Operator request: "fix typo in README.md: 'recieve' should be 'receive'"
- Signal 1: `typo` (low-tier hint).
- Signal 2: `README.md` matches Tier 1 path pattern.
- Signal 3: none.
- Classification: `bug_tier: 1` (auto). All touched paths match `*.md`, no test paths touched, no `[regression-test: required]` declaration → Phase 2.0 skipped.
- Pipeline: orchestrator skips Phase 1 (no architect). Phase 1.6 plan-reviewer runs against the minimal `01-plan.md`. STAGE-GATE-1 with one-sentence prose plan. Phase 2 (implementer fixes the typo). Phase 3 (tester suite no-regress + qa simplified validation). No security. ~3 agent runs total.

**Example B — Tier 2, light fix:**
- Operator request: "fix bug in .github/workflows/ci.yml — the matrix doesn't include Python 3.12"
- Signal 1: none high-tier.
- Signal 2: `.github/**` matches Tier 2 path pattern.
- Signal 3: none.
- Classification: `bug_tier: 2` (auto).
- Pipeline: orchestrator dispatches architect with `mode: light-root-cause`. `01-root-cause.md` contains 1-paragraph `## Mechanism` + 1-paragraph `## Scope of Fix` + `## Regression Test Approach` (the regression test asserts the matrix includes 3.12). Phase 2.0 mandatory — tester authors failing test. Phase 2 (implementer adds 3.12 to matrix). Phase 3 (tester + qa, no security). ~5 agent runs total.

**Example C — Tier 3 with security-path auto-escalation:**
- Operator request: "typo in error message from `src/auth/middleware.ts`: 'unautorized' should be 'unauthorized'"
- Signal 1: `unauthorized` is a high-tier trigger keyword. Also `typo` is a low-tier hint.
- Signal 2: `src/auth/middleware.ts` is a security-sensitive path → forces minimum Tier 3.
- Signal 3: none.
- Classification: `bug_tier: 3` (path priority > keyword priority; sensitive path wins over the typo hint). The keyword `unauthorized` would normally trigger Tier 4, but here it appears as part of the error-message text being fixed, not as the bug class; the architect can promote to Tier 4 in Phase 1 if root-cause analysis reveals the underlying logic is actually broken.
- Pipeline: orchestrator dispatches architect with `mode: full-root-cause`. `01-root-cause.md` full template (Prior Art optional). Phase 2.0 mandatory. Phase 2 (implementer fixes the typo). Phase 3 (tester + qa + security — defense-in-depth on sensitive path). ~7 agent runs total. If the architect surfaces a tier-promote, the operator decides between Tier 3 and Tier 4.

### Full workspaces artifact set (type: fix)

Every bug-fix pipeline produces the backbone artifacts; the tier modulates which Phase-1 / Phase-2.0 / Phase-3 artifacts are generated.

| Artifact | Tier 1 | Tier 2 | Tier 3 | Tier 4 | Content notes |
|---|---|---|---|---|---|
| `01-plan.md` | **Yes (always)** | Yes | Yes | Yes | Bug report content + reproduction steps (§ Review Summary) + tasks of the fix (§ Task List). Minimum 4 lines; Tier 1 may be 3 lines when Phase 2.0 is skipped (reproduce-or-cite, fix, verify) |
| `00-state.md` | Yes | Yes | Yes | Yes | Standard schema, `type: fix`, `bug_tier: N`, `bug_tier_source` |
| `00-execution-events.jsonl` / `.md` | Yes | Yes | Yes | Yes | Standard event trace (`.jsonl` local mode, `.md` obsidian mode) |
| `00-pipeline-summary.md` | Yes | Yes | Yes | Yes | Standard rollup |
| `01-root-cause.md` | **No (Phase 1 skipped)** | Yes — `mode: light-root-cause`, ≤30 lines | Yes — `mode: full-root-cause`, 1 pg max | Yes — `mode: full-root-cause` + mandatory `## Prior Art`, 1 pg max + ≤15 lines | file:line + mechanism + scope |
| `reviews/01-plan-review.md § Plan Review` | Yes | Yes | Yes | Yes | plan-reviewer writes this section; includes Rules 7 + 8 (gated on `type: fix \| hotfix`) |
| `02-regression-test.md` | **Conditional skip** — only when no behavior change (see Tier 1 condition above); otherwise Yes | Yes | Yes | Yes | tester's failing test (path + content + how to run) BEFORE implementer touches anything |
| `02-implementation.md` | Yes | Yes | Yes | Yes | implementer's report |
| `03-testing.md` | Yes — suite no-regress only | Yes | Yes | Yes | tester's post-fix verification |
| `reviews/04-validation.md` | Yes — Tier 1 simplified template (≤15 lines, no per-AC table) | Yes — default bug-fix contract | Yes — default bug-fix contract | Yes — default bug-fix contract | qa validation |
| `reviews/04-security.md` | **No** | **No** | **Yes (mandatory)** | **Yes (mandatory + extended analysis)** | security agent — see "Why security is tier-gated" below |
| `00-state.md § Delivery` | Yes | Yes | Yes | Yes | delivery agent appends this section |
| `reviews/04-validation.md § Drift Analysis` | Conditional (per existing complexity/iteration gate) | Conditional | Conditional | Conditional | acceptance-checker appends this section |

**Why security is tier-gated.** PR #50 set `security-sensitive: true` for every bug as a defense-in-depth override. The Tier System refines that override: security runs for every Tier 3+ bug (Tier 4 includes extended analysis cross-referencing prior art), and Tier 1 / Tier 2 fixes skip security because the impacted scope is non-functional (docs, dev-tooling, test infra). The auto-escalation rule guarantees that any fix touching a security-sensitive path (`auth/**`, `middleware/**`, `api/**`, etc.) lands at Tier 3+ at classification time — so a Tier 1 / Tier 2 run cannot accidentally bypass security on sensitive paths. Many bugs have non-obvious security implications (input-validation bugs that are actually injection, race conditions that are TOCTOU vulnerabilities, error-handling bugs that leak information); the path-pattern auto-escalation captures these without forcing security on every typo-in-docs fix.

### Phase structure (type: fix)

| Phase | Owner | Output | Notes |
|---|---|---|---|
| 0a Intake | orchestrator | `00-state.md` initial | KG session start, KG query, CLAUDE.md read, type classified as `fix`, `bug_tier` classified (1-4), `security-sensitive: true` forced for Tier 3+ |
| 0b Specify | orchestrator | Spec context (bug-report format) passed inline to architect; architect incorporates into `01-plan.md` § Review Summary | Reported behaviour / Expected behaviour / Reproduction steps / Environment / AC (AC-1 reproduction-no-longer-bug, AC-2 regression-test-exists for Tier 2-4; Tier 1 uses implicit "cited issue is fixed") |
| 0.5 Bootstrap | orchestrator | — | Same as feature flow |
| 1 Root-cause | architect (mode: root-cause + sub-mode) | `01-root-cause.md` (Tier 2-4 only) | **Tier 1: skipped.** Tier 2: `mode: light-root-cause`, ≤30 lines. Tier 3: `mode: full-root-cause`, 1 pg max. Tier 4: `mode: full-root-cause` + mandatory `## Prior Art`. |
| 1.5 Plan ratification | qa-plan (mode: ratify-plan) | append to `01-root-cause.md` | Usually skipped for `type: fix` (≤3 AC) |
| 1.6 Plan review | plan-reviewer | `reviews/01-plan-review.md § Plan Review` | Rules 1-6 plus Rules 7 + 8 (gated on `type: fix \| hotfix`). For Tier 1: Rule 7 is no-op (no `01-root-cause.md`); Rule 8 conditional on Phase 2.0 run |
| STAGE-GATE-1 | orchestrator | STOP block | Plan-reviewer verdict + TL;DR from `01-root-cause.md` + Task Summary from `01-plan.md` (§ Task List). Tier 1: one-sentence prose plan replaces TL;DR copy |
| **2.0 Regression Test** | tester (mode: pre-fix-regression) | `02-regression-test.md` (Tier 2-4 mandatory; Tier 1 conditional skip) | Tier 1 with no-behavior-change: skipped (`pre_fix_test_required: false`). Tier 2-4: mandatory, no fallback. Distinct from the AC-test authoring of Phase 2.7 — this test captures the bug before the implementer runs. |
| 2 Implement | implementer | `02-implementation.md` | Scope-discipline contract: zero tangential refactors |
| 2.5 Reconcile | orchestrator + qa-plan (reconcile) | — | Same as feature flow |
| **2.7 Test Authoring** | tester (mode: authoring) | `03-testing.md` (authoring section) | AC-test authoring pre-verify: tester maps each AC to at least one test, runs suite once to confirm green. This is DISTINCT from Phase 2.0 (regression test for the bug). Phase 2.7 is the general AC-test authoring that gates the parallel verify block. |
| 3 Verify | tester (run-only) + qa + security (tier-gated) | `03-testing.md`, `reviews/04-validation.md`, `reviews/04-security.md` (Tier 3+) | The tester is run-only in Phase 3: executes the frozen suite (authored in Phase 2.7), confirms no regressions, does NOT write new AC tests. Tier 1: tester (run-only, suite no-regress) + qa (simplified). Tier 2: tester (run-only) + qa. Tier 3: tester (run-only) + qa + security. Tier 4: same + extended analysis. `qa`, tester, and security parallelize over an immutable artifact — no race condition. |
| 3.5 Acceptance gate | orchestrator | — | Same as feature flow; regression test must still be in suite (Tier 2-4) or `regression_test_status: skipped` confirmed (Tier 1). Gate also checks assertion-content match: authored assertion patterns from `02-regression-test.md` must still be present in the actual test file at `regression_test_path` — a weakened/replaced assertion body fails the gate (see orchestrator.md Phase 3.5 Step 6). |
| 3.6 Acceptance check | acceptance-checker | `reviews/04-validation.md § Drift Analysis` | Conditional per existing gates |
| 4 Delivery | delivery | `00-state.md § Delivery` | CHANGELOG `### Fixed`, PR title `fix(area):`, Bug Report section in PR body, `Fixes #N` |
| 4.5 Internal review | reviewer (mode: internal) | — | Conditional per diff-size gate |
| STAGE-GATE-3 | orchestrator | STOP block | ship / amend / abort |
| 5 GitHub update | orchestrator | — | Comment with regression test path + Before/After (regression test omitted for Tier 1 skipped) |
| 6 KG save | orchestrator | — | `process-insight` describes failure mode learned, not feature shipped |

### Phase 2.0 — Regression Test Authoring (mandatory, never skipped)

**Why this slots between STAGE-GATE-1 and Phase 2.** The human at STAGE-GATE-1 approves the approach (root-cause + regression-test plan). After approval, the tester writes the failing test. The implementer is dispatched at Phase 2 with a test that is already failing. The contract: "make this test pass without breaking the rest." This is the cleanest test-driven bug-fix pattern.

**Operator override (rejects the architect's documented exit hatch):** **Regression test is mandatory always, no exceptions, no fallback.** The architect's design doc proposed a manual-repro-script fallback for race/timing/environment-dependent bugs. The fallback is **rejected**. If the tester cannot author a regression test, the pipeline blocks with `status: blocked` and surfaces to the operator. There is no exit hatch.

**Dispatch:** orchestrator invokes `tester` via Task with:
- Feature name for workspaces
- Pointer to `01-plan.md` (§ Review Summary — reproduction steps + expected behaviour + AC)
- Pointer to `01-root-cause.md` (Regression Test Approach section)
- `mode: pre-fix-regression`
- Instruction: "Write a failing test that captures the bug described in `01-plan.md` § Review Summary (reproduction steps). The test MUST fail against the current codebase. Do NOT modify any source code — test files only. Output the test path in your status block; write your summary to `02-regression-test.md`."

**Gate (orchestrator):**

| `status` | `tests_failing_as_expected` vs `tests_added` | Action |
|---|---|---|
| `success` | equal AND `suite_still_passing: true` | Proceed to Phase 2. Mutate `<TBD-Phase-2.0>` placeholder in `01-plan.md` (§ Task List) to `regression_test_path` |
| `success` | unequal OR `suite_still_passing: false` | Route back to tester; treat as iteration of Phase 2.0 (max-3) |
| `failed` with `regression_test_status: bug-not-reproducible` | n/a | Route back to architect — root-cause is wrong. Re-run Phase 1, then Phase 2.0. Counts toward Phase 1.6 iteration budget |
| `blocked` | n/a | Cannot author a test. Pipeline blocks with `status: blocked`; surface to operator. **No fallback** |

### Implementer scope-discipline contract (for `type: fix` / `type: hotfix`)

Documented inline in `agents/implementer.md` under `## Scope discipline for type: fix and type: hotfix (Bug-fix Mode)`. Zero tangential refactors. Spotted issues go to `## Follow-ups Spotted`, not into the diff. The `[SCOPE-DRIFT: file X required for AC-N]` annotation pattern (existing for feature flow) routes back to the architect to update `01-root-cause.md` and re-run Phase 1.6.

### Plan-reviewer Rules 7 + 8 (gated on `type: fix | hotfix`)

Documented in `agents/plan-reviewer.md`. Fire only when the orchestrator's task payload declares `type: fix` or `type: hotfix`:

- **Rule 7** — `01-root-cause.md` declares a `## Regression Test Approach` section with Test layer (unit / integration / e2e), Test scaffold, Failing assertion. Size cap on `01-root-cause.md` ≤120 lines (>120 = `concerns` finding).
- **Rule 8** — every PR in `01-plan.md` (§ Task List) has an AC referencing the regression test path: `VERIFY: regression test exists at <path>` (or `<TBD-Phase-2.0>` before Phase 2.0 runs).

### qa validate-mode for `type: fix | hotfix`

`agents/qa.md` validate mode adds two boolean fields to the status block:
- `regression_test_referenced: true | false` — confirms the per-AC mapping in `reviews/04-validation.md` cross-references `02-regression-test.md`
- `reproduction_steps_validated: true | false` — confirms the AC-1 (reproduction-no-longer-bug) was checked against `01-plan.md` § Review Summary (Reproduction steps)

### Type classification — auto-detect bug-fix vs hotfix

The orchestrator's Phase 0a Step 7 classification logic uses these signal lists:

- **`fix`** — request describes broken/incorrect behaviour; keywords: `bug`, `solucionar`, `arreglar`, `corregir`, `fixear`, `debuguear`, `regresión`, `error en`, `no funciona`, `está rompiendo`, GitHub label `bug`.
- **`hotfix`** — all signals of `fix` PLUS urgency markers (`hotfix`, `urgente`, `crítico`, `production down`, `usuarios afectados`) AND scope ≤2 files (inferred from Phase 0b Step 1) AND single causal site described by operator.

**Operator override:** the operator can force a classification by saying so directly. E.g., `@th:orchestrator this is a hotfix:` forces `type: hotfix`.

**Architect re-classification (operator-in-loop):** during Phase 1, if the architect determines the bug is actually a missing feature, the architect emits `type_reclassify: true` and a 1-line rationale in its status block. The orchestrator surfaces both the rationale and the AC list to the operator for decision. The architect does not auto-route.

### Multi-bug requests

Routes through existing `plan-and-execute` flow. Each bug is one sub-task in `01-planning.md`; each sub-task dispatches as its own worktree running the full bug-fix pipeline via Multi-Task Orchestration. No new batch-bug-fix path is created.

### KG process-insight semantics for bugs

`agents/orchestrator.md` Phase 6 reuses the existing `process-insight` schema. Content shifts semantically: the observation describes the **failure mode learned**, not the feature shipped. Example good capture: `nestjs-typeorm-decimal-stringification — TypeORM returns decimal columns as strings; arithmetic on the returned value produces string concatenation. Discovered while fixing aggregation-totals-mismatch in zippy-commission-api.`

---

## Hotfix sub-flow (type: hotfix)

The Hotfix sub-flow is a tighter variant of the Bug-fix Flow for trivially scoped defects with urgency markers. **Phase 1 (Root-Cause Analysis) is skipped entirely** — no architect dispatch, no `01-root-cause.md`. Everything else from the Bug-fix Flow is preserved, including Phase 2.0 (mandatory regression test), Phase 4 delivery routing (`### Fixed` CHANGELOG, `fix(area): ... (hotfix)` PR title), and Phase 6 (KG save). The Phase 4 PR title appends `(hotfix)` to signal urgency to the reviewer.

**Tier 3 hard floor for hotfix:** a hotfix is pinned to Tier 3 minimum at Phase 0a Step 7 classification (see `orchestrator.md § Bug tier` for the full hotfix floor rule). Because every hotfix is Tier 3+, the security agent runs for every hotfix — "security always runs for hotfix" is a direct consequence of this pin. The hotfix Tier 3 floor and the security-always contract are the same rule stated from two angles; they are consistent by construction. Note: dedup of the Tier table between `orchestrator.md` and this file belongs to PR I.

### Skipped phases (relative to type: fix)

- Phase 1 — no architect dispatch, no `01-root-cause.md`.

### Modified phases

- Phase 0b — bug-report intake same as `type: fix`, but the AC list is tighter (typically only AC-1 reproduction-no-longer-bug and AC-2 regression-test-exists). **Before STAGE-GATE-1, the orchestrator authors `01-plan.md § Review Summary`** (constructed from the Phase 0b bug-report payload: Reported behaviour, Expected behaviour, Reproduction steps, Environment) and `§ Task List` (minimum 4-line list: reproduce, regression test, fix, verify). This is the orchestrator-self-authored path — the architect is not dispatched in the hotfix flow. See `orchestrator.md § STAGE-GATE-1` for the full self-authored step contract.
- Phase 1.5 and 1.6 — still run. Plan ratification + plan review operate against the regression test + task list + 1-sentence prose plan emitted by the orchestrator inline at STAGE-GATE-1. plan-reviewer Rules 7 + 8 still apply.
- STAGE-GATE-1 — uses a tighter STOP block with a one-sentence prose plan from the orchestrator; `## Review Summary` is self-authored by the orchestrator (see Phase 0b bullet above).

### Unchanged from `type: fix`

- Phase 2.0 (Regression Test) — **still mandatory**. The operator override "regression test is mandatory always" applies to hotfixes too.
- Phase 2 (Implementation) — scope-discipline contract still applies.
- Phase 3 (Verify) — `security` agent still runs always for hotfix. This is a direct consequence of the Tier 3 hard floor: `type: hotfix` is pinned to Tier 3 minimum at Phase 0a Step 7 in `orchestrator.md` (the hotfix Tier 3 floor rule), so the Tier-gated dispatch table always routes every hotfix to the Phase 3 `security` agent (Tier 3 row). "security runs always for hotfix" and "security runs for every Tier 3+ fix" are the same statement — the hotfix pin makes them equivalent. Note: dedup of the Tier table between `orchestrator.md` and this file belongs to PR I.
- Phase 3.5 (Acceptance Gate) — same.
- Phase 3.75 (Build Verification) — runs normally (hotfix code must still compile).
- Phase 3.6 (Acceptance Check) — **SKIPPED** for hotfix + single-file fix (the only exception to mandatory Phase 3.6; speed override). For multi-file hotfixes, Phase 3.6 runs.
- STAGE-GATE-2 — irrelevant in practice (hotfix is typically 1 PR / 1 round).
- Phase 4 (Delivery) — same `### Fixed` routing; PR title gains `(hotfix)` suffix.
- Phase 4.5 (Internal Review) — **SKIPPED** for hotfix + single-file fix (the only exception to mandatory Phase 4.5; speed override). For multi-file hotfixes, Phase 4.5 runs.
- STAGE-GATE-3 — always mandatory.
- Phases 5 (GitHub Update) and 6 (KG Save) — same.

### workspaces artifact set (type: hotfix)

Every artifact required by `type: fix` is also required by `type: hotfix`, **with one exception**: `01-root-cause.md` is omitted (Phase 1 skipped). `01-plan.md` is **still produced** (§ Task List minimum: 4-line task list — reproduce, regression test, fix, verify). All other artifacts in the table above for `type: fix` are produced for `type: hotfix` too — `reviews/01-plan-review.md § Plan Review`, `02-regression-test.md`, `02-implementation.md`, `03-testing.md`, `reviews/04-validation.md`, `reviews/04-security.md`, `00-state.md § Delivery`, `reviews/04-validation.md § Drift Analysis` when Phase 3.6 runs (skipped for single-file hotfixes).

### Operator-facing surface

v1 detects hotfix by keyword in natural language (auto-classification + operator override). The `/th:hotfix` slash command is deferred to v2.

---

## Security-Sensitive Flow (extended)

1. Design is mandatory with extended security analysis
2. Phase 3 launches `security` agent in parallel with tester+qa (automatic — triggered by `security-sensitive: true`)
3. Critical/High findings block delivery → iterate with implementer (Case D)
4. Medium/Low/Info findings are warnings in delivery report, do NOT block
5. If any security risk unresolved after max iterations → document in `reviews/04-security.md` and proceed

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
2. **Design** — architect focuses on target structure, not new features. The single-file output contract applies: `01-plan.md` (pipeline_version 2). Per-task ACs in refactor mode use the `VERIFY:` format predominantly rather than Given/When/Then — both formats are accepted by the `plan-reviewer` Rule 2 regex.
3. **Implement** — implementer receives: "This is a refactor. Do NOT change behavior. Existing tests are your contract. Only change structure/organization. Per-task scope from `01-plan.md` (§ Task List) `Files:` field still applies."
4. **Verify** — tester runs **existing tests first** before writing new ones. If existing tests fail → the refactor broke something. New tests only for structural improvements (e.g., new module boundaries).
5. **Delivery** — as normal, gated by STAGE-GATE-3.

The key difference: existing passing tests are the safety net. If they break, the refactor is wrong. **The 3-stage gates still apply**: STAGE-GATE-1 (human approves the refactor plan), STAGE-GATE-2 between tasks in autonomous-skippable interactive mode, STAGE-GATE-3 before push.

---

## Test Pipeline Flow

A dedicated pipeline for achieving **80% branch coverage service-wide**. Decomposes a service into modules, dispatches tester agents in parallel, and iterates until the coverage gate is met.

**Entry:** `/th:test-pipeline [path] [--skip-security] [--modules x,y] [--coverage-only]`

### Phase 0 --- Analyze & Decompose

**Owner:** orchestrator

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
10. **Write workspaces:**
    - `workspaces/test-pipeline/00-state.md` --- initial pipeline state. When the Direct Mode Task payload carries `frontend_scope: true`, record `frontend_scope: true` in this file. (Phase 0 step 2's stack detection — react/vue/svelte markers — corroborates it, but the skill's prior detection is authoritative; do not re-detect.)
    - `workspaces/test-pipeline/batch-progress.md` --- task table (reusing multi-task format)

### Phase 1 --- Blocker Round

**Owner:** orchestrator dispatches, tester agent executes

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
  Write workspaces summary when done.
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
  Write workspaces summary when done.
```

**Dispatch rules:**
- If both 1A and 1B exist → dispatch in parallel (they are independent)
- If only 1A → run in current session (no worktree needed)
- Wait for ALL blocker tasks to complete before Phase 2

### Phase 2 --- Parallel Test Round

**Owner:** orchestrator dispatches via Multi-Task Orchestration

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
- frontend_scope: {true|false from 00-state.md}
- Instruction:
  1. TESTER PHASE: Write comprehensive tests for all files in {module path}.
     Use factory pattern for mocks. Cover the module's behavior systematically
     (happy paths, error cases, edge cases, input validation).
     Follow existing test patterns. No AC to map --- cover source files.
     1a. BROWSER-VS-JSDOM ROUTING (when frontend_scope: true): For each source
         file in this module, apply the tester Phase-0 browser-test decision rule
         per-file. Files whose behavior depends on real browser APIs (layout/geometry,
         IntersectionObserver/ResizeObserver, matchMedia, Web Animations/CSS transitions,
         computed CSS) or that are components whose rendering requires a real browser
         should be covered in browser-mode (NOT jsdom). Pure-logic files (data
         transforms, hooks with no DOM dependency, utilities) stay jsdom. If the
         detected stack has no browser-mode support (e.g., Vue, Svelte, non-React
         frameworks), record "browser-mode: n/a for this stack" in the module summary
         and fall back to the stack's available test environment --- do not force
         browser-mode.
  2. QUALITY CHECK: After tests pass, run coverage for this module only.
     Report: files tested, branch coverage %, uncovered branches.
  3. SECURITY SCAN (unless skip-security): Review the module's source files
     for security issues. Check: injection risks, auth boundary violations,
     secrets handling, input validation gaps, unsafe data access patterns.
     Report findings with file:line references.
  4. Write workspaces summary to workspaces/test-pipeline-{module-name}/03-testing.md
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

**Owner:** orchestrator

**⚠️ THE 80% BRANCH COVERAGE GATE IS NON-NEGOTIABLE. 79.99% IS A FAILURE. THERE IS NO "CLOSE ENOUGH".**

**Rules:**
- 78.99% = FAIL → iterate
- 79.5% = FAIL → iterate
- 79.99% = FAIL → iterate
- 80.00% = PASS
- Do NOT proceed to Phase 4 unless coverage >= 80% OR max iterations (3) exhausted
- Do NOT rationalize that "it's close enough" — the gate is binary: >= 80% or iterate

1. **Collect results** --- read all `workspaces/test-pipeline-{module}/03-testing.md` files. Extract: module name, tests created, tests passing, branch coverage %, security findings.

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

**Owner:** orchestrator

1. **Merge per-module results** --- aggregate: tests created, tests passing, coverage, security findings from all `03-testing.md` files.

2. **Security consolidation** --- merge all per-module security findings:
   - Deduplicate findings across modules
   - Sort by severity (Critical > High > Medium > Low > Info)
   - Flag cross-module patterns (e.g., "3 modules have unvalidated input")

3. **Write final report** to `workspaces/test-pipeline/05-consolidation.md`:
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
   Report: workspaces/test-pipeline/05-consolidation.md
   ```

### workspaces structure

```
workspaces/
  test-pipeline/                        # orchestrator coordination
    00-state.md                         # pipeline checkpoint
    00-execution-events.jsonl           # event trace (orchestrator only, local mode)
    00-execution-events.md              # event trace (orchestrator only, obsidian mode)
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

When the user asks to document a service, database, API, library, infrastructure, or product — typically via `/th:docs` or conversational requests like "documenta en obsidian el servicio X", "document the auth service", "genera documentación del API de pagos".

**Observability:** this flow is non-standard (no dev pipeline). The orchestrator appends `phase.start` and `phase.end` events to `00-execution-events` for each phase: Phase 0 (intake), Phase 1 (research), Phase 2a (write), Phase 2b (diagrams), Phase 3 (review). The DOC-GATE human checkpoint emits a `gate` event with `gate: "DOC-GATE"`. The workspace listing includes `00-execution-events` (see `### workspaces for documentation pipeline`). **KG capture:** the documentation flow does NOT perform KG capture — it has no Phase 6; no `process-insight` node is written to the Knowledge Graph.

### Phase 0 — Intake

1. **Read vault config** — read `~/.claude/config/obsidian-vaults.json`. If missing, stop and ask the operator for the vault path. If a `--vault` flag was passed, use that vault entry; otherwise use the `default` vault.
2. **Parse topics** — extract what to document. Multi-topic detection: commas, "and"/"y", or enumerated lists produce multiple doc tasks.
3. **Parse language** — `--lang <code>` flag or explicit language request. Default: `en`. The language applies to all prose in the documentation; structural elements (YAML keys, Mermaid syntax, code blocks) remain in English.
4. **Parse folder** — `--folder <name>` flag or derived from topic name (kebab-case).
5. **Classify doc subject** per topic: `service` | `database` | `api` | `library` | `infrastructure` | `product`. This classification guides the architect's research scope and the documenter's page structure.
6. **Prepare spec context** with: topics, vault path, folder, language, subject classification per topic. This context is passed inline to the architect dispatch; the architect incorporates it into `01-plan.md` § Review Summary.
7. **Write initial `00-state.md`** — `type: docs`, `phase: 0`.

### Phase 1 — Research (per topic)

**Step 1a — Fan-out web research (parallel haiku lanes).** When the subject classification indicates external knowledge is needed (library, product, or any subject where public documentation enriches the output), dispatch N `researcher` (haiku) agents in parallel (default N=3, hard cap 5) for external evidence:
- Compose N distinct angles for the topic (e.g., `official-docs`, `known-issues`, `migration-guides`).
- Dispatch each `researcher` with: `angle`, `topic`, `relevance_criteria`, and a per-lane `findings_file` path.
- **Fail-open lane handling:** if a lane returns `status: failed` or `findings: 0`, record a `research.lane.skipped` event and continue.
- After all lanes return, dispatch `research-consolidator` to merge and deduplicate findings into `workspaces/{feature}/research/research-findings-consolidated.md`.

For codebase-only subjects (`service`, `database`, `api`, `infrastructure`) where external web research adds little value, skip the fan-out and proceed directly to Step 1b.

**Step 1b — Invoke `architect` in research mode** with explicit scope per subject classification:

| Subject | Architect Research Scope |
|---------|--------------------------|
| `service` | Source code, CLAUDE.md, README, CHANGELOG, docs/, API endpoints, config, architecture |
| `database` | Migrations, schema files, models/entities, ER relationships, indexes, access patterns |
| `api` | Route definitions, OpenAPI spec, middleware, request/response types, auth, error handling |
| `library` | Public API surface, exports, usage patterns in codebase, package metadata; pre-digested web findings if fan-out ran |
| `infrastructure` | Dockerfile, docker-compose, CI/CD workflows, deploy scripts, env vars, monitoring |
| `product` | All of the above — full-scope investigation; pre-digested web findings if fan-out ran |

Instruction to architect: "Research mode. Investigate {topic} for documentation purposes. Produce `research/00-research.md` covering architecture, components, data flows, configuration, and key decisions. The output will be consumed by the documenter agent — be thorough but structured."

When consolidated web findings are present (`research/research-findings-consolidated.md` exists): "Pre-digested consolidated web findings are in `workspaces/{feature}/research/research-findings-consolidated.md` — read that file as your primary external evidence base. You may spot-fetch to fill specific gaps the consolidator flagged."

**Multi-topic:** if 2+ topics, dispatch one architect research per topic in parallel (separate workspaces subfolders or sequential research rounds into the same `research/00-research.md` with clear section separation).

Output: `research/00-research.md` in `workspaces/{feature-name}/`.

### Phase 2a — Write

Invoke `documenter` with the research findings and metadata:

```text
Task context:
- research: workspaces/{feature-name}/research/00-research.md
- vault_path: {from Phase 0}
- folder: {from Phase 0}
- language: {from Phase 0}
- subject: {classification from Phase 0}
```

The documenter:
1. Reads `research/00-research.md`
2. Plans the page set (index + sub-pages based on subject classification)
3. Writes all pages to the vault folder with diagram-first layout
4. Writes `02-documentation.md` manifest listing all pages, diagram counts, and Excalidraw/Canvas dispatch requests

Output: Obsidian vault pages + `workspaces/{feature-name}/02-documentation.md`.

### Phase 2b — Diagrams (conditional)

Read `02-documentation.md`. If the manifest lists Excalidraw or Canvas dispatch requests:

- **Excalidraw requests:** dispatch `diagrammer` (Excalidraw agent) per flagged page. Input: the `research/00-research.md` section relevant to the diagram + the target path in the vault. The diagrammer writes `.excalidraw.md` files directly to the vault folder.
- **Canvas requests:** dispatch canvas creation using the json-canvas skill pattern. Input: the page structure from the manifest + node/edge relationships. Output: `.canvas` file in the vault folder.

If no external diagram requests, skip Phase 2b.

**Multi-topic parallel:** when documenting multiple topics, each topic's Phase 2a + 2b runs independently. If worktrees are available, dispatch in parallel.

### Phase 3 — Review

Invoke `qa` in validation mode. The QA agent reads `research/00-research.md` (the source of truth) and the vault folder (the output) and validates:

| Check | Criterion | Verdict |
|-------|-----------|---------|
| **Coverage** | Every major section in `research/00-research.md` has a corresponding doc page | PASS / FAIL |
| **Navigation** | Index page exists with wikilinks to all sub-pages | PASS / FAIL |
| **Diagram density** | Every page has at least 1 diagram (Mermaid or Excalidraw embed) | PASS / FAIL |
| **Diagram-first layout** | Diagrams appear before their explanatory text | PASS / FAIL |
| **Cross-links** | All `[[wikilinks]]` resolve to real pages in the folder | PASS / FAIL |
| **Language** | All prose matches the specified language | PASS / FAIL |
| **Frontmatter** | Every page has valid YAML frontmatter with tags and aliases | PASS / FAIL |
| **No orphan text** | No section longer than 5 paragraphs without a visual | PASS / FAIL |

Output: `reviews/04-validation.md` with per-check verdict + overall PASS/FAIL.

### DOC-GATE — Human Checkpoint

**Pre-gate assertions (automated — run before presenting to operator):**

1. **Pages-on-disk existence check.** Count the vault pages actually present on disk in the target folder. Compare against `pages_created` in `02-documentation.md`:
   - `count(pages on disk) == pages_created` → existence check passes.
   - `count(pages on disk) != pages_created` → **mismatch**: the manifest claims a page that was never written (or a page was written without being registered). Return `status: blocked` with `summary: pages-on-disk mismatch — manifest declares {pages_created} pages but {actual_count} found on disk; re-run documenter to reconcile`. Do NOT present the DOC-GATE to the operator until this is resolved. This is fail-closed: a manifest that claims an unwritten page is a silent documentation gap.

2. **Fidelity outcome check.** Read `reviews/04-validation.md` from Phase 3. If the qa doc-vs-code fidelity check produced any fidelity finding (unbacked documented fact), the DOC-GATE is **blocked** — the fidelity finding must be resolved before human approval is solicited. Refer the qa finding back to the documenter with instructions to correct the specific claim and re-run Phase 3.

Only when both pre-gate assertions pass, present to the operator:

```
Documentation complete: {topic(s)}
Vault: {path}
Folder: {folder name}
Pages: {count} (verified on disk) | Diagrams: {inline + external count}
QA: {PASS or FAIL with details}
Fidelity: {PASS — N claims verified | FAIL — see fidelity findings in reviews/04-validation.md}

Options:
1. Approve — documentation is complete
2. Revise — {specific feedback} → documenter iterates on flagged pages
```

If **revise**: feed the operator's feedback + QA findings back to the documenter for targeted page updates. Max 3 iteration rounds. After each iteration, re-run Phase 3 QA (structural + fidelity) on the updated pages only, then re-run the pre-gate assertions before re-presenting.

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

Each topic gets its own workspaces subfolder pattern: `workspaces/docs-{topic-name}/`. The QA phase validates across all topics to ensure consistency.

### workspaces for documentation pipeline

```
workspaces/{feature-name}/
  00-state.md              # Pipeline state (type: docs)
  00-execution-events.md   # Observability event trace (or .jsonl in local mode) — append-only, one JSON per line
  01-plan.md               # Topics, vault, folder, language, subject classification (§ Review Summary) + task breakdown (§ Task List)
  research/00-research.md  # Architect research findings
  02-documentation.md      # Documenter manifest (pages, diagrams, dispatch requests)
  reviews/04-validation.md # QA validation report
```

### Observability events for documentation pipeline

The orchestrator appends observability events to `00-execution-events` at each phase transition. Required events per phase:

| Phase | Event | When |
|-------|-------|------|
| Phase 0 — Intake | `phase.start` (phase: "0-intake") / `phase.end` (phase: "0-intake") | On enter / on complete |
| Phase 1 — Research | `phase.start` (phase: "1-research") / `phase.end` (phase: "1-research") | On enter / on architect return |
| Phase 2a — Write | `phase.start` (phase: "2a-write") / `phase.end` (phase: "2a-write") | On enter / on documenter return |
| Phase 2b — Diagrams | `phase.start` (phase: "2b-diagrams") / `phase.end` (phase: "2b-diagrams") | On enter / on diagram dispatch complete (or skipped with status: "skipped") |
| Phase 3 — Review | `phase.start` (phase: "3-review") / `phase.end` (phase: "3-review") | On enter / on qa return |
| DOC-GATE | `gate` (gate: "DOC-GATE", decision: "approve\|revise") | On operator decision |

**KG capture stance:** The documentation flow does NOT perform KG capture. It has no Phase 6. The operator-facing pages are the primary output; no `process-insight` node is written to the Knowledge Graph. If a reusable pattern is discovered during research, the operator may write it manually via `/th:kg`.

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

---

## Fast Mode (`--fast`)

**Operator-declared ONLY.** The orchestrator NEVER sets `fast_mode` on its own — only a literal `--fast` in the operator's request triggers it. It is the developer's discretionary lightweight path for very small changes: a version bump, a one-line edit, a trivial copy tweak. It complements User-Initiated Simple Mode — Simple Mode is granular keyword skipping ("skip design", "skip tests"); `--fast` is a single named profile with a fixed skip-set. Applies to any `type`.

**Skips:** Phase 1 Design (no `architect`; the orchestrator emits a one-sentence prose plan into `01-plan.md`, same surface as `type: hotfix`); plan ratification (Phase 1.5); plan review (Phase 1.6); STAGE-GATE-1; the `qa` and `security` agents at Phase 3; Acceptance Check (Phase 3.6); Internal Review (Phase 4.5).

**Keeps — floors that `--fast` can NEVER skip:** Specify (Phase 0b); Implement (Phase 2); the `tester` agent at Phase 3 (run-all / suite no-regression only); Build Verification (Phase 3.75); STAGE-GATE-3 (the human push/PR gate); Delivery (Phase 4 — branch, commit, PR).

**Security design-review carve-out (SEC-002):** `--fast` skips Phase 1.6 in general, but the security design-review is NOT skipped when the task is security-sensitive (path match, semantic keyword match, `[security: required]`, or `type: hotfix` on a security-sensitive path). When the carve-out fires, the `security` agent is dispatched in design-review mode within Phase 1.6. This carve-out is additive to the Tier 3+ hotfix floor — `type: hotfix` still gets its Phase 3 security run via the floor and additionally gets the Phase 1.6 design-review when on a sensitive path. Full definition: `orchestrator.md § "Phase 1.6 is inviolable"` and `orchestrator.md § "Fast mode"` in Phase 0a.

**Security override (hard, non-negotiable):** a security-sensitive path (`auth/**`, `middleware/**`, `api/**`, `db/**`, `security/**`, `crypto/**`, `session/**`, or any path containing `auth`/`permission`) or `[security: required]` forces the `security` agent to run at Phase 3 regardless of `--fast`. For `type: fix | hotfix`, the tier-driven security floor (Tier 3+) is also preserved. `--fast` never bypasses security on sensitive code; the orchestrator announces the override when it fires.

**Acknowledge** the choice to the operator: "Fast mode — skipping plan review, qa, and security (non-sensitive scope). tester, the push gate, and delivery still run." Record `fast_mode: true` in `00-state.md § Current State` and log it under Hot Context.

---

## Artifact Verification in Special Flows

Every special flow that skips phases must explicitly document which artifact verifications are skipped and why. The Artifact Verification Protocol (see `orchestrator.md` § Artifact Verification Protocol) runs for every agent that IS dispatched — it is only exempt for phases that are skipped entirely.

### Research Flow

- **Phases skipped:** 2-5 (implementation, verify, delivery, GitHub update).
- **Artifact verification runs for:**
  - `researcher` lanes (N parallel) → `workspaces/{feature}/research/research-findings-{angle}.md` per lane. The orchestrator gates on each lane's status block. Missing or `findings: 0` lanes record a `research.lane.skipped` event (fail-open, not a failure).
  - `research-consolidator` → `workspaces/{feature}/research/00-research.md` (or `research/research-findings-consolidated.md` for docs-flow). The orchestrator verifies the consolidated findings file exists before dispatching the architect. Checks `material_closeable_gaps` in the consolidator status block for gate evaluation.
  - `architect` → `research/00-research.md`. The orchestrator verifies `research/00-research.md` exists and is non-empty after the architect returns. On termination, verifies `## Residual Gaps` section is present.
  - **Per-round re-dispatch (gap-closure loop):** after each follow-up round, the same artifact verification sequence repeats — researcher lanes → consolidator (amended `research/00-research.md`) → architect (re-synthesized `research/00-research.md`). The orchestrator also verifies the `## Coverage gaps` fenced block is present in `research/00-research.md` after the consolidator and architect return, and that `research_round` in `00-state.md` matches the current loop iteration.
- **Artifact verification skipped for:** `implementer` (not dispatched), `tester` (not dispatched), `qa` (not dispatched), `security` (not dispatched), `delivery` (not dispatched).
- **Phase 3.6 and 4.5:** not applicable (Phases 3-4 skipped entirely).
- **Phase 3.75 (build verification):** not applicable (no implementation to build).

### Spike Flow

- **Phases skipped:** 1 (design), 3-5 (verify, delivery, GitHub update).
- **Artifact verification runs for:** `implementer` → `02-implementation.md`. The orchestrator verifies `02-implementation.md` exists after the implementer returns.
- **Artifact verification skipped for:** `architect` (not dispatched), `tester` (not dispatched), `qa` (not dispatched), `security` (not dispatched), `delivery` (not dispatched).
- **Phase 3.6 and 4.5:** not applicable (Phases 3-4 skipped entirely).
- **Phase 3.75 (build verification):** not applicable (no verify stage).

### Hotfix sub-flow

- **Phases skipped:** Phase 1 (no architect, no `01-root-cause.md`).
- **Artifact verification runs for:** all agents that ARE dispatched — `tester` (Phase 2.0 → `02-regression-test.md`, Phase 3 → `03-testing.md`), `implementer` (Phase 2 → `02-implementation.md`), `qa` (Phase 3 → `reviews/04-validation.md`), `security` (Phase 3 → `reviews/04-security.md`), `delivery` (Phase 4).
- **Artifact verification skipped for:** `architect` (not dispatched — Phase 1 skipped).
- **Phase 3.6 (Acceptance Check):** SKIPPED for `type: hotfix` AND single-file fix (speed override — the only exception to mandatory Phase 3.6). For hotfixes with multi-file scope, Phase 3.6 runs normally.
- **Phase 4.5 (Internal Review):** SKIPPED for `type: hotfix` AND single-file fix (speed override — the only exception to mandatory Phase 4.5). For hotfixes with multi-file scope, Phase 4.5 runs normally.
- **Phase 3.75 (Build Verification):** runs normally (hotfix code must still compile).

### Simple Mode (user-initiated)

- **Phases skipped:** only what the user requested (see above).
- **Artifact verification runs for:** all agents that ARE dispatched in the remaining phases.
- **Artifact verification skipped for:** agents in phases the user explicitly skipped.
- **Phase 3.6 and 4.5:** run normally if verify and delivery phases are not skipped. If the user says "just implement" (skip Design + Verify), Phase 3.6 and 4.5 are not applicable.
- **Phase 3.75 (Build Verification):** runs if Phase 3 (verify) runs; skipped if the user skipped verify.

### Fast Mode (--fast, operator-declared)

- **Phases skipped:** 1 (Design — no `architect`), 1.5, 1.6, STAGE-GATE-1; Phase 3 `qa` + `security` (unless a sensitive path / `[security: required]` forces security); 3.6; 4.5.
- **Artifact verification runs for:** `implementer` → `02-implementation.md`; `tester` → `03-testing.md`; `delivery` (Phase 4). The orchestrator verifies each exists after the agent returns.
- **Artifact verification skipped for:** `architect` (not dispatched — one-sentence prose plan in `01-plan.md` instead), `qa` (not dispatched), `security` (not dispatched, unless the sensitive-path override fires).
- **Phase 3.75 (Build Verification):** runs — the change must still build and the suite must pass.

---

## Plan Sketches — Per-Type Applicability

This section defines which task types and tiers produce a classification block and `sketches/*` files. The canonical reference is `docs/plan-sketches.md § 7`.

| Type / Tier | Classification block? | Always-sketches (collapsed surfaces) | Conditional sketches (`sketches/*`) | sketch-guard.sh invoked? |
|-------------|----------------------|-------------------------------------|----------------------------------------|--------------------------|
| `feature` / `refactor` / `enhancement` | Yes — architect records in `00-state.md` and mirrors in `01-plan.md § Review Summary → ### Classification block` | Yes — functional-acceptance AC in `§ Task List`; non-functional notes in `§ Architecture` | Per booleans: the architect produces every triggered file | Yes, at STAGE-GATE-1 |
| `fix` Tier 2-4 | Yes — architect root-cause mode records in `00-state.md`; defaults false unless fix touches a contract surface | Yes (minimum AC in `§ Task List`) | Rare — only if the fix modifies a contract surface (e.g., the fix adds an endpoint); booleans default false | Yes — no-op pass when all-false |
| `fix` Tier 1 / `hotfix` | No architect → orchestrator records all-false block when it self-authors `01-plan.md` | Yes (minimum 4-line AC) | None (all-false by orchestrator self-author) | Yes — no-op pass (empty required set) |
| `fix` Tier 0 / `docs` Tier 0 | **Exempt** — no workspace (CLAUDE.md §5 observability exemption) | n/a | n/a | Not invoked (no `00-state.md`) |
| `docs` flow (Tier ≥1) | Architect docs-research mode → orchestrator records all-false block (docs do not touch product contracts) | Yes (minimum AC in `§ Task List`) | None | Yes — no-op pass |
| Research / Spike | No — architect does not produce `01-plan.md` § Task List with per-task AC | n/a | n/a | Not invoked (research/spike have no STAGE-GATE-1) |

**Recording contract for self-authored plans (fix Tier 1 / hotfix / docs):** when the orchestrator self-authors `01-plan.md`, it MUST add the `### Classification block` subsection to `## Review Summary` with all seven booleans set to `false`. This satisfies the plan-reviewer Rule 11 classification-block check and ensures `sketch-guard.sh` receives a valid state file at STAGE-GATE-1.

**Fast Mode:** the architect is not dispatched — the orchestrator writes a one-sentence prose plan. Classification block: all-false (same as self-authored path above). Sketch-guard: invoked as a no-op pass. `sketches/*`: none produced.

---

## Learn (Teaching) Flow

When the operator asks to learn, understand, or have something explained (trigger: `/th:learn`, `learn` direct mode, or the Step 6a intent patterns for teach/explain):

### Flow summary

1. **Intake** — classify as `learn` (read-only direct mode)
2. **MANDATORY — Query KG** — call `search_nodes` with 1-2 semantic queries. Write `00-knowledge-context.md` if results found. If the Knowledge Graph MCP fails, log "KG: unavailable" and continue.
3. **Resolve workspace path** — use the `docs_root` / `logs_mode` from `00-state.md`. The mentor is mode-unaware; pass the resolved path in the dispatch.
4. **Answer in chat conversationally** — the top-level agent (in dev mode) acts as the conversational tutor: answer at the altitude asked, include a short inline Mermaid diagram, apply progressive disclosure (answer what was asked, then offer the next layer). No document is produced. No routing narration in chat.
5. **Research only when needed** — code-answerable questions: Read/Glob/Grep the repo, zero web. Web or context7 fires only on a genuine knowledge gap that blocks the answer. Prefer background or parallel research to avoid freezing the dialogue.
6. **Dispatch `mentor` ONLY for (a) or (b):**
   - **(a) Optional end-of-session pack** — when the operator accepts the offer "want this saved as a pack?", dispatch the mentor with the topic and workspace path. The mentor writes `00-teaching-pack-{topic-slug}.md`.
   - **(b) Genuinely deep or background research** — when the topic requires extended multi-source research that would freeze the chat, dispatch the mentor to do the research in the background and return a summary.
7. **Re-dispatch the mentor for drill-downs** — when the operator asks about a topic not already covered, re-invoke the mentor with the drill-down question and `Resume: true`. The mentor appends a new layer or sub-section to the existing pack and returns.

### Scope-set detection (mentor responsibility)

The mentor classifies each request into a SET from `{concept, library/framework, codebase}` and sources each element:
- `codebase` → Read/Glob/Grep + context7 for discovered deps
- `library/framework` → context7 with WebSearch/WebFetch fallback
- `concept` / language → WebSearch/WebFetch (official docs, specs)

Auto-detects the framework from project dependencies even when unnamed.

### Teaching-pack file convention

- File: `00-teaching-pack-{topic-slug}.md` in the workspace (obsidian or local, resolved via `logs_mode`)
- One pack per topic; resumable across sessions
- On resume, the mentor reads the existing pack and continues from the last completed layer — never overwrites prior content

**Resume flag:** pass `Resume: true` in the dispatch payload to trigger pack continuation.

### Multi-turn conversational loop

```
operator asks question
  → top-level answers in chat with short inline diagram (no dispatch, no document)
  → operator follows up
     → answer follow-up in chat
     → if operator accepts pack offer: dispatch mentor → mentor writes pack
     → if drill-down not answerable inline: re-dispatch mentor (Resume: true, drill-down topic)
        → mentor appends to pack or returns summary
        → top-level continues in chat from returned content
```

The common path never dispatches the leaf agent. The pack grows only when the operator explicitly accepts the end-of-session offer, or when a drill-down requires extended background research.

### v1 exclusions

- The mentor NEVER dispatches a `diagrammer`, `d2-diagrammer`, or `likec4-diagrammer` agent. It MAY suggest `/th:diagram` or `/th:d2-diagram` when a richer rendered diagram would help — but the invocation is operator-initiated, not mentor-initiated.
- No comprehension quizzes or exercises (v2 candidate).
- No learning-progress KG nodes (v2 candidate — must respect `docs/kg-content-policy.md` if added).
