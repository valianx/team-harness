#!/usr/bin/env python3
"""Import a KG JSON export into the local knowledge graph.

Merge is non-destructive:
    - Existing entity (same name): observations appended with dedup.
    - New entity: created.
    - Existing relation: skipped.
    - New relation: created.

Local data is never deleted.

Usage:
    uv run --directory knowledge-graph/ python import.py PATH

Defaults:
    --db-path  $CHROMADB_PATH or ~/.claude/chromadb
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import chromadb

__version__ = "0.1.0"

DEFAULT_DB_PATH = os.environ.get(
    "CHROMADB_PATH",
    str(Path.home() / ".claude" / "chromadb"),
)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("file", type=Path, help="Path to the exported JSON file")
    parser.add_argument(
        "--db-path",
        default=DEFAULT_DB_PATH,
        help="ChromaDB persistent storage path",
    )
    args = parser.parse_args()

    if not args.file.exists():
        print(f"Error: file not found: {args.file}", file=sys.stderr)
        sys.exit(1)

    with args.file.open("r", encoding="utf-8") as f:
        payload = json.load(f)

    incoming_entities = payload.get("entities", [])
    incoming_relations = payload.get("relations", [])

    client = chromadb.PersistentClient(path=args.db_path)
    entities_col = client.get_or_create_collection(
        name="entities", metadata={"hnsw:space": "cosine"}
    )
    relations_col = client.get_or_create_collection(
        name="relations", metadata={"hnsw:space": "cosine"}
    )

    stats = {"added": 0, "merged": 0, "rels_added": 0, "rels_skipped": 0}
    now = datetime.now(timezone.utc).isoformat()

    # --- Entities ---------------------------------------------------------
    for e in incoming_entities:
        name = e["name"]
        entity_type = e.get("entityType", "unknown")
        incoming_obs = e.get("observations", [])

        existing = entities_col.get(ids=[name])
        if existing["ids"]:
            meta = existing["metadatas"][0] or {}
            existing_obs = json.loads(meta.get("observations_json", "[]"))
            merged_obs = list(dict.fromkeys(existing_obs + incoming_obs))

            entities_col.upsert(
                ids=[name],
                documents=["\n".join(merged_obs)],
                metadatas=[{
                    "entity_type": meta.get("entity_type", entity_type),
                    "observation_count": len(merged_obs),
                    "observations_json": json.dumps(merged_obs),
                    "created_at": meta.get("created_at", now),
                    "updated_at": now,
                }],
            )
            stats["merged"] += 1
        else:
            entities_col.upsert(
                ids=[name],
                documents=["\n".join(incoming_obs)],
                metadatas=[{
                    "entity_type": entity_type,
                    "observation_count": len(incoming_obs),
                    "observations_json": json.dumps(incoming_obs),
                    "created_at": now,
                    "updated_at": now,
                }],
            )
            stats["added"] += 1

    # --- Relations --------------------------------------------------------
    for r in incoming_relations:
        from_e = r.get("from", "")
        to_e = r.get("to", "")
        rel_type = r.get("relationType", "relates_to")
        if not from_e or not to_e:
            continue

        rel_id = f"{from_e}--{rel_type}--{to_e}"
        existing = relations_col.get(ids=[rel_id])
        if existing["ids"]:
            stats["rels_skipped"] += 1
            continue

        relations_col.upsert(
            ids=[rel_id],
            documents=[f"{from_e} {rel_type} {to_e}"],
            metadatas=[{
                "from_entity": from_e,
                "to_entity": to_e,
                "relation_type": rel_type,
            }],
        )
        stats["rels_added"] += 1

    # --- Report -----------------------------------------------------------
    print("Import complete:")
    print(f"  entities:  {stats['added']} added, {stats['merged']} merged")
    print(
        f"  relations: {stats['rels_added']} added, "
        f"{stats['rels_skipped']} skipped (already present)"
    )


if __name__ == "__main__":
    main()
