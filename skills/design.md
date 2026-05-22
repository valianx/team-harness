Analyze the input: $ARGUMENTS

---

## Mode 1 — Issue number or URL

1. Extract the issue number
2. **Detection + fallback:** see `agents/_shared/gh-fallback.md` § "Tier A — read a single issue". Use `gh issue view {number} --json number,title,body,labels` when `has_gh=true`; curl fallback otherwise.
3. If the issue cannot be fetched automatically, tell the user: "Issue #{number} could not be fetched automatically. Pasting the issue body as text also works — paste it below or paste the URL again."
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
