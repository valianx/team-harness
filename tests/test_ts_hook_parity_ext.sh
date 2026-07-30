#!/bin/bash
# Extension sections 8-12 for test_ts_hook_parity.sh
# Golden-fixture regression checks for all rewritten hook bodies (AC-9, AC-10,
# AC-11) — converted from Bash<->TS parity to literal expected-decision
# assertions once the Bash oracle was retired (issue #446).
# This file is SOURCED by test_ts_hook_parity.sh after Section 7.
# Variables PASS, FAIL, FAILURES, REPO_ROOT are inherited from the parent.

# Shared extraction helper (matches nested {"hookSpecificOutput":{"permissionDecision":"..."}})
ext_decision() {
    local out="$1"
    if [ -z "$out" ] || ! echo "$out" | grep -q '"permissionDecision"'; then
        echo "none"
        return
    fi
    echo "$out" | grep -oE '"permissionDecision"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 \
        | sed -E 's/.*"permissionDecision"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/'
}

# ---------------------------------------------------------------------------
# policy-block has its focused boundary suite in test_policy_block.sh. Its
# former entropy/workflow fixtures were retired with those policies.
# Section 9 — gcp-guard golden-fixture smoke check (AC-10)
# The exhaustive gcp-guard suite lives in tests/test_gcp_guard.sh (Suite 87);
# this section stays as a lightweight cross-check exercised from this harness.
# ---------------------------------------------------------------------------
echo ""
echo "--- Section 9: gcp-guard golden-fixture smoke check (AC-10) ---"
GCP_TS_CJS="$REPO_ROOT/hooks/ts/dist/gcp-guard.cjs"

gcp_assert_expected() {
    local label="$1" cmd="$2" expected="$3"
    local payload ts_out ts_dec
    payload=$(python3 -c "import json,sys; print(json.dumps({'tool_name':'Bash','tool_input':{'command':sys.argv[1]}}))" "$cmd" 2>/dev/null)
    ts_out=$(echo "$payload" | node "$GCP_TS_CJS" 2>/dev/null)
    ts_dec=$(ext_decision "$ts_out")
    if [ "$ts_dec" = "$expected" ]; then
        PASS=$((PASS + 1)); echo "  [PASS] $label (TS=$ts_dec)"
    else
        FAIL=$((FAIL + 1)); FAILURES+=("AC-10 gcp-guard: $label (expected=$expected TS=$ts_dec)")
        echo "  [FAIL] $label (expected=$expected TS=$ts_dec)"
    fi
}

if [ ! -f "$GCP_TS_CJS" ]; then
    echo "  [SKIP] gcp-guard.cjs not found"
else
    gcp_assert_expected "gcloud list" "gcloud compute instances list" "none"
    gcp_assert_expected "gcloud describe" "gcloud compute instances describe my-vm" "none"
    gcp_assert_expected "gcloud create" "gcloud compute instances create my-vm" "ask"
    gcp_assert_expected "gcloud delete" "gcloud compute instances delete my-vm" "ask"
    gcp_assert_expected "gcloud projects delete" "gcloud projects delete my-project" "deny"
    gcp_assert_expected "non-gcloud ls" "ls -la" "none"
fi

# ---------------------------------------------------------------------------
# Section 10 — checkpoint-guard fail-open (AC-10)
# ---------------------------------------------------------------------------
echo ""
echo "--- Section 10: checkpoint-guard fail-open (AC-10) ---"
CP_TS_CJS="$REPO_ROOT/hooks/ts/dist/checkpoint-guard.cjs"

if [ ! -f "$CP_TS_CJS" ]; then
    echo "  [SKIP] checkpoint-guard.cjs not found"
else
    # The Bash oracle's allow() always emits an explicit permissionDecision:
    # "allow" JSON (checkpoint-guard.sh:30-33) — including every fail-open
    # branch (no workspace found, non-Task dispatch). "none" (empty stdout)
    # was never the oracle's actual contract for these cases; the TS body is
    # now aligned to it (T6c).
    cp_task=$(python3 -c "import json; print(json.dumps({'tool_name':'Task','tool_input':{'description':'do it'}}))")
    cp_out=$(echo "$cp_task" | node "$CP_TS_CJS" 2>/dev/null)
    cp_dec=$(ext_decision "$cp_out")
    if [ "$cp_dec" = "allow" ]; then
        PASS=$((PASS + 1)); echo "  [PASS] AC-10: checkpoint-guard no-workspace → fail-open (explicit allow)"
    else
        FAIL=$((FAIL + 1)); FAILURES+=("AC-10: checkpoint-guard fail-open got=$cp_dec")
        echo "  [FAIL] AC-10: fail-open expected allow, got=$cp_dec"
    fi
    cp_bash_p=$(python3 -c "import json; print(json.dumps({'tool_name':'Bash','tool_input':{'command':'ls'}}))")
    cp_nt_out=$(echo "$cp_bash_p" | node "$CP_TS_CJS" 2>/dev/null)
    cp_nt=$(ext_decision "$cp_nt_out")
    if [ "$cp_nt" = "allow" ]; then
        PASS=$((PASS + 1)); echo "  [PASS] AC-10: checkpoint-guard non-Task → explicit allow"
    else
        FAIL=$((FAIL + 1)); FAILURES+=("AC-10: checkpoint non-Task got=$cp_nt")
        echo "  [FAIL] AC-10: non-Task expected allow, got=$cp_nt"
    fi
fi

# ---------------------------------------------------------------------------
# Section 11 — worktree-guard advisory (AC-10)
# ---------------------------------------------------------------------------
echo ""
echo "--- Section 11: worktree-guard advisory (AC-10) ---"
WT_TS_CJS="$REPO_ROOT/hooks/ts/dist/worktree-guard.cjs"

if [ ! -f "$WT_TS_CJS" ]; then
    echo "  [SKIP] worktree-guard.cjs not found"
else
    wt_trig_p=$(python3 -c "import json; print(json.dumps({'tool_name':'Bash','tool_input':{'command':'git checkout -b feat/new'}}))")
    wt_trig_out=$(echo "$wt_trig_p" | node "$WT_TS_CJS" 2>/dev/null)
    wt_d=$(ext_decision "$wt_trig_out")
    if [ "$wt_d" = "ask" ]; then
        PASS=$((PASS + 1)); echo "  [PASS] AC-10: worktree-guard trigger → ask"
    else
        FAIL=$((FAIL + 1)); FAILURES+=("AC-10: worktree trigger got=$wt_d")
        echo "  [FAIL] AC-10: trigger expected ask, got=$wt_d"
    fi

    wt_nt_p=$(python3 -c "import json; print(json.dumps({'tool_name':'Bash','tool_input':{'command':'git status'}}))")
    wt_nt_out=$(echo "$wt_nt_p" | node "$WT_TS_CJS" 2>/dev/null)
    wt_nd=$(ext_decision "$wt_nt_out")
    if [ "$wt_nd" = "none" ]; then
        PASS=$((PASS + 1)); echo "  [PASS] AC-10: worktree-guard non-trigger → none"
    else
        FAIL=$((FAIL + 1)); FAILURES+=("AC-10: worktree non-trigger got=$wt_nd")
        echo "  [FAIL] AC-10: non-trigger expected none, got=$wt_nd"
    fi

    wt_add_p=$(python3 -c "import json; print(json.dumps({'tool_name':'Bash','tool_input':{'command':'git worktree add -b feat/x ../wt origin/main'}}))")
    wt_add_out=$(echo "$wt_add_p" | node "$WT_TS_CJS" 2>/dev/null)
    wt_ad=$(ext_decision "$wt_add_out")
    if [ "$wt_ad" = "ask" ]; then
        PASS=$((PASS + 1)); echo "  [PASS] AC-10: git worktree add → ask"
    else
        FAIL=$((FAIL + 1)); FAILURES+=("AC-10: git worktree add got=$wt_ad")
        echo "  [FAIL] AC-10: worktree add expected ask, got=$wt_ad"
    fi
fi

# ---------------------------------------------------------------------------
# Section 12 — session-start + language-user-prompt (AC-11)
# ---------------------------------------------------------------------------
echo ""
echo "--- Section 12: session-start + language-user-prompt (AC-11) ---"
SS_TS_CJS="$REPO_ROOT/hooks/ts/dist/session-start.cjs"
LP_TS_CJS="$REPO_ROOT/hooks/ts/dist/language-user-prompt.cjs"

if [ ! -f "$SS_TS_CJS" ]; then
    echo "  [SKIP] session-start.cjs not found"
else
    # additionalContext lives under hookSpecificOutput (T6c envelope fix) —
    # not at the top level. code.claude.com/docs/en/hooks; matches the Bash
    # oracle (session-start.sh:272).
    ss_in=$(python3 -c "import json; print(json.dumps({'type':'startup','session_id':'t123'}))")
    ss_out=$(echo "$ss_in" | node "$SS_TS_CJS" 2>/dev/null)
    ss_has=$(echo "$ss_out" | grep -c '"additionalContext"' 2>/dev/null || echo "0")
    ss_nonempty=$(echo "$ss_out" | python3 -c "import json,sys; d=json.loads(sys.stdin.read() or '{}'); print('yes' if d.get('hookSpecificOutput',{}).get('additionalContext') else 'no')" 2>/dev/null || echo "no")
    if [ "$ss_has" -ge 1 ] && [ "$ss_nonempty" = "yes" ]; then
        PASS=$((PASS + 1)); echo "  [PASS] AC-11: session-start emits non-empty additionalContext"
    else
        FAIL=$((FAIL + 1)); FAILURES+=("AC-11: session-start should emit additionalContext")
        echo "  [FAIL] AC-11: additionalContext missing or empty"
    fi
    ss_orch=$(echo "$ss_out" | python3 -c "import json,sys; d=json.loads(sys.stdin.read() or '{}'); c=d.get('hookSpecificOutput',{}).get('additionalContext',''); print('yes' if 'orchestrator disposition is active' in c else 'no')" 2>/dev/null || echo "no")
    if [ "$ss_orch" = "yes" ]; then
        PASS=$((PASS + 1)); echo "  [PASS] AC-11: orchestrator disposition present (load 1 unconditional)"
    else
        FAIL=$((FAIL + 1)); FAILURES+=("AC-11: orchestrator disposition missing from session-start")
        echo "  [FAIL] AC-11: orchestrator disposition missing"
    fi
fi

if [ ! -f "$LP_TS_CJS" ]; then
    echo "  [SKIP] language-user-prompt.cjs not found"
else
    lp_in=$(python3 -c "import json; print(json.dumps({'type':'user_prompt','message':'hello'}))")
    lp_out=$(echo "$lp_in" | node "$LP_TS_CJS" 2>/dev/null)
    # Valid output: empty string OR valid JSON (no crash).
    if [ -z "$lp_out" ] || echo "$lp_out" | python3 -c "import json,sys; json.loads(sys.stdin.read())" 2>/dev/null; then
        PASS=$((PASS + 1)); echo "  [PASS] AC-11: language-user-prompt produces valid output (or empty)"
    else
        FAIL=$((FAIL + 1)); FAILURES+=("AC-11: language-user-prompt invalid output")
        echo "  [FAIL] AC-11: language-user-prompt invalid output"
    fi
fi
