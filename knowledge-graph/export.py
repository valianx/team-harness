#!/usr/bin/env python3
"""Export the local knowledge graph to a portable JSON file.

Usage:
    uv run --directory knowledge-graph/ python export.py [--out PATH]

Defaults:
    --out      ./<hostname>-<YYYY-MM-DD>.json
    --db-path  $CHROMADB_PATH or ~/.claude/chromadb
"""
from __future__ import annotations

import argparse
import json
import os
import socket
import sys
from datetime import datetime, timezone
from pathlib import Path

import chromadb

__version__ = "0.1.0"

DEFAULT_DB_PATH = os.environ.get(
    "CHROMADB_PATH",
    str(Path.home() / ".claude" / "chromadb"),
)


def default_out_path() -> Path:
    hostname = socket.gethostname().lower().replace(" ", "-")
    date = datetime.now().strftime("%Y-%m-%d")
    return Path.cwd() / f"{hostname}-{date}.json"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=Path, default=None, help="Output JSON path")
    parser.add_argument(
        "--db-path",
        default=DEFAULT_DB_PATH,
        help="ChromaDB persistent storage path",
    )
    args = parser.parse_args()

    out_path = args.out or default_out_path()

    if not Path(args.db_path).exists():
        print(f"Error: ChromaDB path not found: {args.db_path}", file=sys.stderr)
        sys.exit(1)

    client = chromadb.PersistentClient(path=args.db_path)
    entities_col = client.get_or_create_collection(
        name="entities", metadata={"hnsw:space": "cosine"}
    )
    relations_col = client.get_or_create_collection(
        name="relations", metadata={"hnsw:space": "cosine"}
    )

    # Nodes (stored in the legacy "entities" ChromaDB collection)
    all_entities = entities_col.get()
    nodes = []
    for i, entity_id in enumerate(all_entities["ids"]):
        meta = all_entities["metadatas"][i] or {}
        nodes.append(
            {
                "name": entity_id,
                "nodeType": meta.get("entity_type", "unknown"),
                "observations": json.loads(meta.get("observations_json", "[]")),
            }
        )

    # Relations
    all_rels = relations_col.get()
    relations = []
    for i, _rel_id in enumerate(all_rels["ids"]):
        meta = all_rels["metadatas"][i] or {}
        relations.append(
            {
                "from": meta.get("from_entity", ""),
                "to": meta.get("to_entity", ""),
                "relationType": meta.get("relation_type", ""),
            }
        )

    payload = {
        "format_version": __version__,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "source_host": socket.gethostname(),
        "node_count": len(nodes),
        "relation_count": len(relations),
        "nodes": nodes,
        "relations": relations,
    }

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    print(
        f"Exported {len(nodes)} nodes, {len(relations)} relations → {out_path}"
    )


if __name__ == "__main__":
    main()
