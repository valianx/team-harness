## Why

The four-phase flow separates implementation and validation, but its implement entry makes validation conditional on being named in the request. An ordinary implementation request can therefore end before the agreed evidence is collected. The operator wants validation to follow immediately, without another message.

## What Changes

- Make applicable validation part of completing an implementation request, while retaining two visible, successive phases.
- Preserve an explicit earlier stop and genuine missing decisions; a phase boundary alone does not require operator input.
- Carry the same intent, workspace, selected methods and valid evidence into validation across Codex, Claude Code and OpenCode.
- Record this as a new amendment to the four-phase capability, preserving the earlier archived change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `four-phase-development`: Implementation requests continue directly into applicable validation unless the operator explicitly requests an earlier stop.

## Impact

The shared phase reference, implement skill and its native projections. Existing testing and review methods remain selected by scope; working evidence stays in the existing local or Obsidian workspace.

## Non-Goals

No phase merger, blanket tool execution, new workflow engine, permission changes, automatic PR publication or merge, provider installation changes, or rewrite of earlier archived intent.
