# Deterministic quality improvements

For TH maintainers selecting testing investments after the v5 simplification; researched September 4, 2026.

## Preserve the delivered architecture

OpenSpec owns product intent, Main owns coordination and authority, and specialists contribute technical judgment and evidence. Deterministic checks execute reproducible assertions against that intent. Additional tools should enter through the existing quality runner and repository commands, with native reports where sufficient.

This direction is consistent with documented industry practices, but does not establish TH's comparative superiority. Complete the existing [pipeline baseline](benchmarks/pipeline-baseline.md) before adding mandatory specialist work or claiming improved cost per accepted task. Google's [mutation-testing study](https://research.google/pubs/practical-mutation-testing-at-scale-a-view-from-google/) supports evaluating targeted changes and filtering low-value results. Anthropic's [agent-evaluation guidance](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) supports outcome-based evaluation with tasks drawn from real failures.

## Existing capabilities

The [quality runner](quality-runner.md) executes exact argument arrays against an identified Git candidate, bounds output and duration, rejects tracked mutations, and accepts repository-defined command IDs. `coverage`, `contract`, and `integration` are already supported names; additional names use the same command envelope. Repository tooling can enforce thresholds, reject empty runs, and preserve detailed reports without a new TH schema.

The [control-plane suite](../tests/test_pipeline_control_plane.mjs), [quality-runner suite](../tests/test_quality_runner.mjs), and [RED/GREEN suite](../tests/test_test_transition.mjs) already exercise identity, ownership, replay, command execution, and immutable test inputs. New tests should extend meaningful behavioral coverage rather than reproduce implementation branches.

The packaged-asset regression also verifies that local OpenCode scratch bundles stay out of the plugin while distributed CJS and raw TypeScript hooks remain synchronized. This addresses a concrete reproducibility defect without adding pipeline structure.

## Recommended investments

| Priority | Investment | Concrete application | Adoption boundary |
|---|---|---|---|
| 1 | Reproducible hook builds | Declare local build-tool dependencies, lock their resolution, and use local binaries plus `npm ci`. | Foundational tooling improvement; no pipeline phase. |
| 2 | Property-based and stateful testing | Generate sequences of leases, repeated results, rejected inputs, and recovery; assert independent invariants. | Start with one canonical module and preserve minimal failures. |
| 3 | Selective mutation testing | Check whether tests detect incorrect comparisons, missing validation, or altered outcomes. | Advisory pilot on changed logic before any blocking threshold. |
| 4 | Product-specific integration testing | Generate API cases, test real database behavior, or execute user-visible browser scenarios. | Select only tools applicable to the consumer repository. |

### Reproducible builds

[Hook scripts](../hooks/ts/package.json) invoke `npx esbuild` and `npx tsc` without declaring those development dependencies, and their lockfile does not pin them. CI runs `npm install` before rebuilding. The proposed improvement is to declare and lock those tools and invoke their local binaries. [`npm ci`](https://docs.npmjs.com/cli/v11/commands/npm-ci/) rejects manifest/lockfile disagreement instead of updating the lock during installation. This improvement is proposed, not implemented by the residual-contract cleanup.

### Properties and fuzzing

[fast-check](https://fast-check.dev/docs/advanced/model-based-testing/) supports generated command sequences, shrinking, and replay coordinates. Useful invariants include idempotent duplicate results, unchanged authority after rejected input, reconstructable projections, and stale results failing to advance current work. The reference model must be small and independent of the implementation.

[Hypothesis stateful testing](https://hypothesis.readthedocs.io/en/latest/stateful.html) provides a Python alternative. [Native Go fuzzing](https://go.dev/doc/security/fuzz/) can exercise installer parsing and transformations, preserving minimized failures in the test corpus. Use the tool that matches the component; do not add several engines for the same target.

### Mutation testing

[StrykerJS](https://stryker-mutator.io/docs/stryker-js/introduction/) can assess JavaScript/TypeScript tests by introducing faults. Its [command runner](https://stryker-mutator.io/docs/stryker-js/configuration/) can invoke existing commands but lacks per-test coverage analysis; pilot compatibility and cost before adoption. [Incremental mode](https://stryker-mutator.io/docs/stryker-js/incremental/) can reuse relevant prior results.

Start on one canonical module, excluding generated package copies. Review survivors to distinguish weak assertions from equivalent mutations. Record useful survivors, runtime, and discovered defects; a global 100% score is not an appropriate starting requirement.

### Consumer-specific checks

- **APIs:** [Schemathesis](https://schemathesis.readthedocs.io/en/stable/) generates tests from OpenAPI/GraphQL, including [stateful operation sequences](https://schemathesis.readthedocs.io/en/stable/explanations/stateful/). It needs a machine-readable API schema and a test target; OpenSpec Markdown is not OpenAPI.
- **Persistence:** [Testcontainers](https://docs.docker.com/testcontainers/) supplies disposable real dependencies for migration, transaction, and compatibility tests. It requires a compatible container runtime and controlled fixtures.
- **UI:** [Playwright](https://playwright.dev/docs/best-practices) supports isolated browser tests with user-visible assertions and diagnostic traces. Prefer scenarios such as persisted changes surviving reload over snapshots of implementation details.

## Measure signal before expanding the harness

Random generation is not inherently deterministic. Preserve seeds, minimized inputs, tool versions, and any required execution order; control fixtures, clocks, and dependencies. A reproducible failure and an explicit oracle are the useful guarantees.

Use existing command configuration and native tool reports first. A normalized TH adapter needs demonstrated demand across consumers that repository tooling cannot adequately satisfy. The absence of a TH-normalized metric does not mean a repository's coverage policy is weak.

Measure unique defects found, false positives or flakiness, execution time, and human interpretation effort. Coverage locates unexercised code; mutation measures sensitivity to selected faults. Neither proves full correctness. Specialists assess whether the assertions represent approved behavior; Main retains workflow authority.
