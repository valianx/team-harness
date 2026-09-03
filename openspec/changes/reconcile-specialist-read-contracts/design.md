## Context

See [proposal.md](proposal.md). Two findings from the 2026-09-03 audit drive this change: specialists read an artifact set the v5 pipeline does not produce, and no artifact records which lens raised a finding.

## Decisions

### 1. Acceptance intent comes from the bound change; `01-plan.md` gives scope only

Every specialist that baselines a verdict on acceptance criteria reads the requirements and scenarios in the bound change's `specs/**/spec.md` and the dispatched items of its `tasks.md`, located through `01-plan.md § Canonical links`. `01-plan.md` itself supplies outcome, scope, batches, risks, and decisions and is never the AC source. The fail-closed floor moves with it: a missing bound change blocks; a missing projection does not, because the coordinator regenerates it. Keeping `01-plan.md` as the AC source was rejected because the projection carries no AC prose by contract (`agents/ref-pipeline.md § Design`).

### 2. The frozen candidate diff replaces `02-implementation.md`

The implementer never writes `02-implementation.md` (`agents/implementer.md § Session Context Protocol`) and no coordinator contract produces it. Verifiers scan the frozen candidate diff the coordinator writes at Freeze (`inputs/00-frozen.diff`) and the implementer's result envelope summary carried in the packet. Adding a coordinator-written `02-implementation.md` was rejected: it would duplicate the result envelope.

### 3. A registry, not a prose assertion, is the oracle

`tests/fixtures/workspace-artifacts.json` maps each artifact path pattern to `{"producer": "<file>"}` or `{"status": "retired"}`. `tests/test_workspace_artifacts.py` extracts every backticked workspace-artifact token from a closed scan list (the pipeline specialists, `orchestrator.md`, `ref-pipeline.md`, `agents/_shared/*.md`, `docs/verification-packet.md`, `docs/output-contract-patterns.md`) and fails on an unregistered token, a retired token, or a producer file that does not exist or does not mention the artifact. Existence over path sets, in the style of `tests/test_reference_resolution.py`. Extending the citation regex to unquoted `§` pointers was rejected as insufficient: a resolving heading cannot show the obligation left it.

### 4. The lens is derived from the lease, not self-reported

`buildControlProjection` keeps a `lease_roles` map from every `lease_issued` record and stamps `lens` on each projected finding from the accepted result's lease. A specialist cannot mislabel its own findings, and the value exists for every accepted result without a new envelope field. `findingsMarkdown` prints it as a `Lens` column. The decision ledger's `disposition` record gains a conditional `lens` field so a coordinator disposition of a finding stays joinable to the lens that raised it.

### 5. Baseline rows follow the dispatchable lens set

`docs/benchmarks/pipeline-baseline.md` gets one exclusive-defect row per lens the v5 validation fan can dispatch — `qa`, `tester`, `cleaner`, `security` — and drops `adversary`, which the pipeline path no longer dispatches. `n/a — lens not dispatched` is the explicit cell for a run that did not dispatch the lens, so `pending-runs` disappears from a recorded run.

## Risks

- Word ceilings: `agents/ref-pipeline.md` sits 3 words under its shrink-only ceiling and `agents/ref-special-flows.md` sits exactly on it; both edits trim elsewhere in the same file.
- Registry drift: an artifact added later without a registry entry fails the test by design; the failure message names the token and the file.
