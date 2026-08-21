# Native Codex usage observability

This is the sole write contract for measured Codex usage in a pipeline. It
bridges the native rollout collector to `00-execution-events`, `00-state.md`,
`00-pipeline-summary.md`, and `$team-harness:trace`; none of those artifacts
may invent a token value or a cost.

## Privacy and authority boundary

The rollout files are the measurement authority. The state snapshot is the
workflow authority, and the event trace is the durable measurement ledger.
The coordinator alone writes both state and events.

Obtain the root thread identifier from the active native Codex runtime only for
the duration of a measurement. Keep `rootThreadId` and `rolloutsRoot` in memory
or an ephemeral environment variable; never write either one to state, events,
the summary, trace output, a checkpoint, a command transcript, or a failure
report. Never persist raw rollout content, real session/thread identifiers,
paths, prompts, messages, commands, diffs, secrets, or the collector's
`sessions` array. A collector result is an in-memory transport, not an
artifact.

Only these allowlisted objects may cross the boundary:

- `checkpointFromUsage(await collectCodexUsage({ rolloutsRoot, rootThreadId }))`
  for a start or end checkpoint; and
- `compareCheckpoints(start, end)` for a phase delta.

Their `schema_version`, `kind`, `usage_status`, `reason_code`, and
`components` fields are copied exactly. `components`, when available, has only
`input_tokens`, `cached_input_tokens`, `uncached_input_tokens`,
`cache_write_input_tokens`, `output_tokens`, `reasoning_output_tokens`, and
`total_tokens`. No session aliases are needed in durable pipeline artifacts.

`usage_status: unavailable` is a valid measured result. Its `reason_code` must
be one emitted by the collector; it is a closed, non-sensitive code, never an
exception message, path, identifier, or free-text diagnostic. An available
result has `reason_code: null`; an unavailable result has `components: null`.

## Declared agent lifecycle

`agent.*` records are coordinator declarations around a deliberate specialist
dispatch. They are **not native Codex lifecycle telemetry**: the current native
runtime and rollout collector do not expose a trustworthy, privacy-safe
per-attempt identity or usage report. The coordinator appends a declaration
only for a dispatch, continuation, terminal return, or correction that it
itself observes; it never reconstructs one from rollout files, callbacks,
transcripts, prompts, tool output, or a native identifier.

`observation` is the durable payload. `agent_role` and `task` may be added as
diagnostic labels when Main knows them, but they are not a closed global enum.
Only OpenSpec Gate-1 evidence interprets the exact pair
`agent_role: architect`, `task: design`; other labels never affect a gate.

| Event | Required lifecycle fields | Coordinator rule |
|---|---|---|
| `agent.spawn` | `observation` | Record that bounded work started. |
| `agent.sla` | `observation` | Record that the agent is still running after the configured SLA; elapsed time is not failure or replacement authority. |
| `agent.close` | `status`, `observation` | Record the returned outcome. |
| `agent.correction.spawn` | `observation` | Record that approved corrective work started. |
| `agent.cleaner-handoff.spawn` | `observation` | Record that an approved cleaner handoff started. |

Authority is not duplicated across lifecycle observations. A
`correction.decision` or `cleaner.handoff.decision` carries the complete
authorized package once and assigns its consumed nonce as `decision_ref`.
Related spawn/iteration observations carry only that ref. If a directly
observed lifecycle record is malformed, append a corrected observation with
the same ref; do not rewrite history or synthesize another authorization.

The universal envelope is `ts`, `event`, and `feature`; `observation` carries
the concise fact. New runs do not emit attempt ordinals, context strategies,
follow-up counters, heartbeat fields, artifact probes, quality verdicts, or
per-attempt metrics. Historical events containing those optional fields remain
readable and need no migration.

## Phase protocol

Every started pipeline phase, including a failed, blocked, or gate-waiting
phase, closes with exactly one `phase.end`. It is either measured from two
checkpoints or explicitly unavailable. Estimation, zero substitution, a
partial subtotal, and reusing a prior phase's delta are prohibited.

1. Before work, collect an in-memory start snapshot and reduce it with
   `checkpointFromUsage`. Append `phase.start` with that safe checkpoint and
   `usage_scope: "codex-root-reachable"`.
2. After work, collect a fresh in-memory end snapshot, reduce it to a
   checkpoint, and call `compareCheckpoints(start, end)`. Append `phase.end`
   with the returned delta in `usage` and the safe end checkpoint in
   `usage_checkpoint`.
3. In the same coordinator transition, update the aggregate state fields from
   the complete set of `phase.end.usage` records and rewrite the summary from
   that trace. `$team-harness:trace` reads the same records; it never rescans
   rollouts or replaces an unavailable result.

The canonical OpenSpec Design sequence below uses the same observation model.
Replace only the example timestamp, feature, and concise observations:

```json
{"ts":"2026-01-01T00:00:00Z","event":"phase.start","feature":"example-feature","phase":"design","agent":"architect","usage_scope":"codex-root-reachable","usage_checkpoint":{"schema_version":1,"kind":"codex_usage_checkpoint","usage_status":"unavailable","reason_code":"CHECKPOINT_UNAVAILABLE","components":null}}
{"ts":"2026-01-01T00:00:01Z","event":"agent.spawn","feature":"example-feature","agent_role":"architect","task":"design","observation":"architect started OpenSpec planning"}
{"ts":"2026-01-01T00:01:00Z","event":"agent.close","feature":"example-feature","agent_role":"architect","task":"design","status":"success","observation":"architect completed OpenSpec planning"}
{"ts":"2026-01-01T00:01:01Z","event":"phase.end","feature":"example-feature","phase":"design","agent":"architect","status":"success","usage":{"schema_version":1,"kind":"codex_usage_delta","usage_status":"unavailable","reason_code":"CHECKPOINT_UNAVAILABLE","components":null},"usage_checkpoint":{"schema_version":1,"kind":"codex_usage_checkpoint","usage_status":"unavailable","reason_code":"CHECKPOINT_UNAVAILABLE","components":null}}
```

The unavailable objects are valid examples, not permission to replace measured
usage. `usage_scope` records the root-reachable measurement boundary, not a
root identifier. Before OpenSpec Gate 1, `openspec-events.mjs` validates this
durable sequence against the bound feature and required Design result.

On resume, do not reconstruct a root identifier from events, state, aliases,
paths, or rollout filenames. If the active runtime cannot supply it, emit the
normal `phase.start`/`phase.end` pair with the collector-derived unavailable
result (`CHECKPOINT_UNAVAILABLE` where applicable). The aggregate becomes
unavailable; later measured phases do not repair it into a plausible partial
total.

## Accounting and current snapshot

`00-state.md` retains only the current aggregate:

```text
usage_schema_version: 1|null
usage_status: available|unavailable
usage_reason_code: {collector code}|null
usage_components: {allowlisted components}|null
total_tokens: N|unavailable
cost_status: available|unavailable
cost_reason_code: {closed pricing code}|null
cost_usd: decimal|null
```

For an available aggregate, sum each `phase.end.usage.components` delta once,
not the cumulative checkpoints. A session can span or be reused across phases;
the checkpoint subtraction is what prevents the same cumulative session usage
from being counted twice. `total_tokens` is the sum of the already-accounted
`components.total_tokens` values only. `reasoning_output_tokens` is a separate
reported dimension and is never added to `total_tokens` again.

If any required phase delta is unavailable, invalid, regresses, conflicts, or
otherwise fails closed, set `usage_status: unavailable`, preserve only its
closed reason code, set `usage_components: null`, and render
`total_tokens: unavailable`. Do not retain an earlier subtotal. State is a
replaceable current snapshot; the phase history remains only in append-only
events.

The summary and trace render exactly the state derived from the events:

```markdown
## Cost
Usage: {measured|unavailable (REASON_CODE)}
Total tokens: {N|unavailable}
Cost: {${X.XX} USD|unavailable}
```

Thus unavailable usage always displays `Cost: unavailable`, even if a pricing
record happens to exist. The summary, state, event ledger, and trace may never
disagree by rendering an estimate, a zero, or a partial total.

## USD pricing provenance

There is no bundled price table or inferred model-to-price mapping. With the
currently available collector data, every renderer must output exactly:

```text
Cost: unavailable
```

A future USD amount is permitted only when every priced non-overlapping usage
dimension has one active quote whose tuple matches exactly, case-sensitively:

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

This example describes tuple shape only; it does not authorize its illustrative
numeric value. `rate_per_million` must be a finite, strictly positive decimal.

The phase must also carry a native, exact `pricing_identity` with the same
`provider` and `model`; a role name, an agent TOML default, a model prefix, a
family name, or an alias is not an identity. The quote source must be present,
the effective date range must contain the measurement date, and the currency
must be exactly `USD`. Missing, stale, malformed, ambiguous, overlapping, or
incomplete quote data yields `cost_status: unavailable` and a closed pricing
reason code. Never infer a rate, blend input/output prices, map an alias, or
turn a non-USD quote into USD.

`total_tokens` is an accounting aggregate, not a billable dimension. A renderer
must reject a quote set that prices `total_tokens` or otherwise double-counts a
component. Pricing provenance may be rendered only when it is complete; it
never includes a rollout path or identifier.
