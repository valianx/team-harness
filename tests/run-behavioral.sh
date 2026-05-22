#!/usr/bin/env bash
# tests/run-behavioral.sh
#
# Wrapper for behavioral regression tests — the subset that actually dispatches
# agents via `claude -p` to verify end-to-end behavior, NOT just file structure.
#
# Why separate from tests/run-all.sh:
#   - Each behavioral test costs ~$1 USD and takes ~10s. Not suitable for
#     pre-commit or on every save.
#   - Requires `claude` CLI authenticated and the dev-team installer already
#     run (so ~/.claude/agents/ has the current versions).
#   - Catches regression classes that structural tests cannot:
#       1. Platform changes — Claude Code harness behavior (e.g. how Task is
#          stripped in nested subagents) changing under us.
#       2. Model behavior regressions — a model update reintroducing
#          hallucination patterns we'd previously trained out.
#       3. Install drift — ~/.claude/agents/ out of sync with repo source
#          because the installer wasn't re-run after a recent edit.
#
# When to run:
#   - Before tagging a release.
#   - After upgrading Claude Code (claude --version changed).
#   - After editing any agents/*.md prompt that touches contract-critical prose
#     (status blocks, boot sequences, dispatch invariants).
#   - Weekly, as a heartbeat against silent platform drift.
#
# Usage:
#   bash tests/run-behavioral.sh
# Exit:
#   0 if all behavioral tests pass, 1 if any fail.

set -uo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Dependency check — fail fast if the environment is wrong.
if ! command -v claude >/dev/null 2>&1; then
    echo "ERROR: claude CLI not found in PATH. Install Claude Code first."
    exit 1
fi

if [ ! -f "$HOME/.claude/agents/th-orchestrator.md" ]; then
    echo "ERROR: ~/.claude/agents/th-orchestrator.md not found."
    echo "Run \`uv run bin/install.py\` first to install the agents."
    exit 1
fi

# Sanity check: warn if installed th-orchestrator differs from repo source. The
# behavioral tests probe the INSTALLED version, so divergence is a false signal.
if ! diff -q "$HOME/.claude/agents/th-orchestrator.md" "$REPO_ROOT/agents/th-orchestrator.md" >/dev/null 2>&1; then
    echo "WARN: ~/.claude/agents/th-orchestrator.md differs from repo source."
    echo "      Behavioral tests will probe the INSTALLED version."
    echo "      If you've edited agents/th-orchestrator.md recently, run:"
    echo "        uv run bin/install.py"
    echo "      to propagate. Continuing anyway in 3s..."
    sleep 3
fi

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
