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

After cutover, Main derives one minimal capability lease immediately before a
dependency-ready coherent worktree batch and native return transport carries
one result envelope. A transport envelope may serialize the lease, but Design
does not create semantic overlays, permanent future task capsules, or an
exhaustive execution graph. The hot path never imports legacy routing, numeric
ceilings, fixed replacement allowances, or projection release fields.

Design now treats strict-valid OpenSpec as the sole semantic plan and generates
compact read-only `01-plan.md` for the operator. An existing valid change needs
no architect. Acceptance authoring remains in OpenSpec; explicit plan review
uses one surviving read-only reviewer. Implementation owns ordinary tests,
while separate tester, cleaner, and security dispatches are risk/impact derived.

`tests/test_pipeline_simplification_benchmark.mjs` is a deterministic contract
benchmark, not a wall-clock claim. Its three fixtures compare normalized Gate-1
work units, planned agent attempts, tool-call envelopes, quality-run count, and
exclusive lens defects for a small fix, medium public feature, and
security-sensitive change. The executable assertions require fewer pre-Gate
steps/attempts/calls, no architect for valid OpenSpec, no empty cleaner, no
unconditional tester, and exactly one complete quality run per candidate.
