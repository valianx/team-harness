# reference-led-editable-diagrams Specification

## Purpose
Turn source material and approved visual references into readable native diagrams that remain editable, preserve human work and retain faithful editor/export evidence.

## Requirements

### Requirement: Proportionate native authoring

The workflow SHALL run in the current native coordinator, use local artifact tools by default, and load format, composition and tool-selection references only when relevant. MCP SHALL be optional for an authorized connected canvas or workspace. A simplified element API or automatic layout MAY reduce authoring work, but SHALL NOT replace native connection, revision or delivery verification. The workflow SHALL preserve the operator's requested engine, destination and existing authorization.

#### Scenario: A local diagram needs no connected service
- **WHEN** the operator requests an editable local Excalidraw artifact
- **THEN** Main creates and verifies it with local tools without requiring MCP, a persistent orchestrator, account access or publication

#### Scenario: A draft exporter is available
- **WHEN** a CLI or connected tool produces a PNG preview
- **THEN** the workflow inspects it as visual evidence and retains separate required native-editability verification before claiming final editable delivery

### Requirement: Contextual editable flow composition

The diagram workflow SHALL honor the requested engine and reuse approved scene, typography, palette and composition preferences from the supplied material or bound context. Component cards, repeated logical components and independent flow sections SHALL be supported when they clarify the requested story. Defaults SHALL NOT impose visual variety, contained-text ratios or element counts that contradict approved references or source completeness. Component-role colors and relationship-class colors SHALL remain distinct choices.

#### Scenario: Approved component-card reference
- **WHEN** an approved reference uses consistent cards, functional zones and separate request/return lanes
- **THEN** the agent carries those composition properties into the requested diagram without forcing unrelated shapes, a different palette or arbitrary element counts

#### Scenario: A collection contains independent flows
- **WHEN** several processes are requested as an editable collection
- **THEN** each section has an identifiable start, outcome and boundary, and repeated components retain their source meaning without connections between unrelated sections

#### Scenario: Another engine is explicitly requested
- **WHEN** the operator requests React Flow, D2, LikeC4 or another supported format directly
- **THEN** the scoped Excalidraw-first preference does not require an additional tool or override that choice

### Requirement: Native connection integrity and safe revision

Connections SHALL use native editable arrow elements, including native elbows when appropriate, with coherent endpoints, supported bindings and reciprocal bound labels. Text SHALL be measured with the selected fonts ready. Revisions SHALL read and preserve the current editable scene, retain unaffected identities and human edits, and create a recoverable backup before changing an approved file. Generated drafts and historical generators SHALL NOT silently replace the approved editable scene.

Orthogonal routes SHOULD use native elbows by default; an approved reference or geometry MAY justify other native paths. Edit proof SHALL choose a measured free destination within existing enclosing bounds, retain the minimum movement requirement and run post-edit connection checks. Unavailable safe movement SHALL remain explicit rather than falling back to a colliding drag.

#### Scenario: The first drag direction is occupied
- **WHEN** a candidate edit-proof move would overlap another component or leave its container
- **THEN** the verifier tests another bounded direction and reports unavailable proof if none is safe, without modifying the source

#### Scenario: A component or arrow is moved
- **WHEN** a native editor imports a diagram and a bound component or connection is moved
- **THEN** its supported bindings, arrow geometry and associated labels remain coherent and editable rather than becoming disconnected line segments

#### Scenario: The operator edited an approved scene
- **WHEN** a later source correction is applied
- **THEN** the workflow reads the current scene, preserves unrelated edits and identities, and retains a recoverable pre-change scene

### Requirement: Editor-verified native delivery

Delivery SHALL include the native editable scene and faithful exports assessed against the scene recovered from an actual identified editor. Editor/renderer dependencies SHALL have an explicit reproducible identity and demonstrate support for scene fields affecting bindings, elbows and label placement. Structural, native-editability, visual and source-fidelity assessments SHALL remain separate. An exporter that ignores relevant fields SHALL NOT certify the editable scene from its PNG alone; unavailable or failing required verification SHALL remain explicit and prevent a successful-completion claim.

Verification SHALL retain connection-visibility observations independently of label-position fidelity: a correctly positioned bound label SHALL NOT conceal its connection and direction. Per-flow presentation review SHALL use actual fitted text observations rather than source font sizes alone. Prerequisite validation repairs SHALL be bounded separately; a rejected preflight without a native render SHALL NOT consume a visual corrective cycle.

Composition review SHALL expose measured findings with element identities and focused native-export captures. Alignment and equal-spacing checks SHALL use declared layout groups. Approximate geometry SHALL remain advisory, and missing observations SHALL NOT certify success. Corrections SHALL preserve a pre-change scene and compare revisions at a common framing and scale while retaining separate visual and source-fidelity judgment.

The verifier SHALL return compact statuses, diagnostic totals and evidence paths while retaining complete findings in its report. Passing verification MAY be reused only for identical scene content, verifier/renderer identity and invocation options; changed views and affected compositions SHALL be checked again.

#### Scenario: A composition has a local visual defect
- **WHEN** native composition review observes text overflow, overlaps or a route crossing an unrelated element
- **THEN** it retains the affected IDs, measurements and focused evidence before and after the edit, and unresolved measured errors keep delivery a draft

#### Scenario: A correction changes neighboring geometry
- **WHEN** the agent reviews a revised scene against its saved predecessor
- **THEN** the workflow provides a common-framing comparison without changing either input and inspects the intended correction and surrounding routes

#### Scenario: A frame wraps native label exports
- **WHEN** the editor exports bound labels through frame clipping groups
- **THEN** verification observes their actual glyphs and native transforms rather than assuming an unframed export origin

#### Scenario: Exporter and editor differ on a supported label field
- **WHEN** a scene's bound-label position changes during import or export
- **THEN** the mismatch is retained as a failing compatibility observation until a compatible verified editor/export path preserves the approved result

#### Scenario: Native editing and export succeed
- **WHEN** the scene is imported, recovered and exercised through the selected editor with fonts ready
- **THEN** the delivered editable file and SVG/PNG retain the assessed components, connections and label placement with editor/renderer identities and evidence recorded

#### Scenario: A bound label masks a short connection
- **WHEN** the recovered editor/export places a bound label correctly but its native mask conceals a connection or its arrowhead
- **THEN** verification retains a failing visibility observation for the affected connection and the workflow reserves enough measured clearance without shrinking text or flattening the editable arrow

#### Scenario: Prerequisite failure produces no native render
- **WHEN** bounded preflight rejects a scene before a native render is available
- **THEN** the workflow repairs prerequisites within its separate bound or reports the failure, and starts visual composition assessment from the first actual rendered revision
