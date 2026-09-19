#!/bin/bash
# Retained context and observability checks sourced by test_ts_hook_parity.sh.
# PASS, FAIL, FAILURES, REPO_ROOT, and DIST_DIR are inherited from the parent.

assert_pass() {
    PASS=$((PASS + 1))
    echo "  [PASS] $1"
}

assert_fail() {
    FAIL=$((FAIL + 1))
    FAILURES+=("$1")
    echo "  [FAIL] $1"
}

echo "--- SessionStart context ---"
SESSION_START="$DIST_DIR/session-start.cjs"
if [ ! -s "$SESSION_START" ]; then
    assert_fail "session-start bundle unavailable"
else
    ss_home="$(mktemp -d)"
    mkdir -p "$ss_home/.claude"
    ss_input='{"type":"startup","session_id":"retained-hook-test"}'
    ss_output=$(printf '%s\n' "$ss_input" | HOME="$ss_home" USERPROFILE="$ss_home" node "$SESSION_START" 2>/dev/null)
    ss_status=$?
    ss_context=$(printf '%s' "$ss_output" | node -e 'let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(String(JSON.parse(s||"{}").hookSpecificOutput?.additionalContext||""))}catch{}})' 2>/dev/null)
    rm -rf "$ss_home"
    if [ "$ss_status" -eq 0 ] && printf '%s' "$ss_context" | grep -qF "Team Harness workflow discovery" && printf '%s' "$ss_context" | grep -qF "/th:spec"; then
        assert_pass "SessionStart exposes workflow discovery"
    else
        assert_fail "SessionStart workflow discovery is missing"
    fi

    configured_home="$(mktemp -d)"
    mkdir -p "$configured_home/.claude"
    printf '%s' '{"language":"es","english_learning":true,"logs-mode":"obsidian","logs-path":"/vault/work","logs-subfolder":"work-logs"}' > "$configured_home/.claude/.team-harness.json"
    configured_output=$(printf '%s\n' "$ss_input" | HOME="$configured_home" USERPROFILE="$configured_home" node "$SESSION_START" 2>/dev/null)
    configured_context=$(printf '%s' "$configured_output" | node -e 'let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(String(JSON.parse(s||"{}").hookSpecificOutput?.additionalContext||""))}catch{}})' 2>/dev/null)
    rm -rf "$configured_home"
    if printf '%s' "$configured_context" | grep -qF "Spanish" && printf '%s' "$configured_context" | grep -qF "english-learning mode is active" && printf '%s' "$configured_context" | grep -qF "/vault/work/work-logs"; then
        assert_pass "SessionStart preserves configured language and workspace context"
    else
        assert_fail "SessionStart configured context is missing"
    fi
fi

echo "--- language and observation hook envelopes ---"
LANGUAGE_PROMPT="$DIST_DIR/language-user-prompt.cjs"
if [ -s "$LANGUAGE_PROMPT" ]; then
    lp_output=$(printf '%s\n' '{"type":"user_prompt","message":"hello"}' | node "$LANGUAGE_PROMPT" 2>/dev/null)
    if [ -z "$lp_output" ] || printf '%s' "$lp_output" | node -e 'let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{try{JSON.parse(s);process.exit(0)}catch{process.exit(1)}})' 2>/dev/null; then
        assert_pass "language-user-prompt emits an empty or valid JSON envelope"
    else
        assert_fail "language-user-prompt emits invalid output"
    fi
else
    assert_fail "language-user-prompt bundle unavailable"
fi

for observer in notify-stage.cjs subagent-trace.cjs precompact-snapshot.cjs; do
    if [ -s "$DIST_DIR/$observer" ]; then
        assert_pass "observation bundle remains available: $observer"
    else
        assert_fail "observation bundle unavailable: $observer"
    fi
done
