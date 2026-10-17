
# Trace

Resolve the named effort read-only through [workspace](../workspace/SKILL.md).
Use the bound file or Page locator, exact IDs and verified source association.
Ambiguity, incomplete reads or unavailable context stay explicit; never select by
recency, create records or fall back to another home.

## Usage

`trace <feature>` summarizes the current plan, tasks and handoff, or an existing
`00-pipeline-summary.md`. Available historical modes remain:

- `--jsonl`: show the last 30 events from `00-execution-events.jsonl` or the
  JSONL fence in `00-execution-events.md`.
- `--tools`: aggregate recorded per-agent tool counters, or use the summary's
  tool section if no raw events exist.
- `--fails`: show recorded failures, interruptions and correction events.
- `--tokens` (`--cost` legacy alias): summarize observed token usage with its
  source and coverage. Distinguish estimates from measured usage and unknowns.

Use native read tools; Page status needs no local state or telemetry mirror.
Do not infer zero usage, success or failure from missing telemetry.
Historical event formats are described in `docs/observability.md`; they do not
require current flows to produce a journal. Optional subagent traces can explain
observed starts/stops but an unmatched start alone is not proof of liveness.

For initiatives, retain the shared overview and per-service attribution when
present. Apply [the OpenSpec lifecycle](../spec/references/lifecycle.md) to
report pending archive/retirement separately, including direct-mode changes.
Missing pipeline telemetry does not suppress OpenSpec status.

Use the user's language and voice preferences. Report useful progress, evidence
limits and the next unresolved work without changing files or permissions.
