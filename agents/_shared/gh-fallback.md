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
   `session-docs/{feature}/inputs/{resource}-{N}.json`, prompt the operator to
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
session-docs/{feature}/inputs/issue-{number}.json and re-run the same command.
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

### Tier B — create a PR

```bash
if [ "$has_gh" = "true" ]; then
  gh pr create --title "{title}" --body "{body}" --base main --head {branch}
elif [ "$is_github" = "true" ] && [ -n "${GH_TOKEN:-${GITHUB_TOKEN:-}}" ]; then
  token="${GH_TOKEN:-$GITHUB_TOKEN}"
  curl -sf -X POST \
    -H "Authorization: Bearer $token" \
    -H "Accept: application/vnd.github+json" \
    -H "Content-Type: application/json" \
    "https://api.github.com/repos/$repo_path/pulls" \
    --data "{\"title\":\"{title}\",\"body\":\"{body}\",\"head\":\"{branch}\",\"base\":\"main\"}"
else
  # Write body to file and surface for operator paste
  mkdir -p session-docs/{feature}/inputs
  cat > session-docs/{feature}/inputs/pr-body.md << 'PRBODY'
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
  echo "Body: session-docs/{feature}/inputs/pr-body.md"
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
  curl -sf -X PATCH \
    -H "Authorization: Bearer $token" \
    -H "Accept: application/vnd.github+json" \
    -H "Content-Type: application/json" \
    "https://api.github.com/repos/$repo_path/pulls/{number}" \
    --data "{\"body\":\"{body}\"}"
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
  curl -sf -X POST \
    -H "Authorization: Bearer $token" \
    -H "Accept: application/vnd.github+json" \
    -H "Content-Type: application/json" \
    "https://api.github.com/repos/$repo_path/issues" \
    --data "{\"title\":\"{title}\",\"body\":\"{body}\",\"labels\":[\"{label}\"]}"
else
  mkdir -p session-docs/{feature}/inputs
  cat > session-docs/{feature}/inputs/issue-create.md << 'ISSUEBODY'
{SDD-formatted issue body}
ISSUEBODY
  echo "GitHub CLI unavailable — issue not created automatically."
  echo "Paste the body from session-docs/{feature}/inputs/issue-create.md into GitHub,"
  echo "then reply with the new issue number."
fi
```

### Tier B — edit an issue

```bash
if [ "$has_gh" = "true" ]; then
  gh issue edit {number} --body "{body}"
elif [ "$is_github" = "true" ] && [ -n "${GH_TOKEN:-${GITHUB_TOKEN:-}}" ]; then
  token="${GH_TOKEN:-$GITHUB_TOKEN}"
  curl -sf -X PATCH \
    -H "Authorization: Bearer $token" \
    -H "Accept: application/vnd.github+json" \
    -H "Content-Type: application/json" \
    "https://api.github.com/repos/$repo_path/issues/{number}" \
    --data "{\"body\":\"{body}\"}"
else
  mkdir -p session-docs/{feature}/inputs
  cat > session-docs/{feature}/inputs/issue-edit.md << 'EDITBODY'
{updated issue body}
EDITBODY
  echo "Update issue body manually at: https://github.com/$repo_path/issues/{number}"
  echo "Body written to: session-docs/{feature}/inputs/issue-edit.md"
fi
```

### Tier B — comment on an issue

```bash
if [ "$has_gh" = "true" ]; then
  gh issue comment {number} --body "{comment}"
elif [ "$is_github" = "true" ] && [ -n "${GH_TOKEN:-${GITHUB_TOKEN:-}}" ]; then
  token="${GH_TOKEN:-$GITHUB_TOKEN}"
  curl -sf -X POST \
    -H "Authorization: Bearer $token" \
    -H "Accept: application/vnd.github+json" \
    -H "Content-Type: application/json" \
    "https://api.github.com/repos/$repo_path/issues/{number}/comments" \
    --data "{\"body\":\"{comment}\"}"
else
  mkdir -p session-docs/{feature}/inputs
  cat > session-docs/{feature}/inputs/issue-comment.md << 'COMMENTBODY'
{comment body}
COMMENTBODY
  echo "Paste the comment from session-docs/{feature}/inputs/issue-comment.md"
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

## `status: blocked-manual-push`

When a Tier B write cannot be completed automatically (no `gh`, no token, or
non-GitHub remote), consumers report this new status value:

```
agent: delivery
status: blocked-manual-push
output: session-docs/{feature}/00-state.md § Delivery
manual_action_required: true
manual_action_file: session-docs/{feature}/inputs/pr-body.md
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
session-docs/{feature}/inputs/{resource}-{number}.json and re-run the same command.
```

**When escape hatch is used (Tier B — PR create):**
```
GitHub CLI unavailable — PR not created automatically.

Branch pushed to origin. Open the PR manually:

  https://github.com/{owner}/{repo}/compare/main...{branch}?expand=1

Title (copy/paste):
  {title}

Body: session-docs/{feature}/inputs/pr-body.md

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
