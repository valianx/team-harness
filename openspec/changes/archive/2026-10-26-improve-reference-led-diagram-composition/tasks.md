# Reference-led Diagram Correction Implementation Plan

**Goal:** reproduce approved diagram composition with editable native output and less operator correction.
**Architecture:** retain the source-led skills and measured viewer; repair native editing, relationship endpoints and presentation together.
**Tech stack:** React, TypeScript, ELK, Playwright, Python and an identified official Excalidraw SDK.
**Spec:** [design.md](design.md) and the two delta specs under `specs/`.

## Global constraints and review focus

Preserve schema-version-1 inputs, source topology, human scene edits and explicit engine choices. Retain the complete requested flow, stable 90% framing and independent 24 CSS-pixel border controls. Each declared validation pair has two fresh generations, both formats per agent, without feedback or replacement. Preserve the failed C1 and C3 pairs; one final bounded pair follows the remaining causal corrections. Publication and merge require demonstrated success.

Review bound-label changes after editor recovery, backup/read failures, reciprocal and nested endpoint collisions, popup/focus retention at narrow hosts, and stale consumer captures. Native tests, both routing engines, browser tests and actual-consumer inspection own these cases respectively.

## 1. Reference-led native authoring

Files: `skills/excalidraw-diagram/references/` tools, native editor harness and integrity tests; canonical diagram skill/role prose. Start with compatibility and safe-revision cases that fail on the current exporter, then implement and run the native unit/editor suites. Scene verification consumes an editable file and emits recovered scene, export and observations into an external directory.

- [x] 1.1 Pin and verify a compatible official editor with native elbows, reciprocal labels/fonts, coherent bindings, import/export and recovered edits. Cover safe scene revisions, backups and unrelated human changes; retain SDK mismatch failures.
- [x] 1.2 Align Excalidraw/diagram/React Flow skill references and diagrammer/direct-mode guidance with scoped approved composition, source completeness, contextual styling and optional web reconstruction.
- [x] 1.3 Detect native bound labels that conceal their connection or arrowhead, expose measured fitted typography for presentation review, and guide sufficient label/arrow clearance without shrinking text or breaking native bindings. Separate bounded prerequisite repairs from visual corrective cycles and retain actual-editor/export regressions.

## 2. React Flow routing and presentation

Files: starter `src/{types,model,layout,compact-routing,composition,geometry}.ts`, adjacent endpoint helpers, `src/viewer/`, standalone shell and matching unit/browser tests. The shared endpoint type is `Point & { id: string; nodeId: string; side: 'left' | 'right' | 'top' | 'bottom'; slot: number }`; route coordinates remain world coordinates, IDs are `<relationship>:source` / `<relationship>:target`, and slots are zero-based. The viewer receives complete endpoint arrays with node-relative coordinates and matching handle IDs. Write behavior regressions first, observe their failures, implement and run `npm test`, build and dev/static browser suites in copied consumers.

- [x] 2.1 Add validated optional relationship interaction classes with backward-compatible unclassified inputs and context-sensitive relationship styling.
- [x] 2.2 Introduce stable per-relationship endpoint identity/side/slot data, preserving x/y consumers; replace shared-port assertions with endpoint, cycle, nested and fan-in/fan-out invariants.
- [x] 2.3 Integrate bounded endpoint allocation/routing through layered and compact engines, including opposite-direction lanes and feasible facing-side/obstacle cases. Retain candidate/work/time and route-quality evidence, isolate explicit modes and test exploration limits without flaky timing thresholds.
- [x] 2.4 Render the full endpoint set with matching edge handle IDs, readable open arrowheads and visually hidden measurable handles; retain controlled-node dimensions and relationship details.
- [x] 2.5 Fill the standalone window and implement independent 24px upper/lower border reveal with central-hover, keyboard, native-popup, coarse-pointer, embedded, hit-target and stable-camera browser cases.
- [x] 2.6 Validate optional source-derived flow intent and retain it coherently in perspectives; derive a measured unwrapped request spine and contextual support side, guide the shared endpoint router within three candidates, and assess actual request/return/call lanes separately from collision validity. Add synthetic hierarchy, order, route, permutation, fallback and selection regressions before implementation; retain explicit intent failures.
- [x] 2.7 Preserve standardized details contrast under contextual graph colors and add a failing actual-DOM regression at both required viewports before the correction.
- [x] 2.8 Constrain supporting-call search to the declared side and reserve distinguishable call corridors without forbidding isolated crossings; retain existing search limits, add independent synthetic regressions for enlarged labels and repeated calls, and verify copied failed consumers without modifying their original outputs. Honor shared group minima in both engines and keep synthetic checks independent of permitted contextual typography and palette choices.

## 3. Maintained validation and distribution

Files: maintained synthetic cases and CI, generated `runtime/` projections, release metadata and the nearest testing references. Main serializes generation and Git writes. Run `bash tests/run-all.sh`, all required Codex generation commands and `sync-skills.mjs --check`; inspect the complete candidate before freezing it.

- [x] 3.1 Add small synthetic source/flow fixtures and focused test modules for native editing/export, route semantics, labels, presentation and independent flow composition; exclude the trial's completed answer from shipped assets.
- [x] 3.2 Run applicable model/geometry/unit/build and development/static browser checks, including actual native-editor recovery; retain separate source/visual/editability outcomes and named limits.
- [x] 3.3 Generate canonical role/skill projections and assemble the single applicable release/starter version with concise reference/testing documentation.
- [x] 3.4 Run the required local full repository suite and generation/synchronization checks, inspect the complete candidate and renew affected evidence after corrections; retain remote native-platform CI as a required pre-merge delivery check in the workspace.

## 4. Two independent no-feedback generations

Files: external trial bundles and consumer outputs only. Freeze source/candidate hashes and the literal prompt using `./output` in separate working directories. Retain both original outcomes and native time/usage observations; assess actual editor/static outputs at both viewports before OpenSpec implementation verification.

- [x] 4.1 Freeze the initial reviewed candidate, source/reference/skill bundle, identical minimal prompt and runtime/model/effort metadata. Run exactly two fresh agents once each in separate directories under the declared 30-minute limit, without inherited context, feedback, rescue/replacement or access to the other output; preserve actual usage/time, questions and failures.
- [x] 4.2 Assess both completed outputs against the same source facts and approved visual reference, inspect native editor and actual static browser output, and report fidelity, editability, readability, routing, controls and autonomous self-correction separately.
- [x] 4.3 Freeze the corrected reviewed candidate and run one additional pair of two fresh agents, one generation and at most 30 minutes per agent, against identical sources and minimal task inputs; assess both formats independently without feedback, retain the initial failures and report all four original outcomes across the two revisions.
- [x] 4.4 After the remaining native-visibility and supporting-corridor corrections pass deterministic checks and independent review, freeze that corrected revision and run one final pair of two fresh agents, one generation and at most 30 minutes each, with the same source bytes and minimal task, no feedback or replacement. Report all six outcomes across revisions and require both final paired outputs to meet the objective before publication.
- [x] 4.5 Verify the implementation against the ten changed/added requirements, acceptance scenarios and design using the current evidence; retain all three declared validation rounds and unresolved limits before PR preparation.
