## Why

Architecture information arrives as documentation, images, code and conversation. Operators need an agent to turn those sources into readable interactive diagrams without preparing a diagram schema or repairing coordinates, containers and connections by hand. The current React Flow presentation examples use manual positions and do not provide a reusable, validated architecture layout kit.

## What Changes

- Add `reactflow-diagram`: the agent reads available sources, extracts a traceable architecture, resolves material ambiguities and generates the internal model itself.
- Ship a versioned React starter with a small component catalog, shared visual tokens, measured ELK layout, nested groups, routed labeled connections and geometry diagnostics.
- Provide a reusable viewer with details, source references and presentation steps that preserve geometry, plus an independently hostable production build.
- Validate source fidelity separately from model integrity, geometry and browser rendering. Retain unresolved sources, inferences and missing checks explicitly.
- Distribute the skill through the existing runtime synchronizer and discovery surfaces. Preserve existing diagram workflows and the Reveal presentation shell.

## Capabilities

### New Capabilities

- `source-driven-architecture-diagrams`: agent interpretation of supplied sources and generation, inspection, validation and delivery of interactive architecture diagrams.

### Modified Capabilities

None. Existing diagram and presentation workflows retain their contracts; integration into the Reveal template is deferred.

## Impact

Canonical assets live in `skills/reactflow-diagram/`, with generated runtime projections, discovery updates and a dedicated living specification on completion. The starter introduces pinned React Flow/ELK dependencies and maintained model, geometry and browser fixtures. Consumer models, builds, screenshots and reports follow the selected workspace/artifact conventions. Source access uses the active host's existing tools and permissions; the generated viewer does not need an AI service or document-ingestion backend.

## Non-Goals

An operator-authored JSON/YAML prerequisite; a source-upload web application; a new OCR/LLM service; a general architecture editor; collaboration or cloud discovery; arbitrary coordinates/CSS; universal layout guarantees; automatic deployment; replacing Excalidraw, D2, LikeC4 or the presentation engine.
