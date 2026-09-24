## Why

PR review currently discards a completed draft and restarts when the PR head changes, including a version-only commit. The operator wants to retain completed review work and still decide whether to publish it.

## What Changes

- Keep immutable review evidence and drafts across head, base, code, conversation and mergeability changes.
- Replace automatic technical restart with coordinator reconciliation limited to affected findings; disclose unreviewed changes and publish snapshot-scoped COMMENT when current applicability cannot be established.
- Preserve the existing preview and publication choice. External PR movement alone does not revoke approval of unchanged, accurately scoped review bytes.
- Preserve drafts and reports on publication/reconciliation errors for a supported resume instead of terminal cleanup.
- Align comparison outcomes, canonical workflow prose, regression coverage and generated runtime copies.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `pr-review-drift-tolerance`: PR movement preserves completed work and uses bounded reconciliation rather than restart.
- `pr-review-independence`: publication retains accurate snapshot identity, preview choice and evidence integrity without requiring a stationary remote PR.
- `pr-regression-evidence`: retain reproduction evidence for its compared commits without attributing it to later code.

## Impact

Review context comparison and the review-pr capture, resume, consolidation and publication guidance for Codex, Claude Code and OpenCode. Reuses the release bump in this PR and the existing shared workspace.

## Non-Goals

Default auto-publication, removing the operator's approval, rewriting native permissions, rerunning all specialists, accepting corrupted evidence, or automatically editing the reviewed PR.
