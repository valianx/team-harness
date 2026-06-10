#!/bin/bash
# tests/test_dev_guard.sh
# Behavioral tests for hooks/dev-guard.sh
# Suite 83 — dev-guard-default-nodecision
#
# Each case feeds a tool-call JSON payload to the hook together with
# a synthetic dev-mode marker (or no marker), then asserts whether the hook
# emits permissionDecision:"ask", "deny", "allow", or NO permissionDecision
# (no-decision — defer to the operator's normal permission flow).
#
# ANTI-FALSE-GREEN NOTE (Suite 83):
#   The default/fail-safe paths assert NO permissionDecision (assert_nodecision),
#   NOT "allow". Current (unfixed) code emits "allow" on these paths — those
#   assertions FAIL on current code by design (failing-first regression for #298).
#   Green on these assertions comes ONLY after the implementer's fix lands.
#
# Cases that STILL assert ask/allow on CURRENT code:
#   - Outward-action cases (git push, gh pr merge/review/comment) -> assert_ask
#   - Activation-write cases (printf/echo dev_mode: true > marker) -> assert_allow
#   - Marker-manipulation cases (rm <marker>) -> assert_ask
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

# assert_nodecision — PASS when the hook emits NO permissionDecision.
# This is the "defer to normal permission flow" contract (exit 0, empty stdout).
# Failing-first: current (unfixed) code emits "allow" on default paths, so these
# assertions FAIL until the implementer replaces the 4 default allow() calls with
# nodecision() (exit 0, empty stdout). See issue #298.
assert_nodecision() {
    local name="$1"
    local fake_home="$2"
    local payload="$3"
    local out
    out=$(run_hook "$fake_home" "$payload")
    if [ -z "$out" ] || ! echo "$out" | grep -q '"permissionDecision"'; then
        PASS=$((PASS + 1))
        echo "  [PASS] NODECISION: $name"
    else
        FAIL=$((FAIL + 1))
        FAILURES+=("NODECISION expected but got: $name | $out")
        echo "  [FAIL] NODECISION: $name (got: $out)"
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
# Cases WITHOUT marker (dev mode absent)
# FLIPPED from assert_allow to assert_nodecision (regression fix for #298).
# Current code: emits "allow" on all these paths (the bug — line :151 allow()).
# After fix: emits no permissionDecision (no-decision, defer to normal flow).
# ---------------------------------------------------------------------------

echo
echo "=== NODECISION all: no marker (dev mode absent) ==="

TMP=$(make_tmp_no_marker)
assert_nodecision "gh pr merge (no marker)" "$TMP" "$(make_payload 'gh pr merge 123 --squash')"
rm -rf "$TMP"

TMP=$(make_tmp_no_marker)
assert_nodecision "git push (no marker)" "$TMP" "$(make_payload 'git push origin main')"
rm -rf "$TMP"

TMP=$(make_tmp_no_marker)
assert_nodecision "gh pr review (no marker)" "$TMP" "$(make_payload 'gh pr review 42 --approve')"
rm -rf "$TMP"

TMP=$(make_tmp_no_marker)
assert_nodecision "curl api.github.com -X POST (no marker)" "$TMP" "$(make_payload 'curl -X POST https://api.github.com/repos/o/r/pulls/1/reviews -d "{}"')"
rm -rf "$TMP"

# Case 12 — NODECISION: innocent command with marker (git status)
# FLIPPED from assert_allow. Current code: emits "allow" at line :235.
# After fix: emits no permissionDecision (no-decision).
echo
echo "=== NODECISION: git status (innocent, with marker) ==="
TMP=$(make_tmp_with_marker)
assert_nodecision "git status (with marker)" "$TMP" "$(make_payload 'git status')"
rm -rf "$TMP"

# Case 13 — ANTI-SPOOF: marker with commented value must NOT be parsed as active
# A line "dev_mode: true # was false" — strict parse should match true (passes).
# A line "dev_mode: false # was true" — strict parse must NOT parse as active.
# FLIPPED from assert_allow. Current code: emits "allow" at line :137.
# After fix: emits no permissionDecision (marker content = dev_mode: false -> no-decision).
echo
echo "=== NODECISION: marker with 'dev_mode: false # was true' (anti-spoof, NOT active) ==="
TMP="$(mktemp -d)"
mkdir -p "$TMP/.claude"
printf 'dev_mode: false # was true\n' > "$TMP/.claude/.dev-mode-active"
assert_nodecision "anti-spoof: dev_mode: false # was true" "$TMP" "$(make_payload 'gh pr merge 123')"
rm -rf "$TMP"

# Case 14 — ASK: marker present-but-empty (treat as active, fail-CLOSED)
echo
echo "=== ASK: marker present but empty (fail-CLOSED, treat as active) ==="
TMP="$(mktemp -d)"
mkdir -p "$TMP/.claude"
printf '' > "$TMP/.claude/.dev-mode-active"
assert_ask "marker present but empty (fail-CLOSED)" "$TMP" "$(make_payload 'git push origin main')"
rm -rf "$TMP"

# Case 15 — NODECISION: innocent command (ls) with marker
# FLIPPED from assert_allow. Current code: emits "allow" at line :235.
# After fix: emits no permissionDecision (no-decision).
echo
echo "=== NODECISION: ls (innocent, with marker) ==="
TMP=$(make_tmp_with_marker)
assert_nodecision "ls (innocent, with marker)" "$TMP" "$(make_payload 'ls -la /tmp')"
rm -rf "$TMP"

# Case 16 — ALLOW: activation write (echo 'dev_mode: true' > marker) with marker present.
# An activation write arms MORE gating, so it must NOT prompt — this is what makes
# /dev-mode (re)activation reliable and friction-free. Regression guard: a previous
# version asked on any marker write, which could leave the marker unwritten on
# re-activation so new sessions silently lost dev mode.
# UNCHANGED — activation write STAYS allow.
echo
echo "=== ALLOW: echo 'dev_mode: true' > marker (activation write, with marker) ==="
TMP=$(make_tmp_with_marker)
assert_allow "activation write: echo dev_mode: true > marker" "$TMP" "$(make_payload "echo 'dev_mode: true' > $TMP/.claude/.dev-mode-active")"
rm -rf "$TMP"

# Case 17 — ALLOW: the exact /dev-mode skill activation command (printf 'dev_mode: true\n' > marker).
# UNCHANGED — activation write STAYS allow.
echo
echo "=== ALLOW: printf 'dev_mode: true' > marker (skill activation command, with marker) ==="
TMP=$(make_tmp_with_marker)
assert_allow "skill activation: printf dev_mode: true > marker" "$TMP" "$(make_payload "printf 'dev_mode: true\\n' > $TMP/.claude/.dev-mode-active")"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# Default-on assertions (v2.56.0)
# These cases verify that the gate behavior is UNCHANGED by the default-on
# model — the gate reads only the marker, never dev_mode_choice in
# .team-harness.json. The sentinel cannot be a gate-disable bypass.
# ---------------------------------------------------------------------------

# Case 18 — ASK: marker present + dev_mode_choice="off" in config -> still ASK
# The gate never reads .team-harness.json; sentinel "off" must not disarm it.
echo
echo "=== ASK: marker present + dev_mode_choice=off in config (sentinel not a gate bypass) ==="
TMP=$(make_tmp_with_marker)
# Write a fake .team-harness.json with dev_mode_choice: "off"
mkdir -p "$TMP/.claude"
printf '{"dev_mode_choice":"off","logs-mode":"local"}\n' > "$TMP/.claude/.team-harness.json"
assert_ask "marker present + sentinel off -> still ask (gate reads marker, not sentinel)" "$TMP" "$(make_payload 'git push origin main')"
rm -rf "$TMP"

# Case 19 — ALLOW: activation write on marker-absent machine (default-on setup/update path)
# /th:setup and /th:update write the marker via printf when dev_mode_choice != "off".
# This is the exact activation command that the update skill runs; it must be allowed.
# UNCHANGED — activation write STAYS allow.
echo
echo "=== ALLOW: activation write on marker-absent machine (default-on setup/update path) ==="
TMP=$(make_tmp_no_marker)
assert_allow "activation write on absent-marker (default-on install path)" "$TMP" "$(make_payload "printf 'dev_mode: true\n' > $TMP/.claude/.dev-mode-active")"
rm -rf "$TMP"

# Case 20 — NODECISION: dev_mode: false in marker file (inactive, regardless of sentinel)
# A marker that explicitly says dev_mode: false is treated as inactive.
# FLIPPED from assert_allow. Current code: emits "allow" at line :137.
# After fix: emits no permissionDecision (marker inactive -> no-decision).
echo
echo "=== NODECISION: marker present with dev_mode: false (explicit false -> inactive) ==="
TMP="$(mktemp -d)"
mkdir -p "$TMP/.claude"
printf 'dev_mode: false\n' > "$TMP/.claude/.dev-mode-active"
assert_nodecision "marker present with dev_mode: false (inactive)" "$TMP" "$(make_payload 'gh pr merge 123')"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# Failing-first regression cases for issue #298 (Suite 83)
# These cases reproduce the bug explicitly. They FAIL on current (unfixed)
# code and PASS only after the implementer's fix lands.
# ---------------------------------------------------------------------------

echo
echo "=== [#298 REGRESSION] Edit-shaped payload (no command field) -> NODECISION ==="

# AC-1: Edit-shaped payload with marker present — worst, dev-mode-independent path.
# Current code: cmd="" -> allow() at line :111-113. The hook auto-approves every
# file edit before it reads the marker, on every machine with the plugin installed.
TMP=$(make_tmp_with_marker)
assert_nodecision "#298 AC-1: Edit payload (no command), marker present" "$TMP" \
    '{"tool_name":"Edit","tool_input":{"file_path":"/tmp/app.py","old_string":"a","new_string":"b"}}'
rm -rf "$TMP"

# AC-1: Edit-shaped payload with no marker — same empty-cmd path, still fires.
TMP=$(make_tmp_no_marker)
assert_nodecision "#298 AC-1: Edit payload (no command), no marker" "$TMP" \
    '{"tool_name":"Edit","tool_input":{"file_path":"/tmp/app.py","old_string":"a","new_string":"b"}}'
rm -rf "$TMP"

echo
echo "=== [#298 REGRESSION] Write-shaped payload (no command field) -> NODECISION ==="

# AC-1: Write-shaped payload (no command field) — same empty-cmd path.
TMP=$(make_tmp_with_marker)
assert_nodecision "#298 AC-1: Write payload (no command), marker present" "$TMP" \
    '{"tool_name":"Write","tool_input":{"file_path":"/tmp/output.py","content":"print(1)"}}'
rm -rf "$TMP"

TMP=$(make_tmp_no_marker)
assert_nodecision "#298 AC-1: Write payload (no command), no marker" "$TMP" \
    '{"tool_name":"Write","tool_input":{"file_path":"/tmp/output.py","content":"print(1)"}}'
rm -rf "$TMP"

echo
echo "=== [#298 REGRESSION] Benign Bash, dev mode OFF (no marker) -> NODECISION ==="

# AC-2: Benign Bash, dev mode OFF (no marker).
# Current code: cmd non-empty -> reads marker -> absent -> allow() at line :151.
TMP=$(make_tmp_no_marker)
assert_nodecision "#298 AC-2: git status, no marker" "$TMP" "$(make_payload 'git status')"
rm -rf "$TMP"

TMP=$(make_tmp_no_marker)
assert_nodecision "#298 AC-2: ls -la, no marker" "$TMP" "$(make_payload 'ls -la /tmp')"
rm -rf "$TMP"

echo
echo "=== [#298 REGRESSION] Benign Bash, dev mode ON (marker present) -> NODECISION ==="

# AC-3: Benign Bash, dev mode ON, no outward action — falls through to line :235 allow().
TMP=$(make_tmp_with_marker)
assert_nodecision "#298 AC-3: git status, marker present" "$TMP" "$(make_payload 'git status')"
rm -rf "$TMP"

echo
echo "=== [#298 REGRESSION] dev_mode: false in marker + benign Bash -> NODECISION ==="

# dev_mode: false marker + benign Bash — current code: allow() at line :137.
TMP="$(mktemp -d)"
mkdir -p "$TMP/.claude"
printf 'dev_mode: false\n' > "$TMP/.claude/.dev-mode-active"
assert_nodecision "#298 dev_mode:false marker + git log" "$TMP" "$(make_payload 'git log --oneline -5')"
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
