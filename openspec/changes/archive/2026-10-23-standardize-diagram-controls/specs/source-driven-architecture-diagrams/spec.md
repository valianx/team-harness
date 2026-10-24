## MODIFIED Requirements

### Requirement: Reusable visual system

Generated diagrams SHALL reuse a shipped component catalog for services, gateways, databases, queues/brokers, external systems and groups. Diagram backgrounds and component appearance SHALL be adaptable to the source context and audience while control appearance, placement and interaction remain standardized across generated diagrams. Styling and layout SHALL consume the same typography, spacing, port and group-header tokens for measured graph elements. Long text SHALL remain accessible without clipping or diagram-specific geometry repairs; longer descriptions SHALL be available in details. A group SHALL represent visual containment without implicitly asserting a software architecture classification.

#### Scenario: Long mixed component labels
- **WHEN** a diagram contains mixed component types and long names
- **THEN** the shared components wrap or size names legibly, keep descriptions accessible, and supply the actual dimensions to layout

#### Scenario: Contextual diagram styling
- **WHEN** the agent adapts the background and component appearance for a different source context
- **THEN** the graph uses that appearance with consistent measured geometry while the standard controls retain their appearance, placement and interaction

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
