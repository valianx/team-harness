## Why

The whole-project audit found reproducible installation defects, inaccurate command evidence and active guidance that still describes retired workflow controls. Fixing these together makes the supported workflows consistent without introducing another permission or orchestration layer.

## What Changes

- Preserve literal Windows installer arguments and custom MCP headers across repeated reconciliation; isolate interactive installer tests.
- Resolve setup version from the selected plugin and remove retired generated package assets during synchronization.
- Keep hook-owned output inside its workspace and report the command actually executed when a quality version probe fails.
- Align active installation, migration, issue, testing and research guidance with native hosts and advisory coordination; correct public documentation and small test/CI selection defects.
- Retain unresolved research proposals as open issues with explicit evidence gaps.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `setup-write-outcomes`: literal launcher arguments, selected version, repeatable managed configuration.
- `codex-runtime-parity`: generated package convergence.
- `native-workflow-entry`: consistent supported guidance and bounded hook outputs.
- `quality-runner-diagnostics`: accurate failed-probe evidence.

## Impact

Windows bootstraps, Go installer reconciliation/tests, skill synchronization, retained context hooks, quality evidence, maintained tests, runtime setup overrides and active documentation. Generated distributions follow canonical inputs. Working evidence remains in the existing Obsidian workspace.

## Non-Goals

No replacement harness, model-policy changes, runtime permission changes, database changes or frontend layout redesign. No bulk deletion of historical contracts. No claim that issues #661/#662 have completed their controlled quality/cost evaluation. Unreproduced process-tree timeout and update-cache hypotheses remain documented for targeted follow-up.
