# Pipeline v5 migration

Current pipeline execution reads only the v5 control contract. Its durable
authority is a canonical hash-linked control log; state, Gate, finding,
acceptance, counters, and receipts are projections or telemetry.

Every pre-v5 workspace is complete or aborted, and no converter remains. A
workspace without `control/control.jsonl` is closed administratively: Main
appends one `pipeline.close` entry with `terminal_state:
closed-administratively` to its events file and offers inline continuation or a
fresh run. Mixed writable schemas fail closed.

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
Security impact is not authored by architect or copied into `01-plan.md`.
Main derives it after Freeze from the canonical type-agnostic changed-surface
classifier; ambiguous or unresolved evidence maps to `unknown` and requires a
fresh security specialist.

`tests/test_pipeline_simplification_benchmark.mjs` is a deterministic contract
benchmark, not a wall-clock claim. Its three fixtures compare normalized Gate-1
work units, helper/dispatch operations, agent attempts, quality-run count, and
exclusive lens defects for a small fix, medium public feature, and
security-sensitive change. Candidate metrics are computed from the actual
control-plane helper results and selected role set; only the historical baseline
remains fixture data. The executable assertions require fewer pre-Gate
operations/attempts, no architect for valid OpenSpec, no empty cleaner, no
unconditional tester, and exactly one complete quality run per candidate.

`docs/benchmarks/pipeline-baseline.md` is the companion record and measures a
different thing: three fixture requests run through the live pipeline against a
named tree anchor, with time to Gate 1, dispatches, tool calls,
acceptance-criteria count, correction rounds, terminal state, and exclusive
defects per lens. The contract benchmark proves the control plane does less
work; the real-run baseline is what a later contract change compares its own
measurement against.
