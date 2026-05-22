Create an Excalidraw diagram that visually argues a concept, workflow, or architecture. Routes through the th-orchestrator which delegates to the excalidraw-diagram skill.

## Input

$ARGUMENTS — describe what to diagram. Examples:
- "the dev-team pipeline flow"
- "authentication flow for the login system"
- "how the th-orchestrator delegates to agents"
- A topic without description → the th-orchestrator infers what to visualize

## What happens

1. Pass to the `th-orchestrator` agent:

```
Direct Mode Task: diagram
Description: {$ARGUMENTS}
Output: {path where .excalidraw file should be saved, or "ask the user"}
```

## Rules

- Always invoke the `th-orchestrator` agent — do NOT invoke the excalidraw-diagram skill directly
- The th-orchestrator will load the excalidraw-diagram skill context and generate the diagram
- The skill handles render validation (Playwright render loop) internally
- Output is a `.excalidraw` file (and optionally a PNG preview)
