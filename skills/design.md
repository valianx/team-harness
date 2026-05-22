Analyze the input: $ARGUMENTS

---

## Mode 1 — Issue number or URL

1. Extract the issue number
2. Read the issue:
   ```
   gh issue view {number} --json number,title,body,labels
   ```
3. If the command fails, tell the user: "Issue #{number} not found or `gh` is not configured. Provide the feature as text instead."
4. Pass to the `th-orchestrator` agent:
   ```
   Direct Mode Task:
   - Mode: design
   - Source: issue #{number}
   - Title: {title}
   - Labels: {labels}
   - Description: {body}
   ```

## Mode 2 — Text description

1. Pass to the `th-orchestrator` agent:
   ```
   Direct Mode Task:
   - Mode: design
   - Source: text description
   - Title: {derived short title}
   - Description: {user's full text}
   ```

## Mode 3 — No input provided

Ask the user: "Provide a GitHub issue number or describe the feature to design."

---

## Important

- **You read issues. The th-orchestrator does NOT** — it receives the data from you.
- Always invoke the `th-orchestrator` agent — do NOT invoke agents directly
- The th-orchestrator will run Intake + Specify + Design, then stop
- Output: `session-docs/{feature-name}/01-architecture.md`
