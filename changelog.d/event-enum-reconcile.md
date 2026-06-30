### Fixed
- `agents/orchestrator.md`: expanded the `00-execution-events.jsonl` event enum from 17 to 27 types; added `gate` (human-checkpoint, e.g. DOC-GATE), `research.lane.skipped`, `fanout.start`, `fanout.lane.start`, `fanout.lane.end`, `fanout.converge`, `artifact.missing`, `operation.started`, `operation.success`, `operation.failed`.
- `docs/observability.md`: added "## Additional pipeline event types" section documenting the new `gate`, `research.lane.skipped`, and `artifact.missing` event types with field tables.
- `tests/test_agent_structure.py`: added Suite 129 structural guard (12 checks) asserting that all 9 new event types are present in the orchestrator enum.
- `docs/testing.md`: registered Suite 129 (`event-enum-reconcile`).
