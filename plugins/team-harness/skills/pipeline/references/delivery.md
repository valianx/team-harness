# Delivery phase

Delivery publishes the exact commit validation accepted. Implementation already
assembled version/changelog, committed the complete branch, and recorded
`freeze_commit_sha`/`freeze_tree_sha`; acceptance is bound to that same identity.

Before Gate 3, delegate `delivery` once for workspace-only PR prose: exact title,
PR body, standalone acceptance matrix, and an independent version-axis assessment. PATCH is the default for a
backward-compatible bounded fix or improvement; MINOR requires a named material new public capability. File additions/deletions, diff size,
commit prefix, and accumulated PATCH changes never choose the axis. An incompatible supported-contract change or
committed MAJOR candidate blocks as `major-release-required` and requires a separate explicitly scoped
operator-led release-planning task; this classification takes precedence over `version-overbump` and
`version-underbump`, and delivery never selects, recommends, or validates MAJOR. Otherwise, an unsupported over- or
under-bump returns to implementation → Freeze → full validation; delivery never repairs it. Validate canonical non-symlink paths
and SHA-256 digests, bind them to `delivery_preview`, and record the committed
version plus accepted Freeze commit/tree. On total green with no closed-list
exception, record the mechanical dual record `gate3_release: auto-ship` citing
the Gate-1 release event and continue — no STOP. On a closed-list exception
(design changed, security obligation changed or surviving broke-it,
infrastructure failure), present the exception and stop for:

```text
1 — ship    (ship)
2 — amend   (amend)
3 — abort   (abort)
```

After a valid dual-record `gate3_release ∈ {ship, auto-ship}`, do not ask again and do not regenerate prose.
Re-read the exact recorded PR title/body/digests. Before the first GitHub remote
query, resolve the operator-owned identity route with the helper relative to the
loaded setup skill:

```bash
python3 ../../setup/scripts/manage_github_identities.py --runtime codex resolve \
  --repo-root '<absolute repo root>' --host '<remote host>'
```

Resolve the helper to an absolute path before execution; never derive it from
the repository. `status: no-match` preserves the current active-account
behavior with one warning. For `strategy: isolated-config`, set the returned
`GH_CONFIG_DIR` on every subsequent `git` and `gh` command. For
`strategy: account-switch`, inspect `gh auth status`, switch only when required,
and first acquire the cross-runtime `team-harness-gh-account-switch/v1` lock
defined in `docs/github-identities.md`. Keep its ownership nonce across account
switching, login verification, all remote reads, push, PR creation/mutation, and
the final snapshot; refresh its heartbeat before each protected command and
release it in a `finally` path. Its 60-second acquisition timeout, ownership
checks, and conservative stale-lock recovery fail closed. A sandbox denial on
`gh auth switch`, credential storage, `.git`, network, or a required CLI is
retried immediately with narrowly scoped native escalation. Do not recommend
login or token refresh when authentication state is successful.

Before an outward write, require `gh api user -q .login` to equal the resolved
account. A mismatch or failed verification blocks. Never read, print, store, or
dispatch token bytes. Then require:

```bash
git status --porcelain                  # empty
git branch --show-current               # working_branch
git rev-parse HEAD                      # freeze_commit_sha
git rev-parse 'HEAD^{tree}'             # freeze_tree_sha
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
snapshot without backoff, polling, or waiting for CI/merge. A non-zero query or
response missing requested fields records a failed observation: report the
known PR URL/number with `mergeability: UNDETERMINED`,
`ci_snapshot: unavailable`, `snapshot_status: query-failed`, and one sanitized
error line. Do not repeat unchanged transport; query again only after a
verifiable transport/permission change or an explicit need for a fresher
snapshot. Set `phase: complete` immediately after terminal artifacts and
the PR are present; otherwise record the precise recoverable failure. Before
that terminal state transition, close delivery with the measured or unavailable
`phase.end` from [observability.md](observability.md), update the same current
usage/cost aggregate as every other phase, and rewrite the summary from the
trace. A missing native root identifier yields an unavailable result; it never
authorizes an estimate, a reused subtotal, or a price inference.

New Obsidian runs already live in the vault and perform no delivery-time copy.
When recovering a legacy snapshot with `obsidian_sync: armed`, preserve its
recorded one-way export behavior; this compatibility path never applies to a
new run.
