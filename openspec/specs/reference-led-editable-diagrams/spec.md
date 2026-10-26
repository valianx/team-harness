# reference-led-editable-diagrams Specification

## Purpose
Turn source material and approved visual references into readable native diagrams that remain editable, preserve human work and retain faithful editor/export evidence.

## Requirements

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

#### Scenario: A component or arrow is moved
- **WHEN** a native editor imports a diagram and a bound component or connection is moved
- **THEN** its supported bindings, arrow geometry and associated labels remain coherent and editable rather than becoming disconnected line segments

#### Scenario: The operator edited an approved scene
- **WHEN** a later source correction is applied
- **THEN** the workflow reads the current scene, preserves unrelated edits and identities, and retains a recoverable pre-change scene

### Requirement: Editor-verified native delivery

Delivery SHALL include the native editable scene and faithful exports assessed against the scene recovered from an actual identified editor. Editor/renderer dependencies SHALL have an explicit reproducible identity and demonstrate support for scene fields affecting bindings, elbows and label placement. Structural, native-editability, visual and source-fidelity assessments SHALL remain separate. An exporter that ignores relevant fields SHALL NOT certify the editable scene from its PNG alone; unavailable or failing required verification SHALL remain explicit and prevent a successful-completion claim.

Verification SHALL retain connection-visibility observations independently of label-position fidelity: a correctly positioned bound label SHALL NOT conceal its connection and direction. Per-flow presentation review SHALL use actual fitted text observations rather than source font sizes alone. Prerequisite validation repairs SHALL be bounded separately; a rejected preflight without a native render SHALL NOT consume a visual corrective cycle.

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
