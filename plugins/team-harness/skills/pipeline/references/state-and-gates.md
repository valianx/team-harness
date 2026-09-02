# State ownership and Gates (v5)

The current machine is
`design → waiting_gate1 → implementation → validation → waiting_gate3 → delivery → complete`.
Its only durable control authority is `control/control.jsonl`, a canonical,
hash-linked log appended by Main through the packaged `control-plane.mjs`.

A Gate reply authorizes work only after Main appends an idempotent
`operator_authority` event containing the consumed presentation nonce and exact
intent/scope/security identities. Gate displays, `00-state.md`, findings,
acceptance views, counters, and summaries are projections. Drift is repaired by
replaying the valid log; it never causes re-presentation or creates authority.

Main alone appends authority, lease-lifecycle, accepted-result, transition, and
mechanical-release events and writes projections. Specialists return one result
envelope and never edit these surfaces. Append/replay stops at the first corrupt
record and preserves the last valid prefix.

Current dispatch rejects legacy writable state/release fields. Recovery closes a
workspace without a control log administratively before any current-path action.
