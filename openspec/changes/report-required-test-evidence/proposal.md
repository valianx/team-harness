## Why

A successful test process can omit the very test needed to demonstrate a change. Existing guidance favors isolated tests but process success alone does not establish acceptance evidence.

## What Changes

- Report execution and omission of tests selected by the change's requirements or live request, using available native runner evidence.
- Preserve command or inspection evidence when sufficient, and retain real integrations when the behavior needs them.
- Keep unavailable counts unknown and distinguish relevant omissions from unrelated optional skips.

## Capabilities

### New Capabilities

- `required-test-evidence`: A successful test process can omit the very test needed to demonstrate a change.

## Impact

Canonical testing guidance, concise implementation/spec/reviewer references and their existing runtime projections. No universal log parser or runner schema.

## Non-Goals

Mandatory full suites, test-count quotas, infrastructure installation, blanket mocking, new agents or gates.
