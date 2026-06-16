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
- `--converge` → opt-in flag that activates dual-review convergence. Set `converge=true` when this flag is present. When absent, convergence is still auto-enabled for Tier 4 PRs (see Phase 2 Tier Classification — the existing Tier-4 detection predicate triggers convergence without requiring the flag).

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

When entering mid-pipeline (i.e., a workspace folder for this feature already exists in `workspaces/`), run `hooks/sketch-guard.sh` as a best-effort prerequisite probe before the review begins. This surfaces any missing sketch artifacts to the operator before the gather step executes.

Resolve the script through the documented 3-tier chain before invoking:

```bash
# 3-tier resolution: plugin cache -> ~/.claude/hooks/ -> ./hooks/
PLUGIN_BASE="${HOME}/.claude/plugins/cache/team-harness-marketplace/th"
SKETCH_GUARD=""
if [ -d "$PLUGIN_BASE" ]; then
  LATEST=$(ls -1 "$PLUGIN_BASE" 2>/dev/null | sort -V | tail -1)
  if [ -n "$LATEST" ] && [ -f "$PLUGIN_BASE/$LATEST/hooks/sketch-guard.sh" ]; then
    SKETCH_GUARD="$PLUGIN_BASE/$LATEST/hooks/sketch-guard.sh"
  fi
fi
if [ -z "$SKETCH_GUARD" ] && [ -f "${HOME}/.claude/hooks/sketch-guard.sh" ]; then
  SKETCH_GUARD="${HOME}/.claude/hooks/sketch-guard.sh"
fi
if [ -z "$SKETCH_GUARD" ] && [ -f "./hooks/sketch-guard.sh" ]; then
  SKETCH_GUARD="./hooks/sketch-guard.sh"
fi

if [ -n "$SKETCH_GUARD" ]; then
  bash "$SKETCH_GUARD" "${WORKSPACE_PATH}" 2>/dev/null
else
  echo "sketch-guard probe unavailable — skipping"
  # In pipeline context: append a *.skipped event to the execution-events JSONL
fi
```

Parse the JSON output. If `verdict: concerns`, show a one-line banner before the gather step begins:
```
Note: sketch-guard found concerns for this workspace — {concerns[0]}. Proceeding with review.
```

**Required sketch reading (mid-pipeline entry):** after the guard probe, read every `sketches/*.md` file present in the workspace before the reviewer agent begins its pass. In a multi-project initiative, resolve sketch paths from `{overview_root}/sketches/{project}-{name}.md` (and `{overview_root}/sketches/service-interaction.md` for the shared service-interaction sketch). These sketch files are required reading — they define the contract the diff is being reviewed against.

**Fail-open:** if the script exits non-zero or the workspace cannot be located, continue. The probe is informational only — it never blocks the review flow.

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
     rm -f .claude/pr-review-*-A.md .claude/pr-review-*-A.json 2>/dev/null || true
     rm -f .claude/pr-review-*-B.md .claude/pr-review-*-B.json 2>/dev/null || true
     rm -f .claude/pr-review-convergence.json 2>/dev/null || true
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

9. **Fetch PR conversation and prior reviews as review context** (best-effort INPUT step — never blocks the review).

   **Detection + fallback:** see `agents/_shared/gh-fallback.md` § "Tier A — read PR comments". Run the probe (already set in step 2). Collect issue-level comments and line-level review comments separately, then fetch all prior formal reviews:

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

   **Also fetch all prior formal reviews (all authors)** — store in `$prior_reviews`. This captures every reviewer's verdict and summary so the current reviewer can interact with prior findings rather than duplicate them.

   ```bash
   prior_reviews=""
   prior_reviews_fetched=false
   if [ "$has_gh" = "true" ]; then
     prior_reviews=$(gh api repos/{owner}/{repo}/pulls/{number}/reviews \
       --jq '.[] | "[\(.user.login) | \(.state) | \(.submitted_at[:16])] \(.body[:200])"' \
       2>/dev/null || true)
     prior_reviews_fetched=true
   elif [ "$is_github" = "true" ]; then
     auth_header=""
     token="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
     [ -n "$token" ] && auth_header="-H \"Authorization: Bearer $token\""
     prior_reviews=$(curl -sf $auth_header \
       -H "Accept: application/vnd.github+json" \
       "https://api.github.com/repos/{owner}/{repo}/pulls/{number}/reviews?per_page=100" \
       2>/dev/null | python3 -c "
import sys, json
d = json.load(sys.stdin)
lines = [f'[{r[\"user\"][\"login\"]} | {r[\"state\"]} | {r[\"submitted_at\"][:16]}] {r[\"body\"][:200]}' for r in d]
print('\n'.join(lines))
" 2>/dev/null || true)
     prior_reviews_fetched=true
   fi

   # Distinguish: gh/curl unavailable vs. fetch succeeded but PR has zero reviews.
   # Both sentinels are treated as "no prior-review context; proceed" by the reviewer.
   if [ -z "$prior_reviews" ]; then
     if [ "$prior_reviews_fetched" = "true" ]; then
       prior_reviews="(none — no prior reviews on this PR)"
     else
       prior_reviews="(none — reviews not fetched: gh unavailable)"
     fi
   fi
   ```

   Store result in `$prior_reviews`. Truncate if the output exceeds ~100 lines: keep the 50 most recent lines with a truncation note prepended.
   Pass `$prior_reviews` to Phase 3 dispatcher as the `Prior Reviews:` field alongside `PR Comments:`.

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
   - Prior Reviews: {$prior_reviews from step 9 — all-authors formal reviews; "(none — reviews not fetched: gh unavailable)" when unavailable, "(none — no prior reviews on this PR)" when the PR has none}
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
   - Prior Reviews: {$prior_reviews from step 9 — all-authors formal reviews; "(none — reviews not fetched: gh unavailable)" when unavailable, "(none — no prior reviews on this PR)" when the PR has none}
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

### Phase 3.1 — Dual-Review Convergence (when active)

**When convergence is active:** `converge=true` (set by `--converge` flag OR by Tier 4 auto-on — the Tier-4 classification in Phase 2 automatically sets `converge=true` using the existing Tier-4 detection predicate; no new keyword list is introduced). When `converge=false`, skip this sub-section and proceed directly to Phase 3.5.

**Convergence state initialization:**
```sh
convergence_round=1
convergence_status=running   # running | converged | escalated
# Record initial convergence block in 00-state.md convergence field
```

**Per-round loop (max 3 rounds):**

For each round while `convergence_status == running` and `convergence_round <= 3`:

1. **Dispatch Pass A and Pass B concurrently.** Each pass dispatches the orchestrator in `review-consolidate` mode with:
   ```
   Direct Mode Task:
   - Mode: review-consolidate
   - Convergence Pass: A          # or B for the second dispatch
   - Focuses: {focuses list}
   - Has QA draft: {true|false}
   - Has Security draft: {true|false}
   - Draft Output: .claude/pr-review-final-A.md    # -B for Pass B
   - Inline Output: .claude/pr-review-inline-A.json  # -B for Pass B
   - PR: #{number}
   - Title: {title}
   - Author: {author}
   - URL: {url}
   ```
   **Isolation contract:** each pass receives only the original diff/policy/PR metadata. No prior-round artifacts are passed forward. Pass A and Pass B NEVER read each other's `-A` / `-B` draft files.

2. **Wait for both passes to complete.** Read `event` from each pass's status block.

3. **Comparator — three branches:**
   - Both emit `APPROVE` → `convergence_status=converged`, `canonical_draft_path=.claude/pr-review-final-A.md` (either pass; A is canonical), `convergence_verdict=CONVERGED_APPROVE`. Break loop.
   - Both emit `REQUEST_CHANGES` → `convergence_status=converged`, `canonical_draft_path=.claude/pr-review-final-A.md`, `convergence_verdict=CONVERGED_CHANGES`. Break loop.
   - Passes diverge (one `APPROVE`, one `REQUEST_CHANGES`):
     - If `convergence_round < 3`: increment `convergence_round`, delete the `-A` and `-B` draft files from this round, continue loop (fresh round — reviewers receive only original inputs on the next iteration).
     - If `convergence_round == 3`: `convergence_status=escalated`. **STOP and escalate** — do NOT proceed to Phase 3.5 or Phase 4. Surface the escalation block below and wait for operator instruction.

4. **Record round event** in the execution-events trace:
   ```
   {"event": "review.convergence.round", "round": {N}, "verdict_A": "{A}", "verdict_B": "{B}", "outcome": "{converged_approve|converged_changes|divergent_continue|divergent_escalate}"}
   ```
   Update `00-state.md` convergence block: `round`, `last_verdict_A`, `last_verdict_B`, `status`.

**Round-state file:** write `.claude/pr-review-convergence.json` after each round:
```json
{
  "pr": "{number}",
  "round": {N},
  "verdict_A": "{APPROVE|REQUEST_CHANGES}",
  "verdict_B": "{APPROVE|REQUEST_CHANGES}",
  "status": "{running|converged|escalated}"
}
```

**Escalation STOP block (round 3, divergent):**
```
STOP — Dual-Review Convergence: reviewer disagreement after 3 rounds.
Pass A verdict: {APPROVE | REQUEST_CHANGES}  (.claude/pr-review-final-A.md)
Pass B verdict: {APPROVE | REQUEST_CHANGES}  (.claude/pr-review-final-B.md)

Both review bodies are available for operator review.
The system does not auto-resolve this disagreement. Operator decides the final verdict.
Options:
  (a) Accept Pass A verdict and body → run /th:review-pr {N} --resume-from-draft (after copying A to final)
  (b) Accept Pass B verdict and body → run /th:review-pr {N} --resume-from-draft (after copying B to final)
  (c) Cancel → discard all drafts, do not publish

Choose [a/b/c]:
```
On `(c)` or no response: discard all drafts (cleanup trap fires). Do NOT publish.

**After convergence loop completes (non-escalated):** `canonical_draft_path` is `.claude/pr-review-final-A.md`. Proceed to Phase 3.5.

### Phase 3.5 — Prior Review Check (MANDATORY before proceeding to Phase 4)

Before showing the draft and presenting the decision menu, fetch all reviews on this PR (all authors) and then filter to the current author to detect a same-author prior review. **Detection + fallback:** see `agents/_shared/gh-fallback.md` § "Tier A — read prior PR reviews". When `has_gh=true`:
```bash
# Resolve current user for same-author check
current_user=$(gh api user --jq '.login' 2>/dev/null || echo "")

# Fetch all reviews (all authors) — reuse $prior_reviews from Phase 1 step 9 when available
all_reviews=$(gh api repos/{owner}/{repo}/pulls/{number}/reviews 2>/dev/null || echo "[]")

# Filter to same-author review and extract id + commit_id for staleness comparison
same_author_review=$(echo "$all_reviews" | python3 -c "
import sys, json
reviews = json.load(sys.stdin)
import os; u = os.environ.get('CURRENT_USER', '')
matches = [r for r in reviews if r.get('user', {}).get('login') == u]
if matches:
    r = matches[-1]
    print(f'id={r[\"id\"]} state={r[\"state\"]} submitted_at={r[\"submitted_at\"]} commit_id={r.get(\"commit_id\", \"\")} body_excerpt={r[\"body\"][:120]}')
" CURRENT_USER="$current_user" 2>/dev/null || true)
```
When `has_gh=false`: use the curl fallback to fetch the reviews list (all authors), then filter client-side. If unavailable, default to treating as "no prior review" (worst case is a duplicate review, recoverable via dismiss).

- **If NO prior review exists** from the same author → proceed to Phase 4 (decision menu).

- **Re-review continuity detection:** if a prior review exists, inspect its body for the `## Hallazgos por enfoque` section header. If found, the prior review was a multi-reviewer run. Auto-apply `multi_reviewer=true` for this re-review (preserves focus coverage). Emit one line: "Prior review was multi-reviewer — applying --multi for continuity."

- **If a prior review exists**, determine whether new commits have landed since that review by comparing the prior review's `commit_id` (the head SHA the review was submitted against) with the current PR head SHA (already fetched in Phase 1 step 4 as `headRefName`, resolved to a SHA via `git rev-parse origin/{headRefName}`):

  ```bash
  pr_head_sha=$(git rev-parse origin/{headRefName} 2>/dev/null || echo "")
  # Extract commit_id from same_author_review parse output
  prior_commit_id=$(echo "$same_author_review" | grep -oP 'commit_id=\K\S+' 2>/dev/null || echo "")
  ```

  **Three-way automatic branch — no interactive menu:**

  1. **No prior review** → proceed to Phase 4 (decision menu, fresh review flow). *(covered above)*

  2. **Prior review + no new commits** (i.e. `prior_commit_id` is non-empty AND equals `pr_head_sha`) → emit one operator-facing note and STOP without dismissing or posting:
     ```
     Prior review by {current_user} (ID: {review_id}, {submitted_at}) is current — no new commits since it was submitted. No duplicate review posted. Re-run after pushing new commits to refresh the review.
     ```
     Do NOT dismiss the prior review. Do NOT post a new review.

  3. **Prior review + new commits since it** (i.e. `prior_commit_id` differs from `pr_head_sha`, OR `prior_commit_id` is unavailable — treat as "new commits" when uncertain: the safe default is a fresh review, never skip silently) → automatically dismiss the prior review and proceed to Phase 4:

     ```bash
     # Dismiss the existing review automatically (no prompt)
     gh api -X PUT repos/{owner}/{repo}/pulls/{number}/reviews/{review_id}/dismissals \
       -f message="Superseded by new review"
     ```
     **Detection + fallback:** Tier B — use `gh api -X PUT` when available, curl PATCH fallback with token, or operator instruction.

     Verify the dismiss succeeded. If it fails, report the error and STOP — do not attempt to post a new review over an undismissed one.

     Emit one operator-facing line:
     ```
     Prior review by {current_user} (ID: {review_id}) dismissed — new commits detected since {submitted_at}. Proceeding to fresh review.
     ```

     Proceed to Phase 4 (decision menu, fresh review flow with atomic submission).

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
- `net_new == 0` (all findings overlap prior reviews or are already resolved) → `(e) cancel` (post nothing) if there are no new substantive points, or `(c) comment only` with a single-line Spanish summary if a one-line acknowledgement adds value
- 0 critical findings, 0 high-priority, `net_new > 0` → `(a) approve`
- 0 critical, 1+ high-priority, `net_new > 0` → `(c) comment only`
- 1+ critical, `net_new > 0` → `(b) request changes`

**If operator picks `(d) defer`:**
- Ensure draft is at `.claude/pr-review-final.md` (copy from canonical path if needed).
- Remove the cleanup trap so files persist.
- Print: "Draft saved to .claude/pr-review-final.md. Run /th:review-pr {N} --resume-from-draft to publish later."
- STOP cleanly. Do NOT remove the worktree (it may be needed for reference). Note: operator should remove it manually or it will be cleaned up at session end.

**If operator picks `(e) cancel`:**
- Discard all draft files (cleanup trap fires on EXIT).
- STOP.

**If operator selects `(a)`, `(b)`, or `(c)`:**
- Proceed to Phase 4.9.

**If operator requests edits before committing:**
- Modify the draft per feedback, show again, repeat until a final choice is made.

### Phase 4.9 — Pre-Publish Concurrent Review Check (best-effort, before Phase 5 POST)

Before submitting to GitHub, re-fetch the reviews list to detect any new review that landed after the Phase 1 step-9 snapshot. This prevents publishing a duplicate when a concurrent reviewer completed while this review was in progress.

```bash
# ETag-conditional re-fetch (best-effort — degrade to publish-as-chosen on any failure)
reviews_now=""
if [ "$has_gh" = "true" ]; then
  reviews_now=$(gh api repos/{owner}/{repo}/pulls/{number}/reviews \
    --jq '[.[] | {login: .user.login, state: .state, submitted_at: .submitted_at, body_excerpt: .body[:120]}]' \
    2>/dev/null || echo "")
elif [ "$is_github" = "true" ]; then
  auth_header=""
  token="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
  [ -n "$token" ] && auth_header="-H \"Authorization: Bearer $token\""
  reviews_now=$(curl -sf $auth_header \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/{owner}/{repo}/pulls/{number}/reviews?per_page=100" \
    2>/dev/null || echo "")
fi
```

**If the re-fetch succeeds**, compare the review count and authors against `$prior_reviews` from Phase 1 step 9. When a new review appears that was not in the Phase 1 snapshot AND its findings overlap the current draft (same file paths), surface a one-line prompt:

```
Nueva revisión de {author} cubrió hallazgos similares hace {N}s. ¿Publicar igual? [s/n]:
```

- If the operator answers `n` → discard all draft files (cleanup trap fires). STOP.
- If the operator answers `s`, or the re-fetch fails (any error, timeout, unavailable), or no overlapping new review was detected → proceed to Phase 5 immediately (publish as chosen).

**Degrade contract:** Phase 4.9 is best-effort. Any failure (non-zero exit, parse error, timeout) MUST NOT block publication. Log a one-line note (`Pre-publish check unavailable — publishing as chosen`) and proceed to Phase 5.

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
  - `.claude/pr-review-final-A.md`, `.claude/pr-review-inline-A.json` (convergence Pass A drafts)
  - `.claude/pr-review-final-B.md`, `.claude/pr-review-inline-B.json` (convergence Pass B drafts)
  - `.claude/pr-review-convergence.json` (convergence round-state file)
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
- **ONE review per author per PR.** A fresh review is created only when no prior review exists (Phase 5) or after the automatic dismiss in the Phase 3.5 new-commits branch. NEVER publish a second review without dismissing first.
- **Atomic submission for fresh reviews.** The `gh api POST .../reviews` call (Phase 5) includes body + event + comments[] in a single call. NEVER split into `gh pr review` + separate `gh api pulls/:n/comments`. This applies to both the `gh` and curl paths.
- **GitHub API model:** A submitted review is an immutable container for inline comments. You cannot add inline comments to an already-submitted review. The re-review path is always dismiss (`PUT .../dismissals`) followed by a fresh atomic `POST .../reviews` — there is no in-place edit path for inline comments.
- **Tier classification:** Tier 0/1 → reviewer only. Tier 2 → reviewer + qa (if AC found). Tier 3/4 → reviewer + qa + security (parallel). Auto-escalation: any security-sensitive path or keyword → Tier 4.
- **Decision menu:** operator always picks the action explicitly. The recommendation hint is advisory only. Options: approve / request changes / comment only / defer / cancel.
- **Cleanup is trap-style** — worktree and draft files are removed even on early exit via the EXIT trap registered in step 7.
- **Multi-reviewer:** `--multi` / `--reviewers <focuses>` dispatches N focused reviewers in parallel, then the `reviewer-consolidator` merges the results plus any qa/security drafts. Auto-triggers when diff exceeds `AUTO_MULTI_LINES_THRESHOLD` or `AUTO_MULTI_FILES_THRESHOLD`. **No cost-warning UI** — per operator policy, multi-reviewer runs silently with one info line.
- **Re-review continuity:** when a prior review's body contains `## Hallazgos por enfoque`, `--multi` is automatically applied to preserve focus coverage on re-review.
