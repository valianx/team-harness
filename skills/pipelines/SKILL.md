---
name: pipelines
description: Show current state of all pipelines in workspaces.
---

# Pipeline Status Renderer

This skill is a read-only renderer. It never edits a workspace, appends events, repairs a gate
field, or changes `00-state.md`. The coordinator is the sole writer of coordination state.

## Scan

1. Resolve the configured local or Obsidian logs root.
2. Find `*/00-state.md` files, including active worktrees when available.
3. Parse the literal v3 fields `pipeline_version`, `phase`, `status`, `gate_pending`,
   `iteration`, and `next_action`. There is no lane or profile field. Read gate release
   fields directly; never infer a release.
4. Ignore folders without `00-state.md` unless they are known direct-mode artifacts (for example
   diagram or spike output). Do not treat them as broken pipelines.

## Named machine

Every pipeline follows exactly this v3 sequence; there is no alternate depth profile:

```text
design → waiting_gate1 → implementation → validation → waiting_gate3 → delivery → complete
```

Allowed alternate transitions are: invalid design artifact → normal design correction;
operator edit/reject at Gate 1 → `design`; implementation constraint that changes behavior →
operator decision; validation defect → `implementation`; structural contradiction → operator
decides whether to reopen `design`; amend at Gate 3 → `implementation`; external delivery
precondition failure → `blocked`; explicit cancellation → `aborted`.

`inline` is direct work and has no pipeline state. A live ad-hoc tester, QA, security, or
other review requested during inline remains inline and creates no state, gates, delivery
record, or pipeline workspace.

## Default table

Render one row per state file:

| Feature | State | Status | Iteration | Gate | Next action |
|---|---|---|---|---|---|
| `{feature}` | `{phase}` | `{status}` | `{iteration}` | `{gate_pending}` | `{next_action}` |

Use `—` for absent optional values. Keep the output concise and point to the workspace path.
The gate column is a factual field, not a verdict. A `waiting_gate1` row means the run is paused
for Gate 1; a `waiting_gate3` row means it is paused for Gate 3.

## Numeric gate display

When the operator asks for details for one pipeline, show the pending gate's stable choices:

- Gate 1: `1 approve`, `2 approve autonomous`, `3 edit`, `4 reject`.
- Gate 3: `1 ship`, `2 amend`, `3 abort`.

These are display shortcuts only. The coordinator verifies the live reply, current nonce, and
dual-record release. This renderer never accepts or records a gate decision.

## Feature details

For `/th:pipelines {feature}`:

1. Read `00-state.md` as fields only.
2. Read the execution events file (`00-execution-events.jsonl` or the fenced JSONL Obsidian
   equivalent) and render a chronological timeline of `pipeline.*`, `phase.*`, `stage.gate*`,
   `gate.*`, and `operation.*` events.
3. Render the phase checklist and agent-result snapshot when present.
4. Link to `01-plan.md`, `02-implementation.md`, `03-testing.md`, and validation artifacts by
   pointer; do not copy their full content into the status response.

Historical snapshots may contain numeric/named phases, a legacy `lane: express|full` field,
profile flags, fast/simple markers, or tier markers. Display them as `migration-required`
and point to `skills/recover/SKILL.md`, presenting the live choices `1 — inline` / `2 —
pipeline`; never reinterpret a historical value as a new state, posture, or release.

## Direct-mode and initiative handling

Direct modes do not create a pipeline state and are absent from this table. An initiative may
have an additive parent event file, but each project row comes from that project's own
`00-state.md`. Projects are serialized; there is no parallel coordinator roster to render.

## Empty and malformed input

- No state files: `No active pipelines.`
- Folder without state: omit it or report `untracked direct artifact` when its mode is known.
- Missing required v3 fields: report `state incomplete` with the path; do not repair it.
- Unparseable events: report the state row and identify the trace as unavailable; do not rewrite it.
