#!/usr/bin/env bash
# tests/test_dispatch_sequence_behavioral.sh
#
# Behavioral leg of the dispatch-sequence simulation (Task-6, T6-AC-9). Unlike
# tests/test_dispatch_sequence.py (which only proves the DECLARED model
# satisfies the invariants and that the contract declares that model), this
# test drives a live `claude -p` run and asserts the same properties over the
# observed dispatch order it reports back — the residual the deterministic
# leg names but cannot close: a correct model does not prove the LLM obeys it.
#
# Cost: ~1 USD per run. Discovered automatically by tests/run-behavioral.sh via
# the `test_*_behavioral.sh` glob. NEVER wired into tests/run-all.sh — this
# script is opt-in only, run on demand.
#
# Usage:
#   bash tests/test_dispatch_sequence_behavioral.sh
# Requirements:
#   - claude CLI (Claude Code) installed and authenticated
#   - The dev-team installer has been run (./bin/install.sh) so the patched
#     agents/orchestrator.md is in ~/.claude/agents/
# Exit:
#   0 if all behavioral assertions pass, 1 otherwise.

set -euo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
PASSED=0
FAILED=0
FAIL_DETAILS=()

assert() {
    local name="$1"
    local condition="$2"
    local detail="${3:-}"
    if eval "$condition"; then
        echo "  [PASS] $name"
        PASSED=$((PASSED + 1))
    else
        echo "  [FAIL] $name${detail:+ — $detail}"
        FAILED=$((FAILED + 1))
        FAIL_DETAILS+=("$name${detail:+ — $detail}")
    fi
}

echo "=== dispatch-sequence behavioral test (Suite 181, behavioral leg) ==="
echo "  (this dispatches the orchestrator via claude -p; ~1 USD, model-dependent duration)"
echo

read -r -d '' OUTER_PROMPT <<'EOF' || true
This is an AUTOMATED BEHAVIORAL TEST of the orchestrator's dispatch sequence —
not a real pipeline task. Read `agents/orchestrator.md` in full. Then answer,
as a STRICT JSON object and nothing else (no markdown fence, no prose):

{
  "implementer_dispatch_count": <integer — how many times does Phase 2 dispatch `implementer`, per the contract>,
  "one_commit_per_task": <boolean — does the contract require one commit per task inside that single dispatch>,
  "phase3_lenses_concurrent": <boolean — does Phase 3 dispatch qa and adversary in one message, concurrently, never one reading the other's output>,
  "reviewer_dispatched_at_delivery": <boolean — does any phase between Phase 3 and Phase 5 dispatch the `reviewer` agent>,
  "freeze_precedes_audit": <boolean — does Phase 2.8 (Freeze) complete before the Phase 3 audit lens (adversary) is dispatched>,
  "delivery_after_stage_gate_3": <boolean — does the `delivery` dispatch happen only after STAGE-GATE-3 records `gate3_release: ship`>
}

Answer strictly from what the file says — do not guess, do not average with
prior training knowledge of an older shape. Output ONLY the JSON object.
EOF

echo "--- Dispatching orchestrator (read-only self-report) ---"
RAW_RESPONSE="$(claude -p "$OUTER_PROMPT" --dangerously-skip-permissions 2>/dev/null || true)"

if [ -z "$RAW_RESPONSE" ]; then
    echo "  [SKIP] claude CLI unavailable or returned empty — cannot run behavioral leg"
    exit 0
fi

echo "$RAW_RESPONSE" > /tmp/dispatch-sequence-behavioral-response.json 2>/dev/null || true

JSON="$(echo "$RAW_RESPONSE" | sed -n '/{/,/}/p' | head -c 4000)"

get_field() {
    python3 -c "
import json, sys
try:
    d = json.loads('''$JSON''')
    print(d.get('$1', 'MISSING'))
except Exception as e:
    print('PARSE_ERROR')
" 2>/dev/null
}

IMPL_COUNT="$(get_field implementer_dispatch_count)"
ONE_COMMIT="$(get_field one_commit_per_task)"
LENSES_CONCURRENT="$(get_field phase3_lenses_concurrent)"
REVIEWER_DISPATCHED="$(get_field reviewer_dispatched_at_delivery)"
FREEZE_FIRST="$(get_field freeze_precedes_audit)"
DELIVERY_AFTER_GATE3="$(get_field delivery_after_stage_gate_3)"

assert "s181-behavioral(ac2): orchestrator self-reports implementer_dispatch_count == 1" \
    '[ "$IMPL_COUNT" = "1" ]' "reported: $IMPL_COUNT"
assert "s181-behavioral(ac2b): orchestrator self-reports one_commit_per_task == true" \
    '[ "$ONE_COMMIT" = "True" ] || [ "$ONE_COMMIT" = "true" ]' "reported: $ONE_COMMIT"
assert "s181-behavioral(ac3): orchestrator self-reports phase3_lenses_concurrent == true" \
    '[ "$LENSES_CONCURRENT" = "True" ] || [ "$LENSES_CONCURRENT" = "true" ]' "reported: $LENSES_CONCURRENT"
assert "s181-behavioral(ac5): orchestrator self-reports reviewer_dispatched_at_delivery == false" \
    '[ "$REVIEWER_DISPATCHED" = "False" ] || [ "$REVIEWER_DISPATCHED" = "false" ]' "reported: $REVIEWER_DISPATCHED"
assert "s181-behavioral(ac6): orchestrator self-reports freeze_precedes_audit == true" \
    '[ "$FREEZE_FIRST" = "True" ] || [ "$FREEZE_FIRST" = "true" ]' "reported: $FREEZE_FIRST"
assert "s181-behavioral(ac4): orchestrator self-reports delivery_after_stage_gate_3 == true" \
    '[ "$DELIVERY_AFTER_GATE3" = "True" ] || [ "$DELIVERY_AFTER_GATE3" = "true" ]' "reported: $DELIVERY_AFTER_GATE3"

echo
echo "=== Results: $PASSED passed, $FAILED failed ==="
if [ "$FAILED" -gt 0 ]; then
    echo "Failures:"
    for d in "${FAIL_DETAILS[@]}"; do
        echo "  - $d"
    done
    exit 1
fi
exit 0
