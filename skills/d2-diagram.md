Generate a diagram using the D2 declarative diagram language. Routes through the th-orchestrator which analyzes the codebase context, then generates a `.d2` source file and compiles it to SVG.

## Input

$ARGUMENTS — describe what to diagram. Examples:
- "the payment routing flow through the aggregator"
- "architecture of the microservices platform"
- "sequence diagram: how a login request flows through the system"
- "ER diagram of the main database tables"
- "class diagram of the User domain model"
- A topic without full description → the th-orchestrator infers what to visualize from the codebase

## What happens

1. Pass to the `th-orchestrator` agent:

```
Direct Mode Task: d2-diagram
Description: {$ARGUMENTS}
Skill path: .claude/skills/d2-diagram/
Output: session-docs/{feature}/diagram.d2
```

## Rules

- Always invoke the `th-orchestrator` agent — do NOT generate the diagram directly
- The th-orchestrator invokes the architect to analyze the codebase, then generates the `.d2` file following the skill methodology
- Validation is done via `d2 fmt` (syntax check) and `d2` CLI (compile to SVG)
- Output is a `.d2` file (D2 source) — human-readable, version-controllable, and re-renderable
- SVG export is done via `d2 diagram.d2 output.svg` — blocked if `d2` CLI is not installed
