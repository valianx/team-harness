## Why

Team Harness has no native Pi distribution, so Pi cannot reliably discover its workflows, retain native preferences or coordinate its specialist roles. Pi 1.3.0 provides public package, extension, session and RPC interfaces that can supply this fourth runtime without depending on another host.

## What Changes

- Add a Pi-owned package lifecycle, generated workflow projections and an explicit registry of eligible canonical workers; Main remains the coordinator.
- Add bounded workers over public RPC, native session continuity, cancellation and usage receipts returned through native tool results.
- Keep Pi preferences in its selected agent directory and reuse the shared workspace contract, including honest unavailability when Space capability is absent.
- Adapt setup, update, reload and selected provider entrypoints to actual Pi capabilities, with isolated native activation and hermetic regression checks.

## Capabilities

### New Capabilities

- `pi-native-runtime`: Native Pi distribution, settings, workflows, bounded specialist execution and evidence.

### Modified Capabilities

None. Existing runtime contracts remain in force; shared helpers gain only the Pi routes required by this capability.

## Non-Goals

No unrelated workflow repair, new development pipeline, private Space transport, credential migration, invented model aliases, operating-system sandbox, orphan-free process guarantee, personal installation, npm publication or live model benchmark. Existing runtime installation ownership is unchanged.

## Impact

New Pi package/runtime assets and generated distributions, explicit Pi projection support, narrowly scoped shared runtime selectors, maintained tests/CI registration and release metadata. Pi 1.3.0 and Node 22.19 or newer are the compatibility target. Review covers this PR and directly affected contracts; corrections use their delta and preserve earlier evidence.
