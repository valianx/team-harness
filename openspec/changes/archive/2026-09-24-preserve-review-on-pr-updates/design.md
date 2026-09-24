## Context

See proposal.md. The comparison helper currently conflates remote movement with invalid local identity, tells Main to restart, and refreshes canonical context in place for some changes. Publication guidance also deletes artifacts on failed writes. GitHub's review API accepts an explicit reviewed commit; later changes can mark inline comments outdated.

## Goals / Non-Goals

Preserve useful review work with one captured identity and one latest observation. Keep the operator's publish choice and honest coverage. Do not add a second review engine, an automatic full rerun or an ACL policy.

## Decisions

- Valid code movement returns `reconcile-review`; conversation movement returns `reconcile-conversation`. Results remain reusable for the captured snapshot, not automatically for the new head. Corrupt identity or a different repository/PR returns `recover-context` separately. Valid comparison outcomes exit successfully.
- Refresh writes a replaceable latest-context/latest-conversation pair and uses a unique snapshot per attempt, identified by `snapshot_dir` in that latest context. Previous attempt snapshots stay intact until the owned run's cleanup, including when capture or pair promotion fails. This preserves the original context, Git objects, frozen worktree, reports and drafts. Fetch/repack in a reused bare repository was rejected because a force-push could make previously captured base objects unreachable. Existing safe pair promotion preserves the last observation on a failed refresh. Replacing the original context was rejected because it blurs which code and intent were reviewed.
- Main examines only changed evidence relevant to findings. A version-only commit does not force a rerun. If new behavior is unreviewed, Main discloses that limit and offers a historical COMMENT rather than claiming current approval.
- The normal preview and confirmation remain. Approval covers the chosen event, exact content and reviewed identity; unrelated remote movement alone does not revoke it. A changed review is shown again, retaining all original evidence.
- Publish against the reviewed SHA. If a historical inline anchor cannot be submitted, preserve its location and content in the body and present that revised review. Failed or uncertain writes preserve the run and require checking the actual GitHub outcome before retrying.

## Risks / Trade-offs

- Findings may be fixed by later commits → record current applicability when known and distinguish historical findings from current blockers.
- A live capture may fail or the PR may keep moving → preserve the snapshot and offer a scoped COMMENT with the limitation, without demanding a stationary target.
- GitHub may reject a historical commit/anchor → retain the complete draft, reconcile the transport target without pretending the newer code was reviewed, and obtain approval for changed content.

## Migration Plan

Update canonical helper/prose/tests and regenerate Codex, Claude Code and OpenCode copies. Reuse this PR's version 3.42.2. Existing complete saved runs remain resumable; no artifact-schema migration or new dependency is needed.
