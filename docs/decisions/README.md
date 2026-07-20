# Design Decision Logs

This directory contains permanent decision logs for architectural and design choices made during team-harness development.

Decision logs capture open questions that were resolved at the operator gate — questions where the architect proposed a default and the operator either accepted it or overrode it. The logs are committed here because the source workspaces are gitignored and would otherwise be lost.

## Index

- [gh-fallback Pattern (v2.10.0)](gh-fallback-pattern.md) — design choices for graceful degradation when `gh` CLI is absent. Covers Q-1 through Q-20: non-GitHub origins, wrong-account handling, token-based curl writes, `blocked-manual-push` autonomy behavior, test strategy, `agents/_shared/` directory design, review-policy schema, re-review automation, and multi-reviewer orchestration.
- [Adversary Resource Management (v2.132.1)](adversary-resource-management.md) — design choices for the `adversary` cost-reduction and trigger-tightening reform (issue #498). Covers Q-1 through Q-3: per-round report files vs `Edit`-append (read-only guarantee), `changes_security_control` producer (architect-declared vs computed vs security-declared), and the plan-level `design_confidence` OR-branch (implemented, reviewed, then reverted for wrong grain and an ungoverned self-reported signal).
