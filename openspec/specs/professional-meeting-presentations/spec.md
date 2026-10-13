# professional-meeting-presentations Specification

## Purpose

Create and improve web presentations for live meetings with context-grounded visual direction, usable audience stages, accessible interaction and observed rendered evidence.

## Requirements

### Requirement: Presentation work starts from meeting context
The existing interactive-presentation workflow SHALL support new presentations and improvement of existing decks. It SHALL establish topic, audience, meeting objective, real content, assets, existing project and requested endpoint from available context. Improvement SHALL preserve factual content, intentional order and useful interactions unless their replacement is requested. Existing new, add-scene and from-ppt requests SHALL remain supported.

#### Scenario: An existing deck is improved
- **WHEN** the operator requests a meeting-ready improvement of an existing presentation
- **THEN** the workflow inspects that project and its content, improves the requested surface and preserves its facts, intentional sequence and useful interactions within authorization

#### Scenario: A scene or converted deck is requested
- **WHEN** the operator invokes add-scene or from-ppt
- **THEN** the established scene-addition or slide-conversion behavior remains available and the resulting presentation receives the applicable meeting composition and verification checks

### Requirement: Visual direction uses the actual presentation
The workflow SHALL use contextual ui-design direction for hierarchy, palette, typography, spacing and layout rhythm. Refinement SHALL retain established identity unless replacement is authorized. A material unsettled direction SHALL use representative real presentation content to expose the choice before dependent implementation; settled direction SHALL NOT require redundant alternatives or another blanket approval.

#### Scenario: The deck has established identity
- **WHEN** an existing deck is refined without a requested identity replacement
- **THEN** its confirmed identity informs composition and visual assessment without an invented brand or mandatory palette comparison

#### Scenario: A material direction remains unsettled
- **WHEN** the presentation context leaves a material visual decision unresolved
- **THEN** the workflow presents relevant treatments using the same representative real content and resolves that decision within the existing authorization

### Requirement: Authoring preserves incumbent presentation technology
Existing presentations SHALL retain their engine and useful complex components unless migration is requested. New presentations SHALL select a suitable maintained authoring route according to content and interaction needs, including a native standalone HTML route for straightforward decks and a component-capable route for complex diagrams or animations. Presenter functionality SHALL reuse supported engine capabilities when available rather than require a new synchronization system.

#### Scenario: A straightforward new deck is requested
- **WHEN** a new presentation needs narrative slides and simple visuals without complex application components
- **THEN** the workflow can deliver through the maintained native HTML authoring route without forcing an application framework

#### Scenario: An incumbent deck contains complex interactions
- **WHEN** improvement targets an existing presentation with a graph, animation or other complex component
- **THEN** the workflow preserves its engine and interactions and uses that engine's supported presentation capabilities without an automatic migration

### Requirement: Upstream authoring is read outside the product
The workflow SHALL acquire or reuse the selected maintained upstream authoring resource, read its applicable instructions and record its source revision outside tracked TH product files. TH SHALL NOT copy its catalog or procedures into the distributed skill. Upstream advice SHALL NOT enlarge the requested editing, publication or export effects. Missing resources SHALL be reported with supported recovery and remaining limits.

#### Scenario: Upstream authoring is available
- **WHEN** the selected native HTML route uses an upstream authoring resource
- **THEN** the workflow reads the applicable owner instructions from an external resource location, retains its identity and applies only effects within the operator's request

#### Scenario: The selected resource cannot be acquired
- **WHEN** the upstream resource is unavailable
- **THEN** the workflow reports that limitation, performs supported independent work and leaves the missing method pending without claiming equivalent upstream execution

### Requirement: The audience stage prioritizes meeting content
The presentation SHALL use a 16:9 stage by default unless the request or project defines another format. Its visible audience layout SHALL avoid permanent navigation/header rows and duplicated scene headlines. Dense content SHALL be split or recomposed before clipping meaningful content or reducing type below readable meeting size. Navigation overlays SHALL have a reserved safe area that does not obscure essential content.

#### Scenario: Long titles and dense content exceed the composition
- **WHEN** the current stage cannot legibly contain a long headline, content or labels
- **THEN** the workflow recomposes or splits the material and verifies the new composition rather than treating clipping or unreadable shrinking as success

#### Scenario: A project defines another stage format
- **WHEN** the existing deck or operator specifies a format other than 16:9
- **THEN** that format is preserved and assessed at the requested meeting viewports

### Requirement: Content layouts preserve visual meaning
The presentation SHALL provide appropriate layouts for text, images, diagrams and animations. Images SHALL retain their intended aspect and essential content with meaningful text alternatives. Diagram nodes, edge labels and overlays SHALL share the usable stage area; animation layouts SHALL preserve visible content through meaningful intermediate and final states.

#### Scenario: A mixed-content deck is presented
- **WHEN** the deck includes an image, labeled diagram and animation
- **THEN** the audience can see the meaningful image area, read the diagram and observe the animation states without collision with presentation chrome

### Requirement: Compact controls remain discoverable and accessible
Audience controls SHALL remain outside the content flow, use accessible names and visible focus, and reveal through pointer proximity, keyboard use or focus. Inactivity SHALL permit discreet hiding only while controls are unfocused; focused controls SHALL stay reachable and visible. Fullscreen and motion preferences SHALL preserve access to essential controls.

#### Scenario: Controls are idle or focused
- **WHEN** pointer inactivity hides controls and a keyboard user reaches them
- **THEN** the controls reveal with visible focus and remain visible until focus leaves, without trapping focus

#### Scenario: Controls are shown over a diagram
- **WHEN** navigation or diagram controls reveal
- **THEN** they stay compact and within the reserved area without covering essential diagram labels or nodes

### Requirement: Navigation respects focus and scene interaction
Slide and step navigation SHALL handle presentation shortcuts only when the presentation owns the interaction. Typing, editable content, buttons, selectors, links, media and interactive graph controls SHALL retain their native or component-specific keyboard behavior. Scene steps SHALL advance predictably before changing scenes, respect first/last boundaries and avoid changing inactive scenes or duplicating keyboard handlers.

#### Scenario: An interactive element owns the key
- **WHEN** focus is in an input, button, selector, editable region or graph control and Arrow or Space is pressed
- **THEN** that element receives its intended interaction without unintended slide navigation

#### Scenario: A stage-owned step or slide is advanced
- **WHEN** the presentation owns focus and the presenter advances or reverses
- **THEN** the intended active-scene step or slide changes once, observes its boundaries and leaves inactive scene state unchanged

### Requirement: Animation controls drive the visible animation
Play, pause, restart and step actions SHALL control the actual active animation rather than an independent placeholder timer. Scene activation and removal SHALL clean up animation ownership; transport SHALL represent readiness and actual playback state. Reduced-motion mode SHALL preserve the explanation and explicit navigation without mandatory auto-play or disorienting movement.

#### Scenario: Transport controls a real component
- **WHEN** the presenter plays, pauses or restarts an animation scene
- **THEN** the visible animation follows those actions and reported state matches actual playback, including completion

#### Scenario: Scene ownership or motion preference changes
- **WHEN** the presenter leaves an animation scene or reduced motion is enabled
- **THEN** inactive playback and stale callbacks are cleaned up and the explanation remains usable through stable states and explicit steps

### Requirement: Meeting readiness requires rendered checks
New or improved presentations SHALL receive meaningful browser inspection at 1280×720 and at least one additional meeting viewport, including fullscreen and reduced motion where applicable. Checks SHALL cover representative content and interactions present in that deck, including long/dense text, images, graph labels and steps, actual animation states, idle/revealed/focused controls and focus-aware navigation where applicable. The maintained template fixture SHALL cover all these content and interaction types. Captures and content bounds SHALL support visual judgment; compilation or hidden overflow alone SHALL NOT establish readiness.

#### Scenario: The presentation can run
- **WHEN** a generated or improved deck is ready for validation
- **THEN** the workflow renders the identified deck at the declared viewports, checks the representative content and interactions, and corrects observed clipping, overlap or unreadable composition before reporting readiness

#### Scenario: Rendering is unavailable
- **WHEN** the deck or a required browser capability cannot run
- **THEN** the workflow retains supported partial evidence and reports fresh rendered checks as pending with their cause

### Requirement: Delivery reports observed evidence and scope
The workflow SHALL report the actual deliverable location, selected authoring route, changes, executed checks and material omissions. It SHALL distinguish source review, build success, browser observations and visual judgment. Generated deck publication, inline editing and export SHALL remain within the requested endpoint; a local creation or improvement request SHALL NOT imply those additional effects.

#### Scenario: A local presentation is delivered
- **WHEN** the authorized endpoint is a locally usable deck
- **THEN** the workflow reports its location, run instructions and actual verification evidence without automatically publishing it or enabling unsolicited editing/export
