Manage the Knowledge Graph web viewer. Start or stop the viewer UI. This is a standalone utility — does NOT route through the orchestrator.

Analyze the input: $ARGUMENTS

---

## Actions

### `start` — Start the viewer

1. Check if already running:
   ```bash
   curl -s http://localhost:8420/ >/dev/null 2>&1 && echo "RUNNING" || echo "STOPPED"
   ```
2. If RUNNING → "Knowledge Graph Viewer ya está corriendo en http://localhost:8420"
3. If STOPPED → start it in the background:
   ```bash
   cd ~/.claude/knowledge-graph/viewer && uv run --directory ~/.claude/knowledge-graph python viewer/app.py --db-path ~/.claude/chromadb &
   ```
   Wait 2 seconds, verify it started:
   ```bash
   curl -s http://localhost:8420/ >/dev/null 2>&1 && echo "OK" || echo "FAILED"
   ```
4. If OK → "Knowledge Graph Viewer levantado en http://localhost:8420"
5. If FAILED → report the error

### `stop` — Stop the viewer

1. Find and kill the process by port:
   ```bash
   for pid in $(netstat -ano 2>/dev/null | grep "127.0.0.1:8420.*LISTENING" | awk '{print $5}' | sort -u); do taskkill //F //PID $pid 2>/dev/null; done
   ```
2. Verify:
   ```bash
   curl -s http://localhost:8420/ >/dev/null 2>&1 && echo "STILL_RUNNING" || echo "STOPPED"
   ```
3. Report result

### `restart` — Restart the viewer

1. Kill existing process by port:
   ```bash
   for pid in $(netstat -ano 2>/dev/null | grep "127.0.0.1:8420.*LISTENING" | awk '{print $5}' | sort -u); do taskkill //F //PID $pid 2>/dev/null; done
   ```
2. Wait 1 second, then start:
   ```bash
   sleep 1 && cd ~/.claude/knowledge-graph/viewer && uv run --directory ~/.claude/knowledge-graph python viewer/app.py --db-path ~/.claude/chromadb &
   ```
3. Wait 2 seconds, verify:
   ```bash
   curl -s http://localhost:8420/ >/dev/null 2>&1 && echo "OK" || echo "FAILED"
   ```
4. If OK → "Knowledge Graph Viewer reiniciado en http://localhost:8420"
5. If FAILED → report the error

### `status` — Check if running

1. ```bash
   curl -s http://localhost:8420/ >/dev/null 2>&1 && echo "RUNNING" || echo "STOPPED"
   ```
2. If RUNNING → "Knowledge Graph Viewer activo en http://localhost:8420"
3. If STOPPED → "Knowledge Graph Viewer no está corriendo. Usa `/kg-viewer start` para levantarlo."

### No args — Show usage

```
Usage: /kg-viewer ACTION

Actions:
  start    Levantar el viewer web en http://localhost:8420
  stop     Detener el viewer
  restart  Reiniciar el viewer (stop + start)
  status   Verificar si está corriendo

El viewer muestra todas las entities del Knowledge Graph con búsqueda
semántica, filtros por tipo, y opción de eliminar entries.
```

---

## Important

- Puerto fijo: 8420 (localhost only, no expuesto externamente)
- El viewer abre la misma DB que usa el Knowledge Graph MCP — los cambios se reflejan en ambos
- Si el viewer no arranca, verificar que `~/.claude/chromadb/` existe y tiene data