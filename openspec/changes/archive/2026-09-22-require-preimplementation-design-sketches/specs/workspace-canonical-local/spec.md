## MODIFIED Requirements

### Requirement: Sketches support requested design review across workflows
TH SHALL expose sketches in Claude Code, Codex and OpenCode for direct, spec and
pipeline work. Before implementing database changes, Main MUST create or update
and present a model of the affected data; before frontend implementation, Main
MUST create or update and present a wireframe, without requiring a separate sketch
request. Other sketch types remain on demand. Useful text sketches use Markdown
and HTML UI previews remain available. Main SHALL link agreed sketches to canonical
intent and consult them when implementing or validating the affected surface.
Sketches MUST NOT add an automatic permission gate, a second approval ceremony or
require a complete unrelated sketch set. Existing authorization remains applicable;
material unresolved design decisions require resolution before dependent work.

#### Scenario: A frontend preview helps
- **WHEN** the user requests a preview during spec or pipeline work
- **THEN** Main creates the relevant sketch in the same selected workspace and incorporates agreed decisions without a second approval ceremony.

#### Scenario: The user requests a preview during spec work
- **WHEN** the user asks to see the proposed interface, contract or interaction before implementation
- **THEN** Main creates or reuses the relevant sketch in the same local or Obsidian workspace and presents it through the existing spec discussion, without a second gate or pipeline state

#### Scenario: Direct work needs only a wireframe
- **WHEN** the user requests a standalone UI sketch without a pipeline
- **THEN** Main can provide a low-fidelity HTML wireframe linked from Markdown context without generating unrelated sketches or approving product implementation

#### Scenario: Database changes need a model without a sketch request
- **WHEN** authorized work changes database structure, persistence or migrations in any supported workflow
- **THEN** Main presents the affected current and proposed model before implementation, including changed fields, relationships and constraints, the minimum required delta, each new field's requirement and producer/consumer, reuse or derivation alternatives, and migration effects where applicable

#### Scenario: Frontend work needs a wireframe without a sketch request
- **WHEN** authorized work implements a frontend screen or changes existing frontend layout, presentation or behavior
- **THEN** Main presents a wireframe of the affected screens or components and relevant states and interactions before implementation, reusing and updating an existing preview when suitable

#### Scenario: Database and frontend work share one design phase
- **WHEN** spec or pipeline work affects both the database and frontend
- **THEN** its Spec phase presents both applicable previews, links them from the same workspace plan and records agreed decisions in canonical intent before Implementation

#### Scenario: Resume or direct implementation has no applicable preview
- **WHEN** implementation is requested directly or resumed and its database model or frontend wireframe is missing or stale
- **THEN** Main completes and presents the applicable design before dependent implementation, preserving useful existing work and resolving only missing material decisions rather than requesting a new blanket approval

#### Scenario: Validation detects unplanned persistence or UI expansion
- **WHEN** implementation adds fields or UI behavior not covered by the agreed design
- **THEN** validation compares the delivered migrations, model and frontend with the design and requirements, surfaces unexplained additions and resolves the mismatch instead of treating passing tests as evidence of necessity

#### Scenario: Work affects neither database nor frontend
- **WHEN** a task changes neither database nor frontend and no other sketch is requested or useful
- **THEN** Main creates no unrelated preview or empty sketch file; required previews for affected work remain in the selected local or Obsidian workspace rather than consumer commits unless needed as a durable deliverable
