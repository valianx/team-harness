# Layout, validation and delivery

## Measured geometry

The starter validates the internal model before measuring real components,
headers, ports and edge labels after fonts are ready. Default `auto` composition
compares compact packing with layered ELK candidates and exposes its selection.
React Flow consumes the resulting positions and complete route sections.
Edit `fixtures/sample.json`; demonstration fixtures use a separate immutable model.

The supported directions are `right` and `down`, with at most two group levels:
root → group → subgroup → node. Shared tokens own component dimensions, sibling
and layer clearance, group insets and measured header space. Empty groups retain
measured minimum bounds.

The adapter reserves port clearance below headers and refines obstructed segments
against measured obstacles, preserving endpoints, sections and valid bends.
Choose and assess actual composition candidates through
[composition-review.md](composition-review.md); a successful layout calculation
does not establish that its fitted overview is useful.
Standalone previews accept `?composition=layered` or `?composition=compact` for
explicit comparison. Composition changes preserve the semantic model and direction.

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

`npm ci` prepares package-safe `.gitignore`; with lifecycle scripts disabled run
`node scripts/prepare-project.mjs`, preserving an existing consumer ignore file.

Browser provisioning is a one-time environment step. A compatible installed
Chromium can instead be selected with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.
Keep `DIAGRAM_EVIDENCE_DIR` outside distributed assets; retain diagnostics,
screenshots and traces there. Report unavailable browser/system dependencies as
missing coverage rather than marking the browser check passed. `npm run dev`
opens a local development server; it does not verify production independence.

## Inspect and repair

Inspect the actual editable consumer with the copied project's command:

```sh
npm run inspect -- --out /absolute/evidence
```

It starts its own local Vite server/browser and stops its owned processes. It
compares complete `auto`/`layered`/`compact` views at 1280×720 and 1440×900, then
every perspective in `auto`, saving `run-*/summary.json` and screenshots. Add
`--url http://127.0.0.1:port/` for an already served dev or static build; the actual
model identity guard still applies. Provision Chromium or use the executable
override above. Keep evidence outside distributed assets.

Read fitted label sizes, candidate metrics and diagnostics, then judge the actual
captures through [composition-review.md](composition-review.md). `mechanicalStatus`
does not complete `visualAssessment` or `sourceFidelityAssessment`, which remain
pending; exit 0 is not a visual review. Also exercise details, steps, reduced motion
and an explicitly sized embedding; fixture success alone does not verify the consumer.

| Failure | Action |
| --- | --- |
| Model identity, evidence or reference | Correct the named ID or field path; preserve unaffected identities. |
| Unavailable source or unresolved claim | Seek the missing material or scope decision; keep fidelity draft. |
| Clipped label or changing dimensions | Check local fonts, wrapping and shared measurements; rerun the bounded layout. |
| Overlap, containment or route collision | Inspect offending IDs and complete route/header geometry; correct the adapter or supported composition. |
| Unusable host | Give the viewer a nonzero width and height, then remeasure. |
| Density beyond readable output | Recompose within the visual correction budget; retain the complete overview and add useful perspectives, or report the unresolved constraint. |

Do not conceal a failure with manual coordinates, smaller unreadable text,
diagram-specific CSS or omitted relationships. A kit defect stays a named blocker
with its diagnostics; arbitrary graphs have no universal readability guarantee.

## Independent output and completion

Serve the production `dist/` from a separate static location using an available
static server and repeat inspection with `--url`. Check fonts/assets, details and
steps without access to the installed skill tree. Deliver the editable project, `fixtures/sample.json`,
package/lockfile, `dist/`, evidence locations and any remaining gaps.

Assess source fidelity by comparing this actual output with its original sources;
record that assessment separately from model/geometry/browser/build checks.
Unperformed assessments remain pending. Failing or missing required checks
prevent a successful-completion claim; deployment requires its own scoped
authorization. Report support only for the hierarchy, fixture sizes and execution
environment actually exercised.
