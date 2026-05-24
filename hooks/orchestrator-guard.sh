#!/bin/bash
# orchestrator-guard.sh — PreToolUse hook for the Agent tool
# Blocks Agent calls with subagent_type=th-orchestrator to prevent the
# nesting problem: if the orchestrator runs as a subagent, it loses the
# Task tool and cannot dispatch its own agents.
#
# When blocked, the deny reason instructs the LLM to read the orchestrator's
# instructions and run the pipeline at top level (depth 0), dispatching
# phase agents directly.
#
# Cross-platform: bash + python3 (same pattern as policy-block.sh).
# Exits 0 always — denials are communicated via permissionDecision in JSON.

PAYLOAD=$(cat)

PAYLOAD="$PAYLOAD" python3 - <<'PYEOF'
import json
import os
import sys

try:
    payload = json.loads(os.environ.get("PAYLOAD", ""))
except Exception:
    sys.exit(0)

tool = payload.get("tool_name", "")
if tool != "Agent":
    sys.exit(0)

tool_input = payload.get("tool_input", {})
subagent = tool_input.get("subagent_type", "")

if subagent == "th-orchestrator":
    json.dump({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": (
                "Blocked: th-orchestrator must not run as a subagent (nesting "
                "strips the Task tool, making it unable to dispatch phase agents). "
                "Instead: read ~/.claude/agents/th-orchestrator.md, assume the "
                "orchestrator role at top level, and dispatch phase agents "
                "(architect, implementer, tester, qa, security, delivery, etc.) "
                "directly via Agent(). See ~/.claude/CLAUDE.md "
                "'th-orchestrator inline execution' rule."
            ),
        }
    }, sys.stdout)

sys.exit(0)
PYEOF
