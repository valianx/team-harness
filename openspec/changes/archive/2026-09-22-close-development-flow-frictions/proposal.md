## Why

Preparing PR679 exposed late release and test prerequisites, a wrong-account push,
nonportable test fixtures and an upstream report that overstated coverage before
its required outputs existed. The operator requested resolving these workflow
frictions in the same PR.

## What Changes

- Discover repository delivery conventions and supported test environments before
  declaring validation complete; distinguish local completion from PR readiness.
- Resolve existing Git authorship and GitHub publication identity before writes,
  preserving native credentials and user configuration.
- Complete provider outputs using the installed method and distinguish inspection,
  executed tests and missing host evidence without manufacturing scores or dates.
- Repair demonstrated portable-test defects, equivalent Windows repository-path
  handling and document platform prerequisites.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `four-phase-development`: earlier candidate preparation and evidence completion.

## Impact

Shared phase, create-pr and provider guidance; generated runtime copies; affected
repository test fixtures, existing control-plane path comparison and native
identity-configuration writes. Preserve the
existing sketch change and release 3.40.0.

## Non-Goals

No replacement of upstream methods, new permission gate, universal test quota,
global account switch, live-model compliance guarantee, merge or plugin update.
