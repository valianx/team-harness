# gh CLI fallback patterns
<!-- Single source of truth for graceful degradation when gh is unavailable.
     Consumers reference this file by section; edit here only. -->

## Detection probe (run once per consumer entry point)

```bash
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  has_gh=true
else
  has_gh=false
fi
```

`has_gh=true` requires the binary in PATH AND authentication — an
installed-but-unauthenticated `gh` is treated as absent.

## Parse the GitHub origin

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

Non-GitHub remotes (GitLab, Gitea, Bitbucket) set `is_github=false` and skip
straight to the operator-paste escape hatch — the fallback REST calls are
GitHub-specific.

## Canonical curl fallback shape

Every Tier A/B curl block below follows one pattern; only METHOD and endpoint
vary:

```bash
token="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
auth_header=""; [ -n "$token" ] && auth_header="-H \"Authorization: Bearer $token\""
curl -sf $auth_header \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/$repo_path/{endpoint}"
```

Writes add `-X POST|PATCH -H "Content-Type: application/json" --data @<payload-file>`.

**Security note — JSON serialization (CWE-78).** Every write payload that
carries GitHub-sourced or operator-supplied values (title, body, comment) is
built with `python3 -c "import json,sys; print(json.dumps({...}))"` receiving
the values as argv — never interpolated into a double-quoted `--data "{...}"`
shell literal — written to a temp file and passed via `--data @file`.

## Tier A — issue/PR read

Chain: (1) `has_gh=true` → `gh` as today; (2) `is_github=true` → curl
(token when set: 5,000 req/hr; anonymous: 60 req/hr on public repos);
(3) neither → escape hatch: write the expected JSON template to
`workspaces/{feature}/inputs/{resource}-{N}.json`, prompt the operator to fill
it, re-read on the next invocation.

### Tier A — read a single issue

`gh issue view {number} --json number,title,body,labels,assignees,milestone,projectItems`
· curl `GET /repos/$repo_path/issues/{number}`.

### Tier A — read a single PR

`gh pr view {number} --json number,title,body,baseRefName,headRefName,state,labels`
· curl `GET /repos/$repo_path/pulls/{number}`.

**STOP-on-access-failure (PR read is not best-effort).** Resolving the PR head
is load-bearing — a review must read from the real head, never a guess. When
the `gh` call fails (repository not resolvable, auth/account error) AND the
curl fallback fails or no token is set AND `git fetch origin {headRefName}`
fails, STOP and wait. Do NOT substitute the checked-out branch, assume the
local branch is the PR, or review the primary working tree. A PR review reads
from a worktree at the resolved PR head or it does not run. Operator-facing
STOP message:

```
cannot reach PR — authenticate or paste the diff

The PR head could not be resolved from GitHub (gh: "{error}"; no token / wrong account).
Review of the checked-out branch or the working tree is NOT a valid substitute.
Options: (1) authenticate the correct gh account and re-run; or
         (2) paste the PR diff, and I will review the pasted diff only.
```

### Tier A — list open PRs for a branch

`gh pr list --head {branch} --base main --state all --json number,url,title,state -q '.[0]'`
· curl `GET /repos/$repo_path/pulls?head={owner}:{branch}&base=main&state=all`.

### Tier A — list repo labels

`gh label list --json name -q '.[].name'`
· curl `GET /repos/$repo_path/labels?per_page=100`.

### Tier A — read PR comments

Fetch the PR conversation as INPUT context for the reviewer panel — read-only,
best-effort: on failure emit
`Comments not fetched — gh unavailable. Review proceeds without prior conversation context.`
and continue; never hard-fail the review.

- Issue-level: `gh pr view {number} --comments --json comments` ·
  curl `GET /repos/$repo_path/issues/{number}/comments?per_page=100`.
- Line-level: `gh api repos/$repo_path/pulls/{number}/comments` ·
  curl `GET /repos/$repo_path/pulls/{number}/comments?per_page=100`.

Truncation: over ~200 combined lines, keep the most recent 100 and prepend
`[COMMENTS TRUNCATED — showing most recent 100 lines of {total} total.]`

### Tier A — read prior PR reviews

`gh api repos/$repo_path/pulls/{number}/reviews` · curl `GET …/reviews`. When
neither path is available, default to treating as no prior review rather than
blocking the review skill.

## Tier B — write that needs auth

Chain: (1) `has_gh=true` → `gh`; (2) `is_github=true` AND a token is set →
curl write with the serialization discipline above, announcing
`gh CLI unavailable. Using $GH_TOKEN for write operation via the GitHub REST API.`;
(3) neither → emit the exact command or URL for operator paste plus the body
file path, report the blocked status below, and return — never block waiting.

### Tier B — create a PR

`gh pr create --title "{title}" --body "{body}" --base main --head {branch}`
· curl `POST /repos/$repo_path/pulls` with a json.dumps payload
(`{title, body, head, base}`). Escape hatch: write the body to
`workspaces/{feature}/inputs/pr-body.md` and surface:

```
GitHub CLI unavailable — PR not created automatically.

Branch pushed to origin. Open the PR manually:

  https://github.com/{owner}/{repo}/compare/main...{branch}?expand=1

Title (copy/paste):
  {title}

Body: workspaces/{feature}/inputs/pr-body.md

Reply "pr opened #N" to continue the pipeline.
```

### Tier B — edit an existing PR

`gh pr edit {number} --body "{body}"` · curl
`PATCH /repos/$repo_path/pulls/{number}` with `{body}` · else surface the PR
URL for manual edit.

### Tier B — create an issue

`gh issue create --title "{title}" --label "{label}" --assignee "@me" --body "{body}"`
· curl `POST /repos/$repo_path/issues` with `{title, body, labels}` · else
write the body to `workspaces/{feature}/inputs/issue-create.md` and prompt the
operator to paste it into GitHub and reply with the new issue number.

### Tier B — edit an issue / comment on an issue

`gh issue edit {number} --body "{body}"` · curl `PATCH …/issues/{number}`;
`gh issue comment {number} --body "{comment}"` · curl
`POST …/issues/{number}/comments`. Escape hatch: write the body to
`workspaces/{feature}/inputs/issue-{edit|comment}.md` and surface the target
URL.

### Tier B — submit a PR review (atomic POST)

`gh api -X POST repos/$repo_path/pulls/{number}/reviews --input .claude/pr-review-payload.json`
· curl `POST …/pulls/{number}/reviews --data @.claude/pr-review-payload.json`
· else print that exact curl command for operator paste.

### Tier B — list review threads (map comment → thread id)

GraphQL-only — REST has no thread endpoint and no `isResolved` field. This is
the ONLY way to obtain thread ids (`PRRT_…`), `isResolved`/`isOutdated`, and
each comment's integer `databaseId` for REST cross-walk. Without `gh`, emit
the command for operator paste.

```bash
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
```

`first: 100` covers virtually every real PR; past that, add
`pageInfo { endCursor hasNextPage }` and follow the cursor.

### Tier B — reply to a review thread

Primary: GraphQL `addPullRequestReviewThreadReply` with the thread id from the
listing query:

```bash
gh api graphql -f query='
  mutation($threadId: ID!, $body: String!) {
    addPullRequestReviewThreadReply(input: {
      pullRequestReviewThreadId: $threadId
      body: $body
    }) { comment { id } }
  }' -F threadId=PRRT_THREAD_ID_HERE -f body='<per-comment disposition text>'
```

curl fallback: `POST /repos/$repo_path/pulls/{pull_number}/comments/{root_comment_id}/replies`
with `{body}` — the root top-level comment's integer `databaseId`, never a
reply's id (`in_reply_to` is response-only; replies-to-replies need GraphQL).
Without `gh` or token, emit the GraphQL command for operator paste.

Shell quoting: `-f body='…'` is one single-quoted argument — escape literal
single quotes with `'\''` or pass `--field body=@file`. The reply text is the
agent-composed disposition, never a copy of the reviewer's comment. Requires
"Pull requests: write" (standard `repo`-scope token covers it).

### Tier B — resolve a review thread

GraphQL-only (`resolveReviewThread`) — NO REST equivalent, no curl tier;
without `gh`, operator paste is the only path. Resolution is gated strictly on
Decision = APPLIED per `apply-review-disposition.md § Step 6` — never
mass-resolve.

```bash
gh api graphql -f query='
  mutation($threadId: ID!) {
    resolveReviewThread(input: { threadId: $threadId }) {
      thread { id isResolved }
    }
  }' -F threadId=PRRT_THREAD_ID_HERE
```

- **403 degradation:** needs "Contents: read+write" in addition to "Pull
  requests: write". On 403 do NOT retry; read `X-Accepted-GitHub-Permissions`
  for the missing permission and degrade to replied-but-not-resolved with a
  one-line note. Best-effort, not a hard failure.
- **Resolve ≠ dismiss:** resolving threads never changes the formal review
  state — a `CHANGES_REQUESTED` review persists until the reviewer approves
  or an admin dismisses; authors cannot dismiss their own.
- **Rate limit:** pause ≥1 s between successive mutations (secondary limit:
  80 content-creating requests/min).
- **Idempotent:** re-resolving returns `isResolved: true`; safe to re-run.
  Works on outdated (rebase-orphaned) threads.

## Tier B — batched review disposition (aliased mutation)

Composes every reply and resolve of one comment-incorporation pass
(`apply-review-disposition.md` Steps 5-6) into a single `gh api graphql` call
— the default when `has_gh=true`. Additive, not a replacement: `gh` missing,
no token, non-GitHub remote, or the batch call failing outright all fall
through unchanged to the single-thread sections above. Rationale: each
reply/resolve is a gated outward mutation; batching drops N+M operator
prompts to one without weakening the approval floor.

**Fixed query template — integer-indexed aliases.** One
`reply{i}: addPullRequestReviewThreadReply(input: {pullRequestReviewThreadId: $thread{i}, body: $body{i}})`
per comment (ledger order), then one `resolve{i}: resolveReviewThread(input: {threadId: $thread{i}})`
per resolving comment, reusing the same `$thread{i}` variable. Reply aliases
precede resolve aliases — GraphQL executes top-level mutation fields serially
left-to-right, so this ordering is a hard guarantee.

**CWE-78 completeness — every data value is a variable, never query text.**
Reply bodies and thread ids bind only through the GraphQL `variables` map;
alias names and variable declarations are built purely from the loop index.
`-F` is never used for bodies or thread ids — `gh api graphql -F` applies
typed coercion (all-digits → number, `true`/`false` → boolean) and treats a
leading `@` as read-from-file; free-form strings go through `-f`/`--input`.

**Composition:** build the ledger in memory
(`{index, thread_id, reply_body, resolves}` per comment); write it as a JSON
manifest via the Write tool (never a shell heredoc containing reply text);
run a small script (argv = manifest path only) that emits the combined
`{"query": …, "variables": …}` request body to a temp file; issue ONE call:
`gh api graphql --input "$batch_payload_file"` (token-only fallback:
`curl -sf -X POST -H "Authorization: Bearer $token" https://api.github.com/graphql --data @"$batch_payload_file"`).

**Payload preview mandate:** before the single gated call, render the full
composed batch in chat — every reply body and which threads resolve — so the
one `ask` covers a payload the operator has actually seen
(`docs/dev-mode.md § Outward-Action Gate`).

**Partial failure — per-alias, not all-or-nothing.** A failed alias resolves
to `null` in `data` with its name in `errors[].path[0]`; map it back by index
and report the thread and error individually. Never retry succeeded aliases.
A `resolve{i}` 403 degrades exactly like the single-thread path — the
matching reply still counts, that resolve alone reports as skipped with the
missing-permission name.

## Tier D — project board ops (graceful skip)

`gh project` wraps Projects V2 GraphQL; no REST equivalent. Without `gh`,
skip with
`Project board update skipped — gh CLI unavailable. To move the issue manually, visit the board for {owner}/{repo}.`
and proceed — board moves are best-effort.

## status: blocked-pr-pending

`has_gh=true`, push succeeded, but `gh pr create` failed (rate limit,
transient network, label rejection):

```
agent: delivery
status: blocked-pr-pending
output: workspaces/{feature}/00-state.md § Delivery
manual_action_required: true
manual_action_file: workspaces/{feature}/inputs/pr-body.md
manual_action_url: https://github.com/{owner}/{repo}/compare/main...{branch}?expand=1
summary: Push succeeded but gh pr create failed. Branch is live on remote. Operator PR creation required.
```

Distinct from `blocked-manual-push`: the remote branch already exists; a
delivery re-run detects no PR on the existing branch and proceeds straight to
PR creation.

## `status: blocked-manual-push`

A Tier B write cannot complete automatically (no `gh`, no token, or
non-GitHub remote):

```
agent: delivery
status: blocked-manual-push
output: workspaces/{feature}/00-state.md § Delivery
manual_action_required: true
manual_action_file: workspaces/{feature}/inputs/pr-body.md
manual_action_url: https://github.com/{owner}/{repo}/compare/main...{branch}?expand=1
summary: PR not created automatically (gh unavailable). Operator paste required.
```

Resume protocol (both statuses): (1) emit a one-paragraph STOP block with the
compare URL and body file path; (2) wait for the operator reply
(`pr opened #N` → continue; `abort` → mark pipeline blocked); (3) on
continue, re-probe with a Tier A read of the new PR number and record it in
`00-state.md`.

## Operator-facing copy templates

- Tier A curl: `gh CLI unavailable. Fetched {resource} #{number} via the GitHub REST API instead.`
- Tier B curl: `gh CLI unavailable. Using $GH_TOKEN for write operation via the GitHub REST API.`
- Tier A escape hatch: `{Resource} #{number} could not be fetched automatically (gh missing and no github.com remote detected). Paste the content into workspaces/{feature}/inputs/{resource}-{number}.json and re-run the same command.`

## How to reference this file

Replace inline `gh` blocks with a one-line cross-reference at the relevant
step — e.g. `**Detection + fallback:** see `agents/_shared/gh-fallback.md` § "Tier A — read a single issue".`
The reference resolves at prompt-load time from the installed
`~/.claude/agents/_shared/` tree.
