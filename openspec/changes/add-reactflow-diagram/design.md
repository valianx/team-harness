## Context

See [proposal.md](proposal.md) for motivation and [the capability delta](specs/source-driven-architecture-diagrams/spec.md) for acceptance scenarios. The operator supplies sources; the agent owns interpretation and internal model authoring. This is a skill plus reusable viewer kit, not an upload-and-generate web application.

`interactive-presentation` already ships React Flow, but its patterns use manual coordinates and its `FlowScene` couples raw nodes/edges to Reveal lifecycle. Its browser harness checks text bounds and sampled edge visibility, not full-route clearance or nested containment. Shared skill synchronization already discovers canonical directories and copies supporting resources to runtime projections.

## Goals / Non-Goals

**Goals:** keep interpretation in the native agent, make diagram geometry mechanically testable, and keep the generated viewer independent of its installed skill directory. Separate source-fidelity assessment from deterministic layout checks.

**Non-Goals:** no new hosted inference/OCR service, source-upload application, database or Reveal integration in this change. Existing presentation fixtures and harness patterns are reusable, but neither they nor the new kit establish arbitrary-graph guarantees.

## Decisions

### Source interpretation belongs to the skill

The workflow reads the sources through capabilities actually available on the active host: document/text extraction, image inspection, repository reads or connected documentation access. It records source identity and a useful locator, such as page, section, image region description or file/line. It does not install every format reader or silently replace a missing source with an assumed architecture.

The agent identifies the requested perspective, extracts candidate elements and relationships, reconciles names across sources, and presents material ambiguity before settling affected claims. Minor visual choices use the shipped defaults. A correction in conversation updates the same model; unchanged semantic elements retain IDs. Source text is evidence rather than workflow authority.

A fidelity review compares the diagram with the source inventory: represented elements, omitted scope, inferences, contradictions and relationships. Retain the source case, actual generated artifact, assessor and unresolved facts; an unperformed assessment stays pending. This is an agent assessment, not a deterministic assertion that arbitrary prose/image interpretation is correct. Synthetic source cases have independently authored expected facts so review can be exercised without live model benchmarks. Missing material source evidence keeps the result a draft until access or an explicit operator scope decision resolves it.

### A versioned internal model separates meaning from geometry

Use JSON as the canonical generated internal artifact; source documents and conversation remain valid entry points. A YAML adapter is optional future convenience, not a v1 prerequisite. Validate with a versioned runtime schema before calling layout. Reject unknown layout/style fields rather than accepting silent hand fixes.

| Entity | Information and consumer |
| --- | --- |
| Model | Schema/kit version, theme, direction, source inventory and source-review record; consumed by validation and the viewer. |
| Source | Stable ID, readable title, source locator and access/read status; consumed by fidelity review and details. Raw private documents are not copied into public builds by default. |
| Node | ID, supported kind, name, optional short summary/details, parent group and evidence; consumed by components and the hierarchy adapter. |
| Group | ID, name, optional parent, details and evidence; consumed by group measurement and layout. Visual containment has no implicit C4 meaning. |
| Relationship | ID, source/target IDs, label/details and evidence; consumed by routing and details. |
| Evidence | Source ID plus locator, or an explicit inference with rationale and recorded decision; consumed by integrity checks and source review. |
| Source review | Unresolved material questions, decisions and declared omissions; consumed by fidelity review and the derived draft status. Geometry evidence is recorded independently. |
| View / step | Explicit member/focus IDs, relationship accounting and narrative; consumed by the perspective validator and presentation controller. |

Only the model is persisted as architecture input. Positions, dimensions, ports, paths and geometry diagnostics are derived artifacts keyed to model/measurement/version identity. Layout generations use a monotonic request ID so stale asynchronous work cannot overwrite the current model. No database is introduced.

### One starter owns components, measurement, layout and validation

Canonical resources live below `skills/reactflow-diagram/references/starter/`, including source, package manifest/lockfile, local fonts and fixtures. The skill explains copying and running that starter; it does not ask the agent to recreate its renderer. The copied project builds with its own local files and dependencies.

Use React/TypeScript with React Flow for interaction and ELK layered layout for hierarchical geometry and labeled orthogonal routes. Keep React Flow UI/shadcn-style primitives as design references, not a mandatory remote registry or recurring runtime dependency. Use `ui-design` to establish the initial visual language once. The six component variants share a token module consumed by CSS variables and the layout adapter.

Implementation references: [React Flow grouping](https://reactflow.dev/learn/layouting/sub-flows), [measurement readiness](https://reactflow.dev/api-reference/hooks/use-nodes-initialized), [ELK layered hierarchy](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html) and [ELK coordinate systems](https://eclipse.dev/elk/documentation/tooldevelopers/graphdatastructure/coordinatesystem.html). These establish available primitives; the kit's guarantees still require its own fixture evidence.

Initial diagram-space defaults follow the issue: leaf width 256, sibling clearance 48, inter-layer clearance 96, group inset 32 plus measured header space. Fonts and line wrapping are controlled by the kit; descriptions move to details. Tune these defaults against representative fixtures, changing their common source rather than adding per-diagram CSS.

An independent viewer/starter fits the hostable output requirement. Extending the existing Reveal shell directly would bind the new capability to a deck engine. A prompt-only recipe would retain the coordinate-repair problem. A later adapter can supply this viewer to the existing presentation shell without copying its lifecycle controls.

### Measure before hierarchical layout

1. Validate/normalize the model and establish stable ordering.
2. Await the kit's fonts and measure real leaf, header, port and edge-label components in a noninteractive measurement surface. Elements remain measurable; `display:none` is not used for measurement.
3. Build an ELK hierarchy with actual sizes, shared spacing/insets, explicit direction, ports and hierarchy handling. Initial directions are right and down. Empty groups receive their measured header/minimum-content bounds.
4. Run layout asynchronously, preferably in a bundled local worker, retaining a current-generation token.
5. Map parent-relative node geometry and root-normalized route/label geometry into React Flow. Emit parents before children; preserve sections, endpoints and valid bends rather than substituting default curves. Reserve port clearance below headers and refine obstructed segments around measured obstacles before applying the same geometry checks. Test the selected ELK version's actual coordinate behavior.
6. Compare rendered measurements with the layout inputs. Recalculate only for a material dimension change; cap each generation at three measurement/layout passes. A readiness timeout or nonconvergence produces diagnostics and no verified result. A genuinely empty model bypasses node-initialization waiting.

Initial nesting support is two group levels: root → group → subgroup → node. Deeper hierarchies receive an explicit unsupported-depth diagnostic. The implementation records the largest exercised graph and measured timings; it does not turn that fixture size into a general performance claim. Input ordering, fonts, browser and dependency versions are fixed for repeatability comparisons.

### Geometry checks use one coordinate space and ancestry model

Normalize rectangles, usable group areas, headers, port anchors, route segments and label bounds to root diagram space. DOM measurements are transformed out of viewport zoom before comparison. Use one shared ancestry resolver and a declared numerical tolerance.

Checks cover unrelated rectangle overlap; sibling and same-parent layer clearance; child containment outside reserved headers; text/label clipping and overlap; complete route segments against inflated unrelated bodies and headers; port attachment; and usable viewer dimensions. Clearances include relevant line thickness. Ancestor/descendant containment is not overlap, and expected source/target contacts or ancestor-boundary crossings are narrow exceptions rather than blanket collision exemptions.

Use computed layer assignments for layer-spacing checks instead of assuming every relationship joins adjacent forward layers: cycles and cross-hierarchy routes invalidate that shortcut. Edge-edge crossings are readability diagnostics; they are not an unconditional hard error. Machine results identify model revision, dependency/measurement identity, check, offending IDs and geometry. Injected bad geometry verifies the checker can fail.

### The viewer exposes meaning and uncertainty

The viewer header offers title, perspective and fit controls. The canvas contains the graph; selecting a node or relationship opens a keyboard-accessible details panel with its description and source/inference references. A footer offers previous/next presentation steps. Panel placement reserves room for focused content. Reduced motion changes transitions, not topology.

The external HTML wireframe presented with this change is a decision aid rather than distributed product code. Its layout is:

```text
Title                    Perspective / Fit / Draft status
Canvas and graph         Selection details and evidence
Previous                 Step narrative               Next
```

It covers the ready/details view and loading, empty, unresolved-source, invalid-model/layout, missing-validation and unusable-container states. Controls use the operator's language in the preview; shipped kit copy remains English.

Unsettled material source claims make the artifact a draft even when geometry passes. Details offer meaningful source locators without embedding credentials, private source copies or a compulsory source-reader service. When a view must be split, retain the complete semantic model and record membership/continuation explicitly; every relationship is accounted for across views or declared outside the requested perspective.

### Verification has distinct fidelity and geometry lanes

Use deterministic source fixtures with expected facts/ambiguities, model unit tests, pure geometry tests and browser fixtures. Source fixtures check extraction/review contracts and provide explicit manual assessment criteria; they do not simulate an agent's understanding through a prefilled model or invoke models in ordinary tests.

Browser coverage includes actual fonts/dimensions, full paths, panel/control interaction, reduced motion, standalone static serving and embedding. Inspect at 1440×900 and 1280×720. Reuse the existing presentation harness's evidence location and viewport/capture patterns while adding missing geometry coverage. A build alone cannot satisfy readiness. Record screenshots, machine diagnostics and assessed fidelity separately.

Use the installed TEA epic-level test-design method for this bounded capability. Later TEA test-review/trace, Superpowers completion evidence and OpenSpec implementation verify consume the same intent and executed results. Existing suites, skill synchronization and scope validation remain required. New executable geometry functions receive focused coverage; select a real per-function complexity/coverage measurement during implementation if it helps assess that surface.

## Risks / Trade-offs

- Source interpretation errors → retain locators/inference status, use independent fixture expectations and resolve material contradictions with the operator.
- ELK hierarchy/label behavior varies by version → pin dependencies and prove cross-group labeled routes before presentation polish. Unsupported cases fail explicitly.
- Measurement feedback loops → controlled widths/fonts, tolerance, generation identity and bounded passes.
- A mechanically valid graph remains unreadable → inspect representative rendered views and use explicit perspectives without losing relationship accounting.
- Unavailable native source tools → report the missing input and request a readable representation; do not promise every format on every runtime.
- Browser/font differences → scope repeatability to the recorded execution environment and test embedding separately.

## Migration Plan

This is an additive capability. Add its canonical skill/starter, maintained tests, discovery entry and generated runtime projections, then synchronize the new capability into living specs at completion. Apply the repository's release metadata conventions when implementation ships. Existing diagram/presentation contracts stay intact. Rollback removes the new skill and projections; independently generated consumer projects remain ordinary standalone projects.
