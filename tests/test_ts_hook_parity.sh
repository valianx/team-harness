#!/bin/bash
# tests/test_ts_hook_parity.sh
# Focused regression harness for the hooks that remain after native permission
# controls became authoritative. The harness checks the compiled context and
# observability artifacts directly and then sources the retained behavior
# checks in test_ts_hook_parity_ext.sh.

set -u

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST_DIR="$REPO_ROOT/hooks/ts/dist"

PASS=0
FAIL=0
declare -a FAILURES

pass() {
    PASS=$((PASS + 1))
    echo "  [PASS] $1"
}

fail() {
    FAIL=$((FAIL + 1))
    FAILURES+=("$1")
    echo "  [FAIL] $1"
}

echo "=== retained TypeScript hook regression harness ==="

if ! command -v node >/dev/null 2>&1; then
    echo "  [SKIP] node not found"
    exit 0
fi

echo "--- compiled context and observability artifacts ---"
for artifact in \
    language-user-prompt.cjs \
    session-start.cjs \
    notify-stage.cjs \
    subagent-start.cjs \
    subagent-trace.cjs \
    precompact-snapshot.cjs; do
    if [ -s "$DIST_DIR/$artifact" ]; then
        pass "compiled artifact present: $artifact"
    else
        fail "compiled artifact missing or empty: $artifact"
    fi
done

for retired in \
    checkpoint-guard.cjs \
    codex-launcher.cjs \
    dev-guard.cjs \
    gate-guard.cjs \
    gcp-guard.cjs \
    policy-block.cjs \
    prepublish-guard.cjs \
    worktree-guard.cjs; do
    if [ -e "$DIST_DIR/$retired" ]; then
        fail "retired enforcement artifact still shipped: $retired"
    else
        pass "retired enforcement artifact absent: $retired"
    fi
done

EXT_FILE="$REPO_ROOT/tests/test_ts_hook_parity_ext.sh"
if [ -f "$EXT_FILE" ]; then
    # shellcheck source=./test_ts_hook_parity_ext.sh
    source "$EXT_FILE"
else
    fail "retained hook checks missing: $EXT_FILE"
fi

echo ""
echo "============================================================"
echo "  Retained hook harness: $PASS passed / $((PASS + FAIL)) total"
echo "============================================================"

if [ "$FAIL" -gt 0 ]; then
    echo ""
    echo "Failures:"
    for failure in "${FAILURES[@]}"; do
        echo "  - $failure"
    done
    exit 1
fi
exit 0
