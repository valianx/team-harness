Analyze the input: $ARGUMENTS

---

## Mode 1 — Feature name provided

1. Pass to the `th-orchestrator` agent:
   ```
   Direct Mode Task:
   - Mode: validate
   - Feature: {feature-name}
   ```

## Mode 2 — No input provided

1. Look for active `session-docs/*/` folders that contain `02-implementation.md`
2. If exactly one found, use its feature name
3. If multiple found, ask the user: "Multiple features found in session-docs. Which one do you want to validate? {list}"
4. If none found, tell the user: "No implementation found in session-docs/. Implement first or provide a feature name."

---

## Important

- Always invoke the `th-orchestrator` agent — do NOT invoke agents directly
- The th-orchestrator will route to the `qa` agent in validate mode
- Validates implementation against acceptance criteria from `00-task-intake.md`
- Output: `session-docs/{feature-name}/04-validation.md`
