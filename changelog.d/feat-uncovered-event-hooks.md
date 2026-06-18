### Added

- `hooks/subagent-trace.sh` — fail-open SubagentStop hook (matcher `th:.*`) that appends one JSON `subagent.stop` line to `workspaces/00-subagent-trace.jsonl`, providing a deterministic per-subagent boundary marker to complement the orchestrator's `phase.end` events.
- `hooks/precompact-snapshot.sh` — fail-open PreCompact hook (matcher `manual|auto`) that copies `00-state.md` to a rolling `00-state.precompact-snapshot.md` beside it and appends a breadcrumb to `00-precompact.jsonl`, enabling `/th:recover` to survive a context auto-compact mid-pipeline.
- `hooks/_hook-profile.sh` — shared helper that resolves `TH_HOOK_PROFILE` (`minimal`/`standard`/`strict`; default `standard` when unset). Gates the six observability/notification hooks only; the five enforcement floors and `session-start.sh`/`language-user-prompt.sh` never source it (non-waivable security floor, AC-13).
- `TH_HOOK_PROFILE` environment variable knob: `minimal` suppresses idle toasts and pipeline-observability hooks; `standard` (default, preserves current behavior) and `strict` keep all observability active. Unset or unrecognized values fall back to `standard` automatically.
- Suite 117 (80 structural checks) asserting the hook AC invariants, including the AC-13 floor: zero references to `TH_HOOK_PROFILE`/`_hook-profile.sh` in all seven always-on hooks, and confirmed source+call in all six gated observability/notification hooks.
- `Stop`, `PostToolUse`, and `SessionEnd` events are intentionally not wired; per-event verdicts and rationale documented in `docs/observability.md`.
