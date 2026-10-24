## Context

See proposal.md for motivation. The current starter reserves header/footer rows, clamps automatic fit to a minimum zoom of 0.8 and shares diagram typography with controls. The operator has already reviewed and refined the working compact prototype; its full-canvas floating-control composition is the approved frontend sketch.

## Goals / Non-Goals

Preserve the proven control composition while allowing graph appearance to follow context. Keep schema version 1, existing semantic variants, measured geometry and pinned dependencies. Do not promote the prototype's compact node dimensions or synthetic architecture into the product.

## Decisions

- Separate control styling from contextual graph styling in the copied starter. Stable control typography, colors, dimensions and interaction rules belong in a dedicated stylesheet; graph colors, component appearance and measured shared tokens remain adaptable. No new theme API is needed for an editable source kit.
- Place top and bottom control stacks inside the canvas column as absolute overlays. Selected details retain their adjacent region. Diagnostic and source-warning regions remain visible independently. Unlike reserved bands, overlay visibility cannot resize the canvas.
- On initial complete-view framing, Fit view and focus framing, preserve aspect ratio and fit measured nodes plus relevant route sections and labels into a centered 90% canvas rectangle, subject to supported zoom limits. Manual navigation remains possible. Complete architecture is the initial perspective.
- On fine-hover devices hide temporary controls outside the viewer; reveal for hover, visible keyboard focus, open selects or validation details. Keep controls visible on coarse pointers. Preserve reduced-motion behavior. Mouse focus alone must not pin controls open.
- Reuse existing geometry/viewer/static suites and add acceptance tests that compare graph and camera geometry before/after hover, keyboard/touch interaction and two different graph styles. Contextual geometry changes must use shared measurement/layout tokens and rerun checks; appearance changes cannot conceal relationships or diagnostics.

## Risks / Trade-offs

- Visible controls overlap diagram content by design; they must not overlap one another or the details panel. Wrapping control stacks and narrow hosts need rendered checks.
- Extreme aspect ratios or zoom limits may prevent exactly 90% occupancy; retain aspect ratio and report overflow rather than clipping architecture silently.
- Consumer CSS could override any editable source. Document the stable control boundary and test supported graph-only customization rather than promise isolation against arbitrary global selectors.

## Migration Plan

Update the canonical starter and reference, synchronize runtime copies and bump the distributed release once. Existing generated projects keep their local files until explicitly updated. Preserve the prior release in Git for rollback.

Documentation budget: extended — document the new contextual visual boundary and the complete standard control contract in their existing reference; max 40 added nonblank lines across skill guidance and the durable decision.
