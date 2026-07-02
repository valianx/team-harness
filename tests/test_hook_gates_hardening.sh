#!/bin/bash
# tests/test_hook_gates_hardening.sh
# Suite 85 — hook-gates-hardening regression tests (Phase 2.0, issue #304)
#
# SPEC-ASSERTING regression tests for eight silent-fail-open defects.
# Each test FAILS on current main (pre-fix) and PASSES after the fix.
# Tests assert the SPEC (the corrected floor), NOT the current buggy behaviour.
#
# ANTI-FALSE-GREEN NOTE:
#   Every test in this file encodes an expected behaviour that does NOT exist
#   yet on the pre-fix tree. A test that passes pre-fix is asserting the bug
#   and must be reworked. The plan's oracle is the permission-gate contract,
#   not the script's current output.
#
# Findings covered:
#   F-002  policy-block.sh: bash-native degraded floor (deny on denylist + AKIA pattern)
#   F-015  policy-block.sh: Windows backslash path denial
#   F-016  dev-guard.sh:    escape-aware command extraction (compound quoted command)
#   F-010  checkpoint-guard.sh: obsidian logs-mode state-file resolution
#   F-018  checkpoint-guard.sh: multi-workspace selection (active over alphabetical)
#
# Structural (F-008, F-038, F-009, A1, Lint Check 8) findings are in
#   tests/test_agent_structure_hardening.py.
#
# Note on secret patterns in tests:
#   Token literals in this file are split across variables to prevent the
#   policy-block.sh gate from blocking CI writes of this test file itself.
#   The assembled payloads exercise the hook's runtime detection correctly.
#
# Usage:
#   bash tests/test_hook_gates_hardening.sh
# Exit code:
#   0 if all cases pass, 1 otherwise.

set -u

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
POLICY_HOOK="$REPO_ROOT/hooks/policy-block.sh"
DEV_GUARD_HOOK="$REPO_ROOT/hooks/dev-guard.sh"
CHECKPOINT_HOOK="$REPO_ROOT/hooks/checkpoint-guard.sh"

for h in "$POLICY_HOOK" "$DEV_GUARD_HOOK" "$CHECKPOINT_HOOK"; do
    if [ ! -x "$h" ]; then
        chmod +x "$h" 2>/dev/null || true
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

# ---------------------------------------------------------------------------
# Helpers — masked python3 runs
# ---------------------------------------------------------------------------

# make_shim_dir — create a shimmed python3 that exits 127 (absent python3 simulation).
# Returns the shim directory path.
make_shim_dir() {
    local shim_dir
    shim_dir="$(make_tmp)"
    printf '#!/bin/bash\nexit 127\n' > "$shim_dir/python3"
    chmod +x "$shim_dir/python3"
    printf '#!/bin/bash\nexit 127\n' > "$shim_dir/python"
    chmod +x "$shim_dir/python"
    echo "$shim_dir"
}

# run_policy_with_masked_python3 — run policy-block.sh with python3 masked from PATH.
# Simulates a python3-less Windows machine or any machine where python3 is absent.
# NOTE: must use a subshell-export form, not PATH=... cmd1 | cmd2, because the pipe
# right-hand side inherits the parent shell's PATH (the prefix applies only to cmd1).
run_policy_with_masked_python3() {
    local payload="$1"
    local shim_dir
    shim_dir="$(make_shim_dir)"
    local safe_path="/usr/bin:/bin"
    local hook="$POLICY_HOOK"
    ( export PATH="$shim_dir:$safe_path"; printf '%s\n' "$payload" | bash "$hook" 2>/dev/null ) || true
}

# run_dev_guard_with_masked_python3 — run dev-guard.sh with python3 masked.
run_dev_guard_with_masked_python3() {
    local fake_home="$1"
    local payload="$2"
    local shim_dir
    shim_dir="$(make_shim_dir)"
    local safe_path="/usr/bin:/bin"
    PATH="$shim_dir:$safe_path" HOME="$fake_home" bash "$DEV_GUARD_HOOK" <<< "$payload" 2>/dev/null || true
}

# make_tmp_with_marker — create a fake HOME (marker is no longer read by dev-guard.sh;
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
# F-002: policy-block.sh degraded floor (bash-native fallback)
# SPEC: with python3 masked from PATH, policy-block.sh must still DENY
#   - a Bash payload containing rm -rf ~  (denylist match)
#   - a Write payload with body containing an AWS access-key token (AKIA… pattern)
# PRE-FIX STATE: the script passes into python3 heredoc with no else branch;
#   when python3 exits 127, the script exits 127 with no output → no decision.
#   This is the exact class: qa-plan C-1 says a "deny" from a malformed path
#   is treated as non-blocking → silent allow. Pre-fix the deny is entirely absent.
# ============================================================================
echo
echo "############################################################"
echo "# F-002: policy-block.sh degraded floor (python3 masked)"
echo "############################################################"

# Case F002-1: rm -rf ~ with python3 masked → DENY (denylist)
echo
echo "=== F-002-1: Bash 'rm -rf ~' with python3 masked from PATH -> EXACT DENY ==="
# FAILING PRE-FIX: exits 127, emits no permissionDecision
OUT_F002_1=$(run_policy_with_masked_python3 '{"tool_name":"Bash","tool_input":{"command":"rm -rf ~"}}')
assert_exact_deny "F002-1: rm -rf ~ with python3 masked -> degraded floor denies" "$OUT_F002_1"

# Case F002-2: Write with AWS access-key pattern, python3 masked → DENY (high-confidence secret)
# Note: AWS key split across variable to prevent static scanner firing on this source file.
_AWS_PREFIX="AKIA"
_AWS_SUFFIX="1234567890ABCDEF"
_AWS_KEY="${_AWS_PREFIX}${_AWS_SUFFIX}"
echo
echo "=== F-002-2: Write with AWS access-key token, python3 masked -> EXACT DENY ==="
# FAILING PRE-FIX: exits 127, emits no permissionDecision
OUT_F002_2=$(run_policy_with_masked_python3 "{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"/tmp/cfg.py\",\"content\":\"KEY=${_AWS_KEY}\"}}")
assert_exact_deny "F002-2: Write AWS-key-pattern with python3 masked -> degraded floor denies" "$OUT_F002_2"

# Case F002-3: rm -rf / with python3 masked → DENY (denylist)
echo
echo "=== F-002-3: Bash 'rm -rf /' with python3 masked -> EXACT DENY ==="
OUT_F002_3=$(run_policy_with_masked_python3 '{"tool_name":"Bash","tool_input":{"command":"rm -rf /"}}')
assert_exact_deny "F002-3: rm -rf / with python3 masked -> degraded floor denies" "$OUT_F002_3"

# Case F002-4: JSON shape check (qa-plan C-1 — exact shape, not just substring)
# A malformed deny that lacks hookSpecificOutput would be treated as non-blocking.
echo
echo "=== F-002-4 (C-1 JSON shape): degraded deny must include hookSpecificOutput wrapper ==="
OUT_F002_4=$(run_policy_with_masked_python3 '{"tool_name":"Bash","tool_input":{"command":"rm -rf ~"}}')
if echo "$OUT_F002_4" | grep -q '"permissionDecision":[[:space:]]*"deny"' && \
   echo "$OUT_F002_4" | grep -q '"hookSpecificOutput"'; then
    PASS=$((PASS + 1))
    echo "  [PASS] JSON shape: degraded deny output has well-formed hookSpecificOutput"
else
    FAIL=$((FAIL + 1))
    FAILURES+=("JSON shape: degraded deny missing hookSpecificOutput or permissionDecision:deny | got: ${OUT_F002_4:-<empty>}")
    echo "  [FAIL] JSON shape: degraded deny output malformed (got: ${OUT_F002_4:-<empty>})"
fi

# Case F002-5: Non-matching command with python3 masked → NO DECISION (not blanket deny-all)
# The plan explicitly states the degraded path must NOT deny-all (the #298 lesson).
echo
echo "=== F-002-5: git status with python3 masked -> NODECISION (no blanket deny-all) ==="
OUT_F002_5=$(run_policy_with_masked_python3 '{"tool_name":"Bash","tool_input":{"command":"git status"}}')
assert_nodecision "F002-5: git status with python3 masked -> nodecision (not deny-all)" "$OUT_F002_5"

# Case F002-6: python3 path still denies rm -rf ~ (regression guard — must not break)
echo
echo "=== F-002-6 (regression guard): rm -rf ~ with python3 available -> EXACT DENY ==="
OUT_F002_6=$(printf '%s\n' '{"tool_name":"Bash","tool_input":{"command":"rm -rf ~"}}' | bash "$POLICY_HOOK" 2>/dev/null || true)
assert_exact_deny "F002-6: rm -rf ~ with python3 available -> deny (python3 path not regressed)" "$OUT_F002_6"


# ---------------------------------------------------------------------------
# ============================================================================
# F-015: Windows backslash path denial in policy-block.sh
# SPEC: Write/Edit targeting Windows backslash paths must be DENIED on both
#   the python3 path and the degraded bash path.
# PRE-FIX STATE: SENSITIVE_PATHS match forward-slash anchors (^|/) only;
#   backslash paths produce no match → no decision (fail-open).
# ============================================================================
echo
echo "############################################################"
echo "# F-015: policy-block.sh Windows backslash path denial"
echo "############################################################"

# Case F015-1: C:\Users\x\.ssh\id_rsa (Windows-style absolute backslash path) → DENY
echo
echo "=== F-015-1: Write C:\\Users\\x\\.ssh\\id_rsa (backslash) -> EXACT DENY ==="
# JSON double-backslash represents a single backslash in the JSON string value.
# FAILING PRE-FIX: SENSITIVE_PATHS only match forward-slash; backslash path passes through.
OUT_F015_1=$(printf '%s\n' '{"tool_name":"Write","tool_input":{"file_path":"C:\\Users\\x\\.ssh\\id_rsa"}}' | bash "$POLICY_HOOK" 2>/dev/null || true)
assert_exact_deny "F015-1: Write C:\\Users\\x\\.ssh\\id_rsa (backslash .ssh path) -> deny" "$OUT_F015_1"

# Case F015-2: D:\app\.env (backslash .env path) → DENY
echo
echo "=== F-015-2: Write D:\\app\\.env (backslash) -> EXACT DENY ==="
# FAILING PRE-FIX: .env pattern anchors (^|/) forward-slash only.
OUT_F015_2=$(printf '%s\n' '{"tool_name":"Write","tool_input":{"file_path":"D:\\app\\.env"}}' | bash "$POLICY_HOOK" 2>/dev/null || true)
assert_exact_deny "F015-2: Write D:\\app\\.env (backslash .env path) -> deny" "$OUT_F015_2"

# Case F015-3: ..\secrets.yaml (relative backslash path) → DENY
echo
echo "=== F-015-3: Write ..\\secrets.yaml (relative backslash) -> EXACT DENY ==="
# FAILING PRE-FIX: relative backslash path bypasses SENSITIVE_PATHS match.
OUT_F015_3=$(printf '%s\n' '{"tool_name":"Write","tool_input":{"file_path":"..\\secrets.yaml"}}' | bash "$POLICY_HOOK" 2>/dev/null || true)
assert_exact_deny "F015-3: Write ..\\secrets.yaml (relative backslash) -> deny" "$OUT_F015_3"

# Case F015-4: C:\Users\x\.ssh\id_rsa on DEGRADED (python3 masked) path → DENY
echo
echo "=== F-015-4 (degraded path): C:\\Users\\x\\.ssh\\id_rsa with python3 masked -> EXACT DENY ==="
OUT_F015_4=$(run_policy_with_masked_python3 '{"tool_name":"Write","tool_input":{"file_path":"C:\\Users\\x\\.ssh\\id_rsa"}}')
assert_exact_deny "F015-4: C:\\Users\\x\\.ssh\\id_rsa on degraded path -> deny" "$OUT_F015_4"

# Case F015-5: forward-slash control still denies (regression guard)
echo
echo "=== F-015-5 (regression guard): /home/u/.ssh/id_rsa (forward-slash) still DENIES ==="
OUT_F015_5=$(printf '%s\n' '{"tool_name":"Write","tool_input":{"file_path":"/home/u/.ssh/id_rsa"}}' | bash "$POLICY_HOOK" 2>/dev/null || true)
assert_exact_deny "F015-5: /home/u/.ssh/id_rsa (forward-slash) -> deny (regression guard)" "$OUT_F015_5"

# Case F015-6: non-sensitive backslash path is NOT denied
echo
echo "=== F-015-6: Write C:\\src\\app.py (non-sensitive backslash) -> NODECISION ==="
OUT_F015_6=$(printf '%s\n' '{"tool_name":"Write","tool_input":{"file_path":"C:\\src\\app.py","content":"x=1"}}' | bash "$POLICY_HOOK" 2>/dev/null || true)
assert_nodecision "F015-6: C:\\src\\app.py (non-sensitive backslash) -> nodecision (not over-denied)" "$OUT_F015_6"


# ---------------------------------------------------------------------------
# ============================================================================
# F-016: dev-guard.sh escape-aware command extraction (bash fallback)
# SPEC: with python3 masked, the compound command
#   git commit -m "msg" && git push origin feat/x
# must be correctly extracted so 'git push' is seen and the hook returns ASK.
# PRE-FIX STATE: the grep fallback uses [^"]* which truncates at the first
# embedded quote; git push is invisible → no ask emitted (no decision).
# ============================================================================
echo
echo "############################################################"
echo "# F-016: dev-guard.sh escape-aware extraction (python3 masked)"
echo "############################################################"

COMPOUND_PAYLOAD='{"tool_name":"Bash","tool_input":{"command":"git commit -m \"msg\" && git push origin feat/x"}}'

# Case F016-1: compound command with embedded quote, python3 masked → ASK (unconditional)
echo
echo "=== F-016-1: 'git commit -m \"msg\" && git push' with python3 masked -> EXACT ASK ==="
TMP_F016=$(make_tmp_with_marker)
# FAILING PRE-FIX: grep fallback uses [^"]* — truncates at first quote; git push not seen → nodecision
OUT_F016_1=$(run_dev_guard_with_masked_python3 "$TMP_F016" "$COMPOUND_PAYLOAD")
assert_exact_ask "F016-1: compound cmd with embedded quote (python3 masked) -> ask (git push seen)" "$OUT_F016_1"

# Case F016-2: standalone git push still asks with python3 masked (regression guard)
echo
echo "=== F-016-2 (regression guard): standalone 'git push origin main' with python3 masked -> EXACT ASK ==="
TMP_F016B=$(make_tmp_with_marker)
OUT_F016_2=$(run_dev_guard_with_masked_python3 "$TMP_F016B" \
    '{"tool_name":"Bash","tool_input":{"command":"git push origin main"}}')
assert_exact_ask "F016-2: standalone git push (python3 masked) -> ask (regression guard)" "$OUT_F016_2"

# Case F016-3: python3 path for same compound command still asks (regression guard)
echo
echo "=== F-016-3 (regression guard): compound command with python3 available -> EXACT ASK ==="
TMP_F016C=$(make_tmp_with_marker)
OUT_F016_3=$(HOME="$TMP_F016C" bash "$DEV_GUARD_HOOK" <<< "$COMPOUND_PAYLOAD" 2>/dev/null || true)
assert_exact_ask "F016-3: compound cmd with python3 available -> ask (unconditional, regression guard)" "$OUT_F016_3"


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
OUT_F010_1=$(CWD="$TMP_EMPTY_CWD" HOME="$TMP_HOME_F010" bash "$CHECKPOINT_HOOK" <<< "$TASK_PAYLOAD" 2>/dev/null || true)
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
OUT_F010_2=$(CWD="$TMP_EMPTY_CWD2" HOME="$TMP_HOME_F010B" bash "$CHECKPOINT_HOOK" <<< "$TASK_PAYLOAD" 2>/dev/null || true)
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
OUT_F010_3=$(CWD="$TMP_OWN_CWD" HOME="$TMP_HOME_F010C" bash "$CHECKPOINT_HOOK" <<< "$TASK_PAYLOAD" 2>/dev/null || true)
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

OUT_F018_1=$(CWD="$TMP_MULTI" bash "$CHECKPOINT_HOOK" <<< "$TASK_PAYLOAD" 2>/dev/null || true)
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

OUT_F018_2=$(CWD="$TMP_MULTI2" bash "$CHECKPOINT_HOOK" <<< "$TASK_PAYLOAD" 2>/dev/null || true)
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
OUT_F008_RT1=$( ( export PATH="/usr/bin:/bin"; HOME="$TMP_F008_RT1" bash "$DEV_GUARD_HOOK" <<< "$F008_RT1_PAYLOAD" 2>/dev/null ) || true )
assert_exact_ask "F008-RT-1: multi-word ClickUp server (underscore segment) outward write -> ask" "$OUT_F008_RT1"

# Case F008-RT-2: single-word ClickUp server (no underscores in server segment)
#   tool_name: mcp__clickup__clickup_create_task -> unconditional ASK
# Regression guard: this matched even pre-fix with [^_][^_]*, must continue to match.
echo
echo "=== F008-RT-2 (regression guard): mcp__clickup__clickup_create_task (unconditional) -> EXACT ASK ==="
TMP_F008_RT2=$(make_tmp_with_marker)
F008_RT2_PAYLOAD='{"tool_name":"mcp__clickup__clickup_create_task","tool_input":{}}'
OUT_F008_RT2=$( ( export PATH="/usr/bin:/bin"; HOME="$TMP_F008_RT2" bash "$DEV_GUARD_HOOK" <<< "$F008_RT2_PAYLOAD" 2>/dev/null ) || true )
assert_exact_ask "F008-RT-2: single-word ClickUp server outward write -> ask (regression guard)" "$OUT_F008_RT2"

# Case F008-RT-3: ClickUp read/GET tool (not in write alternation) -> NO DECISION (no over-match)
#   tool_name: mcp__claude_ai_ClickUp__clickup_get_task — read verb, not gated
echo
echo "=== F008-RT-3: mcp__claude_ai_ClickUp__clickup_get_task (read verb) -> NODECISION (not over-matched) ==="
TMP_F008_RT3=$(make_tmp_with_marker)
F008_RT3_PAYLOAD='{"tool_name":"mcp__claude_ai_ClickUp__clickup_get_task","tool_input":{}}'
OUT_F008_RT3=$( ( export PATH="/usr/bin:/bin"; HOME="$TMP_F008_RT3" bash "$DEV_GUARD_HOOK" <<< "$F008_RT3_PAYLOAD" 2>/dev/null ) || true )
assert_nodecision "F008-RT-3: ClickUp read tool (get_task) -> nodecision (write gate does not over-match reads)" "$OUT_F008_RT3"


# ---------------------------------------------------------------------------
# ============================================================================
# M3a / M3b / M3c — dual-path parity (bash-degraded path)
# SPEC: with python3 masked, the bash-degraded path must agree with python3 on
#   all M3 decisions: egress read guard (M3a), config-anti-weakening (M3b),
#   and the --no-verify tokenizer including SEC-001 new evasion forms (M3c).
# ============================================================================
echo
echo "############################################################"
echo "# M3 dual-path parity: bash-degraded path (python3 masked)"
echo "############################################################"

# --- M3a: egress read guard (bash-degraded) ---
echo
echo "=== M3-DUAL-1: M3a — Read .env with python3 masked -> EXACT ASK ==="
OUT_M3D_1=$(run_policy_with_masked_python3 '{"tool_name":"Read","tool_input":{"file_path":"/home/u/.env"}}')
assert_exact_ask "M3-DUAL-1: Read .env (bash-degraded) -> ask (parity with python3)" "$OUT_M3D_1"

echo
echo "=== M3-DUAL-2: M3a — Read private.key with python3 masked -> EXACT ASK ==="
OUT_M3D_2=$(run_policy_with_masked_python3 '{"tool_name":"Read","tool_input":{"file_path":"/etc/ssl/private.key"}}')
assert_exact_ask "M3-DUAL-2: Read private.key (bash-degraded) -> ask" "$OUT_M3D_2"

echo
echo "=== M3-DUAL-3: M3a — Read .env.example (allowlisted) with python3 masked -> NODECISION ==="
OUT_M3D_3=$(run_policy_with_masked_python3 '{"tool_name":"Read","tool_input":{"file_path":"/home/u/.env.example"}}')
assert_nodecision "M3-DUAL-3: Read .env.example (bash-degraded, allowlisted) -> nodecision" "$OUT_M3D_3"

# --- M3b: config-anti-weakening (bash-degraded) ---
echo
echo "=== M3-DUAL-4: M3b — rules emptied in .eslintrc with python3 masked -> EXACT ASK ==="
OUT_M3D_4=$(run_policy_with_masked_python3 '{"tool_name":"Edit","tool_input":{"file_path":"/app/.eslintrc.json","old_string":"\"rules\":{\"no-console\":\"error\"}","new_string":"\"rules\":{  }"}}')
assert_exact_ask "M3-DUAL-4: eslintrc rules emptied (bash-degraded) -> ask (parity with python3)" "$OUT_M3D_4"

echo
echo "=== M3-DUAL-5: M3b — ruff.toml select=[] with python3 masked -> EXACT ASK ==="
OUT_M3D_5=$(run_policy_with_masked_python3 '{"tool_name":"Write","tool_input":{"file_path":"/app/ruff.toml","content":"[lint]\nselect = []\nline-length = 120"}}')
assert_exact_ask "M3-DUAL-5: ruff.toml select=[] (bash-degraded) -> ask (parity with python3)" "$OUT_M3D_5"

echo
echo "=== M3-DUAL-6: M3b — TypeScript strict disabled with python3 masked -> EXACT ASK ==="
OUT_M3D_6=$(run_policy_with_masked_python3 '{"tool_name":"Edit","tool_input":{"file_path":"/app/tsconfig.json","old_string":"\"strict\": true","new_string":"\"strict\": false"}}')
assert_exact_ask "M3-DUAL-6: tsconfig strict:false (bash-degraded) -> ask (parity with python3)" "$OUT_M3D_6"

# --- M3c: --no-verify tokenizer including SEC-001 new evasion forms (bash-degraded) ---
echo
echo "=== M3-DUAL-7: M3c — git commit --no-verify with python3 masked -> EXACT DENY ==="
OUT_M3D_7=$(run_policy_with_masked_python3 '{"tool_name":"Bash","tool_input":{"command":"git commit --no-verify -m \"bypass\""}}')
assert_exact_deny "M3-DUAL-7: git commit --no-verify (bash-degraded) -> deny" "$OUT_M3D_7"

echo
echo "=== M3-DUAL-8: M3c SEC-001 — git commit -n with python3 masked -> EXACT DENY ==="
OUT_M3D_8=$(run_policy_with_masked_python3 '{"tool_name":"Bash","tool_input":{"command":"git commit -n -m \"bypass\""}}')
assert_exact_deny "M3-DUAL-8: git commit -n (bash-degraded) -> deny (SEC-001 short alias)" "$OUT_M3D_8"

echo
echo "=== M3-DUAL-9: M3c SEC-001 — git commit -nm with python3 masked -> EXACT DENY ==="
OUT_M3D_9=$(run_policy_with_masked_python3 '{"tool_name":"Bash","tool_input":{"command":"git commit -nm \"bypass hooks\""}}')
assert_exact_deny "M3-DUAL-9: git commit -nm (bash-degraded) -> deny (SEC-001 cluster)" "$OUT_M3D_9"

echo
echo "=== M3-DUAL-10: M3c SEC-001 — git commit --no-ver with python3 masked -> EXACT DENY ==="
OUT_M3D_10=$(run_policy_with_masked_python3 '{"tool_name":"Bash","tool_input":{"command":"git commit --no-ver -m \"bypass\""}}')
assert_exact_deny "M3-DUAL-10: git commit --no-ver (bash-degraded) -> deny (SEC-001 prefix)" "$OUT_M3D_10"

echo
echo "=== M3-DUAL-11: M3c SEC-001 — git push -n (dry-run) with python3 masked -> NODECISION ==="
OUT_M3D_11=$(run_policy_with_masked_python3 '{"tool_name":"Bash","tool_input":{"command":"git push -n origin feature/x"}}')
assert_nodecision "M3-DUAL-11: git push -n (bash-degraded, dry-run not bypass) -> nodecision" "$OUT_M3D_11"

echo
echo "=== M3-DUAL-12: M3c SEC-002 — -m body mentions --no-verify with python3 masked -> NODECISION ==="
# SEC-002: the bash-degraded path must NOT falsely deny this (false-positive fix).
# Both python3 and bash paths must agree: the string in a -m body is not a real flag.
OUT_M3D_12=$(run_policy_with_masked_python3 '{"tool_name":"Bash","tool_input":{"command":"git commit -m \"fixes the --no-verify bypass\""}}')
assert_nodecision "M3-DUAL-12: git commit -m body has --no-verify (bash-degraded) -> nodecision (no false-positive)" "$OUT_M3D_12"


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
