## Context

See proposal.md for the reported overbuilding. The shared sketch skill currently
offers optional previews; spec and phase guidance inherit that discretion.
Runtime projections are generated from canonical skills and role inputs.

## Goals / Non-Goals

**Goals:** make the affected design visible before coding in every entry path,
reuse the existing workspace and authority, and compare delivery with the design.
**Non-Goals:** no mandatory preview for unrelated work, no new approval engine,
and no fictional database/UI artifacts for this prose-only TH change.

## Decisions

- Let the sketch skill own the applicability and useful-content guidance. Route
  spec, shared phases, design and implementation to it; validation consumes it.
  A single owner avoids divergent copies of the field/model checklist.
- Database work includes structure, persistence and migrations, even when no
  columns are added. Describe affected current/proposed entities, constraints,
  and operation effects. Justify new persisted fields by concrete requirements
  and actual writers/readers; consider reuse and computation before storage.
- Frontend work includes changes to existing presentation or behavior. Reuse a
  current wireframe and annotate affected states for small changes rather than
  inventing a whole-screen redesign. Other sketch formats remain contextual.
- Present both previews during Spec if both surfaces change. Direct and resumed
  work fill missing design before dependent implementation, within existing
  authorization. Only unresolved material decisions need operator input.
- Keep sketches in the chosen workspace and durable decisions in OpenSpec.
  Compare actual persistence/UI changes against them during Validation, so a
  structurally valid spec or green tests cannot justify unused additions.
- Update generated distributions through repository tools. Verify routing and
  packaging with existing suites and independent scenario review; do not add
  a runtime sketch guard or tests that merely count new prose phrases.

## Risks / Trade-offs

- Small changes incur design work → use the smallest affected model/wireframe,
  reusing existing artifacts without waiving applicability.
- Older optional wording can override the flow → inspect active callers and
  generated adapters; retain optionality only for other sketch types.
- Presentation may be mistaken for approval → explicitly retain scope and
  authority; a sketch-only request does not authorize implementation.

## Migration Plan

Distribute updated skills and role guidance through normal generation. Existing
tasks reuse valid previews and fill gaps before further affected implementation.
