#!/usr/bin/env python3
"""
Migrates knowledge.json (Memory MCP JSONL format) to ChromaDB.

Usage:
    python migrate_knowledge.py [--source PATH] [--db-path PATH]

Defaults:
    --source   ~/.claude/knowledge.json
    --db-path  ~/.claude/chromadb
"""
import argparse
import json
import os
import sys
from pathlib import Path


def load_jsonl(path: str) -> list[dict]:
    """Load JSONL file, return list of records."""
    records = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records


def migrate(source: str, db_path: str):
    import chromadb

    if not os.path.exists(source):
        print(f"Source file not found: {source}")
        sys.exit(1)

    records = load_jsonl(source)
    entities = [r for r in records if r.get("type") == "entity"]
    relations = [r for r in records if r.get("type") == "relation"]

    print(f"Found {len(entities)} entities, {len(relations)} relations")

    if not entities:
        print("Nothing to migrate.")
        return

    client = chromadb.PersistentClient(path=db_path)

    # Entities collection
    entities_col = client.get_or_create_collection(
        name="entities",
        metadata={"hnsw:space": "cosine"},
    )

    # Relations collection
    relations_col = client.get_or_create_collection(
        name="relations",
        metadata={"hnsw:space": "cosine"},
    )

    # Migrate entities
    for entity in entities:
        name = entity["name"]
        entity_type = entity.get("entityType", "unknown")
        observations = entity.get("observations", [])

        # Each entity becomes a document with all observations joined
        doc_text = "\n".join(observations)

        entities_col.upsert(
            ids=[name],
            documents=[doc_text],
            metadatas=[{
                "entity_type": entity_type,
                "observation_count": len(observations),
                "observations_json": json.dumps(observations),
            }],
        )

    print(f"Migrated {len(entities)} entities to ChromaDB")

    # Migrate relations
    for i, rel in enumerate(relations):
        rel_id = f"{rel['from']}--{rel['relationType']}--{rel['to']}"
        doc_text = f"{rel['from']} {rel['relationType']} {rel['to']}"

        relations_col.upsert(
            ids=[rel_id],
            documents=[doc_text],
            metadatas={
                "from_entity": rel["from"],
                "to_entity": rel["to"],
                "relation_type": rel["relationType"],
            },
        )

    print(f"Migrated {len(relations)} relations to ChromaDB")

    # Backup original file
    backup = source + ".bak"
    os.rename(source, backup)
    print(f"Original backed up to: {backup}")
    print(f"ChromaDB data at: {db_path}")
    print("Migration complete.")


def main():
    default_source = os.path.join(Path.home(), ".claude", "knowledge.json")
    default_db = os.path.join(Path.home(), ".claude", "chromadb")

    parser = argparse.ArgumentParser(description="Migrate knowledge.json to ChromaDB")
    parser.add_argument("--source", default=default_source, help="Path to knowledge.json")
    parser.add_argument("--db-path", default=default_db, help="ChromaDB persistent storage path")
    args = parser.parse_args()

    migrate(args.source, args.db_path)


if __name__ == "__main__":
    main()
