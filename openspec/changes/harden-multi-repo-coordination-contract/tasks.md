## 1. Lock the regressions

- [x] 1.1 Add workspace-identity fixtures covering dated single-repository paths, the canonical Obsidian initiative root, service child paths, duplicate candidates, evidence-only repositories, containment failures, and historical persisted identities.
- [x] 1.2 Add OpenSpec fixtures for three writable service-owned bindings plus one evidence-only repository, including unreadable artifacts, repository-identity mismatch, stale child hashes, aggregate membership/order drift, and monotonic task progress.
- [x] 1.3 Add consolidated Gate-1 tests proving the nonce binds the ordered binding set and aggregate hash, and that no child service presents a second Gate 1.
- [x] 1.4 Add HerdR adapter tests with a fake CLI for unavailable capability, exact/ambiguous names, idle success, every non-idle state, busy-to-idle, timeout, pane drift, Enter failure, verified receipt, unverified submission, literal message handling, and no duplicate resend.

## 2. Canonical workspace and state identity

- [x] 2.1 Implement the bounded workspace-identity resolver and canonical identity schema, preserving the existing write probe and fail-closed containment, symlink, readability, and ambiguity checks.
- [x] 2.2 Introduce `pipeline_version: 4` coordinator state with one initiative root, deterministic service subdirectories, ordered `openspec_bindings`, typed `evidence_repositories`, and aggregate OpenSpec identity fields.
- [x] 2.3 Add v3 recovery compatibility that maps historical singular OpenSpec fields to one in-memory binding without moving or rewriting the historical workspace or gate identity.
- [x] 2.4 Update activation, initiative machinery, recovery, trace, pipeline listing, state/gate contracts, and relevant documentation to consume the persisted resolver output and remove conflicting inline path formulas.

## 3. Multi-service OpenSpec and consolidated Gate 1

- [x] 3.1 Generalize OpenSpec adapter, snapshot, overlay, progress, recovery, and event validation to operate on an explicit service binding while preserving all current single-binding validation and read-failure floors.
- [x] 3.2 Implement service-keyed snapshot and overlay paths plus the canonical aggregate manifest and SHA-256 covering repository roles, child identities/hashes, cross-service dependencies, execution order, and evidence-only dispositions.
- [x] 3.3 Update Design to discover or create OpenSpec changes only inside each writable owning service, reject coordinator/reference centralization, and keep evidence-only repositories outside writable scope and acceptance coordinates.
- [x] 3.4 Implement the consolidated Gate-1 preview, freshness check, nonce binding, approval record, and post-approval serial service execution with no child Gate-1 ceremony.
- [x] 3.5 Add recovery and invalidation behavior for missing or stale bindings, changed membership/roles/order/dependencies, promoted evidence repositories, and authorized per-service checkbox progress.

## 4. Shared HerdR operations

- [x] 4.1 Add the canonical shared HerdR agent-messaging reference with capability detection, exact target/pane discovery, state normalization, explicit sender envelope, bounded waiting, and closed result statuses.
- [x] 4.2 Implement the bounded HerdR adapter using literal argument arrays for `agent list`, `agent wait`, `agent send`, `pane send-keys <pane> enter`, and `agent read`, with target revalidation between staging and submission.
- [x] 4.3 Integrate the shared contract into pipeline coordination, tmux, and background without changing native permission gates or making HerdR a required dependency.
- [x] 4.4 Ensure failed or unverifiable submissions remain recoverable (`pending-busy`, `staged-not-submitted`, or `submitted-unverified`) and cannot be reported as `received` or retried blindly.

## 5. Projection and contract freshness

- [x] 5.1 Extend skill/agent packaging and Codex projection inputs so the workspace resolver, v4 state contract, OpenSpec aggregate behavior, HerdR reference, and adapter have declared canonical sources and fresh generated copies.
- [x] 5.2 Add generation/lint assertions rejecting conflicting workspace formulas, singular OpenSpec fields in new-run templates, divergent HerdR command sequences, send-without-submit/read behavior, and stale generated artifacts.
- [x] 5.3 Reconcile `docs/conventions.md`, OpenSpec integration, observability, knowledge, and runtime guidance with the canonical workspace, service ownership, consolidated Gate 1, and HerdR availability boundaries.

## 6. Validation and release evidence

- [x] 6.1 Run the focused workspace, state, OpenSpec snapshot/overlay/recovery/events, Gate, HerdR, tmux, and background suites and record exact passing commands.
- [x] 6.2 Run `node tools/codex-runtime/generate.mjs --check`, `node tools/codex-runtime/test_generate.mjs`, skill synchronization checks, Team Harness lint, and the relevant shared-runtime test suite.
- [x] 6.3 Run `openspec validate harden-multi-repo-coordination-contract --strict` and reconcile any planning/implementation drift before completion.
- [x] 6.4 After behavioral validation passes, update the patch-version release sites and changelog together, rerun release/version validation, and leave publication or push behind its separate live approval.

## 7. Review hardening

- [x] 7.1 Align the documented v4 workspace, binding, evidence, service-event, and HerdR persistence schemas with their canonical adapters.
- [x] 7.2 Fail closed on workspace/binding membership drift, missing aggregate identity, missing evidence roots, and unbounded adapter exception codes.
- [x] 7.3 Record task-intent and strict-validation results in each binding and bind per-service shard ownership to its traceability path.
- [x] 7.4 Verify the installed HerdR wait contract, add full-envelope secret checks and bounded verification backoff, and cover review regressions in focused tests.
