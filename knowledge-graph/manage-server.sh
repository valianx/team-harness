#!/usr/bin/env bash
# Knowledge Graph MCP SSE Server Manager
# Usage: manage-server.sh {start|stop|status|restart}
#
# Starts the knowledge-graph MCP server in SSE mode so both Windows and WSL
# Claude Code instances can connect to http://localhost:8421/sse
#
# Environment variables (with backward-compatible fallbacks for 1.0.x users):
#   KNOWLEDGE_GRAPH_DIR  — server directory (default: ~/.claude/knowledge-graph)
#   CHROMADB_PATH        — database directory (default: ~/.claude/chromadb) — the
#                          persistent store is still ChromaDB internally; the path
#                          is an implementation detail and may change if the
#                          backend is swapped.
#   CHROMADB_PORT        — SSE port (default: 8421)
#   CHROMADB_HOST        — SSE host (default: 127.0.0.1)
#
# Legacy env var CHROMADB_MCP_DIR (pre-1.1) is honoured if KNOWLEDGE_GRAPH_DIR
# is unset; this is removed in 2.0.

set -euo pipefail

SERVER_DIR="${KNOWLEDGE_GRAPH_DIR:-${CHROMADB_MCP_DIR:-$HOME/.claude/knowledge-graph}}"
PID_FILE="$SERVER_DIR/.server.pid"
LOG_FILE="$SERVER_DIR/server.log"
PORT="${CHROMADB_PORT:-8421}"
HOST="${CHROMADB_HOST:-0.0.0.0}"
DB_PATH="${CHROMADB_PATH:-$HOME/.claude/chromadb}"

# ---------------------------------------------------------------------------
# Find uv binary
# ---------------------------------------------------------------------------
find_uv() {
  command -v uv 2>/dev/null && return
  for p in "$HOME/.local/bin/uv" "$HOME/.cargo/bin/uv"; do
    [ -x "$p" ] && echo "$p" && return
  done
  # Windows paths accessible from Git Bash / MSYS
  for p in "$APPDATA/Python/"*/Scripts/uv.exe "$LOCALAPPDATA/Programs/uv/uv.exe"; do
    [ -x "$p" ] && echo "$p" && return
  done
  return 1
}

# ---------------------------------------------------------------------------
# Build the run command
# ---------------------------------------------------------------------------
build_cmd() {
  local uv
  uv=$(find_uv 2>/dev/null) || true

  if [ -n "$uv" ]; then
    echo "$uv" run --directory "$SERVER_DIR" python server.py \
      --transport sse --port "$PORT" --host "$HOST"
  elif command -v python3 >/dev/null 2>&1; then
    echo python3 "$SERVER_DIR/server.py" \
      --transport sse --port "$PORT" --host "$HOST"
  elif command -v python >/dev/null 2>&1; then
    echo python "$SERVER_DIR/server.py" \
      --transport sse --port "$PORT" --host "$HOST"
  else
    echo "ERROR: No Python found" >&2
    return 1
  fi
}

# ---------------------------------------------------------------------------
# Process management (cross-platform: Windows taskkill + Unix kill)
# ---------------------------------------------------------------------------
is_running() {
  [ -f "$PID_FILE" ] || return 1
  local pid
  pid=$(cat "$PID_FILE")

  # Try Unix kill -0 first, fall back to Windows tasklist
  if kill -0 "$pid" 2>/dev/null; then
    return 0
  elif command -v tasklist.exe >/dev/null 2>&1; then
    tasklist.exe /FI "PID eq $pid" 2>/dev/null | grep -q "$pid" && return 0
  fi
  # Stale PID file
  rm -f "$PID_FILE"
  return 1
}

kill_pid() {
  local pid="$1"
  if kill "$pid" 2>/dev/null; then
    return 0
  elif command -v taskkill.exe >/dev/null 2>&1; then
    taskkill.exe /PID "$pid" /F >/dev/null 2>&1 && return 0
  fi
  return 1
}

# Also check if something else is on the port
port_in_use() {
  if command -v ss >/dev/null 2>&1; then
    ss -tlnp 2>/dev/null | grep -q ":$PORT " && return 0
  elif command -v netstat.exe >/dev/null 2>&1; then
    netstat.exe -ano 2>/dev/null | grep "LISTENING" | grep -q ":$PORT " && return 0
  elif command -v netstat >/dev/null 2>&1; then
    netstat -tlnp 2>/dev/null | grep -q ":$PORT " && return 0
  fi
  return 1
}

# ---------------------------------------------------------------------------
# Actions
# ---------------------------------------------------------------------------
do_start() {
  if is_running; then
    echo "Already running (PID $(cat "$PID_FILE")) on $HOST:$PORT"
    return 0
  fi

  if port_in_use; then
    echo "WARNING: Port $PORT already in use — another process may be serving"
    return 1
  fi

  [ -f "$SERVER_DIR/server.py" ] || { echo "ERROR: $SERVER_DIR/server.py not found"; return 1; }

  local cmd
  cmd=$(build_cmd) || return 1

  export CHROMADB_PATH="$DB_PATH"
  nohup $cmd > "$LOG_FILE" 2>&1 &
  local pid=$!
  echo "$pid" > "$PID_FILE"

  # Wait briefly and verify it started
  sleep 2
  if is_running; then
    echo "Started on $HOST:$PORT (PID $pid)"
  else
    echo "ERROR: Server failed to start — check $LOG_FILE"
    rm -f "$PID_FILE"
    tail -20 "$LOG_FILE" 2>/dev/null
    return 1
  fi
}

do_stop() {
  if [ -f "$PID_FILE" ]; then
    local pid
    pid=$(cat "$PID_FILE")
    if kill_pid "$pid"; then
      rm -f "$PID_FILE"
      echo "Stopped (was PID $pid)"
    else
      rm -f "$PID_FILE"
      echo "PID $pid already gone"
    fi
  else
    echo "Not running"
  fi
}

do_status() {
  if is_running; then
    echo "Running (PID $(cat "$PID_FILE")) on $HOST:$PORT"
    echo "URL: http://$HOST:$PORT/sse"
    echo "DB:  $DB_PATH"
    echo "Log: $LOG_FILE"
  else
    echo "Stopped"
    [ -f "$PID_FILE" ] && rm -f "$PID_FILE"
  fi
}

do_restart() {
  do_stop
  sleep 1
  do_start
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
case "${1:-status}" in
  start)   do_start ;;
  stop)    do_stop ;;
  status)  do_status ;;
  restart) do_restart ;;
  *)
    echo "Usage: $(basename "$0") {start|stop|status|restart}"
    echo ""
    echo "Manages the ChromaDB MCP server in SSE mode."
    echo "Both Windows and WSL Claude Code instances connect to http://$HOST:$PORT/sse"
    exit 1
    ;;
esac
