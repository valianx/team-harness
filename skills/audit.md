Analyze the input: $ARGUMENTS

---

## Mode 1 — Specific target

1. Parse the target: a directory, file, module, or system area to audit
2. Pass to the `th-orchestrator` agent:
   ```
   Direct Mode Task:
   - Mode: audit
   - Target: {target path or area}
   - Description: {user's full text}
   ```

## Mode 2 — Issue number or URL

1. Extract the issue number
2. Read the issue:
   ```
   gh issue view {number} --json number,title,body,labels
   ```
3. If the command fails, tell the user: "Issue #{number} not found or `gh` is not configured. Provide the target as text instead."
4. Pass to the `th-orchestrator` agent:
   ```
   Direct Mode Task:
   - Mode: audit
   - Source: issue #{number}
   - Title: {title}
   - Labels: {labels}
   - Description: {body}
   ```

## Mode 3 — No input provided

1. Detect the project root and pass:
   ```
   Direct Mode Task:
   - Mode: audit
   - Target: {project root}
   - Description: Full project architecture audit
   ```

---

## Important

- Always invoke the `th-orchestrator` agent — do NOT invoke agents directly
- The th-orchestrator will invoke the architect in audit mode
- Output: `session-docs/{feature-name}/00-audit.md`
- An audit reviews architecture health, not security (use `/security` for that)
