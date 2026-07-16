# Acceptance Matrix: opencode-runtime-aware-boot

| AC | Description (1 line) | Test (file:line) | QA evidence (file:line) | Security |
|----|-----------------------|-------------------|--------------------------|----------|
| Task-1 AC-1 | State (a) pass — CC floor literal remains, byte-identical | `tests/test_leader_orchestrator_split.sh` `AC-2.6-floor-literal` PASS | `agents/leader.md:65,73` PASS | clean |
| Task-1 AC-2 | State (a), floor not met — hard STOP, existing CC error, no monolith | `AC-2.6-floor-literal` + `AC-2.6-nofallback` PASS | `agents/leader.md:77-81` PASS | clean |
| Task-1 AC-3 | State (b) — discriminator crux, no fallthrough to opencode | `AC-8-tristate-state-b` PASS | `agents/leader.md:66` PASS | clean |
| Task-1 AC-4 | State (c) — opencode proceeds, no CC gating | `AC-8-tristate-state-c` + `AC-8-no-cc-gating-on-opencode` PASS | `agents/leader.md:67-68` PASS | clean |
| Task-1 AC-5 | State (c), neither runtime — hard STOP | `AC-5-neither-runtime-stop` PASS (tester-added) | `agents/leader.md:69` PASS | clean |
| Task-1 AC-6 | Config-root probe order/hardening/existence-only + execution model | `AC-8-configroot-hardening` + `AC-8-configroot-absolute-no-traversal` + `AC-8-configroot-existence-only` PASS | `agents/leader.md:67` (cross-checked vs `hooks/ts/shim/opencode-config.ts::resolveOpencodeConfigRoot`) PASS | clean |
| Task-1 AC-7 | Accepted residual named + SEC-DR-1 closure named | `AC-7-residual-offpath-named` + `AC-7-residual-takeover-deadlock` + `AC-7-closes-sec-dr-1` PASS (tester-added) | `agents/leader.md:71,66` PASS | clean |
| Task-1 AC-8 | Group E asserts tri-state (a)-(e) + `run-all.sh` green | `tests/test_leader_orchestrator_split.sh:390-448` PASS | full pattern-by-pattern review PASS | clean |
| Task-2 AC-1 | Executes updater via Bash, non-interactive | `test_agent_structure.py` Suite 153 checks PASS | `th-update.md:9-24` PASS | clean |
| Task-2 AC-2 | Already-current → zero writes, no download | Suite 153 (`three-state-result`) PASS | `th-update.md:36-37,51` PASS | clean |
| Task-2 AC-3 | Three-state result + restart named | Suite 153 PASS | `th-update.md:49-56` PASS | clean |
| Task-2 AC-4 | No SHA256-bypass, no alternate path | Suite 153 (`no-skip-verify`, `sha256-floor-named`) PASS | `th-update.md:40-42,58-64` PASS | clean |
| Task-2 AC-5 | Standalone, never gated | Suite 153 (`standalone-not-gated`) PASS | `th-update.md:66-72` PASS | clean |
| Task-2 AC-6 | Suite 153 (9 checks) + `run-all.sh` green | `test_agent_structure.py:34338-34434` PASS | pattern-by-pattern review PASS | clean |
| Task-3 AC-1 | Leader → `name: TH Leader` + `mode: primary` | `TestTransform_ModeByRole_Leader` (Go) + Section 16 (JS) PASS | `cmd/install/transform.go:339-352` PASS | clean |
| Task-3 AC-2 | CC form retains `name: leader`; never affected | nil-transform identity path (by construction) PASS | `cmd/install/dispatch.go:167-171`, `plan.go:108-111` PASS | clean |
| Task-3 AC-3 | Non-leader agents unchanged, no second primary | `TestTransform_ModeByRole_NonLeader` PASS | `cmd/install/transform.go:340-343` PASS | clean |
| Task-3 AC-4 | `agents/leader.md` frontmatter stays `name: leader` | `T3-AC-4-frontmatter-name-leader` PASS (tester-added) | `agents/leader.md:2` PASS | clean |
| Task-3 AC-5 | `migrate.mjs` post-projection role layer; generic transform unaffected | Section 16 PASS | `tools/harness-migrate/migrate.mjs:1109-1119,1385-1388` PASS | clean |
| Task-3 AC-6 | Idempotent/deterministic | By construction (pure function); no dedicated double-invocation test (non-blocking Warning) PASS | — | clean |
| Task-3 AC-7 | Test files assert rename; conformance/suites green | `cmd/install/transform_test.go:162-194`, `tools/harness-migrate/test_harness_migrate.mjs:992-1090` PASS | full round-trip via temp dir PASS | clean |

**Combined: 21/21 PASS.** Security: clean (0 Critical/High across design review rounds 1-2 and verify rounds 1-2). Adversary: round-1 finding (Case D, prose/code fidelity gap at `agents/leader.md:67`) closed via bounded patch, re-verified `could-not-break` in round 2.
