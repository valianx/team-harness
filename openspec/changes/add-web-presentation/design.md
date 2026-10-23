## Context

See proposal.md for scope and the new capability for acceptance. The incumbent
interactive-presentation contract remains intact. This addition targets repeated
technical proposals and incremental source editing, with Slidev owning the engine.
The repository's npm and OpenCode distributions must both retain consumer assets.

## Goals / Non-Goals

The design separates source content, reusable kit and interpretation/validation
evidence. It does not add another presentation DSL, authoring service, diagram
renderer, synchronization engine or global agent integration.

## Decisions

### Versioned addon over an existing theme

Pin Slidev 53.0.0 and @slidev/theme-default 0.25.0, verified from npm and official
documentation. Start from that MIT theme and native navigation; add only scoped
`h-*` layouts/components in `slidev-addon-harness` 1.0.0. Its canonical source is
`references/kit/`; a reproducible npm archive is shipped in the starter's vendor
directory and pinned by the consumer lockfile. No public npm release is needed.
Do not import React into Vue. The archive and project are independently owned
after copying, so a TH update cannot mutate an existing deck.

The installer will allow inert `.tgz` archives and `.vue` skill source explicitly, preserving other
fail-closed path rules. Tests must inspect actual npm file lists and the real
OpenCode emitted manifest. Copy-safe ignore templates are materialized during
consumer installation; preexisting ignore files are preserved.

### Content stays Markdown

Provide feature, integration and architecture template entrypoints using native
Slidev Markdown, imports and frontmatter. Source-led editing preserves facts and
labels proposals/assumptions; no second proposal is required. A named-slide update
utility uses the pinned upstream parser, preserving untouched source bytes and
rejecting ambiguous identities. Repeating an update replaces that named target,
rather than appending duplicates. Creation refuses an existing output directory.
Other engine projects remain on their incumbent route unless migration is asked.

### Shared stage and patterns

Reuse the established graphite/teal technical-artifact direction with local Inter
fonts. Use a 1280×720 logical stage, 64-unit outer insets, reserved title/body/footer
regions and shared gap/type tokens. Text uses readable body sizes rather than
content-dependent shrinking. Six layouts cover cover, section, content, comparison,
visual/explanation and demonstration. Markdown composition supplies problem/proposal,
flow/reveal, phases, risks and decisions through those same layouts; every pattern
has a realistic example. Native Slidev controls stay outside meaningful content.

The required grayscale structural preview is retained as `ui-wireframe.html` in
the selected external operational workspace and presented before implementation.
Browser assessment compares delivered regions/states with
that structure. Prior Impeccable acquisition failed at release-asset DNS; reuse
the documented manual/browser fallback and report the absent detector explicitly.

### Generic visual embedding

A Vue iframe adapter resolves local assets relative to the build base, defines a
visual region, labels the frame, reports loading/error/verification limits and
always exposes a static fallback. Same-origin demos support Escape focus recovery;
cross-origin access cannot be assumed, so accessible exit/fallback controls and
the explicit framing/verification limit remain available. Synthetic local demo
fixtures prove keyboard ownership without requiring React Flow. Existing SVG,
images and native Mermaid remain independent content choices.

### Validation and public builds

Use the official Slidev parser for content identity and supported update boundaries.
Validate placeholders, local asset references and external-resource inventory;
do not claim semantic fidelity from lint. Browser checks wait for relevant fonts,
images and stage readiness, then measure actual regions/content in a single state,
normalizing canvas scaling and accounting for hidden reveals/intended overlays.
Diagnostics name slide/region/element. Include negative overflow, clipping, missing
asset and failed-frame fixtures so a validator pass is not vacuous.

Default build uses `--without-notes`. Serve the actual static artifact under a
non-root base path and inspect navigation, reveal states, embedded paths, focus,
local assets and a private synthetic note canary. This proves only that canary's
absence, not general confidentiality. Offline claims require observed asset
closure; external resources remain enumerated. Build/preview never deploys.

### Evidence and delivery

TEA test-design precedes implementation; test-review and trace assess the identified
candidate. Use meaningful unit/integration checks, Chromium at 1280×720 and 1440×900,
manual visual review, full repository tests, sync freshness, Pi generation,
actionlint, release preflight and native OpenSpec verify. CRAP is applicable but
not selected; no numeric quality or general-performance claim will be inferred.
No live model benchmark is selected. Two distinct decks must share the exact kit;
an idempotent update must preserve unrelated byte hashes and dependency pins.

Operational/provider outputs belong in this effort's selected real local
operational directory; configured native Space retention
remains subject to its observed completeness limit, with no local context mirror.
Author review (tester/qa/security), PR, Codex bot correction and merge are already
authorized. Main retains original reviewed/corrected identities and targeted closure.

## Risks / Trade-offs

- Arbitrary content cannot be guaranteed to fit → explicit supported patterns,
  negative fixtures, real browser geometry and composition changes before completion.
- Browser frame failures are not uniformly observable → explicit verification
  limits plus an always-usable static fallback and tested same-origin recovery.
- Engine parsing and routing can evolve → pinned engine/parser, official guidance
  and maintained Markdown/reveal/subpath fixtures instead of a replacement parser.
- Archive drift could break portability → deterministic packing, current-input
  freshness, actual distribution checks and isolated copied-consumer validation.
- Binary archive inspection is limited → archive originates from canonical kit
  source, content identity is verified and installers only copy the inert asset.

## Migration Plan

Add the new skill without migrating incumbent decks. Kit upgrades are explicit
project dependency/lockfile changes, validated before use and reversible through
the consumer's prior source/archive/lockfile. TH installation never upgrades decks.
