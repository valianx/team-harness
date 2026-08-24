## 1. Canonical Review Contract

- [x] 1.1 Add the automatic contract-recovery and fail-closed boundaries to the `pr-review-independence` capability and canonical `review-pr` workflow.
- [x] 1.2 Restrict general, QA, security, and consolidator reviewer reads to supplied artifacts and verified-existing frozen-worktree files.
- [x] 1.3 Define coordinator-owned retry behavior that requires no operator decision and preserves the existing snapshot and publish-approval gates.

## 2. Deterministic Recovery

- [x] 2.1 Implement a packaged review-context classifier that validates all required coordinates, identity, snapshot integrity, freshness, role, attempt, and exact failed path when available.
- [x] 2.2 Return `retry-contract` for a first proven contract defect, `continue-comment` for a repeated specialist defect, and `fail-closed` for integrity, required-read, canonical-draft, malformed, or unclassified failures.
- [x] 2.3 Force `COMMENT` and expose the absent lens after a repeated specialist defect; never fabricate a general or consolidated draft.

## 3. Runtime Projections

- [x] 3.1 Regenerate Codex reviewer TOML, packaged agent copies, setup assets, and plugin skill projections from canonical sources.
- [x] 3.2 Synchronize the review-context helper into every generated review-pr distribution surface and make generation checks detect drift.

## 4. Verification

- [x] 4.1 Add focused tests for both reported nonexistent inferred paths and for automatic correction without an operator decision.
- [x] 4.2 Test repeated specialist degradation, repeated canonical-review failure, required-artifact/worktree/existing-file read failures, identity mismatch, snapshot/freshness failure, and malformed or unclassified classifier input.
- [x] 4.3 Run focused review-context tests, Codex generation checks, generated-skill freshness validation, relevant structural/lint suites, and `git diff --check`.
