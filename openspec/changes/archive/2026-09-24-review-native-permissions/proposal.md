## Why

PR-review capture creates shared directories with owner-only permissions. On Windows with Python 3.13, this blocks ACL inheritance and prevents native sandbox reviewers from reading the captured PR even when they can read the repository. TH should provide a workflow using the host's permissions rather than impose a second access policy.

## What Changes

- Create review directories with normal platform defaults, respecting inherited Windows ACLs and the POSIX umask.
- Preserve existing directory permissions and the isolated snapshot lifecycle.
- Document recovery for previously restricted directories through the native host, and cover permission inheritance with native Windows regression tests.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `pr-review-independence`: required review artifacts remain accessible under native permissions without a TH owner-only directory policy.

## Impact

Shared review capture helper, its Codex/OpenCode distributions, snapshot guidance and maintained filesystem tests. No new dependencies, permission manager or runtime settings.

## Non-Goals

Changing native sandbox policy, automatically rewriting existing project ACLs, removing snapshot identity or cleanup ownership, and reviewing the consumer PR's business logic.
