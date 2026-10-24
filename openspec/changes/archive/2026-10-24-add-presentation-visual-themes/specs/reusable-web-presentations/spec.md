## MODIFIED Requirements

### Requirement: Shared visual catalog

Presentations SHALL reuse shared body typography, safe regions, components and native navigation across a small tested visual catalog. The skill SHALL provide optional technical, natural, cosmic, editorial and workshop visual themes independently from narrative templates. Selected themes SHALL be copied into the new consumer project, align native diagram colors with their light or dark palette, and provide local decorative resources. Omitting a theme SHALL preserve existing scaffold behavior. Theme selection SHALL NOT change the versioned renderer, dependency pins or control behavior, nor silently restyle existing projects. Existing licensing and attribution SHALL be preserved.

#### Scenario: A second deck is created
- **WHEN** a different representative presentation is created
- **THEN** it reuses the same kit, typography, regions, components and navigation without manual container-coordinate repairs

#### Scenario: Narrative and visual theme are combined
- **WHEN** a new deck selects any supported narrative and visual theme
- **THEN** the selected palette and local assets belong to that consumer while native theme identity, narrative content and dependency pins remain intact

#### Scenario: Existing behavior is preserved
- **WHEN** no visual theme is selected or the destination already exists
- **THEN** creation preserves the previous default output or refuses to overwrite the existing project respectively

#### Scenario: A visual theme is unavailable
- **WHEN** creation selects an unknown or path-like visual theme identifier
- **THEN** it refuses that selection without creating a consumer project

#### Scenario: A light visual theme is validated
- **WHEN** the catalog and static delivery are exercised using a light theme
- **THEN** native diagrams, code, frame loading and fallback surfaces and focused controls remain readable while keeping the shared geometry and keyboard behavior
