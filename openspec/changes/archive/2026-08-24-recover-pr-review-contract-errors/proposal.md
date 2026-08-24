## Why

The Codex PR-review adapter currently treats a reviewer agent's attempted read of a nonexistent, inferred path as a fatal filesystem transport failure, even when every coordinator-supplied artifact and the frozen worktree remain readable. Team Harness must correct its own mechanically detectable reviewer-contract mistakes automatically so one faulty lens cannot unnecessarily block a valid immutable review.

## What Changes

- Restrict reviewer reads to coordinator-supplied artifacts and project files verified to exist inside the frozen worktree.
- Classify nonexistent inferred or optional path reads, missing supplied-coordinate acknowledgements, missing return fields, agent-selected persistence paths, and invalid read-transport claims as Team Harness agent-contract defects.
- Add a deterministic coordinator-side recovery decision that retries the defective agent once on the same immutable snapshot without an operator decision.
- Continue after a repeated specialist contract defect with that lens marked absent and force a `COMMENT` recommendation.
- Continue to fail closed for unreadable required supplied artifacts, unreadable frozen worktrees or verified-existing paths, snapshot identity mismatch, snapshot/freshness failure, unclassifiable failures, and loss of a trustworthy canonical review draft.
- Preserve the existing preview, explicit publish approval, approved-draft hash, and publish-time freshness protections.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `pr-review-independence`: Define bounded automatic recovery for reviewer contract defects while preserving immutable-snapshot and publication safety.

## Impact

This affects the canonical `review-pr` workflow, reviewer role contracts, Codex instruction projections and packaged agent copies, the review-context helper and its generated mirrors, and focused runtime/generation tests. It introduces no external API, dependency, publication, or repository-history mutation.
