# Acceptance Matrix: PR-2 — hooks Bash→TS cutover + lifecycle doc (#446, #447)

| AC | Description (1 line) | Test | QA evidence | Security |
|----|----------------------|------|-------------|----------|
| Task-6b AC-1 | Launcher decisions identical to the TS leg of the T6a dual-target | `03-testing-pr2.md §2` fail-closed probe; `04-validation-pr2.md:35` | `04-validation-pr2.md:35` PASS | clean |
| Task-6b AC-2 | F5 three-class contract (deny-floor/advisory/observational), fail-closed on node-absent and artifact-absent | `hooks/run-ts-hook.sh:27-57`; independent probe `03-testing-pr2.md §2` (no pass-through in any tested combination) | `04-validation-pr2.md:38` PASS | SEC-PR2-001 fixed + re-verified, Suite 136 (34/34) |
| Task-6b AC-3 | grep-clean of retired `.sh` files | `02-pr2-doc-sweep.md` (5 flagged files fixed + 2 adjacent) | `04-validation-pr2.md:41` FAIL-as-written → doc-sweep resolved the material survivors; residual `agents/orchestrator.md:1410,3051` explicitly deferred (out of named scope, documented) | n/a |
| Task-6b AC-4 | Go installer CC path retired, `hooks/config.json` removed | `cmd/install/main.go:53-80`; `assets_test.go:161-170` | `04-validation-pr2.md:53` FAIL-only-grep-clause → doc-sweep resolved `docs/dev-mode.md`, `docs/plan-sketches.md`; functional clauses PASS | clean |
| Task-6b AC-5 | TS-only suites, no coverage loss | `tests/run-all.sh:26-47`; orphan `test_prepublish_guard.sh` retargeted (Suite 135) | `04-validation-pr2.md:59` PASS | clean |
| Task-6b AC-6 | Latency measured and recorded | `02-implementation-t6b.md § Latency measurement` — 635ms → 287ms | `04-validation-pr2.md:62` PASS | n/a |
| Task-6b AC-7 | Migration guide declares TS as single source, supersedes interim | `docs/opencode-migration-guide.md:3` | `04-validation-pr2.md:65` PASS | n/a |
| T6d Lane A | policy-block curl breadth + fail-closed split | `tests/test_policy_block.sh:280-304,502-510` (142/142) | `04-validation-pr2.md:74` PASS | clean |
| T6d Lane B | prepublish-guard rename-source + opencode cwd (#411) | `tests/test_prepublish_bump_floor.sh:669-710` (56/56) | `04-validation-pr2.md:80` PASS | clean; behavioral fixture gap for opencode cwd port noted as follow-up |
| T6d Lane C | worktree-guard raw-scan gated to fallback | `tests/test_worktree_guard.sh:196-198` (25/25) | `04-validation-pr2.md:86` PASS | clean |
| T6d Lane D | subagent-trace `agent_id` restored (SEC-DR-007) | `tests/test_subagent_start.sh:214-241`; `test_agent_structure.py:28367-28371` (27/27) | `04-validation-pr2.md:89` PASS | clean |
| SEC-PR2-001 | Launcher fail-closed on corrupt/empty/crashing deny-floor artifact | new Suite 136 (34/34) | tester independent probe `03-testing-pr2.md §2` | Critical → fixed (`afa1739`), re-verified |
| SEC-PR2-002 | gcp-guard catastrophic-verb fail-safe reachable on malformed payload | mutation test #2 equivalent path; suite green | `05-security-pr2.md:43` | Medium → fixed (`cae7435`), re-verified |
| Task-8 AC-1 | Stage×runtime lifecycle table | `docs/lifecycle.md:15-28` | `04-validation-pr2.md:96` PASS | n/a |
| Task-8 AC-2 | Docs point at lifecycle.md, no self-declared maturity | `README.md:10,33,172`; migration-guide; roadmap | `04-validation-pr2.md:99` PASS | n/a |
| Task-8 AC-3 | Go installer declared opencode-only; CLAUDE.md < 36000 bytes | `CLAUDE.md:101,109,113`; `docs/lifecycle.md:47-51`; size guard `test_agent_structure.py:4370-4375` | `04-validation-pr2.md:102` PASS (35522 bytes) | n/a |
| Task-8 AC-4 | `[decision]` bullets in docs/knowledge.md | `docs/knowledge.md:156-158` | `04-validation-pr2.md:105` PASS | n/a |

**Independent re-audit (tester, `03-testing-pr2.md`):** full suite green (`run-all.sh` 28 suites / 0 fail, `test_agent_structure.py` 3183/3183, `go build`/`go test` OK); fail-closed launcher probed directly (node-absent and artifact-absent, 5 deny-floors, zero pass-through); all 4 T6d hardening fixes confirmed via mutation testing (each mutation reverted the fix and reddened its suite, no vacuous assertions). Non-blocking gap: prose references to retired `.sh` names survive outside the doc-sweep's declared scope (`README.md:163`, `SECURITY.md:30`, `skills/lint/SKILL.md:161`, `skills/hookify/SKILL.md:90,141,142`, `skills/learn-english/SKILL.md:6`, `output-styles/developer-mode.md:51`, `tests/test_subagent_start.sh` comments) — none execute any test path; deferred to a documentation follow-up.
