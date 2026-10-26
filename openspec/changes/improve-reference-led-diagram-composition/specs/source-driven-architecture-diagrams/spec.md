## MODIFIED Requirements

### Requirement: Validated internal architecture model

The kit SHALL validate its versioned internal model before layout, including unique identities, supported types, evidence references, parent and relationship endpoints, acyclic group hierarchy, and valid view/presentation references. Relationship cycles SHALL be supported independently of hierarchy validation. Geometry SHALL be derived data, and unsupported geometry or arbitrary style fields SHALL be rejected with offending identities or field paths. Optional supported interaction classes SHALL distinguish requests, calls, synchronous responses, events and persistence without requiring them on existing models or treating visual color as source evidence.

When supplied, semantic flow intent SHALL reference an ordered simple request-edge path and a supported relative side for supporting content. Its supported horizontal scope SHALL be validated without silently overriding an explicit vertical direction. Perspectives SHALL retain this intent only when they contain its complete path.

#### Scenario: Semantic flow intent is validated

- **GIVEN** an optional internal flow intent declares an ordered request-edge path and supporting-service side without coordinates
- **WHEN** that intent is validated
- **THEN** references, supported direction and a simple contiguous path are checked, unsupported fields are rejected, and perspectives retain the intent only when its complete path remains present

#### Scenario: Invalid model is rejected
- **WHEN** a model contains duplicate identities, a missing endpoint, invalid evidence, a hierarchy cycle or unsupported geometry fields
- **THEN** validation stops layout and reports the relevant identities or field paths

#### Scenario: Relationship cycle is valid
- **WHEN** valid components have a cyclic set of relationships and an acyclic group hierarchy
- **THEN** the relationship cycle is accepted and included in layout and routing validation

#### Scenario: A source distinguishes asynchronous and synchronous interactions
- **WHEN** the agent classifies those relationships in the internal model
- **THEN** validation accepts supported optional classes, rejects unsupported values and preserves the source distinction; existing unclassified models remain valid

### Requirement: Reusable visual system

Generated diagrams SHALL reuse a shipped component catalog for services, gateways, databases, queues/brokers, external systems and groups. Diagram backgrounds and component appearance SHALL be adaptable to the source context and audience while control appearance, placement and interaction remain standardized across generated diagrams. Styling and layout SHALL consume the same typography, spacing, port and group-header tokens for measured graph elements. Long text SHALL remain accessible without clipping or diagram-specific geometry repairs; longer descriptions SHALL be available in details. A group SHALL represent visual containment without implicitly asserting a software architecture classification.

Approved visual references SHALL guide functional-zone hierarchy, card proportions and distinct component/relationship color semantics without becoming universal palettes. Presentation arrowheads SHALL remain distinguishable at the fitted viewing scale independently of thin relationship strokes. Technical handles SHALL remain measurable while their editor dots are visually hidden in presentation output.

#### Scenario: Long mixed component labels
- **WHEN** a diagram contains mixed component types and long names
- **THEN** the shared components wrap or size names legibly, keep descriptions accessible, and supply the actual dimensions to layout

#### Scenario: Contextual diagram styling
- **WHEN** the agent adapts the background and component appearance for a different source context
- **THEN** the graph uses that appearance with consistent measured geometry while the standard controls retain their appearance, placement and interaction

#### Scenario: Thin relationships in presentation
- **WHEN** the actual consumer is fitted at its presentation viewport
- **THEN** arrow directions remain visually clear and hidden handle dots do not change the measured endpoints or route attachment

#### Scenario: Contextual graph foreground with standardized details
- **WHEN** a diagram uses a dark graph foreground over a light canvas and opens its standard dark details surface
- **THEN** the selected title and evidence remain legible at both required viewports independently of the graph palette

### Requirement: Routed connections and labels

The viewer SHALL preserve computed ports, route sections, bends and label positions for same-group and cross-group relationships in horizontal and vertical layouts. Validation SHALL detect routes and labels intersecting unrelated bodies or reserved headers, accounting for ancestry, coordinate transforms, line thickness and declared clearance. Intended endpoint contacts and ancestor-boundary crossings SHALL be distinguished from collisions. Arbitrary graphs SHALL NOT be promised an edge-crossing-free result.

Rendered relationship labels SHALL paint above their routes and remain available as pointer targets while respecting the standard temporary-control layers. Relationships SHALL retain their own stable endpoint identities and supported side/slot positions. Side and lane selection SHALL consider the complete flow, obstacles and other routes rather than imposing one shared input/output point or selecting solely from component centers. Request/return paths and separate calls to one specialist SHALL remain distinguishable. Crossing, shared-segment, bend and detour diagnostics SHALL identify affected relationships without hiding topology to improve a score.

#### Scenario: Connection crosses nested group boundaries
- **WHEN** a labeled relationship connects nodes in different nested groups
- **THEN** its rendered endpoints, route and label use consistent coordinates, avoid unrelated bodies and headers, and retain the relationship's identity

#### Scenario: Route collision is detected
- **WHEN** an injected route passes through an unrelated component or reserved group header
- **THEN** validation reports the relationship and intersected element instead of accepting the render

#### Scenario: A route crosses its own label position
- **WHEN** the complete consumer renders measured relationship labels over routed SVG paths
- **THEN** the label text remains visible and its pointer target opens that relationship's details at both supported viewports

#### Scenario: Request and return share two components
- **WHEN** opposite directed relationships or several calls enter the same component
- **THEN** their endpoint identities, slots and visible lanes remain distinct and agree with the rendered handles

#### Scenario: A direct side avoids an unnecessary detour
- **WHEN** a relationship can use a feasible facing side while another attachment would route around unrelated content
- **THEN** bounded route selection evaluates that alternative and retains the chosen attachment and any remaining detour diagnostics

### Requirement: Reusable interactive viewer

The viewer SHALL support pan/zoom, keyboard-accessible component and relationship details, source/inference information and guided presentation steps. Steps SHALL preserve geometry and keep their focused elements and necessary ancestors visible. Reduced-motion preferences SHALL be respected. The viewer SHALL work both as a standalone application and inside an explicitly sized host container. The initial perspective SHALL represent the complete requested architecture or flow. Temporary controls SHALL float over the canvas without reserving layout space; initial framing, Fit view and focus framing SHALL preserve aspect ratio inside a centered rectangle spanning 90% of the available canvas in each axis, subject to supported zoom limits. Framing SHALL account for target nodes and their connecting routes and labels. On fine-hover devices the top or bottom border SHALL reveal only its corresponding controls; hovering the center SHALL NOT reveal either region. Each region SHALL remain operable while its controls, visible keyboard focus or open popup need it. Coarse-pointer controls SHALL remain visible. Source warnings, errors and selected details SHALL remain available independently of temporary-control visibility. The standalone shell SHALL use its browser window without fixed exterior headings, legends or prose taking diagram space; embedded output SHALL respect its host. Browser-native fullscreen SHALL remain a separate action.

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

#### Scenario: Independent border reveal
- **WHEN** a fine pointer enters the top border, bottom border or center
- **THEN** only the relevant border's controls appear, central hover leaves both hidden, and transparent detection areas do not intercept control or canvas input

### Requirement: Explicit perspectives and completeness

When one view cannot satisfy readability constraints, the agent SHALL create explicit perspectives from the same architecture model or report the unresolved constraint. Every modeled relationship SHALL remain represented in an identified view or be explicitly identified as outside the requested perspective, with endpoints and continuation context traceable. The agent SHALL NOT silently remove relationships, falsify topology or shrink text to illegibility to pass visual checks. A requested flow collection SHALL support independent readable sections and an orienting overview; repeated appearances SHALL remain traceable to the same logical source component rather than imply new deployed systems. Creation, navigation, asynchronous notification and query flows SHALL remain distinct when the sources distinguish them.

#### Scenario: Dense architecture needs multiple views
- **WHEN** a model cannot be rendered readably as a single view
- **THEN** the agent provides explicit view membership and continuation context or reports the unresolved limitation, with all relationships accounted for

#### Scenario: A collection repeats shared components
- **WHEN** separate flow sections reuse an orchestrator, bridge or actor
- **THEN** each section remains independently understandable, repeated appearances retain their source identity, and the overview does not replace legible per-flow views

### Requirement: Autonomous composition judgment

The agent SHALL reuse relevant operator-approved visual preferences and artifact references from the bound context, distinguish them from unapproved examples, and compose a useful complete overview before delivery. It SHALL compare a bounded set of semantically equivalent compositions using geometry, fitted readability, aspect ratio, grouping and flow clarity. The kit SHALL support a measured compact alternative to a long layered arrangement and retain every component, directed relationship, evidence locator and declared uncertainty. Standard controls, contextual graph styling and stable 90% framing SHALL retain their existing contracts.

Approved references SHALL guide reading direction, functional zones, request/return lanes, repeated appearances and label/arrow clarity. Explicit engine requests SHALL remain authoritative; the selected Excalidraw-first workflow SHALL use the approved image, editable scene when available and source material as inputs to an optional web reconstruction. Explicit composition requests SHALL avoid unrelated candidate work, and automatic exploration SHALL retain candidate identity, work counts or timing, route-quality evidence and remaining limits.

#### Scenario: A compound architecture becomes a long ribbon
- **WHEN** a nontrivial architecture's initial layered arrangement makes fitted component names unreadable
- **THEN** the workflow compares a measured compact arrangement, selects a valid composition with better fitted readability and retains the complete model without asking the operator for coordinates or removing relationships

#### Scenario: Accepted preferences guide another diagram
- **WHEN** the bound context contains an operator-approved artifact or correction relevant to the requested diagram
- **THEN** the agent uses its composition criteria while adapting the background and component appearance to the new source context, without treating an unapproved kit example as operator preference

#### Scenario: Approved editable composition becomes a web diagram
- **WHEN** the selected task requests a web version of an approved editable reference
- **THEN** the agent reconstructs interactive components and relationships from the available sources, checks the reference's visual properties and identifies facts the image cannot establish

#### Scenario: Approved flow grammar guides a measured web candidate
- **WHEN** source-supported flow intent declares an ordered request spine and the reference's support side
- **THEN** bounded composition preserves card order, actual primary routed progression, distinct return lanes and the support side using measured geometry and existing group ancestry, or retains an explicit unsatisfied-intent limit; geometric validity alone does not establish completion

### Requirement: Source-preserving visual revision

Before delivery, the agent SHALL inspect the actual generated overview and relevant perspectives at 1280×720 and 1440×900, verify the rendered model identity, and assess source fidelity separately from mechanical checks. The inspection capability SHALL expose composition alternatives, geometry diagnostics, fitted label sizes and captures for the actual consumer model. The agent SHALL correct identified composition problems through at most an initial cycle and two corrective cycles, distinguish those cycles from measurement convergence, and retain unresolved limitations and rejected alternatives without claiming visual completion.

Visual assessment SHALL compare the actual visible revision with the accepted reference at a readable per-flow scale, including spaces, labels, directions and distinct lanes. A tiny collection overview SHALL NOT establish per-flow readability. A successful HTTP response, queued browser opening or stale capture SHALL NOT establish delivery of the corrected revision to the intended viewer.

#### Scenario: Demonstration checks pass but the consumer is unreadable
- **WHEN** the kit's demonstrations pass while the generated consumer has invalid geometry or unreadable fitted labels
- **THEN** the consumer's evidence identifies its own model and elements, triggers source-preserving recomposition and remains incomplete until its required checks and visual assessment succeed

#### Scenario: Automatic revision cannot meet the requested composition
- **WHEN** the bounded corrective cycles do not produce a suitable complete overview
- **THEN** the skill delivers useful editable output and explicit supplementary perspectives with the remaining limitation, without inventing operator approval or hiding the failed overview

#### Scenario: A declared flow passes geometry but misses fitted text targets
- **WHEN** an applicable AUTO flow view has incomplete text measurements or fitted component names below 14 CSS px or relationship labels below 11 CSS px
- **THEN** inspection retains a separate failing readability assessment and exits unsuccessfully while preserving mechanical, intent, source and visual outcomes independently; unlabeled relationships do not require invented text

#### Scenario: A generated revision is delivered in an existing browser tab
- **WHEN** the artifact is updated and the target tab is refreshed
- **THEN** the visible model/revision and captured result match the delivered artifact rather than only the responding server
