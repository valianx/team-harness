## Context

See proposal.md. The inline helper already packages a clean committed target and
summarizes returns. Its surrounding instructions repeat Git mechanics, profile
attestation, context discovery and fallback dispatch. Spec lists provider stages
without making reuse of existing test assessments prominent enough.

## Goals / Non-Goals

Reduce duplicated preparation and test analysis across the shared flows while
preserving factual coverage. No helper format, model-default or PR-review changes.

## Decisions

- Main supplies a short brief: review question, canonical changed paths, intent,
  candidate-bound checks and named relevant skips. Reviewers inspect the diff and
  follow dependencies only to resolve concrete in-scope questions. The role stays
  brief; Main supplies the task-specific directions. Material concerns outside the
  assigned scope return to Main without autonomous expansion. Generated copies use
  existing parity checks. Avoid a new envelope or evidence ledger.
- Native roles enforce read-only execution. Keep immutable revisions and safe
  read-only inspection, but remove manual byte attestation and repeated object
  preflight choreography from prompts. Helper errors remain explicit.
- Main invokes provider methods sequentially by default in spec. Test-design
  selects checks, test-review assesses their quality, trace maps requirement
  coverage; these consume the same evidence instead of restarting test analysis.
- Recovery is chosen for a diagnosed, readily repairable cause. A separate CLI
  run is optional, not a mandatory second review. Preserve partial findings and
  coverage when recovery would repeat the same failure.

## Risks / Trade-offs

- Reduced context can miss a dependency: start from the complete changed surface,
  follow relevant callers/requirements, and state unresolved coverage.
- Reuse can hide stale tests: record candidate/environment and rerun when code,
  configuration, dependencies or observed failures invalidate the result.
- Prompt simplification does not guarantee a time saving on every model/run:
  compare bounded actual observations, not a promised duration or model benchmark.

## Migration Plan

Regenerate skill and role distributions and ship 3.42.3 through the normal PR.
Native profile defaults and existing package/return formats remain compatible.
