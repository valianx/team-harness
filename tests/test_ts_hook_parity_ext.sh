#!/bin/bash
# Extension sections 8-12 for test_ts_hook_parity.sh
# Run gate parity checks for all rewritten hook bodies (AC-9, AC-10, AC-11).
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
# Section 8 — policy-block parity (AC-9, AC-10)
# ---------------------------------------------------------------------------
echo ""
echo "--- Section 8: policy-block parity (AC-9, AC-10) ---"

PB_BASH_HOOK="$REPO_ROOT/hooks/policy-block.sh"
PB_TS_CJS="$REPO_ROOT/hooks/ts/dist/policy-block.cjs"

pb_assert_match() {
    local label="$1" payload="$2"
    local bash_out ts_out bash_dec ts_dec
    bash_out=$(echo "$payload" | bash "$PB_BASH_HOOK" 2>/dev/null)
    ts_out=$(echo "$payload" | node "$PB_TS_CJS" 2>/dev/null)
    bash_dec=$(ext_decision "$bash_out")
    ts_dec=$(ext_decision "$ts_out")
    if [ "$bash_dec" = "$ts_dec" ]; then
        PASS=$((PASS + 1)); echo "  [PASS] $label (Bash=$bash_dec TS=$ts_dec)"
    else
        FAIL=$((FAIL + 1)); FAILURES+=("AC-9/10 policy-block: $label (Bash=$bash_dec TS=$ts_dec)")
        echo "  [FAIL] $label (Bash=$bash_dec TS=$ts_dec)"
    fi
}

if [ ! -f "$PB_TS_CJS" ]; then
    echo "  [SKIP] policy-block.cjs not found"
else
    # Build test payloads via python3 to avoid shell quoting issues.
    # DENIED_BASH patterns
    p1=$(python3 -c "import json; print(json.dumps({'tool_name':'Bash','tool_input':{'command':'rm -rf /'}}))")
    pb_assert_match "rm -rf / (deny)" "$p1"
    p2=$(python3 -c "import json; print(json.dumps({'tool_name':'Bash','tool_input':{'command':'git push --force origin main'}}))")
    pb_assert_match "git push --force (deny)" "$p2"
    p3=$(python3 -c "import json; print(json.dumps({'tool_name':'Bash','tool_input':{'command':'git reset --hard HEAD~1'}}))")
    pb_assert_match "git reset --hard (deny)" "$p3"
    p4=$(python3 -c "import json; print(json.dumps({'tool_name':'Bash','tool_input':{'command':'git clean -f'}}))")
    pb_assert_match "git clean -f (deny)" "$p4"
    p5=$(python3 -c "import json; print(json.dumps({'tool_name':'Bash','tool_input':{'command':'psql -c \"DROP TABLE users\"'}}))")
    pb_assert_match "DROP TABLE (deny)" "$p5"
    p6=$(python3 -c "import json; print(json.dumps({'tool_name':'Bash','tool_input':{'command':'git commit --no-verify -m msg'}}))")
    pb_assert_match "git commit --no-verify (deny)" "$p6"
    p7=$(python3 -c "import json; print(json.dumps({'tool_name':'Write','tool_input':{'file_path':'/home/user/.env','content':'SECRET=abc'}}))")
    pb_assert_match "Write .env path (deny)" "$p7"
    p8=$(python3 -c "import json; print(json.dumps({'tool_name':'Write','tool_input':{'file_path':'/home/user/.env.example','content':'SECRET=placeholder'}}))")
    pb_assert_match ".env.example allowlisted (none)" "$p8"
    # GitHub PAT test fixture — syntactically valid known test pattern (NOT a real token).
    gh_pat_token="ghp_$(python3 -c "print('a'*40)")"
    p9=$(python3 -c "import json,sys; print(json.dumps({'tool_name':'Write','tool_input':{'file_path':'/tmp/out.py','content':'token = ' + repr(sys.argv[1])}}))" "$gh_pat_token")
    pb_assert_match "GitHub PAT in Write (deny)" "$p9"
    p10=$(python3 -c "import json; print(json.dumps({'tool_name':'Bash','tool_input':{'command':'ls -la'}}))")
    pb_assert_match "ls -la (none)" "$p10"
    p11=$(python3 -c "import json; print(json.dumps({'tool_name':'Bash','tool_input':{'command':'echo hello'}}))")
    pb_assert_match "echo hello (none)" "$p11"

    # AC-9 entropy: low entropy value (all same char, ~0 bits/char) → none
    low_ent_p=$(python3 -c "import json; print(json.dumps({'tool_name':'Write','tool_input':{'file_path':'/tmp/t.py','content':'API_KEY=aaaaaaaaaaaaaaaaaaaaa'}}))")
    low_ts_out=$(echo "$low_ent_p" | node "$PB_TS_CJS" 2>/dev/null)
    ts_low=$(ext_decision "$low_ts_out")
    if [ "$ts_low" = "none" ]; then
        PASS=$((PASS + 1)); echo "  [PASS] AC-9: low-entropy API_KEY → none"
    else
        FAIL=$((FAIL + 1)); FAILURES+=("AC-9: low-entropy should be none (got=$ts_low)")
        echo "  [FAIL] AC-9: low-entropy API_KEY expected none, got=$ts_low"
    fi

    # AC-9 entropy: high-entropy value → ask
    # Use a value whose entropy is clearly > 3.5 (32 unique chars, entropy = 5.0 bits/char).
    high_val="xK9mP2nQ7rL4sT1vW6yZ3uB8cF0eH5jA"
    high_ent_p=$(python3 -c "import json,sys; print(json.dumps({'tool_name':'Write','tool_input':{'file_path':'/tmp/t.py','content':'API_KEY=' + sys.argv[1]}}))" "$high_val")
    high_ts_out=$(echo "$high_ent_p" | node "$PB_TS_CJS" 2>/dev/null)
    ts_high=$(ext_decision "$high_ts_out")
    # Compute expected entropy to dynamically determine expected decision.
    expected_entropy=$(python3 -c "
import math, sys
val = sys.argv[1]
freq = {}
for c in val: freq[c] = freq.get(c, 0) + 1
n = len(val)
ent = -sum((f/n)*math.log2(f/n) for f in freq.values())
print('ask' if ent >= 3.5 else 'none')
" "$high_val" 2>/dev/null || echo "ask")
    if [ "$ts_high" = "$expected_entropy" ]; then
        PASS=$((PASS + 1)); echo "  [PASS] AC-9: high-entropy API_KEY → $ts_high (expected=$expected_entropy)"
    else
        FAIL=$((FAIL + 1)); FAILURES+=("AC-9: entropy boundary mismatch (TS=$ts_high expected=$expected_entropy)")
        echo "  [FAIL] AC-9: entropy boundary: TS=$ts_high expected=$expected_entropy"
    fi

    # ---------------------------------------------------------------------------
    # AC-9 SEC-DR-E: Hard-boundary fixtures (just below / just above the 3.5 threshold).
    #
    # Strings are constructed from uniform character distributions whose entropy
    # is analytically derivable:
    #
    #   BELOW: 11 unique chars, each appearing 2× = 22 chars
    #          H = log2(11) = 3.4594… < 3.5 → should NOT trigger (none)
    #
    #   ABOVE: 12 unique chars (a-h appear 2×, i-l appear 1×), total 20 chars
    #          H = 3.5219… > 3.5 → SHOULD trigger (ask)
    #
    # These values are stable under IEEE-754 double arithmetic on both Python and
    # JS (both use the same underlying FP instruction for log2); no last-bit drift
    # is possible at these character-frequency distributions.
    # ---------------------------------------------------------------------------

    # SEC-DR-E boundary BELOW (H = log2(11) = 3.4594... < 3.5) → none
    # Value: 11 unique ASCII chars each appearing exactly twice (22 chars total)
    boundary_below_val="abcdefghijkabcdefghijk"
    boundary_below_H=$(python3 -c "
import math, sys
val = sys.argv[1]
freq = {}
for c in val: freq[c] = freq.get(c,0)+1
n = len(val)
print(f'{-sum((f/n)*math.log2(f/n) for f in freq.values()):.6f}')
" "$boundary_below_val" 2>/dev/null || echo "3.459432")
    boundary_below_p=$(python3 -c "import json,sys; print(json.dumps({'tool_name':'Write','tool_input':{'file_path':'/tmp/t.py','content':'API_KEY='+sys.argv[1]}}))" "$boundary_below_val")
    boundary_below_out=$(echo "$boundary_below_p" | node "$PB_TS_CJS" 2>/dev/null)
    boundary_below_dec=$(ext_decision "$boundary_below_out")
    if [ "$boundary_below_dec" = "none" ]; then
        PASS=$((PASS + 1)); echo "  [PASS] AC-9 SEC-DR-E: boundary-BELOW (H=$boundary_below_H < 3.5) → none"
    else
        FAIL=$((FAIL + 1)); FAILURES+=("AC-9 SEC-DR-E: boundary-below got=$boundary_below_dec expected=none (H=$boundary_below_H)")
        echo "  [FAIL] AC-9 SEC-DR-E: boundary-BELOW (H=$boundary_below_H) expected=none got=$boundary_below_dec"
    fi

    # SEC-DR-E boundary ABOVE (H = 3.5219... > 3.5) → ask
    # Value: 12 unique ASCII chars (a-h appear 2×, i-l appear 1×), total 20 chars
    boundary_above_val="abcdefghijklabcdefgh"
    boundary_above_H=$(python3 -c "
import math, sys
val = sys.argv[1]
freq = {}
for c in val: freq[c] = freq.get(c,0)+1
n = len(val)
print(f'{-sum((f/n)*math.log2(f/n) for f in freq.values()):.6f}')
" "$boundary_above_val" 2>/dev/null || echo "3.521928")
    boundary_above_p=$(python3 -c "import json,sys; print(json.dumps({'tool_name':'Write','tool_input':{'file_path':'/tmp/t.py','content':'API_KEY='+sys.argv[1]}}))" "$boundary_above_val")
    boundary_above_out=$(echo "$boundary_above_p" | node "$PB_TS_CJS" 2>/dev/null)
    boundary_above_dec=$(ext_decision "$boundary_above_out")
    if [ "$boundary_above_dec" = "ask" ]; then
        PASS=$((PASS + 1)); echo "  [PASS] AC-9 SEC-DR-E: boundary-ABOVE (H=$boundary_above_H > 3.5) → ask"
    else
        FAIL=$((FAIL + 1)); FAILURES+=("AC-9 SEC-DR-E: boundary-above got=$boundary_above_dec expected=ask (H=$boundary_above_H)")
        echo "  [FAIL] AC-9 SEC-DR-E: boundary-ABOVE (H=$boundary_above_H) expected=ask got=$boundary_above_dec"
    fi

    # ---------------------------------------------------------------------------
    # AC-9 SEC-DR-E: Python re vs JS RegExp divergence fixtures.
    #
    # Tests MULTILINE (^ in JS /m flag matches start-of-line, same as re.MULTILINE)
    # and compound-name prefixes (\w+_ before the keyword, e.g. SMTP_TOKEN, DB_PASSWORD).
    # Both engines must agree on these cases, matching the entropy-gated ask path.
    # Uses the above-boundary value (H=3.5219) for all divergence fixtures.
    # ---------------------------------------------------------------------------

    # MULTILINE: high-entropy token appears after a newline (^ start-of-line anchor)
    # Python re.MULTILINE matches ^ at start of each line; JS /m flag does the same.
    multiline_content="first_line_prefix
API_KEY=${boundary_above_val}"
    multiline_p=$(python3 -c "import json,sys; print(json.dumps({'tool_name':'Write','tool_input':{'file_path':'/tmp/t.py','content':sys.argv[1]}}))" "$multiline_content")
    multiline_bash_out=$(echo "$multiline_p" | bash "$PB_BASH_HOOK" 2>/dev/null)
    multiline_ts_out=$(echo "$multiline_p" | node "$PB_TS_CJS" 2>/dev/null)
    multiline_bash_dec=$(ext_decision "$multiline_bash_out")
    multiline_ts_dec=$(ext_decision "$multiline_ts_out")
    if [ "$multiline_bash_dec" = "$multiline_ts_dec" ] && [ "$multiline_ts_dec" = "ask" ]; then
        PASS=$((PASS + 1)); echo "  [PASS] AC-9 SEC-DR-E: MULTILINE parity (newline before API_KEY) Bash=$multiline_bash_dec TS=$multiline_ts_dec"
    else
        FAIL=$((FAIL + 1)); FAILURES+=("AC-9 SEC-DR-E: MULTILINE parity mismatch Bash=$multiline_bash_dec TS=$multiline_ts_dec")
        echo "  [FAIL] AC-9 SEC-DR-E: MULTILINE parity Bash=$multiline_bash_dec TS=$multiline_ts_dec (both expected ask)"
    fi

    # Compound-name prefix: SMTP_TOKEN= (\\w+_ before TOKEN keyword)
    smtp_p=$(python3 -c "import json,sys; print(json.dumps({'tool_name':'Write','tool_input':{'file_path':'/tmp/t.py','content':'SMTP_TOKEN='+sys.argv[1]}}))" "$boundary_above_val")
    smtp_bash_out=$(echo "$smtp_p" | bash "$PB_BASH_HOOK" 2>/dev/null)
    smtp_ts_out=$(echo "$smtp_p" | node "$PB_TS_CJS" 2>/dev/null)
    smtp_bash_dec=$(ext_decision "$smtp_bash_out")
    smtp_ts_dec=$(ext_decision "$smtp_ts_out")
    if [ "$smtp_bash_dec" = "$smtp_ts_dec" ] && [ "$smtp_ts_dec" = "ask" ]; then
        PASS=$((PASS + 1)); echo "  [PASS] AC-9 SEC-DR-E: compound-name SMTP_TOKEN parity Bash=$smtp_bash_dec TS=$smtp_ts_dec"
    else
        FAIL=$((FAIL + 1)); FAILURES+=("AC-9 SEC-DR-E: compound SMTP_TOKEN parity mismatch Bash=$smtp_bash_dec TS=$smtp_ts_dec")
        echo "  [FAIL] AC-9 SEC-DR-E: compound-name SMTP_TOKEN parity Bash=$smtp_bash_dec TS=$smtp_ts_dec (both expected ask)"
    fi

    # Compound-name prefix: DB_PASSWORD= (\\w+_ before PASSWORD keyword)
    dbpw_p=$(python3 -c "import json,sys; print(json.dumps({'tool_name':'Write','tool_input':{'file_path':'/tmp/t.py','content':'DB_PASSWORD='+sys.argv[1]}}))" "$boundary_above_val")
    dbpw_bash_out=$(echo "$dbpw_p" | bash "$PB_BASH_HOOK" 2>/dev/null)
    dbpw_ts_out=$(echo "$dbpw_p" | node "$PB_TS_CJS" 2>/dev/null)
    dbpw_bash_dec=$(ext_decision "$dbpw_bash_out")
    dbpw_ts_dec=$(ext_decision "$dbpw_ts_out")
    if [ "$dbpw_bash_dec" = "$dbpw_ts_dec" ] && [ "$dbpw_ts_dec" = "ask" ]; then
        PASS=$((PASS + 1)); echo "  [PASS] AC-9 SEC-DR-E: compound-name DB_PASSWORD parity Bash=$dbpw_bash_dec TS=$dbpw_ts_dec"
    else
        FAIL=$((FAIL + 1)); FAILURES+=("AC-9 SEC-DR-E: compound DB_PASSWORD parity mismatch Bash=$dbpw_bash_dec TS=$dbpw_ts_dec")
        echo "  [FAIL] AC-9 SEC-DR-E: compound-name DB_PASSWORD parity Bash=$dbpw_bash_dec TS=$dbpw_ts_dec (both expected ask)"
    fi
fi

# ---------------------------------------------------------------------------
# Section 9 — gcp-guard parity (AC-10)
# ---------------------------------------------------------------------------
echo ""
echo "--- Section 9: gcp-guard parity (AC-10) ---"
GCP_BASH_HOOK="$REPO_ROOT/hooks/gcp-guard.sh"
GCP_TS_CJS="$REPO_ROOT/hooks/ts/dist/gcp-guard.cjs"

gcp_assert_match() {
    local label="$1" cmd="$2"
    local payload bash_out ts_out bash_dec ts_dec
    payload=$(python3 -c "import json,sys; print(json.dumps({'tool_name':'Bash','tool_input':{'command':sys.argv[1]}}))" "$cmd" 2>/dev/null)
    bash_out=$(echo "$payload" | bash "$GCP_BASH_HOOK" 2>/dev/null)
    ts_out=$(echo "$payload" | node "$GCP_TS_CJS" 2>/dev/null)
    bash_dec=$(ext_decision "$bash_out")
    ts_dec=$(ext_decision "$ts_out")
    if [ "$bash_dec" = "$ts_dec" ]; then
        PASS=$((PASS + 1)); echo "  [PASS] $label (Bash=$bash_dec TS=$ts_dec)"
    else
        FAIL=$((FAIL + 1)); FAILURES+=("AC-10 gcp-guard: $label (Bash=$bash_dec TS=$ts_dec)")
        echo "  [FAIL] $label (Bash=$bash_dec TS=$ts_dec)"
    fi
}

if [ ! -f "$GCP_TS_CJS" ]; then
    echo "  [SKIP] gcp-guard.cjs not found"
elif [ ! -x "$GCP_BASH_HOOK" ]; then
    echo "  [SKIP] gcp-guard.sh not executable"
else
    gcp_assert_match "gcloud list (none)" "gcloud compute instances list"
    gcp_assert_match "gcloud describe (none)" "gcloud compute instances describe my-vm"
    gcp_assert_match "gcloud create (ask)" "gcloud compute instances create my-vm"
    gcp_assert_match "gcloud delete (ask)" "gcloud compute instances delete my-vm"
    gcp_assert_match "gcloud projects delete (deny)" "gcloud projects delete my-project"
    gcp_assert_match "non-gcloud ls (none)" "ls -la"
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
    cp_task=$(python3 -c "import json; print(json.dumps({'tool_name':'Task','tool_input':{'description':'do it'}}))")
    cp_out=$(echo "$cp_task" | node "$CP_TS_CJS" 2>/dev/null)
    cp_dec=$(ext_decision "$cp_out")
    if [ "$cp_dec" = "none" ]; then
        PASS=$((PASS + 1)); echo "  [PASS] AC-10: checkpoint-guard no-workspace → fail-open (none)"
    else
        FAIL=$((FAIL + 1)); FAILURES+=("AC-10: checkpoint-guard fail-open got=$cp_dec")
        echo "  [FAIL] AC-10: fail-open expected none, got=$cp_dec"
    fi
    cp_bash_p=$(python3 -c "import json; print(json.dumps({'tool_name':'Bash','tool_input':{'command':'ls'}}))")
    cp_nt_out=$(echo "$cp_bash_p" | node "$CP_TS_CJS" 2>/dev/null)
    cp_nt=$(ext_decision "$cp_nt_out")
    if [ "$cp_nt" = "none" ]; then
        PASS=$((PASS + 1)); echo "  [PASS] AC-10: checkpoint-guard non-Task → none"
    else
        FAIL=$((FAIL + 1)); FAILURES+=("AC-10: checkpoint non-Task got=$cp_nt")
        echo "  [FAIL] AC-10: non-Task expected none, got=$cp_nt"
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
    ss_in=$(python3 -c "import json; print(json.dumps({'type':'startup','session_id':'t123'}))")
    ss_out=$(echo "$ss_in" | node "$SS_TS_CJS" 2>/dev/null)
    ss_has=$(echo "$ss_out" | grep -c '"additionalContext"' 2>/dev/null || echo "0")
    ss_nonempty=$(echo "$ss_out" | python3 -c "import json,sys; d=json.loads(sys.stdin.read() or '{}'); print('yes' if d.get('additionalContext') else 'no')" 2>/dev/null || echo "no")
    if [ "$ss_has" -ge 1 ] && [ "$ss_nonempty" = "yes" ]; then
        PASS=$((PASS + 1)); echo "  [PASS] AC-11: session-start emits non-empty additionalContext"
    else
        FAIL=$((FAIL + 1)); FAILURES+=("AC-11: session-start should emit additionalContext")
        echo "  [FAIL] AC-11: additionalContext missing or empty"
    fi
    ss_orch=$(echo "$ss_out" | python3 -c "import json,sys; d=json.loads(sys.stdin.read() or '{}'); c=d.get('additionalContext',''); print('yes' if 'orchestrator disposition is active' in c else 'no')" 2>/dev/null || echo "no")
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
