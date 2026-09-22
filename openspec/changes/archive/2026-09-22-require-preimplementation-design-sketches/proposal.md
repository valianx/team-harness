## Why

Optional sketches let database and frontend implementation begin without a concrete design. An operator reported adding more than thirty columns and spending a day removing all but two; the workflow should expose unnecessary persistence and UI decisions before implementation.

## What Changes

- Always create or update and present a data-model sketch for database changes and a wireframe for frontend work before implementing the affected surface, in spec, pipeline and direct work.
- Explain the minimal persistence delta and each new field's requirement, producer and consumer; distinguish stored values from derived or reused data.
- Carry the agreed design into OpenSpec and implementation/validation, using the existing local or Obsidian workspace and existing authorization.
- Retain optional on-demand sketches for other surfaces, without restoring retired guards or a second approval ceremony.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workspace-canonical-local`: require relevant database/frontend previews before implementation and reconcile the delivered change with their design decisions.

## Impact

Canonical sketch/development guidance, relevant role routing, generated Codex/OpenCode projections, and workflow verification. Consumer projects receive the same guidance. No database or frontend implementation is added to TH itself.

## Non-Goals

No new security harness, sketch guard, universal sketch set, provider installation engine, automatic schema designer, or changes to the operator's affected application.
