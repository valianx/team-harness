# Coordinator state contract (v5)

Main owns one hash-linked `control/control.jsonl`. It is the only durable control
authority. Each canonical record is written through
`skills/pipeline/scripts/control-plane.mjs` and has a contiguous sequence,
previous-event hash, Main provenance, closed event type, and canonical identity.

The log records only operator authority, lease lifecycle, accepted results,
pipeline transitions, and mechanical release. Main appends a record before it
performs the transition represented by that record. A corrupt or incomplete
suffix is ignored after the last valid prefix and blocks later control actions.

`00-state.md`, `reviews/findings-ledger.md`, Gate displays, counters, summaries,
and receipts are projections or telemetry. They never authorize, revoke, pause,
rotate, or advance work. On disagreement Main rebuilds them idempotently from the
valid log; it does not re-present a Gate or synthesize a decision.

Main is the only log appender and projection writer. Specialists return a
`result_envelope` through native terminal transport and never edit coordinator
state, control events, Gate records, findings projections, or acceptance views.
The Main-only `control-plane.mjs` is never materialized in a specialist helper
bundle; capsules receive only `control-plane-specialist.mjs`, whose exports can
validate leases/capsules and construct results but cannot append or project.
Before accepting a result, Main compares its commit list and `changed_paths`
with the real Git diff and dirty state since the lease's bound baseline commit.

Current v5 execution rejects legacy writable release/state fields. A supported
v1-v4 workspace must pass the one-shot converter before dispatch.

## Current State — the schema you write

Write canonical control events only. The current state document is generated
from `buildControlProjection` and carries no writable authority field.

## Artifact verification

Verify every identity-bound input as a contained regular non-symlink file with
its expected SHA-256 before an event can cite it.

## Terminal status write — mandatory

Append a terminal transition event first, then rebuild the terminal projection.
Never mark only the projection complete or aborted.
