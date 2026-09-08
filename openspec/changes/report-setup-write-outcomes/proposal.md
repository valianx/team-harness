## Why

Workspace permission setup describes operator approval and decline but can announce provisioned rules without an explicit outcome for a rejected or failed write. Retired intake wording also misidentifies the active provisioning site.

## What Changes

- Separate operator decline from runtime refusal or execution failure.
- Verify the resulting configuration before reporting success; disclose partial or unknown state when appropriate.
- Continue independent setup steps without repeated rejected writes or widening permissions, and correct obsolete site references.

## Capabilities

### New Capabilities

- `setup-write-outcomes`: Workspace permission setup describes operator approval and decline but can announce provisioned rules without an explicit outcome for a rejected or failed write.

## Impact

Canonical setup skill and permission-provisioning documentation plus their shipped projections. Existing keys, destinations and permission semantics stay intact.

## Non-Goals

New allowlists, permission expansion, alternate write paths, new configuration schemas or setup redesign.
