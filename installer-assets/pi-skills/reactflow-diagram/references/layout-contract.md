# Layout, validation and delivery

## Measured geometry

The starter validates the internal model before measuring real components,
headers, ports and edge labels after fonts are ready. ELK derives hierarchy and
routing; React Flow consumes the resulting positions and complete route sections.
Edit `fixtures/sample.json`; demonstration fixtures use a separate immutable model.

The supported directions are `right` and `down`, with at most two group levels:
root → group → subgroup → node. Diagram-space defaults are leaf width 256,
sibling clearance 48, inter-layer clearance 96 and group inset 32 plus measured
header space. Empty groups retain measured minimum bounds.

The adapter reserves port clearance below headers and refines obstructed segments
against measured obstacles, preserving endpoints, sections and valid bends.
Chromium fixtures exercise 14 components/20 relationships rightward and 5/4
downward; large views and ancestor headers may require pan or explicit perspectives.

Each model generation has at most three measurement/layout passes. A readiness
timeout, nonconvergence or stale asynchronous result cannot establish a verified
render. Geometry checks use root diagram coordinates and ancestry to distinguish
containment, endpoint contacts and ancestor-boundary crossings from collisions.
They examine full routes and labels, rather than only path endpoints. Edge-edge
crossings are readability diagnostics, not a promise of crossing-free graphs.

## Run the copied project

Run these commands with the generated project's directory as the working directory:

```sh
npm ci
npm test
npm run build
npx playwright install chromium
DIAGRAM_EVIDENCE_DIR="/absolute/workspace/diagram-evidence" npm run test:browser
```

Browser provisioning is a one-time environment step. A compatible installed
Chromium can instead be selected with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.
Keep `DIAGRAM_EVIDENCE_DIR` outside distributed assets; retain diagnostics,
screenshots and traces there. Report unavailable browser/system dependencies as
missing coverage rather than marking the browser check passed. `npm run dev`
opens a local development server; it does not verify production independence.

## Inspect and repair

Inspect actual output at 1440×900 and 1280×720, including reduced motion and an
explicitly sized embedding. Check long names, nested/empty groups, cross-group
edges, disconnected elements and dense fan-in/fan-out present in the artifact.
Open details, change perspectives and advance steps; confirm focused content and
controls remain usable. Retain artifact revision, kit/dependency identity,
environment, checked fixture sizes, screenshots and machine diagnostics.

| Failure | Action |
| --- | --- |
| Model identity, evidence or reference | Correct the named ID or field path; preserve unaffected identities. |
| Unavailable source or unresolved claim | Seek the missing material or scope decision; keep fidelity draft. |
| Clipped label or changing dimensions | Check local fonts, wrapping and shared measurements; rerun the bounded layout. |
| Overlap, containment or route collision | Inspect the offending IDs and complete route/header geometry; correct the adapter or split explicit views. |
| Unusable host | Give the viewer a nonzero width and height, then remeasure. |
| Density beyond readable output | Retain the semantic model, account for edges across perspectives, or report the unresolved constraint. |

Do not conceal a failure with manual coordinates, smaller unreadable text,
diagram-specific CSS or omitted relationships. A kit defect stays a named blocker
with its diagnostics; arbitrary graphs have no universal readability guarantee.

## Independent output and completion

Serve the production `dist/` from a separate static location using an available
static server. Check local fonts/assets, details and steps without access to the
installed skill tree. Deliver the editable project, `fixtures/sample.json`,
package/lockfile, `dist/`, evidence locations and any remaining gaps.

Assess source fidelity by comparing this actual output with its original sources;
record that assessment separately from model/geometry/browser/build checks.
Unperformed assessments remain pending. Failing or missing required checks
prevent a successful-completion claim; deployment requires its own scoped
authorization. Report support only for the hierarchy, fixture sizes and execution
environment actually exercised.
