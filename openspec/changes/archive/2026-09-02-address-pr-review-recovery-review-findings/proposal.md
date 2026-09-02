## Why

The PR-review recovery contract still has four fail-open or false-failure edges: deleted changed files may be treated as readable head paths, optional workspaces may be passed as required directories, symlinked worktree paths may escape the frozen snapshot, and omitted snapshot-status inputs may silently default to success. These gaps can either block a valid review or allow recovery without proof that immutable-snapshot safety still holds.

## What Changes

- Require changed-file and cited-file reads to target existing, non-symlink regular files whose resolved paths remain inside the frozen worktree; deleted-file evidence comes from the captured diff.
- Make optional workspace validation conditional so `Workspace Path: none` is never converted into a required directory.
- Require the recovery classifier caller to supply reviewed-SHA, context-hash, snapshot-integrity, and freshness statuses explicitly.
- Regenerate all Codex and packaged reviewer projections and add regression coverage for the four review findings.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `pr-review-independence`: Tighten reviewer path containment, deleted-file handling, optional workspace recovery, and explicit fail-closed snapshot-status inputs.

## Impact

The canonical PR-review workflow, reviewer/QA/security agent contracts, the deterministic recovery classifier, generated Codex and packaged projections, and focused recovery tests are affected. Immutable snapshot identity, freshness checks, preview, approved-draft hashing, and operator-controlled publication remain unchanged and fail closed.
