#!/bin/bash
# tests/test_subagent_start.sh
# Functional tests for hooks/ts/dist/subagent-start.cjs — the PreToolUse (Task)
# breadcrumb writer that is the start-side twin of hooks/subagent-trace.sh.
#
# Asserts (Task-7, issue #452):
#   - AC-1: a th:* subagent_type dispatch appends exactly one
#     {"ts","event":"subagent.start","agent_type"} line to the resolved
#     workspace's 00-subagent-trace.jsonl; a non-th:* dispatch writes nothing
#     and exits 0.
#   - AC-2: node runtime errors, malformed JSON, missing/wrong-typed fields,
#     an unreachable workspace path, and an oversize (SEC-07) payload all
#     fail open — exit 0, empty stdout, no crash, dispatch never blocked.
#
# Usage: bash tests/test_subagent_start.sh
# Exit code: 0 all cases pass, 1 otherwise.

set -u

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CJS="$REPO_ROOT/hooks/ts/dist/subagent-start.cjs"

PASS=0
FAIL=0
declare -a FAILURES

# assert_true LABEL — reads the numeric result (0 or 1) from stdin-free arg $2.
assert_true() {
    local label="$1" result="$2"
    if [ "$result" -eq 1 ]; then
        PASS=$((PASS + 1))
        echo "  [PASS] $label"
    else
        FAIL=$((FAIL + 1))
        FAILURES+=("$label")
        echo "  [FAIL] $label"
    fi
}

echo "=== subagent-start functional tests ==="
echo "  CJS: $CJS"
echo ""

if [ ! -f "$CJS" ]; then
    echo "FATAL: TS bundle not found at $CJS — run 'npm --prefix hooks/ts run build:subagent-start' first."
    exit 1
fi
if ! command -v node >/dev/null 2>&1; then
    echo "subagent-start: SKIP (node not found — install Node.js to run this suite)"
    exit 0
fi

make_payload() {
    local subagent_type="$1"
    python3 -c "
import json, sys
print(json.dumps({'tool_name': 'Task', 'tool_input': {'subagent_type': sys.argv[1], 'description': 'test dispatch'}}))
" "$subagent_type"
}

# ---------------------------------------------------------------------------
# Fixture: throwaway workspace with an active (non-terminal) 00-state.md
# ---------------------------------------------------------------------------
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

mkdir -p "$WORKDIR/workspaces/test-feature"
cat > "$WORKDIR/workspaces/test-feature/00-state.md" <<'EOF'
- status: in_progress
EOF

TRACE_FILE="$WORKDIR/workspaces/test-feature/00-subagent-trace.jsonl"

# ---------------------------------------------------------------------------
# Section 1 — AC-1: th:* dispatch writes the breadcrumb
# ---------------------------------------------------------------------------
echo "--- Section 1: start-write (AC-1) ---"

rm -f "$TRACE_FILE"
payload="$(make_payload "th:tester")"
out="$(cd "$WORKDIR" && echo "$payload" | node "$CJS" 2>/dev/null)"
rc=$?

[ "$rc" -eq 0 ] && r=1 || r=0
assert_true "th:* dispatch exits 0" "$r"

[ -z "$out" ] && r=1 || r=0
assert_true "th:* dispatch emits no stdout" "$r"

[ -f "$TRACE_FILE" ] && r=1 || r=0
assert_true "th:* dispatch writes the trace file" "$r"

if [ -f "$TRACE_FILE" ]; then
    LINE="$(cat "$TRACE_FILE")"

    if echo "$LINE" | grep -q '"event":"subagent.start"'; then r=1; else r=0; fi
    assert_true "trace line has event=subagent.start" "$r"

    if echo "$LINE" | grep -q '"agent_type":"th:tester"'; then r=1; else r=0; fi
    assert_true "trace line has agent_type=th:tester" "$r"

    if echo "$LINE" | grep -q '"ts":"'; then r=1; else r=0; fi
    assert_true "trace line has a ts field" "$r"

    if echo "$LINE" | grep -q '"agent_id"'; then r=0; else r=1; fi
    assert_true "trace line does NOT carry agent_id (not yet assigned at PreToolUse time)" "$r"

    # Exact key set: only ts, event, agent_type — no extra fields leaked.
    KEYS="$(python3 -c "import json,sys; print(','.join(sorted(json.loads(sys.argv[1]).keys())))" "$LINE" 2>/dev/null || true)"
    [ "$KEYS" = "agent_type,event,ts" ] && r=1 || r=0
    assert_true "trace line has exactly {ts, event, agent_type} keys" "$r"
fi

# ---------------------------------------------------------------------------
# Section 2 — AC-1: non-th:* dispatch guard
# ---------------------------------------------------------------------------
echo ""
echo "--- Section 2: non-th:* scope guard (AC-1) ---"

rm -f "$TRACE_FILE"
payload="$(make_payload "general-purpose")"
out="$(cd "$WORKDIR" && echo "$payload" | node "$CJS" 2>/dev/null)"
rc=$?

[ "$rc" -eq 0 ] && r=1 || r=0
assert_true "non-th:* dispatch exits 0" "$r"

[ -z "$out" ] && r=1 || r=0
assert_true "non-th:* dispatch emits no stdout" "$r"

[ ! -f "$TRACE_FILE" ] && r=1 || r=0
assert_true "non-th:* dispatch does NOT write the trace file" "$r"

# ---------------------------------------------------------------------------
# Section 3 — AC-2: fail-open on known-bad inputs
# ---------------------------------------------------------------------------
echo ""
echo "--- Section 3: fail-open on known-bad inputs (AC-2) ---"

rm -f "$TRACE_FILE"

# 3a. Malformed JSON.
out="$(cd "$WORKDIR" && printf 'not json {{{' | node "$CJS" 2>/dev/null)"
rc=$?
[ "$rc" -eq 0 ] && r=1 || r=0
assert_true "malformed JSON exits 0" "$r"
[ -z "$out" ] && r=1 || r=0
assert_true "malformed JSON emits no stdout" "$r"

# 3b. Empty stdin.
out="$(cd "$WORKDIR" && printf '' | node "$CJS" 2>/dev/null)"
rc=$?
[ "$rc" -eq 0 ] && r=1 || r=0
assert_true "empty stdin exits 0" "$r"

# 3c. Missing fields entirely (empty object).
out="$(cd "$WORKDIR" && printf '{}' | node "$CJS" 2>/dev/null)"
rc=$?
[ "$rc" -eq 0 ] && r=1 || r=0
assert_true "missing-fields payload exits 0" "$r"
[ ! -f "$TRACE_FILE" ] && r=1 || r=0
assert_true "missing-fields payload does NOT write the trace file" "$r"

# 3d. subagent_type present but wrong type (number, not string).
out="$(cd "$WORKDIR" && printf '{"tool_name":"Task","tool_input":{"subagent_type":42}}' | node "$CJS" 2>/dev/null)"
rc=$?
[ "$rc" -eq 0 ] && r=1 || r=0
assert_true "non-string subagent_type exits 0" "$r"

# 3e. Unreachable workspace path — no workspaces/ directory at all.
NOWORKSPACE_DIR="$(mktemp -d)"
payload="$(make_payload "th:tester")"
out="$(cd "$NOWORKSPACE_DIR" && echo "$payload" | node "$CJS" 2>/dev/null)"
rc=$?
[ "$rc" -eq 0 ] && r=1 || r=0
assert_true "no-workspace-dir dispatch exits 0" "$r"
[ -z "$out" ] && r=1 || r=0
assert_true "no-workspace-dir dispatch emits no stdout" "$r"
rm -rf "$NOWORKSPACE_DIR"

# 3f. Oversize payload — SEC-07 pre-parse size bound (MAX_PAYLOAD_BYTES = 1 MiB).
BIG_VALUE="$(python3 -c "print('x' * 2000000)")"
out="$(cd "$WORKDIR" && printf '{"tool_name":"Task","tool_input":{"subagent_type":"th:tester","description":"%s"}}' "$BIG_VALUE" | node "$CJS" 2>/dev/null)"
rc=$?
[ "$rc" -eq 0 ] && r=1 || r=0
assert_true "oversize payload exits 0 (SEC-07 reject, fail-open)" "$r"
[ -z "$out" ] && r=1 || r=0
assert_true "oversize payload emits no stdout" "$r"
[ ! -f "$TRACE_FILE" ] && r=1 || r=0
assert_true "oversize payload does NOT write the trace file" "$r"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
if [ "$FAIL" -gt 0 ]; then
    echo "Failures:"
    for f in "${FAILURES[@]}"; do
        echo "  - $f"
    done
    exit 1
fi
exit 0
