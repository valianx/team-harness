---
name: research-code
description: Investigate a codebase — fan out multiple agents over real files and projects, with optional web lane mixing. Produces hybrid evidence (file:line grounded) plus code-vs-docs conflict detection.
---

Analyze the input: $ARGUMENTS

## Mode 1 — Topic or question provided

1. Pass to the `orchestrator` agent:
   ```
   Direct Mode Task:
   - Mode: research-code
   - Topic: {user's input}
   ```

## Mode 2 — No input provided

Ask the user: "What do you want to investigate in the codebase? Example: 'how does the retry logic work?', 'trace the research fan-out flow from the skill to the agents', 'how is error-handling implemented across the gateway and worker?'"

## Mode 3 — Cross-repo research (`--multi-repo <paths>`)

When the user passes `--multi-repo <path1> <path2> ...`:

1. Pass to the `orchestrator` agent:
   ```
   Direct Mode Task:
   - Mode: research-code
   - Topic: {user's question}
   - Repos: {list of paths}
   ```

The orchestrator uses the repo list as the outermost partition key — each code lane is scoped to one repo, with cross-repo seams as dedicated lanes.

## Important

- Route through the current coordinator so it can preserve the selected absolute
  workspace and the operator's native permissions.
- Decompose into non-overlapping code lanes only when the question is large
  enough to benefit from it. Optional web lanes and a consolidator are useful
  for external knowledge or several independent findings; neither is required
  for a simple code question.
- Use the host's native task/session dispatch for bounded parallel work. Do not
  require a particular shell, terminal multiplexer, model host, or permission
  bypass.
- Output: `{workspace}/research/00-research.md` with hybrid evidence and a
  `## Code vs Docs Conflicts` section when both code and external sources were used.
- A follow-up runs only when the operator names it or a material gap blocks the
  requested conclusion. Amend the same report and stop when the question is
  answered; do not create a gap loop or event/state protocol for ordinary direct
  research.

## When to use `/th:research-code --multi-repo` vs `/th:cross-repo`

These two skills are DISTINCT and do NOT duplicate:

| | `/th:research-code` (this skill) | `/th:cross-repo` |
|--|----------------------------------|-----------------|
| **Question answered** | "What does this code actually do?" (evidence-gathering) | "Does this system obey its contracts/invariants?" (auditing) |
| **Route** | Routes through the coordinator; produces one consolidated `{workspace}/research/00-research.md` | Standalone audit utility; uses native bounded dispatch when useful |
| **Output** | One `{workspace}/research/00-research.md` (hybrid code + web evidence, conflict detection) | Per-repo audit reports; `00-consolidated.md`; profile/contract validation |
| **Use when** | "How does the retry logic work across service A and service B?" | "Does service A honor the idempotency contract declared in the shared API profile?" |

Use `/th:research-code --multi-repo` to understand how code works across multiple repos.
Use `/th:cross-repo` to validate that a distributed system obeys declared contracts and invariants.
