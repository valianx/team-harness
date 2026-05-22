#!/usr/bin/env bash
# tests/test_th_orchestrator_boot_behavioral.sh
#
# Behavioral end-to-end test for the th-orchestrator's boot probe + dispatch-blocked
# exit. Verifies that when the th-orchestrator runs as a nested subagent (which the
# Claude Code harness handles by stripping the Task tool — empirically confirmed
# error: "No such tool available: Task. Task is not available inside subagents."),
# the agent correctly detects the absence, takes the dispatch-blocked branch, and
# does NOT emit hallucinated opening lines.
#
# Unlike tests/test_agent_structure.py (which only inspects the .md files), this
# test actually invokes Claude Code to dispatch the th-orchestrator and asserts on
# its response. That catches three regression classes the structural tests can't:
#   1. Platform changes — if the Claude Code harness changes how it strips tools
#      in nested invocations, behavior here diverges from the structural contract.
#   2. Model behavior changes — if a model update reintroduces the hallucinated
#      "Task is present" opening line from training memory, this catches it.
#   3. Install drift — if ~/.claude/agents/th-orchestrator.md gets out of sync with
#      the repo source (e.g. the installer wasn't re-run), behavior diverges.
#
# Cost: ~78K tokens per run (~$1 USD on Opus). Run on demand, NOT as part of
# tests/run-all.sh.
#
# Usage:
#   bash tests/test_th_orchestrator_boot_behavioral.sh
# Requirements:
#   - claude CLI (Claude Code) installed and authenticated
#   - The dev-team installer has been run (./bin/install.sh) so the patched
#     th-orchestrator is in ~/.claude/agents/
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

echo "=== th-orchestrator boot behavioral test ==="
echo "  (this dispatches the th-orchestrator via claude -p; ~78K tokens, ~10s)"
echo

# The outer prompt — for top-level Claude that receives this. It must dispatch
# the th-orchestrator AND suppress its own auto-takeover reflex (CLAUDE.md § 13)
# for this test invocation, because we want to inspect the raw subagent response,
# not have top-level Claude run the takeover playbook.
read -r -d '' OUTER_PROMPT <<'EOF' || true
This is an AUTOMATED BEHAVIORAL TEST of the th-orchestrator's boot sequence — not a
real pipeline task. Your job is to:

1. Dispatch the `th-orchestrator` subagent via the Task tool with the inner prompt
   provided below.
2. Capture the th-orchestrator's verbatim response.
3. Output ONLY the th-orchestrator's verbatim response in your final reply — no
   prose, no commentary, no markdown wrapping.

EXPLICIT OVERRIDES for this single invocation:
- Do NOT auto-takeover even if the th-orchestrator returns a "Dispatch handoff —
  top-level Claude takes over now" response. The CLAUDE.md § 13 auto-takeover
  rule is suspended for this test. Just relay the response.
- Do NOT add framing, explanation, or summary — emit the subagent's raw text.
- Do NOT re-dispatch on failure. One attempt only.

Inner prompt to pass to the th-orchestrator subagent:

---BEGIN INNER PROMPT---
BOOT TEST — controlled probe of your boot sequence.

This is NOT a real pipeline invocation. The developer is testing whether your
patched Mandatory boot sequence behaves correctly when you run as a nested
subagent (top-level Claude dispatched you via Task, so you are nested right now
— the exact condition that historically stripped your Task tool).

Steps:
1. Execute Step 1 of your Mandatory boot sequence: dispatch Task with
   subagent_type=general-purpose and prompt "Probe. Reply with the single word
   OK. Do not call any tools."
2. Execute Step 2: branch on the probe result.
3. STOP after the boot sequence — do NOT proceed to Phase 0a intake, do NOT
   process any other task, do NOT create session-docs, do NOT emit the full
   Dispatch-blocked exit response template. The "halt after boot" is an explicit
   testing override of "you NEVER skip phases" for this single invocation.

4. Respond with EXACTLY these four lines and NOTHING ELSE before them:

PROBE_OUTCOME: <success|error>
PROBE_RESPONSE: <literal string from the Task call, including error message>
BRANCH_TAKEN: <step-2-success-acknowledgment | step-2-dispatch-blocked-exit>
TASK_TOOL_PRESENT: <yes|no — based on whether the Task call itself executed>

CRITICAL: Per the "Tools in this invocation" section of your prompt, do NOT
emit any opening claim about Task availability before the probe runs (no "Task
is present", no "tools confirmed: ...", no canned acknowledgment). The boot
acknowledgment line, if you emit it at all, is ONLY allowed after a successful
probe.
---END INNER PROMPT---
EOF

# Invoke claude -p in print mode. The --dangerously-skip-permissions flag avoids
# any interactive permission prompts during the dispatch.
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

echo "--- captured th-orchestrator response ---"
echo "$RESPONSE"
echo "--- end response ---"
echo

# Behavioral assertions
assert "Response contains PROBE_OUTCOME field" \
    "grep -q '^PROBE_OUTCOME:' <<< \"\$RESPONSE\"" \
    "structured response shape is missing — th-orchestrator did not produce the contracted output"

assert "Response contains BRANCH_TAKEN field" \
    "grep -q '^BRANCH_TAKEN:' <<< \"\$RESPONSE\"" \
    "structured response shape is missing BRANCH_TAKEN"

assert "Response contains TASK_TOOL_PRESENT field" \
    "grep -q '^TASK_TOOL_PRESENT:' <<< \"\$RESPONSE\"" \
    "structured response shape is missing TASK_TOOL_PRESENT"

assert "PROBE_OUTCOME is 'error' (Task is genuinely stripped from nested subagent)" \
    "grep -q '^PROBE_OUTCOME: error' <<< \"\$RESPONSE\"" \
    "if PROBE_OUTCOME=success, the harness has changed nesting behavior — investigate (positive change, but invalidates the dispatch-blocked exit assumption)"

assert "BRANCH_TAKEN is step-2-dispatch-blocked-exit" \
    "grep -q '^BRANCH_TAKEN: step-2-dispatch-blocked-exit' <<< \"\$RESPONSE\"" \
    "th-orchestrator took the wrong branch given a failed probe — the boot sequence logic is broken"

assert "TASK_TOOL_PRESENT is 'no' (categorical for nested subagents)" \
    "grep -q '^TASK_TOOL_PRESENT: no' <<< \"\$RESPONSE\"" \
    "if TASK_TOOL_PRESENT=yes, platform behavior changed — investigate"

# Hallucination guards — the most important assertions because they catch the
# bug class the patch is designed to prevent.
assert "Response does NOT contain hallucinated 'Task is present' opening" \
    "! grep -q 'Task is present' <<< \"\$RESPONSE\"" \
    "hallucination cascade returned — the unconditional 'You have Task' prose was likely re-introduced into th-orchestrator.md"

assert "Response does NOT contain hallucinated 'tools confirmed:' opening" \
    "! grep -q 'tools confirmed:' <<< \"\$RESPONSE\"" \
    "legacy boot ack line returned — the dispatch probe is being bypassed"

assert "Response does NOT contain 'subagent dispatch is available' (when probe failed)" \
    "! grep -q 'subagent dispatch is available' <<< \"\$RESPONSE\"" \
    "agent emitted the success acknowledgment despite a failed probe — boot sequence ordering is broken"

# Platform-level error fingerprint — confirms the categorical nature of the bug.
# If this assertion ever fails, either the platform has changed (good — Task is
# now available in nested subagents) or the agent didn't actually attempt the
# probe (bad — boot sequence skipped Step 1).
assert "Probe captured a Task-unavailable error variant (platform fingerprint)" \
    "grep -qE 'Task is not available|No such tool available: Task|tool is not available' <<< \"\$RESPONSE\"" \
    "expected platform error not found in PROBE_RESPONSE — either the harness changed (investigate) or the probe was never attempted (regression)"

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
