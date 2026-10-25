## Context

See proposal.md for the observed first-delivery failure. Current measured ELK layering can create a 7,000px ribbon and violates sibling spacing on a real compound graph. Merely changing ELK placement options did not reliably resolve it. Existing controls and source modeling remain valid.

## Goals / Non-Goals

**Goals:** improve the composition the operator receives, make comparison and visual repair executable for the authoring agent, and preserve the model and standard viewer interactions.

**Non-Goals:** presentation work, a new renderer, dependency upgrades, global preference memory, arbitrary per-diagram coordinates, or universal readability guarantees for arbitrary graphs.

## Decisions

1. Keep the semantic model independent of composition. Derive compact measured group/tile packing and orthogonal routes, retaining source groups, identities, shared endpoint ports and every relationship. Compare it with layered ELK using hard geometry validity before fitted readability, balanced footprint and crossing/route-label readability. Bound candidates and use stable order/ties; do not ship case-specific coordinates or select the smallest area alone.
2. Keep `layout(model, measurements)` compatible; an optional composition option selects auto/layered/compact. Derived candidate information belongs to geometry/evidence, never source JSON. Compact component presentation may reduce repeated metadata and use shared typography; measurement and visible components remain identical. Standard controls keep their CSS.
3. Start on the complete overview; steps frame their focus only after explicit navigation. Fit and extension notices use actual rendered content bounds, not unused engine padding. Preserve stable 90% framing and source warnings independently of control visibility.
4. Provide a copied-project inspection command using its own pinned browser tooling. It opens the editable default model, compares complete candidates, explicitly fits before measuring, inspects every perspective at both maintained viewports, and retains identity, diagnostics, effective label sizes and screenshots outside product assets. Fixture coverage stays distinct; source and visual judgment remain agent responsibilities.
5. Teach a small decision loop in the canonical skill: extract, compare, inspect, recompose and deliver. Initial plus two agent corrections are separate from three measurement-convergence passes. Reuse only actual accepted preferences and expose unfinished quality honestly.

## Risks / Trade-offs

- Compact packing can introduce crossings or route/label obstruction → reserve routing/label space, score complete paths and reject invalid candidates; keep layered fallback and explicit limits.
- More typography or routing space can negate compaction → compare actual measured, fitted results and inspect pixels on the nontrivial source case.
- Candidate inspection takes additional local work → bound alternatives/corrective cycles; do not invoke models from maintained checks.
- Passing diagnostics cannot establish good explanatory composition → preserve actual screenshots and separate visual/source assessment.

## Migration Plan

Ship canonical skill/starter updates through generated runtime copies with a new TH version. Existing consumer projects remain unchanged. Validate and merge the PR, update the installed plugin through th:update, then run one fresh-context diagram trial from unchanged sources with a minimal prompt and no coaching. Preserve the trial even if it remains partial.

Documentation budget: extended — composition choices and the copied inspection command need coherent authoring, viewer and delivery guidance; max 150 added nonblank reference lines.
