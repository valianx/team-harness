Analyze the input: $ARGUMENTS

---

## Mode 1 — Topic or question provided

1. Pass to the `th-orchestrator` agent:
   ```
   Direct Mode Task:
   - Mode: research
   - Topic: {user's input}
   ```

## Mode 2 — No input provided

Ask the user: "What technology, library, or approach do you want to research? Example: 'zod vs yup for validation', 'monorepo strategies', 'server components with our stack'."

---

## Important

- Always invoke the `th-orchestrator` agent — do NOT invoke agents directly
- The th-orchestrator will route to the `architect` in research mode
- Output: `session-docs/{topic-slug}/00-research.md`
