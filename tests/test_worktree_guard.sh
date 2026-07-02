#!/bin/bash
# tests/test_worktree_guard.sh
# Suite 133 — worktree-guard-hook-behavior
#
# Functional tests for hooks/worktree-guard.sh — start-gate advisory hook.
#
# The hook is a PreToolUse advisory gate that fires ONLY on agent-issued Bash
# tool calls containing a branch/worktree-creation trigger token
# (git checkout -b / git switch -c / git worktree add) and returns:
#   - nodecision (exit 0, empty stdout)  for non-Bash tools, non-trigger commands
#   - permissionDecision: ask            for any trigger token (advisory, never blocks)
#
# Contract (hooks/worktree-guard.sh header): FAIL-OPEN — malformed/unparseable
# payload with NO trigger token → nodecision; malformed payload where the raw
# text DOES contain a trigger token → ask (fail-safe, never silently drops the
# reminder). The hook must NEVER return "deny" or "allow" — advisory only.
#
# Dual-target (HOOK_IMPL=bash|ts, default bash): the same cases run against
# the compiled TS artifact (hooks/ts/dist/worktree-guard.cjs) when HOOK_IMPL=ts.
#
# Usage:
#   bash tests/test_worktree_guard.sh
#   HOOK_IMPL=ts bash tests/test_worktree_guard.sh
# Exit code:
#   0 if all cases pass, 1 otherwise.

# Marker: worktree-guard-hook-behavior

set -u

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOK_IMPL="${HOOK_IMPL:-bash}"
HOOK_BASH="$REPO_ROOT/hooks/worktree-guard.sh"
HOOK_TS="$REPO_ROOT/hooks/ts/dist/worktree-guard.cjs"

if [ "$HOOK_IMPL" = "ts" ]; then
    HOOK="$HOOK_TS"
    if [ ! -f "$HOOK" ]; then
        echo "ERROR: $HOOK not found — run 'npm --prefix hooks/ts run build' (HOOK_IMPL=ts)"
        exit 1
    fi
else
    HOOK="$HOOK_BASH"
    if [ ! -f "$HOOK" ]; then
        echo "ERROR: hooks/worktree-guard.sh not found at $HOOK"
        exit 1
    fi
    if [ ! -x "$HOOK" ]; then
        chmod +x "$HOOK"
    fi
fi

PASS=0
FAIL=0
declare -a FAILURES

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Build a Bash tool-call JSON payload. Uses python3 for reliable JSON escaping.
make_payload() {
    local cmd="$1"
    if command -v python3 >/dev/null 2>&1; then
        python3 -c "
import json, sys
cmd = sys.argv[1]
payload = {'tool_name': 'Bash', 'tool_input': {'command': cmd}}
print(json.dumps(payload))
" "$cmd"
    else
        printf '{"tool_name":"Bash","tool_input":{"command":"%s"}}\n' "$cmd"
    fi
}

# Build a non-Bash tool-call JSON payload (e.g. Read, Write, Edit).
make_nontool_payload() {
    local tool_name="$1"
    local file_path="${2:-/tmp/foo.txt}"
    if command -v python3 >/dev/null 2>&1; then
        python3 -c "
import json, sys
payload = {'tool_name': sys.argv[1], 'tool_input': {'file_path': sys.argv[2]}}
print(json.dumps(payload))
" "$tool_name" "$file_path"
    else
        printf '{"tool_name":"%s","tool_input":{"file_path":"%s"}}\n' "$tool_name" "$file_path"
    fi
}

# Run the hook; print stdout (decision JSON or empty).
run_hook() {
    local payload="$1"
    if [ "$HOOK_IMPL" = "ts" ]; then
        node "$HOOK" <<< "$payload" 2>&1
    else
        bash "$HOOK" <<< "$payload" 2>&1
    fi
}

# Assert hook emits "ask".
assert_ask() {
    local name="$1"
    local payload="$2"
    local out
    out=$(run_hook "$payload")
    if echo "$out" | grep -qE '"permissionDecision":[[:space:]]*"ask"'; then
        PASS=$((PASS + 1))
        echo "  [PASS] ASK: $name"
    else
        FAIL=$((FAIL + 1))
        FAILURES+=("ASK expected: $name | got: ${out:-<empty>}")
        echo "  [FAIL] ASK: $name (got: ${out:-<empty>})"
    fi
}

# assert_nodecision — PASS when the hook emits NO permissionDecision
# (exit 0, empty stdout). The advisory contract must never widen to "allow"
# and must never escalate to "deny" — it only ever asks or says nothing.
assert_nodecision() {
    local name="$1"
    local payload="$2"
    local out
    out=$(run_hook "$payload")
    if [ -z "$out" ] || ! echo "$out" | grep -q '"permissionDecision"'; then
        PASS=$((PASS + 1))
        echo "  [PASS] NODECISION: $name"
    else
        FAIL=$((FAIL + 1))
        FAILURES+=("NODECISION expected: $name | got: ${out:-<empty>}")
        echo "  [FAIL] NODECISION: $name (got: $out)"
    fi
}

# Assert hook NEVER returns "deny" or "allow" — advisory-only invariant.
assert_never_gate() {
    local name="$1"
    local payload="$2"
    local out
    out=$(run_hook "$payload")
    if echo "$out" | grep -qE '"permissionDecision":[[:space:]]*"(deny|allow)"'; then
        FAIL=$((FAIL + 1))
        FAILURES+=("NEVER-GATE violated (deny/allow emitted): $name | got: $out")
        echo "  [FAIL] NEVER-GATE: $name (got: $out — advisory hook must never deny/allow)"
    else
        PASS=$((PASS + 1))
        echo "  [PASS] NEVER-GATE: $name (no deny/allow emitted)"
    fi
}

# ---------------------------------------------------------------------------
# Trigger cases (ASK)
# ---------------------------------------------------------------------------
echo "=== Trigger: git checkout -b → ASK ==="
assert_ask "git checkout -b feat/x" "$(make_payload 'git checkout -b feat/x')"
assert_ask "git checkout -b feat/x origin/main" "$(make_payload 'git checkout -b feat/x origin/main')"

echo
echo "=== Trigger: git switch -c → ASK ==="
assert_ask "git switch -c feat/y" "$(make_payload 'git switch -c feat/y')"

echo
echo "=== Trigger: git worktree add → ASK ==="
assert_ask "git worktree add -b feat/x ../wt origin/main" \
    "$(make_payload 'git worktree add -b feat/x ../wt origin/main')"
assert_ask "git worktree add ../wt2" "$(make_payload 'git worktree add ../wt2')"

echo
echo "=== Trigger: leading/compound command (chained with &&) → ASK ==="
assert_ask "chained: cd repo && git checkout -b feat/z" \
    "$(make_payload 'cd repo && git checkout -b feat/z')"

# ---------------------------------------------------------------------------
# Non-trigger cases (NODECISION)
# ---------------------------------------------------------------------------
echo
echo "=== Non-trigger: benign git operations → NODECISION ==="
assert_nodecision "git status" "$(make_payload 'git status')"
assert_nodecision "git checkout main (no -b)" "$(make_payload 'git checkout main')"
assert_nodecision "git switch main (no -c)" "$(make_payload 'git switch main')"
assert_nodecision "git worktree list" "$(make_payload 'git worktree list')"
assert_nodecision "git worktree remove ../wt" "$(make_payload 'git worktree remove ../wt')"
assert_nodecision "git push origin main" "$(make_payload 'git push origin main')"
assert_nodecision "git branch -a" "$(make_payload 'git branch -a')"

echo
echo "=== Non-trigger: non-git Bash commands → NODECISION ==="
assert_nodecision "ls -la" "$(make_payload 'ls -la')"
assert_nodecision "npm test" "$(make_payload 'npm test')"

echo
echo "=== Non-trigger: non-Bash tool payloads → NODECISION ==="
assert_nodecision "Read tool" "$(make_nontool_payload 'Read' '/tmp/foo.txt')"
assert_nodecision "Write tool" "$(make_nontool_payload 'Write' '/tmp/foo.txt')"
assert_nodecision "Task tool" '{"tool_name":"Task","tool_input":{"subagent_type":"th:architect"}}'

# ---------------------------------------------------------------------------
# Known-bad inputs — fail-safe contract
# ---------------------------------------------------------------------------
echo
echo "=== Known-bad: empty payload → NODECISION (no trigger token in raw text) ==="
assert_nodecision "empty payload" ""

echo
echo "=== Known-bad: invalid JSON, no trigger token → NODECISION ==="
assert_nodecision "invalid JSON, no trigger" "not-a-json-blob"

echo
echo "=== Known-bad (fail-safe): malformed tool_input shape (array, not object) breaks"
echo "    structured command extraction, but raw payload bytes contain the trigger → ASK ==="
assert_ask "tool_input is an array (extraction fails, raw trigger present)" \
    '{"tool_name":"Bash","tool_input":["git checkout -b feat/x"]}'

echo
echo "=== Known-bad: malformed tool_input (command not a string) → NODECISION or ASK, never deny/allow ==="
assert_never_gate "tool_input.command is a number" \
    '{"tool_name":"Bash","tool_input":{"command":12345}}'

echo
echo "=== Known-bad: deeply nested / oversized payload → never deny/allow ==="
assert_never_gate "oversized command string" \
    "$(make_payload "$(python3 -c 'print("echo " + "a"*50000)' 2>/dev/null || echo 'echo aaaa')")"

# ---------------------------------------------------------------------------
# Advisory-only invariant across all cases already covered by assert_ask /
# assert_nodecision (neither ever matches deny/allow); explicit spot-checks:
# ---------------------------------------------------------------------------
echo
echo "=== Advisory-only invariant: trigger case never escalates to deny/allow ==="
assert_never_gate "trigger never denies/allows" "$(make_payload 'git checkout -b feat/never-gate')"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo
echo "============================================================"
echo "  worktree-guard tests: $PASS passed / $((PASS + FAIL)) total"
echo "============================================================"
if [ $FAIL -gt 0 ]; then
    echo
    echo "Failures:"
    for f in "${FAILURES[@]}"; do
        echo "  - $f"
    done
    exit 1
fi
exit 0
