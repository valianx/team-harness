## Why

Delegated Codex roles currently select Astra or Luna, and pipeline aliases can inherit the chat model. The operator wants GPT 6.1 Sol for delegation while retaining independent chat selection.

## What Changes

- Pin all delivered Codex specialists and aliases to Sol 6.1.
- Preserve current reasoning efforts and migrate formerly managed fallback pairs with backup.
- Keep chat model selection independent and report unavailable native dispatch honestly.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `codex-runtime-parity`: specialist model projection and managed fallback migration.

## Impact

Codex registry, generator, setup/update helpers, packaged agents, dispatch instructions and regression tests.

## Non-Goals

Changing Claude/OpenCode models, changing chat models, or implementing the separate spec retention proposal.
