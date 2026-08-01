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
`jsonl` block. Every event contains `ts`, `event`, and `feature`; phase events include `phase` and
`agent`, and gate-release events include `decision`.

Core event names are:

| Event | Meaning |
|---|---|
| `pipeline.start`, `pipeline.complete`, `pipeline.incomplete`, `pipeline.end` | Run lifecycle |
| `phase.start`, `phase.end` | Named-state dispatch and completion; `phase` is one of the v3 states or a trace detail owned by that state |
| `stage.gate`, `stage.gate.release` | Gate presentation and dual-record release |
| `gate`, `gate.pass`, `gate.fail` | Human-checkpoint marker or an internal verdict; never a release by itself |
| `iteration.start` | Correction round, including the cause (`operator` or `verification`) |
| `artifact.missing`, `operation.started/success/failed` | Artifact and operation observability |
| `checkpoint.confirmed` | Discover reasoning checkpoint evidence, not a gate |
| `stage2.hygiene` | Implementation hygiene scan result |
| `kg_write` | One reason-coded knowledge write batch; no `kg.started` family |
| `compaction.trigger` | Context-compaction breadcrumb |

There is no `plan_structure` event in v3: the former deterministic plan-structure phase is
retired. Plan validity is a minimum artifact check in `design`; a missing or malformed artifact
gets one normal design correction.

## Flow Telemetry Emission

Flow telemetry is a separate, opt-in cross-user plane. It is not the local execution trace, does
not change the v3 state machine, and never carries gate releases or coordination state.

### Config gate

The coordinator reads `flow_telemetry.enabled` from
`~/.claude/.team-harness.json` at startup. The default is `false`; when absent or false, no
`mcp__memory__record_flow_event` calls are made. When true, emission is fire-and-forget and
best-effort. A connectivity, validation, or tool error logs exactly
`flow-telemetry: unavailable` in the local events file and the pipeline continues unchanged.

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
| Acceptance gate fails a verify round | `gate.fail` | When Phase 3.5 routes back to implementer (gate: `acceptance`) |
| A verifier returns `fail` or `concerns` | `verify.reject` | When `qa` or `tester` returns a non-pass verdict |
| An agent iterates (≥2 rounds) | `iteration.loop` | When Phase 3.5 has reached the 2nd iteration for a stage |
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

## What operation.* is

`operation.*` is an **optional, additive** event family for a long-running
recoverable boundary or a diagnostic failure. Routine successful config loads,
initialization, and tool calls stay silent. It is nested inside the existing
`00-execution-events.{jsonl|md}` file — it is NOT a separate file. No existing
`phase.*` or `gate.*` contract is modified; `operation.*` events coexist in the
same stream, distinguished by the `event` field prefix.

## Schema

```json
{
  "event":      "operation.started" | "operation.success" | "operation.failed",
  "operation":  "config-load" | "mcp-verify" | "initialization" | "<short-verb-phrase>",
  "status":     "started" | "success" | "failed",
  "detail":     "<optional — one-line machine context, NO secrets>",
  "error":      "<present only when status=failed — one-line error summary>",
  "suggestion": "<present only when status=failed — one-line recovery step>",
  "timestamp":  "<ISO-8601>",
  "phase":      "<optional — pipeline phase this operation belongs to>"
}
```

### Field rules

| Field | Required | Notes |
|-------|----------|-------|
| `event` | always | Prefix `operation.` distinguishes from `phase.*`/`gate.*`/`session.*` |
| `operation` | always | Short verb phrase identifying the operation |
| `status` | always | Mirrors the `event` suffix: started / success / failed |
| `detail` | optional | Machine context only — no secrets, no tokens, no credentials |
| `error` | when failed | One-line error summary — no raw stack traces, no secrets |
| `suggestion` | when failed | One-line recovery step for the operator |
| `timestamp` | always | ISO-8601 |
| `phase` | optional | The pipeline phase this operation belongs to |

### Secret prohibition

`detail` and `error` are log fields. They MUST NOT contain secrets, tokens,
bearer credentials, or other sensitive values. Use mechanical context only
(e.g., `"detail": "config file path: ~/.claude/.team-harness.json"`). The same
KG content policy that governs knowledge-graph nodes applies here.

### Free-text field bound (`bounded` intensity level)

Every free-text field carried by any event in `00-execution-events.*` — this
section's own `detail`/`error`/`suggestion`, `kg_write.writes[].detail`
(§ "kg_write event" below), and any legacy `plan_structure.extra.detail`
retained for historical traces — is bounded to the `bounded`
intensity level defined in `docs/output-contract-patterns.md § 2`: ONE compact
clause — a short phrase or single sentence fragment, ≤120 chars — never
multi-sentence narrative prose. This is a FORMAT bound only: it never reduces
the one-JSON-object-per-line invariant, and it never removes an event —
every `phase.*`/`gate.*` event this schema requires still fires unchanged,
regardless of how compact its optional free-text fields are. Inline direct work is
outside the pipeline observability floor; activated pipeline events remain mandatory.
Canonical source: `agents/ref-pipeline.md § "Free-text bound"`; the two
sites must not diverge.

**Named exception — the `checkpoint.confirmed` confirmatory-text field, additive only.**
The general clause above governs every OTHER free-text field unchanged. The field
carrying the operator's own words in the `checkpoint.confirmed` event (the
functional-clarity confirmation, `agents/ref-pipeline.md § "Checkpoint-trust-transfer"`)
is a single named exception, additive to — never a replacement of — the general clause:
≤280 chars (one confirmatory turn, not the surrounding conversation); quotes and
`\n\r\t` are ESCAPED as JSON string escapes, never stripped, so the operator's exact
characters survive; every backtick character is escaped at the byte level with its
JSON unicode escape (code point U+0060) rather than left literal — this protects the
` ```jsonl ` fence Obsidian mode wraps the trace in (§ "Dual-format lifecycle"), which
the quote/whitespace escape alone does not — and is never neutralized or substituted,
since altering the recorded characters inside the bound is exactly the stripping
behaviour this exception exists to avoid; truncation beyond the 280-char bound is
marked visibly with `…[truncated]`; the secret prohibition (§ "Secret prohibition") is
unaffected — a confirmation carrying a credential records `provenance` and
`withheld — secret prohibition` in place of the text. `provenance` itself is a closed
enum, not free text, and is never subject to this bound. Without this reconciliation
written at both sites — here and `agents/ref-pipeline.md § "Free-text bound"`,
which must not diverge — the field is not added. This exception is scoped to exactly
this one field: the general `≤120 chars`/`never multi-sentence narrative prose` clause
above is byte-preserved for every other free-text field.

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

`tools`, `model`, and `effort` are propagated from specialist status blocks when present. Missing
telemetry never changes the gate outcome; estimated token counts are marked
`tokens_estimated: true`.

## 4. Gate observability

Gate 1 and Gate 3 use stable numeric options:

| Gate | Choices |
|---|---|
| Gate 1 | `1 approve`, `2 approve autonomous`, `3 edit`, `4 reject` |
| Gate 3 | `1 ship`, `2 amend`, `3 abort` |

The coordinator emits a presentation event with a fresh nonce, waits for the live operator reply,
then writes both the matching release field in `00-state.md` and `stage.gate.release`. A number
alone is accepted for a decision; edit and reject require `N: detail`. Ambiguous, stale, or
unknown replies never release a gate. The renderer reads these fields and events but never edits
them.

## 5. Correction and staleness trace

Validation findings are classified and routed as follows:

- in-scope code, test, or documentation defect → implementation executor;
- missing evidence → tester;
- correctable security finding → implementation plus delta audit;
- structural contradiction → operator decision, then optional design re-open and new Gate 1.

Every tree change after Freeze emits a new implementation/validation sequence. No event from an
older tree can be used as current Gate 3 evidence. The trace records the correction cause and the
new tree anchor; it does not rewrite historical events.

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

- **local mode:** `workspaces/{feature}/00-precompact.jsonl`
- **obsidian mode:** `{logs-path}/{logs-subfolder}/{date}_{feature}/00-precompact.jsonl`

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

**What it is:**
- A snapshot of the current state of the initiative (project rows with branch /
  version / PR / status).
- A cross-project narrative (`## Functional Description` and `## Big-Picture Plan`)
  that no single `01-plan.md` owns.

**What it is NOT:**
- Not an execution-events file. No JSONL. No `phase.*` or `operation.*` events.
- Not a replacement for `00-state.md` or `00-execution-events.*`. Those per-project
  files remain the per-project observability record.
- Not subject to the mandatory observability invariant (CLAUDE.md §5 "Pipeline
  observability is mandatory") — that invariant governs `00-execution-events.*`
  only. `overview.md` writes are **best-effort** and a write failure never
  fails the pipeline.

**Location (mode-dependent):**
- Obsidian: `{logs-path}/{logs-subfolder}/{repo_base}/{YYYY-MM-DD}_{initiative}/overview.md`
- Local: `{common-parent-of-sibling-repos}/{YYYY-MM-DD}_{initiative}/overview.md`

Full template and section-ownership map: `agents/ref-dispatch-machinery.md § "overview.md — you are the sole writer"`.

## Initiative-level trace (serial multi-project sequencing)

**No parallel coordinator fan-out exists.** The coordinator fusion retires the multi-task
fan-out with its consolidator and the parallel multi-project dispatch that spawned one
orchestrator instance per project — `agents/ref-pipeline.md § "Dispatch invariants"` #2 forbids
dispatching any coordinator, including another copy of itself, with no exception clause, and
`agents/ref-dispatch-machinery.md § "Multi-project sequencing"` names serial execution as the
derived consequence of that invariant, not an independent policy. One project runs to completion
inside the same agent before the next one starts. The `00-leader-roster.md` file, the `fanout.*`
event family, and the two-tier `leader-recover`/`orchestrator-recover` split below all lose their
subject with that retirement — nothing replaces them.

When `initiative` is set, an **initiative-level** `00-execution-events` file is written in
addition to each project's per-project trace, so `/trace` and `/th:pipelines` can render the
grouping:

**Location:**
- Obsidian: `{logs-path}/{logs-subfolder}/{repo_base}/{YYYY-MM-DD}_{initiative}/00-execution-events.md`
- Local: `{common-parent-of-sibling-repos}/{YYYY-MM-DD}_{initiative}/00-execution-events.jsonl`

**Lifecycle events** (written by the coordinator into the initiative-level file):

| Event | Fields | When emitted |
|-------|--------|--------------|
| `initiative.start` | `initiative`, `eligible_projects[]` | Before the first project's Stage 1 begins |
| `project.start` | `project`, `initiative` | When a project's own pipeline begins |
| `project.end` | `project`, `initiative`, `status` (success/failed/iterating) | When a project's pipeline completes or is blocked |
| `initiative.converge` | `initiative`, `projects[]` (project + status per project) | When every eligible project has run |

Each event carries a `project` key so `/trace` can group events by project.

**Per-project traces are unchanged.** Each project continues writing its own `{project}/00-execution-events.*` file with its per-phase `phase.start` / `phase.end` / `gate.*` events exactly as today. The initiative-level file is additive — it carries only initiative lifecycle events, not per-phase detail.

**`/th:pipelines` and `/trace` rendering.** Both read the coordinator's own `00-state.md § Current State` per project (there is no separate roster to read) plus the initiative-level lifecycle events above, and render the initiative as a parent row with each project as a child row (`Stage` / `Phase` / `Status`). Because execution is serial, at most one project is ever "running" at a time — there is no parallel-region rendering to reconcile.

**Mandatory + additive, not mandatory for single-project runs.** The initiative-level `00-execution-events` file is only written when `initiative` is set. Single-project runs (`initiative: null`) do not produce this file.

## Additional pipeline event types

The following event types appear in `00-execution-events` in addition to the core `phase.*`, `gate.*`, `operation.*`, and `stage.*` families documented above:

| Event | When emitted | Key fields |
|-------|-------------|------------|
| `gate` | When a human-checkpoint gate is reached (DOC-GATE, STAGE-GATE approval prompt) | `gate` (name), `action` (`stop`/`approved`) |
| `research.lane.skipped` | When a research fan-out lane returns no findings (fail-open) | `lane`, `angle`, `reason` |
| `artifact.missing` | When an expected agent output file is absent after dispatch | `expected_file`, `agent`, `action` (`retry`/`escalate`) |
| `stage2.hygiene` | When the Phase 2.6 code-hygiene scan completes (deterministic, orchestrator-run — see `docs/code-hygiene-gate.md § Layer 1`) | `verdict` (`pass`/`fail`), `extra.files` (int, on `fail`), `extra.count` (int, on `fail`) |
| `checkpoint.confirmed` | When `th:orchestrator` obtains — or fails to obtain — the operator's live confirmation of the functional-clarity artifact at Discover Boundary B1, before dispatching `architect` (`docs/reasoning-checkpoint.md § "Attribution and failure direction"`) | `provenance` (`operator-live`/`inferred`), the confirmatory text (named exception to the Free-text field bound, see below) |

Note: `checkpoint.confirmed` is written exclusively by `th:orchestrator`, on the same file it already initializes at Intake (`agents/ref-pipeline.md § "Intake"`). On a later `/th:recover`, the same agent reads and verifies the event but never repairs it.

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
both dispatch at Phase 3 (`3-verify`) but are different agents, so each keeps
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

Canonical source: `agents/ref-pipeline.md § "Transition protocol — atomic, all three steps, never
partial"` (the upsert mechanic) and `§ "Agent Results"` (the schema template — the narrative "Hot
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

This section defines the cost-visibility surface introduced in Phase B of the
pipeline-collaboration-cost-redesign programme. It covers: (a) the price table
key format in `~/.claude/.team-harness.json`; (b) the schema of the `## Cost`
section in `00-pipeline-summary.md`; and (c) the derivation rule shared by the
orchestrator summary writer and the `/th:trace --cost` skill.

### Price table — `pricing` key in `~/.claude/.team-harness.json`

The price table lives in a namespaced `pricing` key within the single-config-file
`~/.claude/.team-harness.json`. The orchestrator and the `/th:trace --cost` skill
read it at render time; they never write to it. Maintenance is the operator's
responsibility — Anthropic changes prices without notice.

**Format:**

```json
{
  "pricing": {
    "opus":   { "input": 15.0, "output": 75.0 },
    "sonnet": { "input":  3.0, "output": 15.0 },
    "updated": "2026-06-02"
  }
}
```

Field definitions:

| Field | Type | Notes |
|-------|------|-------|
| `pricing.opus.input` | float | USD per 1 M input tokens for any `claude-opus-*` model |
| `pricing.opus.output` | float | USD per 1 M output tokens for any `claude-opus-*` model |
| `pricing.sonnet.input` | float | USD per 1 M input tokens for any `claude-sonnet-*` model |
| `pricing.sonnet.output` | float | USD per 1 M output tokens for any `claude-sonnet-*` model |
| `pricing.updated` | string | ISO date of the last price check — operator-maintained |

**Degradation rule.** When the `pricing` key is absent, malformed, or any required
sub-field is missing, every surface that computes cost MUST fall back to displaying
tokens only, with the line:

```
price table not configured — showing tokens only
```

Never invent a price, never fail, never crash.

**Model classification.** Phases whose primary agent runs on `claude-opus-*` use the
`opus` prices; phases on `claude-sonnet-*` (or any other model) use the `sonnet`
prices. When `tokens_in` / `tokens_out` are both present in the `phase.end` event,
compute cost as `(tokens_in × input_rate + tokens_out × output_rate) / 1_000_000`.
When only the total `tokens` is present, use `tokens × (input_rate + output_rate) / 2`
as a conservative blended estimate and mark the result with `(~)`.

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
**Total tokens:** {N} ({measured|estimated} — {M} phases with tokens_estimated:true)
**Total cost:** ~${X.XX}  (or: price table not configured — showing tokens only)
**Architect runs:** {N}x ({N} phases with agent: architect — signal for multi-run cost)

| Agent | Phases | Tokens | % |
|-------|--------|--------|---|
| architect | {list} | {N} | {P}% |
| implementer | {list} | {N} | {P}% |
| ... | ... | ... | ... |
| **Total** | | **{N}** | 100% |

| Phase | Agent | Tokens | Cost |
|-------|-------|--------|------|
| 1-design | architect | {N} | ~${X.XX} |
| 2-implement | implementer | {N} | ~${X.XX} |
| ... | ... | ... | ... |
```

**Rendering rules:**

- `## Cost` is placed after `## Tool Effectiveness` and before `## Iterations` in
  the schema order.
- `tokens_estimated: true` on a `phase.end` event marks that phase's row with `(~)`.
  The section header reports the total count of estimated phases so the reader can
  assess reliability.
- When the price table is not configured, omit the `Cost` column from both tables
  and replace `~${X.XX}` with `—`.
- The "Architect runs" line is a cost-awareness signal: a feature where the architect
  ran 3 times spent 3× architect-tier tokens in Stage 1. It is not a quality judgment.
- In obsidian mode, extract the JSONL fence from `00-execution-events.md` before
  summing tokens (same `sed -n '/^```jsonl$/,/^```$/{/^```/d;p}'` pattern used by
  `/th:trace --tools`).

### Derivation rule

1. Read all `phase.end` events from `{docs_root}/{events_file}`.
2. For each event, extract `agent`, `phase`, `tokens`, and `tokens_estimated`.
3. Classify the agent's model tier using the following priority order:
   - **Primary path — `event.model` field.** When the `phase.end` event itself carries a
     `model` field (propagated verbatim from the agent's status block — see
     `agents/ref-pipeline.md` § "Populating the `model`/`effort` fields on `phase.end`"),
     classify directly from it: `opus` when `model` starts with `claude-opus` or equals
     `opus`; `sonnet` otherwise. This is the authoritative source once populated — it
     reflects what the agent actually ran under, including under a session model override
     (`agents/ref-pipeline.md` § "Session model override"), which frontmatter cannot express.
   - **Fallback path — read frontmatter `model:` field.** When `event.model` is absent (the
     event predates this field, or the agent instance had not yet adopted it), locate
     `agents/{agent}.md` and read its YAML frontmatter `model:` field. Classify as `opus`
     when `model` starts with `claude-opus` or equals `opus`; classify as `sonnet` otherwise.
   - **Static opus-agent fallback** (used only when BOTH `event.model` is absent AND
     frontmatter is unreadable — file absent, not parseable, or `model:` key missing): treat
     these agents as `opus` regardless of any other assumption:
     `architect`, `security`, `adversary`, `qa-plan`, `ux-reviewer`, `reviewer`,
     `reviewer-consolidator`, `agent-builder`, `mentor`, `gcp-infra`, `gcp-cost-analyzer`,
     `orchestrator`. This is the canonical static list — `skills/trace/SKILL.md` reads the
     same enumeration and MUST NOT diverge from it.
   - **No "all others → sonnet" default.** When none of the three paths above resolve a
     classification, classify as `sonnet` and mark the row with `(?)` to signal that the
     classification is uncertain.
4. Compute cost per phase using the price table (see above). Sum to get total.
5. Build the per-agent and per-phase tables.
6. Count phases where `tokens_estimated == true` for the header annotation.
7. If the price table is absent or malformed, skip the cost columns and emit the
   degradation line instead.

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

**Exempt from this rule:** normative schema/config definitions (the `pricing.*`
field table above, the `## Cost` section schema and its `{N}`/`~${X.XX}`
template placeholders), and formula constants that are inherently estimates by
definition (the `duration_min × 1500` / `× 800` fallback multiplier, already
carrying `tokens_estimated: true`). These are structural literals, not claims
about what a run costs, and tagging them would not add information.

---

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

Both are written exclusively by the orchestrator. Agents return tool-usage counts in their status blocks; the orchestrator propagates them into the `tools` field of `phase.end` events and aggregates them into `00-pipeline-summary.md` (human-readable rollup, rewritten in full at every phase transition).

### tokens field on phase.end

Every `phase.end` event MUST include a `tokens` field (integer). When `Agent()`/`Task()` metadata is absent, estimate via `duration_min × 1500` (opus) / `× 800` (sonnet) and mark `tokens_estimated: true`. **Zero is forbidden** — a zero token count is indistinguishable from a missing field and breaks the cost rollup.

### model / effort fields on phase.end

Every leaf agent's status block declares its effective model on a `model:` line (mandatory) and, when known, its effective effort level on an `effort:` line (optional) — see `agents/_shared/output-template.md` § "Status block — common fields". The orchestrator propagates both verbatim onto the corresponding `phase.end` event's `model` / `effort` fields, using the same propagation mechanism already used for `tools` (see `agents/ref-pipeline.md` § "Populating the `model`/`effort` fields on `phase.end`"). Both fields are optional at the schema level — legacy events and events from agents that have not yet reported the fields simply omit them, and classification falls through to frontmatter/static-list inference (see § Derivation rule below).

This is the field that makes a session model override (`agents/ref-pipeline.md` § "Session model override") observable in the trace: the frontmatter `model:` in `agents/{agent}.md` is only the agent's *default*; `event.model` on a given `phase.end` is what that specific dispatch actually ran under.

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
- Legacy no-workspace/Tier-0 traces may lack a decision ledger; current `pipeline` runs always emit
  the coordinator-owned ledger, while `inline` direct work has no pipeline ledger by definition.

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
