## Why

Team Harness should guide the current general agent through useful workflows while relying on the host's execution controls. Installation still selects a replacement OpenCode agent, and two Codex entry points retain prerequisites that contradict the shared native-workflow contract.

## What Changes

- Preserve OpenCode's absent or user-selected default agent during installation and update, and keep TH workflow discovery and collaboration guidance available through native instructions.
- Reconcile Codex init with installed-definition verification and native read-only review, without a session marker or unavailable memory attestation.
- Keep Codex pipeline workspaces under Codex's native permission boundary, without reading or provisioning Claude settings.
- Deliver the prepared documentation framing TH as a way of working, with completed OpenSpec history and independent review in the same PR.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `native-workflow-entry`: preserve the selected general agent and native instruction/permission boundaries consistently across installation and workflow entry points.

## Impact

OpenCode installer configuration and ownership handling, a concise shipped instruction resource, Codex init and pipeline activation overrides, related tests and generated distributions, and product documentation. Existing custom agent selections and unrelated instructions/settings remain intact. No dependency or public API changes are required.

## Non-Goals

No broad removal of the pipeline, control-plane, reviewers, hooks, archived specs or installer helpers. No general audit remediation, new permission layer, forced update/restart of personal installations, automatic migration of an ambiguous existing TH agent selection, or merge of the resulting PR.
