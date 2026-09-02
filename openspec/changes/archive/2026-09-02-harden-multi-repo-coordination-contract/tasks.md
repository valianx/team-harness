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

- [x] 4.1 Add the canonical shared HerdR agent-messaging reference with capability detection, exact target/pane discovery, queue-aware state handling, explicit sender envelope, and closed result statuses.
- [x] 4.2 Implement the bounded HerdR adapter using literal argument arrays for `agent list`, `agent send`, `pane send-keys <pane> enter`, and `agent read`, with target revalidation between staging and submission.
- [x] 4.3 Integrate the shared contract into pipeline coordination, tmux, and background without changing native permission gates or making HerdR a required dependency.
- [x] 4.4 Ensure queued or failed submissions remain recoverable (`queued` or `staged-not-submitted`) and cannot be reported as `received` or retried blindly.

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
- [x] 7.4 Verify the installed HerdR queue contract, add full-envelope secret checks and bounded verification backoff, and cover review regressions in focused tests.

## 8. HerdR queue semantics correction

- [x] 8.1 Remove the incorrect idle wait and submit messages through HerdR's terminal input queue for every recognized agent state.
- [x] 8.2 Replace busy/unverified outcomes with durable `queued` semantics while preserving explicit Enter, receipt verification, and no-blind-resend safety.
- [x] 8.3 Discover the current HerdR sender identity, include stable terminal/pane correlation and a current-session response channel, and define receiver handling in the shared operational contract.
- [x] 8.4 Regenerate every packaged projection and run the focused adapter, generation, lint, and strict OpenSpec checks.

## 9. OpenSpec execution-contract correction

- [x] 9.1 Add a closed architect-authored execution-contract block with real worktree/base, files, dependencies, invariants, evidence, discovery scope, seams, quality commands, runtime-behavior classification, pre-test routing, preservation, and rollback.
- [x] 9.2 Make `openspec-overlay.mjs derive` reject missing or placeholder judgment, materialize complete shards and the workspace quality manifest, and bind both in overlay v2.
- [x] 9.3 Make the Gate-1 validator reject placeholder controls, non-product file scope, absent quality manifests, pre-test mismatch, and unwritable execution roots before aggregate binding.
- [x] 9.4 Regenerate every projection and run focused OpenSpec overlay, binding, generation, strict OpenSpec, and full repository suites.

## 10. Identity-preserving post-Gate derived repair

- [x] 10.1 Add repair fixtures for missing/corrupt shards and quality manifests, unchanged approved identities, absent canonical execution judgment, overlay hash drift, prior implementation progress, and transactional rollback.
- [x] 10.2 Implement the bounded `repair-derived` classifier and staged replacement with deterministic pre/post evidence, preserving the approved snapshot and overlay hashes.
- [x] 10.3 Integrate implementation-entry and recovery guidance so eligible derived damage is repaired once before any architect/design route, while canonical judgment or identity drift remains fail-closed.
- [x] 10.4 Regenerate projections and run focused overlay/binding/generation checks, strict OpenSpec validation, and the full repository suite.

## 11. Legacy-v1 approved-placeholder migration

- [x] 11.1 Add fixtures for original-gate preservation, operator-decision chronology, normative-prefix equality, current aggregate validation, existing-repair adoption, and stale/missing evidence rejection.
- [x] 11.2 Implement `migrate-v1` and migrated-Gate verification with a commit-last continuation certificate that never rewrites the original Gate or current derived artifacts.
- [x] 11.3 Document the exact `payin-orchestration-services` paths, dry-run/apply/verify commands, expected hashes, unchanged Gate/state fields, and recovery consumption rule.
- [x] 11.4 Regenerate projections and run focused migration/overlay/binding/generation checks, strict OpenSpec validation, and the full repository suite.

## 12. Per-binding aggregate implementation freshness

- [x] 12.1 Add regression fixtures for one active service, untouched sibling bindings, and a sibling with previously recorded progress.
- [x] 12.2 Make aggregate verification select pre-Gate, active-transition, or idempotent recorded-progress validation independently per binding without cross-service authorization.
- [x] 12.3 Reproduce the `payin-orchestration-services` aggregate call, regenerate projections, and run focused, strict OpenSpec, generation, and full repository validation.

## 13. Bounded specialist liveness recovery

- [x] 13.1 Add a pure specialist-liveness classifier and regression fixtures for pre-SLA waits, one token-bound probe, ACK grace, one renewal, stale tokens, clean replacement, partial progress, and exhausted retry.
- [x] 13.2 Replace indefinite implementation-or-later waiting with interrupt-first declared-path audit and at most one fresh same-role replacement; keep architect timeout operator-owned and prohibit Main/local fallback.
- [x] 13.3 Project the helper and specialist ACK contract into shipped Codex/Claude assets and add generation freshness assertions.
- [x] 13.4 Run focused liveness, generation, strict OpenSpec, and full repository validation.

## 14. Immutable derived dispatch binding

- [x] 14.1 Add regressions for idempotent sealing, post-seal shard mutation, repair-after-seal refusal, and a concurrent repair/seal attempt.
- [x] 14.2 Add the atomic per-service derived-set lock plus permanent `seal-dispatch` and `verify-dispatch` bindings over every dispatchable derived artifact.
- [x] 14.3 Require Main and implementer/tester packets to verify the dispatch binding and prohibit post-seal repair, rehash, or rebind recovery.
- [x] 14.4 Regenerate projections and run focused binding, strict OpenSpec, generation, and full repository validation.

## 15. Executable recovery receipts and shard-local RED

- [x] 15.1 Add bounded-command regressions proving canonical output syntax executes, legacy positional syntax fails before execution, and every wrapper or child failure exits non-zero while retaining closed JSON.
- [x] 15.2 Require persisted/recovered commands to preserve canonical `--output` syntax and validate receipt outcome, error code, and child exit before claiming evidence.
- [x] 15.3 Harden the tester/Main RED contract with upstream-input validation, target failure-stage classification, and current-or-completed shard dependency checks, including invalid UUID fixtures and future-method helper coupling.
- [x] 15.4 Regenerate projections and run focused bounded-command, generation, strict OpenSpec, and full repository validation.
