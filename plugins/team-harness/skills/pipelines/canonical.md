
# Pipeline Status Renderer

This skill is a read-only renderer. It never edits a workspace, appends events, repairs a gate
field, or changes `00-state.md`. The coordinator is the sole writer of coordination state.

## Scan

1. Resolve candidate roots with packaged `workspace-identity.mjs`; use persisted
   identities and never synthesize today's path or merge local/Obsidian copies.
2. Find coordinator-root `00-state.md` files, including active worktrees when available.
3. Parse the literal v4 fields `pipeline_version`, `workspace_identity`, `phase`, `status`, `gate_pending`,
   `iteration`, `next_action`, and the last-updated coordinate. There is no lane or profile
   field. Read gate release fields directly; never infer a release.
4. Read `git worktree list --porcelain` and, when available, `tmux list-sessions` to classify
   each worktree row as `LIVE`, `DEAD`, or `?`. A missing tmux executable is unknown, not dead.
5. Ignore folders without `00-state.md` unless they are known direct-mode artifacts (for example
   diagram or spike output). Do not treat them as broken pipelines.

## Named machine

Every new pipeline follows exactly this v4 sequence; v3 remains read-only compatible:

```text
design → waiting_gate1 → implementation → validation → waiting_gate3 → delivery → complete
```

Allowed alternate transitions are: invalid design artifact → normal design correction;
operator edit/reject at Gate 1 → `design`; implementation constraint that changes behavior →
coordinator transcription of a bounded operator decision, then `implementation`; validation
defect → `implementation`; structural contradiction → operator decision, then implementation
unless the operator explicitly requests architect work; amend at Gate 3 → `implementation`;
external delivery precondition failure → `blocked`; explicit cancellation → `aborted`.

After Gate 1, a mechanical plan repair is coordinator-owned and continues
`implementation → Freeze → validation` with no architect dispatch and no iteration change.
Correctable code, test, documentation, hygiene, or security findings, plus missing or
insufficient evidence, consume one implementation/validation correction round and follow
that same route; evidence returns to `tester`, while a sensitive delta requires a fresh audit.
The ratchet (`agents/ref-pipeline.md`) ends this loop early: a sub-floor finding
on unchanged surface after a prior round records to `reviews/findings-ledger.md` as a residual
and ships instead of consuming another round; the two fail-closed security conditions are
excluded from that residual by construction. `iteration: N/3` counts only correction rounds that
actually opened. Plan repairs,
operator decisions, and explicitly requested design work do not increment it or emit a new
`iteration.start`; historical `cause: operator` events remain readable, while new writers
use `cause: verification`.

`inline` is direct work and has no pipeline state. A live ad-hoc tester, QA, security, or
other review requested during inline remains inline and creates no state, gates, delivery
record, or pipeline workspace.

## Default table

Render one row per state file:

| Feature | State | Status | Iteration | Gate | Process | Last updated | Next action |
|---|---|---|---|---|---|---|---|
| `{feature}` | `{phase}` | `{status}` | `{iteration}` | `{gate_pending}` | `{LIVE|DEAD|?|—}` | `{timestamp}` | `{next_action}` |

Use `—` for absent optional values. Keep the output concise and point to the workspace path.
The gate column is a factual field, not a verdict. A `waiting_gate1` row means the run is paused
for Gate 1; a `waiting_gate3` row means it is paused for Gate 3.

Mark a non-terminal row stale when its last update is more than one hour old. A `DEAD` worktree
process or stale row should point to `/th:recover {feature}`; this is a diagnostic suggestion and
never a state mutation.

## In-flight lanes

When a row has `00-subagent-trace.jsonl`, parse its JSONL in file order and FIFO-pair
`subagent.start`/`subagent.stop` by `agent_type`. Render unmatched starts as running with elapsed
time and at most the five most recent completed pairs beneath that feature. Malformed lines are
skipped and a missing/empty trace omits the block silently. This view is read-only and does not
append, repair, or normalize the trace.

## Numeric gate display

When the operator asks for details for one pipeline, show the pending gate's stable choices:

- Gate 1: `1 approve`, `3 edit`, `4 reject`.
- Gate 3 (exception pause only): `1 ship`, `2 amend`, `3 abort`.

These are display shortcuts only. The coordinator verifies the live reply, current nonce, and
authority event. An unambiguous semantic equivalent is accepted by the active coordinator, and a
natural-language amend or reject reply may carry its detail without a numeric prefix. Ambiguity
releases nothing. This renderer never accepts or records a gate decision.

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

Direct modes do not create pipeline state and are absent from this table. An
initiative has one coordinator-root state and event file. Render its ordered
service bindings as children from `openspec_bindings`; do not search service
folders for competing state. Services execute serially and there is no parallel
coordinator roster.

## Empty and malformed input

- No state files: `No active pipelines.`
- Folder without state: omit it or report `untracked direct artifact` when its mode is known.
- Missing required v4 fields (or historical v3 fields): report `state incomplete` with the path; do not repair it.
- Unparseable events: report the state row and identify the trace as unavailable; do not rewrite it.
