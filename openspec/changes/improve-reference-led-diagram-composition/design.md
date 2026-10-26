## Context

See proposal.md for motivation and issue #719 for the approved references. The baseline is main `97618ac870e01b75f215f36c5b31b8024fe4f29e`. React Flow currently shares one input/output port per component, reveals both control regions on global hover, and reserves standalone window space outside its viewer. Excalidraw instructions and the diagrammer role impose palette, shape-variety and text/element quotas that conflict with the approved reference. Its shipped renderer imports an unversioned SDK and performs export without a native editor round-trip.

## Goals / Non-Goals

**Goals:** make the approved composition reproducible through the skills, improve the relevant renderer seams, and assess two independent generations without coordinator coaching.

**Non-Goals:** reproduce incidental pixels universally, encode the trial's finished answer into the skills, impose two tools on other tasks, change existing consumer projects automatically, or claim general improvement from two trials. Ten changed/added requirements form this bounded change.

## Decisions

### Correct instructions and implementation together

Use one coordinated change with focused slices. A prompt-only repair leaves the shared-port and shell limits intact; replacing the whole layout engine discards useful measurement and validation. Update canonical skills/references, `agents/diagrammer.md` and its conflicting direct-mode guidance, then generate runtime copies. Preferences remain scoped to approved input/context; bundled palettes and visual variety become defaults rather than quotas. Keep native editor integrity, visual judgment and source fidelity separate.

### Preserve an explicit visual grammar

Teach the reusable grammar in skill resources: independently understandable flows, left-to-right primary progression, supporting services above where appropriate, distinguishable request/return lanes, substantial card/text spacing, nearby labels and clear arrowheads. Retain functional-zone fills and hatching, and component-role versus interaction-class colors from the selected reference. Collection overviews orient; per-flow views establish readability. Independent outputs can repeat logical components with common source locators; do not introduce a global entity/appearance schema for this repair.

### Make interaction semantics additive

Keep existing architecture schema-version-1 inputs valid. Add optional relationship `interaction` with `request | call | response | event | persistence`; absence keeps the neutral existing style. Validate this semantic field and map it to contextual CSS tokens/stroke patterns in the consumer renderer. Do not accept arbitrary operator coordinates/styles or infer business dependencies from color. Component appearance remains project-owned and context-sensitive.

### Carry relationship-specific endpoints through both engines

Extend derived endpoint data with stable relationship/endpoint identity, component, side and slot, retaining x/y for existing geometry consumers. Derive React Flow handle IDs from each relationship's source/target endpoint and render the full endpoint set instead of the first edge's ports. Both layered and compact paths must agree with these endpoints and geometry validation. Side/slot assignment considers the complete flow, usable boundaries, obstacles and reserved lanes; opposite directions and calls to one service receive distinguishable slots.

Evaluate a bounded set of feasible attachment/route alternatives. Explicit composition mode computes that mode; automatic mode records candidate/work/time and crossing/shared-segment/bend/length or detour observations. Preserve topology and measurement readiness limits; no unbounded permutation search or unsupported zero-crossing guarantee. Open arrowheads and visually hidden, measurable handles remain presentation styling over the same geometry.

For a source-supported horizontal flow, accept an optional semantic `flow` intent referencing an ordered simple request-edge path and the approved supporting-service side (`above` or `below`). This is internal agent-authored intent, not operator coordinates; it requires `direction: right` rather than silently overriding `down`. Validate its references and path, retain it only in perspectives containing that complete path, and derive a measured unwrapped primary band with supporting content on the declared side. Preserve rectangular group ancestry; incompatible spans remain explicit limits. A compact-flow candidate replaces the wide compact alternative, keeping the three-candidate budget and shared endpoint router. Selection and evidence distinguish satisfying this intent from merely passing collision checks; legacy models retain their existing generic composition.

### Fill the host and reveal each control region independently

Remove fixed standalone header/footer reservations; the viewport-sized host owns the diagram. Use independent upper/lower control state, revealed by the corresponding 24 CSS-pixel border or interaction within that region. Central hover reveals neither. Visible keyboard focus and open native selects/popovers keep the relevant region operable; coarse pointers keep both available. Border detection does not intercept pointer targets. Source/error/details surfaces stay available independently, and camera/geometry remain unchanged. Native browser fullscreen is separate. The external grayscale wireframe illustrates this behavior before implementation.

Contextual graph colors must not reduce contrast in standardized details or controls. Verify a dark graph-foreground override against the fixed details surface at both required viewports.

Declared flow also guides shared routing: reserve primary corridors before auxiliary labels, prefer facing lateral request attachments, keep reverse synchronous returns in lower lanes, and attach calls toward the declared support side. Keep the existing bounded alternatives and obstacle validation. Assess actual routed progression as well as card order; a valid but circuitous or misplaced route remains unsatisfied intent. Label clearance must account for coherent endpoint reservations rather than letting hypothetical unused approaches consume every primary gap.

### Verify native Excalidraw compatibility rather than assume it

Use the official editor component and its scene-recovery/export APIs through a minimal local verification harness, not a replacement editor. Identify a reproducible compatible SDK/editor revision and lock dependencies before relying on it. Registry stable `0.18.1` and current upstream source are distinct identities: the source contains `labelPosition` and current fixed-point binding fields, so neither an unversioned CDN nor a stable version number proves compatible rendering. The first implementation slice must demonstrate supported native elbows, reciprocal labels, fonts and import/export placement against an identified revision. If the stable build lacks required semantics, pin a verified official revision/build or retain compatibility as pending; do not drop fields to obtain a green PNG.

Read/backup the current editable file, preserve unrelated IDs and human edits, and separate generated drafts from approved scenes. Recover the imported scene, exercise a bound edit, and compare editable/native export outputs. Produce machine-readable integrity observations and captures, while keeping source/visual assessment explicit. Official API references: [scene APIs](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props/excalidraw-api), [export APIs](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/utils/export), [upstream element types](https://github.com/excalidraw/excalidraw/blob/master/packages/element/src/types.ts).

### Bounded independent paired validation is a publication prerequisite

After implementation, deterministic checks and Main's candidate inspection, freeze one candidate commit/tree and package the corrected skill resources from it. Prepare one source/reference bundle and a minimal identical task prompt. The operator selected the first flow, “Crear un pago”, in native Excalidraw and React Flow. The approved detail contains ten visual component occurrences and fourteen directed relationships; source preparation must verify this inventory against the actual image. The source brief supplies architecture facts; the skill supplies method, layout, editing and verification knowledge. The eight-flow collection is reference context, not this pilot's output scope.

Each declared round runs exactly two fresh agents, one generation each, with no inherited conversation, separate consumer directories and the same candidate, inputs, runtime/model/effort and permission scope. The initial C1 pair remains a failed observation. Following the product corrections, Main selects one further bounded pair under the operator's continuing instruction to complete the correction through a conditional merge: two additional generations, four total across the two revisions, with the same case and source bytes. This is revalidation of a materially corrected candidate, not replacement of the original outcomes. Supply only the task, approved sources/references, skill path and output destination. Do not pass the issue's correction narrative, implementation plan, expected answer JSON, coordinates, repair hints or the other trial. Native outputs/usage and wall time remain visible; unavailable usage stays unknown. These are scoped functional observations, not a controlled A/B benchmark or billing estimate.

Main sends no feedback, corrective follow-up or hints during either generation in a round. The skill's own bounded self-inspection/correction is permitted and recorded. Use the same declared 30-minute wall-time limit per agent after common environment prerequisites are ready; a timeout is a visible failed run, not a trigger for a replacement. A material question or blocked run is retained as an autonomy failure; do not rescue/restart it invisibly. After both agents finish, assess their actual rendered/editor outputs against the same source facts and visual reference, and report raw results and differences before PR creation. No generation beyond the two declared pairs is included in this validation plan.

### Predeclare evidence and publication decisions

Deterministic synthetic cases establish port identity/attachment, separate request/return slots, obstacle handling, region-specific control access, true window occupancy, arrowhead/handle presentation, native scene integrity and safe human revisions. Browser checks run against both the kit and the actual trial consumers at 1280×720 and 1440×900, including independent static output. Case readability targets are proposed engineering criteria: component names at least 14 CSS px and relationship labels at least 11 CSS px in the selected per-flow view, plus visual assessment of direction, proximity, spacing and distinct lanes. A numerical font pass does not certify visual quality.

Maintain separate source, mechanical, native-editability, visual and autonomy outcomes. No operator intervention is allowed within either pair. Missing scene/editor/browser proof remains missing. Inspect weak/failed outcomes before deciding the next change; failed observations prevent claiming that revision corrected, and another live run needs a new explicit trial limit. Declared horizontal-flow inspection also records readability separately and fails when an applicable AUTO view lacks complete measurements or falls below the 14/11 defaults; passing this necessary check does not certify visual quality. Model calls stay outside maintained suites. Test-quality/trace methods consume actual evidence, with source-review requirements identified separately rather than inventing executable coverage.

## Risks / Trade-offs

- Shared-port replacement affects both engines and nested/cyclic graphs → introduce one endpoint contract with focused failing cases before renderer integration; preserve existing measured-node and stale-result guards.
- Native scene format and stable SDK diverge → version/capability proof precedes templates and delivery claims; preserve original/native exports and explicit incompatibility evidence.
- Reference overfitting → keep the supplied case outside product assets; ship generic recipes and synthetic varied fixtures, not its finished topology/coordinates.
- Exploration becomes expensive → bounded candidate work and retained timings/counts; assess route quality alongside work rather than optimizing one score.
- Two successful generations are a small sample → report both complete runs and limits without claiming broad reliability or measured savings.

## Migration Plan

Ship the canonical changes, generated agents/skills and maintained cases in one PR with a single minor TH version bump, provisionally 3.57.0, and a versioned starter update. Existing consumer projects remain pinned; selected future copies use the new kit. Keep proposal/design/tasks in Git, verify implementation, synchronize living requirements and remove only the completed archive per repository policy. The operator approved continuation through PR and merge to main only when the objective is demonstrated. Complete the existing requested independent review, CI and Codex bot review, resolve material findings and verify the actual reviewed head before merge. Personal installation is outside this delivery.

Documentation budget: extended — two diagram methods, native scene compatibility, semantic flow intent and a shared routing/presentation contract need aligned references; max 195 added nonblank prose lines outside canonical OpenSpec.
