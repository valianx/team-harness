# knowledge-graph/

Knowledge-graph MCP server. Gives Claude Code semantic memory across projects.

The current backend is **ChromaDB** (embedded, local, free). The folder name, agent prompts, and external docs are intentionally backend-agnostic so that future implementations (cloud-managed KG, alternative vector DB) can be added without renaming anything user-facing — see `project_pinecone_backend_spike_pending` in memory.

This folder gets installed to `~/.claude/knowledge-graph/`. The data itself (entities, relations, embeddings) lives in `~/.claude/chromadb/` — that path is owned by the ChromaDB backend; if the backend is swapped in the future, the data path may change accordingly. **This repo never touches the data.** Each developer builds their own local KG as they work.

This README is the **canonical reference** for everything you can do with the KG: viewing, editing, sharing, running the server, and migrating.

## Files

| File | Purpose |
|---|---|
| `server.py` | FastMCP server exposing the KG tools (create / search / delete entities, relations, etc.). |
| `pyproject.toml` | Python project metadata. Requires Python 3.10–3.13. Deps: `chromadb`, `mcp`, `uvicorn`. |
| `uv.lock` | Reproducible lock file. |
| `export.py` | Dump the local KG to a portable JSON file. |
| `import.py` | Merge an exported JSON into the local KG (non-destructive). |
| `manage-server.sh` | Optional helper to run the server in **SSE mode** on a fixed port. |
| `migrate_knowledge.py` | One-shot migration from the legacy Memory MCP `knowledge.json`. |
| `viewer/app.py` | Standalone web UI for inspecting the KG. |

## Operations

Quick reference for every KG operation, grouped by intent. All paths are relative to the repo root unless noted.

### View the KG

| What | How |
|---|---|
| Web viewer (recommended) | Inside Claude Code: `/kg-viewer start` — spawns the viewer on `http://localhost:8420`. Also: `stop`, `status`, `restart`. |
| Web viewer (manual) | `uv run --directory knowledge-graph/ python viewer/app.py` — same UI, started manually. |
| From inside Claude | `/memory search <query>` or `/memory show <name>` — semantic search and entity inspection without leaving the conversation. |
| From inside Claude | `/memory list` — paginated listing of entities. |
| From inside Claude | `/memory stats` — totals by entity type. |

### Edit KG content

| What | How |
|---|---|
| Semantic search | `/memory search <query>` |
| Remove one entity | Web viewer (delete button per entity) or `/memory` with delete action |
| Prune stale entities | `/memory prune` — interactive review and removal |
| Merge duplicates | `/memory consolidate` — proposes merges, asks for confirmation |
| Bulk maintenance | Through the `/memory` skill in Claude Code — destructive actions always require user confirmation |

### Share KG content between developers

Dev A exports their KG (or a subset) to a JSON file; Dev B imports it into their local KG. Non-destructive: existing entities get new observations appended (deduped), relations are idempotent, local data is never deleted.

```bash
# Dev A — export
uv run --directory knowledge-graph/ python export.py --out shared-knowledge/<name>-<date>.json

# Open a PR adding the file under shared-knowledge/. Review focuses on content.

# Dev B — after pulling the merged file
uv run --directory knowledge-graph/ python import.py shared-knowledge/<name>-<date>.json
```

Full workflow and conventions: [`shared-knowledge/README.md`](../shared-knowledge/README.md).

### Run the MCP server

| Mode | When to use | Command |
|---|---|---|
| **stdio** (default) | Every developer, every day. | No action needed — Claude Code spawns it on demand using the entry registered by the installer in `~/.claude.json`. |
| **SSE** (optional) | Sharing a single KG across Windows + WSL Claude Code instances. | `./knowledge-graph/manage-server.sh start` — plus `stop`, `status`, `restart`. Listens on `http://localhost:8421/sse`. Requires updating `~/.claude.json` to point `memory` MCP at that URL. |

Most developers never need SSE. Start there only if you have a concrete reason.

### Migrate from legacy Memory MCP

If you previously used the original Memory MCP with a `~/.claude/knowledge.json` file, one-shot migrate it into the knowledge graph:

```bash
uv run --directory knowledge-graph/ python migrate_knowledge.py
# --source <path> to override; default ~/.claude/knowledge.json
# --db-path <path> to override; default ~/.claude/chromadb
# Backs up the original to knowledge.json.bak after import.
```

### Content policy

What may and may not be stored in the KG is defined in [`docs/kg-content-policy.md`](../docs/kg-content-policy.md). **Technical memory only** — no personal data, credentials, client info, or volatile references.

The policy is enforced at **write time** by the orchestrator's Phase 6 (Knowledge Save). Export and import trust the source KG is already compliant.

---

## Runtime contract

The MCP server is registered in `~/.claude.json` by the installer as:

```json
"mcpServers": {
  "memory": {
    "type": "stdio",
    "command": "uv",
    "args": ["run", "--directory", "~/.claude/knowledge-graph", "python", "-m", "server"],
    "env": {}
  }
}
```

Claude Code spawns the server on demand; no long-running process is required.

## Storage (backend-specific)

- **Current backend**: ChromaDB (PersistentClient + HNSW). Database path is `$CHROMADB_PATH` (default `~/.claude/chromadb`). Embedding model: `all-MiniLM-L6-v2` (~80 MB, downloaded on first run).
- The storage location and embedding model are properties of the current backend. They are not part of the user-facing knowledge-graph contract; a future backend swap may change both.

## Notes

- `README.md` in this folder is contributor documentation; the installer does **not** copy it to `~/.claude/knowledge-graph/`.
- Runtime state (`.venv/`, `__pycache__/`, `.server.pid`, `server.log`) is gitignored and skipped by the installer.
- The web viewer and the MCP server both open the same ChromaDB database — changes in one are immediately visible in the other.
