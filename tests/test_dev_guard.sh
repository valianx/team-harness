#!/bin/bash
# tests/test_dev_guard.sh
# Behavioral tests for hooks/dev-guard.sh
# Suite 83 — dev-guard-default-nodecision
#
# SEC-DR-2 re-founding (v2.89.0): the gate is UNCONDITIONAL — no filesystem
# marker is read. Covered outward actions (git push, gh pr merge/review/comment,
# gh api mutating PR endpoints, curl/wget to api.github.com, ClickUp MCP writes)
# always produce ASK regardless of any marker or configuration file.
# Non-covered actions always produce NODECISION.
#
# Cases:
#   - Outward-action cases (git push, gh pr merge/review/comment) -> assert_ask (always)
#   - Marker manipulation (rm .dev-mode-active etc.) -> assert_nodecision (not covered)
#   - Non-covered / benign Bash -> assert_nodecision (always)
#   - Edit/Write payloads (no command field) -> assert_nodecision (always)
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

# Create a temp dir with NO filesystem state (unconditional gate needs no marker).
make_tmp() {
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

# assert_nodecision — PASS when the hook emits NO permissionDecision.
# This is the "defer to normal permission flow" contract (exit 0, empty stdout).
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
# Outward-action cases — gate is UNCONDITIONAL (no marker required or read)
# SEC-DR-2 re-founding: these all produce ASK regardless of filesystem state.
# ---------------------------------------------------------------------------

# Case 1 — ASK: gh pr merge
echo "=== ASK: gh pr merge (unconditional, no marker) ==="
TMP=$(make_tmp)
assert_ask "gh pr merge" "$TMP" "$(make_payload 'gh pr merge 123 --squash')"
rm -rf "$TMP"

# Case 2 — ASK: git push bare
echo
echo "=== ASK: git push bare (unconditional, no marker) ==="
TMP=$(make_tmp)
assert_ask "git push bare (no --force)" "$TMP" "$(make_payload 'git push origin feat/my-branch')"
rm -rf "$TMP"

# Case 3 — ASK: gh pr review
echo
echo "=== ASK: gh pr review (unconditional, no marker) ==="
TMP=$(make_tmp)
assert_ask "gh pr review --approve" "$TMP" "$(make_payload 'gh pr review 42 --approve')"
rm -rf "$TMP"

# Case 4 — ASK: gh pr comment
echo
echo "=== ASK: gh pr comment (unconditional, no marker) ==="
TMP=$(make_tmp)
assert_ask "gh pr comment" "$TMP" "$(make_payload 'gh pr comment 42 --body "LGTM"')"
rm -rf "$TMP"

# Case 5 — ASK: gh api -X PUT .../merge
echo
echo "=== ASK: gh api -X PUT .../merge (unconditional, no marker) ==="
TMP=$(make_tmp)
assert_ask "gh api -X PUT /pulls/merge" "$TMP" "$(make_payload 'gh api -X PUT /repos/owner/repo/pulls/42/merge')"
rm -rf "$TMP"

# Case 6 — ASK: curl -X POST api.github.com .../reviews
echo
echo "=== ASK: curl -X POST api.github.com reviews (unconditional, no marker) ==="
TMP=$(make_tmp)
assert_ask "curl -X POST api.github.com/reviews" "$TMP" "$(make_payload 'curl -X POST https://api.github.com/repos/owner/repo/pulls/42/reviews -d "{}"')"
rm -rf "$TMP"

# Case 7 — ASK: git -C <path> push
echo
echo "=== ASK: git -C <path> push (unconditional, no marker) ==="
TMP=$(make_tmp)
assert_ask "git -C /some/path push" "$TMP" "$(make_payload 'git -C /tmp/myrepo push origin main')"
rm -rf "$TMP"

# Case 7b — ASK: git push with .team-harness.json dev_mode_choice=off present
# The gate never reads .team-harness.json; the config must not disarm it.
echo
echo "=== ASK: git push with dev_mode_choice=off in config (config not a gate bypass) ==="
TMP=$(make_tmp)
printf '{"dev_mode_choice":"off","logs-mode":"local"}\n' > "$TMP/.claude/.team-harness.json"
assert_ask "git push with dev_mode_choice=off (config not a gate bypass)" "$TMP" "$(make_payload 'git push origin main')"
rm -rf "$TMP"

# Case 7c — ASK: gh pr merge with dev_mode_choice=off in config (same bypass guard)
echo
echo "=== ASK: gh pr merge with dev_mode_choice=off in config (config not a gate bypass) ==="
TMP=$(make_tmp)
printf '{"dev_mode_choice":"off","logs-mode":"local"}\n' > "$TMP/.claude/.team-harness.json"
assert_ask "gh pr merge with dev_mode_choice=off (config not a gate bypass)" "$TMP" "$(make_payload 'gh pr merge 99 --squash')"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# Marker-manipulation cases — NOT covered by the gate (SEC-DR-2 re-founding)
# The gate covers outward actions by DESTINATION. Writing/deleting files in
# ~/.claude/ is not an outward action. These produce NODECISION.
# ---------------------------------------------------------------------------

# Case 8 — NODECISION: rm ~/.claude/.dev-mode-active
# The marker file no longer exists as of v2.89.0; this is a benign rm of an
# absent path. Gate does not cover it.
echo
echo "=== NODECISION: rm ~/.claude/.dev-mode-active (not a covered outward action) ==="
TMP=$(make_tmp)
assert_nodecision "rm ~/.claude/.dev-mode-active (not covered)" "$TMP" "$(make_payload "rm -f $TMP/.claude/.dev-mode-active")"
rm -rf "$TMP"

# Case 9 — NODECISION: > (redirect) to marker file location
echo
echo "=== NODECISION: > redirect to .dev-mode-active path (not covered) ==="
TMP=$(make_tmp)
assert_nodecision "redirect > .dev-mode-active (not covered)" "$TMP" "$(make_payload "echo '' > $TMP/.claude/.dev-mode-active")"
rm -rf "$TMP"

# Case 10 — NODECISION: tee targeting former marker file
echo
echo "=== NODECISION: tee .dev-mode-active (not a covered outward action) ==="
TMP=$(make_tmp)
assert_nodecision "tee .dev-mode-active (not covered)" "$TMP" "$(make_payload "echo 'content' | tee $TMP/.claude/.dev-mode-active")"
rm -rf "$TMP"

# Case 11 — ASK (anti-forge): agent echoes "authorisation" then tries gh pr merge
# The echo writes some file; the action that follows is a separate command.
# We test the gh pr merge portion — it must still ASK (gate does not read auth files).
echo
echo "=== ASK (anti-forge): echo auth-file then gh pr merge (still ASK, not nodecision) ==="
TMP=$(make_tmp)
assert_ask "anti-forge: echo auth-file; gh pr merge" "$TMP" "$(make_payload 'echo authorized > /tmp/myauth.txt; gh pr merge 123 --squash')"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# Non-covered / benign Bash cases — always NODECISION
# ---------------------------------------------------------------------------

# Case 12 — NODECISION: innocent command (git status)
echo
echo "=== NODECISION: git status (innocent, no outward action) ==="
TMP=$(make_tmp)
assert_nodecision "git status (innocent)" "$TMP" "$(make_payload 'git status')"
rm -rf "$TMP"

# Case 15 — NODECISION: ls (innocent)
echo
echo "=== NODECISION: ls (innocent) ==="
TMP=$(make_tmp)
assert_nodecision "ls (innocent)" "$TMP" "$(make_payload 'ls -la /tmp')"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# Failing-first regression cases for issue #298 (Suite 83)
# These cases reproduce the bug explicitly. They FAIL on current (unfixed)
# code and PASS only after the implementer's fix lands.
# ---------------------------------------------------------------------------

echo
echo "=== [#298 REGRESSION] Edit-shaped payload (no command field) -> NODECISION ==="

# AC-1: Edit-shaped payload — no "command" field, so cmd is empty -> nodecision.
# Current code (unfixed): cmd="" -> allow() at line :111-113.
TMP=$(make_tmp)
assert_nodecision "#298 AC-1: Edit payload (no command)" "$TMP" \
    '{"tool_name":"Edit","tool_input":{"file_path":"/tmp/app.py","old_string":"a","new_string":"b"}}'
rm -rf "$TMP"

echo
echo "=== [#298 REGRESSION] Write-shaped payload (no command field) -> NODECISION ==="

# AC-1: Write-shaped payload (no command field) — same empty-cmd path.
TMP=$(make_tmp)
assert_nodecision "#298 AC-1: Write payload (no command)" "$TMP" \
    '{"tool_name":"Write","tool_input":{"file_path":"/tmp/output.py","content":"print(1)"}}'
rm -rf "$TMP"

echo
echo "=== [#298 REGRESSION] Outward actions — ASK unconditionally (SEC-DR-2 re-founding) ==="

# AC-2 (re-founded): Outward actions are ASK regardless of any filesystem state.
# Old test: assert_nodecision for outward actions "without marker" (gate was marker-gated).
# New test: assert_ask (gate is unconditional, no marker needed or read).
TMP=$(make_tmp)
assert_ask "#298 AC-2 (re-founded): gh pr merge, no config" "$TMP" "$(make_payload 'gh pr merge 123 --squash')"
rm -rf "$TMP"

TMP=$(make_tmp)
assert_ask "#298 AC-2 (re-founded): git push, no config" "$TMP" "$(make_payload 'git push origin main')"
rm -rf "$TMP"

TMP=$(make_tmp)
assert_ask "#298 AC-2 (re-founded): gh pr review, no config" "$TMP" "$(make_payload 'gh pr review 42 --approve')"
rm -rf "$TMP"

TMP=$(make_tmp)
assert_ask "#298 AC-2 (re-founded): curl api.github.com -X POST, no config" "$TMP" "$(make_payload 'curl -X POST https://api.github.com/repos/o/r/pulls/1/reviews -d "{}"')"
rm -rf "$TMP"

echo
echo "=== [#298 REGRESSION] Benign Bash -> NODECISION (always) ==="

# AC-3: Benign Bash — no outward action, always nodecision.
TMP=$(make_tmp)
assert_nodecision "#298 AC-3: git status" "$TMP" "$(make_payload 'git status')"
rm -rf "$TMP"

TMP=$(make_tmp)
assert_nodecision "#298 AC-3: git log --oneline" "$TMP" "$(make_payload 'git log --oneline -5')"
rm -rf "$TMP"

TMP=$(make_tmp)
assert_nodecision "#298 AC-3: ls -la" "$TMP" "$(make_payload 'ls -la /tmp')"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# GraphQL PR-mutation gate cases (SEC-001 remediation, Suite 83 extension)
# These three cases verify the 2e-bis branch added to close the gap where
# gh api graphql PR-write mutations fell through to nodecision.
# ---------------------------------------------------------------------------

# Case SEC-001-A — ASK: resolveReviewThread mutation
echo
echo "=== ASK: gh api graphql resolveReviewThread mutation (SEC-001 gate) ==="
TMP=$(make_tmp)
assert_ask "gh api graphql resolveReviewThread" "$TMP" "$(make_payload \
    "gh api graphql -f query='mutation(\$threadId: ID!) { resolveReviewThread(input: { threadId: \$threadId }) { thread { id isResolved } } }' -F threadId=PRRT_x")"
rm -rf "$TMP"

# Case SEC-001-B — ASK: addPullRequestReviewThreadReply mutation
echo
echo "=== ASK: gh api graphql addPullRequestReviewThreadReply mutation (SEC-001 gate) ==="
TMP=$(make_tmp)
assert_ask "gh api graphql addPullRequestReviewThreadReply" "$TMP" "$(make_payload \
    "gh api graphql -f query='mutation(\$t: ID!, \$b: String!) { addPullRequestReviewThreadReply(input: {pullRequestReviewThreadId: \$t, body: \$b}) { comment { id } } }' -F t=PRRT_x -f b=hi")"
rm -rf "$TMP"

# Case SEC-001-C — NODECISION: read-only reviewThreads listing query must NOT gate
echo
echo "=== NODECISION: gh api graphql reviewThreads listing (read-only, must not gate) ==="
TMP=$(make_tmp)
assert_nodecision "gh api graphql reviewThreads read-only listing" "$TMP" "$(make_payload \
    "gh api graphql -f query='query { repository(owner:\"o\", name:\"r\") { pullRequest(number:1) { reviewThreads(first:100) { nodes { id isResolved } } } } }'")"
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
