#!/bin/bash
# tests/test_hook_gates_hardening.sh
# Suite 85 — hook-gates-hardening regression tests (Phase 2.0, issue #304)
#
# SPEC-ASSERTING regression tests, now run against the compiled TS artifacts
# (hooks/ts/dist/*.cjs — the single source of gate logic post-cutover, issue
# #446). Tests assert the SPEC (the corrected floor), not any implementation
# detail.
#
# ANTI-FALSE-GREEN NOTE:
#   Every test in this file encodes an expected behaviour. A test that passes
#   for the wrong reason is asserting a bug and must be reworked. The plan's
#   oracle is the permission-gate contract, not any implementation's output.
#
# Findings covered:
#   F-015  policy-block: Windows backslash path denial
#   F-016  dev-guard:    escape-aware command extraction (compound quoted command)
#   F-010  checkpoint-guard: obsidian logs-mode state-file resolution
#   F-018  checkpoint-guard: multi-workspace selection (active over alphabetical)
#   F-008  dev-guard: ClickUp MCP outward-write gate (runtime execution)
#
# RETIRED at the hook Bash->TS cutover (issue #446): F-002 (policy-block's
# bash-native python3-masked degraded floor) and the M3a/M3b/M3c
# "dual-path parity" section — both tested the retired Bash body's OWN
# fallback when python3 was absent from PATH, a concept with no TS
# equivalent (Node has no python3 dependency to degrade from). The
# python3-available regression guards these sections carried (F002-6,
# F016-3) are preserved below, converted to the TS artifact; the remaining
# M3a/M3b/M3c coverage (egress read guard, config-anti-weakening, --no-verify
# tokenizer) is exercised unconditionally by tests/test_policy_block.sh
# (Suite 1), which has no degraded-path split to begin with.
#
# Structural (F-008, F-038, F-009, A1, Lint Check 8) findings are in
#   tests/test_agent_structure_hardening.py.
#
# Note on secret patterns in tests:
#   Token literals in this file are split across variables to prevent the
#   policy-block gate from blocking CI writes of this test file itself.
#   The assembled payloads exercise the hook's runtime detection correctly.
#
# Usage:
#   bash tests/test_hook_gates_hardening.sh
# Exit code:
#   0 if all cases pass, 1 otherwise.

set -u

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
POLICY_HOOK="$REPO_ROOT/hooks/ts/dist/policy-block.cjs"
DEV_GUARD_HOOK="$REPO_ROOT/hooks/ts/dist/dev-guard.cjs"
CHECKPOINT_HOOK="$REPO_ROOT/hooks/ts/dist/checkpoint-guard.cjs"

for h in "$POLICY_HOOK" "$DEV_GUARD_HOOK" "$CHECKPOINT_HOOK"; do
    if [ ! -f "$h" ]; then
        echo "ERROR: $h not found — run 'npm --prefix hooks/ts run build'"
        exit 1
    fi
done

PASS=0
FAIL=0
declare -a FAILURES

# ---------------------------------------------------------------------------
# Cleanup: remove temp dirs on exit
# ---------------------------------------------------------------------------
declare -a CLEANUP_DIRS

cleanup_all() {
    for d in "${CLEANUP_DIRS[@]+"${CLEANUP_DIRS[@]}"}"; do
        rm -rf "$d" 2>/dev/null || true
    done
}
trap cleanup_all EXIT

make_tmp() {
    local tmp
    tmp="$(mktemp -d)"
    CLEANUP_DIRS+=("$tmp")
    echo "$tmp"
}

# ---------------------------------------------------------------------------
# Assertion helpers
# ---------------------------------------------------------------------------

# assert_exact_deny — qa-plan C-1: assert the EXACT permissionDecision field value.
# A malformed deny JSON (wrong field name/value) is treated as non-blocking → silent allow.
# The full hookSpecificOutput shape must be well-formed.
assert_exact_deny() {
    local name="$1"
    local out="$2"
    if echo "$out" | grep -q '"permissionDecision":[[:space:]]*"deny"'; then
        PASS=$((PASS + 1))
        echo "  [PASS] EXACT-DENY: $name"
    else
        FAIL=$((FAIL + 1))
        FAILURES+=("EXACT-DENY expected: $name | got: ${out:-<empty/exit127>}")
        echo "  [FAIL] EXACT-DENY: $name (got: ${out:-<empty/exit127>})"
    fi
}

assert_nodecision() {
    local name="$1"
    local out="$2"
    if [ -z "$out" ] || ! echo "$out" | grep -q '"permissionDecision"'; then
        PASS=$((PASS + 1))
        echo "  [PASS] NODECISION: $name"
    else
        FAIL=$((FAIL + 1))
        FAILURES+=("NODECISION expected: $name | got: $out")
        echo "  [FAIL] NODECISION: $name (got: $out)"
    fi
}

assert_exact_ask() {
    local name="$1"
    local out="$2"
    if echo "$out" | grep -q '"permissionDecision":[[:space:]]*"ask"'; then
        PASS=$((PASS + 1))
        echo "  [PASS] EXACT-ASK: $name"
    else
        FAIL=$((FAIL + 1))
        FAILURES+=("EXACT-ASK expected: $name | got: ${out:-<empty>}")
        echo "  [FAIL] EXACT-ASK: $name (got: ${out:-<empty>})"
    fi
}

assert_exact_deny_checkpoint() {
    local name="$1"
    local out="$2"
    if echo "$out" | grep -q '"permissionDecision":[[:space:]]*"deny"'; then
        PASS=$((PASS + 1))
        echo "  [PASS] EXACT-DENY (checkpoint): $name"
    else
        FAIL=$((FAIL + 1))
        FAILURES+=("EXACT-DENY (checkpoint) expected: $name | got: ${out:-<empty>}")
        echo "  [FAIL] EXACT-DENY (checkpoint): $name (got: ${out:-<empty>})"
    fi
}

# make_tmp_with_marker — create a fake HOME (marker is no longer read by dev-guard;
# retained for call-site compatibility with F-016 and F-008 tests; the gate is unconditional
# as of v2.89.0 SEC-DR-2 re-founding and fires regardless of any filesystem state).
make_tmp_with_marker() {
    local tmp
    tmp="$(make_tmp)"
    mkdir -p "$tmp/.claude"
    echo "$tmp"
}

# ---------------------------------------------------------------------------
# ============================================================================
# F-015: Windows backslash path denial in policy-block
# SPEC: Write/Edit targeting Windows backslash paths must be DENIED.
# ============================================================================
echo
echo "############################################################"
echo "# F-015: policy-block Windows backslash path denial"
echo "############################################################"

# Case F015-1: C:\Users\x\.ssh\id_rsa (Windows-style absolute backslash path) → DENY
echo
echo "=== F-015-1: Write C:\\Users\\x\\.ssh\\id_rsa (backslash) -> EXACT DENY ==="
# JSON double-backslash represents a single backslash in the JSON string value.
OUT_F015_1=$(printf '%s\n' '{"tool_name":"Write","tool_input":{"file_path":"C:\\Users\\x\\.ssh\\id_rsa"}}' | node "$POLICY_HOOK" 2>/dev/null || true)
assert_exact_deny "F015-1: Write C:\\Users\\x\\.ssh\\id_rsa (backslash .ssh path) -> deny" "$OUT_F015_1"

# Case F015-2: D:\app\.env (backslash .env path) → DENY
echo
echo "=== F-015-2: Write D:\\app\\.env (backslash) -> EXACT DENY ==="
OUT_F015_2=$(printf '%s\n' '{"tool_name":"Write","tool_input":{"file_path":"D:\\app\\.env"}}' | node "$POLICY_HOOK" 2>/dev/null || true)
assert_exact_deny "F015-2: Write D:\\app\\.env (backslash .env path) -> deny" "$OUT_F015_2"

# Case F015-3: ..\secrets.yaml (relative backslash path) → DENY
echo
echo "=== F-015-3: Write ..\\secrets.yaml (relative backslash) -> EXACT DENY ==="
OUT_F015_3=$(printf '%s\n' '{"tool_name":"Write","tool_input":{"file_path":"..\\secrets.yaml"}}' | node "$POLICY_HOOK" 2>/dev/null || true)
assert_exact_deny "F015-3: Write ..\\secrets.yaml (relative backslash) -> deny" "$OUT_F015_3"

# Case F015-5: forward-slash control still denies (regression guard)
echo
echo "=== F-015-5 (regression guard): /home/u/.ssh/id_rsa (forward-slash) still DENIES ==="
OUT_F015_5=$(printf '%s\n' '{"tool_name":"Write","tool_input":{"file_path":"/home/u/.ssh/id_rsa"}}' | node "$POLICY_HOOK" 2>/dev/null || true)
assert_exact_deny "F015-5: /home/u/.ssh/id_rsa (forward-slash) -> deny (regression guard)" "$OUT_F015_5"

# Case F015-6: non-sensitive backslash path is NOT denied
echo
echo "=== F-015-6: Write C:\\src\\app.py (non-sensitive backslash) -> NODECISION ==="
OUT_F015_6=$(printf '%s\n' '{"tool_name":"Write","tool_input":{"file_path":"C:\\src\\app.py","content":"x=1"}}' | node "$POLICY_HOOK" 2>/dev/null || true)
assert_nodecision "F015-6: C:\\src\\app.py (non-sensitive backslash) -> nodecision (not over-denied)" "$OUT_F015_6"


# ---------------------------------------------------------------------------
# ============================================================================
# F-016: dev-guard escape-aware command extraction
# SPEC: the compound command
#   git commit -m "msg" && git push origin feat/x
# must be correctly extracted so 'git push' is seen and the hook returns ASK.
# `allow` is reserved for a SINGLE, un-chained `git push` invocation — a
# compound command certifies only the clause the recognizer happens to
# inspect while an `allow` decision authorizes the WHOLE Bash tool call, so
# ANY shell chaining/control operator anywhere in the command forces `ask`
# regardless of how safe the push clause itself looks.
# ============================================================================
echo
echo "############################################################"
echo "# F-016: dev-guard escape-aware extraction"
echo "############################################################"

COMPOUND_PAYLOAD='{"tool_name":"Bash","tool_input":{"command":"git commit -m \"msg\" && git push origin feat/x"}}'

# Case F016-3: compound command with embedded quote → ASK (unconditional for
# any chained form, regardless of how safe the push clause itself would be).
echo
echo "=== F-016-3: compound cmd with embedded quote -> EXACT ASK ==="
TMP_F016C=$(make_tmp_with_marker)
OUT_F016_3=$(HOME="$TMP_F016C" node "$DEV_GUARD_HOOK" <<< "$COMPOUND_PAYLOAD" 2>/dev/null || true)
assert_exact_ask "F016-3: compound cmd with embedded quote -> ask (git push seen, but chained — allow is single-invocation-only)" "$OUT_F016_3"


# ---------------------------------------------------------------------------
# ============================================================================
# F-010: checkpoint-guard.sh obsidian logs-mode state-file resolution
# SPEC: with logs-mode: obsidian and an armed boundary in a vault-resident
# 00-state.md outside $CWD, the hook must resolve the vault root from
# ~/.claude/.team-harness.json and DENY the Task dispatch.
# PRE-FIX STATE: find is scoped to $CWD only; the vault path is never searched;
# the hook finds nothing → fails open (allow).
# ============================================================================
echo
echo "############################################################"
echo "# F-010: checkpoint-guard obsidian logs-mode resolution"
echo "############################################################"

# Realistic Claude Code PreToolUse Task payload shape: subagent_type lives
# under tool_input, not at the payload root (T6c — checkpoint-guard.sh and
# its fixtures were corrected together to the nested shape).
TASK_PAYLOAD='{"tool_name":"Task","tool_input":{"subagent_type":"th:architect","prompt":"plan this"}}'

# Case F010-1: armed state in vault path outside CWD → DENY
echo
echo "=== F-010-1: armed boundary in vault path (outside CWD) -> EXACT DENY ==="
# FAILING PRE-FIX: hook only searches $CWD; vault path never scanned → allow (fail-open)

TMP_HOME_F010=$(make_tmp)
mkdir -p "$TMP_HOME_F010/.claude"
VAULT_BASE="$TMP_HOME_F010/vault"
VAULT_SUBFOLDER="work-logs"
REPO_SLUG="team-harness"
FEATURE_DIR="${VAULT_BASE}/${VAULT_SUBFOLDER}/${REPO_SLUG}/2026-06-10_hook-gates-hardening"
mkdir -p "$FEATURE_DIR"

cat > "$FEATURE_DIR/00-state.md" << 'STATEOF'
## Current State
- status: in-progress
- type: fix
- checkpoint_boundary: intake-plan
- checkpoint_advance_fresh: false
- functional_clarity_confirmed: false
STATEOF

# Write .team-harness.json pointing to the vault base
printf '{"logs-mode":"obsidian","logs-path":"%s","logs-subfolder":"%s"}\n' \
    "$VAULT_BASE" "$VAULT_SUBFOLDER" \
    > "$TMP_HOME_F010/.claude/.team-harness.json"

# CWD basename must equal the repo slug: the hook scopes its obsidian search to
# {logs-path}/{logs-subfolder}/{basename of CWD}/ (the repo's own work-logs subtree),
# never the whole vault. In production CWD is the repo root (basename team-harness).
TMP_EMPTY_CWD="$(make_tmp)/${REPO_SLUG}"
mkdir -p "$TMP_EMPTY_CWD"
OUT_F010_1=$( (cd "$TMP_EMPTY_CWD" && HOME="$TMP_HOME_F010" node "$CHECKPOINT_HOOK") <<< "$TASK_PAYLOAD" 2>/dev/null || true)
assert_exact_deny_checkpoint "F010-1: armed obsidian vault state (outside CWD) -> deny" "$OUT_F010_1"

# Case F010-2: satisfied state in vault → ALLOW (no over-deny; regression guard)
echo
echo "=== F-010-2 (regression guard): satisfied boundary in vault path -> ALLOW ==="
TMP_HOME_F010B=$(make_tmp)
mkdir -p "$TMP_HOME_F010B/.claude"
VAULT_BASE_B="$TMP_HOME_F010B/vault"
FEATURE_DIR_SAT="${VAULT_BASE_B}/${VAULT_SUBFOLDER}/${REPO_SLUG}/2026-06-10_satisfied"
mkdir -p "$FEATURE_DIR_SAT"
cat > "$FEATURE_DIR_SAT/00-state.md" << 'STATEOF'
## Current State
- status: in-progress
- type: fix
- checkpoint_boundary: intake-plan
- checkpoint_advance_fresh: true
- functional_clarity_confirmed: true
STATEOF
printf '{"logs-mode":"obsidian","logs-path":"%s","logs-subfolder":"%s"}\n' \
    "$VAULT_BASE_B" "$VAULT_SUBFOLDER" \
    > "$TMP_HOME_F010B/.claude/.team-harness.json"

TMP_EMPTY_CWD2="$(make_tmp)/${REPO_SLUG}"
mkdir -p "$TMP_EMPTY_CWD2"
OUT_F010_2=$( (cd "$TMP_EMPTY_CWD2" && HOME="$TMP_HOME_F010B" node "$CHECKPOINT_HOOK") <<< "$TASK_PAYLOAD" 2>/dev/null || true)
# Pre-fix: allows (fail-open, nothing found). Post-fix: allows (vault found, state satisfied).
# This is a regression guard that stays green both before and after the fix — what matters is F010-1.
if echo "$OUT_F010_2" | grep -q '"permissionDecision":[[:space:]]*"allow"'; then
    PASS=$((PASS + 1))
    echo "  [PASS] ALLOW: F010-2: satisfied obsidian vault state -> allow"
else
    FAIL=$((FAIL + 1))
    FAILURES+=("ALLOW expected: F010-2: satisfied obsidian vault state | got: ${OUT_F010_2:-<empty>}")
    echo "  [FAIL] ALLOW: F010-2: satisfied obsidian vault state (got: ${OUT_F010_2:-<empty>})"
fi

# Case F010-3: vault scoping — the hook searches ONLY this repo's work-logs subtree,
# not the entire vault. A vault-wide find traverses thousands of unrelated notes on every
# Task dispatch (multi-second latency degrading to a hang) and would gate on a foreign
# repo's workspace. SPEC: an armed (would-deny) workspace under a DIFFERENT repo's subtree,
# written LATER (newer mtime), must be IGNORED; only this repo's satisfied state is seen -> ALLOW.
# PRE-FIX (vault-wide) STATE: the newer foreign armed state is the newest-mtime candidate
# across the vault -> hook denies (wrong) and pays the full-vault traversal cost.
echo
echo "=== F-010-3 (scoping): foreign-repo armed state (newer) is ignored; own satisfied state -> ALLOW ==="
TMP_HOME_F010C=$(make_tmp)
mkdir -p "$TMP_HOME_F010C/.claude"
VAULT_BASE_C="$TMP_HOME_F010C/vault"
# Own repo: satisfied (would allow)
OWN_DIR="${VAULT_BASE_C}/${VAULT_SUBFOLDER}/${REPO_SLUG}/2026-06-10_own_active"
mkdir -p "$OWN_DIR"
cat > "$OWN_DIR/00-state.md" << 'STATEOF'
## Current State
- status: in-progress
- type: fix
- checkpoint_boundary: intake-plan
- checkpoint_advance_fresh: true
- functional_clarity_confirmed: true
STATEOF
# Foreign repo: armed + unsatisfied (would deny if wrongly in scope), written LATER -> newer mtime
FOREIGN_DIR="${VAULT_BASE_C}/${VAULT_SUBFOLDER}/other-repo/2026-06-11_intruder"
mkdir -p "$FOREIGN_DIR"
cat > "$FOREIGN_DIR/00-state.md" << 'STATEOF'
## Current State
- status: in-progress
- type: fix
- checkpoint_boundary: intake-plan
- checkpoint_advance_fresh: false
- functional_clarity_confirmed: false
STATEOF
# Guarantee the foreign state is strictly newer than the own state.
touch "$FOREIGN_DIR/00-state.md"
printf '{"logs-mode":"obsidian","logs-path":"%s","logs-subfolder":"%s"}\n' \
    "$VAULT_BASE_C" "$VAULT_SUBFOLDER" \
    > "$TMP_HOME_F010C/.claude/.team-harness.json"
TMP_OWN_CWD="$(make_tmp)/${REPO_SLUG}"
mkdir -p "$TMP_OWN_CWD"
OUT_F010_3=$( (cd "$TMP_OWN_CWD" && HOME="$TMP_HOME_F010C" node "$CHECKPOINT_HOOK") <<< "$TASK_PAYLOAD" 2>/dev/null || true)
if echo "$OUT_F010_3" | grep -q '"permissionDecision":[[:space:]]*"allow"'; then
    PASS=$((PASS + 1))
    echo "  [PASS] SCOPING: F010-3: foreign-repo armed state ignored; own satisfied state -> allow"
else
    FAIL=$((FAIL + 1))
    FAILURES+=("SCOPING: F010-3: hook gated on foreign-repo or vault-wide state | got: ${OUT_F010_3:-<empty>}")
    echo "  [FAIL] SCOPING: F010-3: vault-wide/foreign state leaked into the gate (got: ${OUT_F010_3:-<empty>})"
fi


# ---------------------------------------------------------------------------
# ============================================================================
# F-018: checkpoint-guard.sh multi-workspace selection correctness
# SPEC: given multiple workspaces under $CWD, the gate must select the
# ACTIVE (newest-mtime) workspace, not the alphabetically-first one.
# PRE-FIX STATE: sort -t'/' -k1 | head -5 produces an alphabetical ordering;
# the alphabetically-first file is selected regardless of mtime or status.
# ============================================================================
echo
echo "############################################################"
echo "# F-018: checkpoint-guard multi-workspace mtime selection"
echo "############################################################"

# Case F018-1: alphabetically-first workspace is terminal (status: complete),
# newest-mtime workspace is active with armed boundary → DENY (active selected)
# FAILING PRE-FIX: alphabetical sort picks alpha-old (comes first) with status:complete
# → no boundary → allow. SPEC: zeta-active (newest mtime) is selected → armed → deny.
echo
echo "=== F-018-1: active workspace (newest mtime, armed) beats alphabetical-first (complete) -> DENY ==="

TMP_MULTI=$(make_tmp)
mkdir -p "$TMP_MULTI/workspaces/alpha-old"
mkdir -p "$TMP_MULTI/workspaces/zeta-active"

cat > "$TMP_MULTI/workspaces/alpha-old/00-state.md" << 'STATEOF'
## Current State
- status: complete
- type: fix
- checkpoint_boundary: null
- checkpoint_advance_fresh: false
- functional_clarity_confirmed: false
STATEOF

# Slight delay then write active workspace to ensure newer mtime
sleep 0.1 2>/dev/null || true
cat > "$TMP_MULTI/workspaces/zeta-active/00-state.md" << 'STATEOF'
## Current State
- status: in-progress
- type: fix
- checkpoint_boundary: intake-plan
- checkpoint_advance_fresh: false
- functional_clarity_confirmed: false
STATEOF

OUT_F018_1=$( (cd "$TMP_MULTI" && node "$CHECKPOINT_HOOK") <<< "$TASK_PAYLOAD" 2>/dev/null || true)
# FAILING PRE-FIX: alpha-old selected (alphabetical) → status:complete → no boundary → allow
# SPEC: zeta-active (newest mtime) selected → boundary armed → deny
assert_exact_deny_checkpoint "F018-1: active armed workspace (newest mtime) selected, not alphabetical-first complete -> deny" "$OUT_F018_1"

# Case F018-2: newest-mtime workspace is satisfied → ALLOW (active selection, not-stale)
echo
echo "=== F-018-2: active workspace (newest mtime, satisfied) -> ALLOW ==="

TMP_MULTI2=$(make_tmp)
mkdir -p "$TMP_MULTI2/workspaces/alpha-armed"
mkdir -p "$TMP_MULTI2/workspaces/zeta-done"

cat > "$TMP_MULTI2/workspaces/alpha-armed/00-state.md" << 'STATEOF'
## Current State
- status: in-progress
- type: fix
- checkpoint_boundary: intake-plan
- checkpoint_advance_fresh: false
- functional_clarity_confirmed: false
STATEOF

sleep 0.1 2>/dev/null || true
cat > "$TMP_MULTI2/workspaces/zeta-done/00-state.md" << 'STATEOF'
## Current State
- status: in-progress
- type: fix
- checkpoint_boundary: intake-plan
- checkpoint_advance_fresh: true
- functional_clarity_confirmed: true
STATEOF

OUT_F018_2=$( (cd "$TMP_MULTI2" && node "$CHECKPOINT_HOOK") <<< "$TASK_PAYLOAD" 2>/dev/null || true)
if echo "$OUT_F018_2" | grep -q '"permissionDecision":[[:space:]]*"allow"'; then
    PASS=$((PASS + 1))
    echo "  [PASS] ALLOW: F018-2: active satisfied workspace -> allow"
else
    FAIL=$((FAIL + 1))
    FAILURES+=("ALLOW expected: F018-2 active satisfied -> allow | got: ${OUT_F018_2:-<empty>}")
    echo "  [FAIL] ALLOW: F018-2: active satisfied workspace (got: ${OUT_F018_2:-<empty>})"
fi


# ---------------------------------------------------------------------------
# ============================================================================
# F-008 (SEC-001 runtime): dev-guard.sh ClickUp MCP outward-write gate
# SPEC: dev-guard.sh must emit permissionDecision:ask for ANY registered ClickUp
#   MCP server name, including multi-word server names whose spaces Claude Code
#   normalizes to underscores (e.g. "Claude AI ClickUp" -> "claude_ai_ClickUp").
#   Gate is unconditional (SEC-DR-2 re-founding, v2.89.0) — no marker needed.
# PRE-FIX STATE (SEC-001): the script-side pattern used [^_][^_]* which cannot
#   match a server segment containing underscores; those calls fall through to
#   empty cmd -> nodecision, silently bypassing the F-008 gate.
# ============================================================================
echo
echo "############################################################"
echo "# F-008 (SEC-001 runtime): ClickUp MCP write gate — runtime execution"
echo "############################################################"

# Case F008-RT-1: multi-word ClickUp server (underscore-normalized, e.g. "Claude AI ClickUp")
#   tool_name: mcp__claude_ai_ClickUp__clickup_update_task -> unconditional ASK
# FAILS PRE-FIX: [^_][^_]* cannot match "claude_ai_ClickUp" server segment -> nodecision
echo
echo "=== F008-RT-1: mcp__claude_ai_ClickUp__clickup_update_task (unconditional) -> EXACT ASK ==="
TMP_F008_RT1=$(make_tmp_with_marker)
F008_RT1_PAYLOAD='{"tool_name":"mcp__claude_ai_ClickUp__clickup_update_task","tool_input":{}}'
OUT_F008_RT1=$( ( HOME="$TMP_F008_RT1" node "$DEV_GUARD_HOOK" <<< "$F008_RT1_PAYLOAD" 2>/dev/null ) || true )
assert_exact_ask "F008-RT-1: multi-word ClickUp server (underscore segment) outward write -> ask" "$OUT_F008_RT1"

# Case F008-RT-2: single-word ClickUp server (no underscores in server segment)
#   tool_name: mcp__clickup__clickup_create_task -> unconditional ASK
# Regression guard: this matched even pre-fix with [^_][^_]*, must continue to match.
echo
echo "=== F008-RT-2 (regression guard): mcp__clickup__clickup_create_task (unconditional) -> EXACT ASK ==="
TMP_F008_RT2=$(make_tmp_with_marker)
F008_RT2_PAYLOAD='{"tool_name":"mcp__clickup__clickup_create_task","tool_input":{}}'
OUT_F008_RT2=$( ( HOME="$TMP_F008_RT2" node "$DEV_GUARD_HOOK" <<< "$F008_RT2_PAYLOAD" 2>/dev/null ) || true )
assert_exact_ask "F008-RT-2: single-word ClickUp server outward write -> ask (regression guard)" "$OUT_F008_RT2"

# Case F008-RT-3: ClickUp read/GET tool (not in write alternation) -> NO DECISION (no over-match)
#   tool_name: mcp__claude_ai_ClickUp__clickup_get_task — read verb, not gated
echo
echo "=== F008-RT-3: mcp__claude_ai_ClickUp__clickup_get_task (read verb) -> NODECISION (not over-matched) ==="
TMP_F008_RT3=$(make_tmp_with_marker)
F008_RT3_PAYLOAD='{"tool_name":"mcp__claude_ai_ClickUp__clickup_get_task","tool_input":{}}'
OUT_F008_RT3=$( ( HOME="$TMP_F008_RT3" node "$DEV_GUARD_HOOK" <<< "$F008_RT3_PAYLOAD" 2>/dev/null ) || true )
assert_nodecision "F008-RT-3: ClickUp read tool (get_task) -> nodecision (write gate does not over-match reads)" "$OUT_F008_RT3"


# ---------------------------------------------------------------------------
# M3a/M3b/M3c "dual-path parity" (bash-degraded path) RETIRED at the hook
# Bash->TS cutover (issue #446) — see header note. Their coverage (egress
# read guard, config-anti-weakening, --no-verify tokenizer including SEC-001
# evasion forms) is exercised unconditionally by tests/test_policy_block.sh
# (Suite 1).

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo
echo "============================================================"
echo "  Suite 85 hook-gates-hardening: $PASS passed / $((PASS + FAIL)) total"
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
