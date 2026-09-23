## ADDED Requirements

### Requirement: Generated package synchronization removes retired owned assets
Synchronization SHALL remove obsolete files from wholly generated package projections and its check mode SHALL report their presence. Cleanup SHALL remain confined to generated ownership and preserve unrelated operator content.

#### Scenario: A canonical role or reference is removed
- **WHEN** its previous generated copy remains in the packaged projection
- **THEN** check mode reports drift and synchronization removes that stale copy.
