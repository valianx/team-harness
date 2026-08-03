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

The durable vocabulary is finite. `agent_role` and `task` must be one of these
paired values; no user-supplied task title, native alias, or other free-form
label is permitted:

| `agent_role` | `task` |
|---|---|
| `architect` | `design` |
| `implementer` | `implementation` |
| `tester` | `test_evidence` |
| `qa` | `quality_review` |
| `security` | `security_review` |
| `delivery` | `delivery` |

`attempt_ordinal` is a positive, monotonic integer scoped to that
`(agent_role, task)` pair. It is a local ordinal for ordering declarations,
never a native session/thread ID or a durable alias. The event sequence is the
only correlation mechanism. Its value grammar is
`context_strategy: fresh|continued`.

| Event | Required lifecycle fields | Coordinator rule |
|---|---|---|
| `agent.spawn` | `agent_role`, `task`, `attempt_ordinal`, `context_strategy`, `follow_up_count` | `context_strategy: fresh` starts the next ordinal with `follow_up_count: 0`. `context_strategy: continued` reuses the one still-open declared ordinal and increments its count by one. |
| `agent.close` | The same identity fields, final `follow_up_count`, `status`, `quality_verdict`, and `attempt_metrics` | Exactly one closes an open ordinal. A terminal close cannot later receive a continued dispatch. |
| `agent.correction.spawn` | The spawn fields plus `correction_cause: verification` | Starts a new, strictly larger ordinal with `context_strategy: fresh` and `follow_up_count: 0`, only after the prior related attempt is closed. The bounded correction packet is prompt-only and never becomes an artifact. |

There is no standalone follow-up event. Each deliberate continuation is another
`agent.spawn` declaration with `context_strategy: continued`; the final
`agent.close` repeats the accumulated count. A correction never revives a
terminal attempt. This is the durable form of the fresh-session rule, not a
claim that a native alias has been observed.

`quality_verdict` on `agent.close` is one of
`pass|concerns|fail|n-a`. Use `n-a` unless an already-bounded specialist result
contains that exact value; never infer, translate, or copy an explanation.
When aggregating this event enum into an object key, map `n-a` to `n_a`; the
other three values retain their spellings. The underscore is an aggregate-key
encoding, never an additional event value.

`attempt_metrics` is an aggregate for that one declared attempt, including all
of its continued dispatches. Its only permitted shape is:

```json
{
  "schema_version": 1,
  "kind": "codex_agent_attempt_metrics",
  "metrics_status": "available|unavailable",
  "reason_code": "PER_ATTEMPT_METRICS_UNAVAILABLE|PER_ATTEMPT_METRICS_INVALID|PER_ATTEMPT_METRICS_CONFLICT|null",
  "components": {
    "cached_input_tokens": 0,
    "uncached_input_tokens": 0,
    "output_tokens": 0,
    "wall_time_ms": 0,
    "tool_calls": 0
  }
}
```

For `available`, every component is a complete non-negative integer and
`reason_code` is `null`. For `unavailable`, `components` is `null` and the
reason is one of the closed non-sensitive codes above. The numeric zeros in the
schema illustrate number types only; they do not authorize substituting zero
for absent data.

The current collector reports root-reachable phase usage, not usage attributable
to one declared agent attempt. Therefore the current producer **MUST use
`unavailable`** with `PER_ATTEMPT_METRICS_UNAVAILABLE` for
`attempt_metrics`; it must not split a root/phase delta, inspect the collector
session list, mine a transcript or tool output, or infer an attributed metric.
A future runtime may report `available` only through a versioned,
privacy-safe per-attempt aggregate with this exact shape. This contract does not create or promise such telemetry.

For a current lifecycle aggregate, count a fresh `agent.spawn` and an
`agent.correction.spawn` once each; count follow-ups only from each terminal
`agent.close`; count corrections from `agent.correction.spawn`; and count the
four closed `quality_verdict` values. Sum `attempt_metrics.components` once per
closed ordinal only when every declared attempt has exactly one valid close and
every metric result is available. An open, duplicate, missing, malformed,
unavailable, regressive, or conflicting declaration makes the complete metric
aggregate unavailable—never retain a plausible partial subtotal.

After a valid Gate 1 approval, `approved_ac_count` is the positive integer
count of the current approved plan's AC rows. It contains neither AC text nor
an AC identifier and is replaced if a new approved plan replaces the current
snapshot. `cached_input_per_approved_ac` is
`cached_input_tokens / approved_ac_count` only when both the complete attempt
metric aggregate and that positive count are available; otherwise it is
`unavailable`. A measured zero is valid, but an absent denominator or metric is
not zero.

The lifecycle extension is additive. It neither selects the Native Codex cost
branch nor changes the legacy Claude route: only
`phase.end.usage.kind: codex_usage_delta` selects native accounting and its
strict unavailable semantics remain intact.

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

The canonical event fragments are:

```json
{"event":"phase.start","phase":"implementation","agent":"implementer","usage_scope":"codex-root-reachable","usage_checkpoint":{"schema_version":1,"kind":"codex_usage_checkpoint","usage_status":"available","reason_code":null,"components":{"input_tokens":0,"cached_input_tokens":0,"uncached_input_tokens":0,"cache_write_input_tokens":0,"output_tokens":0,"reasoning_output_tokens":0,"total_tokens":0}}}
{"event":"phase.end","phase":"implementation","agent":"implementer","usage":{"schema_version":1,"kind":"codex_usage_delta","usage_status":"unavailable","reason_code":"CHECKPOINT_UNAVAILABLE","components":null},"usage_checkpoint":{"schema_version":1,"kind":"codex_usage_checkpoint","usage_status":"unavailable","reason_code":"CHECKPOINT_UNAVAILABLE","components":null}}
```

The examples show shape only. They do not authorize zero tokens for a completed
measured phase. `usage_scope` records the root-reachable measurement boundary,
not a root identifier.

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
