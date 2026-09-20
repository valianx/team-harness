## Why

TH workflows independently resolve workspace paths and retained context. This
duplicates instructions, loses continuity when a checkout changes, and makes a
workspace look like a pipeline-only facility. The operator wants a shared skill
that ordinary work and specialized flows can use without Context Harness.

## What Changes

- Add the automatically discoverable `workspace` skill as the common method for
  selecting, reusing and maintaining local or Obsidian workspaces.
- Prefer a workspace for substantive work while keeping brief conversation and
  read-only status free of unnecessary writes and empty artifact scaffolds.
- Route general-agent guidance, workflow adapters and workspace consumers to
  that method, preserving existing pipeline identity and native permissions.
- Keep product intent in repository OpenSpec and working context outside tracked
  product files; retain the original workspace across sessions and worktrees.

## Capabilities

### Modified Capabilities
- `workspace-canonical-local`: shared workspace method beyond pipelines,
  lightweight context and runtime-independent continuity.

## Non-Goals

No new state machine, registry, permission layer, approval gate or background
service. No migration/deletion of existing workspaces, MCP configuration or
remote data. No wholesale repair of the audit backlog or removal of Context
Harness from unrelated legacy flows in this change.

## Impact

Canonical skills and general-agent guidance, generated Codex/OpenCode skill
projections, workspace consumers and the existing workspace specification.
