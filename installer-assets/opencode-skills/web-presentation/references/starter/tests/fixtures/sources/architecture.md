# Atlas: telemetry intake proposal

Atlas currently receives a telemetry event and writes the searchable index in one handler. A failed index write fails that request.

The proposed path is telemetry client → intake → broker → indexer → search index. Intake publishes accepted events; the indexer consumes them separately. Independent recovery is the motivation, not an observed performance result.

Acceptance, replay, ordering, retention, delivery semantics and operating ownership remain undecided. No broker product, throughput target, delivery guarantee or migration date is selected. Define the event contract first, exercise recovery with synthetic events, and decide rollback and ownership before switching intake. This is a proposed migration sequence, not a schedule.
