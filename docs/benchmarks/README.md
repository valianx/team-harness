# Measuring Team Harness changes

Choose a measurement that exercises the behavior being changed. Keep comparable
revisions, requests, runtime/model/effort settings and explicit limits; report
quality and resource use together. Fixtures and tooling are maintained here;
execution results belong in an external or ignored workspace.

| Question | Reusable entry | Scope |
| --- | --- | --- |
| Does plan-review guidance detect and repair defects? | [Plan-review A/B runner](../../tools/benchmarks/plan_review/README.md) | Fresh textual plan reviews with synthetic defect/control cases, blind adjudication, native tokens and wall time. |
| Does a pipeline simplification preserve helper mechanics? | `tests/test_pipeline_simplification_benchmark.mjs` | Deterministic operation counts; no live latency, quality or token claim. |
| Can two Codex plugin snapshots be measured comparably? | `tests/benchmark_codex_pipeline_efficiency.mjs` | Installation/source provenance only; a successful receipt does not execute or pass a pipeline. |
| What should a live pipeline comparison observe? | [Pipeline fixtures and protocol](pipeline-baseline.md) | Equivalent real tasks; record coverage, corrections, dispatch/tool usage, terminal outcomes and observable resources. |
| What evidence exists for adaptive PR reviews? | [Historical PR-review evidence](native-pr-review.md) | Recorded implementation and pilot limits; broader comparative quality/cost measurement remains open under #662. |

For a live comparison, declare cases, repetitions, order, budgets and the same
quality criteria before observing results. Keep positive and negative controls.
Use native usage when available, count cached input and reasoning within their
reported totals once, and preserve unknown consumption and failed trials.
Different runtimes/models require separate comparisons; mixed totals describe
the workload. Small samples, prompt-context labels and provenance checks do not
establish whole-workflow improvement, statistical significance or billed savings.
