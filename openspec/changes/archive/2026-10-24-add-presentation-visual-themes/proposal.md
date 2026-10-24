## Why

The five evaluated presentation styles currently live only in local examples. Agents need portable visual choices that can be reused with any source topic without rebuilding the shared presentation controls or layout.

## What Changes

- Ship five optional visual themes: technical, natural, cosmic, editorial and workshop.
- Select a visual theme independently from feature, integration or architecture narrative templates during scaffolding.
- Copy palette CSS and a local favicon into the consumer, with matching native color schema and unchanged kit identity.
- Verify themed layouts, Mermaid, code and frame controls in real development and static browsers.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `reusable-web-presentations`: reusable visual themes, independent narrative selection and preservation of existing decks.

## Impact

The presentation scaffold, theme assets, browser fixtures, authoring guidance and supported runtime projections change. Engine, package dependencies and the versioned renderer archive remain unchanged.

## Non-Goals

Packaging the five example narratives, new controls, engine migration, automatic restyling of existing decks, metadata-validator repairs, deployment and merge are outside this change.
