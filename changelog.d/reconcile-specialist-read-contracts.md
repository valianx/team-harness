### Changed

- Specialist read contracts (`qa`, `implementer`, `adversary`, `security`, `delivery`, `ux-reviewer`) now read acceptance intent from the bound OpenSpec change (`specs/**/spec.md`, `tasks.md`) and scan the frozen candidate diff; the retired `sharded-v1` plan shards and the spike-only `02-implementation.md` are no longer read on the pipeline path, and the fail-closed floor is a missing bound change rather than a missing `01-plan.md`.
- `agents/ref-pipeline.md § Freeze and validation` declares the coordinator's build of `inputs/00-frozen.diff` and `00-verify-packet.md`; `docs/verification-packet.md` and `docs/output-contract-patterns.md` point at the v5 artifact set.
- `reviews/findings-ledger.md` carries a `Lens` column derived from the lease role of the accepted result; the decision ledger's `disposition` record carries the same `lens`.
- `docs/benchmarks/pipeline-baseline.md` records exclusive defects for `qa`, `tester`, `cleaner`, and `security`, with `n/a — lens not dispatched` as the explicit cell for an undispatched lens.

### Added

- `tests/fixtures/workspace-artifacts.json` and `tests/test_workspace_artifacts.py`: every workspace artifact a scanned pipeline contract names must be registered with a producer that mentions it or be retired and absent.
