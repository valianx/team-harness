---
description: Break a broad scope into parallel tasks with dispatch labels.
---

Analyze the input: $ARGUMENTS

---

## Step 0 — Detect intent

Before processing the input, determine if the user wants **plan only** or **plan + execute**:

- **`plan-and-execute`** — if the input contains keywords like: "implementar", "ejecutar", "implement", "execute", "build", "develop", "y ejecutar", "and implement", "full pipeline", "plan and build", "plan e implementar", "planificar y ejecutar"
- **`plan`** (default) — if none of the above keywords are present

Use the detected mode in the payload below. When in doubt, ask the user: "Do you want to just create the task breakdown (plan), or also implement each task (plan-and-execute)?"

---

## Mode 1 — Issue number or URL (`#123`, `123`, URL)

1. Extract the issue number
2. **Detection + fallback:** see `agents/_shared/gh-fallback.md` § "Detection probe" and § "Tier A — read a single issue". Use `gh issue view {number} --json number,title,body,labels,assignees,milestone,projectItems` when `has_gh=true`; curl fallback otherwise.
3. If the issue cannot be fetched automatically, tell the user: "Issue #{number} could not be fetched. Paste the issue body as text instead — planning works without GitHub."
4. **Assess issue quality** before passing to orchestrator:
   - `needs-specify: true` — if the issue body is empty, has fewer than 3 lines, has no acceptance criteria, or is vague
   - `needs-specify: false` — if the issue already has structured AC (Given/When/Then or checkboxes) and clear scope
5. Pass ALL the issue data to the `orchestrator` agent:
   ```
   Planning Task:
   - Mode: {plan | plan-and-execute}
   - Source: issue #{number}
   - Issue: #{number}
   - URL: {repo_url}/issues/{number}
   - Title: {title}
   - Labels: {labels}
   - Description: {body}
   - Needs Specify: {true/false}
   - Quality Notes: {brief reason — e.g., "no AC defined", "body is empty", "has structured AC"}
   ```

---

## Mode 2 — Text description (not a number or URL)

1. Do NOT create a GitHub issue — the input task is the source of the breakdown; issues are created at the end as a result.
2. Analyze the description to determine:
   - **Title**: short, imperative summary (max 70 chars)
3. Pass the task to the `orchestrator` agent:
   ```
   Planning Task:
   - Mode: {plan | plan-and-execute}
   - Source: text description
   - Title: {title}
   - Description: {user's full text}
   - Needs Specify: true
   - Quality Notes: "free-text input, needs full specify"
   ```

---

## Mode 3 — No input provided

Ask the user: "Provide a GitHub issue number (#123), a URL, or describe the problem you want to plan and break down into tasks."

---

## Error Handling

- **Mode 1:** When `gh` is unavailable, use the Tier A curl fallback from `agents/_shared/gh-fallback.md`. If both `gh` and curl fail, prompt the operator to paste the issue body as text — planning works without GitHub.
- **Mode 2 does NOT require `gh`**. Text input always works.
- If an issue number doesn't exist, report the error clearly.
- If any GitHub operation fails, report the error — do not swallow it.

## Important

- **You read issues. The orchestrator does NOT** — it receives the data from you.
- Always invoke the `orchestrator` agent — do NOT execute any pipeline yourself
- **Mode `plan`**: orchestrator runs SPECIFY → DESIGN (planning mode) → create tasks → stop
- **Mode `plan-and-execute`**: orchestrator runs SPECIFY → DESIGN (planning mode) → create tasks → then executes each task through the full pipeline
- **No GitHub? No problem.** The orchestrator will auto-detect `gh` availability. If unavailable, tasks are written as markdown files in `workspaces/{feature-name}/tasks/` instead of GitHub issues.
