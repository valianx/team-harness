# Authoring and incremental edits

For agents composing decks from existing technical material.

Use the source's facts and terminology; preserve conditions and uncertainty.
Feature, integration and architecture templates are narrative starting points,
not section quotas. Remove unnecessary example slides and replace synthetic
content with sourced facts. Keep detailed source locators and assessments in the
workspace; public slides need only useful audience-facing attribution.

The kit extends the MIT default Slidev theme. Native navigation, presenter mode,
Markdown imports, Mermaid and `v-click` reveals remain available. Consult the
[syntax guide](https://sli.dev/guide/syntax) and
[layouts guide](https://sli.dev/guide/layout) for engine behavior.
New templates set native `colorSchema: dark` so Mermaid labels match the kit's
dark visual region. Preserve that alignment and check label contrast in captures.

| Layout | Composition |
| --- | --- |
| `h-cover` | Opening claim and context |
| `h-section` | Section transition or decision |
| `h-content` | Problem/proposal, flow, phases, risks or next steps |
| `h-compare` | Default left content and named `right` slot |
| `h-visual` | Default explanation and named `visual` slot |
| `h-demo` | Default explanation and named `visual` demo slot |

All support `title` and `footer` slots. Use native `::right::` / `::visual::`
Markdown slots. The logical stage is 1280×720 with 64-unit outer insets.
Standard title is 1152×88 at (64,64), body 1152×424 at (64,176), footer
1152×32 at (64,624). Cover/section reserve a taller title at (64,144) and
body at (64,352). Shared Inter body text is 28px; move detail to notes or split
slides rather than reduce type. Footers are short references, not body text.

Consume existing diagrams/images and native Mermaid. For a web demo use
`<HarnessFrame src="/demos/example/index.html" title="Descriptive label"
fallback="/fallback/example.svg" fallback-alt="Static explanation" />`.
The component resolves local paths under the build base. Always provide a useful
static fallback. Its status distinguishes same-origin verification from external
limits; browser `load` alone cannot prove a remote app works. External sites may
require network/authentication or prohibit framing. Keep fallback and focus-return
controls accessible; cross-origin Escape handling cannot be guaranteed.

Assign stable native `routeAlias` values to slides that need targeted updates.
Inspect imports and source ownership before editing. The helper uses the pinned
Slidev parser, refuses ambiguous/missing identities and replaces one complete
slide fragment while preserving surrounding bytes:

```bash
npm run update -- --slide retry-handling --file /absolute/updated-slide.md
```

Keep the same alias in the replacement. Follow explicit refusal diagnostics for
unsupported boundaries; inspect and edit that source directly instead of
rewriting the whole entrypoint. For direct edits, compare unaffected slides,
assets and package/lockfile identities. Apply the same update twice to check
idempotence when using a generated fragment.
