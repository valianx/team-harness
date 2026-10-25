# Viewer and visual contract

Copy the starter's components and local assets. Adapt graph backgrounds, colors
and component appearance in `src/styles.css` to the source context and audience.
The model's `presentation` theme selects the kit; it does not mandate its default
palette. Keep graph dimensions, typography, ports, spacing and group headers in
shared tokens consumed by measurement and layout; rerun affected checks after
changing them. Preserve the standard controls in `src/viewer/controls.css`.

| Variant | Meaning |
| --- | --- |
| `service` | An application component or processing service |
| `gateway` | An entry or routing boundary |
| `database` | A data store |
| `queue` | A queue or message broker |
| `external` | A system outside the requested boundary |
| Group | Visual containment; no implicit C4 classification |

Names wrap at the kit's controlled width using bundled Inter assets. Keep names
recognizable and unambiguous; preserve full names and move extended explanations
into `description`, which remains available in details. Compact wording preserves
component identity, relationship meaning and source facts. Source locators and
inference decisions belong with those details. Avoid copying private documents
or credentials into a public build.

Inspect legibility at the intended logical viewport and fitted zoom. Higher pixel
density improves sharpness without enlarging text. Judge useful graph aspect,
fitted label readability and meaningful grouping through
[composition-review.md](composition-review.md); correct the overview before adding
supplementary perspectives. A compact bounding box alone does not establish a
readable composition.

## Interaction

Reuse the standard control appearance and placement: title, perspective and Fit
view at the top; legend, zoom, presentation steps, validation and perspective
context at the bottom. Controls float over the canvas and reserve no layout space.
On fine-hover devices they hide outside the viewer and appear for hover, visible
keyboard focus or open control popups; on coarse pointers they remain visible.
Visibility changes never resize the canvas, move the camera or alter graph geometry.
On narrow canvases the control stacks scroll independently, keeping their content
accessible and leaving room to pan the diagram between them.

The initial view is the complete architecture; steps focus only after explicit
navigation. Fit view resets the guided tour. Automatic framing and Fit
view preserve aspect ratio inside the centered 90% canvas rectangle, including
target nodes and their connecting routes and labels, subject to zoom limits.
This is 90% of the limiting dimension, not 90% of the area. Manual pan/zoom remains
available. Details reserve their own space; source warnings and errors stay visible.
Steps preserve geometry and necessary ancestors. Respect reduced motion.

Inspect loading, empty, invalid model/layout, unresolved sources, missing
validation and unusable-container states as applicable. A source draft can have
passing geometry; pending validation stays visible independently.

## Embed the copied viewer

Use the public component exported by `src/viewer/ArchitectureViewer.tsx`:
`ArchitectureViewer({ model, evidence, composition })`. `model` is `unknown`,
`evidence` is optional `ValidationEvidence`, and optional `composition` selects
`'auto' | 'layered' | 'compact'`, defaulting to `'auto'`.
Load React Flow's stylesheet and the copied `src/styles.css`. In an SSR host,
render this viewer within a client-side boundary; measurement requires the DOM.
Give the host an explicit usable width and height, including in flex/grid layouts.

Example from a component in the copied `src/` directory:

```tsx
import '@xyflow/react/dist/style.css';
import './styles.css';
import { ArchitectureViewer } from './viewer/ArchitectureViewer';
import model from '../fixtures/sample.json';

export function Diagram() {
  return (
    <div style={{ width: '100%', height: 720 }}>
      <ArchitectureViewer model={model} />
    </div>
  );
}
```

`ValidationEvidence` has `model: "pass" | "fail"` and
`geometry`, `rendered`, `build: "pass" | "fail" | "missing"`. Supply it only
from executed checks for this artifact revision; omit it while checks are pending.
Source fidelity requires its separate assessment.

Build from local copied files and the pinned lockfile. Production output must
contain its own dependency/font assets, with no imports into sibling projects or
installed skill paths. Reveal integration is outside this kit's contract.
