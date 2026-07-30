#!/usr/bin/env bash
# tests/run-behavioral.sh
#
# Wrapper for tests that exercise end-to-end runtime behavior rather than a
# single function — a real process, real inputs, real exit codes.
#
# Why separate from tests/run-all.sh: these are slower and may need environment
# the default run does not guarantee (a TTY, setsid, a specific shell), so each
# test checks its own prerequisites and skips cleanly rather than failing.
#
# What does NOT belong here: any test whose pass condition is a model reporting
# that it followed a rule, and any test pinned to an architecture that no longer
# ships. Both classes were retired — see README.md § "What gets a test".
#
# When to run: before tagging a release, and after changing anything under bin/.
#
# Usage:
#   bash tests/run-behavioral.sh
# Exit:
#   0 if all behavioral tests pass, 1 if any fail.

set -uo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# No hard dependency on the `claude` CLI. Every test that dispatched an agent to
# have it self-report compliance was retired (README.md § "What gets a test") —
# what remains here exercises deterministic code with real inputs and exit codes,
# and each test declares and checks its own prerequisites. A test that does need
# an authenticated CLI must check for it itself and skip cleanly.

ANY_FAILED=0
TOTAL=0
declare -a FAILED_TESTS=()

# Each behavioral test lives in its own tests/test_*_behavioral.sh file.
# This wrapper runs all of them and aggregates.
for test_script in "$REPO_ROOT"/tests/test_*_behavioral.sh; do
    [ -f "$test_script" ] || continue
    name="$(basename "$test_script" .sh)"
    echo
    echo "############################################################"
    echo "# Running: $name"
    echo "############################################################"
    TOTAL=$((TOTAL + 1))
    if bash "$test_script"; then
        echo "$name: PASS"
    else
        echo "$name: FAIL"
        ANY_FAILED=1
        FAILED_TESTS+=("$name")
    fi
done

echo
echo "############################################################"
if [ "$TOTAL" -eq 0 ]; then
    echo "# No behavioral tests found (tests/test_*_behavioral.sh)."
    echo "############################################################"
    exit 0
fi

if [ "$ANY_FAILED" -eq 0 ]; then
    echo "# All $TOTAL behavioral test(s) passed."
    echo "############################################################"
    exit 0
fi

echo "# Behavioral tests FAILED: ${FAILED_TESTS[*]}"
echo "############################################################"
exit 1
