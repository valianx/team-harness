#!/bin/bash
# tests/test_prepublish_guard.sh
# Functional tests for hooks/ts/bodies/prepublish-guard.ts (compiled to
# hooks/ts/dist/prepublish-guard.cjs — the TS body is the single source of
# gate logic post hook Bash->TS cutover, issue #446).
#
# Scope — Check 2 (gh pr create / prepublish_check command execution):
#   command-routing, no-config fault-path, passing/failing command outcomes,
#   CWE-209 (captured output must never leak into the deny reason),
#   the SEC-DR-A control-char guard, and deny-JSON shape validation.
#   Check 1 (git push / bump-floor / over-bump / stray-bump) has its own
#   dedicated real-git-fixture suite: test_prepublish_bump_floor.sh. This
#   suite covers only the minimal Check 1 routing sanity case (non-git
#   directory → fail-open) that the fixture suite does not exercise.
#
# Tests the block-on-condition / open-on-fault contract:
#   - "deny" cases must produce JSON with permissionDecision: "deny"
#   - "nodecision" cases must produce empty stdout (hook passes through)
#
# Usage:
#   ./tests/test_prepublish_guard.sh
# Exit code:
#   0 if all cases pass, 1 otherwise.

set -u

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOK="$REPO_ROOT/hooks/ts/dist/prepublish-guard.cjs"

if [ ! -f "$HOOK" ]; then
    echo "ERROR: $HOOK not found — run 'npm --prefix hooks/ts run build'"
    exit 1
fi

_exec_hook() {
    node "$HOOK"
}

PASS=0
FAIL=0
declare -a FAILURES

# ---------------------------------------------------------------------------
# Assertion helpers
# ---------------------------------------------------------------------------

assert_deny() {
    local name="$1"
    local payload="$2"
    local out
    out=$(echo "$payload" | _exec_hook 2>/dev/null)
    if echo "$out" | grep -qE '"permissionDecision":[[:space:]]*"deny"'; then
        PASS=$((PASS + 1))
        echo "  [PASS] DENY: $name"
    else
        FAIL=$((FAIL + 1))
        FAILURES+=("DENY expected but got nodecision: $name | output: ${out:-<empty>}")
        echo "  [FAIL] DENY: $name (got: ${out:-<empty>})"
    fi
}

assert_nodecision() {
    local name="$1"
    local payload="$2"
    local out
    out=$(echo "$payload" | _exec_hook 2>/dev/null)
    if [ -z "$out" ]; then
        PASS=$((PASS + 1))
        echo "  [PASS] NODECISION: $name"
    else
        FAIL=$((FAIL + 1))
        FAILURES+=("NODECISION expected but got output: $name | output: $out")
        echo "  [FAIL] NODECISION: $name (got: $out)"
    fi
}

assert_deny_reason_absent() {
    # Verifies that the given string does NOT appear in the deny reason.
    # Used for CWE-209: test command output must not be in permissionDecisionReason.
    local name="$1"
    local payload="$2"
    local forbidden="$3"
    local out
    out=$(echo "$payload" | _exec_hook 2>/dev/null)
    if echo "$out" | grep -q "permissionDecisionReason" && echo "$out" | grep -qF "$forbidden"; then
        FAIL=$((FAIL + 1))
        FAILURES+=("CWE-209: forbidden string found in deny reason: $name | forbidden: $forbidden")
        echo "  [FAIL] CWE-209: $name — found forbidden string in reason"
    else
        PASS=$((PASS + 1))
        echo "  [PASS] CWE-209-absent: $name"
    fi
}

# ---------------------------------------------------------------------------
# Helper: build a fake ~/.claude/.team-harness.json with a prepublish_check key
# ---------------------------------------------------------------------------

FAKE_CONFIG_DIR=$(mktemp -d)
mkdir -p "$FAKE_CONFIG_DIR/.claude"
FAKE_CONFIG="$FAKE_CONFIG_DIR/.claude/.team-harness.json"

cleanup() {
    rm -rf "$FAKE_CONFIG_DIR"
}
trap cleanup EXIT

write_fake_config() {
    local cmd="$1"
    cat > "$FAKE_CONFIG" <<EOF
{
  "prepublish_check": "$cmd"
}
EOF
}

# The hook reads from os.homedir()/.claude/.team-harness.json — override HOME
# to point at our temp dir (os.homedir() resolves via $HOME on POSIX).
export HOME="$FAKE_CONFIG_DIR"

# ---------------------------------------------------------------------------
# Suite: command routing — non-Bash tool_name → nodecision
# ---------------------------------------------------------------------------

echo "=== Non-Bash tool_name → nodecision (hook must not intervene) ==="

assert_nodecision "Write tool" \
    '{"tool_name":"Write","tool_input":{"file_path":"/tmp/foo.txt","content":"x"}}'

assert_nodecision "Edit tool" \
    '{"tool_name":"Edit","tool_input":{"file_path":"/tmp/foo.txt","old_string":"a","new_string":"b"}}'

assert_nodecision "Task tool" \
    '{"tool_name":"Task","tool_input":{"description":"do something"}}'

assert_nodecision "Read tool" \
    '{"tool_name":"Read","tool_input":{"file_path":"/tmp/foo.txt"}}'

# ---------------------------------------------------------------------------
# Suite: command routing — Bash but neither git push nor gh pr create → nodecision
# ---------------------------------------------------------------------------

echo
echo "=== Bash non-push/non-pr commands → nodecision (hook must pass through) ==="

assert_nodecision "git status" \
    '{"tool_name":"Bash","tool_input":{"command":"git status"}}'

assert_nodecision "git commit" \
    '{"tool_name":"Bash","tool_input":{"command":"git commit -m msg"}}'

assert_nodecision "git log" \
    '{"tool_name":"Bash","tool_input":{"command":"git log --oneline"}}'

assert_nodecision "gh pr list" \
    '{"tool_name":"Bash","tool_input":{"command":"gh pr list"}}'

assert_nodecision "gh pr view" \
    '{"tool_name":"Bash","tool_input":{"command":"gh pr view 123"}}'

assert_nodecision "gh pr merge" \
    '{"tool_name":"Bash","tool_input":{"command":"gh pr merge 123"}}'

assert_nodecision "npm publish" \
    '{"tool_name":"Bash","tool_input":{"command":"npm publish"}}'

assert_nodecision "arbitrary bash" \
    '{"tool_name":"Bash","tool_input":{"command":"ls -la"}}'

# ---------------------------------------------------------------------------
# Suite: Check 2 — no prepublish_check config key → nodecision (fail-open)
# ---------------------------------------------------------------------------

echo
echo "=== Check 2: no prepublish_check config → nodecision (fail-open) ==="

# Write a config WITHOUT prepublish_check
cat > "$FAKE_CONFIG" <<'EOF'
{
  "logs_mode": "local"
}
EOF

assert_nodecision "gh pr create — no prepublish_check in config" \
    '{"tool_name":"Bash","tool_input":{"command":"gh pr create --title x --body y"}}'

assert_nodecision "gh pr create --base main — no prepublish_check in config" \
    '{"tool_name":"Bash","tool_input":{"command":"gh pr create --base main --title x"}}'

# ---------------------------------------------------------------------------
# Suite: Check 2 — no config file at all → nodecision (fail-open)
# ---------------------------------------------------------------------------

echo
echo "=== Check 2: config file absent → nodecision (fail-open) ==="

rm -f "$FAKE_CONFIG"

assert_nodecision "gh pr create — config file missing" \
    '{"tool_name":"Bash","tool_input":{"command":"gh pr create --title x"}}'

# Restore a baseline config for subsequent tests
write_fake_config "true"

# ---------------------------------------------------------------------------
# Suite: Check 2 — passing command → nodecision (gate cleared)
# ---------------------------------------------------------------------------

echo
echo "=== Check 2: passing prepublish_check → nodecision (gate cleared) ==="

write_fake_config "true"
assert_nodecision "gh pr create — prepublish_check passes (exit 0)" \
    '{"tool_name":"Bash","tool_input":{"command":"gh pr create --title x"}}'

write_fake_config "echo ok"
assert_nodecision "gh pr create — prepublish_check echoes and exits 0" \
    '{"tool_name":"Bash","tool_input":{"command":"gh pr create --title x"}}'

# ---------------------------------------------------------------------------
# Suite: Check 2 — failing command → deny
# ---------------------------------------------------------------------------

echo
echo "=== Check 2: failing prepublish_check → deny ==="

write_fake_config "false"
assert_deny "gh pr create — prepublish_check fails (exit 1)" \
    '{"tool_name":"Bash","tool_input":{"command":"gh pr create --title x"}}'

write_fake_config "exit 2"
assert_deny "gh pr create — prepublish_check exits 2" \
    '{"tool_name":"Bash","tool_input":{"command":"gh pr create --title x"}}'

write_fake_config "exit 42"
assert_deny "gh pr create — prepublish_check exits 42" \
    '{"tool_name":"Bash","tool_input":{"command":"gh pr create --title x"}}'

# Failing command that produces output — that output must NOT leak into deny reason (CWE-209).
# CWE-209 contract: the hook puts the COMMAND string in the reason (auditable), but the
# captured STDOUT/STDERR of the command must NOT appear. To verify this, we need a marker
# that appears only in the command's output, not in the command string itself.
# We do this by writing the marker to a temp file and having the command cat it — the command
# string does not contain the marker, but the command's output does.
UNIQUE_MARKER="SUPER_SECRET_OUTPUT_MARKER_$$"
MARKER_FILE=$(mktemp)
printf '%s' "$UNIQUE_MARKER" > "$MARKER_FILE"
write_fake_config "cat $MARKER_FILE; exit 1"

assert_deny "gh pr create — failing command with output → deny (CWE-209 check)" \
    '{"tool_name":"Bash","tool_input":{"command":"gh pr create --title x"}}'

# The deny reason SHOULD contain the command string (auditable trace) but must NOT
# contain the command's captured output (CWE-209).
assert_deny_reason_absent "CWE-209: captured output must NOT appear in deny reason" \
    '{"tool_name":"Bash","tool_input":{"command":"gh pr create --title x"}}' \
    "$UNIQUE_MARKER"

rm -f "$MARKER_FILE"

# ---------------------------------------------------------------------------
# Suite: Check 2 — control-char guard → nodecision (SEC-DR-A)
# ---------------------------------------------------------------------------

echo
echo "=== Check 2: control-char in prepublish_check → nodecision (SEC-DR-A fail-open) ==="

# Write a config where the command value contains a control character (NUL / newline injection)
# We use a Python one-liner to embed a control char into the JSON
python3 -c "
import json, os
cfg = {'prepublish_check': 'echo ok\x01; evil'}
with open(os.environ['HOME'] + '/.claude/.team-harness.json', 'w') as f:
    json.dump(cfg, f)
" 2>/dev/null

if [ $? -eq 0 ]; then
    assert_nodecision "gh pr create — control char in prepublish_check → fail-open" \
        '{"tool_name":"Bash","tool_input":{"command":"gh pr create --title x"}}'
else
    echo "  [SKIP] control-char test: python3 not available for config write"
fi

# Restore clean config for subsequent tests
write_fake_config "true"

# ---------------------------------------------------------------------------
# Suite: Check 2 — deny reason is valid JSON
# ---------------------------------------------------------------------------

echo
echo "=== Check 2: deny reason is valid JSON ==="

write_fake_config "false"
_deny_out=$(echo '{"tool_name":"Bash","tool_input":{"command":"gh pr create --title x"}}' \
    | _exec_hook 2>/dev/null)

if echo "$_deny_out" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null; then
    PASS=$((PASS + 1))
    echo "  [PASS] DENY output is valid JSON"
else
    FAIL=$((FAIL + 1))
    FAILURES+=("deny output is not valid JSON: ${_deny_out:-<empty>}")
    echo "  [FAIL] DENY output is not valid JSON (got: ${_deny_out:-<empty>})"
fi

if echo "$_deny_out" | python3 -c "
import sys, json
d = json.load(sys.stdin)
# The hook emits hookSpecificOutput wrapping the decision fields (Claude Code contract).
if 'hookSpecificOutput' in d:
    inner = d['hookSpecificOutput']
    assert inner.get('permissionDecision') == 'deny', 'permissionDecision must be deny'
    assert 'permissionDecisionReason' in inner, 'permissionDecisionReason required'
elif 'permissionDecision' in d:
    # flat format also acceptable
    assert d['permissionDecision'] == 'deny', 'permissionDecision must be deny'
else:
    raise AssertionError('neither hookSpecificOutput nor permissionDecision found')
" 2>/dev/null; then
    PASS=$((PASS + 1))
    echo "  [PASS] DENY JSON has required fields (permissionDecision=deny)"
else
    FAIL=$((FAIL + 1))
    FAILURES+=("deny JSON missing required fields: ${_deny_out:-<empty>}")
    echo "  [FAIL] DENY JSON missing required fields (got: ${_deny_out:-<empty>})"
fi

# ---------------------------------------------------------------------------
# Suite: git push non-matching patterns → nodecision
# (Check 1 real-git-fixture cases live in test_prepublish_bump_floor.sh; this
# suite only covers the minimal routing/fault-path sanity check below.)
# ---------------------------------------------------------------------------

echo
echo "=== git push routing (non-git directory — Check 1 fault-path sanity) ==="

# In a non-git or no-origin-main environment the hook should fail-open (nodecision).
# This tests the fault-path contracts for Check 1.
# We run from a temp dir that is NOT a git repo — hook must nodecision.
_tmp_non_git=$(mktemp -d)
_result=$(cd "$_tmp_non_git" && echo '{"tool_name":"Bash","tool_input":{"command":"git push origin main"}}' \
    | _exec_hook 2>/dev/null)
rm -rf "$_tmp_non_git"

if [ -z "$_result" ]; then
    PASS=$((PASS + 1))
    echo "  [PASS] git push from non-git dir → nodecision (fault-open for no git worktree)"
else
    # If deny is returned, the hook incorrectly blocked outside a git worktree
    if echo "$_result" | grep -qE '"permissionDecision":[[:space:]]*"deny"'; then
        FAIL=$((FAIL + 1))
        FAILURES+=("git push from non-git dir must nodecision but got deny")
        echo "  [FAIL] git push from non-git dir → should be nodecision but got deny"
    else
        PASS=$((PASS + 1))
        echo "  [PASS] git push from non-git dir → non-deny output (acceptable)"
    fi
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

echo
echo "============================================================"
echo "  prepublish-guard behavioral tests: $PASS passed / $((PASS + FAIL)) total"
echo "============================================================"

if [ "$FAIL" -gt 0 ]; then
    echo
    echo "Failures:"
    for f in "${FAILURES[@]+"${FAILURES[@]}"}"; do
        echo "  - $f"
    done
    exit 1
fi

exit 0
