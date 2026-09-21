# Pipeline v5 compatibility

Current TH pipelines use native tasks, permissions and the shared workspace.
The [current pipeline reference](../agents/ref-pipeline.md) describes the working
method. New work does not require v5 leases, result envelopes, gate nonces or a
control journal.

## Existing workspaces

Reuse the exact workspace, plan, OpenSpec tasks, handoff and actual repository
state. Historical logs and receipts can explain prior progress. Their absence
does not require administrative closure or conversion. Treat corrupt or missing
history as an evidence limitation and use trustworthy current sources where
possible. Ask only for a genuinely missing decision.

## Retained helpers

`skills/pipeline/scripts/control-plane.mjs` and its specialist companion retain
their v5 schema validation, safe file handling and log/receipt compatibility.
Their tests cover those existing APIs. They are not the dispatch or authorization
path for new work, and current instructions do not call their administrative
closure or gate-release operations.

The legacy `openspecContentIdentity` and `taskProgressDelta` APIs remain useful
to understand old receipts. Their historical identity changes do not invalidate
current user authorization or force another Gate 1 conversation.

## Measurements

`tests/test_pipeline_simplification_benchmark.mjs` compares retained v5 helper
operations against its historical fixture. It is not a benchmark of current
native workflow time, token cost or reviewer quality.

`docs/benchmarks/pipeline-baseline.md` retains requests useful for optional
measurement. Record any actual comparison, candidate identities and limitations
in the shared workspace. Do not claim savings from unmeasured live behavior.
