## Why

Web proposals repeatedly rebuild navigation, styling and slide geometry. A reusable
Slidev kit lets agents turn existing sources into presentations and revise them
without recreating the frontend or losing manual work (#712).

## What Changes

- Add a source-led `web-presentation` skill with feature, integration and architecture
  narrative templates, preserving existing proposal/documentation truth.
- Ship one versioned Slidev addon over the pinned official default theme, with shared
  visual tokens, reusable layouts, realistic examples and local font assets.
- Scaffold portable consumer projects from packaged kit assets; preserve existing
  decks and make targeted section updates idempotent and kit upgrades explicit.
- Add reusable diagram/demo embedding with accessible focus recovery and static
  fallback, without another architecture renderer or a dependency on #711.
- Validate rendered regions, reveal states, content, assets, interaction and subpath
  builds. Deliver editable sources and a static build excluding notes by default.
- Synchronize runtime projections, discovery, focused documentation and release
  metadata. Verify reuse with two representative decks and a targeted update.

## Capabilities

### New Capabilities

- `reusable-web-presentations`: Source-led Slidev authoring, portable kit reuse,
  incremental maintenance, rendered validation and independent static delivery.

### Modified Capabilities

None. Existing Reveal, sketch, UI-design, documentation and diagram contracts remain
unchanged; explicit presentation-engine requests keep their current routing.

## Impact

Canonical `skills/web-presentation/`, packaged Slidev addon/starter/templates,
presentation-specific tools/tests, runtime projections and discovery, the installer
asset policy needed for inert package archives, CI, living specifications and release
3.54.0. Consumer projects and execution evidence stay outside installed assets.
No public npm publication, global MCP configuration or external service is required.

## Non-Goals

Visual editing, collaboration, another presentation/diagram engine, automatic
deployment, general mobile reflow, mandatory PDF/PPT export and advanced synchronization
between slide reveals and embedded applications are outside this release.
