## Why

The direct spec lane records intent and tasks in the repository but gives the operator no compact work plan in their usual workspace. Following a small task therefore requires switching between OpenSpec files.

## What Changes

- Produce a short `01-plan.md` reading view in the configured local or Obsidian workspace before implementation approval.
- Show the intended result, work steps, progress, next action and links to the canonical change; refresh the view as work advances.
- Keep OpenSpec as the sole source of intent and task completion, and preserve the direct lane's existing approval and publication behavior.

## Capabilities

### Modified Capabilities

- `spec-direct-lane`: allow a lightweight workspace plan without pipeline activation or state.

## Impact

The spec skill, runtime projections and coordinator routing references change. No new CLI, dependency, pipeline state or approval step is introduced.

## Non-Goals

- Creating a second editable specification or task tracker.
- Adding pipeline controls, specialist dispatch or mandatory diagrams to the spec lane.
