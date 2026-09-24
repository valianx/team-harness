## Why

Team Harness can finish repository edits without entering `create-pr`, and its current version check runs only after a PR is opened. This has let agents omit release metadata and still publish a candidate that requires repair.

## What Changes

- Route completed repository changes through the shared `create-pr` workflow regardless of whether they change code, tests, documentation or configuration.
- Check version metadata against the base before publishing a PR, using the same deterministic helper in local preparation and CI.
- Keep OpenSpec design conditional and clarify its upstream status display rather than adding placeholder files.

## Capabilities

### New Capabilities

- `pr-candidate-integrity`: common PR routing and release metadata preflight.

### Modified Capabilities

None.

## Impact

Native workflow guidance, delivery instructions, a Node preflight, CI, focused tests and generated skill/runtime copies. The release convention remains a single version and changelog entry per PR that changes distributed assets.

## Non-Goals

No automatic merge, release tag, permission bypass, new OpenSpec schema or extra per-change design document.
