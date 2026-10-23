# Viewer and visual contract

Copy the starter's components and local assets. Its shared token module and CSS
own typography, component dimensions, ports, spacing, group headers and motion.
Use the supported `presentation` theme; change a shared token only when a measured
fixture demonstrates the need, then rerun the affected checks.

| Variant | Meaning |
| --- | --- |
| `service` | An application component or processing service |
| `gateway` | An entry or routing boundary |
| `database` | A data store |
| `queue` | A queue or message broker |
| `external` | A system outside the requested boundary |
| Group | Visual containment; no implicit C4 classification |

Names wrap at the kit's controlled width using bundled Inter assets. Keep names
recognizable; move extended explanations into `description`, which remains
available in details. Source locators and inference decisions belong with those
details. Avoid copying private documents or credentials into a public build.

## Interaction

The viewer provides title, perspective and fit controls; a pan/zoom canvas;
keyboard-accessible node/relationship details; and previous/next presentation
steps with narrative. The details panel reserves space beside the canvas.
Presentation steps change focus and narrative while preserving geometry and
necessary ancestors. Reduced motion changes transitions.

Inspect loading, empty, invalid model/layout, unresolved sources, missing
validation and unusable-container states as applicable. A source draft can have
passing geometry; pending validation stays visible independently.

## Embed the copied viewer

Use the public component exported by `src/viewer/ArchitectureViewer.tsx`:
`ArchitectureViewer({ model: unknown, evidence?: ValidationEvidence })`.
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
