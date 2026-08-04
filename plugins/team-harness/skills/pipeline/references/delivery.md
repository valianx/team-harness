# Delivery phase

Delivery publishes the exact commit validation accepted. Implementation already
assembled version/changelog, committed the complete branch, and recorded
`freeze_commit_sha`/`freeze_tree_sha`; acceptance copied them to
`validated_commit_sha`/`validated_tree_sha`.

Before Gate 3, delegate `delivery` once for workspace-only PR prose: exact title,
PR body, standalone acceptance matrix, and an independent version-axis assessment. PATCH is the default for a
backward-compatible bounded fix or improvement; MINOR requires a named material new public capability. File additions/deletions, diff size,
commit prefix, and accumulated PATCH changes never choose the axis. An incompatible supported-contract change or
committed MAJOR candidate blocks as `major-release-required` and requires a separate explicitly scoped
operator-led release-planning task; this classification takes precedence over `version-overbump` and
`version-underbump`, and delivery never selects, recommends, or validates MAJOR. Otherwise, an unsupported over- or
under-bump returns to implementation → Freeze → full validation; delivery never repairs it. Validate canonical non-symlink paths
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

Query mergeability exactly once, report `UNKNOWN` as `UNDETERMINED`, and report the current CI
snapshot without retry, backoff, polling, or waiting for CI/merge. A non-zero
query or response missing requested fields consumes that one attempt: report the
known PR URL/number with `mergeability: UNDETERMINED`,
`ci_snapshot: unavailable`, `snapshot_status: query-failed`, and one sanitized
error line. Never retry or reopen delivery for the failed read. Set `phase: complete` immediately after terminal artifacts and
the PR are present; otherwise record the precise recoverable failure. Before
that terminal state transition, close delivery with the measured or unavailable
`phase.end` from [observability.md](observability.md), update the same current
usage/cost aggregate as every other phase, and rewrite the summary from the
trace. A missing native root identifier yields an unavailable result; it never
authorizes an estimate, a reused subtotal, or a price inference.
