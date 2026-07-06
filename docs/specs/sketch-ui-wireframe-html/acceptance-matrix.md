# Acceptance Matrix: sketch-ui-wireframe-html

| AC | Description (1 line) | Test (file:line) | QA evidence (file:line) | Security |
|----|----------------------|------------------|--------------------------|----------|
| AC-1 | `docs/plan-sketches.md` manifest reflects the `.html` exception + zero-dependency ceiling for the other 8 sketches | `tests/test_agent_structure.py:18677-18690` PASS | `docs/plan-sketches.md:39-47,108,127-131,144,174,221-226` PASS | n/a (security_sensitive: false) |
| AC-2 | `agents/architect.md` trigger table + skeleton emit `sketches/ui-wireframe.html` | `tests/test_agent_structure.py:18677-18690` PASS | `agents/architect.md:848,912-989` PASS | n/a |
| AC-3 | `hooks/sketch-guard.sh` `SKETCH_MAP` resolves `touches_ui` to `ui-wireframe.html` | `tests/test_sketch_guard.sh:189,275` PASS (21/21) | `hooks/sketch-guard.sh:50,275,343` PASS | n/a |
| AC-4 | Suite 82 (`tests/test_agent_structure.py`) flipped to `.html` + grep-safe negative assertions | `tests/test_agent_structure.py:18677-18690,18700,18777-18810,19166-19387` PASS (3428/3428) | same anchors PASS | n/a |
| AC-5 | `tests/test_sketch_guard.sh` fixtures updated to `.html` | `tests/test_sketch_guard.sh:189,275` PASS (21/21) | same anchors PASS | n/a |
| AC-6 | Closing grep: 0 residual hits of the retired ui-wireframe markdown filename; consumers generalize glob to `sketches/*` | grep `ui-wireframe\.md` across agents/ skills/ hooks/ docs/ tests/ → 0 hits | `reviews/04-validation.md` AC-6 row PASS (10 consumers confirmed) | n/a |
| AC-7 | `agents/orchestrator.md` workspace inventory + `*.html` frontmatter-injection exclusion | `tests/test_agent_structure.py` (structural) PASS | `agents/orchestrator.md:224,296` PASS | n/a |
| AC-8 | Skeleton HTML is script-free and network-free | grep `<script>`/`http://`/`https://`/`cdn\.` over `agents/architect.md` skeleton → 0 real external refs | `agents/architect.md:912-989` PASS | n/a |
| AC-9 | `changelog.d/` fragment + `docs/knowledge.md` bullet written; version untouched (skip-version) | n/a (doc-only) | `changelog.d/feat-sketch-ui-wireframe-html.md`, `docs/knowledge.md:167`, `.claude-plugin/plugin.json:4` (unchanged) PASS | n/a |

**Overall:** 9/9 PASS (`reviews/04-validation.md`). Security review skipped (`security_sensitive: false`, classification block all-false). Acceptance-checker (Phase 3.6) verdict: pass — no drift, deviation assessed as stricter AC-6 application.
