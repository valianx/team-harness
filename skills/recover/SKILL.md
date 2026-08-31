---
name: recover
description: Resume an interrupted pipeline from its v5 control log or convert one supported legacy workspace once.
disable-model-invocation: true
---

# Pipeline recovery (v5)

## Recover Safety Rules

Analyze `$ARGUMENTS`, resolve the configured workspace root safely, and select
only an exact validated feature directory. This skill is read-only: it neither
creates authority nor presents or records a Gate.

For v5, read `control/current.json`, validate its contained non-symlink log and
hash, replay the contiguous hash-linked prefix, and rebuild stale state, Gate,
finding, and acceptance projections. Main remains the only log appender and
projection writer. An incomplete/corrupt suffix blocks later control events but
does not erase the valid prefix.

Resume from the last valid transition only when the log contains the required
live authority. Liveness provides delivery, acknowledgement, terminality,
progress, and interruption facts. Preserve progress and apply causal recovery;
counts, ordinals, elapsed time, tokens, and tool calls never choose a route.

For supported v1-v4 state, invoke the packaged one-shot converter. It validates
historical authority, bindings, immutable inputs, dirty progress, original Gate,
continuation identity, repaired aggregate, and repair evidence. Preserve the
exact service/error for a binding failure. Missing or conflicting authority
requires a live decision; never infer or repair it.

Conversion is create-then-switch: create and fully validate the v5 log and
projections beside legacy data, then commit `control/current.json` last. Current
dispatch reads only v5. Mixed writable schemas fail closed, and an existing
valid v5 pointer is reported/read but never overwritten from legacy state.

If the feature is absent, say no pipeline state was found. If its terminal
projection is complete or aborted and agrees with the log, report that no
recovery is needed. Otherwise return the exact missing authority, integrity,
ownership, prerequisite, or causal condition.
