# gh CLI fallback patterns
<!-- Single source of truth for graceful degradation when gh is unavailable.
     Consumed by: agents/{delivery,orchestrator,ref-special-flows}.md and
     skills/{issue,plan,design,define-ac,audit,review-pr}.md.
     Edit here; everywhere else references this file by section. -->

## Detection probe (run once per consumer entry point)

```bash
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  has_gh=true
else
  has_gh=false
fi
```

`has_gh=true` requires both conditions: the binary is in PATH **and** it is
authenticated. An installed-but-unauthenticated `gh` is treated as absent
because none of the operations below work without auth.

## Parse the GitHub origin (for Tier A/B fallbacks)

```bash
origin_url="$(git remote get-url origin 2>/dev/null)"
case "$origin_url" in
  https://github.com/*|git@github.com:*)
    repo_path="$(echo "$origin_url" | sed -E 's|.*github\.com[:/]([^/]+/[^/.]+)(\.git)?$|\1|')"
    is_github=true
    ;;
  *) is_github=false ;;
esac
```

Non-GitHub remotes (GitLab, Gitea, Bitbucket) fall through to `is_github=false`
and skip straight to the local-file escape hatch — the fallback REST calls are
GitHub-specific.

## Tier A — issue/PR read

Read operations against public (or token-accessible) GitHub data.

**Fallback chain:**
1. If `has_gh=true` → use `gh` as today (zero behaviour change).
2. Else if `is_github=true` → try `curl` against the GitHub REST API.
   Pass `$GH_TOKEN` or `$GITHUB_TOKEN` if set (5 000 req/hr); anonymous
   otherwise (60 req/hr on public repos).
3. Else → escape hatch: write the expected JSON template to
   `workspaces/{feature}/inputs/{resource}-{N}.json`, prompt the operator to
   fill it in, and re-read on the next invocation.

### Tier A — read a single issue

```bash
if [ "$has_gh" = "true" ]; then
  gh issue view {number} --json number,title,body,labels,assignees,milestone,projectItems
elif [ "$is_github" = "true" ]; then
  auth_header=""
  token="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
  [ -n "$token" ] && auth_header="-H \"Authorization: Bearer $token\""
  curl -sf $auth_header \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/$repo_path/issues/{number}"
  # Note: curl returns GitHub JSON directly; map fields as needed.
fi
```

Operator message when curl is used:
```
gh CLI unavailable. Fetched issue #{number} via the GitHub REST API instead.
```

Operator message when escape hatch is triggered:
```
Issue #{number} could not be fetched automatically (gh missing and no github.com
remote detected). Paste the issue body into
workspaces/{feature}/inputs/issue-{number}.json and re-run the same command.
```

### Tier A — read a single PR

```bash
if [ "$has_gh" = "true" ]; then
  gh pr view {number} --json number,title,body,baseRefName,headRefName,state,labels
elif [ "$is_github" = "true" ]; then
  auth_header=""
  token="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
  [ -n "$token" ] && auth_header="-H \"Authorization: Bearer $token\""
  curl -sf $auth_header \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/$repo_path/pulls/{number}"
fi
```

**STOP-on-access-failure (PR read is not best-effort).** Unlike comment/review reads, resolving the PR head is load-bearing — a review must read from the real head, never a guess. If the `gh` call fails (`Could not resolve to a Repository`, `Repository not found`, auth/account error) AND the curl fallback fails or no token is set AND the head branch cannot be fetched locally (`git fetch origin {headRefName}` fails), STOP. Surface the operator-facing line below and wait. Do NOT substitute the currently checked-out branch for the PR. Do NOT assume the local branch is the PR. Do NOT review the primary working tree as a fallback. A PR review reads from a worktree at the resolved PR head or it does not run.

Operator-facing STOP message:
```
cannot reach PR — authenticate or paste the diff

The PR head could not be resolved from GitHub (gh: "{error}"; no token / wrong account).
Review of the checked-out branch or the working tree is NOT a valid substitute.
Options: (1) authenticate the correct gh account and re-run; or
         (2) paste the PR diff, and I will review the pasted diff only.
```

### Tier A — list open PRs for a branch

```bash
if [ "$has_gh" = "true" ]; then
  gh pr list --head {branch} --base main --state all --json number,url,title,state -q '.[0]'
elif [ "$is_github" = "true" ]; then
  auth_header=""
  token="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
  [ -n "$token" ] && auth_header="-H \"Authorization: Bearer $token\""
  curl -sf $auth_header \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/$repo_path/pulls?head={owner}:{branch}&base=main&state=all"
fi
```

### Tier A — list repo labels

```bash
if [ "$has_gh" = "true" ]; then
  gh label list --json name -q '.[].name'
elif [ "$is_github" = "true" ]; then
  auth_header=""
  token="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
  [ -n "$token" ] && auth_header="-H \"Authorization: Bearer $token\""
  curl -sf $auth_header \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/$repo_path/labels?per_page=100"
fi
```

### Tier A — read PR comments

Fetch the PR conversation (issue-level + line-level review comments) as INPUT
context for the reviewer panel. This is a read-only, best-effort fetch — when
`gh`/token is absent, emit a note and continue; never hard-fail the review.

**Issue-level comments** (general PR discussion thread):

```bash
if [ "$has_gh" = "true" ]; then
  gh pr view {number} --comments --json comments -q '.comments[] | {author: .author.login, body: .body, created_at: .createdAt}'
elif [ "$is_github" = "true" ]; then
  auth_header=""
  token="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
  [ -n "$token" ] && auth_header="-H \"Authorization: Bearer $token\""
  curl -sf $auth_header \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/$repo_path/issues/{number}/comments?per_page=100"
fi
```

**Line-level review comments** (inline PR review thread comments):

```bash
if [ "$has_gh" = "true" ]; then
  gh api repos/$repo_path/pulls/{number}/comments --jq '.[] | {path: .path, line: .line, body: .body, author: .user.login, resolved: (.in_reply_to_id // "root")}'
elif [ "$is_github" = "true" ]; then
  auth_header=""
  token="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
  [ -n "$token" ] && auth_header="-H \"Authorization: Bearer $token\""
  curl -sf $auth_header \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/$repo_path/pulls/{number}/comments?per_page=100"
fi
```

**Degradation contract (best-effort):** when both `has_gh=false` and
`is_github=false` (or when the API call fails), emit a one-line note to the
operator and continue — the review is never blocked by comment-fetch failure:

```
Comments not fetched — gh unavailable. Review proceeds without prior conversation context.
```

Truncation: if the combined comment payload exceeds ~200 lines, keep the most
recent 100 lines and prepend:
`[COMMENTS TRUNCATED — showing most recent 100 lines of {total} total.]`

### Tier A — read prior PR reviews

```bash
if [ "$has_gh" = "true" ]; then
  gh api repos/$repo_path/pulls/{number}/reviews
elif [ "$is_github" = "true" ]; then
  auth_header=""
  token="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
  [ -n "$token" ] && auth_header="-H \"Authorization: Bearer $token\""
  curl -sf $auth_header \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/$repo_path/pulls/{number}/reviews"
  # No prior-review data available — default to treating as no prior review.
fi
```

When `has_gh=false` and `is_github=false`, default to treating as no prior
review rather than blocking the whole review skill.

## Tier B — write that needs auth

Write operations that require a valid token.

**Fallback chain:**
1. If `has_gh=true` → use `gh` as today.
2. Else if `is_github=true` AND `$GH_TOKEN` or `$GITHUB_TOKEN` is set → use
   `curl` with `Authorization: Bearer` header.
   **When auto-using a token:** emit one line:
   ```
   gh CLI unavailable. Using $GH_TOKEN for write operation via the GitHub REST API.
   ```
3. Else → emit the **exact command** the operator pastes, the **compare URL**,
   and the body file path. Report `status: blocked-manual-push`. Do NOT block
   waiting — surface the command and return.

**Security note — JSON serialization:** all Tier B curl-write blocks that accept
GitHub-sourced or operator-supplied field values (title, body, comment) write
those values to a JSON payload file via `python3 json.dumps` (values passed as
argv, never interpolated into a shell string), then pass the file to curl with
`--data @<payload-file>`. Never add untrusted values directly inside a
double-quoted `--data "{...}"` shell literal — that pattern is a CWE-78 injection
vector and is prohibited here.

### Tier B — create a PR

```bash
if [ "$has_gh" = "true" ]; then
  gh pr create --title "{title}" --body "{body}" --base main --head {branch}
elif [ "$is_github" = "true" ] && [ -n "${GH_TOKEN:-${GITHUB_TOKEN:-}}" ]; then
  token="${GH_TOKEN:-$GITHUB_TOKEN}"
  # Serialize untrusted title/body/branch via python3 json.dumps (argv — no shell interpolation).
  _pr_payload="$(mktemp /tmp/gh-pr-create-XXXXXX.json)"
  python3 -c "import json,sys; print(json.dumps({'title':sys.argv[1],'body':sys.argv[2],'head':sys.argv[3],'base':'main'}))" \
    "{title}" "{body}" "{branch}" > "$_pr_payload"
  curl -sf -X POST \
    -H "Authorization: Bearer $token" \
    -H "Accept: application/vnd.github+json" \
    -H "Content-Type: application/json" \
    "https://api.github.com/repos/$repo_path/pulls" \
    --data @"$_pr_payload"
  rm -f "$_pr_payload"
else
  # Write body to file and surface for operator paste
  mkdir -p workspaces/{feature}/inputs
  cat > workspaces/{feature}/inputs/pr-body.md << 'PRBODY'
{full PR body}
PRBODY
  echo "GitHub CLI unavailable — PR not created automatically."
  echo ""
  echo "Branch pushed to origin. Open the PR manually:"
  echo ""
  echo "  https://github.com/$repo_path/compare/main...{branch}?expand=1"
  echo ""
  echo "Title (copy/paste):"
  echo "  {title}"
  echo ""
  echo "Body: workspaces/{feature}/inputs/pr-body.md"
  echo ""
  echo "Reply 'pr opened #N' to continue the pipeline."
fi
```

### Tier B — edit an existing PR

```bash
if [ "$has_gh" = "true" ]; then
  gh pr edit {number} --body "{body}"
elif [ "$is_github" = "true" ] && [ -n "${GH_TOKEN:-${GITHUB_TOKEN:-}}" ]; then
  token="${GH_TOKEN:-$GITHUB_TOKEN}"
  # Serialize untrusted body via python3 json.dumps (argv — no shell interpolation).
  _pr_edit_payload="$(mktemp /tmp/gh-pr-edit-XXXXXX.json)"
  python3 -c "import json,sys; print(json.dumps({'body':sys.argv[1]}))" \
    "{body}" > "$_pr_edit_payload"
  curl -sf -X PATCH \
    -H "Authorization: Bearer $token" \
    -H "Accept: application/vnd.github+json" \
    -H "Content-Type: application/json" \
    "https://api.github.com/repos/$repo_path/pulls/{number}" \
    --data @"$_pr_edit_payload"
  rm -f "$_pr_edit_payload"
else
  echo "Update PR body manually at: https://github.com/$repo_path/pull/{number}"
fi
```

### Tier B — create an issue

```bash
if [ "$has_gh" = "true" ]; then
  gh issue create --title "{title}" --label "{label}" --assignee "@me" --body "{body}"
elif [ "$is_github" = "true" ] && [ -n "${GH_TOKEN:-${GITHUB_TOKEN:-}}" ]; then
  token="${GH_TOKEN:-$GITHUB_TOKEN}"
  # Serialize untrusted title/body/label via python3 json.dumps (argv — no shell interpolation).
  _issue_create_payload="$(mktemp /tmp/gh-issue-create-XXXXXX.json)"
  python3 -c "import json,sys; print(json.dumps({'title':sys.argv[1],'body':sys.argv[2],'labels':[sys.argv[3]]}))" \
    "{title}" "{body}" "{label}" > "$_issue_create_payload"
  curl -sf -X POST \
    -H "Authorization: Bearer $token" \
    -H "Accept: application/vnd.github+json" \
    -H "Content-Type: application/json" \
    "https://api.github.com/repos/$repo_path/issues" \
    --data @"$_issue_create_payload"
  rm -f "$_issue_create_payload"
else
  mkdir -p workspaces/{feature}/inputs
  cat > workspaces/{feature}/inputs/issue-create.md << 'ISSUEBODY'
{SDD-formatted issue body}
ISSUEBODY
  echo "GitHub CLI unavailable — issue not created automatically."
  echo "Paste the body from workspaces/{feature}/inputs/issue-create.md into GitHub,"
  echo "then reply with the new issue number."
fi
```

### Tier B — edit an issue

```bash
if [ "$has_gh" = "true" ]; then
  gh issue edit {number} --body "{body}"
elif [ "$is_github" = "true" ] && [ -n "${GH_TOKEN:-${GITHUB_TOKEN:-}}" ]; then
  token="${GH_TOKEN:-$GITHUB_TOKEN}"
  # Serialize untrusted body via python3 json.dumps (argv — no shell interpolation).
  _issue_edit_payload="$(mktemp /tmp/gh-issue-edit-XXXXXX.json)"
  python3 -c "import json,sys; print(json.dumps({'body':sys.argv[1]}))" \
    "{body}" > "$_issue_edit_payload"
  curl -sf -X PATCH \
    -H "Authorization: Bearer $token" \
    -H "Accept: application/vnd.github+json" \
    -H "Content-Type: application/json" \
    "https://api.github.com/repos/$repo_path/issues/{number}" \
    --data @"$_issue_edit_payload"
  rm -f "$_issue_edit_payload"
else
  mkdir -p workspaces/{feature}/inputs
  cat > workspaces/{feature}/inputs/issue-edit.md << 'EDITBODY'
{updated issue body}
EDITBODY
  echo "Update issue body manually at: https://github.com/$repo_path/issues/{number}"
  echo "Body written to: workspaces/{feature}/inputs/issue-edit.md"
fi
```

### Tier B — comment on an issue

```bash
if [ "$has_gh" = "true" ]; then
  gh issue comment {number} --body "{comment}"
elif [ "$is_github" = "true" ] && [ -n "${GH_TOKEN:-${GITHUB_TOKEN:-}}" ]; then
  token="${GH_TOKEN:-$GITHUB_TOKEN}"
  # Serialize untrusted comment via python3 json.dumps (argv — no shell interpolation).
  _issue_comment_payload="$(mktemp /tmp/gh-issue-comment-XXXXXX.json)"
  python3 -c "import json,sys; print(json.dumps({'body':sys.argv[1]}))" \
    "{comment}" > "$_issue_comment_payload"
  curl -sf -X POST \
    -H "Authorization: Bearer $token" \
    -H "Accept: application/vnd.github+json" \
    -H "Content-Type: application/json" \
    "https://api.github.com/repos/$repo_path/issues/{number}/comments" \
    --data @"$_issue_comment_payload"
  rm -f "$_issue_comment_payload"
else
  mkdir -p workspaces/{feature}/inputs
  cat > workspaces/{feature}/inputs/issue-comment.md << 'COMMENTBODY'
{comment body}
COMMENTBODY
  echo "Paste the comment from workspaces/{feature}/inputs/issue-comment.md"
  echo "into GitHub at: https://github.com/$repo_path/issues/{number}"
fi
```

### Tier B — submit a PR review (atomic POST)

```bash
if [ "$has_gh" = "true" ]; then
  gh api -X POST repos/$repo_path/pulls/{number}/reviews \
    --input .claude/pr-review-payload.json
elif [ "$is_github" = "true" ] && [ -n "${GH_TOKEN:-${GITHUB_TOKEN:-}}" ]; then
  token="${GH_TOKEN:-$GITHUB_TOKEN}"
  curl -sf -X POST \
    -H "Authorization: Bearer $token" \
    -H "Accept: application/vnd.github+json" \
    -H "Content-Type: application/json" \
    "https://api.github.com/repos/$repo_path/pulls/{number}/reviews" \
    --data @.claude/pr-review-payload.json
else
  echo "Submit the review manually by running:"
  echo ""
  echo "  curl -X POST \\"
  echo "    -H \"Authorization: Bearer \$GH_TOKEN\" \\"
  echo "    -H \"Accept: application/vnd.github+json\" \\"
  echo "    -H \"Content-Type: application/json\" \\"
  echo "    \"https://api.github.com/repos/$repo_path/pulls/{number}/reviews\" \\"
  echo "    --data @.claude/pr-review-payload.json"
fi
```

### Tier B — list review threads (map comment → thread id)

Enumerate all review threads on a PR, yielding the GraphQL thread `id`
(format `PRRT_…`), `isResolved`, `isOutdated`, and the nested comments with
`databaseId` (integer REST ID for cross-walk), `body`, and `author.login`.
This is the ONLY way to obtain thread IDs and `isResolved` state — the REST
API has no thread-level endpoint and no `isResolved` field.

**This operation is GraphQL-only — no REST equivalent exists for thread
enumeration.** When `gh` is unavailable and no token is present, emit the exact
command below for operator paste.

```bash
if [ "$has_gh" = "true" ]; then
  gh api graphql -f query='
    query($owner: String!, $repo: String!, $pr: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $pr) {
          reviewThreads(first: 100) {
            nodes {
              id isResolved isOutdated path
              comments(first: 50) {
                nodes { id databaseId body author { login } }
              }
            }
          }
        }
      }
    }' -f owner=OWNER -f repo=REPO -F pr=PR_NUMBER
else
  # No gh available — operator-paste path.
  # curl cannot return PullRequestReviewThread.id or isResolved (REST has no
  # thread endpoint). Emit the command for the operator to run manually.
  echo "Thread listing requires gh CLI (GraphQL-only). Run this command manually:"
  echo ""
  echo "  gh api graphql -f query='"
  echo "    query(\$owner: String!, \$repo: String!, \$pr: Int!) {"
  echo "      repository(owner: \$owner, name: \$repo) {"
  echo "        pullRequest(number: \$pr) {"
  echo "          reviewThreads(first: 100) {"
  echo "            nodes {"
  echo "              id isResolved isOutdated path"
  echo "              comments(first: 50) {"
  echo "                nodes { id databaseId body author { login } }"
  echo "              }"
  echo "            }"
  echo "          }"
  echo "        }"
  echo "      }"
  echo "    }' -f owner=OWNER -f repo=REPO -F pr=PR_NUMBER"
fi
```

Pagination: `first: 100` covers virtually every real PR. If a PR has more than
100 threads, add a `pageInfo { endCursor hasNextPage }` field and follow the
cursor. This extension is rarely needed in practice.

### Tier B — reply to a review thread

Post a reply to an existing inline review thread. The primary path uses GraphQL
`addPullRequestReviewThreadReply` (recommended: the thread `id` from the listing
query is already in hand — no separate root-comment lookup needed). The curl
fallback uses the REST `/replies` endpoint with the root comment's integer ID.

```bash
if [ "$has_gh" = "true" ]; then
  # GraphQL path — recommended (thread id from the listing query, Op 2)
  gh api graphql -f query='
    mutation($threadId: ID!, $body: String!) {
      addPullRequestReviewThreadReply(input: {
        pullRequestReviewThreadId: $threadId
        body: $body
      }) {
        comment { id }
      }
    }' -F threadId=PRRT_THREAD_ID_HERE -f body='<per-comment disposition text>'
elif [ "$is_github" = "true" ] && [ -n "${GH_TOKEN:-${GITHUB_TOKEN:-}}" ]; then
  # curl fallback — REST POST /replies (requires root top-level comment ID,
  # NOT a reply ID; use the databaseId from the listing query for the first
  # comment in the thread)
  token="${GH_TOKEN:-$GITHUB_TOKEN}"
  curl -sf -X POST \
    -H "Authorization: Bearer $token" \
    -H "Accept: application/vnd.github+json" \
    -H "Content-Type: application/json" \
    "https://api.github.com/repos/$repo_path/pulls/{pull_number}/comments/{root_comment_id}/replies" \
    --data "{\"body\":\"<per-comment disposition text>\"}"
else
  # Operator-paste path — emit the exact gh api graphql command + thread id
  echo "Reply to thread manually by running (replace PRRT_… with the thread id"
  echo "from the listing query output):"
  echo ""
  echo "  gh api graphql -f query='"
  echo "    mutation(\$threadId: ID!, \$body: String!) {"
  echo "      addPullRequestReviewThreadReply(input: {"
  echo "        pullRequestReviewThreadId: \$threadId"
  echo "        body: \$body"
  echo "      }) { comment { id } }"
  echo "    }' -F threadId=PRRT_… -f body='<per-comment disposition text>'"
fi
```

**Note:** REST replies must use the root top-level comment ID, not the ID of a
reply. The `in_reply_to` field in responses is set automatically by the API and
is not a request parameter for the `/replies` endpoint. Replies to replies are
not supported by the REST API — use GraphQL if the thread has nested replies.

**Shell quoting for the `body` value.** The `-f body='...'` argument is always
passed as a single single-quoted argument. Any literal single quote in the reply
text must be escaped using the `'\''` idiom (close the single-quoted string,
insert a literal `'`, reopen), or pass the value via `--field body=@file` (a
temporary file) to avoid shell quoting entirely. The reply text is the
agent-composed disposition (Nature / Severity / Decision + rationale) — it is
never a literal copy or concatenation of the reviewer's comment text.

**Required permission:** "Pull requests: write". A standard `gh auth login`
token (`repo` scope) covers this operation.

### Tier B — resolve a review thread

Mark a review thread as resolved using the GraphQL `resolveReviewThread`
mutation. Resolution is gated strictly on Decision = APPLIED per
`apply-review-disposition.md § Step 6` — never mass-resolve.

**There is NO REST equivalent for `resolveReviewThread`.** The GitHub REST API
has no thread-resolution endpoint. When `gh` is unavailable, the only path is
operator-paste — there is no curl-REST fallback tier for this operation.

```bash
if [ "$has_gh" = "true" ]; then
  # Attempt resolve; degrade gracefully on 403 (see note below)
  gh api graphql -f query='
    mutation($threadId: ID!) {
      resolveReviewThread(input: { threadId: $threadId }) {
        thread { id isResolved }
      }
    }' -F threadId=PRRT_THREAD_ID_HERE
else
  # No gh available — NO curl-REST fallback exists (resolveReviewThread is
  # GraphQL-only). Emit the command for the operator to run manually.
  echo "Thread resolution requires gh CLI (GraphQL-only — no REST equivalent)."
  echo "Run this command manually (replace PRRT_… with the thread id):"
  echo ""
  echo "  gh api graphql -f query='"
  echo "    mutation(\$threadId: ID!) {"
  echo "      resolveReviewThread(input: { threadId: \$threadId }) {"
  echo "        thread { id isResolved }"
  echo "      }"
  echo "    }' -F threadId=PRRT_…"
fi
```

**Permission and degradation on 403.**
`resolveReviewThread` requires "Contents: read+write" in addition to "Pull
requests: write". A standard `gh auth login` token (`repo` scope) covers both
in the common case (the author has write access to the base repo). On a 403
(e.g., fork author without base-repo write access, or a fine-grained PAT
without Contents write), do NOT retry. Inspect the response for the
`X-Accepted-GitHub-Permissions` header — it lists the exact missing permission
(e.g., `contents=write`). Degrade to **replied-but-not-resolved**: the
per-comment reply still posts; the resolve step is skipped with a one-line note
naming the missing permission. This is a best-effort posture, not a hard
failure.

**Invariant: resolve ≠ dismiss.** Resolving a review thread does NOT change the
formal review state. A `CHANGES_REQUESTED` review persists after every thread
on the PR is resolved. Branch protection's required-review gate is unaffected.
The review state changes only when (a) the reviewer submits a new APPROVED
review, or (b) an admin or write-access user dismisses it via
`PUT .../reviews/{review_id}/dismissals`. Authors cannot dismiss their own
`CHANGES_REQUESTED` review. Resolving threads is bookkeeping; re-review remains
the reviewer's action.

**Rate limiting.** Pause at least 1 second between successive `resolveReviewThread`
mutations to stay under GitHub's secondary rate limit (80 content-creating
requests/min). For typical PRs (single-digit to low-double-digit threads), this
is well within both primary (5000 pts/hr) and secondary limits.

**Idempotency.** Re-resolving an already-resolved thread is a no-op — the
mutation returns `isResolved: true`. Safe to re-run.

**Outdated threads.** `resolveReviewThread` works on outdated threads (threads
orphaned by rebase, force-push, or squash) even when the UI shows no resolution
affordance. The mutation proceeds normally.

## Tier B — batched review disposition (aliased mutation)

Composes every reply and every resolve produced by one comment-incorporation
pass (`apply-review-disposition.md` Steps 5-6) into a **single** `gh api
graphql` call, instead of one call per thread. This is additive — the
single-thread sections above ("Tier B — reply to a review thread", "Tier B —
resolve a review thread") remain the documented fallback and are used
unchanged whenever `has_gh=false`, whenever no token is available, or whenever
the batched call itself fails outright (auth error, network error). The
batched path is the default when `has_gh=true`; the single-thread path is not
removed.

**Why batch:** each reply and each resolve is individually a covered outward
mutation — `GH_GRAPHQL_RE && GRAPHQL_PR_MUTATIONS_RE` in the dev-guard matches
`gh api graphql` carrying `addPullRequestReviewThreadReply` or
`resolveReviewThread` and gates it with `ask`. N threads processed one call at
a time cost N operator prompts. Composing all N+M mutations (N replies, M
resolves, M ≤ N since only `APPLIED` — or fully-resolved `PARTIAL` — decisions
resolve) into one aliased request means the dev-guard's regex matches the
call exactly once. The gate is not weakened: the same call still requires the
same `ask`; only the number of prompts for one review pass drops from N+M to 1.

### Fixed query template — integer-indexed aliases

The query is a **fixed template**: one `reply{i}` block per comment
(`i = 0..N-1`, in ledger order) followed by one `resolve{i}` block per comment
whose Decision resolves its thread (a subset of the same index range). Reply
aliases always precede resolve aliases in the query text — GraphQL executes
top-level mutation fields serially, left to right, so this ordering is a
hard guarantee, not a convention. A `resolve{i}` alias reuses the same
`$thread{i}` variable as its matching `reply{i}` — one thread-id variable per
comment, never duplicated:

```graphql
mutation(
  $thread0: ID!, $body0: String!,
  $thread1: ID!, $body1: String!,
  $thread2: ID!, $body2: String!
) {
  reply0: addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId: $thread0, body: $body0 }) {
    comment { id }
  }
  reply1: addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId: $thread1, body: $body1 }) {
    comment { id }
  }
  reply2: addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId: $thread2, body: $body2 }) {
    comment { id }
  }
  resolve0: resolveReviewThread(input: { threadId: $thread0 }) {
    thread { id isResolved }
  }
  resolve2: resolveReviewThread(input: { threadId: $thread2 }) {
    thread { id isResolved }
  }
}
```

The example above shows N=3 replies with M=2 resolves (comment 1 was
`DEFERRED` or `REJECTED` — replied to, not resolved). The alias set scales
mechanically with N and M; the shape per index never changes.

**CWE-78 completeness — every data value is a variable, never query text.**
Every reply body and every thread node ID is bound through the GraphQL
`variables` map (`-f`/`--input`, raw string) — never concatenated or
interpolated into the query string. This mirrors the existing correct
pattern at § "Tier B — reply to a review thread" (`-f body='...'`) and
extends it to the thread IDs as well:

- Only the alias names (`reply0`, `reply1`, …) and the variable declarations
  (`$thread0: ID!`, …) are query text, and both are built purely from the
  loop index `i` — never from thread or comment content.
- `-F` is reserved for genuinely numeric or boolean values. It is never used
  for reply bodies or thread IDs: `gh api graphql -F` applies typed coercion
  (a value that is all digits becomes a number, `true`/`false` becomes a
  boolean) and treats a leading `@` as "read this value from a file" — a
  reply body of `123`, `true`, or `@/etc/passwd` would be silently
  mismanaged or read a local file under `-F`. Thread IDs (`PRRT_…`) and reply
  bodies are always free-form strings, so both go through `-f`/`--input`.
  This section has no numeric/boolean inputs, so `-F` is not used at all.

**Composition procedure (no shell interpolation of data values):**

1. Build the ledger in memory from `apply-review-disposition.md` Steps 5-6:
   for each comment, `{index: i, thread_id, reply_body, resolves: bool}`.
2. Write the ledger to a JSON manifest file (via the Write tool — never via a
   shell `echo`/heredoc containing the composed reply text) at, e.g.,
   `workspaces/{feature}/inputs/review-disposition-batch.json`.
3. Run a small script (`python3` or `node`, argv = the manifest file path
   only) that reads the manifest, builds the fixed-template query string
   from the entry count (aliases + variable declarations from `i`, never
   from `thread_id`/`reply_body`), builds the `variables` object
   (`{"thread0": "...", "body0": "...", ...}`) from the manifest's data
   fields, and writes the combined `{"query": "...", "variables": {...}}`
   GraphQL request body to a temp file.
4. Issue **one** call:
   ```bash
   gh api graphql --input "$batch_payload_file"
   ```
   (curl fallback, when `has_gh=false` but a token is set: `curl -sf -X POST
   -H "Authorization: Bearer $token" -H "Content-Type: application/json"
   https://api.github.com/graphql --data @"$batch_payload_file"` — same
   file, same discipline. When neither `gh` nor a token is available, do not
   attempt the batch; fall through to the single-thread operator-paste
   sections above.)

### Payload preview mandate (before the gated call)

Before issuing the single gated call, render the full composed batch to the
operator in chat — every reply body and which thread it resolves — so the
one `ask` the operator approves covers a payload they have actually seen,
mirroring the existing preview-and-confirm contract for outward actions
(`docs/dev-mode.md` § Outward-Action Gate). Example rendering:

```text
Batch review-disposition payload — 3 replies, 2 resolves, PR #{number}:

  [0] thread {short-thread-id-0} — resolve: yes
      reply: "{reply body 0}"
  [1] thread {short-thread-id-1} — resolve: no (DEFERRED — follow-up #123)
      reply: "{reply body 1}"
  [2] thread {short-thread-id-2} — resolve: yes
      reply: "{reply body 2}"
```

Do not issue the `gh api graphql --input …` call until this preview has been
shown. The gated `ask` that follows covers the whole previewed batch, not a
per-thread prompt.

### Partial failure — per-alias, not all-or-nothing

GraphQL executes the top-level mutation fields serially; a failure on one
alias does not abort the others — nullable fields simply resolve to `null`
for the failed alias, and the response carries both `data` (per-alias
results, possibly with `null` entries) and `errors` (each entry's `path[0]`
names the failed alias, e.g. `["reply1"]`).

After the call:
1. Read `data.{alias}` for every alias declared in the query. An alias with a
   non-null result succeeded.
2. Read `errors[].path[0]` for every alias that failed; map it back to its
   ledger entry by index (`reply1` → ledger entry `1`) and report the thread
   and the error message by name.
3. Do not retry succeeded aliases. Report failed aliases individually in the
   delivery summary (thread, alias, error) so the operator can see exactly
   which reply/resolve did not land, without re-issuing the whole batch.
4. A `resolve{i}` alias failing on a 403 (missing "Contents: read+write";
   see § "Tier B — resolve a review thread" § "Permission and degradation on
   403") degrades the same way as the single-thread path: the matching
   `reply{i}` still counts as posted if it succeeded, the resolve for that
   index alone is reported as skipped with the missing-permission name, and
   the batch is not considered a hard failure over one skipped resolve.

### Fallback — additive, not a replacement

The batched path requires `has_gh=true`. Every other condition — `gh`
missing, no token, non-GitHub remote, or the batched call itself failing to
reach the API — falls through unchanged to the single-thread sections above
(§ "Tier B — reply to a review thread", § "Tier B — resolve a review
thread"): one `gh api graphql` (or operator-paste) call per thread, exactly
as before this section was added.

## Tier D — project board ops (graceful skip)

`gh project` calls wrap GitHub's Projects V2 GraphQL API. There is no REST
equivalent. When `gh` is unavailable, skip with a log line and proceed — the
orchestrator already treats board moves as best-effort.

```bash
if [ "$has_gh" = "true" ]; then
  gh project list --format json | head -1
  # ... subsequent item-edit calls
else
  echo "Project board update skipped — gh CLI unavailable." \
       "To move the issue manually, visit the board for $repo_path."
fi
```

## status: blocked-pr-pending

When `has_gh=true` and the push to the remote branch succeeded but `gh pr create`
failed (rate-limit, transient network error, label rejection, or any other
recoverable failure), consumers report this status value:

```
agent: delivery
status: blocked-pr-pending
output: workspaces/{feature}/00-state.md § Delivery
manual_action_required: true
manual_action_file: workspaces/{feature}/inputs/pr-body.md
manual_action_url: https://github.com/{owner}/{repo}/compare/main...{branch}?expand=1
summary: Push succeeded but gh pr create failed. Branch is live on remote. Operator PR creation required.
```

**What distinguishes this from `blocked-manual-push`:** the remote branch already
exists (the push succeeded). Step 3's OPEN/no-PR detection handles the
pushed-but-PR-less recoverable state — if delivery is re-run, Step 3.2 will
detect no PR on the existing branch and proceed to Step 11 to create one.

**Resume protocol** (identical to `blocked-manual-push`):
1. Emit a one-paragraph STOP block with the compare URL and body file path.
2. Wait for operator reply (`pr opened #N` → continue; `abort` → mark pipeline blocked).
3. On continue: re-probe with a Tier A read of the new PR number; record in `00-state.md`.

The compare URL format:
`https://github.com/{owner}/{repo}/compare/main...{branch}?expand=1`

## `status: blocked-manual-push`

When a Tier B write cannot be completed automatically (no `gh`, no token, or
non-GitHub remote), consumers report this new status value:

```
agent: delivery
status: blocked-manual-push
output: workspaces/{feature}/00-state.md § Delivery
manual_action_required: true
manual_action_file: workspaces/{feature}/inputs/pr-body.md
manual_action_url: https://github.com/{owner}/{repo}/compare/main...{branch}?expand=1
summary: PR not created automatically (gh unavailable). Operator paste required.
```

The orchestrator's `blocked-manual-push` handling (analogous to
`blocked-no-dispatch`):
1. Emit a one-paragraph STOP block with the URL and file path.
2. Wait for operator reply (`pr opened #N` → continue; `abort` → mark pipeline
   blocked).
3. On continue: re-probe with a Tier A read of the new PR number; record in
   `00-state.md`.

## Operator-facing copy templates

**When curl is used (Tier A read):**
```
gh CLI unavailable. Fetched {resource} #{number} via the GitHub REST API instead.
```

**When curl is used (Tier B write):**
```
gh CLI unavailable. Using $GH_TOKEN for write operation via the GitHub REST API.
```

**When escape hatch is used (Tier A):**
```
{Resource} #{number} could not be fetched automatically (gh missing and no
github.com remote detected). Paste the content into
workspaces/{feature}/inputs/{resource}-{number}.json and re-run the same command.
```

**When escape hatch is used (Tier B — PR create):**
```
GitHub CLI unavailable — PR not created automatically.

Branch pushed to origin. Open the PR manually:

  https://github.com/{owner}/{repo}/compare/main...{branch}?expand=1

Title (copy/paste):
  {title}

Body: workspaces/{feature}/inputs/pr-body.md

Reply "pr opened #N" to continue the pipeline.
```

**When project board is skipped (Tier D):**
```
Project board update skipped — gh CLI unavailable. To move the issue manually,
visit the board for {owner}/{repo}.
```

## How to reference this file

In your agent or skill, replace inline `gh` blocks with a one-line
cross-reference at the relevant step:

```
**Detection + fallback:** see `agents/_shared/gh-fallback.md` § "Tier A — issue read".
```

The reference is resolved at prompt-load time: Claude reads the referenced
section in-context as part of the installed `~/.claude/agents/_shared/` tree.
