---
name: audit
description: Analyze codebase architecture, health, and technical debt.
---

Analyze the input: $ARGUMENTS

---
name: audit

## Mode 1 — Specific target

1. Parse the target: a directory, file, module, or system area to audit
2. Pass to the `orchestrator` agent:
   ```
   Direct Mode Task:
   - Mode: audit
   - Target: {target path or area}
   - Description: {user's full text}
   ```

## Mode 2 — Issue number or URL

1. Extract the issue number
2. **Detection + fallback:** see `agents/_shared/gh-fallback.md` § "Tier A — read a single issue". Use `gh issue view {number} --json number,title,body,labels` when `has_gh=true`; curl fallback otherwise.
3. If the issue cannot be fetched automatically, tell the user: "Issue #{number} could not be fetched automatically. Pasting the issue body as text also works — paste it below or paste the URL again."
4. Pass to the `orchestrator` agent:
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
name: audit

## Important

- Always invoke the `orchestrator` agent — do NOT invoke agents directly
- The orchestrator will invoke the architect in audit mode
- Output: `workspaces/{feature-name}/research/00-audit.md`
- An audit reviews architecture health, not security (use `/th:security` for that)
