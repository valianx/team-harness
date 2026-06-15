---
name: {scenario-name}
mode: {operating mode — e.g., "design", "research", "audit"}
difficulty: {easy|medium|hard}
needs_scaffold: false
---

# {Scenario Title}

A one-sentence description of what this scenario tests.

## Input

{The prompt or task to give the agent. Be specific — include the exact task
phrasing the operator would use. For scaffold scenarios, include the working
directory path.}

## Context

{Describe the mock environment the agent will operate in.

When needs_scaffold: false (default): write a prose description of the project
context; the agent receives this as text embedded in the prompt.

When needs_scaffold: true: define mock files using fenced file: blocks:

```file:CLAUDE.md
# Mock Project
## Architecture Decisions
- cursor-based pagination
```

Each file:{path} block creates that file relative to a temporary worktree.}

## Expected Behaviors

- {behavior 1 — what the agent SHOULD do. Start with a verb. Be specific enough
  to score: "reads CLAUDE.md before proposing a file structure" not "follows
  the project".}
- {behavior 2}
- {behavior 3}

## Anti-Patterns

- {anti-pattern 1 — what the agent must NOT do. Derive from the agent's NEVER
  statements where possible.}
- {anti-pattern 2}

## Output Criteria

- format: {expected output format — e.g., "## sections with headers matching the
  workspace doc template"}
- completeness: {which sections must be present in the output}
- actionability: {what makes the output useful vs generic — e.g., "includes
  specific file paths", "names a concrete trade-off"}

## Pass-Bar Declaration

The pass-bar is parsed by `/th:eval --spec` to set the threshold for this run.
Fill this section in before committing the scenario.

- minimum_pass_rate: {e.g., 4/5 — fraction of runs that must score PASS overall}
- failing_dimensions_allowed: {e.g., 0 on Critical Rules and NEVER Boundaries; 1 on others}
- rationale: {one sentence explaining why this threshold is appropriate for this
  agent and scenario — e.g., "architect outputs are structural so Critical Rules
  are a hard gate; Expected Behaviors allows one miss on edge-case items"}
