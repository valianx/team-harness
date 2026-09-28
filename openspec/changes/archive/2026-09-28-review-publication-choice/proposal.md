## Why

After previewing a complete PR review, choosing a publication action currently triggers another approval when its event differs from the recommendation. The operator already chose what to publish; this duplicate prompt delays delivery and can leave the review unpublished.

## What Changes

- Treat an unambiguous choice of Approve, Request changes or Comment only as confirmation to publish the displayed review with that event.
- Align the verdict line with the chosen event and proceed without another confirmation when findings, comments and destination are unchanged.
- Retain approval for genuinely new content or authority, native GitHub constraints, defer/cancel and recovery without duplicate writes.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `pr-review-drift-tolerance`: publication choice confirms the displayed review even when the chosen event differs from the initial recommendation.

## Impact

Shared review-pr publication guidance and its Codex/OpenCode projections. This amendment joins PR #688 and reuses its version bump and workspace. No executable publisher, model, permission or external-provider change.

## Non-Goals

No review publication to the repository in the supplied example, automatic publication without an operator choice, silent event/account substitution, or changes to finding verification and GitHub permissions.
