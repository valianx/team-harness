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
if [ $FAILED -eq 0 ]; then
    echo "# All suites passed."
    echo "############################################################"
    exit 0
else
    echo "# $FAILED suite(s) failed."
    echo "############################################################"
    exit 1
fi
