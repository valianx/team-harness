## 1. Domain Contracts and Compatibility

- [x] 1.1 Add fixtures and schema assertions for the closed convergence receipt, including `current`, `converged`, `pending-approval`, `partial-convergence`, restart aggregation, redaction, and malformed-output rejection.
- [x] 1.2 Refactor the snapshot bridge, native settings, runtime, and bundled-agent helpers into importable classify/apply functions while preserving their existing command-line behavior and safety tests.
- [x] 1.3 Add bounded native Codex adapters that inspect required feature and MCP state with fixed argv, timeouts, output limits, closed JSON validation, and no writes when state is current.

## 2. Single-Pass Convergence

- [x] 2.1 Implement the versioned Codex update convergence entry point with validated old/new snapshot identities, ordered domain execution, one receipt, and no workspace or persistent approval state.
- [x] 2.2 Implement the already-current fast path so it performs no domain writes, avoids unconditional feature enablement and agent synchronization, and verifies all declared postconditions in the same pass.
- [x] 2.3 Implement automatic repair and postcondition verification for bridge, native settings, required features, agents, MCP expectations, and hooks while preserving operator-owned values and unmanaged conflicts.
- [x] 2.4 Implement runtime `pending-approval` classification and an invocation-scoped, snapshot-bound approval fingerprint that applies only the recomputed persistent runtime delta after live approval.
- [x] 2.5 Implement partial-convergence receipts and rerun behavior that identify the failed domain, preserve completed idempotent work, skip current domains, and return the standard Team Harness update invocation as recovery.

## 3. Codex Update Contract

- [x] 3.1 Rewrite the packaged Codex update skill around the short native snapshot-selection stage and one convergence invocation, removing redundant plugin reads, per-domain coordinator calls, and repeated final verification.
- [x] 3.2 Make the update skill render a concise pending-runtime summary and accept a short affirmative, negative/deferral, or natural-language adjustment without requiring an exact response or a copied command.
- [x] 3.3 Update maintainer documentation and release notes to describe the bounded two-stage flow, receipt authority, fast path, runtime approval boundary, and recovery semantics.

## 4. Verification and Distribution

- [x] 4.1 Add isolated temporary-`CODEX_HOME` tests for current, repair, pending, approved, declined, sandbox-protected, unsafe-input, malformed-native-output, and partial-resume paths.
- [x] 4.2 Add an orchestration regression test proving one post-install convergence call in the common case, at most one additional call after runtime approval, and no coordinator-side domain rechecks.
- [x] 4.3 Run the focused update/setup/runtime suites and the repository's shared runtime/package validation suites, recording any intentionally unaffected cross-runtime behavior.
- [x] 4.4 Apply the required plugin version, marketplace metadata, and changelog updates only after the distributable Codex snapshot includes the new helper and tests pass.

## 5. Security Review Closure

- [x] 5.1 Bind the executable snapshot to the active `CODEX_HOME`, reject symlinked components, pin the absolute Codex executable, and verify the exact packaged hook artifacts.
- [x] 5.2 Bound native output while the child is running and validate closed feature, MCP, domain, pending-decision, and receipt schemas.
- [x] 5.3 Bind runtime authorization to the exact redacted pending delta and constrain escalated retries to the receipt's single failed domain.
- [x] 5.4 Re-read bridge and config postconditions and add regression coverage for tampered snapshots, oversized output, nested receipt fields, and stale approval fingerprints.
- [x] 5.5 Close reviewed residuals by attesting helpers before import, binding approvals to the executable snapshot digest, rejecting raw relative binaries, and enforcing the deadline after native pipes close.
