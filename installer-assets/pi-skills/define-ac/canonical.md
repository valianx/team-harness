
Analyze the input: $ARGUMENTS

---
name: define-ac

## Mode 1 — Issue number or URL

1. Extract the issue number
2. **Detection + fallback:** see `agents/_shared/gh-fallback.md` § "Tier A — read a single issue". Use `gh issue view {number} --json number,title,body,labels` when `has_gh=true`; curl fallback otherwise.
3. If the issue cannot be fetched automatically, tell the user: "Issue #{number} could not be fetched automatically. Pasting the issue body as text also works — paste it below or paste the URL again."
4. Ask Main to create or update a coordinator-only OpenSpec change:
   ```
   Direct Mode Task:
   - Mode: define-ac
   - Source: issue #{number}
   - Title: {title}
   - Labels: {labels}
   - Description: {body}
   ```

## Mode 2 — Text description

1. Ask Main to create or update a coordinator-only OpenSpec change:
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
name: define-ac

## Important

- **You read issues. Main does not refetch them** — pass the normalized source data.
- Do not invoke a specialist or activate the gated pipeline.
- Use the upstream OpenSpec propose/update workflow; canonical acceptance lives in delta specs.
- Output: the change path and concise Given/When/Then scenario summary.
