---
name: ref-special-flows
description: Reference file for the coordinator's special flows (research, spike, plan, parallel dispatch, refactor, docs, simple). Read on-demand by th:orchestrator — not a standalone agent.
model: opus
color: cyan
---

# orchestrator — Special Flows Reference

This file is read on-demand by `th:orchestrator` when executing a special flow. It is NOT part of its system prompt.

**One coordinator, two postures.** `th:orchestrator` serves these direct flows from its startup kernel. When `/th:pipeline` is active, classification and phase pointers resolve to `agents/ref-pipeline.md`; conditional intake details remain in `agents/ref-intake-flows.md`. No flow dispatches another coordinator.

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
   - **Implement:** reclassify the pipeline and re-enter the pipeline with all gates:
     a. Determine the new type: `refactor` if the research identified structural changes to existing code; `feature` if it identified new functionality to build.
     b. Append reclassification event: `{"ts":"<ISO>","event":"pipeline.reclassify","from":"research","to":"<new_type>","reason":"operator chose implement"}`.
     c. Update `00-state.md`: set `type:` to the new classification, reset `phase:` to `0b`, set `status: in_progress`. Add to Hot Context: `Reclassified from research to {type}. research/00-research.md is input context for design.`
     d. Re-enter the pipeline at **Phase 0b (Specify)**. The `research/00-research.md` feeds the architect's design phase as prior analysis — it is NOT a substitute for `01-plan.md`.
     e. **All gates are mandatory:** STAGE-GATE-1, Phase 3 (verify), STAGE-GATE-3. The Phase Gate Prerequisites (§ Phase Checkpointing in `orchestrator.md`) enforce this mechanically.
     f. If the architect produced a `01-plan.md` during the research session (e.g., the operator asked for a plan before deciding to implement), the coordinator validates it as the design artifact and presents the normal STAGE-GATE-1. `/th:plan-review` remains available only when explicitly invoked; no automatic ratification or review phase is inserted.
   - **Discard:** clean up workspaces, mark pipeline as `complete` with `summary: research discarded by operator`.
   - **Investigate further — bounded gap-closure loop (coordinator-owned):** After each consolidation+synthesis round, the coordinator reads the `## Coverage gaps` fenced block from `research/00-research.md` and evaluates the gate:

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

   **Non-overlap rule (mandatory):** The coordinator states each lane's boundary (its path-set or concern) explicitly in the dispatch. Boundaries MUST partition the search space — no two lanes own the same file for the same purpose. Overlap wastes sonnet spend and produces duplicate findings the consolidator then has to dedup.

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
11. **Act on user's choice** — same options as Research Flow (implement → pipeline reclassification; discard → clean up; investigate further → bounded gap-closure loop below).
12. **Bounded gap-closure loop (coordinator-owned) — extended gate:** After each consolidation + synthesis round, the coordinator reads the `## Coverage gaps` fenced block from `research/00-research.md` and evaluates the gate:

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
| **Route** | Routes through the coordinator (this flow); produces one consolidated `research/00-research.md` | Standalone skill; does NOT route through the coordinator; uses tmux fan-out |
| **Output** | One `research/00-research.md` with hybrid evidence + conflict detection + gap-closure loop | Per-repo architect+security+qa+tester audits; `00-consolidated.md`; profile/contract validation |
| **Agents** | `code-researcher` (sonnet) + optional `researcher` (haiku) + `research-consolidator` + `architect` | `architect`, `security`, `qa`, `tester` (per repo); separate workspaces per repo |
| **When to use** | "How does the retry logic work across the gateway and the worker services?" | "Does the payment service honor the idempotency contract declared in the API profile?" |

Use `/th:research-code --multi-repo` when the question is about understanding code behavior. Use `/th:cross-repo` when the question is about contract compliance and invariant validation.

---

## Spike Flow

When the user wants to quickly test a technical hypothesis without pipeline ceremony:

**Observability:** spike mode is a named observability exemption — it writes no `00-state.md` and no `00-execution-events` file. Its workspace is intentionally invisible to `/th:pipelines` and `/th:recover`. See `docs/observability.md § Lightweight direct-mode exemptions`.

1. **Intake** — classify as `spike`, complexity always `simple`
2. **MANDATORY — Query KG** — call `search_nodes` with 1-2 semantic queries. Write `00-knowledge-context.md` if results found.
3. **Skip Design** — no architecture proposal needed
4. **Create an isolated spike worktree** — require a clean source checkout, then create a
   dedicated worktree and `spike/{slug}` branch from the current immutable `HEAD`. Record its
   canonical path, branch, baseline commit, and initially empty changed-path set. Never run a
   spike in the operator's existing worktree or share its index.
5. **Prepare minimal spec context** — just: description, what to test, success criteria (passed inline to the implementer dispatch)
6. **Invoke `implementer` in the isolated worktree** with: "This is a spike — write exploratory code to test: {description}. No tests needed. Focus on proving whether {hypothesis} works. Document what you found in `02-implementation.md`." After it returns, derive and record the exact spike-owned tracked and untracked paths from that worktree's status.
7. **Skip Phases 3-5** (no testing, validation, delivery, or GitHub update)
8. **Present results** to the user:
   ```
   Spike complete: {summary}

   Options:
   1. Formalize as feature → I'll create an issue with findings as technical context
   2. Discard → I'll remove the isolated spike changes and worktree
   3. Investigate further → I'll run another spike or a /th:research
   ```
9. **Act on user's choice:**
   - Formalize: create GitHub issue using **SDD template** — include spike findings in Technical Context. **Detection + fallback:** see `agents/_shared/gh-fallback.md` § "Tier B — create an issue". When `has_gh=true`: `gh issue create`. When `has_gh=false` and token + GitHub origin available: curl POST. When neither: write SDD body to `workspaces/{feature}/inputs/issue-create.md` and prompt operator to paste it into GitHub, then reply with the new issue number. Ask: "Issue created (or paste required). Run pipeline now?"
   - Discard: confirm with the user, then revalidate the worktree using `git worktree list
     --porcelain` and `git status --porcelain`. Require its canonical path, branch, and baseline
     to match the recorded spike and require every changed path to be in the recorded
     spike-owned set. Restore only those explicit tracked paths from the recorded baseline and
     remove only those explicit untracked paths; never run `git checkout -- .`, `git restore
     .`, a wildcard clean, or another repository-wide reset. Require the isolated worktree to
     be clean before removing that exact worktree and spike branch. Any mismatch stops and is
     surfaced instead of touching either worktree. Clean up only spike-owned workspace output.
   - Investigate: continue as directed.

---

## Plan Flow

Two modes: `plan` (analysis only) and `plan-and-execute` (analysis + pipeline per task).

**Distinction from normal pipeline mode.** Plan flow's architect output is `01-planning.md` — a task breakdown for **multi-task batch orchestration** across worktrees, with dispatch labels (BLOCKER / PARALLEL / CONVERGENCE / SEQUENTIAL) and size estimates. This is structurally different from `01-plan.md`, which the architect produces in **normal pipeline mode** (single-feature, sequential tasks, per-task ACs in Given/When/Then). The two files coexist for different consumers:

| File | Mode | Consumer | Purpose |
|---|---|---|---|
| `01-planning.md` | planning mode (`/th:plan`, `/th:plan plan-and-execute`) | coordinator (single-plan, multi-task dispatch) | break a broad scope into N tasks in one plan |
| `01-plan.md` | design mode (normal pipeline) + **milestone build** (single-repo `type: plan`) | implementer + qa + plan-reviewer | merged architecture + task list (§ Architecture + § Task List); milestone-build home |

**Milestone build disambiguation.** A `type: plan` single-repo milestone build is a third, distinct consumer for `01-plan.md`. The architect writes the milestone decomposition INTO `01-plan.md` (Work Plan with milestones M0…MN). This is NOT `01-planning.md` (multi-task batch). See the milestone-build section below for the full contract.

**`plan-and-execute` no longer spawns one orchestrator per task.** A prior revision had each task dispatched by `plan-and-execute` run as its own `th:orchestrator` instance, each witnessing its own STAGE-GATE-1/3 independently, tracked by a separate `th:leader` progress roster. That model required the coordinator to dispatch another coordinator, which the fused contract forbids absolutely, with no exception for this mode (`agents/ref-pipeline.md § "Dispatch invariants"` #2). `plan-and-execute` now feeds the SAME single-coordinator, single-plan model as § "Multi-Task Handling" above: the tasks `01-planning.md` broke out become `01-plan.md § Task List` rows, and one `th:orchestrator` runs Stage 1 → STAGE-GATE-1 → Stage 2 → Stage 3 → STAGE-GATE-3 once, over the whole set — never once per task.

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

**Governing invariant:** a build is identified by IDENTITY, never the date. `th:orchestrator` never creates a new plan or workspace because the date changed. No code path may branch "new date → new workspace."

**Milestone definition.** A milestone is an internal unit of work-division WITHIN ONE TASK that maps to ONE COMMIT on the single feature branch. Milestones are NOT deliverables and NOT PRs — they are commit-sized steps that (a) produce a clean granular history and (b) can be PARALLELIZED when independent. The task ships as ONE PR at the end after all milestones are complete.

**PROHIBITED — per-milestone artifact splitting:** Per-milestone-suffixed filenames (e.g., `02-implementation-m{N}.md`, `03-testing-m1.md`) and `{NN}_{milestone}/` child folders (e.g., `01_m0-skeleton/`, `02_m1-api/`) are explicitly PROHIBITED. Agents that create these are in defect.

**Stage files are FLAT, whole-task, and there is exactly ONE set per workspace.** No suffix of ANY kind is permitted on a stage filename. This prohibits not only per-milestone suffixes (`02-implementation-m{N}.md`) and `{NN}_{milestone}/` child folders, but ALSO any "second-cycle" / "second delivery cycle" suffix such as `02b-implementation.md`, `03b-testing.md`, `04b-*.md`. There is no "second delivery cycle" convention in team-harness — inventing an undocumented file-naming convention is itself a defect. One task = one workspace = one set of stage files (`02-implementation.md`, `03-testing.md`, `reviews/04-security.md`, `reviews/04-validation.md`), each whole-task. A second PR or a second pass within the same workspace REUSES these flat files; it never mints a parallel suffixed set.

**Operator-authority invariant — the pipeline never divides a task.** A single task's plan and its implementation are NEVER autonomously divided by the pipeline — not into multiple delivery groups, not into multiple stage-cycles, not into multiple workspaces. Dividing a scope into multiple workspaces is the OPERATOR's responsibility and decision. If the architect or the coordinator judges a scope too large for one task, it SURFACES that judgment to the operator (a decision in `01-plan.md § Review Summary → ### Decisions for human review`, or a STAGE-GATE STOP) — the operator decides whether to split into multiple workspaces. No agent splits a task's plan or implementation on its own authority.

**Reconciling clause — decomposition vs division.** This invariant governs DIVISION of a single task; it does NOT prohibit the coordinator's always-run decomposition analysis (`agents/ref-pipeline.md § "14–17"`). A scope that decomposes into genuinely-independent tasks is identified by that analysis and becomes N rows of the SAME `01-plan.md § Task List`, implemented in the coordinator's single Phase 2 dispatch and consolidated into one PR by default — that is not "dividing a task." Decomposition operates at the TASK-IDENTIFICATION axis (finding independent tasks up front, always run, autonomous); this invariant governs the DELIVERY axis (never fragment one already-identified task, never mint separate operator-facing workspaces without operator sign-off). The two are complementary, not in tension.

**Third parallelism axis — intra-task execution-lane fan-out (distinct from both of the above).** The lane-decomposition mechanism (`agents/ref-pipeline.md § Phase 2 — Implementation → Intra-task execution-lane decomposition`) is a THIRD, narrower axis, distinct from both TASK-IDENTIFICATION (the decomposition analysis above) and the inter-task DAG scheduler (`Depends on:` rounds, `agents/ref-pipeline.md` Stage-2 scheduler): it fans out the EXECUTION of a SINGLE already-approved, already-undivided task into bounded parallel implementer lanes — one per architect-declared, file-disjoint seam — when the task's `Files:` count meets `LANE_DECOMPOSE_MIN_FILES` and its seams are genuinely disjoint. The DELIVERABLE (plan, commit set, PR) is never divided; only EXECUTION may fan out into bounded lanes, capped at `LANE_CAP` per task and `GLOBAL_ROUND_CONCURRENCY_CAP` per round — a task whose lanes fan out still ships as exactly one plan, one implementation record, one commit set, one PR. Full contract, caps, and the seam-not-disjoint fallback: `agents/ref-pipeline.md § Phase 2 — Implementation → Intra-task execution-lane decomposition` and `docs/parallel-batch-implementation.md § Intra-task lane fan-out`.

### Batch consolidation vs the anti-split invariant

These two rules are the same constraint read from two directions:

- **Anti-split invariant (single-task reading):** A single task is NEVER split across multiple delivery groups. The Operator-authority invariant above is the governing statement — no agent divides a task's plan or implementation on its own authority. A single task always belongs to exactly one group in `§ Delivery Grouping`.
- **Consolidation default (multi-task reading):** A same-repo batch of independent tasks consolidates into ONE PR by default (`Delivery Grouping: all-tasks-one-pr`). `docs/parallel-batch-implementation.md` is the governing statement — all tasks land on one branch inside the single coordinator's one Phase 2 dispatch, the version bumps once, the changelog is one consolidated entry, and exactly one PR covers all batch work. Do NOT open one PR per batched task.

Read together: a task is never SPLIT across delivery groups (anti-split), and a same-repo batch consolidates INTO one PR by default (consolidation default). There is no contradiction — one rule prevents explosion outward (splitting a task across groups), the other prevents explosion inward (one PR per task in a batch). Neither rule claims a fixed "one task = one PR" identity; the actual task-to-PR mapping is declared per plan by `§ Delivery Grouping`.

**Operator opt-out.** The operator — and only the operator — may override the consolidation default by requesting separate PRs ("keep them as separate PRs" / "separate PRs"). On opt-out, each task ships as its own PR via serial merge (open Task-N+1's PR only after Task-N's PR lands on fresh `main`; never stacked). The coordinator never chooses separate PRs on its own authority.

**Genuine blocker (the only non-opt-out reason for separate PRs in a same-repo batch).** Absent an operator opt-out, the coordinator splits a batch into separate PRs ONLY for: (a) an UNRESOLVABLE merge conflict between task branches at consolidation Step 5a; or (b) a temporal-prod / cross-repo deploy reason from the plan-reviewer's existing closed list — `coexistence window`, `production signal`, `cross-repo deploy gate` (see `agents/plan-reviewer.md § Rule 1`). No new blocker categories exist.

**Same delivery flow alignment.** The consolidated batch ships through the same single Delivery prose dispatch and coordinator publication mechanics as a single task, with the same review → merge → next-session preflight-sweep lifecycle (`docs/worktree-discipline.md` Rule 7). There is no separate batch-delivery path. The only structural difference is that publication operates on the `batch/<name>-verify` integration branch (Step 5a) rather than a single-task branch.

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

When the operator says "implement M0" (or "build M1", "execute milestone X"), the coordinator:

1. Extracts the plan identity slug from the task description.
2. Runs the date-agnostic glob + frontmatter confirm (identical to the initiative JOIN rule) to locate the plan workspace by identity.
3. On confirmed match: resumes the SAME plan workspace as `docs_root` — this is the detect-and-continue path. No new top-level sibling workspace is created; no `{NN}_{milestone-slug}/` sub-folder is nested.
4. On no match: treats the task as a standalone pipeline (normal behavior).

The detect-and-continue check runs in `agents/ref-intake-flows.md § "Milestone Continuity"` before composing a fresh `docs_root`. Milestone execution continues inside the plan's workspace instead of minting a sibling `{date}_{feature}` folder.

### Independent milestones: parallelization + convergence

**Parallelization.** The milestone breakdown in `01-plan.md` carries per-milestone dependency annotations (`independent` vs `depends-on-Mx`). Independent milestone implementations MUST be PARALLELIZED whenever dependencies allow, reusing the #285 in-message concurrent-`Task` mechanism at MILESTONE granularity within ONE workspace. Dependent milestones serialize in dependency order.

**Convergence (race-free, one commit per milestone).** Each parallel lane implements its milestone in an isolated worktree (no file-system race between lanes). At the convergence barrier the consolidator `th:orchestrator` applies each completed lane's diff as ONE COMMIT to the single feature branch, in dependency order. Commits are applied serially to the branch — never concurrently — so the history is deterministic: one commit per milestone, dependency-ordered.

**Result:** one feature branch, one commit per milestone (in dependency order), ONE PR opened at the end after STAGE-GATE-3.

**Concurrency cap.** Reuse `batch_concurrency` (default 5); a milestone fan-out larger than the cap splits into waves using the same eager slot-fill rule as the worktree batch model.

### Build-level milestone index

The plan's `00-state.md` carries a `## Milestone Index` table. The owning `th:orchestrator` maintains it with the same read-modify-write rule as the initiative parent index: read full `00-state.md`, replace the row for this milestone slug in-place (never duplicate), write the whole file back.

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

**Code-hygiene scan (Phase 2.6).** Runs once per Phase 2-close over the WHOLE-TASK diff accumulated so far — not per milestone. See `docs/code-hygiene-gate.md § Layer 1` for the pinned command; the mechanic is identical to the feature flow.

---

## Multi-Task Handling (DEFAULT for 2+ tasks in one project)

**No separate coordinator instance per task.** A prior revision of this section described the
coordinator fanning out one `th:orchestrator` instance per task, each in its own worktree, later
consolidated by a second agent. That mechanism — Multi-Task fan-out and its consolidator — is
retired (measured at 0.6% of runs, both instances operator overrides;
`agents/ref-dispatch-machinery.md § "What left this file"`). The coordinator never dispatches
another coordinator, including another copy of itself
(`agents/ref-pipeline.md § "Dispatch invariants"` #2, absolute, no exception).

**What replaces it: N tasks in ONE plan, ONE Phase 2 dispatch.** The always-run decomposition
analysis (`agents/ref-pipeline.md § "14–17"`) identifies genuinely independent tasks up front; the
architect writes them as `01-plan.md § Task List` rows ordered by their `Depends on:` DAG, and
Phase 2 is **exactly one `implementer` dispatch covering every task** — never one per task
(`agents/ref-pipeline.md § "Scheduler — never one dispatch per task"`). Intra-task file-level
parallelism, when a single task's own scope is large enough, uses
`agents/ref-pipeline.md § "Intra-task lane decomposition"` — implementer lanes sharing ONE worktree
and branch, consolidated by the coordinator as sole committer. One plan, one pipeline run, one PR
by default (`Delivery Grouping: all-tasks-one-pr`).

**Entry points that lead here:**
- `/th:plan plan-and-execute` → architect produces task breakdown → one plan, N tasks
- `/th:issue #1 #2 #3` → multiple issues → one plan, N tasks
- User requests batch/parallel work → coordinator runs Specify + a planning-mode `architect` dispatch
- coordinator identifies broad scope needing breakdown → auto plan-and-execute

### Ordering within the single Phase 2 dispatch

Tasks in later DAG positions depend on code from earlier ones. The implementer works through every
task in dependency order in one continuous pass inside the same worktree and branch, committing
once per task as its edits close — there is no per-round branch-from-parent, because there is no
per-round worktree to branch. This mirrors how a single developer works through a dependency-ordered
stack of commits on one branch.

---

## Bug-fix Flow

A `type: fix` request uses the same gated pipeline only after explicit live
activation or recovery. Bug severity is metadata (`bug_tier: 1|2|3|4`) that
controls root-cause and evidence depth after activation; it never selects an
inline/pipeline posture and never creates a workspace by itself. A small
non-sensitive fix may remain inline under the ordinary predicate, and a
sensitive fix may remain inline only when the current live operator explicitly
selects `inline`. No second confirmation, legacy marker, or tier-zero route
changes that decision.

### Tier System (4 tiers)

- **Tier 1 — Docs/Trivial:** non-functional documentation or comments; no root-cause
  artifact; regression evidence may be skipped only under the conditional rule.
- **Tier 2 — Light fix:** light root-cause analysis and mandatory regression evidence.
- **Tier 3 — Standard fix:** full root-cause analysis, mandatory regression evidence,
  and security validation when the security floor applies.
- **Tier 4 — Critical/Security:** Tier 3 plus mandatory prior-art query and extended
  security analysis.

Signals may promote a tier: security-sensitive paths and high-risk keywords take
priority, an ambiguous fix defaults to Tier 3, and a hotfix has a Tier 3 minimum.
Operator tier text is metadata only; retired mode and profile markers are never mapped.

#### Tier 1 regression-test conditional skip

Skip pre-fix regression evidence only when the tier is 1, all touched paths are
documentation/comments/non-functional strings, no test path is touched, and the
operator did not require regression evidence. Otherwise promote to Tier 2.

#### Worked examples

A documentation typo can stay inline when the direct predicate passes. A production
bug uses Tier 3 metadata once the operator activates the pipeline. An auth bypass
uses Tier 4 metadata and the security floor. None of these examples activates a
pipeline from content or a legacy marker.

### Full workspaces artifact set (type: fix)

After explicit pipeline activation, the normal plan, implementation, testing,
validation, and delivery artifacts apply. Tier 1 may omit root-cause and
pre-fix regression artifacts only under its conditional rule; Tiers 2–4 keep
their required evidence and security artifacts.

### Phase structure (type: fix)

The pipeline retains its ordinary design, implementation, validation, and delivery
states and its operator gates. Tier metadata changes only the specialist depth
and evidence obligations inside those states.

### Plan-reviewer Rules 7 + 8 (gated on type: fix | hotfix)

Plan review is never automatic. It runs only when the live operator explicitly
requests the direct plan-review mode.

### qa validate-mode for type: fix | hotfix

Validation runs only after implementation Freeze in the explicitly activated
pipeline. A failed or incomplete security result returns to implementation and
fresh validation; no legacy marker can bypass it.

### Type classification — auto-detect bug-fix vs hotfix

Use the explicit request type. A hotfix records `bug_tier: 3` minimum and
requires the security floor after activation.

### Multi-bug requests

Keep one explicit pipeline request per task unless the operator explicitly chooses
a separate direct scope; never create a workspace or route from a marker.

### Security-Sensitive Flow (extended)

Sensitive bug work keeps the security controls of the pipeline when the operator
chooses it. Explicit live inline work remains direct, with warnings/audit notes
informational and native runtime approvals unchanged.
## Hotfix sub-flow (type: hotfix)

A hotfix is a pipeline request only after explicit live activation or recovery.
It records `bug_tier: 3` minimum (or 4 when promoted) as metadata and keeps
the ordinary pipeline gates and security obligations. It does not create a
workspace from urgency text, Fast/Simple wording, a tier marker, or any other
content.

### Skipped phases (relative to type: fix)

The root-cause specialist may be skipped under the hotfix plan contract. The
operator still receives the normal pipeline plan and gate presentation after
activation.

### Modified phases

The coordinator may self-author the hotfix plan and regression evidence when its
contract permits. No automatic plan review is inserted; `/th:plan-review`
remains available only when the live operator asks.

### Unchanged from type: fix

Implementation, testing, validation, security review, delivery, and all pipeline
gates remain mandatory after activation. Native runtime and outward-action
approvals remain independent.
## Security-sensitive validation (extended)

1. A sensitive plan receives the required design security review before implementation.
2. Validation dispatches the conditional adversarial audit against the current Freeze anchor.
3. Every correctable `broke-it` result or incomplete changed-control coverage blocks delivery,
   returns to implementation, rebuilds Freeze, and receives a fresh delta audit.
4. A non-security correctable finding remains governed by the ratchet (`agents/ref-pipeline.md §
   "The ratchet"`): a sub-floor residual on unchanged surface after a prior correction round
   records to the findings ledger instead of reopening implementation again.
5. A genuinely structural contradiction is surfaced for an explicit operator design decision;
   it is never silently downgraded to a warning.
6. If a required finding remains unresolved when the iteration limit is exhausted, set the run
   to `blocked` and stop before Gate 3 or delivery. No iteration cap waives a security finding.

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
2. **Design** — architect focuses on target structure, not new features. The single-file output contract applies: `01-plan.md` (pipeline v3). Per-task ACs in refactor mode use the `VERIFY:` format predominantly rather than Given/When/Then.
3. **Implement** — implementer receives: "This is a refactor. Do NOT change behavior. Existing tests are your contract. Only change structure/organization. Per-task scope from `01-plan.md` (§ Task List) `Files:` field still applies."
4. **Verify** — tester runs **existing tests first** before writing new ones. If existing tests fail → the refactor broke something. New tests only for structural improvements (e.g., new module boundaries).
5. **Delivery** — as normal, gated by STAGE-GATE-3.

The key difference: existing passing tests are the safety net. If they break, the refactor is wrong. **The 2-gate flow still applies**: STAGE-GATE-1 (human approves the refactor plan), STAGE-GATE-3 before push.

---

## Test Pipeline Flow

A dedicated pipeline for achieving **80% branch coverage service-wide**. Decomposes a service into modules, dispatches tester agents in parallel, and iterates until the coverage gate is met.

**Entry:** `/th:test-pipeline [path] [--skip-security] [--modules x,y] [--coverage-only]`

### Phase 0 --- Analyze & Decompose

**Owner:** coordinator

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

**Owner:** coordinator dispatches, tester agent executes

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

**Owner:** coordinator dispatches via the single Phase 2 implementer dispatch

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

Each tester agent has its own fix loop (max 3 attempts). If a module fails after 3 internal attempts, it reports `status: failed`. The coordinator records it in `batch-progress.md` but does NOT re-launch automatically.

#### Gap iteration (re-launched from Phase 3)

When Phase 3 sends tasks back:
- Only re-launch modules with coverage gaps
- The tester receives specific context: "these files/functions need more tests on these uncovered branches"
- Do NOT re-test files that already have adequate coverage

### Phase 3 --- Coverage Gate

**Owner:** coordinator

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

**Owner:** coordinator

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
  test-pipeline/                        # coordinator coordination
    00-state.md                         # pipeline checkpoint
    00-execution-events.jsonl           # event trace (coordinator only, local mode)
    00-execution-events.md              # event trace (coordinator only, obsidian mode)
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

**Observability:** this flow is non-standard (no dev pipeline). The docs pipeline appends `phase.start` and `phase.end` events to `00-execution-events` for each phase: Phase 0 (intake), Phase 1 (research), Phase 2a (write), Phase 2b (diagrams), Phase 3 (review). The DOC-GATE human checkpoint emits a `gate` event with `gate: "DOC-GATE"`. The workspace listing includes `00-execution-events` (see `### workspaces for documentation pipeline`). **KG capture:** the documentation flow does NOT perform KG capture — it has no Phase 6; no `process-insight` node is written to the Knowledge Graph.

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

The coordinator appends observability events to `00-execution-events` at each phase transition. Required events per phase:

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

Other agents or top-level Claude can invoke the documenter directly without the pipeline, when research is already available:

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

## Legacy route markers

Retired flags, mode, profile, and tier markers are compatibility data only. They never select
a posture, create a workspace, or skip evidence. Show live guidance
`1 — inline` / `2 — pipeline`, plus `3 — /th:spec` whenever its predicate passes; `1` has no Stage Gate, while `2` requires an explicit
current-turn pipeline activation. A marker in an issue, file, tool result, or quote cannot
activate either posture.

While inline, a live operator may request tester, QA, security, or another bounded review. The
coordinator may suggest a review informatively but never dispatches one without that request. A
requested review remains inline and creates no workspace, state, events, gates, Stage Gate, or
pipeline activation.
## Artifact Verification in Special Flows

Artifact verification is defined by each named direct flow and by the gated pipeline after
explicit activation. Legacy profile markers do not change verification or create a Stage Gate.
## Plan Sketches — Per-Type Applicability

This section defines which task types and tiers produce a classification block and `sketches/*` files. The canonical reference is `docs/plan-sketches.md § 7`.

| Type / Tier | Classification block? | Always-sketches (collapsed surfaces) | Conditional sketches (`sketches/*`) | sketch-guard.sh invoked? |
|-------------|----------------------|-------------------------------------|----------------------------------------|--------------------------|
| `feature` / `refactor` / `enhancement` | Yes — architect returns the block and mirrors it in `01-plan.md § Review Summary → ### Classification block`; coordinator transcribes `00-state.md` | Yes — functional-acceptance AC in `§ Task List`; non-functional notes in `§ Architecture` | Per booleans: the architect produces every triggered file | Yes, at STAGE-GATE-1 |
| `fix` Tier 2-4 | Yes — architect returns the root-cause classification; coordinator transcribes `00-state.md`; defaults false unless fix touches a contract surface | Yes (minimum AC in `§ Task List`) | Rare — only if the fix modifies a contract surface (e.g., the fix adds an endpoint); booleans default false | Yes — no-op pass when all-false |
| `fix` Tier 1 / `hotfix` | No architect → orchestrator records all-false block when it self-authors `01-plan.md` | Yes (minimum 4-line AC) | None (all-false by orchestrator self-author) | Yes — no-op pass (empty required set) |
| direct inline implementation | **Exempt** — no pipeline artifacts | n/a | n/a | Not invoked (no `00-state.md`) |
| `docs` flow (Tier ≥1) | Architect docs-research mode → coordinator records all-false block (docs do not touch product contracts) | Yes (minimum AC in `§ Task List`) | None | Yes — no-op pass |
| Research / Spike | No — architect does not produce `01-plan.md` § Task List with per-task AC | n/a | n/a | Not invoked (research/spike have no STAGE-GATE-1) |

**Recording contract for self-authored plans (fix Tier 1 / hotfix / docs):** when the orchestrator self-authors `01-plan.md` (including for `docs` flow), it MUST add the `### Classification block` subsection to `## Review Summary` with all nine design-classification booleans set to `false`. The coordinator, never the architect, transcribes that block into `00-state.md`; `sketch-guard.sh` then receives a valid state file at STAGE-GATE-1.

**Direct inline:** the coordinator performs only the requested bounded edit; no plan, sketch, or
Stage Gate is created. A live operator-requested review remains ad hoc and does not activate the
pipeline.

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
