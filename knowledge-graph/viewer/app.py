#!/usr/bin/env python3
"""
ChromaDB Knowledge Graph Viewer — Web UI for browsing and searching entities.

Usage:
    python app.py [--port 8420] [--db-path ~/.claude/chromadb]
"""
import argparse
import json
import os
from pathlib import Path

import chromadb
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs


DB_PATH = os.environ.get(
    "CHROMADB_PATH",
    os.path.join(Path.home(), ".claude", "chromadb"),
)

client = None
entities_col = None
relations_col = None


def init_db(db_path: str):
    global client, entities_col, relations_col
    client = chromadb.PersistentClient(path=db_path)
    entities_col = client.get_or_create_collection(
        name="entities", metadata={"hnsw:space": "cosine"}
    )
    relations_col = client.get_or_create_collection(
        name="relations", metadata={"hnsw:space": "cosine"}
    )


HTML_PAGE = """<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Knowledge Graph Viewer</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0d1117; color: #c9d1d9; padding: 24px; }
  h1 { color: #58a6ff; margin-bottom: 8px; font-size: 1.5rem; }
  .stats { color: #8b949e; margin-bottom: 20px; font-size: 0.9rem; }
  .search-bar { display: flex; gap: 8px; margin-bottom: 20px; }
  .search-bar input { flex: 1; padding: 10px 14px; background: #161b22; border: 1px solid #30363d; border-radius: 6px; color: #c9d1d9; font-size: 0.95rem; }
  .search-bar input:focus { outline: none; border-color: #58a6ff; }
  .search-bar button { padding: 10px 20px; background: #238636; border: none; border-radius: 6px; color: #fff; cursor: pointer; font-size: 0.95rem; }
  .search-bar button:hover { background: #2ea043; }
  .search-bar .btn-clear { background: #30363d; }
  .search-bar .btn-clear:hover { background: #484f58; }
  .filters { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
  .filters button { padding: 6px 12px; background: #161b22; border: 1px solid #30363d; border-radius: 20px; color: #8b949e; cursor: pointer; font-size: 0.8rem; }
  .filters button:hover, .filters button.active { border-color: #58a6ff; color: #58a6ff; }
  .entity { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; margin-bottom: 12px; }
  .entity:hover { border-color: #484f58; }
  .entity-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .entity-name { color: #58a6ff; font-weight: 600; font-size: 1.05rem; }
  .entity-type { padding: 3px 10px; border-radius: 12px; font-size: 0.75rem; font-weight: 500; }
  .type-pattern { background: #1f3a1f; color: #3fb950; }
  .type-error { background: #3d1f1f; color: #f85149; }
  .type-constraint { background: #3d2e1f; color: #d29922; }
  .type-decision { background: #1f2d3d; color: #58a6ff; }
  .type-tool-gotcha { background: #2d1f3d; color: #bc8cff; }
  .type-unknown { background: #21262d; color: #8b949e; }
  .similarity { color: #3fb950; font-size: 0.8rem; margin-left: 8px; }
  .observations { list-style: none; }
  .observations li { padding: 6px 0; border-bottom: 1px solid #21262d; font-size: 0.88rem; line-height: 1.5; color: #b1bac4; }
  .observations li:last-child { border-bottom: none; }
  .relations { margin-top: 10px; padding-top: 10px; border-top: 1px solid #21262d; }
  .relations span { display: inline-block; padding: 3px 8px; background: #21262d; border-radius: 4px; font-size: 0.8rem; margin: 2px; }
  .empty { text-align: center; color: #484f58; padding: 40px; }
  .actions { display: flex; gap: 8px; }
  .btn-delete { padding: 4px 10px; background: transparent; border: 1px solid #f8514930; border-radius: 4px; color: #f85149; cursor: pointer; font-size: 0.75rem; }
  .btn-delete:hover { background: #f8514920; }
  .entity-date { color: #484f58; font-size: 0.75rem; margin-left: 8px; }
</style>
</head>
<body>
<h1>Knowledge Graph</h1>
<div class="stats" id="stats">Loading...</div>
<div class="search-bar">
  <input type="text" id="search" placeholder="Buscar semánticamente... (ej: Next.js authentication)" autofocus>
  <button onclick="doSearch()">Buscar</button>
  <button class="btn-clear" onclick="loadAll()">Ver todo</button>
</div>
<div class="filters" id="filters"></div>
<div id="results"></div>

<script>
let allEntities = [];
let activeFilter = null;

async function loadAll() {
  document.getElementById('search').value = '';
  activeFilter = null;
  const res = await fetch('/api/entities');
  const data = await res.json();
  allEntities = data.entities;
  document.getElementById('stats').textContent =
    `${data.entity_count} entities | ${data.relation_count} relations | Types: ${Object.entries(data.type_counts).map(([k,v])=>k+':'+v).join(', ')}`;
  buildFilters(data.type_counts);
  render(allEntities);
}

function buildFilters(counts) {
  const el = document.getElementById('filters');
  el.innerHTML = Object.entries(counts).map(([type, count]) =>
    `<button onclick="filterType('${type}', this)" data-type="${type}">${type} (${count})</button>`
  ).join('');
}

function filterType(type, btn) {
  if (activeFilter === type) {
    activeFilter = null;
    document.querySelectorAll('.filters button').forEach(b => b.classList.remove('active'));
  } else {
    activeFilter = type;
    document.querySelectorAll('.filters button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
  const filtered = activeFilter ? allEntities.filter(e => e.entityType === activeFilter) : allEntities;
  render(filtered);
}

async function doSearch() {
  const q = document.getElementById('search').value.trim();
  if (!q) return loadAll();
  activeFilter = null;
  document.querySelectorAll('.filters button').forEach(b => b.classList.remove('active'));
  const res = await fetch('/api/search?q=' + encodeURIComponent(q));
  const data = await res.json();
  render(data.entities, true);
}

async function deleteEntity(name) {
  if (!confirm(`Eliminar "${name}"?`)) return;
  await fetch('/api/entities/' + encodeURIComponent(name), { method: 'DELETE' });
  loadAll();
}

function render(entities, showSimilarity = false) {
  const el = document.getElementById('results');
  if (!entities.length) {
    el.innerHTML = '<div class="empty">No entities found</div>';
    return;
  }
  el.innerHTML = entities.map(e => {
    const typeClass = 'type-' + (e.entityType || 'unknown').replace(/[^a-z]/g, '-');
    const simBadge = showSimilarity && e.similarity != null
      ? `<span class="similarity">${(e.similarity * 100).toFixed(1)}% match</span>` : '';
    const dateBadge = e.created_at ? `<span class="entity-date">${formatDate(e.created_at)}</span>` : '';
    const obs = (e.observations || []).map(o => `<li>${escHtml(o)}</li>`).join('');
    const rels = (e.relations || []).map(r =>
      `<span>${escHtml(r.from)} → ${escHtml(r.relationType)} → ${escHtml(r.to)}</span>`
    ).join('');
    return `<div class="entity">
      <div class="entity-header">
        <div><span class="entity-name">${escHtml(e.name)}</span>${simBadge}${dateBadge}</div>
        <div class="actions">
          <span class="entity-type ${typeClass}">${escHtml(e.entityType || 'unknown')}</span>
          <button class="btn-delete" onclick="deleteEntity('${escAttr(e.name)}')">eliminar</button>
        </div>
      </div>
      <ul class="observations">${obs}</ul>
      ${rels ? `<div class="relations">${rels}</div>` : ''}
    </div>`;
  }).join('');
}

function escHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function escAttr(s) { return s.replace(/'/g, "\\'").replace(/"/g, '&quot;'); }
function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const time = d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  const date = d.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${date} ${time}`;
}

document.getElementById('search').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
loadAll();
</script>
</body>
</html>"""


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)

        if parsed.path == "/" or parsed.path == "":
            self._respond(200, "text/html", HTML_PAGE)

        elif parsed.path == "/api/entities":
            all_data = entities_col.get()
            entities = []
            type_counts = {}
            for i, eid in enumerate(all_data["ids"]):
                meta = all_data["metadatas"][i]
                et = meta.get("entity_type", "unknown")
                type_counts[et] = type_counts.get(et, 0) + 1
                entities.append({
                    "name": eid,
                    "entityType": et,
                    "observations": json.loads(meta.get("observations_json", "[]")),
                    "created_at": meta.get("created_at", ""),
                    "updated_at": meta.get("updated_at", ""),
                })

            # Get relations for each entity
            all_rels = relations_col.get() if relations_col.count() > 0 else {"ids": [], "metadatas": []}
            rel_map = {}
            for i, rid in enumerate(all_rels["ids"]):
                rm = all_rels["metadatas"][i]
                for key in [rm.get("from_entity"), rm.get("to_entity")]:
                    if key:
                        rel_map.setdefault(key, []).append({
                            "from": rm["from_entity"],
                            "to": rm["to_entity"],
                            "relationType": rm["relation_type"],
                        })

            for e in entities:
                e["relations"] = rel_map.get(e["name"], [])

            entities.sort(key=lambda x: x.get("updated_at") or x.get("created_at") or "", reverse=True)
            self._respond_json({
                "entities": entities,
                "entity_count": len(entities),
                "relation_count": len(all_rels["ids"]),
                "type_counts": type_counts,
            })

        elif parsed.path == "/api/search":
            params = parse_qs(parsed.query)
            query = params.get("q", [""])[0]
            if not query or entities_col.count() == 0:
                self._respond_json({"entities": []})
                return

            results = entities_col.query(
                query_texts=[query],
                n_results=min(20, entities_col.count()),
            )
            entities = []
            if results["ids"] and results["ids"][0]:
                for i, eid in enumerate(results["ids"][0]):
                    meta = results["metadatas"][0][i]
                    dist = results["distances"][0][i] if results.get("distances") else None
                    entities.append({
                        "name": eid,
                        "entityType": meta.get("entity_type", "unknown"),
                        "observations": json.loads(meta.get("observations_json", "[]")),
                        "similarity": round(1 - dist, 4) if dist is not None else None,
                        "created_at": meta.get("created_at", ""),
                        "updated_at": meta.get("updated_at", ""),
                        "relations": [],
                    })
            self._respond_json({"entities": entities})

        else:
            self._respond(404, "text/plain", "Not found")

    def do_DELETE(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/entities/"):
            name = parsed.path[len("/api/entities/"):]
            from urllib.parse import unquote
            name = unquote(name)
            try:
                entities_col.delete(ids=[name])
                # Delete related relations
                if relations_col.count() > 0:
                    all_rels = relations_col.get()
                    to_delete = []
                    for i, rid in enumerate(all_rels["ids"]):
                        rm = all_rels["metadatas"][i]
                        if rm.get("from_entity") == name or rm.get("to_entity") == name:
                            to_delete.append(rid)
                    if to_delete:
                        relations_col.delete(ids=to_delete)
                self._respond_json({"deleted": True})
            except Exception as e:
                self._respond_json({"error": str(e)}, 500)
        else:
            self._respond(404, "text/plain", "Not found")

    def _respond(self, code, content_type, body):
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body.encode() if isinstance(body, str) else body)

    def _respond_json(self, data, code=200):
        self._respond(code, "application/json", json.dumps(data))

    def log_message(self, format, *args):
        pass  # Silent logging


def main():
    parser = argparse.ArgumentParser(description="ChromaDB Knowledge Graph Viewer")
    parser.add_argument("--port", type=int, default=8420)
    parser.add_argument("--db-path", default=DB_PATH)
    args = parser.parse_args()

    init_db(args.db_path)
    count = entities_col.count()
    print(f"ChromaDB Viewer — http://localhost:{args.port}")
    print(f"DB: {args.db_path} ({count} entities)")
    print("Ctrl+C to stop")

    server = HTTPServer(("127.0.0.1", args.port), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
        server.server_close()


if __name__ == "__main__":
    main()
