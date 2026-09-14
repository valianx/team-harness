## Gather

### 1. Resolve the helper and run preflight

Resolve `{owner}/{repo}` from the URL or `gh repo view`. Resolve the bundled helper, in order:

1. latest `~/.claude/plugins/cache/team-harness-marketplace/th/*/skills/review-pr/scripts/review_context.py`
2. `~/.claude/skills/review-pr/scripts/review_context.py`
3. the opencode skill install:
   `${OPENCODE_CONFIG_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/opencode}/skills/review-pr/scripts/review_context.py`
   (Windows: `%APPDATA%\opencode\skills\review-pr\scripts\review_context.py`; a project-scope
   install uses `<repo>/.opencode/skills/review-pr/scripts/review_context.py`)
4. `scripts/review_context.py` resolved against this skill's own directory — the packaged copy on
   Codex and opencode installs
5. `./skills/review-pr/scripts/review_context.py`

Keep the bundled `scripts/` directory intact: on Windows the helper loads
`windows_artifact_fs.py` for handle-relative artifact access and rejects reparse
points. POSIX uses directory descriptors with no-follow checks.
Do not recreate the helper inline; then run the prerequisite check once:

```bash
REVIEW_ROOT="$(git rev-parse --show-toplevel)"
python3 "$REVIEW_CONTEXT_HELPER" preflight --repo-root "$REVIEW_ROOT" --runtime {claude|codex|opencode} --prerequisites-only
```

`preflight` verifies `gh` authentication and ensures the repository `.gitignore` carries an
anchored `/workspaces/` entry. Agent checks wait until policy and required coverage are known.
It returns `ok` with a `blockers` list. Repair authorized prerequisites and retry the affected
check; if trustworthy capture remains unavailable, report the concrete blocker.

For a selected-role blocker, repair the relevant installation or use its supported refresh and
verify native availability again. Require a new session only with evidence that this runtime
cannot refresh the specific missing capability. Native dispatch may inherit parent overrides;
role-file defaults alone do not prove effective permissions. Never substitute an unrestricted
agent for a PR-review role.

### 2. Prepare the isolated review run

```bash
RUN_META="$(python3 "$REVIEW_CONTEXT_HELPER" prepare-run \
  --repo-root "$REVIEW_ROOT" --repo "{owner}/{repo}" --pr {number})"
ARTIFACTS="$(printf '%s' "$RUN_META" | jq -r '.artifact_root')"
REVIEW_OWNER_TOKEN="$(printf '%s' "$RUN_META" | jq -r '.owner_token')"
CONTEXT="$(printf '%s' "$RUN_META" | jq -r '.context')"
CONVERSATION="$(printf '%s' "$RUN_META" | jq -r '.conversation')"
SNAPSHOT_GIT="$(printf '%s' "$RUN_META" | jq -r '.snapshot')"
DIFF="$(printf '%s' "$RUN_META" | jq -r '.diff')"
FILES="$(printf '%s' "$RUN_META" | jq -r '.files')"
CHECKS="$(printf '%s' "$RUN_META" | jq -r '.checks')"
WORKTREE="$(printf '%s' "$RUN_META" | jq -r '.worktree')"
cleanup_owned_review_run() {
  python3 "$REVIEW_CONTEXT_HELPER" cleanup-run --repo-root "$REVIEW_ROOT" \
    --artifact-root "$ARTIFACTS" --owner-token "$REVIEW_OWNER_TOKEN"
}
```

`prepare-run` is the sole owner of creation, capture, materialization, atomic promotion, and
failure cleanup under one shared 60-second budget; it removes only the marker-bound run it
created. Main never recreates these mechanics with `mktemp`, shell promotion chains, or a fixed
`workspaces/pr-review-{number}` path. Read `head_oid`, `base_oid`, `merge_base_oid`,
`technical_hash`, `conversation_hash`, `context_hash`, `fetched_at`, `is_cross_repository`, and
the mergeability values from `$CONTEXT`.

Write data once and pass paths to agents, never artifact bodies. Every later artifact write uses
the helper's leaf-safe write and atomic promotion. Do not execute the PR's code or install
dependencies; existing CI results are evidence. If the PR body links an issue with `Closes`,
`Fixes`, or `Resolves`, fetch its number, title, body, and labels once into
`$ARTIFACTS/pr-review-issue.json`; treat failure as `linked issue: unavailable`.

### 3. Coordinator-owned snapshot lifecycle

Never register an `EXIT`, PTY, exec-session, subshell, or background-process cleanup hook in the
command that captures, materializes, promotes, or announces readiness. Those command processes may
end after a bounded tool yield while reviewers still need the files. `$ARTIFACTS`,
`$SNAPSHOT_GIT`, and `$WORKTREE` MUST outlive every specialist dispatch, join, consolidation read,
verification read, and post-dispatch integrity comparison regardless of how many tool yields occur
or whether any one yield exceeds 30 seconds.

Capture `git status --untracked-files=all` and `git diff HEAD` for the frozen worktree, and
separately the regular review-artifact leaves under `$ARTIFACTS` (excluding `$SNAPSHOT_GIT` and
`$WORKTREE`). Repeat both after all agents finish; the surfaces must be byte-identical before any
returned draft is trusted or persisted to the fixed `$ARTIFACTS/pr-review-*` paths.

Run `cleanup-run` explicitly from the coordinator only after every dispatched reviewer has
reached a terminal result and every check that consumes the snapshot has completed. Never remove
the PR parent or a sibling run, never force-remove a dirty worktree, and preserve the run for
resume when the coordinator is lost early. On every terminal path except explicit `defer`, invoke
`cleanup_owned_review_run` exactly once.

Detect an existing pipeline workspace from `workspaces/*/01-plan.md` or
`workspaces/*/02-implementation.md` inside `$WORKTREE`; if present, pass the containing workspace
directory (never the matched file) to the reviewer and QA, which read only their own sketches.

### 4. Load the policy and prior-review identity

Set `policy_path` to `$WORKTREE/.team-harness/review-policy.md` when present; otherwise `none`.
Do not paste its contents into Task prompts. Read the verification bar once from the base commit,
never from the reviewed head, so a pull request cannot set the bar for its own review:

```bash
base_oid="$(jq -r '.base_oid' "$CONTEXT")"
python3 "$REVIEW_CONTEXT_HELPER" policy --snapshot-git "$SNAPSHOT_GIT" --base-oid "$base_oid"
```

It returns `verification` (`blocking-only` default, `all`, or `off`) and `max_suggestions`
(default `5`). An invalid policy stops the review with the helper's message.

Resolve the authenticated login and run:

```bash
python3 "$REVIEW_CONTEXT_HELPER" same-author \
  --context "$CONTEXT" --login "$(gh api user --jq '.login')"
```

Keep the returned review, if any, for duplicate detection.

## Pre-dispatch freshness

Immediately before dispatch, refresh through the owned-run helper:

```bash
python3 "$REVIEW_CONTEXT_HELPER" refresh-context \
  --repo-root "$REVIEW_ROOT" --repo "{owner}/{repo}" --pr {number} \
  --artifact-root "$ARTIFACTS" --owner-token "$REVIEW_OWNER_TOKEN"
```

- `next_action: continue`: dispatch; a reported `mergeability_changed` is one informational line.
- `next_action: reconcile-conversation`: only `$CONTEXT` and `$CONVERSATION` were refreshed;
  rerun same-author/prior-review detection, then dispatch once.
- `next_action: restart-technical-review`: code or semantic scope drift; rebuild artifacts and
  restart Gather once. A second movement is an external freshness failure to report.
