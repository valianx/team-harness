# Slidev Harness addon

`slidev-addon-harness` 1.0.0 supplies six scoped layouts and one generic frame
adapter over Slidev 53.0.0 and `@slidev/theme-default` 0.25.0. Navigation,
presenter controls, Markdown composition and click reveals remain native Slidev.
Keep the theme's original attribution and the font license described in
`NOTICE.md`.

Use the project-owned archive through the consumer's pinned dependency and
lockfile. A Team Harness update does not upgrade a copied deck. An upgrade is
an explicit archive/dependency change followed by content, browser and static
build verification; retain the prior archive and lockfile to reverse it.

## Configure the deck

```yaml
theme: default
addons:
  - harness
canvasWidth: 1280
aspectRatio: 16/9
fonts:
  provider: none
  sans: Inter
layout: h-cover
title: Parcel Desk integration review
eyebrow: Proposal
footer: Integration proposal · source scope retained
```

The addon loads its local Inter assets. Keep `fonts.provider: none` so the
engine does not add a remote font request. Use a configured production base,
such as `/proposals/parcel-desk/`, when building for a subpath. A production
preview is a local verification step and does not publish the deck.

## Layouts and slots

Every layout accepts the native frontmatter properties `title`, `eyebrow`
and `footer`. Optional named `title` and `footer` slots replace their text.
Use native `routeAlias` for stable slide identity. The remaining Markdown slots are:

| Layout | Default slot | Other slot |
| --- | --- | --- |
| `h-cover` | Purpose, audience or short summary | — |
| `h-section` | Section objective or transition | — |
| `h-content` | Main explanation, flow, phases, risks or decisions | — |
| `h-compare` | Left comparison column | `right` |
| `h-visual` | Explanation | `visual` |
| `h-demo` | Explanation and interaction limits | `visual` |

```md
---
layout: h-compare
routeAlias: retry-policy
title: Keep retries explicit
footer: Proposal · retry conditions need agreement
---

## Current

The caller receives the first result.

::right::

## Proposed

Retry eligible failures under a bounded policy.
```

The example is illustrative, not a commitment about an existing system.
Use source facts to distinguish current behavior, proposals, assumptions and
unresolved decisions. Native `v-click` and `v-clicks` work inside these regions;
hidden reveals reserve space and are checked again when revealed.

## Logical geometry

The stage is 1280×720 with a 64-unit outer inset. Normal prose is 28 units;
standard titles are 40, cover titles 64, section titles 56, and footers 16.
Technical code uses 22 units; frame controls and verification text use 16.
The kit does not shrink dense prose or clip it into a region. Split or recompose
content when actual rendered checks identify overflow.

| Region | x | y | Width | Height |
| --- | --- | --- | --- | --- |
| Standard title | 64 | 64 | 1152 | 88 |
| Standard body | 64 | 176 | 1152 | 424 |
| Cover/section title | 64 | 144 | 1152 | 176 |
| Cover/section body | 64 | 352 | 1152 | 248 |
| Footer | 64 | 624 | 1152 | 32 |
| Comparison left | 64 | 176 | 560 | 424 |
| Comparison right | 656 | 176 | 560 | 424 |
| Visual | 64 | 176 | 720 | 424 |
| Visual explanation | 816 | 176 | 400 | 424 |
| Demo visual | 64 | 176 | 816 | 424 |
| Demo explanation | 912 | 176 | 304 | 424 |

The body intentionally contains its column/visual regions. Images, existing
SVG diagrams and native Mermaid can occupy the visual slot without another
diagram engine. Let their own aspect ratios fit the region.

## Embed a demo

```md
---
layout: h-demo
title: Inspect the retry behavior
---

Use the demo to inspect the proposed failure path.
The static view remains available if the frame cannot be used.

::visual::

<HarnessFrame
  src="/demo/index.html"
  title="Retry behavior demonstration"
  fallback="/assets/retry-flow.svg"
  fallback-alt="Eligible failures return to the bounded retry step."
/>
```

`src` and `fallback` are required project-owned paths or explicit HTTP(S)
URLs. Local paths resolve under the configured build base. Protocol-relative,
script, data and file URLs are rejected. The default loading limit is 8000 ms;
set `:timeout-ms="5000"` when a different bounded limit is justified.

The static image and an **Open static fallback** link remain present in every
state. A loaded local document still says that interaction verification is
pending. An external frame remains unverified because the host cannot prove
its content, framing permissions, authentication or keyboard behavior.
Successful loading alone is not a browser acceptance result.

**Enter demo** moves focus into the frame. In a same-origin document, Escape
returns focus to that button; other keys stay in the demo. **Return to
presentation** provides an explicit exit. If entry is unavailable, that exit
focuses the slide itself. Cross-origin documents cannot provide the same
Escape bridge; retain the visible exit, browser Tab navigation and fallback.
The frame allows scripts, same-origin access and forms inside its sandbox;
it does not grant popup, download or top-level navigation privileges.

Reduced motion disables the kit's optional motion without removing content,
reveals or explicit native navigation.

## Inspection interface

The root is `[data-harness-slide]`, with native slide identity/page, layout,
active state and click count in `data-harness-alias`, `data-harness-page`,
`data-harness-layout`, `data-harness-active`, `data-harness-clicks` and
`data-harness-clicks-total`. Click metadata comes from the native click context.
Regions expose `data-harness-region` with `title`, `body`, `footer`, `left`,
`right`, `visual` or `explanation`. Determine the actual active stage from
Slidev's render context before measuring it; neighboring and presenter
previews are separate render states.

`HarnessFrame` exposes `data-harness-frame-state` as `loading`, `ready`,
`error` or `unverified`; `ready` means only that a local document loaded.
`data-harness-fallback`, `data-harness-frame-enter` and
`data-harness-frame-exit` identify its reusable controls and fallback.

The package exports `./tokens`, `./frame` and the maintained `./geometry`
inspection function. Source/fact assessment, static content checks, actual DOM
geometry, frame interaction, screenshots and production asset checks remain
distinct evidence. A build by itself does not establish visual completion.
