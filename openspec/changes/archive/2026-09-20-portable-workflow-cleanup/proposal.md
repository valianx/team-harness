# Keep workflow context portable and installation minimal

## Why

Auxiliary workflows still assume Claude paths and mandatory remote memory, while workspace hooks can select unrelated work by modification time.

## What Changes

- workspace-canonical-local: bind each flow and hook to the chosen workspace
- native-workflow-entry: preserve native discovery and remove obsolete installer paths

## Capabilities

### Modified Capabilities

- workspace-canonical-local: bind each flow and hook to the chosen workspace
- native-workflow-entry: preserve native discovery and remove obsolete installer paths
- lane-routing-predicate: select workflows by user intent and relevant needs

## Impact

Canonical roles, skills, native adapters and their focused tests. Deliver together in one PR.

## Non-Goals

Do not replace native permissions, remove useful specialist capabilities, delete personal configuration, or rewrite historical execution records.
