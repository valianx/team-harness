### Changed

- Pipeline now verifies prior-stage recorded outcomes instead of re-executing them, eliminating paid-twice work across five seams (#307):
  - `agents/orchestrator.md`: Phase 3 skips the full test-suite re-run when Phase 2.7 already recorded a green suite on an unchanged tree (mirrors the #266 delivery recorded-state gate); the suite re-runs only when a source/test/build-config file changed between the two phases.
  - `agents/reviewer.md`: Phase 4.5 internal review now bounds the inlined PR diff with a line cap + truncation marker instead of fanning out the full diff unbounded.
  - `agents/ref-direct-modes.md`: the `update-body` and `reply` review submodes receive the changed-files list (and thread context) only, not the full diff.
  - `agents/security.md`: pipeline-mode security report is a compact findings-only format (omits the risk-score weight table and empty OWASP matrix); the audit-grade template is reserved for `audit`/`focused` modes and `/th:audit-security`.
  - `agents/{architect,implementer,tester,qa,qa-plan,security,adversary,delivery}.md`: the blanket "read ALL workspace files" instruction is replaced by a per-agent input manifest (named files the role consumes, glob-all fallback only when a named file is absent).
  - `agents/ref-special-flows.md` + `agents/ref-direct-modes.md`: a lazy-load directive instructs consumers to load only the specific flow/mode section needed, rather than the whole monolithic reference file (delivered as an in-file directive, not a physical split, to preserve every section anchor and the structural-test contract).
  - `agents/delivery.md`: Golden-Command DoD now classifies commands — free-verification commands remain gates; paid (behavioral suite, ~$1/run) and interactive (installer TUI) commands are excluded from routine delivery (opt-in only).
  - `docs/observability.md`: cost-rollup model attribution reads each agent's frontmatter `model:` field as the primary path (with a static opus-agent fallback list), replacing the inaccurate "all non-architect agents → sonnet" default.
