#!/bin/bash
# tests/test_checkpoint_guard.sh
# Functional tests for hooks/checkpoint-guard.sh
# Each case feeds a Task tool-call JSON payload to the hook together with
# a synthetic 00-state.md written to a temp workspace, then asserts whether
# the hook emits permissionDecision:"deny" or permissionDecision:"allow".
#
# The hook searches for 00-state.md from $CWD via find. We run each case
# from a temp directory that contains workspaces/x/00-state.md so the hook
# always finds exactly one state file (or none, for the fail-safe case).
#
# Usage:
#   ./tests/test_checkpoint_guard.sh
# Exit code:
#   0 if all cases pass, 1 otherwise.

set -u

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOK="$REPO_ROOT/hooks/checkpoint-guard.sh"

if [ ! -x "$HOOK" ]; then
    chmod +x "$HOOK"
fi

PASS=0
FAIL=0
declare -a FAILURES

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Create a temp dir with workspaces/x/00-state.md containing $content.
# Prints the temp dir path. Caller must rm -rf it when done.
make_tmp_workspace() {
    local content="$1"
    local tmp
    tmp="$(mktemp -d)"
    mkdir -p "$tmp/workspaces/x"
    printf '%s\n' "$content" > "$tmp/workspaces/x/00-state.md"
    echo "$tmp"
}

# Create a temp dir with NO workspace (no 00-state.md anywhere).
make_tmp_empty() {
    local tmp
    tmp="$(mktemp -d)"
    echo "$tmp"
}

# Run hook with $payload from $cwd; print stdout.
run_hook() {
    local cwd="$1"
    local payload="$2"
    CWD="$cwd" bash "$HOOK" <<< "$payload" 2>&1
}

assert_deny() {
    local name="$1"
    local cwd="$2"
    local payload="$3"
    local out
    out=$(run_hook "$cwd" "$payload")
    if echo "$out" | grep -q '"permissionDecision": *"deny"'; then
        PASS=$((PASS + 1))
        echo "  [PASS] DENY: $name"
    else
        FAIL=$((FAIL + 1))
        FAILURES+=("DENY expected but got allow: $name | output: ${out:-<empty>}")
        echo "  [FAIL] DENY: $name (got: ${out:-<empty>})"
    fi
}

assert_allow() {
    local name="$1"
    local cwd="$2"
    local payload="$3"
    local out
    out=$(run_hook "$cwd" "$payload")
    if echo "$out" | grep -q '"permissionDecision": *"allow"'; then
        PASS=$((PASS + 1))
        echo "  [PASS] ALLOW: $name"
    else
        FAIL=$((FAIL + 1))
        FAILURES+=("ALLOW expected but got deny: $name | output: ${out:-<empty>}")
        echo "  [FAIL] ALLOW: $name (got: ${out:-<empty>})"
    fi
}

# ---------------------------------------------------------------------------
# Payloads
# ---------------------------------------------------------------------------

ARCHITECT_PAYLOAD='{"subagent_type":"th:architect","prompt":"plan this"}'
IMPLEMENTER_PAYLOAD='{"subagent_type":"th:implementer","prompt":"implement this"}'

# ---------------------------------------------------------------------------
# Case 1 — DENY: checkpoint armed, both conditions missing
# ---------------------------------------------------------------------------
echo "=== DENY: checkpoint armed, advance_fresh=false AND clarity_confirmed=false ==="
STATE_BOTH_MISSING="$(cat <<'EOF'
- checkpoint_boundary: intake-plan
- checkpoint_advance_fresh: false
- functional_clarity_confirmed: false
EOF
)"
TMP=$(make_tmp_workspace "$STATE_BOTH_MISSING")
assert_deny "both missing (advance_fresh=false, clarity=false)" "$TMP" "$ARCHITECT_PAYLOAD"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# Case 2 — DENY: checkpoint armed, only advance_fresh missing
# ---------------------------------------------------------------------------
echo
echo "=== DENY: checkpoint armed, advance_fresh=false only (clarity_confirmed=true) ==="
STATE_FRESH_MISSING="$(cat <<'EOF'
- checkpoint_boundary: intake-plan
- checkpoint_advance_fresh: false
- functional_clarity_confirmed: true
EOF
)"
TMP=$(make_tmp_workspace "$STATE_FRESH_MISSING")
assert_deny "advance_fresh missing only (clarity confirmed)" "$TMP" "$ARCHITECT_PAYLOAD"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# Case 3 — DENY: checkpoint armed, only clarity missing
# ---------------------------------------------------------------------------
echo
echo "=== DENY: checkpoint armed, clarity_confirmed=false only (advance_fresh=true) ==="
STATE_CLARITY_MISSING="$(cat <<'EOF'
- checkpoint_boundary: intake-plan
- checkpoint_advance_fresh: true
- functional_clarity_confirmed: false
EOF
)"
TMP=$(make_tmp_workspace "$STATE_CLARITY_MISSING")
assert_deny "clarity missing only (advance_fresh confirmed)" "$TMP" "$ARCHITECT_PAYLOAD"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# Case 4 — ALLOW: checkpoint satisfied (both true)
# ---------------------------------------------------------------------------
echo
echo "=== ALLOW: checkpoint satisfied (both advance_fresh=true AND clarity_confirmed=true) ==="
STATE_SATISFIED="$(cat <<'EOF'
- checkpoint_boundary: intake-plan
- checkpoint_advance_fresh: true
- functional_clarity_confirmed: true
EOF
)"
TMP=$(make_tmp_workspace "$STATE_SATISFIED")
assert_allow "both conditions satisfied" "$TMP" "$ARCHITECT_PAYLOAD"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# Case 5 — ALLOW: skip marker fast_mode=true
# ---------------------------------------------------------------------------
echo
echo "=== ALLOW: skip marker fast_mode=true ==="
STATE_FAST="$(cat <<'EOF'
- checkpoint_boundary: intake-plan
- checkpoint_advance_fresh: false
- functional_clarity_confirmed: false
- fast_mode: true
EOF
)"
TMP=$(make_tmp_workspace "$STATE_FAST")
assert_allow "fast_mode: true" "$TMP" "$ARCHITECT_PAYLOAD"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# Case 6 — ALLOW: skip marker discover_state=bypassed
# ---------------------------------------------------------------------------
echo
echo "=== ALLOW: skip marker discover_state=bypassed ==="
STATE_BYPASSED="$(cat <<'EOF'
- checkpoint_boundary: intake-plan
- checkpoint_advance_fresh: false
- functional_clarity_confirmed: false
- discover_state: bypassed
EOF
)"
TMP=$(make_tmp_workspace "$STATE_BYPASSED")
assert_allow "discover_state: bypassed" "$TMP" "$ARCHITECT_PAYLOAD"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# Case 7 — ALLOW: skip marker bug_tier (numeric 0-4 → fix/hotfix flow)
# ---------------------------------------------------------------------------
echo
echo "=== ALLOW: skip marker bug_tier (fix/hotfix flow) ==="
STATE_BUG_TIER="$(cat <<'EOF'
- checkpoint_boundary: intake-plan
- checkpoint_advance_fresh: false
- functional_clarity_confirmed: false
- bug_tier: 2
EOF
)"
TMP=$(make_tmp_workspace "$STATE_BUG_TIER")
assert_allow "bug_tier: 2" "$TMP" "$ARCHITECT_PAYLOAD"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# Case 8 — ALLOW: non-gated subagent_type (th:implementer bypasses the gate)
# ---------------------------------------------------------------------------
echo
echo "=== ALLOW: non-gated subagent (th:implementer, gate applies only to th:architect) ==="
STATE_ARMED="$(cat <<'EOF'
- checkpoint_boundary: intake-plan
- checkpoint_advance_fresh: false
- functional_clarity_confirmed: false
EOF
)"
TMP=$(make_tmp_workspace "$STATE_ARMED")
assert_allow "th:implementer dispatched while checkpoint armed" "$TMP" "$IMPLEMENTER_PAYLOAD"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# Case 9 — ALLOW: unarmed checkpoint — checkpoint_boundary: null
# ---------------------------------------------------------------------------
echo
echo "=== ALLOW: checkpoint unarmed — checkpoint_boundary: null ==="
STATE_NULL="$(cat <<'EOF'
- checkpoint_boundary: null
- checkpoint_advance_fresh: false
- functional_clarity_confirmed: false
EOF
)"
TMP=$(make_tmp_workspace "$STATE_NULL")
assert_allow "checkpoint_boundary: null" "$TMP" "$ARCHITECT_PAYLOAD"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# Case 10 — ALLOW: no checkpoint_boundary field at all
# ---------------------------------------------------------------------------
echo
echo "=== ALLOW: no checkpoint_boundary field in state ==="
STATE_NO_FIELD="$(cat <<'EOF'
- status: in-progress
- checkpoint_advance_fresh: false
- functional_clarity_confirmed: false
EOF
)"
TMP=$(make_tmp_workspace "$STATE_NO_FIELD")
assert_allow "no checkpoint_boundary field" "$TMP" "$ARCHITECT_PAYLOAD"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# Case 11 — ALLOW: fail-safe — no 00-state.md found anywhere
# ---------------------------------------------------------------------------
echo
echo "=== ALLOW: fail-safe — no 00-state.md found ==="
TMP=$(make_tmp_empty)
assert_allow "no 00-state.md (fail-safe)" "$TMP" "$ARCHITECT_PAYLOAD"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# Case 12 — ANTI-SPOOF: commented value must NOT be treated as true
# A line "- checkpoint_advance_fresh: false # was true" has the token "false"
# and a comment. The strict parse must match "false" as the value, not "true"
# from the comment. Combined with clarity_confirmed=true → deny (fresh missing).
# ---------------------------------------------------------------------------
echo
echo "=== ANTI-SPOOF: commented trailing value must not be parsed as true ==="
STATE_SPOOF="$(cat <<'EOF'
- checkpoint_boundary: intake-plan
- checkpoint_advance_fresh: false # was true
- functional_clarity_confirmed: true
EOF
)"
TMP=$(make_tmp_workspace "$STATE_SPOOF")
assert_deny "spoofed comment '# was true' — strict parse must produce DENY" "$TMP" "$ARCHITECT_PAYLOAD"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo
echo "============================================================"
echo "  checkpoint-guard tests: $PASS passed / $((PASS + FAIL)) total"
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
