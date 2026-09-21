## Why

Execution of the quality workflows exposed an advisory helper that still appears to veto publication, valid finding locations that are lost during normalization, and a Windows packaging check that mistakes missing POSIX mode bits for stale content. These frictions should be corrected in the same PR as the quality integrations.

## What Changes

- Replace the review helper's publication readiness decision with a factual summary; retain `gate` as a compatibility alias and preserve original returns.
- Accept supported location shapes without inferring written-intent coverage from a path alone.
- Check shared setup asset content on every platform and executable modes only where the native filesystem exposes them.
- Correct Windows review snapshot materialization for long nested paths using snapshot-local settings.
- Exercise the external integrations on real project/PR inputs and record native runtime evidence and any unavailable execution honestly in the configured workspace.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `guided-lane-verification`: factual review summaries, compatible locations and coordinator-owned disposition.
- `codex-runtime-parity`: portable validation of shared setup asset projections.

## Impact

The inline review helper and its consumers, skill projection checks, executable regression tests and generated distributions. No external provider implementation is copied or modified.

## Non-Goals

No new closure state machine, publication gate, mandatory second full review, provider score threshold, native permission replacement or global runtime reconfiguration. An unavailable credential or an advisory disagreement is recorded accurately, not converted into a passing execution.
