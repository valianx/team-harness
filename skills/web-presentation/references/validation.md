# Presentation validation and delivery

For agents assessing an actual authored deck, independently of its examples.

Run in the copied project, retaining outputs in a real external evidence folder:

```bash
npm run check
npm test
npm run build -- --base /talks/example/
WEB_PRESENTATION_EVIDENCE_DIR=/absolute/evidence npm run test:browser
WEB_PRESENTATION_STATIC=1 WEB_PRESENTATION_EVIDENCE_DIR=/absolute/static-evidence WEB_PRESENTATION_SERVER_COMMAND='npm run preview -- --base /talks/example/ --port 4173 --host 127.0.0.1' WEB_PRESENTATION_BASE_URL=http://127.0.0.1:4173/talks/example/ npm run test:browser
```

Provision Chromium explicitly before these checks; report missing tooling instead
of silently skipping required assertions. The maintained browser lane covers
1280×720 and 1440×900. Select the actual consumer deck, not just a demonstration
fixture. Other engines/browsers and arbitrary layouts require their own evidence.

Require actual loaded Inter faces, decoded images and stage readiness before
measurement; settled font loading alone can include failed fonts. Geometry uses
actual DOM bounds normalized to the Slidev canvas, with a small rounding tolerance;
it reports slide, region and element for overflow/clipping/collisions. Hidden
reveals and intended parent/child containers are distinct from unintended overlap.
Check initial, intermediate and final meaningful reveal states. A zero-element
measurement is not a pass. Required images/SVGs must have visible nonzero bounds,
including native Mermaid's open shadow tree. Confirm negative overflow, clipping and missing-asset
fixtures fail before trusting an oracle. Visual review still assesses readability,
hierarchy, density and whether the composition supports the argument.

Inspect captures at both viewports and compare with the agreed structural sketch.
Verify the catalog used by the deck, keyboard navigation, focused inputs, local
frame entry/Escape recovery, failed-frame fallback and reduced motion. External
frame access can remain unverified; retain its explicit status and usable fallback.
Changing coordinates or clipping meaningful content is not a layout repair.

Compare actual generated Markdown/rendered claims with the source inventory.
Retain assessor, source/artifact identities, represented facts, conditions,
omissions, inferences and unresolved contradictions. Automated lint cannot judge
source fidelity. Demonstrate kit reuse with two distinct decks and compare
unaffected raw bytes, assets and dependency pins after a repeated targeted update.

Serve the actual static build under its configured non-root base. Check navigation,
local fonts/images/frame paths and resource requests. The normal build always
uses `--without-notes`; verify a synthetic private note canary is absent using an
included-notes build as a positive control. Inventory external resources and
remaining sensitive content; note exclusion alone is not a privacy audit.

The source inventory checks literal Markdown/HTML references, native slide
`background`/`image` fields, and explicit root `favicon` and
`defaults.background`/`defaults.image` fields. Native color values are excluded.
It does not evaluate arbitrary metadata, expressions or CSS, select which layout
consumes a field, or establish runtime loading or external access.

Deliver editable sources, `dist/`, actual commands/results, captures and specific
gaps. A missing, skipped, uncollected or failing required check leaves that behavior
pending even if the build succeeds. Preview reports its observed address and
process lifetime; static build/preview does not deploy or publish the deck.

The pinned upstream Twoslash integration can log `Failed to patch FloatingVue`;
registration continues, but its auxiliary menu drag guard is unavailable. These
checks do not establish tooltip-hover/drag coverage or a clean dependency audit.
