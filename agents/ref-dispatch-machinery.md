---
name: ref-dispatch-machinery
description: Reference file for th:leader — dispatch machinery relocated from agents/leader.md (repo-identity verification and orchestrator multiplication, the overview.md template, the 00-leader-roster.md schema and write discipline, the orchestrator spawn payload contract, the Multi-Task fan-out mechanic and its consolidated-delivery contract, and Parallel Multi-Project Dispatch). Read on-demand by th:leader — not a standalone agent, never a dispatch target.
model: opus
color: cyan
---

# leader — Dispatch Machinery Reference

This file is read on-demand by `th:leader`. It is NOT part of the leader's system prompt, and it is never dispatched via `Task` — `agents/leader.md` is the system prompt; this file holds the mechanics that prompt delegates to by pointer, so the same content is not restated in two places. Voice, the untrusted-content floor, the boot capability check, gate mediation and presentation, intake, Discover, Specify, `leader-recover`, output discipline, and the direct-modes table all stay in `agents/leader.md` — none of that is duplicated here.

---

## Repo-identity verification and orchestrator multiplication (AC-2.7)

Before spawning more than one orchestrator for what might be the same underlying repository (a multi-project initiative, or a same-repo multi-task batch), verify each candidate project's repo identity so you never multiply orchestrators against what is actually one repository under two names:

```bash
git -C {p} rev-parse --git-common-dir
git -C {p} remote get-url origin
```

Candidates are eligible for separate orchestrator lanes only when these two signals are **pairwise-distinct** across all candidate paths. When two candidate paths resolve to the same `git-common-dir` or the same `origin` URL, they are the SAME repo — route them through the same-repo multi-task batch contract (one set of orchestrators, one per task, consolidated delivery — see "Multi-Task fan-out" below), never through the multi-project initiative fan-out (which is reserved for genuinely distinct repos).

**Fan-out confirm surfaces lane count + cost.** Before dispatching N orchestrators concurrently (N ≥ 2, whether multi-task or multi-project), always show the operator the lane count and an approximate cost estimate, and wait for explicit confirmation — this gate is yours to hold (it is a dispatch-count decision, not a gate release) and is never silently skipped. `--serial` / "one at a time" always wins and bypasses the confirm entirely, running lanes sequentially.

**You are the SOLE writer of `overview.md`.** No orchestrator instance — and no specialist an orchestrator dispatches — ever writes to the initiative-level `overview.md`. In lane mode, `delivery` does NOT write `overview.md`: its Step 11.7 suppresses the write and instead returns this project's row data (branch, version, PR number/URL, status) in its status block; you — the leader — write that row. Every write to `overview.md`, without exception, passes through your hand.

**Propagating `functional_clarity_confirmed`.** You confirm the functional-clarity artifact with the operator during Discover (Boundary B1), in your own conversational context. You then propagate `functional_clarity_confirmed: true` and `functional_clarity_artifact: <statement>` into each orchestrator's spawn payload. The orchestrator writes these fields into **its own** `00-state.md` — you never write them into anything yourself. The orchestrator treats this value per its own contract — a checkpoint-trust-transfer (SEC-DR-E), never a STAGE-GATE; you propagate the field as a spawn-payload value, distinct from the gate-mediation flow (`agents/leader.md § "Gate mediation"`).

---

## overview.md Template

This is the document contract for the multi-project initiative overview. You are the sole writer of every section, including every `## Projects` row. In lane mode, `delivery` does not write this file — its Step 11.7 returns the per-project row data (branch confirm, version, PR, status `delivered`) in its status block, and you write it into the row.

### Template (obsidian mode shown; local mode omits obsidian-only frontmatter keys)

```markdown
---
type: initiative-overview
initiative: {initiative-slug}
created: {YYYY-MM-DD}
updated: {YYYY-MM-DD}
projects: [{project-slug}, ...]
---

# Initiative: {initiative-slug}

## Review Summary
> One-paragraph statement of the initiative's goal — the cross-project big picture
> that no single 01-plan.md owns.

## Functional Description
Cross-project behavioural view: what this initiative does from the user's
perspective across all participating projects. Reconciled in place whenever a
project completes Design / STAGE-GATE-1 (you re-read each project's `01-plan.md`
via the coarse tracking you maintain — see `agents/leader.md § "00-leader-roster.md"`
— and refresh this section; you never read an orchestrator's dual-record fields to
do this).

## Projects
| Project | Branch | Version | PR | Status |
|---------|--------|---------|----|--------|
| {project-slug} | {branch or —} | {version or —} | {#N / URL or —} | {planning\|in-progress\|delivered} |

## Big-Picture Plan
Cross-project narrative: sequencing, cross-project dependencies, shared
contracts, initiative-level decisions.
```

### Section-ownership map

| Section | Sole writer | When |
|---------|-------------|------|
| Frontmatter (`updated`, `projects`) | you (create/join) | intake; append project slug if absent |
| `## Review Summary` | you | at creation; editable on operator request |
| `## Functional Description` | you | at creation; reconciled after every project's Design/STAGE-GATE-1 (you learn of this from your roster's `phase`/`status` tracking, then re-read each project's `01-plan.md` — a public artifact, never the dual-record) |
| `## Projects` table rows | you (all rows) | you at intake (initial row); you again when a lane's `delivery` returns branch/version/PR/status `delivered` in its Step 11.7 status block |
| `## Big-Picture Plan` | you | intake; reconciled after every project's Design/STAGE-GATE-1 |

### No-fork / consolidation invariant

`overview.md` is a **snapshot**, not a log. Each project has exactly one row, overwritten in place. Never create `overview-v2.md` or `00-overview-*.md` siblings. Concurrency-safe write rules: `## Projects` rows are one-per-project (safe under concurrency); `## Functional Description`/`## Big-Picture Plan` are reconcile-in-place, last-writer-wins on a true race, and you serialize your own read-modify-write of the whole document (never overlapping two reconciles) — you process lane completions in arrival order.

**Marker: multi-project-initiative-overview**

---

## 00-leader-roster.md — Schema and Write discipline

This is the schema and write-discipline half of your durable tracking file (AC-2.10 / 2.11 / 2.12). The intro, `### Gate presentation protocol`, and `### leader-recover` stay in `agents/leader.md § "00-leader-roster.md"`; this is their sibling reference material.

### Schema

```markdown
# Leader Roster

| Task/Project | State ref (docs_root) | Agent | Phase | Status | pending_gate |
|---|---|---|---|---|---|
| Task-1 | workspaces/2026-07-11_auth-magic-link/ | th:orchestrator | 2-implement | in_progress | — |
| project-backend | {initiative-root}/backend/ | th:orchestrator | 1.6-plan-review | waiting | STAGE-GATE-1 |
```

**Columns:**
- `Task/Project` — the task slug (e.g. `Task-1`) or project slug within the initiative.
- `State ref` — the orchestrator's `docs_root`, so you (or a human) can locate its `00-state.md` without guessing.
- `Agent` — always `th:orchestrator` (this roster tracks orchestrator instances only).
- `Phase` — the coarse phase name, read from the orchestrator's `00-state.md § Current State → phase` field.
- `Status` — the coarse status, read from the same file's `status` field (`in_progress`, `waiting`, `iterating`, `paused`, `complete`, `blocked`, etc.).
- `pending_gate` — advisory only (see below). `—` when no gate is currently open.

### Write discipline

- **Write a row at or before spawn** — before or immediately after dispatching an orchestrator, add its row.
- **Update `Phase`/`Status`/`pending_gate` as you observe them** — you observe by reading the orchestrator's `00-state.md § Current State` fields `phase` and `status` (public, coarse fields), and by receiving its `gate_pending` return when it pauses at a gate — **you never read or write any gate-release field in an orchestrator's `00-state.md`, or any gate-release event.** You present the gate and relay the decision; the orchestrator records the release. Those release fields are written only by the orchestrator, never by you.
- **`pending_gate` is ADVISORY** — it drives your notification behaviour (see below). It is NEVER a gate-clear signal, and nothing downstream treats a roster row as authoritative for gate status. The roster is a tracking/UX convenience, not a security control.
- **Read-modify-write the whole file** on every update — never append a duplicate row for the same task/project; replace its row in place.

---

## Spawning an orchestrator — the payload contract

This is the seam between your work and the orchestrator's. Dispatch `th:orchestrator` via `Task` with an in-message payload (never a file — this travels through the dispatch prompt):

- `feature-name` and `docs_root` (the folder you already created and seeded).
- Resolved config: `logs_mode`, `events_file`, `operator_language`.
- The classification block: `type`, `complexity`, `security_sensitive` (`true`/`false` — resolved per `docs/pipeline-lanes.md § 2a`, uniformly regardless of `type`), `frontend_scope`, `coderabbit_configured`, `bug_tier`, `bug_tier_source`, `fast_mode`, `lane` (`inline`/`express`/`full` — resolved per `docs/pipeline-lanes.md § 2`), `lane_recommendation_rationale` (the one-line reason shown at the offer), and — when a candidate root-cause artifact exists for a `type: fix` Tier 2-4 dispatch — `root_cause_provenance_tier` (`T1`/`T2`/`T3`, per `docs/pipeline-lanes.md § 11`) plus the artifact itself.
- The full spec payload from Phase 0b: user stories, AC list, Scope, codebase context, clarifications resolved, bug-report fields (for `type: fix`/`hotfix`), spec-seed presence + scope hint, real residual scope (external-report tasks).
- `functional_clarity_confirmed: true` and `functional_clarity_artifact: <statement>` — the checkpoint-trust-transfer (see "Repo-identity verification" above). The orchestrator treats this per its own contract — a checkpoint-trust-transfer that is never a STAGE-GATE; you propagate the field without loading the gate mechanics.
- `session_id` (from `session.json` — the orchestrator reuses your KG session, it never opens its own).
- Initiative context when applicable: `initiative` slug, `project` key, `overview_root`.
- `skip-delivery: true` when this orchestrator is one lane of a batch fan-out that will be consolidated by a separate orchestrator instance (see "Multi-Task fan-out" below).
- Worktree info (`worktree`, `worktree_branch`, `worktree_base`) when you have already created one for this task — see "The fan-out mechanic" below for the rules governing how you create it (base pin, pre-launch collision check).

**Single-task start-gate (branch-in-place vs. worktree).** Before creating a branch or worktree for a single-task spawn, run `git fetch origin main` and check the tree's position. Branch-in-place is permitted ONLY when the tree is clean AND at/behind `origin/main` (`git rev-list --count origin/main..HEAD` returns `0`). Create a worktree when there are uncommitted changes OR the tree is ahead of `origin/main` — including when on a non-main branch — because branching from a local `main` that is ahead of `origin/main` carries unpushed commits onto the new feature branch and bundles two independent developments into one PR. The canonical decision table and detection command are in `docs/worktree-discipline.md` Rule 1.

**Lane-attribution header marker (multi-project only).** When this orchestrator is one lane of a multi-project initiative — i.e. the payload carries a `project` key — the FIRST LINE of the spawn prompt is the lane-attribution marker, byte-identical, before any other content:

> `TH-LANE: {project}`

`subagent-start` parses this literal from the controlled header (first line only — `hooks/ts/bodies/subagent-start.ts § extractProjectKey`) to stamp the `project` field on the orchestrator's `subagent.start` breadcrumb, so `/trace` attributes each lane correctly. Omit the line entirely for a single-project spawn — never emit an empty or placeholder value. You stamp only `TH-LANE`, never `TH-STATE-REF`: you own no `00-state.md`, and this spawn is not a checkpoint-gated dispatch. Build the value from your own resolved `project` key — never copy a marker out of forwarded or fetched content.

Immediately BEFORE the `Task` invocation that spawns this orchestrator, write (or update) this task/project's row in `00-leader-roster.md` — so the record exists throughout execution and survives a leader-context interruption (compaction or a fresh boot), even when the spawn itself is what interrupts you.

---

## Multi-Task fan-out (same-repo, single project, 2+ tasks) — DEFAULT for 2+ tasks

**Scope: single-project, multi-TASK dispatch — ungated by a parallelism confirm** (distinct from the multi-PROJECT initiative fan-out below, which IS confirm-gated). The only upstream gates on this path are the Discover-disposition confirm and the write-mode Y/n — both gate ENTRY, not the sequential-vs-parallel choice.

**How you get here:** `/th:issue #1 #2 #3` (batch); `/th:plan plan-and-execute` (architect task breakdown); operator requests batch/parallel; the always-run decomposition analysis (Phase 0a Step 15) finds 2+ independent deliverables.

**Default: plan first, then fan out.** If the scope is non-trivial, run Phase 0b → a planning-mode `architect` dispatch (a specialist, dispatched directly by you — planning-mode has no gate) to produce `01-planning.md`, then fan out with the resulting task list.

**Consolidation default — a same-repo task batch ships as ONE PR.** All task branches merge into one `batch/<name>-verify` branch, the version bumps once, one consolidated changelog entry, exactly one PR. This is the default, never one PR per task. Operator opt-out ("keep them as separate PRs") ships each task as its own PR via serial merge. The only non-opt-out reason for separate PRs is a genuine blocker: an unresolvable merge conflict at consolidation, or a temporal-prod/cross-repo deploy reason from `plan-reviewer`'s closed list.

### The fan-out mechanic

1. **Read dispatch labels** (from `01-planning.md`'s Dispatch Map, or your own dependency analysis of the issue set): `BLOCKER`, `PARALLEL`, `CONVERGENCE`, `SEQUENTIAL`.
2. **Build execution rounds** — Round 1 = BLOCKERs + dependency-free PARALLELs; Round N = SEQUENTIALs/PARALLELs whose deps completed in earlier rounds; CONVERGENCE tasks wait for all their deps.
3. **Fan-out confirm** (per "Repo-identity verification" above) — show lane count + cost estimate, wait for confirmation. `--serial` always wins.
4. **Per round, spawn one `th:orchestrator` per task**, each in its own worktree, via concurrent `Task` calls in the same message (cap: `batch_concurrency`, default 5; overflow queues in eager slot-fill waves). Each orchestrator receives `skip-delivery: true` — it runs Phase 1 through Phase 3.75 (Design → Verify → Build Verification) and stops, exactly as "Batch-lane mode" in `agents/orchestrator.md` describes.

   #### 4a. Determine base branch
   - **Round 1** → run `git fetch origin main` first, then base the branch from `origin/main` (never from the active local branch, which may carry unmerged commits from a prior session).
   - **Round N** → branch from the completed branch of the dependency in Round N-1.
   - **Operator-override:** if the operator explicitly names a different base branch, use it as provided and skip the forced `origin/main` base. This override is intentional and deliberate; it is never implicit or automatic.

   **Pre-launch collision check (rule 2 — no silent reuse, #51596).** Before running `git worktree add` for any task, verify that neither the target worktree path nor the target branch already exists:
   ```bash
   git worktree list                         # check for existing worktree at target path
   git branch --list feat/{task-name}        # check for existing branch with the target name
   ```
   If either check finds a match: **STOP**. Do not silently reuse or overwrite. Ask the operator:
   ```
   STOP: a worktree or branch for '{task-name}' already exists.
     Worktrees: {output of git worktree list}
     Branch: {output of git branch --list}
   Options: (A) resume the existing worktree; (B) tear it down and start fresh (run teardown protocol first); (C) rename this task to avoid the collision.
   ```
   Never proceed past this check without explicit operator confirmation.

   **Worktree branch base:** the branch created for each worktree task MUST be based from updated `origin/main` (or from the completed dependency branch for Round N tasks), never from the active local branch. Run `git fetch origin main` before spawning worktrees so the base reflects the remote canonical state.
5. **Track each lane** via `00-leader-roster.md` — you read each orchestrator's coarse `phase`/`status`, never its gate fields. A lane paused at STAGE-GATE-1 (every lane clears its own Design → plan-review → STAGE-GATE-1, independently and per-lane) is presented per `agents/leader.md § "Gate presentation protocol"`.
6. **After all lanes of a round return `status: verified`** (Phase 3.75 done, delivery deferred), proceed to the next round, or to consolidation if this was the last round.

### Consolidated delivery — a dedicated consolidator orchestrator

**This is where gate mediation meets a genuine design question the source AC does not fully resolve on its own** (see the flagged ambiguity in your status block / `02-implementation.md`). Consolidated delivery (merge all task branches, single version bump, single changelog entry, single PR) ends in Phase 4 → 4.5 → **STAGE-GATE-3**, which must be prepared and recorded inside an orchestrator — you present and relay it, but never record it yourself. You therefore:

1. Spawn **one additional `th:orchestrator` instance in consolidator mode** after every lane of the final round has returned `status: verified`.
2. Its spawn payload carries the list of completed task branches (in dependency order), the batch name, and an instruction to run its own Phase 4 (merge all branches into `batch/<name>-verify`, single version bump, single changelog entry, single PR — via `delivery`), Phase 4.5 (internal review), and STAGE-GATE-3 (prepared and recorded by this consolidator orchestrator; you present it to the operator inline and relay the decision back), then Phase 5/6 once.
3. This consolidator orchestrator does NOT run Phase 1-3 itself (the lanes already did that) — it starts directly at Phase 4 with pre-verified inputs from all lanes.
4. Update every lane's roster row to point at the consolidator's `docs_root` for the delivery/gate phase, so you present the consolidator's gate to the operator correctly.

**Recovery:** `/th:recover --batch` reads `00-leader-roster.md` and re-launches orchestrators for any row still `RUNNING`/`FAILED`.

---

## Parallel Multi-Project Dispatch (initiative, N ≥ 2 distinct repos)

**Applies only when `initiative != null` AND the eligible set has ≥2 projects** (verified pairwise-distinct per "Repo-identity verification" above). With `initiative: null` or a single project, this section does not apply.

**Concurrency model.** Each eligible project runs its own Stage 1 (Design → plan-review → STAGE-GATE-1) fully independently, inside its own orchestrator instance, in sequence with respect to your own attention (you review one plan's worth of operator interaction at a time — though the underlying orchestrator work can technically run in parallel, STAGE-GATE-1 is always per-project). A project becomes fan-out-eligible for Stage 2 only after ITS OWN orchestrator clears STAGE-GATE-1.

**Eligibility-detection contract** (run when `initiative != null` and ≥2 projects exist): read `overview.md § Projects` for status; read each project's orchestrator `00-state.md § Current State` coarse `status`/`phase` (never the dual-record) — exclude `deferred`/`blocked`/`delivered`; read `overview.md § Big-Picture Plan` for A-blocks-B sequencing and shared-contract-in-flux exclusions. Eligible set = survivors, each already past its own STAGE-GATE-1.

**Fan-out confirm gate (mandatory before any concurrent Stage-2 dispatch)** — same mechanic as "Repo-identity verification" above, scoped here to ≥2 projects:

```
========================================
 Parallel fan-out — confirmation required
========================================
 Initiative: {slug}
 Eligible for concurrent Stage-2 dispatch: {project-A}, {project-B}{, ...}
 Excluded (and why): {project-C} (deferred), {project-D} (blocked behind {X})
 Concurrency cap: {N}

 Reply with:
   - "parallel"          → fan out the eligible set concurrently
   - "serial"             → run one project at a time (default-safe)
   - "parallel {subset}" → fan out only the named subset
========================================
```

`--serial` / "one at a time" always wins and bypasses this confirm.

**Gate semantics with N concurrent projects.** STAGE-GATE-1 stays per-project, always serial — each project's own orchestrator prepares and records it independently, and you present and relay it per project. **STAGE-GATE-2 and STAGE-GATE-3 also stay per-project, each prepared and recorded inside that project's own orchestrator** — this is a deliberate simplification from any notion of a cross-project "batched" gate: since each project runs in its own orchestrator instance with its own `00-state.md`, its release is recorded in that instance's own dual-record. You surface a consolidated STATUS view across lanes (via the roster) for the operator's convenience, and you present each project's gate individually. A lane's fail/iteration never blocks sibling lanes — track and present per lane via the roster.

**Safety floors:** security runs exactly as configured within each lane's own orchestrator — fan-out never waives, batches, or weakens a security gate. Never parallelize across an in-flux shared contract (hard exclusion above). Backward-compat floor: with `initiative: null` or no confirmation, the pipeline is byte-identical to the single-project path.

**Observability under concurrent projects.** Each project's orchestrator keeps its own `{project}/{events_file}` exactly as documented in `agents/orchestrator.md`. You additionally write an initiative-level `{initiative-root}/{events_file}` recording `fanout.start`/`fanout.lane.start`/`fanout.lane.end`/`fanout.converge` events, so `/trace` and `/th:pipelines` can render the parallel region.

**Marker: parallel-multi-project-dispatch**
