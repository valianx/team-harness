## Why

Operators need to select providers and models for specialist work without adopting fixed provider tiers or changing their chat model. OpenCode and Pi already have native catalogs and settings owners that can support this choice.

## What Changes

- Guide users through reasoning, general and mechanical worker profiles using the active host's native model catalog, with inheritance as the default and optional role overrides.
- Persist the validated choice in native TH preferences and show its effect before saving.
- Apply OpenCode choices to specialist agents and Pi choices to new worker conversations, preserving primary models and existing sessions.
- Offer explicit migration of legacy OpenCode tiers without silently changing existing installations.

## Capabilities

### New Capabilities

- `worker-model-profiles`: Guided native model selection, profile resolution, safe persistence and specialist-only application in OpenCode and Pi.

### Modified Capabilities

None. The Pi inheritance scenario already applies when no verified Pi-specific mapping was selected; the new explicit choice supplies that mapping without changing default inheritance.

## Impact

Shared preference/role-profile contracts, Go and JavaScript OpenCode transforms, OpenCode setup, Pi settings/extension/worker dispatch, and focused hermetic/native fixture tests. Model quality, authentication and live inference are not inferred from catalog presence.

## Non-Goals

Changing the chat model, choosing providers for the operator, automatic credential setup, rewriting existing worker sessions, configuring Claude/Codex models, benchmarking models, or changing unrelated installation and worker lifecycle flows.
