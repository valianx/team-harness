# source-driven-architecture-diagrams Specification

## Purpose
Turn operator-supplied architecture sources into traceable, readable interactive diagrams that can be revised conversationally and hosted independently.

## Requirements

### Requirement: Source-led skill entry

The `reactflow-diagram` skill SHALL accept documents, documentation links, images, code and natural-language descriptions through the active host's available reading capabilities. The agent SHALL construct the diagram's internal model without requiring operator-authored JSON/YAML, coordinates or CSS. Unreadable or inaccessible sources SHALL remain identified as missing inputs rather than be treated as reviewed.

#### Scenario: Documentation becomes a diagram
- **WHEN** the operator provides readable architecture documentation and asks for a diagram
- **THEN** the agent extracts the architecture and generates the internal model without requesting a diagram schema from the operator

#### Scenario: Source cannot be read
- **WHEN** a required attachment or link cannot be read with the available capabilities
- **THEN** the agent identifies that source, explains the missing information and requests an accessible representation while preserving useful work from other sources

#### Scenario: Missing material evidence keeps the result incomplete
- **WHEN** an unreadable source contains information required to establish the requested architecture
- **THEN** useful partial diagrams remain drafts and fidelity stays incomplete until the source becomes accessible or the operator explicitly changes the requested scope

### Requirement: Traceable interpretation and revision

Every depicted component, group and relationship SHALL retain a source locator or an explicit inference classification with rationale. The agent SHALL reconcile the represented architecture against the supplied sources and requested perspective, identify material contradictions or ambiguity, and obtain clarification before treating affected claims as settled. Conversational corrections SHALL update the model and affected validation while retaining unaffected identities and evidence.

#### Scenario: Ambiguous image connection
- **WHEN** a source image does not establish an arrow's direction
- **THEN** the agent identifies the uncertainty and seeks clarification instead of presenting a guessed direction as sourced fact

#### Scenario: Conflicting sources
- **WHEN** two supplied sources disagree on a material relationship
- **THEN** the disagreement is exposed for resolution and the affected diagram remains a draft until the decision is recorded

#### Scenario: Operator corrects a component
- **WHEN** the operator corrects a component name or relationship in conversation
- **THEN** the agent updates the corresponding model and evidence, preserves unaffected identities, and reruns the affected checks

### Requirement: Validated internal architecture model

The kit SHALL validate its versioned internal model before layout, including unique identities, supported types, evidence references, parent and relationship endpoints, acyclic group hierarchy, and valid view/presentation references. Relationship cycles SHALL be supported independently of hierarchy validation. Geometry SHALL be derived data, and unsupported geometry or arbitrary style fields SHALL be rejected with offending identities or field paths.

#### Scenario: Invalid model is rejected
- **WHEN** a model contains duplicate identities, a missing endpoint, invalid evidence, a hierarchy cycle or unsupported geometry fields
- **THEN** validation stops layout and reports the relevant identities or field paths

#### Scenario: Relationship cycle is valid
- **WHEN** valid components have a cyclic set of relationships and an acyclic group hierarchy
- **THEN** the relationship cycle is accepted and included in layout and routing validation

### Requirement: Reusable visual system

Generated diagrams SHALL reuse a shipped component catalog for services, gateways, databases, queues/brokers, external systems and groups. Diagram backgrounds and component appearance SHALL be adaptable to the source context and audience while control appearance, placement and interaction remain standardized across generated diagrams. Styling and layout SHALL consume the same typography, spacing, port and group-header tokens for measured graph elements. Long text SHALL remain accessible without clipping or diagram-specific geometry repairs; longer descriptions SHALL be available in details. A group SHALL represent visual containment without implicitly asserting a software architecture classification.

#### Scenario: Long mixed component labels
- **WHEN** a diagram contains mixed component types and long names
- **THEN** the shared components wrap or size names legibly, keep descriptions accessible, and supply the actual dimensions to layout

#### Scenario: Contextual diagram styling
- **WHEN** the agent adapts the background and component appearance for a different source context
- **THEN** the graph uses that appearance with consistent measured geometry while the standard controls retain their appearance, placement and interaction

### Requirement: Bounded measured layout

Layout SHALL use actual node, group-header, port and relationship-label measurements after relevant content and fonts are ready. Geometry changes SHALL trigger bounded recalculation; stale asynchronous results SHALL NOT overwrite newer model geometry. Identical normalized inputs, measurements and pinned execution dependencies SHALL produce repeatable geometry. Empty models and nonconvergence SHALL have explicit terminal states.

#### Scenario: Model changes during layout
- **WHEN** a second model revision arrives before the previous layout completes
- **THEN** only the current revision's result can become the displayed geometry

#### Scenario: Measurement does not converge
- **WHEN** measurements continue changing beyond the declared pass or readiness limits
- **THEN** layout terminates with diagnostics rather than looping or reporting a verified diagram

#### Scenario: Empty model
- **WHEN** the accepted model has no diagram elements
- **THEN** the viewer shows a usable empty state without waiting indefinitely for node initialization

### Requirement: Content-derived nested groups

Group bounds SHALL derive from descendants, measured minimum content, insets and reserved header space. The initial supported hierarchy SHALL include a group containing a subgroup containing nodes, including empty groups. Children SHALL remain in their parent's usable content area. Presentation interaction SHALL preserve group bounds and containment.

#### Scenario: Nested and empty groups
- **WHEN** nodes are added to or removed from nested groups, including a group that becomes empty
- **THEN** group bounds recalculate and every child retains the required inset and header clearance

### Requirement: Routed connections and labels

The viewer SHALL preserve computed ports, route sections, bends and label positions for same-group and cross-group relationships in horizontal and vertical layouts. Validation SHALL detect routes and labels intersecting unrelated bodies or reserved headers, accounting for ancestry, coordinate transforms, line thickness and declared clearance. Intended endpoint contacts and ancestor-boundary crossings SHALL be distinguished from collisions. Arbitrary graphs SHALL NOT be promised an edge-crossing-free result.

#### Scenario: Connection crosses nested group boundaries
- **WHEN** a labeled relationship connects nodes in different nested groups
- **THEN** its rendered endpoints, route and label use consistent coordinates, avoid unrelated bodies and headers, and retain the relationship's identity

#### Scenario: Route collision is detected
- **WHEN** an injected route passes through an unrelated component or reserved group header
- **THEN** validation reports the relationship and intersected element instead of accepting the render

### Requirement: Reusable interactive viewer

The viewer SHALL support pan/zoom, keyboard-accessible component and relationship details, source/inference information and guided presentation steps. Steps SHALL preserve geometry and keep their focused elements and necessary ancestors visible. Reduced-motion preferences SHALL be respected. The viewer SHALL work both as a standalone application and inside an explicitly sized host container. The initial perspective SHALL represent the complete architecture. Temporary controls SHALL float over the canvas without reserving layout space; initial framing, Fit view and focus framing SHALL preserve aspect ratio inside a centered rectangle spanning 90% of the available canvas in each axis, subject to supported zoom limits. Framing SHALL account for target nodes and their connecting routes and labels. On fine-hover devices controls SHALL appear for viewer hover, visible keyboard focus and open control popups, and otherwise hide without moving the camera or changing graph geometry. Coarse-pointer controls SHALL remain visible. Source warnings, errors and selected details SHALL remain available independently of temporary control visibility.

#### Scenario: Guided presentation with details
- **WHEN** a user changes steps and opens the focused relationship's details
- **THEN** the highlighted flow and its evidence remain accessible without changing diagram geometry or obscuring the active content

#### Scenario: Reduced motion or unusable embedding
- **WHEN** reduced motion is enabled or an embedding container has unusable dimensions
- **THEN** the viewer uses reduced-motion behavior or an actionable sizing state, respectively, rather than an inaccessible transition or blank canvas

#### Scenario: Stable full-canvas framing
- **WHEN** a user fits the diagram and then reveals or hides its temporary controls
- **THEN** the diagram remains centered within 90% of the available canvas subject to zoom limits, its connecting routes and labels are included, and canvas size, camera and graph geometry remain unchanged by control visibility

#### Scenario: Accessible temporary controls
- **WHEN** a user navigates by keyboard, opens a control popup or uses a coarse pointer
- **THEN** the standard controls remain visible and operable for that interaction, while selected details and source or error notices remain accessible even when temporary controls hide

### Requirement: Explicit perspectives and completeness

When one view cannot satisfy readability constraints, the agent SHALL create explicit perspectives from the same architecture model or report the unresolved constraint. Every modeled relationship SHALL remain represented in an identified view or be explicitly identified as outside the requested perspective, with endpoints and continuation context traceable. The agent SHALL NOT silently remove relationships, falsify topology or shrink text to illegibility to pass visual checks.

#### Scenario: Dense architecture needs multiple views
- **WHEN** a model cannot be rendered readably as a single view
- **THEN** the agent provides explicit view membership and continuation context or reports the unresolved limitation, with all relationships accounted for

### Requirement: Independent editable delivery

The generated artifact SHALL include the editable architecture model, reusable viewer source, pinned dependency/kit identity and a verified static production build with required local assets. Viewing the build SHALL require neither an agent/AI backend nor a diagram SaaS. Embedding instructions SHALL document required styles, client-side boundaries and container sizing. Deployment SHALL follow separately scoped authorization.

#### Scenario: Artifact runs independently
- **WHEN** the generated production build is served independently of the Team Harness installation
- **THEN** the diagram, details, assets and presentation steps function without imports into installed skill directories or an AI service

### Requirement: Evidence-backed validation and completion

The kit SHALL provide deterministic model/geometry checks and rendered browser checks with machine-readable diagnostics containing offending identities and retained screenshots. Coverage SHALL include short/long labels, mixed types, nested/empty groups, cross-boundary relationships, cycles, disconnected components and dense fan-in/fan-out at desktop and presentation viewports. Source fidelity review SHALL remain distinct from mechanical layout evidence. Missing or failing required checks SHALL be reported and SHALL prevent a successful-completion claim. Published support limits SHALL match the tested hierarchy and complexity envelope.

#### Scenario: Build succeeds but geometry fails
- **WHEN** compilation succeeds and a required geometry or rendered check fails
- **THEN** completion remains unsuccessful with the offending identities and evidence retained

#### Scenario: Geometry passes but source fidelity is unresolved
- **WHEN** layout checks pass but a material source contradiction remains unresolved
- **THEN** the diagram remains a draft and geometry success is not presented as proof of source fidelity

### Requirement: Native Team Harness distribution

The canonical skill and reusable starter SHALL be distributed through the existing shared skill-generation mechanism and discoverable in supported runtimes. Existing diagram and presentation entry points SHALL retain their behavior. Consumer models, generated projects and evidence SHALL remain outside distributed product assets and follow the selected workspace contract. The skill SHALL rely on native coordination and permissions without requiring a persistent orchestrator or pipeline.

#### Scenario: Skill is synchronized without replacing another workflow
- **WHEN** the canonical skill is synchronized and discovered in a supported runtime
- **THEN** its starter resources are available, existing diagram routes remain intact, and consumer-specific diagrams or reports are not packaged with the skill

### Requirement: Autonomous composition judgment

The agent SHALL reuse relevant operator-approved visual preferences and artifact references from the bound context, distinguish them from unapproved examples, and compose a useful complete overview before delivery. It SHALL compare a bounded set of semantically equivalent compositions using geometry, fitted readability, aspect ratio, grouping and flow clarity. The kit SHALL support a measured compact alternative to a long layered arrangement and retain every component, directed relationship, evidence locator and declared uncertainty. Standard controls, contextual graph styling and stable 90% framing SHALL retain their existing contracts.

#### Scenario: A compound architecture becomes a long ribbon
- **WHEN** a nontrivial architecture's initial layered arrangement makes fitted component names unreadable
- **THEN** the workflow compares a measured compact arrangement, selects a valid composition with better fitted readability and retains the complete model without asking the operator for coordinates or removing relationships

#### Scenario: Accepted preferences guide another diagram
- **WHEN** the bound context contains an operator-approved artifact or correction relevant to the requested diagram
- **THEN** the agent uses its composition criteria while adapting the background and component appearance to the new source context, without treating an unapproved kit example as operator preference

### Requirement: Source-preserving visual revision

Before delivery, the agent SHALL inspect the actual generated overview and relevant perspectives at 1280×720 and 1440×900, verify the rendered model identity, and assess source fidelity separately from mechanical checks. The inspection capability SHALL expose composition alternatives, geometry diagnostics, fitted label sizes and captures for the actual consumer model. The agent SHALL correct identified composition problems through at most an initial cycle and two corrective cycles, distinguish those cycles from measurement convergence, and retain unresolved limitations and rejected alternatives without claiming visual completion.

#### Scenario: Demonstration checks pass but the consumer is unreadable
- **WHEN** the kit's demonstrations pass while the generated consumer has invalid geometry or unreadable fitted labels
- **THEN** the consumer's evidence identifies its own model and elements, triggers source-preserving recomposition and remains incomplete until its required checks and visual assessment succeed

#### Scenario: Automatic revision cannot meet the requested composition
- **WHEN** the bounded corrective cycles do not produce a suitable complete overview
- **THEN** the skill delivers useful editable output and explicit supplementary perspectives with the remaining limitation, without inventing operator approval or hiding the failed overview
