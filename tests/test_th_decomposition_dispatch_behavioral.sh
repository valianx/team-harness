#!/usr/bin/env bash
# tests/test_th_decomposition_dispatch_behavioral.sh
#
# Behavioral test for the orchestrator's decomposition + dispatch decision on a
# single-repo, multi-deliverable scope (issue #444, concern 2 — dispatch
# enforcement). Verifies that, given a scope that decomposes into 2+
# independent tasks within one repository, the orchestrator:
#   (i)   ALWAYS attempts the decomposition analysis (never proceeds monolithic
#         without running it);
#   (ii)  defaults to PARALLEL dispatch for the resulting multi-task scope
#         (Multi-Task Orchestration, not sequential);
#   (iii) does NOT emit a "sequential or parallel?" question before
#         parallelizing — the legitimate upstream entry gates (Discover-
#         disposition, write-mode Y/n) may still fire, but those are distinct
#         from a parallelism ask.
#
# This is a controlled structured-response probe, not a full pipeline run —
# the inner prompt instructs the orchestrator to walk through its Step 9
# decomposition analysis and report the decision WITHOUT creating workspaces
# or dispatching any Task calls, keeping the run cheap (~1 call, no
# subagent fan-out) and deterministic to parse.
#
# Cost: ~1 agent call (~$1 USD on Opus, no subagent dispatch). Run on demand,
# NOT as part of tests/run-all.sh. Auto-discovered by tests/run-behavioral.sh
# (tests/test_*_behavioral.sh glob).
#
# Usage:
#   bash tests/test_th_decomposition_dispatch_behavioral.sh
# Requirements:
#   - claude CLI (Claude Code) installed and authenticated
#   - The dev-team installer has been run (./bin/install.sh) so the patched
#     orchestrator is in ~/.claude/agents/
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

echo "=== orchestrator decomposition + dispatch behavioral test ==="
echo "  (this dispatches the orchestrator via claude -p; single call, ~10s)"
echo

read -r -d '' OUTER_PROMPT <<'EOF' || true
This is an AUTOMATED BEHAVIORAL TEST of the orchestrator's decomposition and
dispatch decision — not a real pipeline task. Your job is to:

1. Dispatch the `orchestrator` subagent via the Task tool with the inner prompt
   provided below.
2. Capture the orchestrator's verbatim response.
3. Output ONLY the orchestrator's verbatim response in your final reply — no
   prose, no commentary, no markdown wrapping.

EXPLICIT OVERRIDES for this single invocation:
- Do NOT auto-takeover even if the orchestrator returns a "Dispatch handoff —
  top-level Claude takes over now" response. Just relay the response.
- Do NOT add framing, explanation, or summary — emit the subagent's raw text.
- Do NOT re-dispatch on failure. One attempt only.

Inner prompt to pass to the orchestrator subagent:

---BEGIN INNER PROMPT---
DISPATCH-DECISION TEST — controlled probe of your decomposition + dispatch
logic. This is NOT a real pipeline invocation. Do NOT create any workspaces,
do NOT dispatch any Task calls to architect/implementer/etc., do NOT process
this as a real feature request.

Scope under evaluation (single repository, both items are independent
REST endpoints with no shared code path):
"Add rate limiting to the /orders endpoint AND add rate limiting to the
/invoices endpoint."

Steps:
1. Walk through Step 9 (decomposition analysis) of your Phase 0a boot
   sequence against the scope above, exactly as you would for a real request.
2. Determine: does this scope decompose into 2+ independent tasks? What
   dispatch mode would you use (parallel worktrees via Multi-Task
   Orchestration, or sequential)? Would you ask the operator whether to run
   sequential or parallel before proceeding?
3. STOP after reporting the decision — do NOT proceed to Phase 0b, do NOT
   create workspaces, do NOT dispatch any further Task calls. The "halt after
   decision" is an explicit testing override for this single invocation.

Respond with EXACTLY these six lines and NOTHING ELSE before them:

DECOMPOSITION_RAN: <yes|no>
TASK_COUNT: <integer>
DISPATCH_MODE: <parallel|sequential|single>
ASKED_PARALLELISM: <yes|no>
GATES_MENTIONED: <comma-separated list, or "none">
RATIONALE: <one sentence>

Field definitions:
- DECOMPOSITION_RAN: "yes" if you actually ran the Step 9 decomposition
  analysis against this scope (regardless of outcome).
- TASK_COUNT: the number of independent tasks you identified.
- DISPATCH_MODE: "parallel" if you would dispatch the identified tasks via
  Multi-Task Orchestration (parallel worktrees); "sequential" if one at a
  time; "single" if you concluded this is one atomic task.
- ASKED_PARALLELISM: "yes" ONLY if your answer includes emitting a question
  to the operator asking whether to run sequential or parallel. Upstream
  entry gates (Discover-disposition confirm, write-mode Y/n) are NOT a
  parallelism ask — answer "no" if the only gates you'd apply are those.
- GATES_MENTIONED: any gate/confirmation you would still apply before
  dispatching (e.g. "Discover-disposition, write-mode Y/n"), or "none".
- RATIONALE: one sentence citing which section of your contract governs this
  (e.g. "Multi-Task Orchestration is parallel-by-default and ungated").
---END INNER PROMPT---
EOF

RESPONSE_FILE="$(mktemp)"
trap 'rm -f "$RESPONSE_FILE"' EXIT

if ! claude -p \
    --dangerously-skip-permissions \
    --output-format text \
    "$OUTER_PROMPT" >"$RESPONSE_FILE" 2>&1; then
    echo "  [FAIL] claude -p invocation failed"
    echo "  --- captured output ---"
    cat "$RESPONSE_FILE"
    echo "  --- end output ---"
    exit 1
fi

RESPONSE="$(cat "$RESPONSE_FILE")"

echo "--- captured orchestrator response ---"
echo "$RESPONSE"
echo "--- end response ---"
echo

# Structured-shape assertions
assert "Response contains DECOMPOSITION_RAN field" \
    "grep -q '^DECOMPOSITION_RAN:' <<< \"\$RESPONSE\"" \
    "structured response shape is missing — orchestrator did not produce the contracted output"

assert "Response contains DISPATCH_MODE field" \
    "grep -q '^DISPATCH_MODE:' <<< \"\$RESPONSE\"" \
    "structured response shape is missing DISPATCH_MODE"

assert "Response contains ASKED_PARALLELISM field" \
    "grep -q '^ASKED_PARALLELISM:' <<< \"\$RESPONSE\"" \
    "structured response shape is missing ASKED_PARALLELISM"

# (i) Always-attempt-decomposition
assert "DECOMPOSITION_RAN is 'yes' (analysis always runs, per Step 9 MANDATORY)" \
    "grep -q '^DECOMPOSITION_RAN: yes' <<< \"\$RESPONSE\"" \
    "orchestrator did not run the decomposition analysis — Step 9's 'always run' contract regressed"

assert "TASK_COUNT is 2 or more (scope is genuinely two independent tasks)" \
    "grep -qE '^TASK_COUNT: [2-9][0-9]*' <<< \"\$RESPONSE\"" \
    "orchestrator did not identify the scope as 2+ independent tasks"

# (ii) Parallel-by-default for multi-task
assert "DISPATCH_MODE is 'parallel' (Multi-Task Orchestration default for 2+ tasks)" \
    "grep -q '^DISPATCH_MODE: parallel' <<< \"\$RESPONSE\"" \
    "orchestrator did not default to parallel dispatch for a single-repo multi-task scope — the parallel-by-default rule regressed"

# (iii) No parallelism-ask, while legitimate entry gates may still fire
assert "ASKED_PARALLELISM is 'no' (no sequential-or-parallel question before parallelizing)" \
    "grep -q '^ASKED_PARALLELISM: no' <<< \"\$RESPONSE\"" \
    "orchestrator asked the operator to choose sequential vs parallel — the ungated single-project multi-task default regressed (do not confuse with the legitimate multi-PROJECT fan-out confirm gate, which is a distinct axis)"

# Summary
echo
TOTAL=$((PASSED + FAILED))
echo "============================================================"
echo "  behavioral tests: $PASSED passed / $TOTAL total"
echo "============================================================"
if [ $FAILED -gt 0 ]; then
    echo
    echo "Failures:"
    for d in "${FAIL_DETAILS[@]}"; do
        echo "  - $d"
    done
    exit 1
fi
exit 0
