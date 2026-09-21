# Coordinate the pipeline through native runtime tools

## Why

Pipeline guidance currently duplicates runtime authorization with leases, gate nonces and a control journal. These rituals obscure the actual objective and prevent valid continuation.

## What Changes

- pipeline-control-plane: replace current control authority with ordinary task coordination and retain legacy readers
- specialist-coordination-protocol: use bounded native assignments and useful specialist results

## Capabilities

### Modified Capabilities

- pipeline-control-plane: replace current control authority with ordinary task coordination and retain legacy readers
- specialist-coordination-protocol: use bounded native assignments and useful specialist results

## Impact

Canonical roles, skills, native adapters and their focused tests. Deliver together in one PR.

## Non-Goals

Do not replace native permissions, remove useful specialist capabilities, delete personal configuration, or rewrite historical execution records.

