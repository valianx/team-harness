# Acceptance Matrix: release-apply-local-updates

| AC | Description (1 line) | Test (file:line) | QA evidence (file:line) | Security |
|----|----------------------|------------------|-------------------------|----------|
| AC-1 | opencode leg: bounded poll of `VERSION` (15s x 12 / 180s ceiling), timeout reports state + manual command without aborting | `tests/test_agent_structure.py` s132(d3), s132(d7) | `skills/release/SKILL.md:149-154` PASS | n/a |
| AC-2 | Claude Code leg: marketplace update + plugin update, installed to downloaded, no managed-block sync, `/reload-plugins` operator-driven | `tests/test_agent_structure.py` s132(d2), s132(d4), s132(d9) | `skills/release/SKILL.md:136-143` PASS | n/a |
| AC-3 | opencode leg: OS-detected updater with repo-to-Pages fallback, three-state delta, restart operator-driven | `tests/test_agent_structure.py` s132(d2), s132(d3), s132(d4), s132(d9) | `skills/release/SKILL.md:156-161` PASS | n/a |
| AC-4 | Per-leg failure isolation; release is never reverted or marked failed | `tests/test_agent_structure.py` s132(d4), s132(d8) | `skills/release/SKILL.md:130,143,163` PASS | n/a |
| AC-5 | Single final operator-facing report, one row per runtime, neutral voice, no emoji | `tests/test_agent_structure.py` s132(d12) | `skills/release/SKILL.md:165-181` PASS | n/a |
| AC-6 | VERIFY: `bash tests/run-all.sh` passes; Suite 132 groups a/b/c intact + new group d check | `tests/test_agent_structure.py` s132(d5), s132(d6) + full suite run | Full suite green (3278/3278; run-all.sh all suites) PASS | n/a |
| AC-7 | VERIFY: `changelog.d/{pr-slug}.md` exists, no version bump; division of labor documented without duplicating managed-block sync | `tests/test_agent_structure.py` s132(d11) | `changelog.d/feat-release-apply-local-updates.md` + `skills/update/SKILL.md:540` + `docs/knowledge.md:164` PASS | n/a |
| AC-8 | VERIFY: `{X.Y.Z}` placeholders only, no hardcoded version literals; Suite 132 check count in `docs/testing.md` matches real `check()` count | `tests/test_agent_structure.py` s132(d10) | `docs/testing.md:597` reconciled to 28 checks PASS | n/a |
