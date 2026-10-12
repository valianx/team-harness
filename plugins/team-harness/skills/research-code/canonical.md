
# Code Research

Analyze the input: $ARGUMENTS

The current general agent coordinates, synthesizes and persists the work.
Preserve the selected absolute workspace and the operator's native permissions;
do not dispatch a nested orchestrator. Ask what to investigate only when the
request supplies no question or topic.

Inspect the current repo by default. With `--multi-repo <path1> <path2> ...`,
use the repo list as the outermost partition key: each code lane is scoped to
one repo, with explicitly named cross-repo seams as dedicated lanes.

Follow the [code research method](../../agents/ref-special-flows.md#research-code-flow).
Decompose into non-overlapping lanes only when the question benefits from it.
Use the host's native task/session dispatch for bounded parallel work; otherwise
inspect directly. Optional web evidence, consolidation or architect analysis
may help with external knowledge or several independent findings.

`researcher`, `code-researcher` and `research-consolidator` return evidence or
advisory synthesis through native transport without writing files, executing
shell commands, delegating or publishing. Main compares the evidence and saves
useful findings and conclusions as `{workspace}/research/00-research.md`. Retain file:line references, excerpts,
citations, confidence, conflicts, skipped lanes and failures. Include
`## Code vs Docs Conflicts` when code and external sources were both used.

Main decides whether a material gap blocks the requested answer and needs
follow-up. A specialist's gap recommendation does not trigger work. Amend the
same report when follow-up is needed or requested, and stop when the question
is answered; ordinary direct research needs no gap loop or event/state protocol.

## When to use `/th:research-code --multi-repo` vs `/th:cross-repo`

These two skills are DISTINCT and do NOT duplicate:

| | `/th:research-code` (this skill) | `/th:cross-repo` |
|--|----------------------------------|-----------------|
| **Question answered** | "What does this code actually do?" (evidence-gathering) | "Does this system obey its contracts/invariants?" (auditing) |
| **Route** | Current general agent coordinates and persists `{workspace}/research/00-research.md` | Standalone audit utility; uses native bounded dispatch when useful |
| **Output** | One `{workspace}/research/00-research.md` (hybrid code + web evidence, conflict detection) | Per-repo audit reports; `00-consolidated.md`; profile/contract validation |
| **Use when** | "How does the retry logic work across service A and service B?" | "Does service A honor the idempotency contract declared in the shared API profile?" |

Use `/th:research-code --multi-repo` to understand how code works across multiple repos.
Use `/th:cross-repo` to validate that a distributed system obeys declared contracts and invariants.
