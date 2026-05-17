# shared-knowledge/

Drop-off location for knowledge-graph (KG) exports that developers want to share with the team.

## What goes here

JSON files exported from a local knowledge graph using `knowledge-graph/export.py`. Each file is a snapshot of technical knowledge a developer wants to contribute: patterns, gotchas, architectural decisions, library quirks, service inventories.

## What does NOT go here

- Personal data (names, preferences, user profiles).
- Tokens, API keys, URLs of private services.
- Client- or stakeholder-specific content.
- Ticket numbers, PR references, or anything tied to a specific time window.

The assumption is that the source KG already follows the **technical-only** content policy, so exports are clean by construction. If you're unsure, review the file before committing.

## Workflow

```bash
# On the origin machine — export your local KG
uv run --directory knowledge-graph/ python export.py --out shared-knowledge/<name>-<date>.json

# Open a PR adding the file. Review focuses on content, not format.

# On the destination machine — after pulling the merged file
uv run --directory knowledge-graph/ python import.py shared-knowledge/<name>-<date>.json
```

The import is **non-destructive**: existing entities get new observations appended (deduped), new entities are created, local data is never deleted.

## File naming

`<origin>-<YYYY-MM-DD>.json` — e.g. `mario-2026-04-22.json`. Keeps history readable and makes it obvious whose snapshot is which.

## Status

`export.py` and `import.py` live under `knowledge-graph/`. The import is **non-destructive**: it merges observations with dedup and never deletes local data. The folder stays empty (except this README) until a dev drops a shared export here.
