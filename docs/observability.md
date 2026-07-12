# Observability — Event Schemas and Planes

> This document defines the TH observability surfaces: the **local** per-workspace pipeline
> trace (`00-execution-events.{jsonl|md}`) and the **cross-user** flow-event plane (opt-in
> telemetry via `context-harness-mcp`). The two planes are independent and serve different
> purposes. The local plane is always active; the cross-user plane is opt-in and never
> affects pipeline outcomes.

## Two observability planes — local vs. cross-user

Team Harness maintains two distinct observability planes. Operators and tools (e.g.,
`/th:trace`) read only from the **local plane**. The **cross-user plane** is a separate,
opt-in channel for aggregate fleet-level friction signals. The two planes MUST NOT be
conflated — they answer different questions with different audiences.

| Dimension | Local plane (`00-execution-events`) | Cross-user plane (flow events) |
|-----------|-------------------------------------|-------------------------------|
| Purpose | Per-workspace pipeline trace for the individual operator | Cross-fleet friction signal for TH maintainers |
| File | `00-execution-events.jsonl` (local mode) / `00-execution-events.md` (obsidian mode) | No file — relayed to Axiom via `context-harness-mcp` |
| Audience | Operator + `/th:trace` skill | TH maintainers via Axiom dashboard |
| Default | ALWAYS active — every pipeline writes this | OFF by default (`flow_telemetry.enabled: false`). Opt-in via `/th:setup flow-telemetry` |
| Blocking? | Mandatory — missing events are a contract violation | Non-blocking — emission failure is logged and the pipeline continues |
| Schema scope | Rich pipeline detail (phase timing, tokens, gate verdicts, iteration counts, tool usage) | Metadata-only bounded fields (8-value event enum, ints, version, timestamp, bare project tag — NO diff, NO code, NO paths) |
| Contains PII / content? | Operator-local only; never sent cross-user | Filtered by CH `internal/validate.Run` + metadata-only by construction |

### Cross-user flow-event plane (opt-in)

When `flow_telemetry.enabled: true` in `~/.claude/.team-harness.json` (default: `false`),
the orquestador emits pipeline friction events to `context-harness-mcp` via the
`mcp__memory__record_flow_event` MCP tool. Emission is best-effort:

- Any error (CH unreachable, tool absent, timeout, validation rejection) → log
  `flow-telemetry: unavailable` as an `operation.failed` event in `{events_file}` and
  continue. The pipeline outcome is NEVER changed by a telemetry failure.
- Payloads are metadata-only: bounded enums, integers, booleans, a semver string, and a
  timestamp. No diff, no code, no file paths with user identifiers, no AC text.
- The CH Content Filter (`internal/validate.Run`) is the ingest-side enforcement floor;
  TH emission is the construction-side floor. Neither side trusts the other alone.

Full emission contract, the 8-event catalog, and the trigger map: see
`agents/orquestador.md § "Flow Telemetry Emission"`.

---

## What operation.* is

`operation.*` is an **optional, additive** event family that agents and skills
emit for discrete internal operations (config-load, MCP connectivity probe,
initialization, tool call). It is nested inside the existing
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

## Placement in 00-execution-events

`operation.*` events are written as additional JSONL lines within the existing
`00-execution-events.jsonl` (local mode) or inside the `jsonl` fence in
`00-execution-events.md` (Obsidian mode). They are optional additions to a
valid pipeline trace — a pipeline that emits no `operation.*` events is still
valid.

Example (local mode `.jsonl`):

```jsonl
{"event":"phase.start","phase":"2","timestamp":"2026-05-28T14:00:00Z"}
{"event":"operation.started","operation":"config-load","status":"started","timestamp":"2026-05-28T14:00:01Z","phase":"2"}
{"event":"operation.success","operation":"config-load","status":"success","detail":"loaded ~/.claude/.team-harness.json","timestamp":"2026-05-28T14:00:01Z","phase":"2"}
{"event":"operation.started","operation":"mcp-verify","status":"started","timestamp":"2026-05-28T14:00:02Z","phase":"2"}
{"event":"operation.failed","operation":"mcp-verify","status":"failed","error":"connection refused on port 3000","suggestion":"check Memory MCP URL in ~/.claude/.team-harness.json","timestamp":"2026-05-28T14:00:03Z","phase":"2"}
```

## Who writes operation.* events

The orquestador is the exclusive writer of `00-execution-events.*` during
pipeline runs. In that context, agents return operation metadata in their status
blocks; the orquestador propagates it.

## Hook-authored observability files (complement to the orquestador stream)

Two hook-level observability files exist **alongside** (never inside) the
orquestador-owned `00-execution-events.*` stream. Both preserve the
exclusive-writer contract by writing to their own dedicated sibling files.

### 00-subagent-trace.jsonl — SubagentStop backstop (coarse)

Written by `hooks/ts/dist/subagent-trace.cjs` (SubagentStop event, matcher `th:.*`).
Appended to **only** when a Team Harness pipeline subagent (`th:architect`,
`th:implementer`, etc.) finishes. The file sits beside the orquestador's trace
files in the resolved workspace:

- **local mode:** `workspaces/00-subagent-trace.jsonl`
- **obsidian mode:** `{logs-path}/{logs-subfolder}/00-subagent-trace.jsonl`

Line schema:
```json
{"ts":"<ISO>","event":"subagent.stop","agent_type":"th:<agent>","agent_id":"<opaque>","cwd":"<repo-root>"}
```

**What this is NOT.** This is a coarse backstop — a deterministic proof that a
subagent boundary occurred. It does NOT carry tokens, duration, result, or
per-phase context. The orquestador's `phase.end` events in `00-execution-events`
remain the authoritative rich observability record. The SubagentStop payload
simply does not carry that data.

**`project` key — stop-side residual (permanent, not a TODO).** Unlike the
start-side breadcrumb below, `subagent.stop` lines never carry a `project`
key. The SubagentStop payload exposes `agent_type`/`agent_id`/`stop_reason`
only — there is no prompt to read a `TH-LANE: {project-key}` marker from at
stop time. Readers that need the authoritative per-agent project/timing
record for a lane-scoped run should use the orquestador's `phase.end` event
(which does carry `project`), not this breadcrumb. See "subagent.start" below
for how pairing is redefined when `project` is present on the start side.

**Non-suppressible breadcrumb.** The existence breadcrumb (the `subagent.stop`
write) runs unconditionally — `TH_HOOK_PROFILE=minimal` does NOT suppress it.
Only the scope guard (non-`th:` agent → silent exit) and the base-path check
(no resolvable workspace directory → silent exit) cause a run without a write.
This makes the breadcrumb a deterministic observability floor: any `TH_HOOK_PROFILE`
value can suppress notifications and richer observability, but it cannot erase
proof that a `th:*` boundary occurred.

**Reconciliation source (kept unconditionally, repurposed).** `00-subagent-trace.jsonl`
is retained unconditionally and read by the orquestador's stage-gate reconciliation
backstop (`agents/orquestador.md § Stage-gate reconciliation backstop`) as the
backfill source for a `phase.end` gap: the paired `subagent.start`/`subagent.stop`
lines for the missing phase's `agent_type`, matched by the pipeline's time window,
supply the `duration_ms` for the backfilled event. This is its primary value —
prompt-level `phase.end` emission proved unreliable in measurement (usable in only
31/78 sampled workspaces), while this hook-authored breadcrumb is non-suppressible
by design and costs zero agent tokens. Consolidating it away or making it opt-in
would remove the only deterministic proof layer the backfill depends on; neither is
proposed here or anywhere in this document.

**Second consumer — per-run parity line cross-check (upward-only enrichment, never
denominator ground truth).** The per-run parity line
(`docs/verification-packet.md § 8`) also reads `00-subagent-trace.jsonl`, but in a
narrower role than the reconciliation backstop above: the parity line's dispatch
denominator is grounded in the workspace verdict docs (`03-testing.md` run-only
section, `reviews/04-validation.md`, `reviews/04-security.md`, `reviews/04-adversary.md`,
`reviews/04-ux-validation.md`), and breadcrumbs are consulted only to ADD a
breadcrumb-evidenced dispatch that has no matching verdict entry, classified
telemetry-missing. A dispatch's breadcrumb pair being absent never removes it from,
or shrinks, the denominator — the two consumers never share a subtraction path.

### subagent.start — PreToolUse breadcrumb (start-side twin)

Written by `hooks/ts/dist/subagent-start.cjs` (PreToolUse event, matcher
`Task`). This is the first hook authored under Decision A (CLAUDE.md §6.3)
with no Bash body — TypeScript is the single source, not a port. It fires
BEFORE a Team Harness pipeline subagent (`subagent_type` starting with
`th:`) is dispatched and appends one line to the SAME `00-subagent-trace.jsonl`
sink as the `subagent.stop` breadcrumb above, so start/stop pairs are
derivable from a single file.

Line schema:
```json
{"ts":"<ISO>","event":"subagent.start","agent_type":"th:<agent>","project":"<optional — bounded [a-z0-9-]{1,60}>"}
```

`agent_id` is intentionally absent — at PreToolUse time the runtime has not
yet assigned one (it only becomes observable on the corresponding
`SubagentStop` payload). Readers pair a `subagent.start` line with the next
`subagent.stop` line carrying the same `agent_type` in file order.

**`project` key (lane-scoped dispatch, bounded).** When the dispatching
agent's prompt carries a `TH-LANE: {project-key}` line, this hook stamps a
`project` field on the `subagent.start` record with that key. The value is
charset/length-bounded (`[a-z0-9-]{1,60}`) before it ever reaches the JSONL
sink — a marker present but out of that shape is treated as absent (`project`
omitted), never written unbounded. When the marker is absent altogether,
`project` is omitted and pairing falls back to the plain `agent_type`
file-order rule above (backward-compat — byte-identical to pre-lane behavior).

**Pairing redefinition within `project` (AC-5.2).** When one or more
`subagent.start` lines in the trace carry a `project` key, same-agent-type
pairing is scoped WITHIN that key: a `subagent.stop` line is matched to the
oldest pending `subagent.start` line sharing the same `agent_type` **and**
the same `project`, not merely the same `agent_type` file-order-wide. This
matters once two or more orquestador lanes dispatch the same specialist
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
per-lane timing record remains the orquestador's `phase.end` event, which
does carry `project` end-to-end — this breadcrumb pairing rule is a
best-effort backstop, not a replacement.

**Complements, never replaces, `phase.end`.** Same relationship as the stop
breadcrumb: this file proves a `th:*` boundary occurred and, paired with the
stop line, how long it has been in flight — it carries no tokens, no
per-phase detail, no result. The orquestador's `phase.end` events remain the
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

When the `initiative` field in `00-state.md` is set, the líder also
maintains a parent-level `overview.md` at the initiative root. This file is
**not an events file** and does not contain pipeline observability data. It is
a living index — one row per project, updated by the líder at intake and
by the delivery agent at Step 11.7.

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

Full template and section-ownership map: `agents/lider.md § overview.md Template`.

## Initiative-level fan-out trace (parallel multi-project dispatch)

When the líder fans out 2+ projects concurrently (see `agents/lider.md § Parallel Multi-Project Dispatch`), an **initiative-level** `00-execution-events` file is written in addition to each project's per-project trace. This file is separate from `overview.md` (which is NOT an events file) and from the per-project `00-execution-events.*` (which remain per-project, unchanged).

**Location:**
- Obsidian: `{logs-path}/{logs-subfolder}/{repo_base}/{YYYY-MM-DD}_{initiative}/00-execution-events.md`
- Local: `{common-parent-of-sibling-repos}/{YYYY-MM-DD}_{initiative}/00-execution-events.jsonl`

**Fan-out lifecycle events** (written by the líder into the initiative-level file):

| Event | Fields | When emitted |
|-------|--------|--------------|
| `fanout.start` | `initiative`, `eligible_projects[]`, `cap` | Before the first concurrent Task dispatch |
| `fanout.lane.start` | `project`, `initiative` | When a lane's Stage-2 Task call is dispatched |
| `fanout.lane.end` | `project`, `initiative`, `status` (success/failed/iterating) | When a lane's Stage-2 work completes or is blocked |
| `fanout.converge` | `initiative`, `lanes[]` (project + status per lane) | When all lanes have reached the re-convergence barrier |

Each event carries a `project` key so `/trace` can group events by lane and render the parallel region side-by-side.

**Per-project traces are unchanged.** Each project continues writing its own `{project}/00-execution-events.*` file with its per-phase `phase.start` / `phase.end` / `gate.*` events exactly as today. The initiative-level file is additive — it carries only fan-out lifecycle events, not per-phase detail.

**`/th:pipelines` rendering:** when a `00-lider-roster.md` is present, `/th:pipelines` renders the líder→orquestador tree grouped by project — the initiative as a parent row, each orquestador as a child lane row with `Stage` / `Phase` / `Status`, the advisory `pending_gate` (from the roster), and a per-lane cost (summed from that lane's own `phase.end` tokens). When a live fan-out is also present, the `fanout.*` events overlay running/closed liveness onto the tree. This reuses the Stage/Phase surfacing exception already documented for `/th:pipelines`.

**`/trace` rendering:** `/trace` reads the initiative-level fan-out events to render the parallel region (lanes side-by-side with start/end timestamps), shows each lane's advisory `pending_gate` from the roster when present, and can drill into any lane's per-project trace. The `--cost` rollup sums token counts across all lanes for an initiative-level cost figure (reader-only — see "Reader-only initiative rollup" below).

**Mandatory + additive, not mandatory for single-project runs.** The initiative-level `00-execution-events` file is only written when a fan-out is actually dispatched. Single-project runs (`initiative: null`) and serial multi-project runs do not produce this file. The file is mandatory for any run where `fanout.start` fires — a fan-out that emits no initiative-level trace violates the observability contract.

**Implementation status.** Both renderers documented above are implemented: `skills/pipelines/SKILL.md § Líder → orquestador tree (roster-sourced, grouped by project)` and `skills/trace/SKILL.md § Parallel region rendering (fan-out)`.

### 00-lider-roster.md — the líder's index (líder→orquestador tree source)

`00-lider-roster.md` is the líder's durable tracking file — the authoritative enumeration of every `th:orquestador` the líder has spawned. It is **not an events file** (no JSONL, no `phase.*`/`operation.*`/`fanout.*` events) and it is distinct from `overview.md` (which carries the cross-project narrative, not the per-orquestador tracking rows). The **líder is the sole writer**; every observability reader (`/th:pipelines`, `/trace`, `/th:recover`) treats it as read-only.

**Location (mode-independent path shape):** `{initiative-root}/00-lider-roster.md` when `initiative` is set (N > 1 projects); `{feature-root}/00-lider-roster.md` for a single-task run (N = 1). Full contract: `agents/lider.md § 00-lider-roster.md`.

**Columns:** `Task/Project`, `State ref (docs_root)`, `Agent` (always `th:orquestador`), `Phase`, `Status`, `pending_gate`. `Phase`/`Status` are the coarse fields the líder reads from each orquestador's `00-state.md § Current State` (never a gate-release field). This is what makes the roster the líder→orquestador **tree source**: it names each orquestador, points at its `docs_root` (the `State ref`), and carries its coarse position.

**`pending_gate` is ADVISORY.** The `pending_gate` column is a líder-maintained hint of which STAGE-GATE a lane is paused at, used only to drive the líder's gate-presentation/routing behaviour. It is **never a gate-clear signal** and nothing downstream treats a roster row as authoritative for gate status — the líder that writes it never reads or writes any orquestador's `gate1_release`/`gate2_release_last`/`gate3_release` field or any `stage.gate.release` event; it presents each gate to the operator inline and relays the decision back, but never records a gate-release. Renderers surface `pending_gate` verbatim and must never infer a gate-clear from it.

### Reader-only initiative rollup

The initiative view that `/th:pipelines` and `/trace --cost` present — and that the líder itself builds to summarize an initiative — is a **reader-only aggregation**. It joins, by the roster's `State ref`, each orquestador's OWN `00-execution-events.{jsonl|md}` (`phase.end` `tokens`/`status`) and coarse `00-state.md § Current State` fields into one per-initiative cost + status view.

**The líder is aggregator/reader, never writer of any orquestador's stream.** Building this rollup, the líder never writes to any orquestador's `00-execution-events.*` or `00-state.md` — those files stay exclusively the owning orquestador's. The rollup **never touches the gate seam**: it reads coarse phase/status and `phase.end` token counts only, never a gate-release field or a `stage.gate.release` event. Its inputs are each orquestador's own per-lane trace plus the roster; its output is a read, added additively to the tree render. The initiative-level `fanout.*` file (which the líder DOES write — see above) is the one initiative-scoped stream the líder authors, and it carries fan-out lifecycle events only, never per-phase detail lifted out of a lane's trace.

### lider-recover vs orquestador-recover (two-tier recovery)

Recovery is split along the same present-and-relay vs. prepare-and-record seam. `/th:recover` reads state and routes; it presents no gate and records no release itself.

| | **lider-recover** | **orquestador-recover** |
|---|---|---|
| Owner | `th:lider` (top-level) | the pipeline's own `th:orquestador` |
| Rebuilds from | `00-lider-roster.md` + each orquestador's coarse `phase`/`status`/`next_action` (+ `overview.md` if an initiative) | that orquestador's OWN `00-state.md § Current State` dual-record + its `{events_file}` |
| Answers | "which orquestadores exist and roughly where are they" | "is this STAGE-GATE cleared, and what runs next" |
| Gate behaviour | **presenter/relayer, never recorder** — never reads or writes a gate-release field; re-presents inline any `gate_pending` an orquestador returns on resume and relays the operator's decision back | **preparer/recorder** — re-reads its own dual-record (structural: `stage.gate.release` event present AND per-gate release field in the clear-allowlist) and returns a `gate_pending` to `th:lider` for any un-cleared STAGE-GATE, per its Recover safety contract |
| Contract | `agents/lider.md § lider-recover` | `agents/orquestador.md § orquestador-recover` |

`/th:recover` itself is read-only: it runs the structural gate-cleared check only to surface which gate is un-cleared and route to the right orquestador — it never records a release. The líder rebuilds coarse tracking (never reading or writing any gate-release record) and re-spawns the relevant orquestador; that orquestador, on boot, re-reads its own dual-record and returns a `gate_pending` for any un-cleared STAGE-GATE, which the líder re-presents to the operator inline. This is why an un-cleared gate can never be silently bypassed on recovery: cleared-status derives ONLY from the structural dual-record check the owning orquestador runs — never from prose and never from the advisory roster — so the líder's coarse tracking can never mark a gate cleared, and the re-presentation flows líder-mediated from the orquestador's `gate_pending`.

## Additional pipeline event types

The following event types appear in `00-execution-events` in addition to the core `phase.*`, `gate.*`, `operation.*`, and `stage.*` families documented above:

| Event | When emitted | Key fields |
|-------|-------------|------------|
| `gate` | When a human-checkpoint gate is reached (DOC-GATE, STAGE-GATE approval prompt) | `gate` (name), `action` (`stop`/`approved`) |
| `research.lane.skipped` | When a research fan-out lane returns no findings (fail-open) | `lane`, `angle`, `reason` |
| `artifact.missing` | When an expected agent output file is absent after dispatch | `expected_file`, `agent`, `action` (`retry`/`escalate`) |

Note: `gate` (human checkpoint) is distinct from `gate.pass` / `gate.fail` (automated agent-to-agent gates). The latter fire when the orquestador evaluates a plan-review or acceptance-gate result without pausing for human input; the former fires when execution is suspended pending operator approval.

## kg_write event

`kg_write` is a **sibling event** (peer of `phase.*` / `gate.*` / `operation.*`) emitted by the orquestador after each Knowledge Graph write batch. Unlike `operation.*`, which models a single discrete operation, a KG write site may attempt multiple writes in one batch; `kg_write` carries per-batch counters (`attempted`, `succeeded`) and a per-write `writes[]` array so `/th:trace` can aggregate across all three write sites.

**Shape:**

```json
{
  "ts":        "<ISO-8601 with timezone>",
  "event":     "kg_write",
  "feature":   "<kebab-case, matches workspaces folder>",
  "phase":     "6-knowledge-save | 3-verify | 4-delivery",
  "site":      "phase6-knowledge-save | security-finding | delivery-passive-capture",
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
| `site` | always | Discriminator for the write site. Closed vocabulary: `phase6-knowledge-save`, `security-finding`, `delivery-passive-capture` |
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

**Why a sibling event, not `operation.end`:** `operation.*` models one discrete operation with three states (`started` / `success` / `failed`) and no counters. A Phase 6 batch may write up to 5 nodes, with some `ok` and others `skipped:policy-filtered` in the same run. Forcing that into `operation.end` would require either one event per node (multiplies noise) or adding counters to `operation.*` (breaks its single-operation schema for every non-KG use). A sibling event `kg_write` with `attempted` / `succeeded` / `writes[]` expresses the batch in one line without contaminating `operation.*`. This does NOT violate the "no parallel KG-namespaced events" rule in the orquestador — that rule prohibits a **family** with state suffixes (`kg.started` / `kg.success` / `kg.failed`); `kg_write` is a **single event type** with no suffixes. See the orquestador's "Emitting kg_write events" subsection for the full rationale and the explicit exception.

## Cost rollup

This section defines the cost-visibility surface introduced in Phase B of the
pipeline-collaboration-cost-redesign programme. It covers: (a) the price table
key format in `~/.claude/.team-harness.json`; (b) the schema of the `## Cost`
section in `00-pipeline-summary.md`; and (c) the derivation rule shared by the
orquestador summary writer and the `/th:trace --cost` skill.

### Price table — `pricing` key in `~/.claude/.team-harness.json`

The price table lives in a namespaced `pricing` key within the single-config-file
`~/.claude/.team-harness.json`. The orquestador and the `/th:trace --cost` skill
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

The orquestador appends a `## Cost` section to the pipeline summary at each of
the 4 mandatory checkpoints (STAGE-GATE-1 emission, Stage-2 close, every
`iteration.start`, `pipeline.complete`/`end` — see `agents/orquestador.md`
§ Pipeline Summary Protocol → "When to rewrite"); rewriting at every other
phase transition is best-effort. The section derives entirely from the
`phase.end` events in `00-execution-events.{md,jsonl}` — it is a render of the
trace, not an independent source. The Final Pipeline Sanity Check fails closed
on a missing `## Cost` section (`agents/orquestador.md` § Final Pipeline
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
     `agents/orquestador.md` § "Populating the `model`/`effort` fields on `phase.end`"),
     classify directly from it: `opus` when `model` starts with `claude-opus` or equals
     `opus`; `sonnet` otherwise. This is the authoritative source once populated — it
     reflects what the agent actually ran under, including under a session model override
     (`agents/orquestador.md` § "Session model override"), which frontmatter cannot express.
   - **Fallback path — read frontmatter `model:` field.** When `event.model` is absent (the
     event predates this field, or the agent instance had not yet adopted it), locate
     `agents/{agent}.md` and read its YAML frontmatter `model:` field. Classify as `opus`
     when `model` starts with `claude-opus` or equals `opus`; classify as `sonnet` otherwise.
   - **Static opus-agent fallback** (used only when BOTH `event.model` is absent AND
     frontmatter is unreadable — file absent, not parseable, or `model:` key missing): treat
     these agents as `opus` regardless of any other assumption:
     `architect`, `security`, `adversary`, `qa-plan`, `ux-reviewer`, `reviewer`,
     `reviewer-consolidator`, `agent-builder`, `mentor`, `gcp-infra`, `gcp-cost-analyzer`,
     `lider`, `orquestador`. This is the canonical static list — `skills/trace/SKILL.md` reads the
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
2026 measurement caught it (see `agents/orquestador.md § Phase 1.5`). Tag
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

The `operation.*` schema is the log target for the silent-on-success rule:

- **On success**: emit `operation.success` to the events file. No operator-facing output.
- **On failure**: emit `operation.failed` to the events file AND surface one line to the operator: `{error} — {suggestion}`.

Full behavioral contract: see `agents/_shared/output-template.md` § "Output Discipline".

---

## Working-agreement rationale (CLAUDE.md §5 long-form)

This section contains the extended rationale for the pipeline observability working-agreement declared in CLAUDE.md §5. It was relocated from CLAUDE.md to keep the main file under its size cap (pure relocation — zero behavior change).

### Why observability is mandatory, not best-effort

Skipping event appends to save tokens deletes the only signal available to diagnose pipeline health. The working-agreement is strict: **Writing observability events is mandatory.** Every pipeline run produces two artifacts in `workspaces/{feature}/`:

- `00-execution-events.jsonl` (local mode) — append-only event trace, machine-readable, queryable with `jq`
- `00-execution-events.md` (obsidian mode) — same trace wrapped in YAML frontmatter + `# Execution Events` heading + ` ```jsonl ` code fence

Both are written exclusively by the orquestador. Agents return tool-usage counts in their status blocks; the orquestador propagates them into the `tools` field of `phase.end` events and aggregates them into `00-pipeline-summary.md` (human-readable rollup, rewritten in full at every phase transition).

### tokens field on phase.end

Every `phase.end` event MUST include a `tokens` field (integer). When `Agent()`/`Task()` metadata is absent, estimate via `duration_min × 1500` (opus) / `× 800` (sonnet) and mark `tokens_estimated: true`. **Zero is forbidden** — a zero token count is indistinguishable from a missing field and breaks the cost rollup.

### model / effort fields on phase.end

Every leaf agent's status block declares its effective model on a `model:` line (mandatory) and, when known, its effective effort level on an `effort:` line (optional) — see `agents/_shared/output-template.md` § "Status block — common fields". The orquestador propagates both verbatim onto the corresponding `phase.end` event's `model` / `effort` fields, using the same propagation mechanism already used for `tools` (see `agents/orquestador.md` § "Populating the `model`/`effort` fields on `phase.end`"). Both fields are optional at the schema level — legacy events and events from agents that have not yet reported the fields simply omit them, and classification falls through to frontmatter/static-list inference (see § Derivation rule below).

This is the field that makes a session model override (`agents/orquestador.md` § "Session model override") observable in the trace: the frontmatter `model:` in `agents/{agent}.md` is only the agent's *default*; `event.model` on a given `phase.end` is what that specific dispatch actually ran under.

**Session model override — distinct from the config-override whitelist.** The session model override (an operator utterance such as "use the bigger model for analysis this session") is recorded exclusively in `00-state.md § Current State` and applies only to analysis-tier dispatches (`architect`, the plan-review panel, consolidators) for the current session — it is never written to `~/.claude/.team-harness.json`. This is a **separate mechanism** from the session-scoped config override whitelist (CLAUDE.md §5), which governs `logs-mode`, `logs-path`, `logs-subfolder`, and `clickup.workspace_id`, and which continues to explicitly EXCLUDE `model`. The two must not be conflated: the config whitelist is about persisted-vs-session config keys reachable from `/th:setup`; the session model override is a dispatch-time-only instruction that never touches config and is discarded at session end. Full mechanism: `agents/orquestador.md` § "Session model override".

### kg_write write-integrity rollup

Every KG write emits a reason-coded `kg_write` event carrying `attempted`/`succeeded` counters and the closed vocabulary `ok | skipped:mcp-down | skipped:malformed-call | skipped:policy-filtered`. The `/th:trace` skill aggregates these into a write-integrity rollup so a silently-skipped KG write is never invisible.

### /trace as the canonical 30-second answer

The `/trace <feature>` skill is the canonical 30-second answer to "did this pipeline work and were the tools effective?". It detects both `.jsonl` (local) and `.md` (obsidian) formats automatically. The legacy `pipeline-metrics.json` / `done.yml` artifacts are deprecated in favor of the trace.

### Tier 0 carve-out

**Exception:** Tier 0 fixes (single-file ≤5-line trivial/docs, `workspaces: NONE` by design) are explicitly exempt from this observability invariant — they produce no workspace in which to write the events file. This is the only exception; all other pipeline types including Tier 1-4 bug fixes, features, refactors, and documentation flows are subject to the mandatory observability contract.

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
| `ts` | always | ISO-8601 with timezone — injected by the orquestador at write time (`date -Iseconds`). |
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
- The orquestador is the **exclusive writer**; append-only `>>` with a here-doc; never rewritten.
- **best-effort resilience:** if constructing or appending a ledger line fails, log the failure and continue — the pipeline NEVER hard-fails on a ledger emit error. The deterministic gate outcome and the `00-execution-events` trace remain the authoritative record.
- **Tier 0 carve-out:** Tier-0 fixes (`workspaces: NONE`) produce no decision-ledger (same exemption as `00-execution-events`).

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
