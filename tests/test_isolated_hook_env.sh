#!/bin/bash
# tests/test_isolated_hook_env.sh
# Suite 84 — isolated-hook-env-harness
#
# Clean-environment functional harness for the plugin's PreToolUse hook chain.
# Issue #298 reinforcement: proves the plugin's wired hook chain defers on
# non-covered paths in an environment with zero personal-config bleed.
#
# SCOPE — CAN prove (deterministic in headless CI):
#   - The wired hook chain (policy-block.sh + dev-guard.sh), resolved from
#     .claude-plugin/hooks.json, defers (emits no permissionDecision) on
#     non-covered paths in a clean HOME.
#   - An Edit/Write payload (no command field) with dev mode OFF is NOT
#     auto-approved — the exact #298 signal.
#   - Edit/Write payloads are routed only to policy-block.sh per the
#     Bash|Write|Edit|NotebookEdit matcher, never to dev-guard.sh (Bash only).
#   - Covered outward actions with dev mode ON produce "ask".
#   - Destructive Bash produces "deny" (policy-block.sh deny path).
#
# CANNOT prove (out of CI reach):
#   - That Claude Code's real GUI permission dialog renders when the chain
#     defers. Headless CI has no dialog surface. The harness asserts only on
#     the hook's deterministic emitted decision, which is the controllable
#     proxy. "Hook defers → operator's normal flow prompts" is a Claude Code
#     runtime contract the harness relies on but does not itself exercise.
#   - The exact ordering/short-circuit semantics of Claude Code's multi-hook
#     chain in production. This harness uses a documented minimal emulation:
#     manifest order, first-decision-wins, else defer.
#
# Design property: FAILS on pre-#298 dev-guard.sh (default allow) and
# PASSES on the fixed (≥v2.71.x) code.
#
# Chain emulation semantics:
#   - Hooks are resolved from .claude-plugin/hooks.json PreToolUse matchers.
#   - For each tool payload, only the hooks whose matcher matches the
#     tool_name are invoked (Bash|Write|Edit|NotebookEdit vs Bash).
#   - Hooks for a matched entry run in manifest order.
#   - First hook to emit a permissionDecision wins; remaining hooks are skipped.
#   - If no hook emits a permissionDecision, the chain decision is defer.
#
# Cross-platform:
#   - mktemp -d (available on Git Bash, macOS, Linux; no GNU-only flags)
#   - ${HOME} override on each invocation line (scripts read ${HOME} directly)
#   - Scripts invoked via `bash <script>` (no exec-bit reliance)
#   - Temp dirs cleaned up via trap

set -u

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOKS_JSON="$REPO_ROOT/.claude-plugin/hooks.json"

if [ ! -f "$HOOKS_JSON" ]; then
    echo "ERROR: .claude-plugin/hooks.json not found at $HOOKS_JSON"
    exit 1
fi

PASS=0
FAIL=0
declare -a FAILURES

# ---------------------------------------------------------------------------
# Cleanup: remove all temp dirs on exit
# ---------------------------------------------------------------------------
declare -a CLEANUP_DIRS

cleanup_all() {
    for d in "${CLEANUP_DIRS[@]+"${CLEANUP_DIRS[@]}"}"; do
        rm -rf "$d" 2>/dev/null || true
    done
}
trap cleanup_all EXIT

make_clean_home() {
    local tmp
    tmp="$(mktemp -d)"
    mkdir -p "$tmp/.claude"
    CLEANUP_DIRS+=("$tmp")
    echo "$tmp"
}

make_home_with_marker() {
    local tmp
    tmp="$(make_clean_home)"
    printf 'dev_mode: true\n' > "$tmp/.claude/.dev-mode-active"
    echo "$tmp"
}

# ---------------------------------------------------------------------------
# Parse hook command lists from .claude-plugin/hooks.json
#
# Returns the ordered list of hook script paths for a given PreToolUse matcher.
# The harness resolves from the SAME manifest the plugin ships, so a future
# hook added to a matcher is picked up automatically.
#
# Usage: get_hooks_for_matcher <matcher_string>
#   matcher_string — the exact "matcher" value in hooks.json (e.g. "Bash" or
#                    "Bash|Write|Edit|NotebookEdit")
# Output: one absolute hook script path per line
# ---------------------------------------------------------------------------
get_hooks_for_matcher() {
    local matcher="$1"
    if command -v python3 >/dev/null 2>&1; then
        python3 - "$HOOKS_JSON" "$matcher" "$REPO_ROOT" <<'PYEOF'
import json, sys, os, re

hooks_json_path = sys.argv[1]
target_matcher  = sys.argv[2]
repo_root       = sys.argv[3]

with open(hooks_json_path) as f:
    data = json.load(f)

plugin_root_placeholder = "${CLAUDE_PLUGIN_ROOT}"

for entry in data.get("hooks", {}).get("PreToolUse", []):
    if entry.get("matcher") == target_matcher:
        for hook in entry.get("hooks", []):
            cmd = hook.get("command", "")
            # Replace ${CLAUDE_PLUGIN_ROOT} with repo_root (our local checkout)
            cmd = cmd.replace(plugin_root_placeholder, repo_root)
            # Extract the script path (last space-separated token after "bash ")
            parts = cmd.strip().split()
            if len(parts) >= 2 and parts[0] == "bash":
                print(parts[1])
PYEOF
    else
        # grep/sed fallback: parse the JSON manually for the given matcher.
        # This is a best-effort fallback; python3 is strongly preferred.
        local in_pretooluse=0
        local in_entry=0
        local found_matcher=0
        grep -A5 "\"matcher\"[[:space:]]*:[[:space:]]*\"${matcher}\"" "$HOOKS_JSON" \
            | grep '"command"' \
            | sed 's/.*"command"[[:space:]]*:[[:space:]]*"\(.*\)".*/\1/' \
            | sed "s|\${CLAUDE_PLUGIN_ROOT}|${REPO_ROOT}|g" \
            | awk '{print $NF}'
    fi
}

# ---------------------------------------------------------------------------
# Resolve hook command lists for the two PreToolUse matchers
# ---------------------------------------------------------------------------

# Hooks for Bash|Write|Edit|NotebookEdit (policy-block.sh)
MULTI_TOOL_MATCHER="Bash|Write|Edit|NotebookEdit"
# Hooks for Bash only (dev-guard.sh)
BASH_ONLY_MATCHER="Bash"

# Read into arrays
# Strip carriage returns (\r) that Python may emit on Windows (CRLF line endings)
readarray -t MULTI_TOOL_HOOKS < <(get_hooks_for_matcher "$MULTI_TOOL_MATCHER" | tr -d '\r')
readarray -t BASH_ONLY_HOOKS  < <(get_hooks_for_matcher "$BASH_ONLY_MATCHER"  | tr -d '\r')

if [ ${#MULTI_TOOL_HOOKS[@]} -eq 0 ] && [ ${#BASH_ONLY_HOOKS[@]} -eq 0 ]; then
    echo "ERROR: Could not resolve any hook scripts from $HOOKS_JSON"
    exit 1
fi

# ---------------------------------------------------------------------------
# Chain execution helpers
#
# run_chain <clean_home> <tool_name> <json_payload>
#   Runs the matching hooks in manifest order under the given HOME.
#   Emulates Claude Code's multi-hook chain: first decision wins.
#   Prints the winning decision JSON (or nothing on defer).
# ---------------------------------------------------------------------------
run_chain() {
    local clean_home="$1"
    local tool_name="$2"
    local payload="$3"

    # Determine which hook lists match this tool_name.
    # - Bash|Write|Edit|NotebookEdit matcher fires for Bash, Write, Edit, NotebookEdit.
    # - Bash only matcher fires for Bash only.
    #
    # Claude Code runs entries in the order they appear in hooks.json:
    #   entry[0] = Bash|Write|Edit|NotebookEdit -> policy-block.sh
    #   entry[1] = Bash                          -> dev-guard.sh
    # Within each entry, hooks run in the order listed in the entry's hooks array.
    # The two entries are independent: if policy-block.sh emits a decision for a
    # Bash payload, Claude Code stops (first-decision-wins at the entry level too).
    # We model this: collect hooks in manifest order across ALL matching entries,
    # then run until the first decision.

    local -a ordered_hooks=()

    # Entry 0: Bash|Write|Edit|NotebookEdit
    if [[ "$tool_name" == "Bash" || "$tool_name" == "Write" \
       || "$tool_name" == "Edit" || "$tool_name" == "NotebookEdit" ]]; then
        for h in "${MULTI_TOOL_HOOKS[@]+"${MULTI_TOOL_HOOKS[@]}"}"; do
            ordered_hooks+=("$h")
        done
    fi

    # Entry 1: Bash only
    if [[ "$tool_name" == "Bash" ]]; then
        for h in "${BASH_ONLY_HOOKS[@]+"${BASH_ONLY_HOOKS[@]}"}"; do
            ordered_hooks+=("$h")
        done
    fi

    local decision=""
    for hook_script in "${ordered_hooks[@]+"${ordered_hooks[@]}"}"; do
        if [ ! -f "$hook_script" ]; then
            continue
        fi
        local out
        out=$(HOME="$clean_home" bash "$hook_script" <<< "$payload" 2>/dev/null || true)
        if [ -n "$out" ] && echo "$out" | grep -q '"permissionDecision"'; then
            decision="$out"
            break  # first decision wins
        fi
    done

    echo "$decision"
}

# ---------------------------------------------------------------------------
# Assertion helpers
# ---------------------------------------------------------------------------
assert_chain_ask() {
    local name="$1"
    local clean_home="$2"
    local tool_name="$3"
    local payload="$4"
    local out
    out=$(run_chain "$clean_home" "$tool_name" "$payload")
    if echo "$out" | grep -q '"permissionDecision": *"ask"'; then
        PASS=$((PASS + 1))
        echo "  [PASS] CHAIN-ASK: $name"
    else
        FAIL=$((FAIL + 1))
        FAILURES+=("CHAIN-ASK expected: $name | got: ${out:-<defer/empty>}")
        echo "  [FAIL] CHAIN-ASK: $name (got: ${out:-<defer/empty>})"
    fi
}

assert_chain_deny() {
    local name="$1"
    local clean_home="$2"
    local tool_name="$3"
    local payload="$4"
    local out
    out=$(run_chain "$clean_home" "$tool_name" "$payload")
    if echo "$out" | grep -q '"permissionDecision": *"deny"'; then
        PASS=$((PASS + 1))
        echo "  [PASS] CHAIN-DENY: $name"
    else
        FAIL=$((FAIL + 1))
        FAILURES+=("CHAIN-DENY expected: $name | got: ${out:-<defer/empty>}")
        echo "  [FAIL] CHAIN-DENY: $name (got: ${out:-<defer/empty>})"
    fi
}

# assert_chain_defer — PASS when the chain emits NO permissionDecision.
# This is the "defer to operator's normal permission flow" contract.
# THE #298 SIGNAL: a clean env with dev mode OFF and Edit payload must defer,
# not auto-approve. Any "allow" here is a regression signal.
assert_chain_defer() {
    local name="$1"
    local clean_home="$2"
    local tool_name="$3"
    local payload="$4"
    local out
    out=$(run_chain "$clean_home" "$tool_name" "$payload")
    if [ -z "$out" ] || ! echo "$out" | grep -q '"permissionDecision"'; then
        PASS=$((PASS + 1))
        echo "  [PASS] CHAIN-DEFER: $name"
    else
        FAIL=$((FAIL + 1))
        FAILURES+=("CHAIN-DEFER expected: $name | got: $out")
        echo "  [FAIL] CHAIN-DEFER: $name (got: $out)"
    fi
}

# ---------------------------------------------------------------------------
# Payload builders
# ---------------------------------------------------------------------------
make_bash_payload() {
    local cmd="$1"
    if command -v python3 >/dev/null 2>&1; then
        python3 -c "
import json, sys
cmd = sys.argv[1]
print(json.dumps({'tool_name': 'Bash', 'tool_input': {'command': cmd}}))
" "$cmd"
    else
        printf '{"tool_name":"Bash","tool_input":{"command":"%s"}}\n' "$cmd"
    fi
}

make_edit_payload() {
    printf '{"tool_name":"Edit","tool_input":{"file_path":"/tmp/app.py","old_string":"a","new_string":"b"}}\n'
}

make_write_payload() {
    printf '{"tool_name":"Write","tool_input":{"file_path":"/tmp/output.py","content":"print(1)"}}\n'
}

# ---------------------------------------------------------------------------
# AC-9 helper: verify matcher separation
#
# Verifies that Edit/Write payloads are routed ONLY to policy-block.sh
# (Bash|Write|Edit|NotebookEdit matcher), never to dev-guard.sh (Bash only).
# This is a structural assertion against the resolved hook lists.
# ---------------------------------------------------------------------------
assert_matcher_separation() {
    echo
    echo "=== AC-9: Matcher separation — Edit/Write never routed to Bash-only hooks ==="

    # The Bash-only hooks (dev-guard.sh) must NOT appear in the ordered chain
    # for Edit or Write payloads.
    local edit_payload
    edit_payload=$(make_edit_payload)

    local -a edit_chain=()
    # Collect hooks that would run for Edit
    if [[ "Edit" == "Bash" || "Edit" == "Write" \
       || "Edit" == "Edit" || "Edit" == "NotebookEdit" ]]; then
        for h in "${MULTI_TOOL_HOOKS[@]+"${MULTI_TOOL_HOOKS[@]}"}"; do
            edit_chain+=("$h")
        done
    fi
    # Bash-only hooks do NOT apply to Edit — verify none are in edit_chain
    local bash_only_in_edit=0
    for bh in "${BASH_ONLY_HOOKS[@]+"${BASH_ONLY_HOOKS[@]}"}"; do
        for eh in "${edit_chain[@]+"${edit_chain[@]}"}"; do
            if [ "$bh" = "$eh" ]; then
                bash_only_in_edit=1
                break 2
            fi
        done
    done

    if [ "$bash_only_in_edit" -eq 0 ]; then
        PASS=$((PASS + 1))
        echo "  [PASS] AC-9: Bash-only hooks (dev-guard) not in Edit chain"
    else
        FAIL=$((FAIL + 1))
        FAILURES+=("AC-9: dev-guard.sh found in Edit chain — matcher separation violated")
        echo "  [FAIL] AC-9: dev-guard.sh found in Edit chain (should be Bash-only)"
    fi

    # Also verify the resolved hook lists are non-empty (harness wiring is live)
    if [ ${#MULTI_TOOL_HOOKS[@]} -gt 0 ]; then
        PASS=$((PASS + 1))
        echo "  [PASS] AC-9: Bash|Write|Edit|NotebookEdit matcher resolved ${#MULTI_TOOL_HOOKS[@]} hook(s)"
    else
        FAIL=$((FAIL + 1))
        FAILURES+=("AC-9: No hooks resolved for Bash|Write|Edit|NotebookEdit matcher")
        echo "  [FAIL] AC-9: No hooks resolved for Bash|Write|Edit|NotebookEdit matcher"
    fi

    if [ ${#BASH_ONLY_HOOKS[@]} -gt 0 ]; then
        PASS=$((PASS + 1))
        echo "  [PASS] AC-9: Bash-only matcher resolved ${#BASH_ONLY_HOOKS[@]} hook(s)"
    else
        FAIL=$((FAIL + 1))
        FAILURES+=("AC-9: No hooks resolved for Bash-only matcher")
        echo "  [FAIL] AC-9: No hooks resolved for Bash-only matcher"
    fi
}

# ---------------------------------------------------------------------------
# Scenario matrix (8 cases from docs/00-research.md §3 §B2)
# ---------------------------------------------------------------------------

echo "============================================================"
echo "  Suite 84 — isolated-hook-env-harness"
echo "  Resolving hook chain from: $HOOKS_JSON"
echo "  policy-block hooks (${#MULTI_TOOL_HOOKS[@]}): ${MULTI_TOOL_HOOKS[*]+"${MULTI_TOOL_HOOKS[*]}"}"
echo "  dev-guard hooks    (${#BASH_ONLY_HOOKS[@]}): ${BASH_ONLY_HOOKS[*]+"${BASH_ONLY_HOOKS[*]}"}"
echo "============================================================"

# ---------------------------------------------------------------------------
# Scenario 1 (AC-7 — THE #298 SIGNAL):
# dev mode OFF (no marker), Edit payload (no command field) -> CHAIN DEFERS
#
# In a clean HOME with no dev-mode marker and an Edit-shaped payload,
# the entire hook chain must emit NO permissionDecision. In pre-#298
# dev-guard.sh this would have emitted allow (the bug). The fix made
# dev-guard.sh emit no decision; but dev-guard.sh never sees Edit payloads
# anyway (Bash-only matcher). The real check: policy-block.sh also defers
# for this payload (no secret patterns matched). Net result: chain defers.
# ---------------------------------------------------------------------------
echo
echo "=== Scenario 1 (AC-7 — #298 signal): dev OFF, Edit payload -> CHAIN DEFERS ==="
H=$(make_clean_home)
assert_chain_defer \
    "S1: clean HOME, no marker, Edit payload (no command) -> defer (not auto-approved)" \
    "$H" "Edit" "$(make_edit_payload)"

# ---------------------------------------------------------------------------
# Scenario 2:
# dev mode ON (marker present), Edit payload -> CHAIN DEFERS
# dev-guard.sh doesn't see Edit (Bash-only); policy-block.sh defers (no secret).
# ---------------------------------------------------------------------------
echo
echo "=== Scenario 2: dev ON, Edit payload -> CHAIN DEFERS (dev-guard never sees Edit) ==="
H=$(make_home_with_marker)
assert_chain_defer \
    "S2: marker present, Edit payload -> defer (dev-guard has no Bash match)" \
    "$H" "Edit" "$(make_edit_payload)"

# ---------------------------------------------------------------------------
# Scenario 3:
# dev mode OFF, Write payload (no command field) -> CHAIN DEFERS
# Same class as Scenario 1 but Write tool.
# ---------------------------------------------------------------------------
echo
echo "=== Scenario 3: dev OFF, Write payload -> CHAIN DEFERS ==="
H=$(make_clean_home)
assert_chain_defer \
    "S3: clean HOME, no marker, Write payload -> defer" \
    "$H" "Write" "$(make_write_payload)"

# ---------------------------------------------------------------------------
# Scenario 4:
# dev mode OFF, benign Bash (git status) -> CHAIN DEFERS
# policy-block.sh: no deny pattern matched.
# dev-guard.sh: cmd non-empty, marker absent -> nodecision.
# ---------------------------------------------------------------------------
echo
echo "=== Scenario 4: dev OFF, benign Bash (git status) -> CHAIN DEFERS ==="
H=$(make_clean_home)
assert_chain_defer \
    "S4: clean HOME, no marker, git status -> defer" \
    "$H" "Bash" "$(make_bash_payload 'git status')"

# ---------------------------------------------------------------------------
# Scenario 5:
# dev mode ON, benign Bash (git status) -> CHAIN DEFERS
# policy-block.sh: no deny pattern matched.
# dev-guard.sh: cmd non-empty, marker present, NOT an outward action -> nodecision.
# ---------------------------------------------------------------------------
echo
echo "=== Scenario 5: dev ON, benign Bash (git status) -> CHAIN DEFERS ==="
H=$(make_home_with_marker)
assert_chain_defer \
    "S5: marker present, git status -> defer (not a covered outward action)" \
    "$H" "Bash" "$(make_bash_payload 'git status')"

# ---------------------------------------------------------------------------
# Scenario 6 (AC-8 — non-vacuous):
# dev mode ON, covered outward action (gh pr merge 1) -> CHAIN ASK
# policy-block.sh: no deny pattern for gh pr merge.
# dev-guard.sh: marker present + covered outward action -> ask.
# ---------------------------------------------------------------------------
echo
echo "=== Scenario 6 (AC-8): dev ON, 'gh pr merge 1' -> CHAIN ASK ==="
H=$(make_home_with_marker)
assert_chain_ask \
    "S6: marker present, gh pr merge -> ask (covered outward action, dev mode on)" \
    "$H" "Bash" "$(make_bash_payload 'gh pr merge 1')"

# ---------------------------------------------------------------------------
# Scenario 7:
# dev mode OFF, covered outward action (gh pr merge 1) -> CHAIN DEFERS
# dev-guard.sh: marker absent -> nodecision (dev mode off -> defers even on outward).
# policy-block.sh: no deny pattern.
# ---------------------------------------------------------------------------
echo
echo "=== Scenario 7: dev OFF, 'gh pr merge 1' -> CHAIN DEFERS ==="
H=$(make_clean_home)
assert_chain_defer \
    "S7: clean HOME, no marker, gh pr merge -> defer (dev mode off)" \
    "$H" "Bash" "$(make_bash_payload 'gh pr merge 1')"

# ---------------------------------------------------------------------------
# Scenario 8 (AC-8 — non-vacuous):
# dev mode OFF, destructive Bash (rm -rf ~) -> CHAIN DENY
# policy-block.sh fires: rm -rf targeting ~ -> deny.
# Proves policy-block's deny path survives the clean-env chain.
# ---------------------------------------------------------------------------
echo
echo "=== Scenario 8 (AC-8): dev OFF, 'rm -rf ~' -> CHAIN DENY ==="
H=$(make_clean_home)
assert_chain_deny \
    "S8: clean HOME, rm -rf ~ -> deny (policy-block.sh destructive pattern)" \
    "$H" "Bash" "$(make_bash_payload 'rm -rf ~')"

# ---------------------------------------------------------------------------
# AC-9: Matcher separation structural check
# ---------------------------------------------------------------------------
assert_matcher_separation

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo
echo "============================================================"
echo "  Suite 84 isolated-hook-env-harness: $PASS passed / $((PASS + FAIL)) total"
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
