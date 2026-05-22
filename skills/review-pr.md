Analyze the input: $ARGUMENTS

---

## Mode 1 — PR number or URL provided

### Phase 1 — Gather (all Bash happens here, in the main context)

1. Extract the PR number from the input (e.g., `#45`, `45`, or full URL)

2. Fetch PR metadata (1 Bash call). **Detection + fallback:** see `agents/_shared/gh-fallback.md` § "Detection probe" and § "Tier A — read a single PR". Run the probe to set `has_gh`. When `has_gh=true`: `gh pr view {number} --json number,title,body,author,baseRefName,headRefName,additions,deletions,changedFiles,url,files`. When `has_gh=false`: use the curl Tier A fallback. If both fail: prompt the operator to paste the PR diff manually (the `git diff origin/{base}...origin/{head}` path below still works when branches are locally available).

3. Detect linked issue: search PR body for patterns like `Closes #N`, `Fixes #N`, `Resolves #N`
   - If found: fetch issue data. **Detection + fallback:** see `agents/_shared/gh-fallback.md` § "Tier A — read a single issue". When `has_gh=true`: `gh issue view {N} --json number,title,body,labels`. When `has_gh=false`: use the curl fallback; if unavailable, linked issue = "none" (best-effort).
   - If not found: linked issue = "none"

4. Fetch branches (1 Bash call):
   ```
   git fetch origin {baseRefName} {headRefName}
   ```

5. Get the diff and file list (1 Bash call — combine both):
   ```
   git diff origin/{baseRefName}...origin/{headRefName}
   ```
   Save the full diff output. If it exceeds ~3000 lines, keep only the first 2000 lines and append a note: `\n[DIFF TRUNCATED — {total} lines total, showing first 2000. Use Read tool for full file context.]`

6. Get changed file list (1 Bash call):
   ```
   git diff --name-only origin/{baseRefName}...origin/{headRefName}
   ```

### Step 1.5 — Load review policy (1 Read call, optional)

```bash
if [ -f .team-harness/review-policy.md ]; then
  review_policy=$(cat .team-harness/review-policy.md)
  has_policy=true
else
  has_policy=false
fi
```

When `has_policy=false`, emit one line to the operator:
```
Review policy: not found (using general review judgement).
Scaffold with: /init --scaffold-review-policy
```

### Phase 2 — Review (zero Bash, delegated to th-orchestrator)

7. Pass ALL gathered data to the `th-orchestrator` agent:
   ```
   Direct Mode Task:
   - Mode: review
   - PR: #{number}
   - Title: {title}
   - Author: {author.login}
   - Base: {baseRefName}
   - Head: {headRefName}
   - Additions: +{additions}
   - Deletions: -{deletions}
   - Changed Files Count: {changedFiles count}
   - URL: {url}
   - Body: {body}
   - Linked Issue: #{issue_number} or "none"
   - Issue Title: {issue_title} or "N/A"
   - Issue Body: {issue_body} or "N/A"
   - Issue Labels: {labels} or "N/A"
   - Changed Files List:
     {file list from step 6}
   - Full Diff:
     {diff output from step 5}
   - Has Policy: {true if .team-harness/review-policy.md was found in Step 1.5, else false}
   - Review Policy: {verbatim content of .team-harness/review-policy.md, or omit field when has_policy=false}
   ```

8. The th-orchestrator invokes the reviewer with all data inline (zero Bash in sub-agent), builds the draft, and writes it to `.claude/pr-review-draft.md`. If the reviewer found critical findings, the th-orchestrator also writes `.claude/pr-review-inline.json` with the inline comments array. The th-orchestrator returns with the decision (APPROVE or CHANGES_REQUESTED) and the event type.

### Phase 3 — Publish (Bash in main context)

9. **Verify the draft exists.** Check that `.claude/pr-review-draft.md` was created and is not empty. If it's missing or empty:
   - Tell the user: "The th-orchestrator did not produce the review draft. Retrying once."
   - Re-invoke the th-orchestrator with the same data (go back to step 7)
   - If it fails a second time, report the error and stop

10. Read `.claude/pr-review-draft.md` and display the full review draft to the user.

11. Ask the user: "Review draft ready. Approve to publish, or describe the changes needed."

12. **Prior review check (MANDATORY before publishing).** Before submitting, check for an existing review from the same author on this PR. **Detection + fallback:** see `agents/_shared/gh-fallback.md` § "Tier A — read prior PR reviews". When `has_gh=true`:
    ```
    gh api repos/{owner}/{repo}/pulls/{number}/reviews --jq '.[] | select(.user.login == "{current_user}") | {id: .id, state: .state, submitted_at: .submitted_at, body: .body[:120]}'
    ```
    Replace `{current_user}` with the output of `gh api user --jq '.login'`. When `has_gh=false`: use the curl fallback to fetch the reviews list. If unavailable, default to treating as "no prior review" (worst case is a duplicate review, recoverable via dismiss).

    - **If NO prior review exists** from the same author → proceed to step 13 (normal fresh review flow).

    - **If a prior review exists**, present this menu to the user:
      ```
      A prior review by this author exists on this PR (ID: {review_id}, date: {submitted_at}, state: {state}).
      GitHub does not allow adding inline comments to an already-submitted review. Three options:

      (a) Update the summary only — PUT review body (prior inline comments preserved)
      (b) Reply to an existing thread — reply to one of the prior inline comments
      (c) Re-review cycle — dismiss the prior review and create a new atomic one (code changed)
      (d) Cancel

      Which option?
      ```
      Route to the corresponding substep below based on user choice.

    ### Step 12a — Update summary only

    1. Re-invoke the th-orchestrator with the same PR data but with mode `update-body`:
       ```
       Direct Mode Task:
       - Mode: review
       - Submode: update-body
       - PR: #{number}
       - {... same fields as step 7 ...}
       - Existing review ID: {review_id}
       - Existing review body: {current body text}
       - Instruction: Generate an updated summary incorporating any new observations.
       ```
    2. The th-orchestrator invokes the reviewer in `update-body` mode and writes the new body to `.claude/pr-review-draft.md`.
    3. Read `.claude/pr-review-draft.md` and show to the user for approval.
    4. On approval, publish with PUT. **Detection + fallback:** see `agents/_shared/gh-fallback.md` § "Tier B — write that needs auth". When `has_gh=true`: use `gh api -X PUT`. When `has_gh=false` and a token is available: use `curl -X PUT`. When neither is available: instruct the operator to run the curl command with their token.
       ```bash
       jq -n --arg body "$(cat .claude/pr-review-draft.md)" '{body: $body}' \
       | gh api -X PUT repos/{owner}/{repo}/pulls/{number}/reviews/{review_id} --input -
       ```
    5. Verify success, cleanup `.claude/pr-review-draft.md`, and STOP.

    ### Step 12b — Reply to existing thread

    1. List the existing inline comments on this PR:
       ```
       gh api repos/{owner}/{repo}/pulls/{number}/comments --jq '.[] | select(.pull_request_review_id == {review_id}) | {id: .id, path: .path, line: .line, body: .body[:120]}'
       ```
       If no inline comments exist, tell the user: "The prior review has no inline comments to reply to. Use option (a) to update the summary instead." Then re-show the menu.
    2. Display the list and ask the user to select a `comment_id`.
    3. Re-invoke the th-orchestrator with mode `reply`:
       ```
       Direct Mode Task:
       - Mode: review
       - Submode: reply
       - PR: #{number}
       - {... same fields as step 7 ...}
       - Thread context:
         - comment_id: {selected_id}
         - path: {file path}
         - line: {line number}
         - original_body: {the inline comment text}
       - Instruction: Generate a focused reply to this thread.
       ```
    4. The th-orchestrator invokes the reviewer in `reply` mode and writes the reply to `.claude/pr-review-reply-draft.md`.
    5. Read `.claude/pr-review-reply-draft.md` and show to the user for approval.
    6. On approval, publish the reply. **Detection + fallback:** Tier B — same pattern as step 12a. Use `gh api` when available, curl fallback when token present, operator instruction otherwise.
       ```bash
       jq -n --arg body "$(cat .claude/pr-review-reply-draft.md)" '{body: $body}' \
       | gh api -X POST repos/{owner}/{repo}/pulls/{number}/comments/{comment_id}/replies --input -
       ```
    7. Verify success, cleanup `.claude/pr-review-reply-draft.md`, and STOP.

    ### Step 12c — Dismiss and re-review

    1. Dismiss the existing review. **Detection + fallback:** Tier B — use `gh api -X PUT` when available, curl PATCH fallback with token, or operator instruction.
       ```
       gh api -X PUT repos/{owner}/{repo}/pulls/{number}/reviews/{review_id}/dismissals -f message="Superseded by new review"
       ```
    2. Verify the dismiss succeeded. If it fails, report the error and STOP.
    3. Proceed to step 13 (normal fresh review flow with atomic submission).

    ### Step 12d — Cancel

    Delete `.claude/pr-review-draft.md` and `.claude/pr-review-inline.json` (if they exist) and STOP. Do NOT publish anything.

13. Based on user response:
    - **User approves**: publish using **atomic submission** — a single API call with body + event + inline comments:

      a. Read the review body from `.claude/pr-review-draft.md`.
      b. Read inline findings from `.claude/pr-review-inline.json` (if it exists). Format: `[{"path": "...", "line": N, "body": "..."}]`. If the file doesn't exist or is empty, use an empty array `[]`.
      c. Determine the event. Use the th-orchestrator's decision (user can override):
         - 0 criticals → `APPROVE`
         - 1+ criticals → `REQUEST_CHANGES`
         - User override → whatever the user says
      d. Construct the JSON payload and submit in a **single atomic call**. **Detection + fallback:** see `agents/_shared/gh-fallback.md` § "Tier B — submit a PR review (atomic POST)". The body+event+comments payload is saved to `.claude/pr-review-payload.json` regardless of whether `gh` or curl is used — this is the atomic submission model:
         ```bash
         jq -n \
           --arg body "$(cat .claude/pr-review-draft.md)" \
           --arg event "APPROVE" \
           --argjson comments "$(cat .claude/pr-review-inline.json 2>/dev/null || echo '[]')" \
           '{body: $body, event: $event, comments: $comments}' \
         | gh api -X POST repos/{owner}/{repo}/pulls/{number}/reviews --input -
         ```
         Replace `{owner}/{repo}` with the repo from the PR URL, `{number}` with the PR number, and `"APPROVE"` with the actual event.
      e. **NEVER use `gh pr review`** for publishing. NEVER post separate inline comments via `gh api repos/.../pulls/:n/comments`. The single `POST /repos/:o/:r/pulls/:n/reviews` call with `body` + `event` + `comments[]` is the ONLY allowed submission method — this atomicity constraint applies to both the `gh` and curl paths.

    - **User requests edits**: modify the draft per feedback, show again, repeat until approved.

14. **Verify the review was posted.** After the `gh api POST .../reviews` (or curl equivalent) call, check the exit code. If it failed, report the error to the user with the exact error message.

15. **Cleanup, prune context, and STOP.**

    **15.1 — File cleanup.** Delete `.claude/pr-review-draft.md` and `.claude/pr-review-inline.json` (if it exists) after successful publishing.

    **15.2 — Context prune reminder (MANDATORY).** Each `/review-pr` invocation accumulates 5-30K tokens in the main context (PR metadata, full diff, file lists from `gh` and `git` outputs in Phase 1, plus the th-orchestrator's status block, plus Phase 3 publish outputs). Subagents die between PRs but the **main context does not** — successive reviews in the same session compound linearly.

    Your **final response** to the user MUST include this reminder block (verbatim or equivalent — do NOT shorten it, do NOT phrase it as optional):

    ```
    Review on PR #{number} published.

    Context cleanup (recommended)
    This review accumulated approximately {estimated_kb}K tokens in
    your session (PR data, diff, file lists). Before reviewing the
    next PR, run:

        /compact

    Without this, each successive `/review-pr` adds another 5-30K
    tokens that never get released. After 5 or more reviews in one
    session, response latency and per-turn cost grow noticeably.

    If this is the last review of the session, no action is needed —
    close the session normally.
    ```

    Estimate `{estimated_kb}` from the size of the diff you handled in Phase 1: small PR (<100 changed lines) ≈ 5K, medium (100-500) ≈ 10K, large (500-2000) ≈ 20K, truncated (>2000) ≈ 30K.

    **15.3 — Terminate.** Do NOT perform any additional actions after step 15.2 — no second pass for inline comments, no follow-up reviews, no supplementary observations. The review is complete.

---

## Mode 2 — No input provided

Ask the user: "Provide a PR number or URL to review. Example: `#45`, `45`, or `https://github.com/owner/repo/pull/45`."

---

## Important

- Always invoke the `th-orchestrator` agent — do NOT invoke agents directly
- The th-orchestrator coordinates: reviewer (analysis with pre-fetched data) → draft → return to skill
- ALL Bash commands run in this skill (main context) — the th-orchestrator and reviewer do ZERO Bash
- The user approves the review before publishing (Phase 3)
- **ONE review per author per PR.** A fresh review is created only when no prior review exists (step 13) or after an explicit dismiss (step 12c). NEVER publish a second review without dismissing first. After-the-fact additions use PUT body (step 12a) or reply to thread (step 12b) — these do NOT create new reviews.
- **Atomic submission for fresh reviews.** The `gh api POST .../reviews` call (step 13) includes body + event + comments[] in a single call. NEVER split into `gh pr review` + separate `gh api pulls/:n/comments`.
- **GitHub API model:** A submitted review is an immutable container for inline comments. You cannot add inline comments to an existing review. To add context: PUT body, reply to thread, or dismiss+re-review.
