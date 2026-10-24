## Why

Architecture diagrams need visual styling appropriate to their sources and audience, while familiar controls should behave consistently across generated projects. The approved compact-diagram prototype demonstrates floating controls and a stable, fuller canvas that the reusable kit does not yet provide.

## What Changes

- Allow contextual background and component styling while retaining measured layout and semantic component variants.
- Standardize the kit's control appearance, placement, keyboard/touch access and automatic visibility.
- Fit active diagram content into 90% of the available canvas without reserving space for temporary controls or changing geometry on hover.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `source-driven-architecture-diagrams`: contextual visuals with standard floating controls and stable, route-aware framing.

## Impact

The canonical React Flow skill, design reference, copied starter and maintained browser tests change. Runtime projections and release metadata are regenerated. Model schema, source interpretation and pinned dependencies remain compatible.

## Non-Goals

No theme editor, source-upload interface, agent backend or mandatory compact node preset. No new presentation engine or changes to other diagram skills.
