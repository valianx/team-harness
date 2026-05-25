---
description: Define acceptance criteria for a feature or task.
---

Analyze the input: $ARGUMENTS

---

## Mode 1 — Issue number or URL

1. Extract the issue number
2. **Detection + fallback:** see `agents/_shared/gh-fallback.md` § "Tier A — read a single issue". Use `gh issue view {number} --json number,title,body,labels` when `has_gh=true`; curl fallback otherwise.
3. If the issue cannot be fetched automatically, tell the user: "Issue #{number} could not be fetched automatically. Pasting the issue body as text also works — paste it below or paste the URL again."
4. Pass to the `orchestrator` agent:
   ```
   Direct Mode Task:
   - Mode: define-ac
   - Source: issue #{number}
   - Title: {title}
   - Labels: {labels}
   - Description: {body}
   ```

## Mode 2 — Text description

1. Pass to the `orchestrator` agent:
   ```
   Direct Mode Task:
   - Mode: define-ac
   - Source: text description
   - Title: {derived short title}
   - Description: {user's full text}
   ```

## Mode 3 — No input provided

Ask the user: "Provide a GitHub issue number or describe the feature to define acceptance criteria for."

---

## Important

- **You read issues. The orchestrator does NOT** — it receives the data from you.
- Always invoke the `orchestrator` agent — do NOT invoke agents directly
- The orchestrator will route to the `qa` agent in define-ac mode
- Output: acceptance criteria in Given/When/Then format
