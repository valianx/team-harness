## MODIFIED Requirements

### Requirement: Routed connections and labels

The viewer SHALL preserve computed ports, route sections, bends and label positions for same-group and cross-group relationships in horizontal and vertical layouts. Validation SHALL detect routes and labels intersecting unrelated bodies or reserved headers, accounting for ancestry, coordinate transforms, line thickness and declared clearance. Intended endpoint contacts and ancestor-boundary crossings SHALL be distinguished from collisions. Arbitrary graphs SHALL NOT be promised an edge-crossing-free result.

Rendered relationship labels SHALL paint above their routes and remain available as pointer targets while respecting the standard temporary-control layers.

#### Scenario: Connection crosses nested group boundaries
- **WHEN** a labeled relationship connects nodes in different nested groups
- **THEN** its rendered endpoints, route and label use consistent coordinates, avoid unrelated bodies and headers, and retain the relationship's identity

#### Scenario: Route collision is detected
- **WHEN** an injected route passes through an unrelated component or reserved group header
- **THEN** validation reports the relationship and intersected element instead of accepting the render

#### Scenario: A route crosses its own label position
- **WHEN** the complete consumer renders measured relationship labels over routed SVG paths
- **THEN** the label text remains visible and its pointer target opens that relationship's details at both supported viewports
