## REMOVED Requirements

### Requirement: The overlay skeleton is derived mechanically
**Reason**: Pipeline v5 Design generates a compact read-only `01-plan.md` from canonical OpenSpec and creates no semantic overlay, traceability skeleton, or execution shards. The requirement describes a script that no live contract invokes.

**Migration**: `openspec-overlay.mjs` and its tests are deleted. Gate 1 presents the v5 operator plan projection and the pinned content identity.
