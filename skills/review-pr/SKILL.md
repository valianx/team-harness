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
- `--resume-from-draft` → validate the saved `.claude/pr-review-context.json` against GitHub before using `.claude/pr-review-final.md` (or `.claude/pr-review-draft.md`). If code or conversation changed, discard the stale draft and restart at Phase 1.
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

**Required sketch reading (mid-pipeline entry):** after the guard probe, read every `sketches/*` file present in the workspace before the reviewer agent begins its pass. In a multi-project initiative, resolve sketch paths from `{overview_root}/sketches/{project}-{name}` (and `{overview_root}/sketches/service-interaction.md` for the shared service-interaction sketch). These sketch files are required reading — they define the contract the diff is being reviewed against.

**Fail-open:** if the script exits non-zero or the workspace cannot be located, continue. The probe is informational only — it never blocks the review flow.

---
name: review-pr

## Mode 1 — PR number or URL provided

### Resume entry

When `--resume-from-draft` is present, require both a non-empty draft and `.claude/pr-review-context.json`. Resolve the helper, capture `.claude/pr-review-context-resume.json`, and compare it with the saved context before showing the draft.

- `current` → load repository, PR number, `reviewed_head_sha`, and `context_hash` from the saved context; continue at Phase 4.
- Any change → delete the stale draft, promote the refreshed context, and restart Phase 1.
- Missing context or failed capture → STOP. A legacy draft without snapshot identity cannot be published.

### Phase 1 — Gather (all Bash happens here, in the main context)

1. Extract the PR number from the input (e.g., `#45`, `45`, or full URL)

2. Resolve `{owner}/{repo}` from the PR URL or `gh repo view`. Resolve a Python 3 interpreter and the bundled context helper:

   ```bash
   REVIEW_CONTEXT_HELPER=""
   PLUGIN_BASE="${HOME}/.claude/plugins/cache/team-harness-marketplace/th"
   if [ -d "$PLUGIN_BASE" ]; then
     LATEST=$(ls -1 "$PLUGIN_BASE" 2>/dev/null | sort -V | tail -1)
     [ -f "$PLUGIN_BASE/$LATEST/skills/review-pr/scripts/review_context.py" ] &&
       REVIEW_CONTEXT_HELPER="$PLUGIN_BASE/$LATEST/skills/review-pr/scripts/review_context.py"
   fi
   [ -z "$REVIEW_CONTEXT_HELPER" ] &&
     [ -f "${HOME}/.claude/skills/review-pr/scripts/review_context.py" ] &&
     REVIEW_CONTEXT_HELPER="${HOME}/.claude/skills/review-pr/scripts/review_context.py"
   [ -z "$REVIEW_CONTEXT_HELPER" ] &&
     [ -f "./skills/review-pr/scripts/review_context.py" ] &&
     REVIEW_CONTEXT_HELPER="./skills/review-pr/scripts/review_context.py"
   ```

   Do not rewrite the helper inline. Set `has_gh=true` after its authenticated access succeeds. If `gh`, Python 3, the helper, or authenticated PR access is unavailable, STOP with `cannot capture a trustworthy PR snapshot — authenticate gh or paste the diff and conversation`. A review without verifiable head and conversation identity is not publishable.

3. Capture the canonical context:

   ```bash
   CONTEXT=.claude/pr-review-context.json
   CONVERSATION=.claude/pr-review-conversation.md
   python3 "$REVIEW_CONTEXT_HELPER" capture \
     --repo "{owner}/{repo}" --pr {number} --git-dir "$(git rev-parse --show-toplevel)" \
     --output "$CONTEXT"
   python3 "$REVIEW_CONTEXT_HELPER" render \
     --context "$CONTEXT" --output "$CONVERSATION"
   ```

   The helper:
   - captures `baseRefOid`, `headRefOid`, merge base, commits, files, formal reviews, issue comments, inline comments, and paginated GraphQL review threads;
   - preserves thread identity, replies, resolved/outdated state, timestamps, and commit identity;
   - removes bot boilerplate and applies semantic context limits;
   - fetches exact immutable refs under `refs/team-harness/review-pr/{number}/`;
   - fails if the PR moves while it is being captured.

   Load PR metadata from `$CONTEXT`. Store `reviewed_head_sha`, `reviewed_base_sha`, `reviewed_merge_base_sha`, `context_hash`, and the two immutable git refs. These values identify every downstream draft.

4. Detect linked issue: search the captured PR body for patterns like `Closes #N`, `Fixes #N`, `Resolves #N`
   - If found: fetch issue data. **Detection + fallback:** see `agents/_shared/gh-fallback.md` § "Tier A — read a single issue". When `has_gh=true`: `gh issue view {N} --json number,title,body,labels`. When `has_gh=false`: use the curl fallback; if unavailable, linked issue = "none" (best-effort).
   - If not found: linked issue = "none"

5. Get the diff and file list only from the immutable refs recorded in the context:
   ```
   git diff {frozen_base_ref}...{frozen_head_ref}
   ```
   Save the full diff output. If it exceeds ~3000 lines, keep only the first 2000 lines and append a note: `\n[DIFF TRUNCATED — {total} lines total, showing first 2000. Use Read tool for full file context.]`

6. Get changed file list (1 Bash call):
   ```
   git diff --name-only {frozen_base_ref}...{frozen_head_ref}
   ```

7. **Create a detached temporary worktree at `reviewed_head_sha`** so agents read the exact snapshot:
   ```sh
   WORKTREE="${TMPDIR:-/tmp}/team-harness-pr-review-{N}"
   git worktree add --detach "$WORKTREE" "$reviewed_head_sha"
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
     rm -f .claude/pr-review-context*.json .claude/pr-review-conversation.md 2>/dev/null || true
     git update-ref -d "refs/team-harness/review-pr/{N}/base" 2>/dev/null || true
     git update-ref -d "refs/team-harness/review-pr/{N}/head" 2>/dev/null || true
   }
   trap cleanup EXIT
   ```

8. **Detect workspaces** (team-harness pipeline PRs carry AC):
   ```sh
   workspaces_PATH=""
   if ls "$WORKTREE/workspaces/"*/01-plan.md 2>/dev/null | head -1 | grep -q .; then
     workspaces_PATH=$(ls "$WORKTREE/workspaces/"*/01-plan.md 2>/dev/null | head -1 | xargs dirname)
   elif ls "$WORKTREE/workspaces/"*/02-implementation.md 2>/dev/null | head -1 | grep -q .; then
     workspaces_PATH=$(ls "$WORKTREE/workspaces/"*/02-implementation.md 2>/dev/null | head -1 | xargs dirname)
   fi
   has_workspaces=false
   [ -n "$workspaces_PATH" ] && has_workspaces=true
   ```
   Pass `workspaces_PATH` to qa when dispatched.

9. Read `$CONVERSATION` and pass it to the reviewer as `Conversation Context`. Pass only commit OIDs and subjects from `$CONTEXT` as `Commits`. Do not pass raw bot comments, full commit bodies, or line-tail truncations.

10. Resolve the authenticated login and use the helper for the same-author lookup:

   ```bash
   current_user=$(gh api user --jq '.login')
   python3 "$REVIEW_CONTEXT_HELPER" same-author \
     --context "$CONTEXT" --login "$current_user"
   ```

   Store the returned review, if any. This replaces shell environment interpolation and always uses the complete paginated review set.

### Step 1.4 — Auto-suggest multi-reviewer for large PRs (no cost warning per operator policy)

After step 8, compute diff size:

```bash
diff_lines=$((additions + deletions))
diff_files=$(git diff --name-only {frozen_base_ref}...{frozen_head_ref} | wc -l)
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

Read `is_cross_repo` from `$CONTEXT`; do not query a potentially newer PR state for this decision.

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

**Note:** Tier 0 (docs-only) PRs are exempt from the reviewer's project-version/changelog check by construction — the reviewer's user-facing gate reuses this Tier 0 classification and produces no finding when Gate 2 fails.

**Emit one line to the operator:**
```
PR classified as Tier {N} — agents: {list}.
```

### Phase 2.9 — Pre-Dispatch Freshness Barrier

Immediately before dispatch, capture `.claude/pr-review-context-dispatch.json` with the same helper and compare it with `$CONTEXT`:

```bash
python3 "$REVIEW_CONTEXT_HELPER" compare \
  --expected "$CONTEXT" --actual .claude/pr-review-context-dispatch.json
```

- `current` (exit 0) → delete the refresh file and dispatch.
- `conversation-changed` (exit 10) or `code-changed` (exit 20) → do not dispatch with mixed inputs. Remove the temporary worktree, promote the new context, render it, and restart Phase 1 from the frozen refs.
- capture/compare failure → STOP. Never review when freshness cannot be established.

Allow one automatic restart. If the PR changes again during the second capture, surface `PR is moving while review starts — retry when pushes/comments settle` and stop.

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
   - Reviewed Head SHA: {reviewed_head_sha}
   - Base SHA: {reviewed_base_sha}
   - Merge Base SHA: {reviewed_merge_base_sha}
   - Context Hash: {context_hash}
   - Commits: {commit list from $CONTEXT}
   - Conversation Context: {rendered $CONVERSATION}
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
     - Reviewed Head SHA: {reviewed_head_sha}
     ```
   - security dispatch (always at Tier 3+):
     ```
     Direct Mode Task:
     - Mode: pr-review-security
     - Worktree: {WORKTREE}
     - PR: #{number}
     - Reviewed Head SHA: {reviewed_head_sha}
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
   - Reviewed Head SHA: {reviewed_head_sha}
   - Context Hash: {context_hash}
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
   - Reviewed Head SHA: {reviewed_head_sha}
   - Base SHA: {reviewed_base_sha}
   - Merge Base SHA: {reviewed_merge_base_sha}
   - Context Hash: {context_hash}
   - Commits: {commit list from $CONTEXT}
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
   - Conversation Context: {rendered $CONVERSATION}
   - Behavioral Result: {behavioral_result}
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
    - Reviewed Head SHA: {reviewed_head_sha}
    ```

12. For Tier 3/4 (single-reviewer path), also dispatch security in parallel with reviewer:
    ```
    Direct Mode Task:
    - Mode: pr-review-security
    - Worktree: {WORKTREE}
    - PR: #{number}
    - Reviewed Head SHA: {reviewed_head_sha}
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
   - Reviewed Head SHA: {reviewed_head_sha}
   - Context Hash: {context_hash}
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

Use the same-author result captured in Phase 1:

- No prior non-dismissed review → proceed to Phase 4.
- Prior review with `commit_id == reviewed_head_sha` → STOP without publishing a duplicate:

  ```
  Prior review by {current_user} (ID: {review_id}) already covers
  {reviewed_head_sha}. No duplicate review posted.
  ```

- Prior review on another commit, or without a usable `commit_id` → proceed to Phase 4. State in the preview that the new review supersedes review `{review_id}` by SHA.

Do not dismiss the prior review. GitHub review history is evidence: the new review is explicitly bound to the newer SHA and the prior submission remains attributable to its original commit. This also prevents a cancelled or failed replacement from destroying the previous review state.

### Phase 4 — Decision Menu

**Verify the draft exists.** Check that the canonical draft path was created and is not empty. If it's missing or empty:
- Tell the user: "The review agent did not produce the review draft. Retrying once."
- Re-invoke the review dispatch (go back to Phase 3)
- If it fails a second time, report the error and stop

Read the canonical draft and display the full review draft to the user.

Display the reviewed snapshot and any superseded review before the menu:

```
Reviewed head: {reviewed_head_sha}
Context captured: {fetched_at}
Supersedes: review {review_id} on {prior_commit_id}  # omit when none
```

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

### Phase 4.9 — Pre-Publish Freshness Barrier

After operator approval and immediately before the write, capture `.claude/pr-review-context-publish.json` and compare it with `$CONTEXT`.

- `current` → proceed immediately to Phase 5.
- `code-changed` → do not publish. Report the old and new head SHAs, invalidate the draft, and restart from Phase 1 against the new snapshot.
- `conversation-changed` → do not publish a review that ignores new discussion. Replace the context, rerender it, and rerun Phase 3 once against the same frozen code before showing a new preview.
- capture/compare failure → STOP with `freshness could not be verified — review not published`.

This barrier is fail-closed. Operator approval applies to the displayed draft and its `context_hash`; it does not authorize publishing a materially different or stale context.

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
     --arg commit_id "{reviewed_head_sha}" \
     --argjson comments "$(cat .claude/pr-review-inline.json 2>/dev/null || echo '[]')" \
     '{body: $body, event: $event, commit_id: $commit_id, comments: $comments}' \
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
  - `.claude/pr-review-context*.json`, `.claude/pr-review-conversation.md` (snapshot and rendered ledger)
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
- **Snapshot-bound publication:** every draft has `reviewed_head_sha` and `context_hash`; Phase 2.9 and Phase 4.9 must confirm them. The atomic review POST includes `commit_id: reviewed_head_sha`.
- **Same-author continuity:** do not duplicate a review on the same SHA. A review on a newer SHA may supersede an older review without dismissing history.
- **Atomic submission for fresh reviews.** The `gh api POST .../reviews` call (Phase 5) includes body + event + comments[] in a single call. NEVER split into `gh pr review` + separate `gh api pulls/:n/comments`. This applies to both the `gh` and curl paths.
- **GitHub API model:** a submitted review and its inline comments remain immutable historical evidence. Re-reviews are fresh SHA-bound submissions; they do not rewrite or dismiss prior history.
- **Tier classification:** Tier 0/1 → reviewer only. Tier 2 → reviewer + qa (if AC found). Tier 3/4 → reviewer + qa + security (parallel). Auto-escalation: any security-sensitive path or keyword → Tier 4.
- **Decision menu:** operator always picks the action explicitly. The recommendation hint is advisory only. Options: approve / request changes / comment only / defer / cancel.
- **Cleanup is trap-style** — worktree and draft files are removed even on early exit via the EXIT trap registered in step 7.
- **Multi-reviewer:** `--multi` / `--reviewers <focuses>` dispatches N focused reviewers in parallel, then the `reviewer-consolidator` merges the results plus any qa/security drafts. Auto-triggers when diff exceeds `AUTO_MULTI_LINES_THRESHOLD` or `AUTO_MULTI_FILES_THRESHOLD`. **No cost-warning UI** — per operator policy, multi-reviewer runs silently with one info line.
- **Re-review continuity:** when a prior review's body contains `## Hallazgos por enfoque`, `--multi` is automatically applied to preserve focus coverage on re-review.
