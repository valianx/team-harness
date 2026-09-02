# Observability — v3 Events and Coordination Records

The local execution trace is the canonical machine-readable history of an activated pipeline.
The state snapshot and decision ledger are separate coordinator-owned records:

| Record | Purpose | Writer |
|---|---|---|
| `00-state.md` | Current v3 state, fields, checklist, agent results, next action | coordinator only |
| `00-execution-events.jsonl` / `.md` | Append-only lifecycle and phase trace | coordinator only |
| `00-decision-ledger.jsonl` / `.md` | Gate decisions, finding dispositions, dry-run evidence | coordinator only |
| `00-pipeline-summary.md` | Replaceable human summary | coordinator only |

Specialists return status blocks and artifact pointers. They never create, edit, or repair these
records. The complete field schema is authoritative in `agents/_shared/orchestrator-state.md`.

## 1. Canonical machine and trace events

### Low-cost append contract

The extension is not the cost boundary. Both local formats carry the same compact
JSON object per event and use physical append; neither format is rewritten to add an
event. Obsidian Markdown adds frontmatter, a heading, and one open `jsonl` fence at
initialization only. New events append after that fence; closing it is optional and
must never require rewriting the stream.

Emit only durability-bearing events: session/pipeline start, phase end, gate
presentation/release, failures, required iteration markers, and completion. A routine
successful tool call does not deserve an `operation.started` + `operation.success`
pair. `operation.*` remains available for a long-running boundary whose recovery needs
an explicit start marker, or for a failure that needs diagnosis. Never log reasoning,
prompts, specialist prose, diffs, command output, or fields already recoverable from
`00-state.md` or the named artifact.

Each append is one minified JSON object on one line. Use identifiers, enums, counts,
durations, token figures, and artifact paths; optional free text follows the existing
120-character bound. Recovery tails or queries only relevant event types and never
loads the stream in full. These rules reduce model output and I/O; renaming `.md` to
`.jsonl` alone would not.

| Dimension | Local plane (`00-execution-events`) | Cross-user plane (flow events) |
|-----------|-------------------------------------|-------------------------------|
| Purpose | Per-workspace pipeline trace for the individual operator | Cross-fleet friction signal for TH maintainers |
| File | `00-execution-events.jsonl` (local mode) / `00-execution-events.md` (obsidian mode) | No file — relayed to Axiom via `context-harness-mcp` |
| Audience | Operator + `/th:trace` skill | TH maintainers via Axiom dashboard |
| Default | ALWAYS active — every pipeline writes this | OFF by default (`flow_telemetry.enabled: false`). Opt-in via `/th:setup flow-telemetry` |
| Blocking? | Mandatory — missing events are a contract violation | Non-blocking — emission failure is logged and the pipeline continues |
| Schema scope | Rich pipeline detail (phase timing, tokens, gate verdicts, iteration counts, tool usage) | Metadata-only bounded fields (8-value event enum, ints, version, timestamp, bare project tag — NO diff, NO code, NO paths) |
| Contains PII / content? | Operator-local only; never sent cross-user | Filtered by CH `internal/validate.Run` + metadata-only by construction |

## 2. Canonical machine and trace sequence


Every activated v3 run uses one sequence:

```text
design → waiting_gate1 → implementation → validation → waiting_gate3 → delivery → complete
```

Every `pipeline` run uses this canonical full v3 sequence. `inline` direct work is outside the
machine and has no pipeline state, execution trace, decision ledger, summary, or gate events.
Implementation checkpoints (evidence, hygiene, Freeze) and validation acceptance are trace details
inside their named states; they are not persisted machine phases. A live tester, QA, or security
request made while inline returns chat/bounded evidence only unless the operator explicitly asks
for a standalone artifact; that request does not activate pipeline observability.

The coordinator emits lifecycle events at every pipeline state transition and gate. Legacy tier,
fast, simple, or profile markers never create an observability exemption or a pipeline trace.

## 2. Event envelope

One JSON object per line, append-only. In Obsidian mode the same JSONL is wrapped in a fenced
`jsonl` block. Coordinator-authored events contain `ts`, `event`, and `feature`; phase events
include `phase` and `agent`, and gate-release events include `decision`. The observational
`subagent.start` hook is the sole envelope exception because PreToolUse has no trustworthy
pipeline feature coordinate; its complete bounded schema is defined in `### subagent.start`.

Only for a Native Codex trace selected by a `phase.end` whose
`usage.kind` is `codex_usage_delta`, `phase.start` also contains an allowlisted
`usage_checkpoint` and `usage_scope: "codex-root-reachable"`; `phase.end`
contains an allowlisted `usage` delta. The complete shape and privacy boundary
are defined in `plugins/team-harness/skills/pipeline/references/observability.md`.
The root thread identifier, session identifiers, rollout paths, raw rollouts,
and collector session list are never native event fields. A legacy Claude trace
without `usage` retains its existing envelope.

Agent events are concise execution observations and never select or alter the
Native Codex cost branch.

Core event names are:

| Event | Meaning |
|---|---|
| `pipeline.start`, `pipeline.complete`, `pipeline.incomplete`, `pipeline.end` | Run lifecycle |
| `phase.start`, `phase.end` | Named-state dispatch and completion; `phase` is one of the v3 states or a trace detail owned by that state |
| `agent.spawn`, `agent.close`, `agent.correction.spawn`, `agent.cleaner-handoff.spawn`, `agent.sla` | Specialist execution observations; all carry a concise observation and close records status; role/task labels are optional diagnostics |
| `correction.decision`, `cleaner.handoff.decision` | The single authority record for a correction or cleaner handoff. It carries the complete package once and assigns `decision_ref`; downstream lifecycle observations carry only that reference |
| `stage.gate`, `stage.gate.release` | Gate presentation and dual-record release |
| `gate`, `gate.pass`, `gate.fail` | Human-checkpoint marker or an internal verdict; never a release by itself |
| `iteration.start` | Implementation/validation correction observation linked by `decision_ref`; new producers use `cause: verification` only. `convergence_counts` may be derived from the findings ledger for diagnostics but is not required. Historical `cause: operator` events remain readable but are not emitted for plan repairs, operator decisions, or explicit design work |
| `artifact.missing`, `operation.started/success/failed` | Artifact and operation observability |
| `checkpoint.confirmed` | Discover reasoning checkpoint evidence, not a gate |
| `design.oversize` | The live decision on a design delta past `max_requirements_per_change` — `split`/`accept`/`narrow`, with the requirement count; recorded before any content identity, `01-plan.md`, or Gate 1 |
| `stage2.hygiene` | Implementation hygiene scan result |
| `kg_write` | One reason-coded knowledge write batch; no `kg.started` family |
| `compaction.trigger` | Context-compaction breadcrumb |

There is no `plan_structure` event in v3: the former deterministic plan-structure phase is
retired. Plan validity is a minimum artifact check in `design`; a missing or malformed artifact
gets one normal design correction.

### Declared Codex agent lifecycle

These events are coordinator bookkeeping for deliberate specialist dispatches,
not native Codex lifecycle telemetry. The current runtime does not expose a
privacy-safe per-attempt attribution record. The coordinator writes an event
only for a dispatch, continuation, terminal return, or verification correction
it directly observes. It does not mine rollouts, callbacks, transcripts,
prompts, tool output, or native IDs to fill the schema.

Agent telemetry uses the universal `ts`, `event`, and `feature` envelope plus
one concise `observation`. Role and task labels are optional diagnostics; only
the exact architect/design pair is interpreted by the OpenSpec Gate-1
preflight. Close records `status`. SLA observations do not require attempt
ordinals, context strategies, follow-up counters, heartbeat fields, artifact
probes, quality verdicts, or per-attempt metrics. Older events may retain those
fields and remain readable without migration.

## Flow Telemetry Emission

Flow telemetry is a separate, opt-in cross-user plane. It is not the local execution trace, does
not change the v3 state machine, and never carries gate releases or coordination state.

### Config gate

The coordinator reads `flow_telemetry.enabled` from
`~/.claude/.team-harness.json` at startup. The default is `false`; when absent or false, no
`mcp__memory__record_flow_event` calls are made. When true, emission is fire-and-forget and
best-effort. A connectivity, validation, or tool error appends exactly one local
`operation.failed` event with `operation: flow-telemetry`, `status: failed`, a bounded
one-line `error`, and a one-line retry `suggestion`; the pipeline continues unchanged.

### Emission contract

The external context-harness-mcp flow-event schema is metadata-only and must remain byte-identical
to the catalog below. Every payload contains the common fields `event`, `ts`, `project`,
`task_type`, and `th_version`; per-event fields are limited to the listed names.

| `event` | Per-event fields | Field constraints |
|---|---|---|
| `guard.block` | `hook`, `reason`, `resolved` | `hook`: `prepublish`/`dev`/`policy`; `reason`: `over-bump`/`secret`/`outward`; `resolved`: boolean |
| `gate.fail` | `gate`, `verdict` | `gate`: `STAGE-GATE-1`/`STAGE-GATE-3`/`acceptance`/`plan-review`; `verdict`: `fail`/`concerns` |
| `verify.reject` | `agent`, `verdict` | `agent`: `qa`/`tester`; `verdict`: `fail`/`concerns` |
| `iteration.loop` | `stage`, `iterations` | `stage`: `1`/`2`/`3`; `iterations`: integer ≥ 2 |
| `blocked` | `reason` | `reason`: `no-dispatch`/`manual-push`/`guard`/`dependency` |
| `scope.collapse` | `items_dropped` | integer ≥ 1 |
| `mcp.unavailable` | `op` | `op`: `read`/`write` |
| `abandon` | `last_stage` | `last_stage`: `1`/`2`/`3` |

The payload contains bounded enums, integers, booleans, a semver, and a timestamp only. No diff,
code, AC text, private path, personal identifier, secret, credential, or gate nonce crosses into
the cross-user plane.

### Cross-user plane and triggers

The local plane (`00-execution-events.jsonl` or fenced `.md`) remains the operator's complete
trace. The cross-user plane is an aggregate friction signal only. When enabled, the coordinator
emits `guard.block`, `gate.fail`, `verify.reject`, `iteration.loop`, `blocked`, `scope.collapse`,
`mcp.unavailable`, and `abandon` at the corresponding friction points. Telemetry is never a
replacement for `00-state.md`, and it never releases a gate.

### Cross-user friction triggers

| Friction point | `event` value | When to emit |
|---------------|---------------|--------------|
| A hook blocks an outward action | `guard.block` | When `dev-guard` or `policy-block` returns `deny` or `ask` and the operator does not override |
| STAGE-GATE-1/3 operator rejects or requests edit | `gate.fail` | When the operator votes `rejected`/`edit`/`amend`/`abort` at any STAGE-GATE the orchestrator witnesses |
| Plan-review verdicts `concerns` or `fail` | `gate.fail` | When `plan-reviewer` returns `concerns` or `fail` (gate: `plan-review`) |
| Acceptance gate fails a verify round | `gate.fail` | When validation routes a correction back to implementer (gate: `acceptance`) |
| A verifier returns `fail` or `concerns` | `verify.reject` | When `qa` or `tester` returns a non-pass verdict |
| An agent iterates (≥2 rounds) | `iteration.loop` | When validation has reached the 2nd correction round |
| Pipeline reaches `blocked-no-dispatch` or `blocked-manual-push` | `blocked` | When dispatch is unavailable or push is blocked |
| Operator or pipeline collapses scope | `scope.collapse` | When AC items are dropped from the plan during STAGE-GATE-1 edit review |
| MCP memory server unavailable | `mcp.unavailable` | When a KG read/write call fails due to connectivity (op: read or write) |
| Pipeline is abandoned by operator at any stage | `abandon` | When the operator explicitly aborts at any STAGE-GATE |

### Example payload (gate.fail)

```json
{
  "event": "gate.fail",
  "ts": "2026-06-21T10:00:00Z",
  "project": "team-harness",
  "task_type": "feature",
  "th_version": "2.117.2",
  "gate": "STAGE-GATE-1",
  "verdict": "fail"
}
```

---

## `operation.*` events

An optional, additive family for a long-running recoverable boundary or a diagnostic failure.
Routine successful config loads, initialization, and tool calls stay silent. These events live in
`00-execution-events.{jsonl|md}` alongside `phase.*` and `gate.*`, distinguished by the `event`
prefix, and they carry the envelope defined in § "Event envelope" — nothing more.

A second, stricter schema used to be stated here, marking `operation`, `status` and `timestamp`
as required on every such event. No producer ever wrote them: all 26 `operation.*` events of the
last audited run carry `event`, `feature`, `ts` and `extra`, and would have failed it. The
envelope is the one schema.

## Placement in 00-execution-events

### subagent.start

The Claude Code plugin's PreToolUse hook records a dispatch-start breadcrumb as
one JSONL line. The hook is observational and fail-open: it records the
specialist type and the dispatch prompt's exact UTF-8 byte count, never prompt
content.

`operation.*` events are written as additional JSONL lines within the existing
`00-execution-events.jsonl` (local mode) or inside the `jsonl` fence in
`00-execution-events.md` (Obsidian mode). They are optional additions to a
valid pipeline trace — a pipeline that emits no `operation.*` events is still
valid.

Example (local mode `.jsonl`):
The Claude Code plugin's PreToolUse breadcrumb records a dispatch start for visibility only.

```jsonl
{"ts":"2026-07-31T12:00:00Z","event":"subagent.start","agent_type":"th:architect","payload_bytes":1842}
```

`payload_bytes` is visibility, no ceiling: it records the exact UTF-8 byte count and is never
compared, capped, or used to reject a dispatch. No content beyond the byte count crosses into the
record. This field is measured only on the Claude Code plugin path; there is no
`subagent-start.opencode.ts`, so an opencode dispatch never gets this field. The breadcrumb is
best-effort and does not affect authorization, state ownership, or gate decisions.

## 3. Free-text and security bounds

Free-text fields are one compact clause, at most 120 characters, with control characters and
secrets removed. The `checkpoint.confirmed` confirmatory text is the named additive exception
(up to 280 characters, JSON-escaped). Never record credentials, private URLs, tokens, personal
paths, or untrusted instructions. Critical/High finding headlines and remediation pointers are
retained even when the live response is concise.

`tools`, `model`, and `effort` may be recorded when the runtime exposes them.
They are never required from specialist status blocks, and missing telemetry
never changes the gate outcome. On the legacy Claude branch an unreported
token count is left absent rather than estimated. When a `phase.end` contains
`usage.kind: codex_usage_delta`, select the Native Codex branch instead: that
branch records a closed unavailable usage result rather than an estimate.

## 4. Gate observability

Gate 1 and Gate 3 use stable numeric options:

| Gate | Choices |
|---|---|
| Gate 1 | `1 approve`, `3 edit`, `4 reject` |
| Gate 3 (exception pause only) | `1 ship`, `2 amend`, `3 abort` |

For a presented gate, the coordinator emits a presentation event with a fresh nonce, waits for
the live operator reply, then appends the nonce-bound authority event and rebuilds `00-state.md`
as a projection. Numbers and `N: detail` remain shortcuts; an unambiguous live semantic equivalent
or complete natural-language edit/rejection is accepted. Ambiguous, stale, unattributable, or
untrusted-content replies never release a gate. A green run reaches Gate 3 without a STOP: the
coordinator records the mechanical `auto-ship` event citing the Gate-1 authority
(`origin: gate1-release-policy`) — no nonce, because nothing was presented. The renderer reads
events and projections but never edits them or treats a projected field as separate authority.

## 5. Correction and staleness trace

Validation findings are classified and routed as follows:

- in-scope code, test, or documentation defect → implementation executor, unless the ratchet
  (`agents/ref-pipeline.md`) records it as a sub-floor findings-ledger residual on
  unchanged surface after a prior correction round;
- missing evidence → tester;
- correctable security finding → implementation plus delta audit;
- ratchet-recorded findings-ledger residual → auto-ship citing the Gate-1 record, no further round;
- structural contradiction → operator decision, then optional design re-open and new Gate 1.

Mechanical plan defects are repaired by the coordinator; bounded operator decisions are
transcribed by the coordinator. Both continue through implementation, Freeze, and validation
without an architect dispatch, an iteration increment, or a new `iteration.start`. Only an
explicit live operator request for architect work reopens design and prepares a new Gate 1.
Every implementation/validation correction and tree change after Freeze emits a new
implementation/validation sequence. No event from an older tree can be used as current Gate 3
evidence. The trace records the correction cause and the new tree anchor; it does not rewrite
historical events.

## 6. Decision ledger

The decision ledger is append-only and coordinator-owned. It records four event families:
`gate-verdict`, `operator-approval`, `disposition`, and `dry-run-enforced`. It contains the
rationale and subject of a decision, not phase timing or token counts; those remain exclusively in
the execution trace. The ledger records both gate numbers using the same `stage` and `phase` keys
so audit readers can join the two files.

Finding dispositions distinguish `accept`, `watch`, and `reject`. A structural contradiction is
never converted into an accepted finding merely to advance the state. Gate releases remain valid
only when the state field and ledger/event record agree with the live reply and nonce.

## 7. Cross-user flow telemetry (optional)

When `flow_telemetry.enabled` is true, the coordinator may emit bounded metadata to the external
Memory MCP flow-event plane. It is opt-in, metadata-only, and best effort. A telemetry failure
emits one local `operation.failed` breadcrumb and never changes a pipeline result. Payloads never
contain diffs, code, AC text, file paths with user identifiers, secrets, or gate nonces.

## 8. Rendering and recovery

`/th:pipelines` is a pure reader of state and events. It displays the named `phase`, gate pending,
iteration, and `next_action`; it never displays or infers a route/profile value and never infers a
release from a checklist row. `/th:trace` renders the event timeline and links to artifacts
without copying their full content. Inline work and inline ad hoc reviews have no pipeline trace to
render.

**Pairing redefinition within `project` (AC-5.2).** When one or more
`subagent.start` lines in the trace carry a `project` key, same-agent-type
pairing is scoped WITHIN that key: a `subagent.stop` line is matched to the
oldest pending `subagent.start` line sharing the same `agent_type` **and**
the same `project`, not merely the same `agent_type` file-order-wide. This
matters once two or more orchestrator lanes dispatch the same specialist
type (e.g. two lanes each dispatching `th:implementer`) into a shared trace
file — plain `agent_type` FIFO pairing would cross-wire lane A's start with
lane B's stop. Lines with no `project` key continue to pair against each
other under the original agent_type-only FIFO rule (backward-compat).

**Stop-side residual — cannot be enforced by the writer, only by the
reader.** `subagent.stop` lines never carry `project` (see "00-subagent-trace.jsonl"
above) — the SubagentStop payload has no prompt to read `TH-LANE` from. A
reader implementing the pairing rule above therefore cannot join on `project`
at the stop-line level; it must derive the pairing from the `project`-tagged
`subagent.start` side only (e.g., scope each pending-starts queue by
`(agent_type, project)`, and let ungrouped/legacy `subagent.start` lines with
no `project` share one `agent_type`-only queue). The authoritative per-agent,
per-lane timing record remains the orchestrator's `phase.end` event, which
does carry `project` end-to-end — this breadcrumb pairing rule is a
best-effort backstop, not a replacement.

**Complements, never replaces, `phase.end`.** Same relationship as the stop
breadcrumb: this file proves a `th:*` boundary occurred and, paired with the
stop line, how long it has been in flight — it carries no tokens, no
per-phase detail, no result. The orchestrator's `phase.end` events remain the
authoritative rich record.

**Direct wiring by design (not the launcher).** `.claude-plugin/hooks.json`
wires this hook directly to `node ${CLAUDE_PLUGIN_ROOT}/hooks/ts/dist/subagent-start.cjs`
— unlike the security floors and the other observational hooks, it does NOT
route through `hooks/run-ts-hook.sh`, the fail-closed launcher the
Bash→TS hook cutover introduced for the rest of the fleet. This is
intentional: `subagent-start` is observational and fail-open by its own
design, so a launcher indirection buys no additional safety and only adds a
process hop on the hot dispatch path. The marketplace plugin — the only
Claude Code install path (the Go installer's CC path is retired) — ships
`hooks/ts/dist/` in its own cache, so the target path always exists.

**Fail-open, not fail-closed.** Absent `node`, a missing `.cjs`, or any
internal error degrades to a lost breadcrumb — it never blocks the `Task`
dispatch. This is deliberate: this hook pilots the `node → dist/*.cjs`
execution mechanism on a live fleet, at a cost of a lost breadcrumb, ahead of
the security floors adopting the same mechanism behind a fail-closed launcher.

**Non-suppressible by design.** Unlike `subagent-trace.ts` (the stop-side TS
body, which is gated by `observabilityEnabled("pipeline-observability")`),
the start-side body does NOT import the hook-profile helper — it inherits the
Bash oracle's original invariant that this class of breadcrumb must never be
erasable by `TH_HOOK_PROFILE`.

**Reader.** `/th:pipelines` derives in-flight lanes (agent type + elapsed
time since start) from unpaired `subagent.start` lines and shows duration for
complete start/stop pairs; the render is fail-soft (no file, or no pairs,
omits the section silently). See `skills/pipelines/SKILL.md § In-flight
lanes`.

### 00-precompact.jsonl — PreCompact breadcrumb

Written by `hooks/ts/dist/precompact-snapshot.cjs` (PreCompact event, matcher
`manual|auto`). Appended to when the hook successfully snapshots `00-state.md`
before context compaction. The file sits in the same directory as the snapshot:

- **local mode:** `{persisted workspace_identity.coordinator_root}/00-precompact.jsonl`
- **obsidian mode:** `{persisted workspace_identity.coordinator_root}/00-precompact.jsonl`

Line schema:
```json
{"ts":"<ISO>","event":"precompact.snapshot","trigger":"manual|auto","status":"success"}
```

The companion snapshot file is `00-state.precompact-snapshot.md`, written as a
single rolling overwrite-in-place beside `00-state.md`. One rolling file, never
an ever-growing set.

**What this captures.** A byte-identical copy of `00-state.md` at the moment
PreCompact fires. It enables `/th:recover` to restore in-flight pipeline state
when a context auto-compact happens mid-pipeline before state is fully flushed.
The snapshot copies ONLY `00-state.md` — no transcripts, no config files, no
`00-execution-events`, no tool output.

**Data exposure note (SEC-DR-001).** The snapshot introduces **no new secret
value**: it is a byte-identical copy of `00-state.md`, bounded to that one file —
nothing new is read or written that the workspace did not already hold. In
obsidian mode the vault is a pre-existing, long-lived, possibly-synced surface
that the pipeline already writes every `00-*.md` into; the snapshot inherits that
same surface and does NOT widen it. In local mode the snapshot is under
`workspaces/`, already covered by the `/workspaces` `.gitignore` entry.

**Gated by `TH_HOOK_PROFILE`.** Same as the SubagentStop hook above — suppressed
under `minimal`, enabled under `standard` (default) and `strict`.

Standalone skills (`/th:setup`, `/th:lint`, `/th:kg`) that execute outside
a pipeline context write their own `operation.*` events only when a workspace
and events file exist. When no workspace exists (one-shot invocation), these
skills apply the same output discipline — silence on success, one-line error +
suggestion on failure — without event persistence.

## overview.md — initiative parent index (NOT an events file)

When the `initiative` field in `00-state.md` is set, the coordinator also
maintains a parent-level `overview.md` at the initiative root. This file is
**not an events file** and does not contain pipeline observability data. It is
a living index — one row per project, updated by the coordinator at intake and
again after its own Phase-4 mechanics resolve branch, version, PR, and status.
It shares the one coordinator root with `00-state.md` and the lifecycle stream.

**What it is:**
- A snapshot of the current state of the initiative (project rows with branch /
  version / PR / status).
- A cross-project narrative (`## Functional Description` and `## Big-Picture Plan`)
  that no single `01-plan.md` owns.

**What it is NOT:**
- Not an execution-events file. No JSONL. No `phase.*` or `operation.*` events.
- Not a replacement for coordinator-root `00-state.md` or
  `00-execution-events.*`. Service folders hold evidence, not competing state.
- Not subject to the mandatory observability invariant (CLAUDE.md §5 "Pipeline
  observability is mandatory") — that invariant governs `00-execution-events.*`
  only. `overview.md` writes are **best-effort** and a write failure never
  fails the pipeline.

**Location (mode-dependent):**
- Obsidian: `{logs-path}/{logs-subfolder}/{repo_base}/{YYYY-MM-DD}_{initiative}/overview.md`
- Local: `{common-parent-of-sibling-repos}/{YYYY-MM-DD}_{initiative}/overview.md`

Full template and section-ownership map: `agents/ref-dispatch-machinery.md § "overview.md — you are the sole writer"`.

## Initiative-level trace (serial multi-service sequencing)

**No parallel coordinator fan-out exists.** The coordinator fusion retires the multi-task
fan-out with its consolidator and the parallel multi-project dispatch that spawned one
orchestrator instance per project — `agents/ref-pipeline.md` #2 forbids
dispatching any coordinator, including another copy of itself, with no exception clause, and
`agents/ref-dispatch-machinery.md § "Multi-project sequencing"` names serial execution as the
derived consequence of that invariant, not an independent policy. One project runs to completion
inside the same agent before the next one starts. The `00-leader-roster.md` file, the `fanout.*`
event family, and the two-tier `leader-recover`/`orchestrator-recover` split below all lose their
subject with that retirement — nothing replaces them.

When `initiative` is set, its coordinator-root `00-execution-events` file is
the sole lifecycle stream so `/trace` and `/th:pipelines` can render grouping:

**Location:**
- Obsidian: `{logs-path}/{logs-subfolder}/{repo_base}/{YYYY-MM-DD}_{initiative}/00-execution-events.md`
- Local: `{common-parent-of-sibling-repos}/{YYYY-MM-DD}_{initiative}/00-execution-events.jsonl`

**Lifecycle events** (written by the coordinator into the initiative-level file):

| Event | Fields | When emitted |
|-------|--------|--------------|
| `initiative.start` | `initiative`, `eligible_services[]` | Before the first service's Stage 1 begins |
| `service.start` | `service`, `initiative` | When a service's own pipeline begins |
| `service.end` | `service`, `initiative`, `status` (success/failed/iterating) | When a service's pipeline completes or is blocked |
| `initiative.converge` | `initiative`, `services[]` (service + status per service) | When every eligible service has run |

Each service-scoped event carries a `service` key so `/trace` can group events by service.

Service-scoped `phase.*` and agent events carry a `service` key in this same
stream. Service directories may contain validation evidence but never a second
gate stream. One consolidated Gate-1 event binds the ordered OpenSpec aggregate.

**`/th:pipelines` and `/trace` rendering.** Both read the one coordinator
`00-state.md § Current State`, its persisted workspace identity and ordered
bindings, plus the lifecycle events above. They render the initiative as a
parent with service children. Execution is serial, so at most one service runs.

**Mandatory + additive, not mandatory for single-project runs.** The initiative-level `00-execution-events` file is only written when `initiative` is set. Single-project runs (`initiative: null`) do not produce this file.

## Additional pipeline event types

The following event types appear in `00-execution-events` in addition to the core `phase.*`, `gate.*`, `operation.*`, and `stage.*` families documented above:

| Event | When emitted | Key fields |
|-------|-------------|------------|
| `gate` | When a human-checkpoint gate is reached (DOC-GATE, STAGE-GATE approval prompt) | `gate` (name), `action` (`stop`/`approved`) |
| `research.lane.skipped` | When a research fan-out lane returns no findings (fail-open) | `lane`, `angle`, `reason` |
| `artifact.missing` | When an expected agent output file is absent after dispatch | `expected_file`, `agent`, `action` (`retry`/`escalate`) |
| `stage2.hygiene` | When the code-hygiene scan completes (deterministic, orchestrator-run — see `docs/code-hygiene-gate.md § Layer 1`) | `verdict` (`pass`/`fail`), `extra.files` (int, on `fail`), `extra.count` (int, on `fail`) |
| `checkpoint.confirmed` | When `th:orchestrator` obtains — or fails to obtain — the operator's live confirmation of the functional-clarity artifact at Discover Boundary B1, before dispatching `architect` (`docs/reasoning-checkpoint.md § "Attribution and failure direction"`) | `provenance` (`operator-live`/`inferred`), the confirmatory text (named exception to the Free-text field bound, see below) |

Note: `checkpoint.confirmed` is written exclusively by `th:orchestrator`, on the same file it already initializes at Intake (`agents/ref-pipeline.md`). On a later `/th:recover`, the same agent reads and verifies the event but never repairs it.

Note: `gate` (human checkpoint) is distinct from `gate.pass` / `gate.fail` (automated agent-to-agent gates). The latter fire when the orchestrator evaluates a plan-review or acceptance-gate result without pausing for human input; the former fires when execution is suspended pending operator approval.

Note: the `lane` field on `research.lane.skipped` names a **research fan-out lane** (one angle of a `/th:research-code` fan-out). It is unrelated to the retired pipeline depth-lane markers; current pipeline state has no execution-lane field.

## kg_write event

`kg_write` is a **sibling event** (peer of `phase.*` / `gate.*` / `operation.*`) emitted by the orchestrator after each Knowledge Graph write batch. Unlike `operation.*`, which models a single discrete operation, a KG write site may attempt multiple writes in one batch; `kg_write` carries per-batch counters (`attempted`, `succeeded`) and a per-write `writes[]` array so `/th:trace` can aggregate the explicit knowledge-save and narrow security-finding sites.

**Shape:**

```json
{
  "ts":        "<ISO-8601 with timezone>",
  "event":     "kg_write",
  "feature":   "<kebab-case, matches workspaces folder>",
  "phase":     "explicit-knowledge-save | 3-verify",
  "site":      "explicit-knowledge-save | security-finding",
  "attempted": "<int — writes attempted in this batch>",
  "succeeded": "<int — writes that completed with create_nodes/add_observations>",
  "writes": [
    { "reason": "ok",                      "detail": "<optional — e.g. 'create_nodes: prisma-sqlite-enum'>" },
    { "reason": "skipped:mcp-down",        "detail": "<optional — verbatim from doctor or error, NO secrets>" },
    { "reason": "skipped:malformed-call",  "detail": "<optional — tool name or arg error>" },
    { "reason": "skipped:policy-filtered", "detail": "<optional — e.g. 'content-policy: user-path'>" }
  ]
}
```

**Field rules:**

| Field | Required | Notes |
|-------|----------|-------|
| `ts` | always | ISO-8601 with timezone (same convention as every trace event) |
| `event` | always | Literal `"kg_write"`. One type, no state suffixes. |
| `feature` | always | Kebab-case, matches the workspaces folder |
| `phase` | always | Pipeline phase where the write occurs |
| `site` | always | Discriminator for the current write site. Closed vocabulary: `explicit-knowledge-save`, `security-finding`. Trace readers may accept retired values for historical workspaces but producers never emit them. |
| `attempted` | always | Count of writes attempted. `0` when the site decided nothing to write (e.g., no reusable learning) |
| `succeeded` | always | Count of effective writes (`create_nodes` / `add_observations` returned without error). Always `≤ attempted` |
| `writes` | always | Array, one entry per attempted write. `length == attempted`. Empty array `[]` when `attempted == 0` |
| `writes[].reason` | always | One of the 4 reason codes below |
| `writes[].detail` | optional | Mechanical context only — **same secret prohibition as `operation.*`**: no tokens, no bearer credentials, no private URLs, no user-path identifiers |

**Consistency invariant:** `succeeded == count of writes[] entries where reason == "ok" AND detail does NOT start with "content-gate:"` and `attempted == writes.length`. Content-gate skips (`reason: "ok"`, `detail: "content-gate: ..."`) are legitimate zero-increment entries and are excluded from the `succeeded` equality. `/th:trace` validates and aggregates using this invariant.

**Reason vocabulary (4 codes):**

| `reason` | Meaning | Derives from |
|----------|---------|--------------|
| `ok` | Write was effective (`create_nodes` / `add_observations` returned without error) — OR a content-quality gate legitimately decided not to write (the seam worked; the gate found nothing to persist). Distinguish with `succeeded`: a quality-gate skip is `ok` with `detail: "content-gate: <reason>"` and does NOT increment `succeeded`. | Successful MCP return, or content-quality gate decision (`low-specificity`, `type-mismatch`, `no-reusable-learning`, dedup→merge) |
| `skipped:mcp-down` | The MCP seam is unreachable, degraded, or not wired — the write could not be attempted due to infrastructure. This is the code that would have fired for the `create_entities` naming bug (PR1). | `doctor` degraded/error, MCP unreachable, tool not wired |
| `skipped:malformed-call` | The tool call failed due to a non-existent tool name or malformed arguments (not infrastructure). This is the exact code for the renamed-tool class of bug. | tool-not-found, invalid args, schema rejection by the MCP not caused by connectivity or policy |
| `skipped:policy-filtered` | The content-policy filter or an MCP `policy/*` return discarded the write. | Content-policy drop, MCP `policy/<code>` response |

**Why a sibling event, not `operation.end`:** `operation.*` models one discrete operation with three states (`started` / `success` / `failed`) and no counters. A write batch may create several nodes, with some `ok` and others `skipped:policy-filtered` in the same run. Forcing that into `operation.end` would require either one event per node (multiplies noise) or adding counters to `operation.*` (breaks its single-operation schema for every non-KG use). A sibling event `kg_write` with `attempted` / `succeeded` / `writes[]` expresses the batch in one line without contaminating `operation.*`. This does NOT violate the "no parallel KG-namespaced events" rule in the orchestrator — that rule prohibits a **family** with state suffixes (`kg.started` / `kg.success` / `kg.failed`); `kg_write` is a **single event type** with no suffixes.

## 00-state.md bounded snapshot (`§ Agent Results` + `§ Hot Context`)

`00-state.md § Agent Results` and `§ Hot Context` are **bounded, replaceable
snapshots** (`docs/output-contract-patterns.md § 2` `bounded` intensity
level) — current-state-only, never an accumulating append-log. All historical
detail (what happened at each phase, over time) lives exclusively in
`{events_file}`; `00-state.md` shows only where the pipeline is now.

**`§ Agent Results` — keyed upsert, not append.** Each row is keyed by
`(agent, phase)`. A re-dispatch of the same `(agent, phase)` key across
iterations (e.g. `implementer` re-run after a Phase-3 iteration) overwrites
that row in place — it never adds a second row for the same key. A distinct
`(agent, phase)` key is always a distinct row: `security` and `adversary`
both dispatch during validation but are different agents, so each keeps
its own current-verdict row — including `adversary`'s
`incomplete_on_changed_control` field — never collapsed into a single
last-writer-wins value. In-place replacement happens **between iterations**
(the same lens re-running), never **between lenses of the same phase** (two
different lenses are always two rows).

**`§ Hot Context` — overwrite in place, not append.** Rewritten at every phase
transition to reflect only the current open insight/constraint; a new entry
on the same topic replaces the prior one rather than appending beside it.

**Iteration re-narration ban applies to both sections.** Neither section
re-tells what happened in a past iteration — each references the iteration by
ID only (`Iteration {N}`), per `docs/output-contract-patterns.md § 5`. The
narrative for a given round lives exclusively in `failure-brief.md`.

**Does not weaken the observability floor.** This is a FORMAT bound on two
`00-state.md` sections; it does not touch `{events_file}`'s mandatory
`phase.*`/`gate.*` emission (inline direct work is outside that machine) and it does not change what `00-pipeline-summary.md`
derives from the trace.

Canonical source: `agents/ref-pipeline.md` (the upsert mechanic) and `§ "Agent Results"` (the schema template — the narrative "Hot
Context" section this upsert once also maintained is retired, per that same section's own note);
the two sites must not diverge.

## Posture observability

The live contract has two postures. `pipeline` uses the canonical v3 state machine and emits
the local trace, ledger, summary, phase events, and gate events. `inline` is direct work outside
that machine: it creates no pipeline state, workspace records, or gate events. A live ad-hoc
tester, QA, or security review requested while inline returns bounded evidence only.

Legacy `express`/`full` depth lanes, `lane` fields, `lane_autoselect`, and related fast/simple
markers are migration data only. They never select a posture, suppress an event, waive a security
floor, or release a gate. Readers may retain them when interpreting historical traces, but current
writers do not emit them.

Security-sensitive pipeline work always receives the same security floor. Inline sensitive work
requires a fresh live operator choice under the inline authorization contract; that choice is
not persisted as a route selector and never activates pipeline observability.

## Retired plan-structure event

The former `plan_structure` event and Phase 1.5a automatic scan are superseded. Current v3
design performs one deterministic presence/coherence check before Gate 1, and explicit
`/th:plan-review` may inspect plan shape. The historical event vocabulary and checks remain
reference material only; they are not emitted, dispatched, or gate-releasing.

## Cost rollup


**Branch selection.** Select the Native Codex branch only when a `phase.end`
event contains an object whose `usage.kind` is `codex_usage_delta`. A
`phase.start` checkpoint, route, model, agent, or any other field never
selects it. When no such `phase.end` exists, retain the complete legacy Claude
contract below unchanged, including the optional `tokens` field and the
established token rendering.

This section defines the token-visibility surface for the legacy/Claude branch.
It covers the schema of the `## Cost` section in `00-pipeline-summary.md` and
the derivation rule shared by the orchestrator summary writer and the
`/th:trace --tokens` skill.

### Reported in tokens — no USD on this branch

The legacy branch reports tokens and nothing else. There is no `pricing` key in
`~/.claude/.team-harness.json`, no price table, and no model-tier classification: none of them
ever had a producer, so every surface that read them was removed rather than left as a contract
nothing satisfies. Deriving USD needs a real price source and belongs to whoever wants the
figure. The native Codex branch below is unaffected — its `cost_usd` comes from the collector's
own quote, not from a table stated here.

### `## Cost` section schema for `00-pipeline-summary.md`

The orchestrator appends a `## Cost` section to the pipeline summary at each of
the 4 mandatory checkpoints (STAGE-GATE-1 emission, Stage-2 close, every
`iteration.start`, `pipeline.complete`/`end` — see `agents/ref-pipeline.md`
§ Pipeline Summary Protocol → "When to rewrite"); rewriting at every other
phase transition is best-effort. The section derives entirely from the
`phase.end` events in `00-execution-events.{md,jsonl}` — it is a render of the
trace, not an independent source. The Final Pipeline Sanity Check fails closed
on a missing `## Cost` section (`agents/ref-pipeline.md` § Final Pipeline
Sanity Check, step 6).

**Schema:**

```markdown
## Cost
**Total tokens:** {N} (summed over the {M} of {T} phases that reported a count)
**Architect runs:** {N}x ({N} phases with agent: architect — signal for multi-run cost)

| Agent | Phases | Tokens | % |
|-------|--------|--------|---|
| architect | {list} | {N} | {P}% |
| implementer | {list} | {N} | {P}% |
| ... | ... | ... | ... |
| **Total** | | **{N}** | 100% |

| Phase | Agent | Tokens |
|-------|-------|--------|
| 1-design | architect | {N} |
| 2-implement | implementer | {N} |
| ... | ... | ... |
```

**Rendering rules:**

- `## Cost` is placed after `## Tool Effectiveness` and before `## Iterations` in
  the schema order.
- A `phase.end` with no `tokens` field renders `—` in the Tokens column and is
  excluded from the total. The section header reports how many phases reported a
  count so the reader can see what the total covers.
- The "Architect runs" line is a cost-awareness signal: a feature where the architect
  ran 3 times spent 3× architect-tier tokens in Stage 1. It is not a quality judgment.
- In obsidian mode, extract the JSONL fence from `00-execution-events.md` before
  summing tokens (same `sed -n '/^```jsonl$/,/^```$/{/^```/d;p}'` pattern used by
  `/th:trace --tools`).

### Derivation rule

1. Read all `phase.end` events from `{docs_root}/{events_file}`.
2. For each event, extract `agent`, `phase`, and `tokens` when present.
3. Build the per-agent and per-phase tables.
4. Count phases that reported a `tokens` value for the header annotation.

### Calibration rule — every stated cost figure carries a source tag

Any narrative, human-authored cost claim or estimate in an agent or docs file
(a "typical run costs ~NK tokens" sentence, a phase's documented `**Cost:**`
line, and similar prose) MUST carry a source tag: `(measured YYYY-MM, n=N)`
when backed by a real measurement sample, or `(estimate)` when it is not. An
untagged figure is indistinguishable from a stale guess — the ratify-plan
figure drifted over 10× from its documented "~3-5K tokens" before the June
2026 measurement caught it (see `agents/ref-pipeline.md § Phase 1.5`). Tag
every figure at the time it is written, and re-tag it when a new measurement
supersedes the old one.

**Exempt from this rule:** normative schema/config definitions (the `## Cost`
section schema and its `{N}` template placeholders). These are structural
literals, not claims
about what a run costs, and tagging them would not add information.



### Native Codex branch — `usage.kind: codex_usage_delta`

This branch is selected only by the exact `phase.end.usage.kind` predicate
above. It reads only the allowlisted native delta from each selected
`phase.end` and its matching safe checkpoints; it never scans rollouts. A
missing, malformed, unavailable, regressive, conflicting, or mixed native
delta makes the complete aggregate unavailable. It never substitutes `0`,
estimates, reuses a prior delta, or retains a partial subtotal.
`usage.components.total_tokens` is summed once; `reasoning_output_tokens`
is displayed separately and is never added again.

```markdown
## Cost
Usage: {measured|unavailable (REASON_CODE)}
Total tokens: {N|unavailable}
Cost: {${X.XX} USD|unavailable}
```

No prices are bundled with the native collector and it currently has no exact
provider/model pricing identity. Therefore the current native rendering is:

```text
Cost: unavailable
```

A future native USD amount requires a read-only quote for every
non-overlapping billable dimension with this exact, case-sensitive tuple and
complete provenance:

```json
{
  "provider": "exact native provider",
  "model": "exact native model id",
  "dimension": "exact usage dimension",
  "currency": "USD",
  "rate_per_million": 0,
  "source": "https://authoritative.example/pricing",
  "effective_from": "YYYY-MM-DD",
  "effective_until": null
}
```

The native phase must carry the same exact provider and model in
`pricing_identity`; the source must be present and the effective range must
contain the measurement date. Never infer this identity or rate from an agent
role, event model, frontmatter default, prefix, family, or alias; never blend
rates, convert currency, price aggregate `total_tokens`, or double-count a
component. These prohibitions apply only to the selected Native Codex branch;
they do not change the legacy Claude rules above.

## Relationship to the Output Discipline contract

The `operation.*` schema is the diagnostic log target for the output discipline:

- **On routine success**: emit no operation event and no operator-facing output.
- **On long-running recoverable success**: a previously emitted start may be closed with `operation.success`.
- **On failure**: emit `operation.failed` to the events file AND surface one line to the operator: `{error} — {suggestion}`.

Full behavioral contract: see `agents/_shared/output-template.md` § "Output Discipline".

---

## Working-agreement rationale (CLAUDE.md §5 long-form)

This section contains the extended rationale for the pipeline observability working-agreement declared in CLAUDE.md §5. It was relocated from CLAUDE.md to keep the main file under its size cap (pure relocation — zero behavior change).

### Why observability is mandatory, not best-effort

Skipping event appends to save tokens deletes the only signal available to diagnose pipeline health. The working-agreement is strict: **Writing observability events is mandatory.** Every pipeline run produces two artifacts in `workspaces/{feature}/`:

- `00-execution-events.jsonl` (local mode) — append-only event trace, machine-readable, queryable with `jq`
- `00-execution-events.md` (obsidian mode) — same trace wrapped in YAML frontmatter + `# Execution Events` heading + ` ```jsonl ` code fence

Both are written exclusively by the orchestrator. Runtime-provided tool usage
may be included in `phase.end`; leaf-agent counter fields are not required.
`00-pipeline-summary.md` renders only the telemetry actually available.

### tokens field on phase.end

**Legacy Claude branch — no native `usage` object.** `tokens` (integer) is recorded on a `phase.end` when the runtime reports one and omitted when it does not. It is observability, never gate evidence, so an absent count blocks nothing. **Never estimate it and never write `0`** — a fabricated or zeroed number is indistinguishable from a measurement and misreads the run.


### Native Codex usage on `phase.end`

Select this separate branch only when a `phase.end` contains
`usage.kind: codex_usage_delta`. Every selected `phase.end` carries the
allowlisted checkpoint delta from
`plugins/team-harness/skills/pipeline/references/observability.md`: either
measured or a closed-code unavailable result. For this branch only, zero
substitution, duration-based estimation, alias reuse, partial totals, and using
the legacy `tokens` field as an accounting source are forbidden.

### model / effort fields on phase.end

`model` and `effort` are optional diagnostic context. Main may record them when
the runtime exposes the effective dispatch configuration; agents do not need to
self-report them and their absence never invalidates a result. When absent,
classification falls through to frontmatter/static-list inference (see §
Derivation rule below). A runtime-known session override may therefore be
recorded on the event, while an unknown override remains honestly absent.

For a selected Native Codex branch, `model` and `effort` remain operational
context only. Native cost requires the exact `pricing_identity` and active
quote provenance defined in the native branch; no legacy event/frontmatter/static
fallback can price it.

**Session model override — distinct from the config-override whitelist.** The session model override (an operator utterance such as "use the bigger model for analysis this session") is recorded exclusively in `00-state.md § Current State` and applies only to analysis-tier dispatches (`architect`, the plan-review panel, consolidators) for the current session — it is never written to `~/.claude/.team-harness.json`. This is a **separate mechanism** from the session-scoped config override whitelist (CLAUDE.md §5), which governs `logs-mode`, `logs-path`, `logs-subfolder`, and `clickup.workspace_id`, and which continues to explicitly EXCLUDE `model`. The two must not be conflated: the config whitelist is about persisted-vs-session config keys reachable from `/th:setup`; the session model override is a dispatch-time-only instruction that never touches config and is discarded at session end. Full mechanism: `agents/ref-pipeline.md` § "Session model override".

### kg_write write-integrity rollup

Every KG write emits a reason-coded `kg_write` event carrying `attempted`/`succeeded` counters and the closed vocabulary `ok | skipped:mcp-down | skipped:malformed-call | skipped:policy-filtered`. The `/th:trace` skill aggregates these into a write-integrity rollup so a silently-skipped KG write is never invisible.

### /trace as the canonical 30-second answer

The `/trace <feature>` skill is the canonical 30-second answer to "did this pipeline work and were the tools effective?". It detects both `.jsonl` (local) and `.md` (obsidian) formats automatically. The legacy `pipeline-metrics.json` / `done.yml` artifacts are deprecated in favor of the trace.

### Historical no-workspace note

Legacy Tier-0/no-workspace markers are retained only for interpreting old traces. They are not a
current pipeline exemption: every activated `pipeline` run creates its state, events, ledger, and
summary. `inline` direct work is outside the machine and intentionally has none of those records.

### Lightweight direct-mode exemptions (diagram, spike)

**diagram** and **spike** direct modes are named observability exemptions, by design:

- **diagram** — writes `workspaces/{feature}/research/00-research.md` and the diagram output file, but no `00-state.md` and no `00-execution-events` file. The mode is not a pipeline; it is a one-shot generation task with no phase structure to track.
- **spike** — writes `workspaces/{feature}/02-implementation.md` (and optionally `00-knowledge-context.md`), but no `00-state.md` and no `00-execution-events` file. The mode is an exploratory single-phase task by design.

`/th:pipelines` and `/th:recover` scan for `00-state.md` as the pipeline-presence signal. Diagram and spike workspaces lack this file and are **intentionally invisible** to both tools — they are not "interrupted pipelines" and do not need recovery. When a user asks `/th:pipelines` and a workspace folder exists without `00-state.md`, report it as "untracked by design (diagram or spike mode)".

**translate** direct mode is NOT exempt. It already writes `00-state.md`; the events file is initialized at Step 1 (see `agents/ref-direct-modes.md` § Translate Flow). Its workspace is visible to `/th:pipelines` and `/th:recover`.

---

## Decision Ledger

`00-decision-ledger.{jsonl|md}` is a **new per-workspace append-only file** distinct from `00-execution-events.{jsonl|md}`. The two files answer different questions: `00-execution-events` answers "what happened, when, and how much?" (phase timing, durations, token counts, tool-counts, KG writes); `00-decision-ledger` answers "what was decided, why, and was a dangerous action gated?" (gate verdicts with rationale, operator approvals with reasoning, finding dispositions, and dry-run enforcement records).

**Anti-redundancy invariant (contract between the two files):** the decision-ledger records dispositions + rationale + dry-run enforcement ONLY. It NEVER records phase timing, durations, token counts, tool-counts, or KG write batches — those stay exclusively in `00-execution-events`. Where a gate fires, `00-execution-events` records the FIRING (timestamped, for the timeline) and the decision-ledger records the DECISION (verdict + rationale + disposition, for the audit). The two files JOIN on the shared `phase` / `stage` key.

### Purpose and scope

The decision-ledger provides a durable audit trail of every judgement call made during a pipeline run:

- **Gate verdicts** — why a plan-review or acceptance-gate passed, raised concerns, or failed.
- **Operator approvals** — what the operator explicitly approved or rejected at each STAGE-GATE, and any reason they gave.
- **Finding dispositions** — how security, QA, and reviewer findings were classified (accepted, deferred to watch-list, or rejected as non-applicable). This includes both gate-scoped findings (Phase 1.6, 3.5, 3.6, STAGE-GATE-1) and per-comment classifications from an `apply-review` round (`phase: "4.5-review"` — see "disposition at apply-review rounds" below).
- **Dry-run enforcement** — when a deploy or migration action was routed through a dry-run / plan-only path before any apply, recording which existing hook gated the apply.

### Schema (4 event types)

Every line is a JSON object. One JSON object per line, append-only, never rewritten.

| Field | Required | Notes |
|-------|----------|-------|
| `ts` | always | ISO-8601 with timezone — injected by the orchestrator at write time (`date -Iseconds`). |
| `event` | always | One of: `gate-verdict`, `operator-approval`, `disposition`, `dry-run-enforced`. |
| `feature` | always | Kebab-case, matches the workspaces folder (same convention as `00-execution-events`). |
| `stage` | conditional | Stage number (`1`/`2`/`3`). Required for `gate-verdict` and `operator-approval` at a STAGE-GATE. |
| `phase` | conditional | Phase identifier (e.g. `1.6-plan-review`, `3-verify`, `3.5-acceptance-gate`). Required for internal-gate `gate-verdict` and for `disposition`. Shared JOIN key with `00-execution-events`. |
| `decision` | conditional | The decision value. For `gate-verdict`: `pass`/`concerns`/`fail`. For `operator-approval`: `approved`/`approved-autonomous`/`rejected`/`edit`/`ship`/`amend`/`abort`. For `disposition`: `accept`/`watch`/`reject`. Required for all three event types. |
| `subject` | conditional | What the disposition applies to (e.g. `SEC-finding: missing JWT signature verification`). Required for `disposition`. |
| `rationale` | always | One free-text sentence (≤240 chars) — WHY this verdict/approval/disposition. `"no reason given"` is the explicit value when the operator gave none. **Secret prohibition applies** — the `rationale` field MUST NOT contain tokens, credentials, private URLs, or user-path identifiers. Use mechanical context only (same policy as `operation.*` `detail` fields). |
| `action` | conditional | For `dry-run-enforced`: the deploy/migration action that was gated (e.g. `gcloud sql instances patch`, `prisma migrate deploy`). Required for `dry-run-enforced`. |
| `dry_run_ref` | conditional | For `dry-run-enforced`: how the dry-run was performed (`--dry-run`, `--validate-only`, `plan-only`, `migrate diff`). Required for `dry-run-enforced`. |
| `guard` | conditional | For `dry-run-enforced`: which existing deterministic floor gated the apply (`gcp-guard`, `dev-guard`, `policy-block`). Required for `dry-run-enforced` — names the enforcement layer the ledger is auditing. |

**Disposition vocabulary** (`decision` field when `event == "disposition"`): `accept` (finding acknowledged and accepted as-is), `watch` (accept-with-followup; operator adds to a deferred list), `reject` (finding dismissed as non-applicable).

**Disposition at apply-review rounds (`phase: "4.5-review"`).** The author-side `apply-review` flow (`agents/_shared/apply-review-disposition.md` Step 5) already classifies every incoming reviewer comment as `APPLIED` / `PARTIAL` / `DEFERRED` / `REJECTED` / `NEEDS-CLARIFICATION`. Each comment's classification is appended to the ledger as one `disposition` line with `phase: "4.5-review"`, using a deterministic (non-operator) mapping: `APPLIED → accept`, `PARTIAL → watch`, `DEFERRED → watch`, `REJECTED → reject`, `NEEDS-CLARIFICATION → reject`. `subject` is the comment's one-line summary; `rationale` is the Step-5 Evidence/Note text. This is a straight extension of the existing gate-scoped `disposition` trigger to a non-gate write site — no new event type, no new file. Per the anti-redundancy invariant above, this ledger line is never mirrored into `00-execution-events`.

### Dual-format lifecycle

Mirrors `00-execution-events` exactly:

- **Local mode:** raw `00-decision-ledger.jsonl` — append one JSON object per line.
- **Obsidian mode:** `00-decision-ledger.md` — YAML frontmatter (`tags: [work-logs, {repo}, decision-ledger]`) + `# Decision Ledger` heading + ` ```jsonl ` fence, identical structure to `00-execution-events.md`.
- The orchestrator is the **exclusive writer**; append-only `>>` with a here-doc; never rewritten.
- **best-effort resilience:** if constructing or appending a ledger line fails, log the failure and continue — the pipeline NEVER hard-fails on a ledger emit error. The deterministic gate outcome and the `00-execution-events` trace remain the authoritative record.
- Legacy no-workspace/Tier-0 traces may lack a decision ledger. Current `pipeline` runs always
  attempt each coordinator-owned ledger append; an append failure is recorded in the authoritative
  execution trace and may leave the ledger incomplete. `inline` direct work has no pipeline ledger
  by definition.

### Example lines

```jsonl
{"ts":"2026-06-15T10:00:01-03:00","event":"gate-verdict","feature":"auth-jwt","phase":"1.6-plan-review","decision":"concerns","rationale":"Reviewer raised SEC-001: missing rate-limit on /login; AC-3 scope adjusted."}
{"ts":"2026-06-15T10:05:33-03:00","event":"operator-approval","feature":"auth-jwt","stage":"1","decision":"approved","rationale":"Operator accepted concerns; SEC-001 filed as follow-up issue #99."}
{"ts":"2026-06-15T10:42:11-03:00","event":"disposition","feature":"auth-jwt","phase":"3-verify","decision":"watch","subject":"SEC-finding: token expiry uses Date.now() without UTC normalisation","rationale":"Low-risk today; timezone bug possible in DST transition. Filed follow-up."}
{"ts":"2026-06-15T11:00:00-03:00","event":"dry-run-enforced","feature":"auth-jwt","action":"gcloud sql instances patch","dry_run_ref":"--validate-only","guard":"gcp-guard","rationale":"Schema migration validated before apply; separate apply approval required."}
```

### Relationship to 00-execution-events

The two files are complementary — neither replaces the other:

| Concern | File |
|---------|------|
| When did each phase run? How long? How many tokens? | `00-execution-events` |
| What gate fired? (timeline marker) | `00-execution-events` (`gate.pass`/`gate.fail`/`stage.gate`) |
| Why did the gate reach that verdict? | `00-decision-ledger` (`gate-verdict` + `rationale`) |
| What did the operator say at the STAGE-GATE? | `00-decision-ledger` (`operator-approval` + `rationale`) |
| How was a security/QA finding classified? | `00-decision-ledger` (`disposition` + `subject`) |
| Was a dangerous action forced through dry-run first? | `00-decision-ledger` (`dry-run-enforced` + `guard`) |

The decision-ledger is queryable with `jq` and uses the same `phase`/`stage` key as `00-execution-events` so the two files can be joined on a shared identifier.

On `/th:recover`, the coordinator reads the state snapshot and current trace before acting. v2
snapshots are mapped to the v3 named states by `skills/recover/SKILL.md`; migration records
`state.migrated` on the first legitimate write and never synthesizes a gate release or repairs
history.
