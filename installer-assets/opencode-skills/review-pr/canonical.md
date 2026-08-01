
Analyze `$ARGUMENTS`. Accept a PR number (`45`, `#45`) or URL.

## Options

- `--reviewers <focus[,focus]>`: request explicit lenses. `general` and `architecture`
  use reviewer passes; `security` selects the security specialist.
- `--multi`: shorthand for `--reviewers general,architecture`.
- `[TIER: N]`: compatibility override. Tier 4 forces the security specialist; other values do not add reviewers.
- `--resume-from-draft`: publish a saved draft only after snapshot validation.
- `--auto-publish`: operator opt-in to skip the preview menu.
- `--converge`: compatibility alias for `--multi`. Run one set of independent passes; never loop until models agree.

Remove options before parsing the PR identifier.

## Non-negotiable invariants

1. Invoke `orchestrator` for every agent dispatch. Agents run no Bash.
2. Bind every artifact and GitHub review to the captured `head_oid` and `context_hash`.
3. Review the detached worktree, never the operator's checkout or a moving branch.
4. Fail closed when code or semantic conversation freshness cannot be verified.
5. Never publish without preview and explicit approval unless `--auto-publish` was supplied.
6. Publish one atomic GitHub review containing `body`, `event`, `commit_id`, and `comments`.
7. Keep each finding in one public channel:
   - an anchored finding lives in an inline thread;
   - a genuinely cross-file finding lives in the review body;
   - the body may count inline findings but must not repeat them.
8. Preserve every supported blocking finding. Brevity removes repetition and optional commentary, never blockers.

## Resume

Require `.claude/pr-review-context.json`, a non-empty body draft, and
`.claude/pr-review-inline.json` (an empty JSON array is valid). Capture a fresh context and run
`review_context.py compare`.

- `current`: continue at Preview.
- Any change: discard the draft and restart at Gather.
- Capture failure or missing snapshot identity: stop; do not publish a legacy or stale draft.

## Gather

### 1. Resolve the helper and repository

Resolve `{owner}/{repo}` from the URL or `gh repo view`. Require authenticated `gh`, Python 3,
and the bundled helper. Resolve it in this order:

1. latest `~/.claude/plugins/cache/team-harness-marketplace/th/*/skills/review-pr/scripts/review_context.py`
2. `~/.claude/skills/review-pr/scripts/review_context.py`
3. `./skills/review-pr/scripts/review_context.py`

If any prerequisite is unavailable, stop with:

```text
cannot capture a trustworthy PR snapshot — authenticate gh or paste the diff and conversation
```

Do not recreate the helper inline.

### 2. Capture immutable context

```bash
REVIEW_ROOT="$(git rev-parse --show-toplevel)"
ARTIFACTS="$REVIEW_ROOT/.claude"
CONTEXT="$ARTIFACTS/pr-review-context.json"
CONVERSATION="$ARTIFACTS/pr-review-conversation.md"

python3 "$REVIEW_CONTEXT_HELPER" capture \
  --repo "{owner}/{repo}" --pr {number} --git-dir "$REVIEW_ROOT" \
  --output "$CONTEXT"
python3 "$REVIEW_CONTEXT_HELPER" render \
  --context "$CONTEXT" --output "$CONVERSATION"
```

Read metadata and immutable refs from `$CONTEXT`. Store `head_oid`, `base_oid`,
`merge_base_oid`, `context_hash`, `fetched_at`, `is_cross_repository`, and the classified and raw
mergeability values.

### 3. Materialize review artifacts

Write data once and pass paths to agents. Do not duplicate the diff, policy, or conversation
inside Task prompts.

```bash
DIFF="$ARTIFACTS/pr-review-diff.patch"
FILES="$ARTIFACTS/pr-review-files.txt"
CHECKS="$ARTIFACTS/pr-review-checks.txt"

git diff "{frozen_base_ref}...{frozen_head_ref}" > "$DIFF"
git diff --name-only "{frozen_base_ref}...{frozen_head_ref}" > "$FILES"
gh pr checks {number} --repo "{owner}/{repo}" > "$CHECKS" 2>&1 || true
```

Do not execute the PR's code or install dependencies. Existing CI results are evidence; local
test execution is an explicit operator action outside this skill.

If the PR body links an issue with `Closes`, `Fixes`, or `Resolves`, fetch its number, title,
body, and labels once into `.claude/pr-review-issue.json`. Treat failure as
`linked issue: unavailable`, not as a reason to weaken snapshot checks.

### 4. Create the frozen worktree and cleanup trap

```bash
WORKTREE="${TMPDIR:-/tmp}/team-harness-pr-review-{number}"
git worktree add --detach "$WORKTREE" "$head_oid"
```

Register an EXIT trap immediately. It removes the worktree, all
`.claude/pr-review-{context*,conversation,diff,files,checks,issue,draft*,final*,inline*,qa,security,payload}.*`
artifacts, and `refs/team-harness/review-pr/{number}/{base,head}`. Never force-remove an
unexpected dirty worktree; surface it.

Capture `git status --untracked-files=all` and `git diff HEAD` for both the frozen worktree and
review-artifact root before dispatch. Repeat after all agents finish. The snapshots must be
byte-identical; surface any mutation as a defect before trusting a returned draft. Only after this
check may the coordinator persist inline returns to the fixed `.claude/pr-review-*` paths.

Detect an existing pipeline workspace from `workspaces/*/01-plan.md` or
`workspaces/*/02-implementation.md` inside `$WORKTREE`. If present:

- run the resolved `sketch-guard.sh` probe best-effort;
- pass the workspace path to the reviewer and QA;
- let each receiving agent read only the sketches relevant to its own lens.

Do not preload or paste sketches into dispatches.

### 5. Load optional policy and prior-review identity

Set `policy_path` to `$WORKTREE/.team-harness/review-policy.md` when present; otherwise use
`none`. Do not paste its contents into Task prompts.

Resolve the authenticated login and run:

```bash
python3 "$REVIEW_CONTEXT_HELPER" same-author \
  --context "$CONTEXT" --login "$(gh api user --jq '.login')"
```

Keep the returned review, if any, for duplicate detection.

## Select lenses

The default is one `general` reviewer. PR size alone never adds reviewers.

Run the local selector before adding specialist agents:

```bash
python3 "$REVIEW_CONTEXT_HELPER" select-security \
  --changed-files "$FILES" --diff "$DIFF" \
  {--explicit-security when requested} {--tier 4 when supplied}
```

The selector returns `known-sensitive`, `known-non-executable`, `unmatched-executable`, or
`indeterminate`. Only `known-non-executable` without an explicit security request or Tier 4 may
omit the security lens. A missing helper, unreadable input, or invalid result is
`indeterminate` and requires security.

Add specialist agents only from concrete signals:

- **QA:** a pipeline workspace with acceptance criteria exists and the diff changes executable
  behavior. Skip for docs, changelog, package metadata, formatting, and configuration-only
  changes unless an AC explicitly describes that surface.
- **Security:** the selector reports `security_required: true`.
- **Focused reviewer passes:** only `general`/`architecture`, and only when explicitly requested
  through `--reviewers`/`--multi`.
  A large PR remains one general pass; report coverage limits instead of multiplying opinions.

The general reviewer owns goal fit, correctness, public contracts, error behavior, and
change-caused regressions. QA owns acceptance evidence. Security owns exploitability and trust
boundaries. Do not ask two lenses to perform the same generic review.

Emit one line:

```text
Review lenses: general{, qa}{, security}{, explicit: focus...}.
```

## Pre-dispatch freshness

Capture a new context immediately before dispatch and compare it with `$CONTEXT`.

- `current`: dispatch.
- `conversation-changed` or `code-changed`: rebuild artifacts and restart Gather once.
- A second movement or capture failure: stop without reviewing.

## Dispatch

The four PR agents are `reviewer`, `pr-review-qa`, `pr-review-security`, and
`reviewer-consolidator`. Their source manifests and OpenCode projections are deny-by-default and
read-only. Codex dispatch is unavailable unless a Team Harness Codex projection exists and its
capability validator confirms the same exact allowlist; never inherit a general agent's authority.
Host overrides after Team Harness emits an artifact are outside this guarantee.

Pass coordinates and artifact paths, not artifact bodies:

```text
Direct Mode Task:
- Mode: review
- Focus: general
- PR: #{number}
- Repository: {owner}/{repo}
- Title: {title}
- Author: {author}
- Base: {base_ref}
- Head: {head_ref}
- Reviewed Head SHA: {head_oid}
- Base SHA: {base_oid}
- Merge Base SHA: {merge_base_oid}
- Context Hash: {context_hash}
- Mergeability: {clean|conflicting|indeterminate}
- Raw Mergeable: {raw mergeable value}
- Raw Merge State: {raw mergeStateStatus value}
- Worktree: {WORKTREE}
- Review Artifacts Root: {ARTIFACTS absolute path}
- Context Path: {CONTEXT}
- Conversation Path: {CONVERSATION}
- Diff Path: {DIFF}
- Changed Files Path: {FILES}
- Checks Path: {CHECKS}
- Policy Path: {policy_path or "none"}
- Workspace Path: {workspace_path or "none"}
- Linked Issue Path: {.claude/pr-review-issue.json absolute path or "none"}
- Draft Output: .claude/pr-review-draft{suffix}.md
- Inline Output: .claude/pr-review-inline{suffix}.json
```

For explicit general/architecture passes, change `Focus` and use a focus suffix. Dispatch
independent passes in parallel. Never dispatch both a security-focused reviewer and the security
specialist for the same review.

When selected, dispatch QA and `pr-review-security` in parallel with only their required
coordinates:

```text
Mode: pr-review-qa | pr-review-security
PR: #{number}
Reviewed Head SHA: {head_oid}
Context Hash: {context_hash}
Worktree: {WORKTREE}
Workspace Path: {workspace_path or "none"}
Context Path: {CONTEXT}
Diff Path: {DIFF}
Changed Files Path: {FILES}
```

Every lens returns its draft inline with the exact reviewed SHA and context hash. Reject a missing
or mismatched value. After the strict post-dispatch snapshots pass, the coordinator alone persists
returns using this fixed mapping: reviewer body → `.claude/pr-review-draft.md`, reviewer findings →
`.claude/pr-review-draft-inline.json`, QA → `.claude/pr-review-qa.md`, security →
`.claude/pr-review-security.md`, consolidator body → `.claude/pr-review-final.md`, and consolidator
findings → `.claude/pr-review-inline.json`. Ignore any output path proposed by an agent.

If only the general reviewer ran, its body and inline JSON are canonical. If any additional
draft exists, dispatch `review-consolidate` once with the source file paths, `head_oid`, and
`context_hash`. The consolidator produces:

- `.claude/pr-review-final.md`
- `.claude/pr-review-inline.json`

There is no automatic convergence loop.

## Output contract

The canonical GitHub review has two surfaces.

### Body

Use a compact index:

```markdown
## Review

Reviewed: head `{head_oid}` against base `{base_oid}` at `{fetched_at}`
Verdict: **APPROVE | REQUEST CHANGES | COMMENT**
Findings: **{N} blocking**, **{M} suggestions**
Checks: {concise CI summary or "not available"}
Mergeability at capture: **{clean|conflicting|indeterminate}** (`mergeable={raw}`, `mergeStateStatus={raw}`)

{Only cross-file findings that cannot be anchored to one changed line. Omit when empty.}
```

Do not include reviewability scores, estimated time, file counts, per-agent sections, repeated
inline findings, praise, or out-of-scope observations by default.

Target at most 80 lines and 900 words. If supported cross-file blockers require more, preserve
them and remove optional prose; never truncate a blocker.

### Inline threads

Use one comment per actionable, line-anchored finding:

```markdown
**Blocking: {claim}**

{Evidence and consequence in at most three short sentences.}

**Fix:** {concrete correction in at most two short sentences.}
```

Use `Suggestion` instead of `Blocking` for non-blocking improvements. Publish every supported
blocker. Keep at most five suggestions globally. Omit style-only nitpicks.

Inline JSON must contain only GitHub fields:

```json
[{"path":"src/file.ts","line":42,"side":"RIGHT","body":"..."}]
```

Every inline finding requires `side: LEFT | RIGHT`. Validate the full `(path, line, side)` anchor
against the frozen diff before preview and preserve `side` unchanged in the published comments.

## Prior-review check

- No prior review from this author: continue.
- Prior review with `commit_id == head_oid`: stop; do not duplicate it.
- Prior review on another SHA: preview the new review as superseding that historical review.

Never dismiss prior reviews automatically.

## Preview

Require a non-empty body and valid inline JSON. Retry the producing agent once for a missing or
invalid artifact; then stop.

Unless `--auto-publish` was supplied, show:

1. reviewed head SHA, base SHA, and capture time;
2. classified mergeability and both raw GitHub values;
3. the exact body;
4. every inline comment with path, line, and side;
5. any superseded review ID;
6. the recommended event.

Then ask:

```text
(a) approve
(b) request changes
(c) comment only
(d) defer
(e) cancel
```

`defer` copies the canonical body to `.claude/pr-review-final.md`, preserves that file, inline
JSON, and context for `--resume-from-draft`, removes the worktree/nonessential artifacts, and
disables the EXIT trap before returning. `cancel` removes all artifacts. Operator edits require
another complete preview.

## Pre-publish freshness

After approval and immediately before the GitHub write, capture and compare again. Require exact
head, base, merge-base, and mergeability equality with the approved capture.

- `current`: proceed directly to the write.
- Any mismatch, including conversation or mergeability drift: invalidate approval and restart
  Gather.
- Capture or comparison failure: invalidate approval and restart Gather with
  `freshness could not be verified — review not published`.

Approval applies only to the displayed `context_hash`.
Never describe `conflicting` or `indeterminate` mergeability as merge-ready.
`clean` describes only the displayed captured head/base/time; it never asserts current external
readiness. State that the external system can change after Team Harness's final local check.

## Publish

Map the operator choice to `APPROVE`, `REQUEST_CHANGES`, or `COMMENT`. Submit exactly once:

```bash
jq -n \
  --arg body "$(cat "$CANONICAL_DRAFT")" \
  --arg event "$EVENT" \
  --arg commit_id "$head_oid" \
  --argjson comments "$(cat .claude/pr-review-inline.json 2>/dev/null || echo '[]')" \
  '{body: $body, event: $event, commit_id: $commit_id, comments: $comments}' \
| gh api -X POST "repos/{owner}/{repo}/pulls/{number}/reviews" --input -
```

Never split the body and inline comments across API calls. Check the exit status, report the
exact error on failure, and run cleanup on every terminal path.

Final response:

```text
Review on PR #{number} published against {head_oid}.
Run /compact before reviewing another PR in this session.
```

## No input

Ask for a PR number or URL and stop.
