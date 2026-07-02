#!/bin/bash
# tests/test_checkpoint_guard.sh
# Functional tests for hooks/ts/bodies/checkpoint-guard.ts (compiled to
# hooks/ts/dist/checkpoint-guard.cjs — the single source of gate logic
# post-cutover, issue #446).
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
HOOK="$REPO_ROOT/hooks/ts/dist/checkpoint-guard.cjs"

if [ ! -f "$HOOK" ]; then
    echo "ERROR: $HOOK not found — run 'npm --prefix hooks/ts run build'"
    exit 1
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
# The TS StateReader resolves the search root from process.cwd() — cd into
# $cwd rather than an env-var override.
run_hook() {
    local cwd="$1"
    local payload="$2"
    (cd "$cwd" && node "$HOOK") <<< "$payload" 2>&1
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

# Realistic Claude Code PreToolUse Task payload shape: subagent_type is a Task
# tool argument, so it lives under tool_input — not at the payload root. The
# oracle previously read the root (matching only these fixtures, not real CC
# traffic); both the oracle and these fixtures were corrected together to the
# nested shape so boundary B1 actually fires in production (T6c, [CONSTRAINT-
# DISCOVERED] resolution, option a).
ARCHITECT_PAYLOAD='{"tool_name":"Task","tool_input":{"subagent_type":"th:architect","prompt":"plan this"}}'
IMPLEMENTER_PAYLOAD='{"tool_name":"Task","tool_input":{"subagent_type":"th:implementer","prompt":"implement this"}}'

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
# Case 13 — DENY: B2 (research-next) boundary armed, both conditions missing
# ---------------------------------------------------------------------------
echo
echo "=== DENY: B2 (research-next) boundary armed, advance_fresh=false AND clarity=false ==="
STATE_B2_BOTH_MISSING="$(cat <<'EOF'
- checkpoint_boundary: research-next
- checkpoint_advance_fresh: false
- functional_clarity_confirmed: false
EOF
)"
TMP=$(make_tmp_workspace "$STATE_B2_BOTH_MISSING")
assert_deny "B2 boundary armed, both missing (dispatch to th:implementer)" \
    "$TMP" "$IMPLEMENTER_PAYLOAD"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# Case 14 — DENY: B2 armed, only advance_fresh missing
# ---------------------------------------------------------------------------
echo
echo "=== DENY: B2 boundary armed, advance_fresh=false only ==="
STATE_B2_FRESH_MISSING="$(cat <<'EOF'
- checkpoint_boundary: research-next
- checkpoint_advance_fresh: false
- functional_clarity_confirmed: true
EOF
)"
TMP=$(make_tmp_workspace "$STATE_B2_FRESH_MISSING")
assert_deny "B2 advance_fresh missing, clarity confirmed" "$TMP" "$IMPLEMENTER_PAYLOAD"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# Case 15 — DENY: B2 armed, only clarity missing
# ---------------------------------------------------------------------------
echo
echo "=== DENY: B2 boundary armed, clarity_confirmed=false only ==="
STATE_B2_CLARITY_MISSING="$(cat <<'EOF'
- checkpoint_boundary: research-next
- checkpoint_advance_fresh: true
- functional_clarity_confirmed: false
EOF
)"
TMP=$(make_tmp_workspace "$STATE_B2_CLARITY_MISSING")
assert_deny "B2 clarity missing, advance_fresh confirmed" "$TMP" "$IMPLEMENTER_PAYLOAD"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# Case 16 — ALLOW: B2 armed, both conditions satisfied
# ---------------------------------------------------------------------------
echo
echo "=== ALLOW: B2 boundary armed, both conditions satisfied ==="
STATE_B2_SATISFIED="$(cat <<'EOF'
- checkpoint_boundary: research-next
- checkpoint_advance_fresh: true
- functional_clarity_confirmed: true
EOF
)"
TMP=$(make_tmp_workspace "$STATE_B2_SATISFIED")
assert_allow "B2 both conditions satisfied" "$TMP" "$IMPLEMENTER_PAYLOAD"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# Case 17 — ALLOW: B2 armed, skip marker fast_mode=true (per qa-plan note 2)
# ---------------------------------------------------------------------------
echo
echo "=== ALLOW: B2 boundary armed, skip marker fast_mode=true ==="
STATE_B2_FAST="$(cat <<'EOF'
- checkpoint_boundary: research-next
- checkpoint_advance_fresh: false
- functional_clarity_confirmed: false
- fast_mode: true
EOF
)"
TMP=$(make_tmp_workspace "$STATE_B2_FAST")
assert_allow "B2 boundary + fast_mode: true (skip marker honored)" "$TMP" "$IMPLEMENTER_PAYLOAD"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# Case 18 — ALLOW: B2 armed, skip marker discover_state=bypassed (per qa-plan note 2)
# ---------------------------------------------------------------------------
echo
echo "=== ALLOW: B2 boundary armed, skip marker discover_state=bypassed ==="
STATE_B2_BYPASSED="$(cat <<'EOF'
- checkpoint_boundary: research-next
- checkpoint_advance_fresh: false
- functional_clarity_confirmed: false
- discover_state: bypassed
EOF
)"
TMP=$(make_tmp_workspace "$STATE_B2_BYPASSED")
assert_allow "B2 boundary + discover_state: bypassed (skip marker honored)" "$TMP" "$IMPLEMENTER_PAYLOAD"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# Case 19 — DENY: B3 (postverify-next) boundary armed, both conditions missing
# ---------------------------------------------------------------------------
echo
echo "=== DENY: B3 (postverify-next) boundary armed, advance_fresh=false AND clarity=false ==="
STATE_B3_BOTH_MISSING="$(cat <<'EOF'
- checkpoint_boundary: postverify-next
- checkpoint_advance_fresh: false
- functional_clarity_confirmed: false
EOF
)"
TMP=$(make_tmp_workspace "$STATE_B3_BOTH_MISSING")
assert_deny "B3 boundary armed, both missing (dispatch to th:implementer)" \
    "$TMP" "$IMPLEMENTER_PAYLOAD"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# Case 20 — ALLOW: B3 armed, both conditions satisfied
# ---------------------------------------------------------------------------
echo
echo "=== ALLOW: B3 boundary armed, both conditions satisfied ==="
STATE_B3_SATISFIED="$(cat <<'EOF'
- checkpoint_boundary: postverify-next
- checkpoint_advance_fresh: true
- functional_clarity_confirmed: true
EOF
)"
TMP=$(make_tmp_workspace "$STATE_B3_SATISFIED")
assert_allow "B3 both conditions satisfied" "$TMP" "$IMPLEMENTER_PAYLOAD"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# Case 21 — DENY: B3 armed, only advance_fresh missing
# ---------------------------------------------------------------------------
echo
echo "=== DENY: B3 boundary armed, advance_fresh=false only ==="
STATE_B3_FRESH_MISSING="$(cat <<'EOF'
- checkpoint_boundary: postverify-next
- checkpoint_advance_fresh: false
- functional_clarity_confirmed: true
EOF
)"
TMP=$(make_tmp_workspace "$STATE_B3_FRESH_MISSING")
assert_deny "B3 advance_fresh missing, clarity confirmed" "$TMP" "$IMPLEMENTER_PAYLOAD"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# Case 22 — DENY: B3 armed, only clarity missing
# ---------------------------------------------------------------------------
echo
echo "=== DENY: B3 boundary armed, clarity_confirmed=false only ==="
STATE_B3_CLARITY_MISSING="$(cat <<'EOF'
- checkpoint_boundary: postverify-next
- checkpoint_advance_fresh: true
- functional_clarity_confirmed: false
EOF
)"
TMP=$(make_tmp_workspace "$STATE_B3_CLARITY_MISSING")
assert_deny "B3 clarity missing, advance_fresh confirmed" "$TMP" "$IMPLEMENTER_PAYLOAD"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# Case 23 — B1 REGRESSION GUARD: non-architect dispatch while B1 armed STILL allows
# This mirrors Case 8 (original regression guard) after the B2/B3 refactor.
# The B2/B3 extension must NOT change B1 behavior: when B1 (intake-plan) is
# armed, only th:architect is gated; th:implementer still allows.
# ---------------------------------------------------------------------------
echo
echo "=== B1 regression guard: th:implementer while B1 (intake-plan) armed still ALLOWS ==="
STATE_B1_ARMED_IMPL="$(cat <<'EOF'
- checkpoint_boundary: intake-plan
- checkpoint_advance_fresh: false
- functional_clarity_confirmed: false
EOF
)"
TMP=$(make_tmp_workspace "$STATE_B1_ARMED_IMPL")
assert_allow "B1 armed + th:implementer dispatch (regression guard: Case 8 preserved)" \
    "$TMP" "$IMPLEMENTER_PAYLOAD"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# Case 24 — B3 armed, skip marker fast_mode=true (per qa-plan note 2)
# ---------------------------------------------------------------------------
echo
echo "=== ALLOW: B3 boundary armed, skip marker fast_mode=true ==="
STATE_B3_FAST="$(cat <<'EOF'
- checkpoint_boundary: postverify-next
- checkpoint_advance_fresh: false
- functional_clarity_confirmed: false
- fast_mode: true
EOF
)"
TMP=$(make_tmp_workspace "$STATE_B3_FAST")
assert_allow "B3 boundary + fast_mode: true (skip marker honored at B3)" "$TMP" "$IMPLEMENTER_PAYLOAD"
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
