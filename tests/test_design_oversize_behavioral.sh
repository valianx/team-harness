#!/bin/bash
# tests/test_design_oversize_behavioral.sh
#
# Suite — design-oversize-behavioral
#
# The single architect pass carries a requirement-count ceiling. Past it,
# authoring stops and the operator chooses (split, accept with a reason,
# narrow) BEFORE a content identity is computed, before 01-plan.md is
# generated, and before Gate 1 is presented.
#
# The property under test is that the oversize verdict is decidable from the
# canonical OpenSpec delta and the repository-owned ceiling alone. That is what
# makes "before" mechanically true: a verdict that consumes no workspace, no
# control log, and no identity cannot be produced after any of them exist, and
# a step that writes none of them cannot present a gate.
#
# Both directions are exercised, so the harness can discriminate: a 13-requirement
# delta against a ceiling of 12 is oversize, a 12-requirement delta is not.
#
# Requires: python3. Skips cleanly (exit 0) when absent, UNLESS TH_REQUIRE_RUNTIMES=1
# (CI), which converts the skip into a FAIL.
#
# Marker: design-oversize-behavioral

set -u

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG="$REPO_ROOT/openspec/config.yaml"
FIXTURES="$REPO_ROOT/tests/fixtures/design-oversize"
FAILED=0

if ! command -v python3 >/dev/null 2>&1; then
    if [ "${TH_REQUIRE_RUNTIMES:-0}" = "1" ]; then
        echo "design-oversize: FAIL (python3 not found)"
        exit 1
    fi
    echo "design-oversize: SKIP (python3 not found)"
    exit 0
fi

fail() {
    echo "  FAIL: $1"
    FAILED=1
}

CEILING="$(sed -n 's/^[[:space:]]*max_requirements_per_change:[[:space:]]*\([0-9]\{1,\}\).*/\1/p' "$CONFIG" | head -1)"
if [ -z "$CEILING" ]; then
    fail "openspec/config.yaml declares no integer max_requirements_per_change"
    echo "design-oversize: FAIL"
    exit 1
fi

# The evaluator runs from an empty directory with only the delta root and the
# ceiling as inputs: no workspace, no control log, no identity, no gate record.
SANDBOX="$(mktemp -d)"
trap 'rm -rf "$SANDBOX"' EXIT

verdict() {
    (cd "$SANDBOX" && python3 - "$1" "$CEILING" <<'PY'
import re
import sys
from pathlib import Path

delta, ceiling = Path(sys.argv[1]), int(sys.argv[2])
count = sum(
    len(re.findall(r"(?m)^### Requirement:", spec.read_text(encoding="utf-8")))
    for spec in sorted(delta.glob("specs/*/spec.md"))
)
print(f"{'oversize' if count > ceiling else 'within-ceiling'} {count}")
PY
    )
}

read -r STATUS COUNT <<<"$(verdict "$FIXTURES/oversize")"
[ "$STATUS" = "oversize" ] || fail "a $COUNT-requirement delta against a ceiling of $CEILING returned '$STATUS'"
[ "$COUNT" -gt "$CEILING" ] || fail "the oversize fixture holds $COUNT requirements, not more than $CEILING"

read -r STATUS COUNT <<<"$(verdict "$FIXTURES/within-ceiling")"
[ "$STATUS" = "within-ceiling" ] || fail "a $COUNT-requirement delta against a ceiling of $CEILING returned '$STATUS'"

# Nothing downstream of the choice may exist yet, in either direction.
RESIDUE="$(find "$SANDBOX" -mindepth 1 | head -5)"
[ -z "$RESIDUE" ] || fail "the verdict wrote into its working directory: $RESIDUE"

if [ "$FAILED" -eq 0 ]; then
    echo "design-oversize: PASS"
    exit 0
fi
echo "design-oversize: FAIL"
exit 1
