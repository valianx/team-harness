# Delivery phase

Delivery publishes the exact commit validation accepted. Implementation already
assembled version/changelog, committed the complete branch, and recorded
`freeze_commit_sha`/`freeze_tree_sha`; acceptance copied them to
`validated_commit_sha`/`validated_tree_sha`.

Before Gate 3, delegate `delivery` once for workspace-only PR prose: exact title,
PR body, and standalone acceptance matrix. Validate canonical non-symlink paths
and SHA-256 digests, bind them to `delivery_preview`, present the committed
version plus validated commit/tree, and stop for:

```text
1 — ship    (ship)
2 — amend   (amend)
3 — abort   (abort)
```

After a valid dual-record `gate3_release: ship`, do not ask again and do not regenerate prose.
Re-read the exact recorded PR title/body/digests, then require:

```bash
git status --porcelain                  # empty
git branch --show-current               # working_branch
git rev-parse HEAD                      # validated_commit_sha
git rev-parse 'HEAD^{tree}'             # validated_tree_sha
```

Use full object IDs. A mismatch blocks and returns to implementation → Freeze →
validation. Delivery does not run tests, fetch or reconcile the default branch,
edit version/changelog, stage files, commit, merge, or rebase. Base movement is
reported without mutating refs: immediately before push, use `git ls-remote` for the recorded
default-base tip, compare its full SHA with `verification_base_ref`, and report `current`,
`moved`, or `unknown` with both SHAs. This repeats the Gate-3 signal; it does not invalidate the
accepted commit or authorize a fetch, merge, or rebase.

Require one of the repository's allowed delivery prefixes and a non-default `working_branch` that is
not `main` or `master`. Push that plain branch without force, then create the draft
PR with exact approved title/body and recorded label/assignee metadata in the
same command. An existing draft may receive the exact approved update; an
existing ready-for-review PR is surfaced and never downgraded or mutated. Merge,
tag, release, publication, issue comments, and board mutations remain excluded.
Native Codex approval may still appear as a technical runtime boundary; it is
not a new Team Harness decision or gate.

Poll mergeability once with bounded `UNKNOWN` backoff and report the current CI
snapshot without waiting. Set `phase: complete` only after terminal artifacts and
the PR are present; otherwise record the precise recoverable failure.
