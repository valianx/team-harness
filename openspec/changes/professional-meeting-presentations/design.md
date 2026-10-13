## Context

See [proposal.md](proposal.md) for motivation and [the capability delta](specs/professional-meeting-presentations/spec.md) for the observable contract. The approved design and bounded canonical inspection are retained in the selected external workspace at `00-design-proposal.md` and `research/00-research.md`.

The existing React scaffold separates slide, flow and animated scenes, but shared header/navigation rows consume stage space. Scene wrappers repeat headings; keyboard handling is global; animation transport owns a different timeline from the visible component. Installer tests establish file emission, not browser behavior. These findings are source evidence, not measured visual results.

## Goals / Non-Goals

**Goals:** keep the existing entry and scene model, make presentation-engine ownership explicit, give all scene types a shared usable stage, and make representative browser checks reproducible.

**Non-Goals:** redesign existing decks automatically, build a presenter-window protocol, install upstream resources into tracked product files, or expand role/tool authority. No database is involved. The proposal owns the remaining scope exclusions.

## Decisions

### 1. Extend the existing workflow and preserve incumbent engines

Add explicit `improve` routing alongside `new`, `add-scene` and `from-ppt`. Intake establishes the meeting context and preserves an existing project's content, engine and working components. Use the existing `ui-design` workflow for contextual visual direction; unresolved choices use the actual representative slide content. Do not create another presentation skill or another design authority.

For straightforward new decks, follow frontend-slides' native standalone HTML workflow. For new complex React decks, reuse the maintained React template with React Flow/GSAP scenes and the selected Reveal presentation engine. Existing Slidev, Reveal, HTML or other supported decks use their own engine's APIs. This avoids automatic React/Vue conversion and keeps complex components reusable.

Existing workflow-discovery and contextual-ui-design living requirements already support this integration. Update inaccurate public descriptions if needed; add no discovery delta without an actual contract change.

### 2. Resolve upstream authoring outside the product

Add a short integration reference naming the official frontend-slides repository and its preparation/read boundary. Acquire or reuse an isolated checkout beneath the selected workspace or another permitted external provider location. Read its current applicable owner instructions and required resources; retain source revision and capability limits there. Do not copy its design catalog, CSS base or procedures into TH.

Research observed frontend-slides revision `9906a34d640d2111f724544cbc50f7f130569ae1`; it is provenance, not a permanent version pin. Reading upstream instructions does not select inline editing, wheel interception, export or deployment beyond the request. If acquisition fails, disclose the missing route and continue only supported work. A new hardcoded TH authoring recipe was rejected because it would duplicate upstream maintenance.

### 3. Delegate the new React presentation lifecycle to Reveal

Select `@revealjs/react` 0.2.2 and `reveal.js` 6.0.2 for the new complex React scaffold. Main observed the package registry and official repository; the wrapper declares React/react-dom >=18 and reveal.js >=5. Before template delivery, verify package exports, TypeScript imports, an actual build, slide events and cleanup against these exact resolved versions. Registry compatibility alone is not execution evidence.

Keep `SceneData`'s scene variants and existing complex components. The engine owns slide index, presentation sizing, fullscreen and any supported presenter view. The official wrapper owns initialization, updates and disposal. Adapt existing scene navigation and active-scene status to that ownership; remove parallel slide-index or global-keyboard authorities. Use built-in speaker controls or compact native audience controls with CSS reveal/focus behavior. Do not create a second presenter-state synchronization channel.

Configure a 16:9 stage unless request/project format overrides it, disable automatic slide advancement, and use the supported keyboard ownership condition. Graph/animation step navigation is an adapter to the active scene, not another slideshow engine. Route a stage-owned action to an available step before moving slides; expose explicit buttons for reverse/restart where applicable. Inputs, contenteditable, buttons, links, media, selectors, graph controls and consumed events retain their own keys. Inactive scenes must not keep intercepting input.

The first copied-template browser run exposed a content boundary failure: Reveal 6.0.2's `isVerticalStack` searches slide descendants for `section`, so semantic sections in authored content become engine slide stacks and occlude it. Isolate SceneFrame's content in an open shadow root, rendering the React scene through a portal with compiled canonical/React Flow styles and inherited theme tokens. This covers authored HTML and animation components while preserving their semantic markup; keep the headline, slide shell, notes and engine lifecycle outside. Keyboard and pointer ownership follow composed event paths and the deeply focused element. A scoped fragment adapter preserves unmodified same-document links to IDs inside the current root, including URL/history, target focus and back/forward; external and document targets keep native handling. Use supported engine configuration to keep content fragments from becoming slide-index input, without another slide-index owner. Browser regressions cover semantic sections in an actual animation component and local fragment targets. Measurements traverse the open root, including ancestor clipping and hit testing; the boundary must not weaken overflow or occlusion checks.

If integration evidence exposes a package/API incompatibility, first repair the selected maintained route. A replacement that changes the architecture must be reconciled in this design before dependent edits; it must still satisfy incumbent preservation and maintained-engine reuse.

### 4. Give each scene the shared audience stage

The structural preview is `sketches/ui-wireframe.html` in the selected external workspace, linked from `01-plan.md`. It shows content, diagram and animation compositions, idle/revealed/focused controls and degraded states; it is a grayscale wireframe, not a rendered product claim.

The stage contains one scene headline and scene-specific content. Shared chrome moves into a compact overlay area, outside content flow. Theme tokens and stage sizing become one consistent presentation-level input, replacing duplicated defaults where relevant. Preserve confirmed identity on improvement.

Text layouts allow editorial left alignment and controlled line lengths rather than universal centered/max-width wrappers. Image layouts use the intended aspect and visible meaningful content. FlowScene calculates its graph viewport from the shared safe area, with readable nodes/edges at the meeting size; fit-to-view is followed by actual inspection. AnimatedScene receives the same safe area, without another title/frame/control row. Labels and animation states must not overlap controls. Split or recompose dense material rather than hide overflow or reduce type to satisfy a box.

Reveal controls on pointer proximity, presentation keyboard use or focus; hide after inactivity only when unfocused. Keep focused controls visible and remove inactive hidden controls from accidental focus traps. Fullscreen uses the same stage and controls. Respect reduced motion in scene transitions and authored animations, retaining stable explanatory states and explicit navigation.

### 5. Bind animation transport to the actual component

Let the active animated component register its actual timeline/controller with AnimatedScene, including readiness, playback state and disposal. The wrapper controls that registered instance for play/pause/restart and scene steps. It must not create an unrelated empty timeline as a substitute. The GSAP reference and maintained fixture demonstrate the same contract.

Scope creation and cleanup to the component; remove registrations/callbacks and stop playback on scene deactivation/unmount. Publish completion and readiness back to transport. Disable controls until registration is ready and provide a useful failure state if registration fails. Under reduced motion, select stable states and explicit steps without mandatory auto-play. Test registration, pause, restart, completion and scene switching using visible component state, not only button labels. Refresh touched GSAP version/plugin guidance against current official installation/licensing documentation rather than preserving obsolete Club-plugin prohibitions.

Documentation budget: extended — replace obsolete controller/template instructions and contextualize existing mechanics; max 80 total lines each for GSAP/project structure and 80 changed nonblank lines each for existing React Flow/SVG/Radix references, counting additions and removals. Keep testing guidance within its existing 20-line budget.

### 6. Verify behavior and rendered composition separately

Maintain a deterministic fixture containing long/dense text, a local representative image, a labeled graph with steps, and a real animated component. Keep synthetic assets and hermetic tests in the repository; retain run artifacts/captures outside it. The maintained browser harness must run against the copied template and exact installed dependencies, not a hand-written substitute app.

At 1280×720 and 1920×1080, capture each representative scene and relevant intermediate states; measure meaningful content bounds relative to the declared stage/safe area and inspect legibility/overlap. Test fullscreen, reduced motion, hidden/revealed/focused controls, first/last navigation, graph steps, focus-owned Arrow/Space, animation transport and teardown. A custom project format still receives two declared meeting viewports. Do not use arbitrary screenshot pixel equality as the only quality check.

Use TEA's native test-design in Spec and native test-review/trace with the executed evidence in Validation. Main performs the automatically required independent plan review before implementation. Focused browser/control tests complement the maintained full `bash tests/run-all.sh`, skill sync/check, installer template-completeness checks and strict living-spec validation. Role inputs are unchanged, so role generation is not selected. CRAP is unselected for the changed executable scene/input/animation adapters: stateful browser behavior and rendered bounds are the selected evidence, and no matching per-function complexity/coverage collector is established for this template. This is a measurement choice, not a prose-only or zero-complexity claim. OpenSpec implementation verify and authorized archive/synchronization remain separate from this structural planning validation. No model benchmark is selected.

## Risks / Trade-offs

- Reveal wrapping can affect graph dimensions, pointer input or lifecycle → prove sizing, focus and cleanup with the representative fixture before delivering the scaffold.
- Compact hidden controls can harm discoverability → retain pointer/keyboard/focus reveal, visible focus and an unobtrusive accessible entry point; test all states.
- Stage scaling can make crowded content appear to fit → inspect at 1280×720, measure meaningful bounds and split/recompose unreadable scenes.
- Upstream authoring can prescribe broader effects or unavailable capabilities → read actual owner instructions, preserve requested effects and report missing methods without inventing execution.
- A richer template adds dependencies and test cost → keep the fixture focused and engine responsibilities explicit; reuse maintained engine behavior rather than reimplement it.

## Migration Plan

Apply changes to canonical skill/templates/references and maintained tests, then regenerate runtime skill copies. No existing deck is automatically modified or migrated. Improvement reads its incumbent engine; newly copied complex templates receive Reveal. Include release metadata and complete generated assets before final checks. Verify/archive the completed change to create the presentation living spec, remove its completed archive after confirming synchronized requirements, then review/publish through Main's authorized endpoint. Rollback restores the prior canonical template and regenerates its copies; generated user decks remain independently owned.

## Open Questions

- The exact template imports and control/event adapter shape depend on the selected wrapper's exported API. Resolve through the planned package/build/browser checks; the chosen engine and contract are already settled.
- Screenshot and measurement artifact filenames follow the maintained harness chosen during implementation. They must identify viewport, scene/state and candidate, stay in the selected workspace and support native TEA/OpenSpec assessments.
