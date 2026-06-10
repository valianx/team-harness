#!/bin/bash
# tests/run-all.sh
# Convenience wrapper that runs every suite in tests/ and summarises results.
# Returns exit 0 if all suites pass, 1 otherwise.

set -u

TESTS_DIR="$(cd "$(dirname "$0")" && pwd)"

FAILED=0

echo "############################################################"
echo "# Suite 1: hooks/policy-block.sh — functional tests"
echo "############################################################"
if bash "$TESTS_DIR/test_policy_block.sh"; then
    echo "policy-block: PASS"
else
    echo "policy-block: FAIL"
    FAILED=$((FAILED + 1))
fi

echo
echo "############################################################"
echo "# Suite 2: agents/skills/hooks — structural tests"
echo "############################################################"
if python3 "$TESTS_DIR/test_agent_structure.py"; then
    echo "agent-structure: PASS"
else
    echo "agent-structure: FAIL"
    FAILED=$((FAILED + 1))
fi

echo
echo "############################################################"
echo "# Suite 3: agents — YAML frontmatter validity"
echo "############################################################"
if uv run --with PyYAML python "$TESTS_DIR/test_agent_frontmatter.py"; then
    echo "agent-frontmatter: PASS"
else
    echo "agent-frontmatter: FAIL"
    FAILED=$((FAILED + 1))
fi

echo
echo "############################################################"
echo "# Suite 4: hooks/checkpoint-guard.sh — functional tests"
echo "############################################################"
if bash "$TESTS_DIR/test_checkpoint_guard.sh"; then
    echo "checkpoint-guard: PASS"
else
    echo "checkpoint-guard: FAIL"
    FAILED=$((FAILED + 1))
fi

echo
echo "############################################################"
echo "# Suite 5: hooks/dev-guard.sh — behavioral tests"
echo "############################################################"
if bash "$TESTS_DIR/test_dev_guard.sh"; then
    echo "dev-guard: PASS"
else
    echo "dev-guard: FAIL"
    FAILED=$((FAILED + 1))
fi

echo
echo "############################################################"
echo "# Suite 6: hooks/language-session-start.sh — functional tests"
echo "############################################################"
if bash "$TESTS_DIR/test_language_hook.sh"; then
    echo "language-hook: PASS"
else
    echo "language-hook: FAIL"
    FAILED=$((FAILED + 1))
fi

echo
echo "############################################################"
echo "# Suite 7: hooks/language-user-prompt.sh — functional tests"
echo "############################################################"
if bash "$TESTS_DIR/test_language_user_prompt.sh"; then
    echo "language-user-prompt: PASS"
else
    echo "language-user-prompt: FAIL"
    FAILED=$((FAILED + 1))
fi

echo
echo "############################################################"
echo "# Suite 8: hooks/sketch-guard.sh — functional tests"
echo "############################################################"
if bash "$TESTS_DIR/test_sketch_guard.sh"; then
    echo "sketch-guard: PASS"
else
    echo "sketch-guard: FAIL"
    FAILED=$((FAILED + 1))
fi

echo
echo "############################################################"
echo "# Suite 9: hooks isolated-env harness (Suite 84)"
echo "############################################################"
if bash "$TESTS_DIR/test_isolated_hook_env.sh"; then
    echo "isolated-hook-env: PASS"
else
    echo "isolated-hook-env: FAIL"
    FAILED=$((FAILED + 1))
fi

echo
echo "############################################################"
if [ $FAILED -eq 0 ]; then
    echo "# All suites passed."
    echo "############################################################"
    exit 0
else
    echo "# $FAILED suite(s) failed."
    echo "############################################################"
    exit 1
fi
