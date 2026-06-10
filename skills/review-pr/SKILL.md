---
name: review-pr
description: Review a pull request on GitHub.
---

Analyze the input: $ARGUMENTS

---
name: review-pr

## Flag parsing (run before all modes)

Before routing to a mode, parse optional flags from `$ARGUMENTS`:

- `--multi` → set `multi_reviewer=true`, `focuses=["security","architecture","style"]`.
- `--reviewers <focus1[,focus2,...]>` → set `multi_reviewer=true`, `focuses` to the comma-separated list (e.g., `security,architecture` → `["security","architecture"]`).
- `[TIER: N]` (in the PR number / arguments) → set `tier_override=N` (0–4). Takes precedence over auto-classification.
- `--resume-from-draft` → skip Phases 1–3, go directly to Phase 4 using `.claude/pr-review-final.md` (or `.claude/pr-review-draft.md`).
- `--auto-publish` → opt-in flag that skips the Phase 4 preview-and-confirm gate. The operator explicitly authorises publish without seeing the draft first. **Default (without this flag): preview is mandatory** — Phase 4 always shows the full draft and waits for an explicit operator selection before Phase 5 publishes. Set `auto_publish=true` when this flag is present, `auto_publish=false` otherwise.

**Publish gate alignment (`ref-direct-modes.md § Publish Gate`):** This skill implements the canonical publish gate at Phase 4 (decision menu = preview-and-confirm). The `--auto-publish` flag satisfies the opt-in contract defined in that gate. When `auto_publish=true`, Phase 4 is skipped and Phase 5 executes immediately after Phase 3 completes; the operator's explicit `--auto-publish` declaration is the approval. When `auto_publish=false` (the default), Phase 4 MUST show the full draft and wait for an explicit choice before Phase 5.

Remove parsed flags from the PR number/URL before processing. Remaining input is the PR number or URL.

**Constants (tunable here):**
```
AUTO_MULTI_LINES_THRESHOLD = 1500
AUTO_MULTI_FILES_THRESHOLD = 8
DEFAULT_FOCUSES = ["security", "architecture", "style"]
```

---
name: review-pr

## Prerequisite probe — sketch-guard check (mid-pipeline entry)

When entering mid-pipeline (i.e., a workspace folder for this feature already exists in `workspaces/`), run `hooks/sketch-guard.sh` as a best-effort prerequisite probe before proceeding to Phase 1. This surfaces any missing sketch artifacts to the operator before the review begins.

```bash
# Locate the workspace for this feature (if a local workspace exists)
# WORKSPACE_PATH = resolved docs_root for the feature (from 00-state.md if present)
bash hooks/sketch-guard.sh "${WORKSPACE_PATH}" 2>/dev/null
```

Parse the JSON output. If `verdict: concerns`, show a one-line banner before Phase 1:
```
Note: sketch-guard found concerns for this workspace — {concerns[0]}. Proceeding with review.
```

**Fail-open:** if `sketch-guard.sh` is absent, exits non-zero, or the workspace cannot be located, skip this probe silently and continue. The probe is informational only — it never blocks the review flow.

---
name: review-pr

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

7. **Create temporary worktree at the PR's head SHA** so all review agents read file contents that match what they're reviewing — not the operator's current checkout state:
   ```sh
   # Determine repo root
   REPO_ROOT=$(git rev-parse --show-toplevel)
   WORKTREE="${TMPDIR:-/tmp}/team-harness-pr-review-{N}"
   git worktree add "$WORKTREE" origin/{headRefName}
   ```
   Where `{N}` is the PR number. Store `$WORKTREE` for passing to agents and for cleanup in Phase 5.

   **Multi-PR safety:** the worktree name includes the PR number (`{N}`) — no conflicts when reviewing multiple PRs concurrently in the same session.

   **Cleanup trap (declare immediately after worktree creation):**
   ```sh
   cleanup() {
     git worktree remove "$WORKTREE" --force 2>/dev/null || true
     rm -f .claude/pr-review-*.md .claude/pr-review-*.json 2>/dev/null || true
   }
   trap cleanup EXIT
   ```

8. **Detect workspaces** (team-harness pipeline PRs carry AC):
   ```sh
   workspaces_PATH=""
   if ls "$WORKTREE/workspaces/"*/01-architecture.md 2>/dev/null | head -1 | grep -q .; then
     workspaces_PATH=$(ls "$WORKTREE/workspaces/"*/01-architecture.md 2>/dev/null | head -1 | xargs dirname)
   elif ls "$WORKTREE/workspaces/"*/02-task-list.md 2>/dev/null | head -1 | grep -q .; then
     workspaces_PATH=$(ls "$WORKTREE/workspaces/"*/02-task-list.md 2>/dev/null | head -1 | xargs dirname)
   fi
   has_workspaces=false
   [ -n "$workspaces_PATH" ] && has_workspaces=true
   ```
   Pass `workspaces_PATH` to qa when dispatched.

9. **Fetch PR conversation as review context** (best-effort INPUT step — never blocks the review).

   **Detection + fallback:** see `agents/_shared/gh-fallback.md` § "Tier A — read PR comments". Run the probe (already set in step 2). Collect issue-level comments and line-level review comments separately:

   ```bash
   pr_comments=""
   if [ "$has_gh" = "true" ]; then
     issue_comments=$(gh pr view {number} --comments --json comments -q '.comments[] | "[\(.author.login)] \(.body)"' 2>/dev/null || true)
     line_comments=$(gh api repos/{owner}/{repo}/pulls/{number}/comments --jq '.[] | "[line:\(.path):\(.line // "??")] \(.user.login): \(.body)"' 2>/dev/null || true)
     pr_comments="${issue_comments}"$'\n'"${line_comments}"
   elif [ "$is_github" = "true" ]; then
     auth_header=""
     token="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
     [ -n "$token" ] && auth_header="-H \"Authorization: Bearer $token\""
     issue_comments=$(curl -sf $auth_header \
       -H "Accept: application/vnd.github+json" \
       "https://api.github.com/repos/{owner}/{repo}/issues/{number}/comments?per_page=100" \
       2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print('\n'.join(f'[{c[\"user\"][\"login\"]}] {c[\"body\"]}' for c in d))" 2>/dev/null || true)
     line_comments=$(curl -sf $auth_header \
       -H "Accept: application/vnd.github+json" \
       "https://api.github.com/repos/{owner}/{repo}/pulls/{number}/comments?per_page=100" \
       2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print('\n'.join(f'[line:{c[\"path\"]}:{c.get(\"line\",\"??\")}] {c[\"user\"][\"login\"]}: {c[\"body\"]}' for c in d))" 2>/dev/null || true)
     pr_comments="${issue_comments}"$'\n'"${line_comments}"
   fi

   # Degrade gracefully when gh/token unavailable
   if [ -z "$pr_comments" ]; then
     echo "Comments not fetched — gh unavailable. Review proceeds without prior conversation context."
     pr_comments="(none — comments not fetched: gh unavailable)"
   fi
   ```

   Truncate if the combined output exceeds ~200 lines: keep most recent 100 lines with a truncation note prepended.
   Store result in `$pr_comments` and pass it to Phase 3 dispatcher as the `PR Comments:` field.

### Step 1.4 — Auto-suggest multi-reviewer for large PRs (no cost warning per operator policy)

After step 8, compute diff size:

```bash
diff_lines=$((additions + deletions))
diff_files=$(git diff --name-only origin/{baseRefName}...origin/{headRefName} | wc -l)
```

If `multi_reviewer=false` AND (`diff_lines > AUTO_MULTI_LINES_THRESHOLD` OR `diff_files > AUTO_MULTI_FILES_THRESHOLD`):

Emit ONE line of info to the operator (no prompt, no cost warning, no confirmation required):
```
Large PR detected ({diff_lines} lines, {diff_files} files). Running multi-reviewer (security + architecture + style).
```

Then set `multi_reviewer=true`, `focuses=DEFAULT_FOCUSES` and continue.

If `multi_reviewer=true` and `--reviewers` specified only ONE focus, bypass the consolidator: rename the single focus draft to the canonical path and skip the consolidator step.

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
Scaffold with: /th:bootstrap --scaffold-review-policy
```

### Step 1.6 — Behavioral Verification (best-effort, worktree)

After loading the review policy and before tier classification, run the repo's existing test/build suite against the PR's head SHA in `$WORKTREE`. This step is best-effort — it degrades to skip on any error or missing command; it never blocks the review and never publishes anything.

**Trust-tier gate (MANDATORY — run first):**

```bash
is_cross_repo=$(gh pr view {number} --json isCrossRepository --jq '.isCrossRepository')
```

- If `is_cross_repo == "true"` (fork/external PR — author does not have push access to the base repo): **SKIP** the behavioral verification entirely. Emit one note to the operator:
  ```
  Behavioral verification omitida — PR de fork (isCrossRepository: true). Ejecutar la suite en código de fork no confiable ejecutaría código del autor del PR en tu máquina. El operador puede correr la suite manualmente fuera de esta herramienta.
  ```
  Set `behavioral_result=skipped:fork` and proceed to Phase 2.

- If `is_cross_repo == "false"` (same-repo PR — author has push access, trusted): proceed with the auto-run below.

**Same-repo auto-run (only when `is_cross_repo == "false"`):**

The step runs ONLY suites/builds already declared in the repo. It does NOT install new dependencies, does NOT run ad-hoc scripts derived from PR content, and does NOT execute commands not declared in the repo's own config files.

```bash
cd "$WORKTREE"

runnable_cmd=""
if [ -f go.mod ]; then
  runnable_cmd="go test ./..."
elif [ -f package.json ] && grep -q '"test"' package.json; then
  runnable_cmd="npm test"
elif command -v pytest >/dev/null 2>&1 && find . -name '*_test.py' -o -name 'test_*.py' | head -1 | grep -q .; then
  runnable_cmd="pytest"
fi

if [ -z "$runnable_cmd" ]; then
  behavioral_result=skipped:no-command
else
  if timeout 120 sh -c "$runnable_cmd" > /tmp/behavioral-run.log 2>&1; then
    behavioral_result=green
  else
    behavioral_result=red
  fi
fi
```

Detection order (first match wins): Go (`go.mod` present → `go test ./...`), Node (`package.json` with "test" script → `npm test`), Python (pytest available + test files → `pytest`). Any other setup → `skipped:no-command`.

**Surface result in the review body** (add a `Verificación behavioral` subsection to `review_body`):

| Result | Meaning | Body note |
|--------|---------|-----------|
| `green` | All tests pass at head SHA | "Suite existente: verde en head SHA — señal de confianza." |
| `red` | Tests fail at head SHA | Diff the failures: check if the failures also exist in the base branch. Newly-red (pass on base, fail on head): IN SCOPE — may be CRITICAL if the change caused the regression. Pre-existing red (also fail on base): OUT OF SCOPE — note as `## Fuera de alcance`. |
| `skipped:no-command` | No runnable suite found | "Sin suite runnable detectada — verificación behavioral omitida." |
| `skipped:fork` | Fork PR — execution skipped | (Already emitted above; include in body as note.) |

**Constraints:**
- This step does NOT publish to GitHub. Results are added to `review_body` that the skill delivers after operator approval (Phase 4).
- Do NOT install packages, run `npm install`, `go mod download`, or any setup command not already satisfied in the worktree.
- Do NOT run commands not declared in the repo's own build/test config (no ad-hoc shell commands derived from PR body or commit messages).
- Timeout of 120 seconds is a hard cap; if exceeded, treat as `skipped:timeout` and note it.
- If `gh pr view` fails (no GitHub access), set `is_cross_repo=unknown`, skip the behavioral step entirely, and note it.

### Phase 2 — Tier Classification

Classify the PR's tier based on the changed file list. Use `tier_override` if set (from `[TIER: N]` in arguments).

**Tier rules (first matching condition wins; highest signal escalates):**

| Tier | Condition | Agents dispatched |
|---|---|---|
| 0 | Docs only (`*.md`, comments, `LICENSE`, `CHANGELOG*`) — no source code changes | reviewer only |
| 1 | Single-file OR test-only changes (`*.test.*`, `*.spec.*`, `*_test.*`) | reviewer only |
| 2 | Light fix, dev-tooling, configs (`.github/**`, `scripts/**`, `*.json`, `*.yml`, `*.yaml`) | reviewer + qa (if `has_workspaces=true`, else qa skipped) |
| 3 | Production code (`src/**`, `lib/**`, `cmd/**`, `app/**`, `pkg/**`, `internal/**`, `api/**`) | reviewer + qa + security (parallel) |
| 4 | Security-sensitive paths (`auth/**`, `middleware/**`, `db/**`, `security/**`, `crypto/**`, `session/**`) OR security keyword in PR body (`auth`, `injection`, `xss`, `csrf`, `secret`, `token`, `bypass`, `sql`, `overflow`, `cve`) | reviewer + qa + security (extended) |

**Auto-escalation:** if a Tier-4 path or keyword is detected, escalate to Tier 4 regardless of other signals.

**Emit one line to the operator:**
```
PR classified as Tier {N} — agents: {list}.
```

### Phase 3 — Multi-Agent Review Dispatch

Dispatch review agents based on tier classification. ALL Bash happens in the main context. Agents do ZERO Bash and read files from `$WORKTREE/...`, NOT from the operator's current checkout.

**The `WORKTREE` path MUST be passed to every agent invocation so they read files at the correct state.**

#### Multi-reviewer path (when `multi_reviewer=true`, dispatched via orchestrator)

9a. For each focus in `focuses`, dispatch the orchestrator with:
   ```
   Direct Mode Task:
   - Mode: review
   - Focus: {focus}
   - Multi-Reviewer: true
   - Worktree: {WORKTREE}
   - workspaces path: {workspaces_PATH or "none"}
   - Draft Output: .claude/pr-review-draft-{focus}.md
   - Inline Output: .claude/pr-review-inline-{focus}.json
   - PR Comments: {$pr_comments from step 9 — same value as single-reviewer path}
   - {... same PR fields as single-reviewer ...}
   ```
   Dispatches run **in parallel** (same pattern as Phase 3 tester+qa+security parallel). Wait for all to complete.

9b. If Tier 3 or Tier 4, ALSO dispatch qa and security in parallel (alongside the multi-focused reviewers):
   - qa dispatch (only when Tier 3+ AND `has_workspaces=true`):
     ```
     Direct Mode Task:
     - Mode: pr-review-qa
     - Worktree: {WORKTREE}
     - workspaces path: {workspaces_PATH}
     - PR: #{number}
     ```
   - security dispatch (always at Tier 3+):
     ```
     Direct Mode Task:
     - Mode: pr-review-security
     - Worktree: {WORKTREE}
     - PR: #{number}
     - Diff: {diff output from step 5}
     - Changed files: {file list from step 6}
     ```

9c. After all agents complete, dispatch the orchestrator in consolidation mode:
   ```
   Direct Mode Task:
   - Mode: review-consolidate
   - Focuses: [{focus1}, {focus2}, ...]
   - Has QA draft: {true if .claude/pr-review-qa.md exists}
   - Has Security draft: {true if .claude/pr-review-security.md exists}
   - PR: #{number}
   - Title: {title}
   - Author: {author}
   - URL: {url}
   ```
   The orchestrator invokes the `reviewer-consolidator` agent which reads all draft files and writes `.claude/pr-review-final.md` and `.claude/pr-review-inline.json`.

9d. After consolidation, proceed to Phase 4 using `.claude/pr-review-final.md` and `.claude/pr-review-inline.json`.

#### Single-reviewer path (when `multi_reviewer=false`)

For Tier 0 / 1: dispatch reviewer only.
For Tier 2: dispatch reviewer; if `has_workspaces=true`, also dispatch qa in parallel.
For Tier 3 / 4: dispatch reviewer, qa (if `has_workspaces=true`), and security in parallel.

10. Pass ALL gathered data to the `orchestrator` agent:
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
   - PR Comments: {$pr_comments from step 9 — issue-level + line-level combined; "(none — comments not fetched: gh unavailable)" when fetch failed}
   - Worktree: {WORKTREE}
   - workspaces path: {workspaces_PATH or "none"}
   ```

11. For Tier 2 (single-reviewer path) with `has_workspaces=true`, also dispatch qa in parallel:
    ```
    Direct Mode Task:
    - Mode: pr-review-qa
    - Worktree: {WORKTREE}
    - workspaces path: {workspaces_PATH}
    - PR: #{number}
    ```

12. For Tier 3/4 (single-reviewer path), also dispatch security in parallel with reviewer:
    ```
    Direct Mode Task:
    - Mode: pr-review-security
    - Worktree: {WORKTREE}
    - PR: #{number}
    - Diff: {diff output from step 5}
    - Changed files: {file list from step 6}
    ```

13. Wait for all dispatched agents to complete. Then consolidate:
    - If only reviewer ran (Tier 0/1, no qa, no security): `.claude/pr-review-draft.md` is the canonical output.
    - If 2+ agent drafts exist (any combination of reviewer + qa + security): dispatch `reviewer-consolidator` to merge them into `.claude/pr-review-final.md`. Single-file case uses that file directly as `.claude/pr-review-final.md`.

The `canonical_draft_path` is `.claude/pr-review-final.md` if it exists, else `.claude/pr-review-draft.md`.

### Phase 3.5 — Prior Review Check (MANDATORY before proceeding to Phase 4)

Before showing the draft and presenting the decision menu, check for an existing review from the same author on this PR. **Detection + fallback:** see `agents/_shared/gh-fallback.md` § "Tier A — read prior PR reviews". When `has_gh=true`:
```
gh api repos/{owner}/{repo}/pulls/{number}/reviews --jq '.[] | select(.user.login == "{current_user}") | {id: .id, state: .state, submitted_at: .submitted_at, body: .body[:120]}'
```
Replace `{current_user}` with the output of `gh api user --jq '.login'`. When `has_gh=false`: use the curl fallback to fetch the reviews list. If unavailable, default to treating as "no prior review" (worst case is a duplicate review, recoverable via dismiss).

- **If NO prior review exists** from the same author → proceed to Phase 4 (decision menu).

- **Re-review continuity detection:** if a prior review exists, inspect its body for the `## Hallazgos por enfoque` section header. If found, the prior review was a multi-reviewer run. Auto-apply `multi_reviewer=true` for this re-review (preserves focus coverage). Emit one line: "Prior review was multi-reviewer — applying --multi for continuity."

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

### Step 3.5a — Update summary only

1. Re-invoke the orchestrator with the same PR data but with mode `update-body`:
   ```
   Direct Mode Task:
   - Mode: review
   - Submode: update-body
   - PR: #{number}
   - {... same fields as step 10 ...}
   - Existing review ID: {review_id}
   - Existing review body: {current body text}
   - Instruction: Generate an updated summary incorporating any new observations.
   ```
2. The orchestrator invokes the reviewer in `update-body` mode and writes the new body to `.claude/pr-review-draft.md`.
3. Read `.claude/pr-review-draft.md` and show to the user for approval.
4. On approval, publish with PUT. **Detection + fallback:** see `agents/_shared/gh-fallback.md` § "Tier B — write that needs auth". When `has_gh=true`: use `gh api -X PUT`. When `has_gh=false` and a token is available: use `curl -X PUT`. When neither is available: instruct the operator to run the curl command with their token.
   ```bash
   jq -n --arg body "$(cat .claude/pr-review-draft.md)" '{body: $body}' \
   | gh api -X PUT repos/{owner}/{repo}/pulls/{number}/reviews/{review_id} --input -
   ```
5. Verify success, cleanup draft files, and STOP.

### Step 3.5b — Reply to existing thread

1. List the existing inline comments on this PR:
   ```
   gh api repos/{owner}/{repo}/pulls/{number}/comments --jq '.[] | select(.pull_request_review_id == {review_id}) | {id: .id, path: .path, line: .line, body: .body[:120]}'
   ```
   If no inline comments exist, tell the user: "The prior review has no inline comments to reply to. Use option (a) to update the summary instead." Then re-show the menu.
2. Display the list and ask the user to select a `comment_id`.
3. Re-invoke the orchestrator with mode `reply`:
   ```
   Direct Mode Task:
   - Mode: review
   - Submode: reply
   - PR: #{number}
   - {... same fields as step 10 ...}
   - Thread context:
     - comment_id: {selected_id}
     - path: {file path}
     - line: {line number}
     - original_body: {the inline comment text}
   - Instruction: Generate a focused reply to this thread.
   ```
4. The orchestrator invokes the reviewer in `reply` mode and writes the reply to `.claude/pr-review-reply-draft.md`.
5. Read `.claude/pr-review-reply-draft.md` and show to the user for approval.
6. On approval, publish the reply. **Detection + fallback:** Tier B — same pattern as step 3.5a. Use `gh api` when available, curl fallback when token present, operator instruction otherwise.
   ```bash
   jq -n --arg body "$(cat .claude/pr-review-reply-draft.md)" '{body: $body}' \
   | gh api -X POST repos/{owner}/{repo}/pulls/{number}/comments/{comment_id}/replies --input -
   ```
7. Verify success, cleanup draft files, and STOP.

### Step 3.5c — Dismiss and re-review

1. Dismiss the existing review. **Detection + fallback:** Tier B — use `gh api -X PUT` when available, curl PATCH fallback with token, or operator instruction.
   ```
   gh api -X PUT repos/{owner}/{repo}/pulls/{number}/reviews/{review_id}/dismissals -f message="Superseded by new review"
   ```
2. Verify the dismiss succeeded. If it fails, report the error and STOP.
3. Proceed to Phase 4 (decision menu, fresh review flow with atomic submission).

### Step 3.5d — Cancel

Delete all `.claude/pr-review-*.md` and `.claude/pr-review-*.json` files (if they exist) and STOP. The worktree cleanup runs via the trap registered in step 7. Do NOT publish anything.

### Phase 4 — Decision Menu

**Verify the draft exists.** Check that the canonical draft path was created and is not empty. If it's missing or empty:
- Tell the user: "The review agent did not produce the review draft. Retrying once."
- Re-invoke the review dispatch (go back to Phase 3)
- If it fails a second time, report the error and stop

Read the canonical draft and display the full review draft to the user.

Present the decision menu:

```
Review draft ready. Decide action:
  (a) approve              — APPROVE event, body + inline comments posted
  (b) request changes      — REQUEST_CHANGES event, body + inline comments posted
  (c) comment only         — COMMENT event, body posted without approval state
  (d) defer                — save draft to disk, do not publish (operator publishes later)
  (e) cancel               — discard draft, do not publish

Recommendation: {auto-suggested based on findings}
Choose [a/b/c/d/e]:
```

**Recommendation hint:**
- 0 critical findings, 0 high-priority → `(a) approve`
- 0 critical, 1+ high-priority → `(c) comment only`
- 1+ critical → `(b) request changes`

**If operator picks `(d) defer`:**
- Ensure draft is at `.claude/pr-review-final.md` (copy from canonical path if needed).
- Remove the cleanup trap so files persist.
- Print: "Draft saved to .claude/pr-review-final.md. Run /th:review-pr {N} --resume-from-draft to publish later."
- STOP cleanly. Do NOT remove the worktree (it may be needed for reference). Note: operator should remove it manually or it will be cleaned up at session end.

**If operator picks `(e) cancel`:**
- Discard all draft files (cleanup trap fires on EXIT).
- STOP.

**If operator selects `(a)`, `(b)`, or `(c)`:**
- Proceed to Phase 5.

**If operator requests edits before committing:**
- Modify the draft per feedback, show again, repeat until a final choice is made.

### Phase 5 — Publish + Cleanup

**Atomic submission** via a single API call with body + event + inline comments:

a. Read the review body from the canonical draft path.
b. Read inline findings from `.claude/pr-review-inline.json` (if it exists). Format: `[{"path": "...", "line": N, "body": "..."}]`. If the file doesn't exist or is empty, use an empty array `[]`.
c. Map operator choice to GitHub event:
   - `(a) approve` → event `APPROVE`
   - `(b) request changes` → event `REQUEST_CHANGES`
   - `(c) comment only` → event `COMMENT`
d. Construct the JSON payload and submit in a **single atomic call**. **Detection + fallback:** see `agents/_shared/gh-fallback.md` § "Tier B — submit a PR review (atomic POST)". The body+event+comments payload is saved to `.claude/pr-review-payload.json` regardless of whether `gh` or curl is used:
   ```bash
   jq -n \
     --arg body "$(cat {canonical_draft_path})" \
     --arg event "{EVENT}" \
     --argjson comments "$(cat .claude/pr-review-inline.json 2>/dev/null || echo '[]')" \
     '{body: $body, event: $event, comments: $comments}' \
   | gh api -X POST repos/{owner}/{repo}/pulls/{number}/reviews --input -
   ```
   Replace `{owner}/{repo}` with the repo from the PR URL, `{number}` with the PR number, and `{EVENT}` with the mapped event.
e. **NEVER use `gh pr review`** for publishing. NEVER post separate inline comments via `gh api repos/.../pulls/:n/comments`. The single `POST /repos/:o/:r/pulls/:n/reviews` call with `body` + `event` + `comments[]` is the ONLY allowed submission method.
f. **Verify the review was posted.** After the API call, check the exit code. If it failed, report the error to the user with the exact error message.

**Cleanup:**
- Remove worktree: `git worktree remove "$WORKTREE" --force 2>/dev/null || true`
- Delete all temp draft files:
  - `.claude/pr-review-draft.md`, `.claude/pr-review-final.md`
  - `.claude/pr-review-inline.json`, `.claude/pr-review-payload.json`
  - `.claude/pr-review-draft-security.md`, `.claude/pr-review-draft-architecture.md`, `.claude/pr-review-draft-style.md`
  - `.claude/pr-review-inline-security.json`, `.claude/pr-review-inline-architecture.json`, `.claude/pr-review-inline-style.json`
  - `.claude/pr-review-qa.md`, `.claude/pr-review-security.md`
- Remove the cleanup trap (EXIT trap already handles this, but call explicitly):
  ```sh
  trap - EXIT
  cleanup
  ```

**Context prune reminder (MANDATORY).** Each `/th:review-pr` invocation accumulates 5-30K tokens in the main context (PR metadata, full diff, file lists from `gh` and `git` outputs in Phase 1, plus the orchestrator's status block, plus Phase 5 publish outputs). Subagents die between PRs but the **main context does not** — successive reviews in the same session compound linearly.

Your **final response** to the user MUST include this reminder block (verbatim or equivalent — do NOT shorten it, do NOT phrase it as optional):

```
Review on PR #{number} published.

Context cleanup (recommended)
This review accumulated approximately {estimated_kb}K tokens in
your session (PR data, diff, file lists). Before reviewing the
next PR, run:

    /compact

Without this, each successive `/th:review-pr` adds another 5-30K
tokens that never get released. After 5 or more reviews in one
session, response latency and per-turn cost grow noticeably.

If this is the last review of the session, no action is needed —
close the session normally.
```

Estimate `{estimated_kb}` from the size of the diff you handled in Phase 1: small PR (<100 changed lines) ≈ 5K, medium (100-500) ≈ 10K, large (500-2000) ≈ 20K, truncated (>2000) ≈ 30K.

**Terminate.** Do NOT perform any additional actions after the context prune reminder — no second pass for inline comments, no follow-up reviews, no supplementary observations. The review is complete.

---
name: review-pr

## Mode 2 — No input provided

Ask the user: "Provide a PR number or URL to review. Example: `#45`, `45`, or `https://github.com/owner/repo/pull/45`."

---
name: review-pr

## Important

- Always invoke the `orchestrator` agent — do NOT invoke agents directly
- The orchestrator coordinates agents (reviewer, qa, security, reviewer-consolidator) with all data inline (zero Bash in sub-agents)
- ALL Bash commands run in this skill (main context) — agents do ZERO Bash
- **Agents read files from `$WORKTREE/path/to/file`, NOT from the operator's current checkout.** Pass `$WORKTREE` to every agent dispatch.
- **Multi-PR safety:** worktree name includes the PR number — concurrent PR reviews in the same session do not conflict.
- The user approves the review before publishing (Phase 4)
- **ONE review per author per PR.** A fresh review is created only when no prior review exists (Phase 5) or after an explicit dismiss (step 3.5c). NEVER publish a second review without dismissing first.
- **Atomic submission for fresh reviews.** The `gh api POST .../reviews` call (Phase 5) includes body + event + comments[] in a single call. NEVER split into `gh pr review` + separate `gh api pulls/:n/comments`. This applies to both the `gh` and curl paths.
- **GitHub API model:** A submitted review is an immutable container for inline comments. You cannot add inline comments to an existing review. To add context: PUT body, reply to thread, or dismiss+re-review.
- **Tier classification:** Tier 0/1 → reviewer only. Tier 2 → reviewer + qa (if AC found). Tier 3/4 → reviewer + qa + security (parallel). Auto-escalation: any security-sensitive path or keyword → Tier 4.
- **Decision menu:** operator always picks the action explicitly. The recommendation hint is advisory only. Options: approve / request changes / comment only / defer / cancel.
- **Cleanup is trap-style** — worktree and draft files are removed even on early exit via the EXIT trap registered in step 7.
- **Multi-reviewer:** `--multi` / `--reviewers <focuses>` dispatches N focused reviewers in parallel, then the `reviewer-consolidator` merges the results plus any qa/security drafts. Auto-triggers when diff exceeds `AUTO_MULTI_LINES_THRESHOLD` or `AUTO_MULTI_FILES_THRESHOLD`. **No cost-warning UI** — per operator policy, multi-reviewer runs silently with one info line.
- **Re-review continuity:** when a prior review's body contains `## Hallazgos por enfoque`, `--multi` is automatically applied to preserve focus coverage on re-review.
