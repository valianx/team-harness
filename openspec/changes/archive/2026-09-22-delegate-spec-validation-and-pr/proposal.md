## Why

Spec currently executes validation and PR preparation in Main unless it happens
to delegate. The operator wants those phases to run in explicit native agents,
using Sol in Codex and OpenCode and Opus in Claude Code, while the chat agent
keeps written intent, implementation and final decisions.

## What Changes

- Dispatch a bounded validation agent when spec reaches Validation, retaining
  the existing provider methods, independent review choice and shared workspace.
- Dispatch a PR agent for candidate preparation and authorized publication,
  reusing its session and current evidence instead of repeating validation.
- Ship both native roles with GPT-6 Sol in Codex/OpenCode and Opus in Claude
  Code; keep existing pipeline roles and custom concrete selections intact.
- Report actual dispatch, execution and unavailable capabilities honestly.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `spec-direct-lane`: explicit delegated validation and PR execution under Main.
- `codex-runtime-parity`: native projections for the two phase roles.

## Impact

Canonical roles and workflow prose, Codex projections, OpenCode converters and
their parity tests, current documentation and generated distributions.

## Non-Goals

No main-agent replacement, implementation delegation mandate, pipeline redesign,
review scoring authority, new execution engine, provider copies, model benchmark,
permission changes or modification of the operator's active chat model.
