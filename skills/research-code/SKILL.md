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

- Always invoke the `orchestrator` agent — do NOT invoke `code-researcher`, `researcher`, `research-consolidator`, or `architect` directly
- The orchestrator decomposes the question into non-overlapping code lanes (by subsystem/directory, by concern, or by question facet — first applicable strategy wins) and optionally mixes in up to 2 web lanes when external-knowledge context is useful
- Code lanes run on `code-researcher` (sonnet) — sonnet is required because haiku cannot reliably comprehend cross-file control flow and intent
- Web lanes run on `researcher` (haiku) — same as `/th:research`
- Output: `workspaces/{topic-slug}/research/00-research.md` with hybrid evidence and a `## Code vs Docs Conflicts` section
- The bounded gap-closure loop evaluates an extended gate: fires on `material AND (web_closeable OR code_closeable)`, dispatching web or code follow-up lanes per gap type, capped at 3 rounds and 5 lanes/round

## When to use `/th:research-code --multi-repo` vs `/th:cross-repo`

These two skills are DISTINCT and do NOT duplicate:

| | `/th:research-code` (this skill) | `/th:cross-repo` |
|--|----------------------------------|-----------------|
| **Question answered** | "What does this code actually do?" (evidence-gathering) | "Does this system obey its contracts/invariants?" (auditing) |
| **Route** | Routes through the orchestrator; produces one consolidated `research/00-research.md` | Standalone skill; does NOT route through orchestrator; uses tmux fan-out |
| **Output** | One `research/00-research.md` (hybrid code + web evidence, conflict detection, gap-closure loop) | Per-repo audit reports; `00-consolidated.md`; profile/contract validation |
| **Use when** | "How does the retry logic work across service A and service B?" | "Does service A honor the idempotency contract declared in the shared API profile?" |

Use `/th:research-code --multi-repo` to understand how code works across multiple repos.
Use `/th:cross-repo` to validate that a distributed system obeys declared contracts and invariants.
