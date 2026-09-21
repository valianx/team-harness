## Why

Spec requires OpenSpec, TEA and Superpowers but currently discovers missing TEA
or Superpowers only when reaching their stages. Preparing the declared tools at
entry avoids interrupting approved work later and keeps installation upstream.

## What Changes

- Extend the existing TH dependency policy with TEA and Superpowers identities,
  tested baselines, required capabilities and official installation owners.
- At spec entry or resumption, check all three providers, reuse healthy
  installations and install or repair missing capabilities for the active host
  under existing task authority and native permissions.
- Verify installed instructions and readiness, preserving local/Obsidian outputs,
  other host settings, and honest reporting of pending activation.
- Clarify shared workspace and PR guidance for all consumer projects: working
  artifacts stay outside commits, while necessary durable project assets remain.

## Capabilities

### Modified Capabilities

- `openspec-dependency-provisioning`: shared preparation of spec dependencies.
- `workspace-canonical-local`: retain task artifacts outside consumer commits.

## Impact

The TH policy, spec entry and shared upstream integration reference, generated
Codex/OpenCode copies and dependency documentation change. Current skill
instructions consume the provider declarations; no new installer or provider
code is shipped and historical helpers are unchanged. Shared workspace and
create-pr guidance make the consumer artifact boundary explicit.

## Non-Goals

Installing every upstream workflow, configuring inactive hosts, replacing native
permissions, silently replacing Node, updating all providers on every TH update,
or adding a dependency daemon, control journal, or automatic restart.
