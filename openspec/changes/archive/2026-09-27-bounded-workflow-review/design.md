## Context

See proposal.md. Inline review is already bounded, but pipeline QA/security/tester still carry broad checklists. Spec's stage sequence is repeated across its entry, shared phases, validation and provider documentation.

## Goals / Non-Goals

Reduce orchestration and instruction duplication. Preserve tool selection, native permissions, model settings, tester authorship, mandatory verification and independent advice. Historical helper protocols are outside this change.

## Decisions

- Keep short role-specific instructions in canonical roles and Codex adapters. Main supplies the question, target, included/excluded scope and current evidence. Additional context answers an in-scope uncertainty; it is not a preliminary documentation tour.
- Let shared development phases own the sequence; entry skills route to it, provider documentation owns invocation and lifecycle owns archive readiness. Reuse resolved provider entries within the effort and load each distinct method when needed.
- Plan independent coverage at candidate preparation. A useful earlier review contributes its actual coverage; only uncovered questions or changed relevant inputs justify additional work. Do not manufacture a new verdict or rerun a review to change its format.
- Keep original provider artifacts, but link their results from one workspace plan instead of requiring a duplicate table/report per handoff.
- Main assesses PR risk from actual impact and evidence. Append one localized descriptive true/false flag after the repository template; no classifier, score, explanation or new human-approval gate in the footer.

## Risks / Trade-offs

- Shorter roles could lose relevant expertise → retain purpose, write scope, evidence standards and explicit full-audit assignments; independently review scenarios and generated adapters.
- Reuse could hide changed inputs → preserve original target and outcome and inspect affected changes before reuse.
- Prompt reduction does not prove runtime savings → report instruction-size measurements separately from unmeasured time/cost. No redundant live benchmark pipeline.

## Migration Plan

Regenerate distributed roles and skills, bump the plugin version, run required checks and archive this change with the implementation. No provider reinstall or runtime schema migration.
