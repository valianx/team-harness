Analyze the input: $ARGUMENTS

---

## Parse flags

Before processing modes, check if the input contains flags:
- `--skip-version` → pass `skip-version: true` to the orchestrator payload. Remove the flag from the input before processing.
- `--skip-delivery` → pass `skip-delivery: true` to the orchestrator payload. Remove the flag. When set, the orchestrator runs the full pipeline (specify → design → implement → verify) but STOPS before delivery. Used in batch mode where delivery is consolidated.

---

## Mode 1 — Single issue number or URL (`#123`, `123`, URL)

1. Extract the issue number
2. **Detection + fallback:** see `agents/_shared/gh-fallback.md` § "Detection probe" and § "Tier A — read a single issue". Run the probe to set `has_gh`. When `has_gh=true`, use `gh issue view {number} --json number,title,body,labels,assignees,milestone,projectItems`. When `has_gh=false`, attempt the curl Tier A fallback. If both fail, prompt the operator to paste the issue body using the escape-hatch template.
3. If issue data cannot be obtained automatically, tell the user: "Issue #{number} could not be fetched automatically. Paste the issue body as text below, or paste the URL and re-run."
4. **Assess issue quality** before passing to orchestrator:
   - `needs-specify: true` — if the issue body is empty, has fewer than 3 lines, has no acceptance criteria, or is vague
   - `needs-specify: false` — if the issue already has structured AC (Given/When/Then or checkboxes) and clear scope
5. Pass ALL the issue data to the `orchestrator` agent:
   ```
   GitHub Issue Task:
   - Issue: #{number}
   - URL: {repo_url}/issues/{number}
   - Title: {title}
   - Labels: {labels}
   - Milestone: {milestone or "None"}
   - Description: {body}
   - Needs Specify: {true/false}
   - Quality Notes: {brief reason — e.g., "no AC defined", "body is empty", "has structured AC"}
   - skip-version: {true if --skip-version flag was passed, omit otherwise}
   - skip-delivery: {true if --skip-delivery flag was passed, omit otherwise}
   ```

---

## Mode 2 — Multiple issues (`#12 #13 #14`, `12, 13, 14`)

1. Extract all issue numbers from the input
2. **Detection + fallback:** same as Mode 1 — see `agents/_shared/gh-fallback.md` § "Tier A — read a single issue". Use `gh` when available; curl fallback otherwise. Apply per-issue.
3. If any issue fails to load (both `gh` and curl unavailable), report which ones failed and continue with the rest.
4. **Assess each issue's quality** before passing to orchestrator:
   - `needs-specify: true` — if the issue body is empty, has fewer than 3 lines, has no acceptance criteria, or is vague
   - `needs-specify: false` — if the issue already has structured AC (Given/When/Then or checkboxes) and clear scope
5. Pass ALL issues as a batch to the `orchestrator` agent:
   ```
   GitHub Issue Batch (N tasks):

   --- Task 1 ---
   - Issue: #{number}
   - URL: {repo_url}/issues/{number}
   - Title: {title}
   - Labels: {labels}
   - Description: {body}
   - Needs Specify: {true/false}
   - Quality Notes: {brief reason}

   --- Task 2 ---
   - Issue: #{number}
   ...
   ```
   The orchestrator will create `workspaces/batch-progress.md` to track all tasks.

---

## Mode 3 — Text description (not a number or URL)

1. Analyze the description to determine:
   - **Title**: short, imperative summary (max 70 chars)
   - **Label**: classify as one of: `bug`, `enhancement`, `feature`, `refactor`, `docs`, `security`
   - **Body**: structured with the template below

2. **Detection + fallback:** see `agents/_shared/gh-fallback.md` § "Tier B — create an issue". When `has_gh=true`, create with `gh issue create`. When `has_gh=false` and a token + GitHub origin are available, use the curl POST fallback. When neither is available, write the SDD body to `workspaces/{feature}/inputs/issue-create.md` and prompt the operator to paste it into GitHub, then reply with the new issue number.

   Create the issue with auto-label, auto-assign, and **SDD-compliant body**:
   ```
   gh issue create --title "{title}" --label "{label}" --assignee "@me" --body "$(cat <<'EOF'
   ## User Story
   As a {role}, I want {action}, so that {benefit}.

   ## Acceptance Criteria
   - [ ] **AC-1:** Given {context}, When {action}, Then {result}
   - [ ] **AC-2:** Given {context}, When {action}, Then {result}
   - [ ] **AC-3:** Given {context}, When {action}, Then {result}

   ## Scope
   **Included:** {what's in scope — derived from user input}
   **Excluded:** {what's explicitly out, or "N/A"}

   ## Technical Context
   - **Files:** {affected files/components, or "TBD by architect"}
   - **Patterns:** {existing patterns to follow, or "TBD by architect"}
   - **Constraints:** {technical limitations, or "none identified"}
   - **Dependencies:** {other issues or systems, or "none"}
   EOF
   )"
   ```

   **SDD rules:** min 2 AC, max 20. AC always in Given/When/Then with checkbox. Scope always explicit.

3. Read the created issue to get the full data. **Detection + fallback:** see `agents/_shared/gh-fallback.md` § "Tier A — read a single issue".
   ```
   gh issue view {number} --json number,title,body,labels,assignees,milestone,projectItems
   ```
4. Confirm the created issue number with the user
5. Pass the issue data to the `orchestrator` agent using the format from Mode 1

---

## Mode 4 — No input provided

Ask the user: "Provide a GitHub issue number (#123), multiple issues (#12 #13 #14), or a task description to create a new issue."

---

## Error Handling

- If `gh` is not available or not authenticated, use the graceful degradation paths in `agents/_shared/gh-fallback.md`: Tier A curl fallback for reads, Tier B for creates, escape hatch (local file + operator paste) when neither is available.
- If an issue number doesn't exist, report which one failed and ask if you should continue with the others (batch) or stop (single).
- If issue creation fails (no permission, no remote), report the error clearly — do not swallow it.

## Important

- **You read/create issues.** The orchestrator does NOT read issues — it receives the data from you.
- Always invoke the `orchestrator` agent to handle the task — do NOT execute the development pipeline yourself
- The orchestrator manages the full team: architect → implementer → tester → qa → delivery
- The orchestrator will handle project board updates (move to "In Progress", comment, move to "In Review") using the issue number you provide
