
# Meeting web presentations

Create meeting-ready web decks or improve existing presentations using their
actual narrative, audience and visual context. Main can run this skill directly.

## Context and destination

Reuse [workspace](../workspace/SKILL.md) and an already supplied absolute
`workspace` / `deliverable_target`. An explicit project target wins; keep notes
and evidence in the shared workspace. Resolve resources from `skill_root`, the
active installation containing this file. Package commands run in the actual
presentation project, never an inferred current-directory duplicate.

Establish topic, audience, meeting objective, factual content, assets, existing
project and requested endpoint from available context. Reuse supplied answers.
For improvement, inspect the incumbent engine, components, design tokens and
rendered deck. Preserve its facts, intentional sequence and useful interactions.

Use [ui-design](../ui-design/SKILL.md) for contextual hierarchy, palette,
typography, spacing and rhythm. Retain confirmed identity during refinement.
Resolve a material unsettled direction using representative real slide content;
settled direction needs neither redundant alternatives nor another approval.
Present or reuse the [structural wireframe](../sketch/SKILL.md) before frontend
implementation. Keep the requested local, design-only or implementation endpoint.

## Modes and authoring route

- **`new`:** choose the authoring route from the content and interaction needs.
  For straightforward narrative decks and simple visuals, read
  [frontend-slides integration](references/frontend-slides.md) and follow its
  applicable native HTML workflow. For complex React components, copy the
  complete `references/templates/` tree to the explicit target and follow
  [project structure](references/project-structure.md). The new scaffold uses
  the official Reveal React wrapper with React Flow and GSAP scene variants.
- **`improve`:** inspect the existing deck at its meeting viewports, identify
  concrete composition or interaction problems and implement the requested
  improvements. Retain its HTML, Reveal, Slidev or other incumbent engine and
  reusable components; use its supported APIs. An improvement does not imply
  framework migration or identity replacement.
- **`add-scene`:** find the incumbent configuration and components, generate the
  requested scene and add it in the intended sequence. Match that project's
  engine, visual direction and working interaction contracts.
- **`from-ppt`:** catalog supplied slide images or exported content and preserve
  the factual order. Recreate text/simple visuals faithfully when useful; retain
  complex or branded images with their intended aspect and meaningful alt text.
  Implement the requested interactive slides as components. Resolve missing
  interactivity choices before dependent work; conversion does not authorize
  invented content or blanket redesign. Use the selected route for a new deck.

Read upstream instructions outside tracked TH product files. Their suggestions
do not authorize inline editing, wheel interception, export or publication
beyond the requested effects. Reuse supported engine presenter capabilities;
avoid a second slideshow or presenter-window synchronization system.

## Compose and connect scenes

Use a 16:9 audience stage unless the request or incumbent project defines another
format. Give each scene one headline and a suitable text, image, graph or
animation layout. Reserve a compact overlay area for controls, outside content
flow. Split or recompose crowded material before clipping meaningful content or
shrinking it below readable meeting size. Fit-to-view alone does not prove that
graph labels are legible.

Theme all content and controls from the same contextual tokens; examples are
starting mechanics, not a prescribed palette or typeface. Preserve image aspect
and essential details. Diagram nodes, edge labels and tooltips must fit the
usable stage without colliding with overlays.

For complex React scenes, read only the relevant references:

| Need | Reference |
| --- | --- |
| Graphs, labels and highlight steps | [React Flow](references/react-flow-patterns.md) |
| Real timeline/controller registration and cleanup | [GSAP](references/gsap-patterns.md) |
| Responsive vector composition | [SVG](references/svg-patterns.md) |
| Scene selectors, sliders and toggles | [Radix](references/radix-patterns.md) |

The engine owns slide index, sizing and lifecycle. One active-scene adapter
routes stage-owned shortcuts to scene steps before changing slides, observing
first/last boundaries. Inputs, editable regions, buttons, links, media, selectors
and graph controls retain their own keys. Avoid duplicate global key handlers.

Animation transport must control the component's actual registered timeline,
including readiness, pause, restart, completion and deactivation cleanup. Do not
create a separate empty timer. Reduced motion retains stable explanatory states
and explicit steps without compulsory auto-play. Keep compact controls named,
focus-visible and revealable by pointer, keyboard or focus; hide them only while
unfocused. Retain fullscreen access.

## Verify and deliver

Run the selected route's dependency/build checks and inspect the actual deck in
a browser at 1280×720 and another declared meeting viewport, normally 1920×1080.
Check representative content and interactions present: long/dense text, image
details, graph labels/steps, real intermediate/final animation states, idle and
focused overlays, key ownership, fullscreen and reduced motion where applicable.
Use captures and meaningful content bounds to assess readability, clipping and
collisions. Correct observed failures; a build or hidden overflow is insufficient.

Report the deliverable location, run instructions, selected route, changes,
executed checks and material omissions. Distinguish source, build, browser and
visual evidence. If rendering or a required capability is unavailable, retain
partial evidence and report that check pending with supported recovery.
