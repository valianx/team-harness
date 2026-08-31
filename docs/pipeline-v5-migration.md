# Pipeline v5 migration

Current pipeline execution reads only the v5 control contract. Its durable
authority is a canonical hash-linked control log; state, Gate, finding,
acceptance, counters, and receipts are projections or telemetry.

Supported v1-v4 workspaces are converted once. The converter validates the
historical live decision, original Gate identity, repository/service bindings,
immutable inputs, dirty progress, and any continuation certificate, repaired
aggregate, and repair evidence. A binding failure preserves its exact service
and error. Missing or conflicting authority stops for a live decision.

Conversion writes a new v5 log and projections beside the legacy workspace,
replays and validates them completely, and commits `control/current.json` last.
Until that pointer commits, legacy state remains selected. A valid existing v5
pointer is idempotently reused and is never overwritten from reconstructed v4
data. Mixed writable schemas fail closed.

After cutover, specialist dispatch carries one capability lease inside the
existing immutable capsule and return transport carries one result envelope.
The hot path never imports legacy routing, numeric ceilings, fixed replacement
allowances, or projection release fields.
