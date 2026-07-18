# Acceptance Matrix: stage2-code-hygiene-gate

| AC | Description (1 line) | Test (file:line) | QA evidence (file:line) | Security |
|----|----------------------|------------------|--------------------------|----------|
| AC-1 | Work-narration comments on added lines report `file:line` and bounce the implementer under BOUNDED-PATCH (max-3 cap) | `tests/test_agent_structure.py` Suite 152 (`pattern-extraction`, `A1-content`, `pattern-fixture-bad-a/b`) PASS | `agents/orchestrator.md:664-681` PASS | n/a |
| AC-2 | Clean diff advances silently; verdict recorded only as structural trace event `stage2.hygiene` | Suite 152 (`event-orchestrator`, `event-observability`, `pattern-fixture-good`) PASS | `agents/orchestrator.md:674,680` PASS | n/a |
| AC-3 | `qa` validate mode produces `## Code Hygiene` auditing 5 categories + `code_hygiene: pass\|fail` field | Suite 152 (`B1-heading`, `B1-field`, `B1-audit-categories`) PASS | `agents/qa.md:399-437,549` PASS | n/a |
| AC-4 | `code_hygiene: fail` iterates the implementer (max-3) even when all AC pass | Suite 152 (`C1-phase3-gate`, `C2-phase35-reassert`, `C3-iteration-routing`, `anti-producer-absent`) PASS | `agents/orchestrator.md:734,770,797` PASS | n/a |
| AC-5 | Over-cap function WITH documented exception is not a finding — "explained or under cap", byte-consistent with `implementer.md` | Suite 152 (`byte-consistency`) PASS | `agents/implementer.md:311`, `agents/qa.md:414-415` PASS | n/a |
| AC-6 | Only comment content on ADDED lines evaluated; gate's own artifacts avoid embedding forbidden literals as contiguous strings | Suite 152 (`operational-definition`, `command-comment-safety`, `added-lines-only`, `comment-leader-filter`, `canonical-doc-section`, `pattern-fixture-bad-a/b`) PASS | `docs/code-hygiene-gate.md § 3.1` PASS (iteration 1 — self-inflicted hit found and fixed) | n/a |
| AC-7 | Every execution site (A1/A2/A3, producer B1, consumers C1/C2/C3) carries identical semantics; enumerated as separate site classes with positive+negative assertions | Suite 152 (`A1-*`, `A2-manifest`, `A3-*`, `B1-*`, `C1/C2/C3`, `anti-producer-absent`, `registry`) PASS | full site enumeration confirmed, `reviews/04-validation.md` PASS | n/a |
| AC-8 | Docs updated (canonical doc + cross-ref + testing registry), `changelog.d/` fragment written, NO plugin version bump | Suite 152 (`canonical-doc`, `canonical-doc-section` x5, `cross-ref`, `registry`) PASS | `docs/code-hygiene-gate.md`, `docs/code-comments.md:200-217`, `docs/testing.md:848-850` PASS; version bump confirmed absent by delivery (Step 9 skipped, `skip-version: true`) | n/a |

**security_sensitive: false** — no auth/api/db/crypto/session path touched; security agent correctly skipped at Phase 3.
