---
name: ref-dispatch-machinery
description: Reference file for th:orchestrator — initiative mechanics read on demand (path composition, repo-identity verification, the overview.md template and its sole-writer invariant, and multi-project sequencing). Not a standalone agent, never a dispatch target.
model: opus
color: cyan
---

# orchestrator — Initiative Machinery Reference

Read on demand by `th:orchestrator`. Not part of its system prompt, never dispatched via `Task`. Direct routing and safety stay in `agents/orchestrator.md`; active-pipeline gates, Intake, Specify, recovery, and output contracts live in `agents/ref-pipeline.md`.

Everything in this file applies only when `initiative != null`. On the single-project path — the overwhelming majority of runs — none of it is read.

---

## Contents

- [Initiative path composition](#initiative-path-composition)
- [Repo-identity verification](#repo-identity-verification)
- [Multi-project sequencing](#multi-project-sequencing)
- [overview.md — you are the sole writer](#overviewmd-you-are-the-sole-writer)
- [What left this file, and where it went](#what-left-this-file-and-where-it-went)

Locate the needed section by heading; do not read this file in full.

## Initiative path composition

Relocated here from the boot sequence: it is infrequent and does not belong on the hot path.

| Mode | `initiative == null` | `initiative` set |
|---|---|---|
| Local | `base_path = workspaces` | `base_path = workspaces` — per-project path unchanged; overview at the common parent of sibling repos |
| Obsidian | `base_path = {logs-path}/{logs-subfolder}/{repo_name}` | `base_path = {logs-path}/{logs-subfolder}/{repo_base}/{YYYY-MM-DD}_{initiative}`; overview at `{base_path}/overview.md`; per-project `docs_root = {base_path}/{project}` |

`events_file` is unchanged by initiative mode: `00-execution-events.md` in obsidian, `.jsonl` in local. Each project keeps its own inside its own `docs_root`.

---

## Repo-identity verification

Before treating two paths as separate projects, verify they are not one repository under two names:

```bash
git -C {p} rev-parse --git-common-dir
git -C {p} remote get-url origin
```

Projects are separate only when both signals are **pairwise-distinct** across all candidates. Same `git-common-dir` or same `origin` URL means the SAME repo — it is one project with several tasks, not an initiative.

---

## Multi-project sequencing

**One project at a time.** Each project runs its own Stage 1 → Stage 3 to completion inside this same agent, in sequence. You never spawn a copy of yourself to run a lane — `agents/ref-pipeline.md § "Dispatch invariants"` #2 forbids it without exception, and that invariant is absolute here too: no case in this section constructs a dispatch of another coordinator, including another copy of yourself. Serial execution is the **derived consequence** of that absolute invariant, not an independent policy stated a second time — reopening parallelism means changing the invariant itself, in a plan, never a local exception carved out of this section.

**Eligibility.** Read `overview.md § Projects` for status and `§ Big-Picture Plan` for A-blocks-B sequencing and shared-contract-in-flux exclusions. Exclude `deferred`, `blocked`, `delivered`. Never proceed across an in-flux shared contract.

**Order confirm.** With ≥2 eligible projects, show the operator the project list, the exclusions with their reason, and the order you propose. Wait for confirmation. This is a sequencing decision, not a gate release — it carries no nonce.

**Gates stay per project.** STAGE-GATE-1 and STAGE-GATE-3 are prepared, presented and recorded per project, against that project's own `00-state.md`. There is no cross-project batched gate. One project's failure or iteration never blocks a sibling.

**Safety floors.** Security runs exactly as configured within each project — initiative mode never waives, batches, or weakens a security gate. With `initiative: null` the pipeline is byte-identical to the single-project path.

**Observability.** Each project keeps its own `{project}/{events_file}`. Additionally write an initiative-level `{initiative-root}/{events_file}` with `initiative.start` / `project.start` / `project.end` / `initiative.converge`, so `/th:trace` and `/th:pipelines` can render the grouping.

---

## overview.md — you are the sole writer

No specialist ever writes this file. After your own Phase-4 mechanics create or update the
PR, you already hold the branch, resolved version, PR number/URL, and delivery outcome; use
those coordinates to write the row directly. Every write passes through your hand.

### Template (obsidian shown; local omits the obsidian-only frontmatter keys)

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
project completes Design / STAGE-GATE-1 — re-read that project's `01-plan.md`
(a public artifact, never its dual-record fields) and refresh this section.

## Projects
| Project | Branch | Version | PR | Status |
|---------|--------|---------|----|--------|
| {project-slug} | {branch or —} | {version or —} | {#N / URL or —} | {planning\|in-progress\|delivered} |

## Big-Picture Plan
Cross-project narrative: sequencing, cross-project dependencies, shared
contracts, initiative-level decisions.
```

### Section-ownership map

Transcribed verbatim from the previous revision of this file rather than re-derived — the map's content did not change with the fusion; only its writer's identity did.

| Section | Sole writer | When |
|---------|-------------|------|
| Frontmatter (`updated`, `projects`) | you (create/join) | intake; append project slug if absent |
| `## Review Summary` | you | at creation; editable on operator request |
| `## Functional Description` | you | at creation; reconciled after every project's Design/STAGE-GATE-1 (you learn of this from your own per-project tracking, then re-read that project's `01-plan.md` — a public artifact, never a dual-record field) |
| `## Projects` table rows | you (all rows) | at intake (initial row); again after your Phase-4 mechanics resolve branch/version/PR/status |
| `## Big-Picture Plan` | you | intake; reconciled after every project's Design/STAGE-GATE-1 |

**Row schema.** Each `## Projects` row is `{project-slug} | {branch or —} | {version or —} | {#N / URL or —} | {planning|in-progress|delivered}` — one row per project, keyed by `project-slug`, never a second row for the same project.

### No-fork / consolidation invariant

`overview.md` is a **snapshot**, not a log. Each project has exactly one row, overwritten in place. Never create `overview-v2.md` or `00-overview-*.md` siblings. Concurrency-safe write rules: `## Projects` rows are one-per-project (safe under concurrency); `## Functional Description`/`## Big-Picture Plan` are reconcile-in-place, last-writer-wins on a true race, and you serialize your own read-modify-write of the whole document (never overlapping two reconciles) — you process project completions in arrival order.

**Marker: multi-project-initiative-overview**

---

## What left this file, and where it went

| Removed | Why |
|---|---|
| `00-leader-roster.md` schema and write discipline | the roster tracked coordinator instances; there is one coordinator, running each project in its own turn, so there is nothing to track across instances |
| The coordinator spawn-payload contract | there is no spawn — Intake writes the board directly, in this same agent |
| Multi-Task fan-out and its consolidator contract | measured at 0.6% of runs, and those were operator overrides. Two independent tasks run as two sessions on two worktrees, consolidated by the operator |
| `functional_clarity_confirmed` propagation | it was a payload field carried from one coordinator to another; it is now a `checkpoint.confirmed` event this same agent reads from its own events file (`agents/ref-pipeline.md § Gates`) |
