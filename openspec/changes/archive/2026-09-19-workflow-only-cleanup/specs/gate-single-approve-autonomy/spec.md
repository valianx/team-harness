## REMOVED Requirements

### Requirement: The deterministic guard covers only the minimal outward floor
**Reason**: `dev-guard` and the other TH execution interceptors are retired.
**Migration**: Preserve existing operator authorization and the native runtime permission model; do not install compensating native allow rules or infer new authority from the absence of a hook.

## ADDED Requirements

### Requirement: Publication uses operator authorization and native permissions
Workflow publication SHALL use the existing live operator authorization and native runtime permissions without a TH execution interceptor. Removing the hook SHALL NOT authorize an unrequested push, review, merge, deployment or a changed publication candidate. Existing identity, freshness and idempotency checks SHALL remain workflow evidence.

#### Scenario: Authorized delivery publishes its prepared candidate
- **WHEN** Main has prepared and verified the authorized candidate
- **THEN** it proceeds through the host's permission mechanism without a second TH guard approval

#### Scenario: A merge was not authorized
- **WHEN** a workflow creates a PR without a live instruction covering merge
- **THEN** hook retirement does not authorize merging it
