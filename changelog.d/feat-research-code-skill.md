### Added

- `/th:research-code`: hybrid multi-agent codebase-research flow — new read-only `code-researcher` sonnet agent fans out per-file/module lanes (optional web lanes), consolidator surfaces docs-vs-code conflicts, bounded gap-closure with a `code_closeable` gate.

### Changed

- `th:tester` no longer emits unit tests that assert a spec/manifest version string equals the release version (#364); version-parity assertions belong in a delivery/release gate, not in the test suite.
- Orchestrator now always renders the architect's confidence score at STAGE-GATE-1 (reframed from additive to required).
