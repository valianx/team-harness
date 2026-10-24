# reusable-web-presentations Specification

## Purpose
Turn existing proposal sources into portable, reusable web presentations that agents can maintain incrementally with observed content, interaction and layout evidence.

## Requirements

### Requirement: Source-led native authoring

The skill SHALL establish audience, objective, language, source material, selected project and authorized endpoint from available context. Existing proposals and documentation SHALL remain the source of facts; the workflow SHALL NOT require another proposal or a presentation JSON/DSL. Local file editing SHALL work without MCP. Available upstream guidance and optional integrations SHALL be reported accurately without silently changing global agent configuration.

#### Scenario: Existing proposal becomes a deck
- **WHEN** the operator supplies an existing proposal and requests a web presentation
- **THEN** its facts and conditions are composed in the requested language without inventing commitments or requiring another proposal document

#### Scenario: Optional integration is unavailable
- **WHEN** MCP or another optional authoring integration is unavailable
- **THEN** supported file authoring remains usable and the workflow reports the actual integration limit

### Requirement: Reusable narrative templates

The skill SHALL provide feature, integration and architecture templates using the same versioned kit. Templates SHALL guide narrative rather than impose section quotas. Composition SHALL distinguish current behavior, proposals, assumptions and unresolved decisions and SHALL NOT invent dates, metrics, contracts or commitments to fill space.

#### Scenario: A template is adapted
- **WHEN** supplied material does not need every template section
- **THEN** the deck preserves the relevant narrative and facts while removing unnecessary sections

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

### Requirement: Portable pinned kit identity

The consumer project SHALL own its editable sources, assets, pinned engine/theme/kit dependencies and build configuration. Kit assets SHALL be distributed through a versioned dependency or archive without requiring public package publication or an external service. The project SHALL build outside the original installation without machine-specific plugin paths, including when runtime packaging omits dotfiles.

#### Scenario: Packaged consumer runs independently
- **WHEN** the supported installed payload scaffolds a project outside the plugin tree
- **THEN** dependencies, ignore preparation, kit assets and build resolve entirely from that project and supported package sources

### Requirement: Existing decks are preserved

Every invocation SHALL inspect the selected project before scaffolding. Existing presentations SHALL preserve their engine, package manager, visual identity, pinned dependencies, assets, unaffected slides and manual work unless their replacement is authorized. Targeted updates SHALL modify only identified content and repeating an update SHALL NOT duplicate sections or overwrite the entire deck.

#### Scenario: Retry handling is added twice
- **WHEN** the same named retry-handling update is applied twice
- **THEN** the deck contains one updated section and unaffected source bytes, manual adjustments, assets and dependency pins remain intact

#### Scenario: A project already exists
- **WHEN** a creation operation targets an existing presentation directory
- **THEN** it refuses destructive scaffolding and directs the agent to inspect and update that project

### Requirement: Explicit reversible upgrades

Updating Team Harness SHALL NOT silently alter an existing deck's kit. Kit upgrades SHALL identify old/new versions, preserve unrelated project content, use project-owned dependency changes, validate affected behavior and retain a reversible prior dependency state.

#### Scenario: Installation changes after deck creation
- **WHEN** the installed kit changes or another deck is scaffolded from a newer kit
- **THEN** an existing deck keeps its original kit and pins until an explicit upgrade

### Requirement: Executable safe regions

Supported layouts SHALL define title, content, visual and footer regions for a documented 16:9 stage. Actual rendered validation SHALL account for fonts, assets, canvas scaling and intended reveal/overlay states. Unintended clipping, overlap and overflow SHALL produce actionable slide/element diagnostics. Content SHALL be recomposed, split or moved to notes before unreadable shrinking, arbitrary coordinates or clipping are accepted.

#### Scenario: Content exceeds a region
- **WHEN** long or dense content exceeds its supported layout
- **THEN** validation identifies the affected slide/region and completion requires a supported composition change or an explicit unresolved failure

#### Scenario: A reveal changes visible content
- **WHEN** an intermediate or final reveal state displays additional meaningful content
- **THEN** that state receives the same geometry and readability checks with intentional overlays distinguished from collisions

### Requirement: Reusable visual and demo embedding

The kit SHALL consume existing images, diagrams, Mermaid content and web demos without introducing another diagram engine. A reusable iframe adapter SHALL provide defined dimensions, accessible labeling, loading/error information, keyboard-focus recovery and a usable static fallback. Local assets SHALL work in development and under a configured production subpath. External network, authentication or framing uncertainty SHALL remain explicit.

#### Scenario: A local diagram app is embedded
- **WHEN** a deck embeds a locally packaged static diagram app
- **THEN** the frame and fallback resolve under the configured base path and keyboard users can recover focus to the presentation

#### Scenario: An external demo fails
- **WHEN** a frame fails, times out or cannot be verified because of cross-origin or framing restrictions
- **THEN** the viewer exposes the limit and preserves an accessible fallback rather than claiming the demo works

### Requirement: Native interaction and motion

The deck SHALL reuse engine navigation and reveal behavior, preserve component/input keyboard ownership and provide usable focus states. Reduced-motion preferences SHALL preserve the explanation and explicit navigation without requiring animation. The supported kit SHALL work without the React Flow skill or advanced slide-to-app synchronization.

#### Scenario: A component owns keyboard focus
- **WHEN** a user interacts with an embedded demo or editable control
- **THEN** its keys do not unexpectedly navigate the presentation and focus recovery remains available

#### Scenario: Motion is reduced
- **WHEN** reduced motion is requested
- **THEN** content and navigation remain usable with the kit's optional motion disabled

### Requirement: Independent static delivery

Default delivery SHALL include the editable project, verified static build, actual evidence locations and material gaps. A preview SHALL report its actual address and process limitations. Public builds SHALL exclude speaker notes by default and identify remaining external or sensitive resources; excluding notes alone SHALL NOT be represented as confidentiality proof. Preview/build SHALL NOT authorize deployment, public sharing or hosting changes.

#### Scenario: A public build is prepared
- **WHEN** the normal build command creates the delivery artifact
- **THEN** speaker-note content is absent, assets and links are checked under the configured base path, and remaining external/sensitive resources are reported without deployment

### Requirement: Evidence-backed completion

Validation SHALL combine content/source assessment, deterministic checks, actual browser geometry, screenshots and visual review at laptop and presentation viewports. Maintained fixtures SHALL cover every catalog pattern, long/dense content, reveal states, missing assets and iframe failures. Evidence SHALL demonstrate two distinct decks sharing the kit and a targeted idempotent update. Missing or failing required checks SHALL remain visible and SHALL prevent a claim of visual completion from build success alone.

#### Scenario: A required browser check cannot run
- **WHEN** the build succeeds but browser verification is missing or fails
- **THEN** useful partial output is retained and visual completion remains pending with the specific cause

### Requirement: Native distribution and boundaries

The canonical skill, portable kit and required tools SHALL be discoverable through supported runtime projections. Consumer projects and evidence SHALL remain outside installed assets under the selected workspace contract. Existing design, sketch, documentation, diagram and explicit presentation-engine workflows SHALL retain their responsibilities. Coordination SHALL use native permissions without a mandatory pipeline or persistent orchestrator.

#### Scenario: Runtime projections are installed
- **WHEN** the canonical skill is synchronized and installed through a supported runtime
- **THEN** templates, kit archives and authoring/validation tools remain available and other workflow routes retain their existing behavior
