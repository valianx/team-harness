# Workflow visibility

A concise task plan and progress note provide continuity: objective, repositories,
source links, completed work, checks, findings, active owners and next action.
Use native agent status and results for live progress.

Claude hooks provide discovery and language context. Detailed subagent traces,
notifications and precompact snapshots are optional through `TH_HOOK_PROFILE`.
They are not required to implement, review, recover or deliver work.

`pipelines` and `trace` read available progress and optional telemetry. Missing
data is reported as unavailable, not as zero usage or a failed workflow. Old
control logs are historical evidence and do not authorize new actions.

Keep execution records outside tracked product files. Opt-in external flow
telemetry remains separate from local progress and does not decide task outcomes.
