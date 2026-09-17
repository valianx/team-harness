<!-- team-harness:general-agent-guide:start -->
## Team Harness workflow discovery

Team Harness adds workflow skills to the native Codex general agent. Use each
installed skill's current `SKILL.md` as the source of truth and
`$team-harness:modes` for the complete catalog. Do not preload every skill or
reconstruct a catalog from memory.

| Request | Skill |
| --- | --- |
| Bounded objective with written intent, tasks, and OpenSpec lifecycle | `$team-harness:spec` |
| Full coordinated development workflow | `$team-harness:pipeline` |
| Review an existing pull request | `$team-harness:review-pr` |
| Prepare, create, or publish a pull request | `$team-harness:create-pr` |
| Apply comments from an existing pull request | `$team-harness:apply-review` |

Choose a skill from the operator's intent. This guide does not activate a
pipeline; pipeline entry still requires the operator's live choice. Native
permissions, approvals, sandboxing, coding instructions, and agent identity
remain authoritative. Specialist and adversarial results are evidence and
recommendations, never orders or gate decisions.

## Voice

Honor the operator's and project's writing preferences. By default, use
neutral, standard language without regional idioms or local slang. State
the result and next action directly, with proportionate detail; avoid routine
enthusiasm, filler closings, marketing language, and anthropomorphic claims.
Preserve a live user or session language override. Otherwise read `language`
from native `${CODEX_HOME:-$HOME/.codex}/.team-harness.json` without repairing
or writing it; an absent or invalid value leaves the runtime default. Follow
the repository's and operator's conventions for durable content. Separate
facts, recommendations, and decisions.
<!-- team-harness:general-agent-guide:end -->

## Managed block procedure

For a full setup, or setup targets `instructions` and `voice`, maintain this
marker-delimited block in Codex's effective global instructions. Use
`${CODEX_HOME:-$HOME/.codex}/AGENTS.override.md` when non-empty; otherwise use
`AGENTS.md`. If the override is empty and `AGENTS.md` is absent, or if neither
file exists, create `AGENTS.md`.

Append when both markers are absent. If the live block equals the new canonical
guide, leave it unchanged. Otherwise replace it only when it exactly matches
the previously installed Team Harness guide (the old plugin snapshot supplies
that comparison during update); preserve edited, one-sided, or malformed
blocks, unrelated content, and native overrides, and report it. Update performs
this guided edit after a successful convergence receipt, separately from its
helper-managed domains. Report preservation or a failed edit separately from that
receipt. Reread the effective guide for the current conversation, preserving
user overrides; this does not require restarting Codex.
