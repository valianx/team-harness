# Explicit knowledge writes

This guidance applies only when the user requests a write through the KG skill.
Normal TH workflows retain context in the shared workspace and never create
Memory sessions, automatically enrich a graph or emit remote flow telemetry.

Use the active native connector and its documented capabilities. Save durable,
relevant knowledge within the requested scope, check for useful existing entries,
and preserve unrelated data. Keep secrets, raw logs and temporary task narration
out of shared knowledge. Report actual write results and limits honestly.

The connector owns its schema and authentication; TH does not require a particular
Context Harness backend or a parallel content-enforcement service.
