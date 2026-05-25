---
description: Investigate a technology, migration, or approach.
---

Analyze the input: $ARGUMENTS

---

## Mode 1 — Topic or question provided

1. Pass to the `orchestrator` agent:
   ```
   Direct Mode Task:
   - Mode: research
   - Topic: {user's input}
   ```

## Mode 2 — No input provided

Ask the user: "What technology, library, or approach do you want to research? Example: 'zod vs yup for validation', 'monorepo strategies', 'server components with our stack'."

---

## Important

- Always invoke the `orchestrator` agent — do NOT invoke agents directly
- The orchestrator will route to the `architect` in research mode
- Output: `workspaces/{topic-slug}/00-research.md`
