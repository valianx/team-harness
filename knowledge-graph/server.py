#!/usr/bin/env python3
"""
ChromaDB Knowledge Graph MCP Server.

Drop-in replacement for @modelcontextprotocol/server-memory that uses ChromaDB
for persistent storage with semantic search capabilities.

Environment variables:
    CHROMADB_PATH  — path to ChromaDB persistent storage (default: ~/.claude/chromadb)
"""
import functools
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import chromadb
from mcp.server.fastmcp import FastMCP

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
DB_PATH = os.environ.get(
    "CHROMADB_PATH",
    os.path.join(Path.home(), ".claude", "chromadb"),
)

# ---------------------------------------------------------------------------
# ChromaDB client (persistent, embedded — no server needed)
# ---------------------------------------------------------------------------
os.makedirs(DB_PATH, exist_ok=True)
client = chromadb.PersistentClient(path=DB_PATH)

entities_col = client.get_or_create_collection(
    # Collection name is legacy ("entities"); the public API uses "node" terminology.
    # Do NOT rename — existing local KG data uses this name and no migration is needed.
    name="entities",
    metadata={"hnsw:space": "cosine"},
)
relations_col = client.get_or_create_collection(
    name="relations",
    metadata={"hnsw:space": "cosine"},
)

# ---------------------------------------------------------------------------
# MCP Server
# ---------------------------------------------------------------------------
mcp = FastMCP("chromadb-knowledge")


# ---------------------------------------------------------------------------
# Retry decorator for SQLite lock handling (shared DB between Windows/WSL)
# ---------------------------------------------------------------------------
def retry_on_lock(max_retries: int = 3, delay_ms: int = 200):
    """Retry a function on SQLite database lock errors."""
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            for attempt in range(max_retries + 1):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    if "database is locked" in str(e) and attempt < max_retries:
                        time.sleep(delay_ms / 1000)
                        continue
                    raise
        return wrapper
    return decorator


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------
def _get_node(name: str) -> dict | None:
    """Fetch a single node by ID, return dict or None."""
    result = entities_col.get(ids=[name])
    if not result["ids"]:
        return None
    meta = result["metadatas"][0]
    return {
        "name": name,
        "nodeType": meta.get("entity_type", "unknown"),
        "observations": json.loads(meta.get("observations_json", "[]")),
        "created_at": meta.get("created_at"),
        "updated_at": meta.get("updated_at"),
    }


@retry_on_lock()
def _upsert_node(name: str, node_type: str, observations: list[str], preserve_created_at: str | None = None):
    """Insert or update a node."""
    now = datetime.now(timezone.utc).isoformat()
    doc_text = "\n".join(observations)
    entities_col.upsert(
        ids=[name],
        documents=[doc_text],
        metadatas=[{
            "entity_type": node_type,
            "observation_count": len(observations),
            "observations_json": json.dumps(observations),
            "created_at": preserve_created_at or now,
            "updated_at": now,
        }],
    )


# ---------------------------------------------------------------------------
# Tools — matching the Memory MCP API surface
# ---------------------------------------------------------------------------

@mcp.tool()
@retry_on_lock()
def create_nodes(nodes: list[dict]) -> str:
    """Create new nodes in the knowledge graph.

    Each node should have: name (str), nodeType (str), observations (list[str]).
    If a node with the same name exists, its observations are merged.

    Args:
        nodes: List of node dicts with name, nodeType, observations.
    """
    created = 0
    for node in nodes:
        name = node["name"]
        node_type = node.get("nodeType", "unknown")
        new_obs = node.get("observations", [])

        existing = _get_node(name)
        if existing:
            # Merge observations (dedup)
            merged = list(dict.fromkeys(existing["observations"] + new_obs))
            _upsert_node(name, node_type, merged, preserve_created_at=existing["created_at"])
        else:
            _upsert_node(name, node_type, new_obs)
            created += 1

    return json.dumps({"created_nodes": created, "total_processed": len(nodes)})


@mcp.tool()
@retry_on_lock()
def add_observations(observations: list[dict]) -> str:
    """Add observations to existing nodes.

    Each item should have: nodeName (str), contents (list[str]).

    Args:
        observations: List of dicts with nodeName and contents.
    """
    updated = 0
    for obs in observations:
        name = obs["nodeName"]
        new_contents = obs.get("contents", [])

        existing = _get_node(name)
        if existing:
            merged = list(dict.fromkeys(existing["observations"] + new_contents))
            _upsert_node(name, existing["nodeType"], merged, preserve_created_at=existing["created_at"])
            updated += 1
        else:
            # Create node if it doesn't exist
            _upsert_node(name, "unknown", new_contents)
            updated += 1

    return json.dumps({"updated": updated})


@mcp.tool()
@retry_on_lock()
def create_relations(relations: list[dict]) -> str:
    """Create relations between entities.

    Each relation should have: from (str), to (str), relationType (str).

    Args:
        relations: List of relation dicts with from, to, relationType.
    """
    created = 0
    for rel in relations:
        from_entity = rel["from"]
        to_entity = rel["to"]
        rel_type = rel.get("relationType", "relates_to")

        rel_id = f"{from_entity}--{rel_type}--{to_entity}"
        doc_text = f"{from_entity} {rel_type} {to_entity}"

        relations_col.upsert(
            ids=[rel_id],
            documents=[doc_text],
            metadatas=[{
                "from_entity": from_entity,
                "to_entity": to_entity,
                "relation_type": rel_type,
            }],
        )
        created += 1

    return json.dumps({"created": created})


@mcp.tool()
def search_nodes(query: str, limit: int = 10) -> str:
    """Semantic search across entities using natural language.

    Unlike the original Memory MCP substring search, this uses ChromaDB's
    vector embeddings for semantic similarity matching.

    Args:
        query: Natural language search query.
        limit: Maximum number of results (default 10).
    """
    results = entities_col.query(
        query_texts=[query],
        n_results=min(limit, entities_col.count() or 1),
    )

    entities = []
    if results["ids"] and results["ids"][0]:
        for i, entity_id in enumerate(results["ids"][0]):
            meta = results["metadatas"][0][i]
            distance = results["distances"][0][i] if results.get("distances") else None
            entities.append({
                "name": entity_id,
                "nodeType": meta.get("entity_type", "unknown"),
                "observations": json.loads(meta.get("observations_json", "[]")),
                "similarity": round(1 - distance, 4) if distance is not None else None,
            })

    # Also search relations
    relation_results = []
    if relations_col.count() > 0:
        rel_search = relations_col.query(
            query_texts=[query],
            n_results=min(5, relations_col.count()),
        )
        if rel_search["ids"] and rel_search["ids"][0]:
            for i, rel_id in enumerate(rel_search["ids"][0]):
                meta = rel_search["metadatas"][0][i]
                relation_results.append({
                    "from": meta.get("from_entity", ""),
                    "to": meta.get("to_entity", ""),
                    "relationType": meta.get("relation_type", ""),
                })

    return json.dumps({
        "nodes": entities,
        "relations": relation_results,
    }, indent=2)


@mcp.tool()
def open_nodes(names: list[str]) -> str:
    """Retrieve specific nodes by name.

    Args:
        names: List of node names to retrieve.
    """
    entities = []
    for name in names:
        entity = _get_node(name)
        if entity:
            entities.append(entity)

    # Find relations involving these entities
    relations = []
    name_set = set(names)
    if relations_col.count() > 0:
        all_rels = relations_col.get()
        for i, rel_id in enumerate(all_rels["ids"]):
            meta = all_rels["metadatas"][i]
            if meta.get("from_entity") in name_set or meta.get("to_entity") in name_set:
                relations.append({
                    "from": meta["from_entity"],
                    "to": meta["to_entity"],
                    "relationType": meta["relation_type"],
                })

    return json.dumps({"nodes": entities, "relations": relations}, indent=2)


@mcp.tool()
def read_graph() -> str:
    """Read the entire knowledge graph. Returns all nodes and relations.

    Use sparingly — prefer search_nodes for targeted queries.
    """
    # Get all nodes (stored in the legacy "entities" collection)
    all_entities = entities_col.get()
    nodes = []
    for i, entity_id in enumerate(all_entities["ids"]):
        meta = all_entities["metadatas"][i]
        nodes.append({
            "name": entity_id,
            "nodeType": meta.get("entity_type", "unknown"),
            "observations": json.loads(meta.get("observations_json", "[]")),
        })

    # Get all relations
    all_rels = relations_col.get()
    relations = []
    for i, rel_id in enumerate(all_rels["ids"]):
        meta = all_rels["metadatas"][i]
        relations.append({
            "from": meta["from_entity"],
            "to": meta["to_entity"],
            "relationType": meta["relation_type"],
        })

    return json.dumps({
        "nodes": nodes,
        "relations": relations,
        "node_count": len(nodes),
        "relation_count": len(relations),
    }, indent=2)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
def main():
    import argparse

    parser = argparse.ArgumentParser(description="ChromaDB Knowledge Graph MCP Server")
    parser.add_argument(
        "--transport",
        choices=["stdio", "sse"],
        default="stdio",
        help="Transport protocol (default: stdio)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8421,
        help="Port for SSE transport (default: 8421)",
    )
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="Host for SSE transport (default: 127.0.0.1)",
    )
    args = parser.parse_args()

    if args.transport == "sse":
        mcp.settings.host = args.host
        mcp.settings.port = args.port
        # Allow connections from WSL2 virtual network (not just localhost)
        mcp.settings.transport_security = None
        mcp.run(transport="sse")
    else:
        mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
