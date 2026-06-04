#!/bin/bash
# tests/test_dev_guard.sh
# Behavioral tests for hooks/dev-guard.sh
# Each case feeds a Bash tool-call JSON payload to the hook together with
# a synthetic dev-mode marker (or no marker), then asserts whether the hook
# emits permissionDecision:"ask", "deny", or "allow".
#
# Usage:
#   ./tests/test_dev_guard.sh
# Exit code:
#   0 if all cases pass, 1 otherwise.

set -u

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOK="$REPO_ROOT/hooks/dev-guard.sh"

if [ ! -x "$HOOK" ]; then
    chmod +x "$HOOK"
fi

PASS=0
FAIL=0
declare -a FAILURES

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Create a temp dir with the dev-mode marker written.
# Prints the HOME override path. Caller must rm -rf it when done.
make_tmp_with_marker() {
    local tmp
    tmp="$(mktemp -d)"
    mkdir -p "$tmp/.claude"
    printf 'dev_mode: true\n' > "$tmp/.claude/.dev-mode-active"
    echo "$tmp"
}

# Create a temp dir with NO dev-mode marker.
make_tmp_no_marker() {
    local tmp
    tmp="$(mktemp -d)"
    mkdir -p "$tmp/.claude"
    echo "$tmp"
}

# Build the Bash tool-call JSON payload for a given command string.
make_payload() {
    local cmd="$1"
    # Use python3 for reliable JSON escaping if available, otherwise basic printf.
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

# Run the hook with HOME overridden; print stdout.
run_hook() {
    local fake_home="$1"
    local payload="$2"
    HOME="$fake_home" bash "$HOOK" <<< "$payload" 2>&1
}

assert_ask() {
    local name="$1"
    local fake_home="$2"
    local payload="$3"
    local out
    out=$(run_hook "$fake_home" "$payload")
    if echo "$out" | grep -q '"permissionDecision": *"ask"'; then
        PASS=$((PASS + 1))
        echo "  [PASS] ASK: $name"
    else
        FAIL=$((FAIL + 1))
        FAILURES+=("ASK expected but got: $name | output: ${out:-<empty>}")
        echo "  [FAIL] ASK: $name (got: ${out:-<empty>})"
    fi
}

assert_deny() {
    local name="$1"
    local fake_home="$2"
    local payload="$3"
    local out
    out=$(run_hook "$fake_home" "$payload")
    if echo "$out" | grep -q '"permissionDecision": *"deny"'; then
        PASS=$((PASS + 1))
        echo "  [PASS] DENY: $name"
    else
        FAIL=$((FAIL + 1))
        FAILURES+=("DENY expected but got: $name | output: ${out:-<empty>}")
        echo "  [FAIL] DENY: $name (got: ${out:-<empty>})"
    fi
}

assert_allow() {
    local name="$1"
    local fake_home="$2"
    local payload="$3"
    local out
    out=$(run_hook "$fake_home" "$payload")
    if echo "$out" | grep -q '"permissionDecision": *"allow"'; then
        PASS=$((PASS + 1))
        echo "  [PASS] ALLOW: $name"
    else
        FAIL=$((FAIL + 1))
        FAILURES+=("ALLOW expected but got: $name | output: ${out:-<empty>}")
        echo "  [FAIL] ALLOW: $name (got: ${out:-<empty>})"
    fi
}

# ---------------------------------------------------------------------------
# Cases WITH marker (dev mode active)
# ---------------------------------------------------------------------------

# Case 1 — ASK: gh pr merge
echo "=== ASK: gh pr merge (with marker) ==="
TMP=$(make_tmp_with_marker)
assert_ask "gh pr merge" "$TMP" "$(make_payload 'gh pr merge 123 --squash')"
rm -rf "$TMP"

# Case 2 — ASK: git push bare (the most important bypass — NOT covered by policy-block.sh)
echo
echo "=== ASK: git push bare (without --force, with marker) ==="
TMP=$(make_tmp_with_marker)
assert_ask "git push bare (no --force)" "$TMP" "$(make_payload 'git push origin feat/my-branch')"
rm -rf "$TMP"

# Case 3 — ASK: gh pr review
echo
echo "=== ASK: gh pr review (with marker) ==="
TMP=$(make_tmp_with_marker)
assert_ask "gh pr review --approve" "$TMP" "$(make_payload 'gh pr review 42 --approve')"
rm -rf "$TMP"

# Case 4 — ASK: gh pr comment
echo
echo "=== ASK: gh pr comment (with marker) ==="
TMP=$(make_tmp_with_marker)
assert_ask "gh pr comment" "$TMP" "$(make_payload 'gh pr comment 42 --body "LGTM"')"
rm -rf "$TMP"

# Case 5 — ASK: gh api -X PUT .../merge
echo
echo "=== ASK: gh api -X PUT .../merge (with marker) ==="
TMP=$(make_tmp_with_marker)
assert_ask "gh api -X PUT /pulls/merge" "$TMP" "$(make_payload 'gh api -X PUT /repos/owner/repo/pulls/42/merge')"
rm -rf "$TMP"

# Case 6 — ASK: curl -X POST api.github.com .../reviews
echo
echo "=== ASK: curl -X POST api.github.com reviews (with marker) ==="
TMP=$(make_tmp_with_marker)
assert_ask "curl -X POST api.github.com/reviews" "$TMP" "$(make_payload 'curl -X POST https://api.github.com/repos/owner/repo/pulls/42/reviews -d "{}"')"
rm -rf "$TMP"

# Case 7 — ASK: git -C <path> push
echo
echo "=== ASK: git -C <path> push (with marker) ==="
TMP=$(make_tmp_with_marker)
assert_ask "git -C /some/path push" "$TMP" "$(make_payload 'git -C /tmp/myrepo push origin main')"
rm -rf "$TMP"

# Case 8 — ASK: rm ~/.claude/.dev-mode-active (exit dev mode -> operator confirms)
echo
echo "=== ASK: rm ~/.claude/.dev-mode-active (marker manipulation -> ask, with marker) ==="
TMP=$(make_tmp_with_marker)
assert_ask "rm ~/.claude/.dev-mode-active" "$TMP" "$(make_payload "rm $TMP/.claude/.dev-mode-active")"
rm -rf "$TMP"

# Case 9 — ASK: > (redirect) to marker file
echo
echo "=== ASK: > redirect to .dev-mode-active (marker manipulation -> ask, with marker) ==="
TMP=$(make_tmp_with_marker)
assert_ask "redirect > .dev-mode-active" "$TMP" "$(make_payload "echo '' > $TMP/.claude/.dev-mode-active")"
rm -rf "$TMP"

# Case 10 — ASK: tee targeting marker file
echo
echo "=== ASK: tee .dev-mode-active (marker manipulation -> ask, with marker) ==="
TMP=$(make_tmp_with_marker)
assert_ask "tee .dev-mode-active" "$TMP" "$(make_payload "echo 'dev_mode: false' | tee $TMP/.claude/.dev-mode-active")"
rm -rf "$TMP"

# Case 10b — ASK (combined): rm marker && gh pr merge -> outward action checked before marker
echo
echo "=== ASK: rm marker && gh pr merge (combined -> outward ask first) ==="
TMP=$(make_tmp_with_marker)
assert_ask "combined rm marker && gh pr merge" "$TMP" "$(make_payload "rm $TMP/.claude/.dev-mode-active && gh pr merge 1")"
rm -rf "$TMP"

# Case 11 — ANTI-FORGE: agent echoes its own "authorisation" then tries gh pr merge
# The echo writes some file; the action that follows is a separate command.
# We test the gh pr merge portion — it must still ASK (gate does not read auth files).
echo
echo "=== ASK (anti-forge): echo auth-file then gh pr merge (still ASK, not allow) ==="
TMP=$(make_tmp_with_marker)
assert_ask "anti-forge: echo auth-file; gh pr merge" "$TMP" "$(make_payload 'echo authorized > /tmp/myauth.txt; gh pr merge 123 --squash')"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# Cases WITHOUT marker (dev mode absent — all ALLOW)
# ---------------------------------------------------------------------------

echo
echo "=== ALLOW all: no marker (dev mode absent) ==="

TMP=$(make_tmp_no_marker)
assert_allow "gh pr merge (no marker)" "$TMP" "$(make_payload 'gh pr merge 123 --squash')"
rm -rf "$TMP"

TMP=$(make_tmp_no_marker)
assert_allow "git push (no marker)" "$TMP" "$(make_payload 'git push origin main')"
rm -rf "$TMP"

TMP=$(make_tmp_no_marker)
assert_allow "gh pr review (no marker)" "$TMP" "$(make_payload 'gh pr review 42 --approve')"
rm -rf "$TMP"

TMP=$(make_tmp_no_marker)
assert_allow "curl api.github.com -X POST (no marker)" "$TMP" "$(make_payload 'curl -X POST https://api.github.com/repos/o/r/pulls/1/reviews -d "{}"')"
rm -rf "$TMP"

# Case 12 — ALLOW: innocent command with marker (git status)
echo
echo "=== ALLOW: git status (innocent, with marker) ==="
TMP=$(make_tmp_with_marker)
assert_allow "git status (with marker)" "$TMP" "$(make_payload 'git status')"
rm -rf "$TMP"

# Case 13 — ANTI-SPOOF: marker with commented value must NOT be parsed as active
# A line "dev_mode: true # was false" — strict parse should match true (passes).
# A line "dev_mode: false # was true" — strict parse must NOT parse as active.
echo
echo "=== ALLOW: marker with 'dev_mode: false # was true' (anti-spoof, NOT active) ==="
TMP="$(mktemp -d)"
mkdir -p "$TMP/.claude"
printf 'dev_mode: false # was true\n' > "$TMP/.claude/.dev-mode-active"
assert_allow "anti-spoof: dev_mode: false # was true" "$TMP" "$(make_payload 'gh pr merge 123')"
rm -rf "$TMP"

# Case 14 — ASK: marker present-but-empty (treat as active, fail-CLOSED)
echo
echo "=== ASK: marker present but empty (fail-CLOSED, treat as active) ==="
TMP="$(mktemp -d)"
mkdir -p "$TMP/.claude"
printf '' > "$TMP/.claude/.dev-mode-active"
assert_ask "marker present but empty (fail-CLOSED)" "$TMP" "$(make_payload 'git push origin main')"
rm -rf "$TMP"

# Case 15 — ALLOW: innocent command (ls) with marker
echo
echo "=== ALLOW: ls (innocent, with marker) ==="
TMP=$(make_tmp_with_marker)
assert_allow "ls (innocent, with marker)" "$TMP" "$(make_payload 'ls -la /tmp')"
rm -rf "$TMP"

# Case 16 — ALLOW: activation write (echo 'dev_mode: true' > marker) with marker present.
# An activation write arms MORE gating, so it must NOT prompt — this is what makes
# /dev-mode (re)activation reliable and friction-free. Regression guard: a previous
# version asked on any marker write, which could leave the marker unwritten on
# re-activation so new sessions silently lost dev mode.
echo
echo "=== ALLOW: echo 'dev_mode: true' > marker (activation write, with marker) ==="
TMP=$(make_tmp_with_marker)
assert_allow "activation write: echo dev_mode: true > marker" "$TMP" "$(make_payload "echo 'dev_mode: true' > $TMP/.claude/.dev-mode-active")"
rm -rf "$TMP"

# Case 17 — ALLOW: the exact /dev-mode skill activation command (printf 'dev_mode: true\n' > marker).
echo
echo "=== ALLOW: printf 'dev_mode: true' > marker (skill activation command, with marker) ==="
TMP=$(make_tmp_with_marker)
assert_allow "skill activation: printf dev_mode: true > marker" "$TMP" "$(make_payload "printf 'dev_mode: true\\n' > $TMP/.claude/.dev-mode-active")"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo
echo "============================================================"
echo "  dev-guard tests: $PASS passed / $((PASS + FAIL)) total"
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
