### Fixed
- `hooks/subagent-trace.sh`: the existence breadcrumb (`subagent.stop` write to `00-subagent-trace.jsonl`) is now non-suppressible — the `TH_HOOK_PROFILE` gate was removed from the top of the hook so the breadcrumb runs unconditionally. `TH_HOOK_PROFILE=minimal` previously suppressed the only deterministic proof that a `th:*` subagent boundary occurred; that gap is now closed. Any future richer/optional behavior must be placed after a profile gate sourced after the breadcrumb write.
- `hooks/README.md`: updated `subagent-trace.sh` description and `TH_HOOK_PROFILE` table to document the non-suppressible breadcrumb.
- `docs/observability.md`: replaced the "Gated by `TH_HOOK_PROFILE`" note with an accurate "Non-suppressible breadcrumb" description of the new behavior.
