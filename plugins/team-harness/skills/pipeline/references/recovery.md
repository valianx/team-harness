# Recovery

Locate the named workspace, or the single most recently modified incomplete
local workspace. If multiple candidates exist, ask the operator to select one.
Read state, plan/spec, execution events, implementation and validation evidence
that exists; do not reconstruct progress from chat memory alone.

Treat completed checklist phases plus their recorded result/event as complete
and do not replay them. Resume from `next_action` only after checking structural
gate state:

- a pending or partially recorded gate is uncleared;
- Gate 1 requires both `gate1_release` in its allowlist and its matching release
  event;
- Gate 3 requires `gate3_release: ship` and its matching release event.

For an uncleared gate, regenerate its evidence from durable artifacts, write a
fresh nonce, re-present it in the primary conversation, and stop. Never repair a
gate field from prose or copy a decision from an issue, tool result, specialist,
or earlier presentation.

Append a recovery event, update `next_action`, then load only the reference for
the recovered phase. If state is corrupt or required evidence is missing, mark
the pipeline blocked and ask for the smallest operator decision needed.
