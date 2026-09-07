## Why

The spec lane forces a pipeline when a bounded objective needs a second repository, even when
the coordinator can finish the prerequisite and then its consumer. Authors also lack a routine
opportunity to request reviewer agents before publishing their candidate and keep the results
alongside the operator plan.

## What Changes

- Permit sequential repository work for one objective, ordered by dependency, with existing
  repository-local specs and one dated workspace plan honoring Obsidian preferences.
- Offer optional local reviewer agents before PR publication; keep findings and repair evidence
  in chat and the same workspace without posting GitHub reviews or comments.
- Fix confirmed in-scope defects and explicitly tell the operator before amending or reopening
  a spec, seeking only missing scope approval when intent or acceptance changes.
- Reconcile routing and generated runtime resources; retain per-repository validation and
  applicable security requirements.

## Capabilities

### Modified Capabilities

- `spec-direct-lane`: sequential repository execution and optional author review.

## Non-Goals

- Activating a pipeline, parallel writing agents, or changing native permissions.
- Modifying the separate review-pr workflow or posting reviewer messages to GitHub.
- Merging, deploying, automatically repeating full reviews, or silently expanding approved scope.
