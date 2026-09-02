---
name: recover
description: Resume an interrupted pipeline from its v5 control log or close a workspace without one administratively.
disable-model-invocation: true
---

# Pipeline recovery (v5)

## Recover Safety Rules

Analyze `$ARGUMENTS`, resolve the configured workspace root safely, and select
only an exact validated feature directory. This skill is read-only: it neither
creates authority nor presents or records a Gate.

Read the workspace's `control/control.jsonl` through the packaged control-plane
helper, replay the contiguous hash-linked prefix, and rebuild stale state, Gate,
finding, and acceptance projections. Main remains the only log appender and
projection writer. An incomplete/corrupt suffix blocks later control events but
does not erase the valid prefix.

Resume from the last valid transition only when the log contains the required
live authority. Liveness provides delivery, acknowledgement, terminality,
progress, and interruption facts. Preserve progress and apply causal recovery;
counts, ordinals, elapsed time, tokens, and tool calls never choose a route.

A workspace without `control/control.jsonl` has nothing to replay. Close it
administratively through the packaged helper, which appends one `pipeline.close`
entry to its events file and refuses a symlinked or hard-linked `control/` or
events path, then offer
inline continuation or a fresh run. Missing or conflicting authority requires a
live decision; never infer or repair it. Mixed writable schemas fail closed.

If the feature is absent, say no pipeline state was found. If its terminal
projection is complete or aborted and agrees with the log, report that no
recovery is needed. Otherwise return the exact missing authority, integrity,
ownership, prerequisite, or causal condition.
