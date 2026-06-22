#!/usr/bin/env bash
# tests/test_update_models_resolver.sh
#
# Fixture test: assert the /th:update-models resolver tier->id resolution against
# the committed fixture tests/fixtures/models-dev-api-slice.json (offline — no
# network required).
#
# Specifically verifies:
#   - opus   -> anthropic/claude-opus-4-6       (newest by release_date 2026-02-05)
#   - sonnet -> anthropic/claude-sonnet-4-10    (date comparison: 2027-01-15 > 2026-11-10,
#                                                proving 4-10 beats 4-9 when dates are compared,
#                                                NOT string-sorted)
#   - haiku  -> anthropic/claude-haiku-4-5      (only candidate)
#
# The sonnet 4-10 vs 4-9 adjacency is the AC-2 date-not-string-sort lock: string sort
# would pick 4-9 (lexically "4-9" > "4-10"); date comparison picks 4-10 (2027-01-15 > 2026-11-10).
#
# Skips with exit 0 when python3 is absent (mirrors tests/test_opencode_agent_frontmatter.sh:25-29).
#
# Usage: bash tests/test_update_models_resolver.sh
# Exit 0 = pass (or skip), 1 = fail.

set -euo pipefail

PASS=0
FAIL=1

# Resolve repo root (one dir up from this script).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
FIXTURE="${REPO_ROOT}/tests/fixtures/models-dev-api-slice.json"

# Skip when python3 is absent.
if ! command -v python3 &>/dev/null; then
  echo "SKIP: python3 not found — skipping update-models resolver fixture test"
  exit 0
fi

echo "=== update-models resolver fixture test ==="
echo "Fixture: ${FIXTURE}"

if [ ! -f "${FIXTURE}" ]; then
  echo "FAIL: fixture file not found: ${FIXTURE}"
  exit ${FAIL}
fi

# Run the resolver against the fixture file.
# The resolver logic mirrors exactly what is documented in skills/update-models/SKILL.md.
# Values are passed via environment (TH_FIXTURE) so the path does not need shell interpolation
# inside the python heredoc — same pattern as skills/update/SKILL.md python3 blocks.
RESULT=$(TH_FIXTURE="${FIXTURE}" python3 - <<'PYEOF'
import sys
import json
import os
from datetime import date

FIXTURE = os.environ["TH_FIXTURE"]

TIERS = {
    "opus":   "claude-opus-",
    "sonnet": "claude-sonnet-",
    "haiku":  "claude-haiku-",
}

def bare(model_id):
    """Strip provider prefix: 'anthropic/claude-opus-4-6' -> 'claude-opus-4-6'."""
    return model_id.removeprefix("anthropic/")

def parse_date(s):
    """Parse ISO date string. Return date object or None on failure."""
    try:
        parts = str(s).split("-")
        if len(parts) == 3:
            return date(int(parts[0]), int(parts[1]), int(parts[2]))
    except Exception:
        pass
    return None

with open(FIXTURE, "r", encoding="utf-8") as f:
    data = json.load(f)

# Collect Anthropic model entries (same logic as the skill resolver contract)
anthropic_models = {}
for key, entry in data.items():
    b = bare(str(key))
    if b.startswith("claude-"):
        release_date = entry.get("release_date") if isinstance(entry, dict) else None
        anthropic_models[b] = release_date

resolved = {}
gaps = {}
for tier, prefix in TIERS.items():
    candidates = [
        (bare_id, rd)
        for bare_id, rd in anthropic_models.items()
        if bare_id.startswith(prefix)
    ]
    if not candidates:
        gaps[tier] = "no_candidates"
        continue
    # Filter to those with a parseable release_date
    dated = []
    for bare_id, rd_str in candidates:
        if not rd_str:
            continue
        d = parse_date(rd_str)
        if d is not None:
            dated.append((bare_id, d))
    if not dated:
        gaps[tier] = "no_parseable_dates"
        continue
    # Pick newest by date (chronological, never lexical)
    best = max(dated, key=lambda x: x[1])
    resolved[tier] = "anthropic/" + best[0]

print(json.dumps({"resolved": resolved, "gaps": gaps}))
PYEOF
)

echo "Resolver output: ${RESULT}"

FAILED=0

assert_eq() {
  local label="$1"
  local expected="$2"
  local actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "  PASS  ${label}: ${actual}"
  else
    echo "  FAIL  ${label}: expected '${expected}', got '${actual}'"
    FAILED=$((FAILED + 1))
  fi
}

# Extract resolved values via python3 (portable JSON parsing — no jq dependency)
OPUS_ID=$(TH_RESULT="${RESULT}" python3 -c "import json,os; d=json.loads(os.environ['TH_RESULT']); print(d['resolved'].get('opus','MISSING'))")
SONNET_ID=$(TH_RESULT="${RESULT}" python3 -c "import json,os; d=json.loads(os.environ['TH_RESULT']); print(d['resolved'].get('sonnet','MISSING'))")
HAIKU_ID=$(TH_RESULT="${RESULT}" python3 -c "import json,os; d=json.loads(os.environ['TH_RESULT']); print(d['resolved'].get('haiku','MISSING'))")
GAPS=$(TH_RESULT="${RESULT}" python3 -c "import json,os; d=json.loads(os.environ['TH_RESULT']); print(json.dumps(d.get('gaps',{})))")

echo ""
echo "Assertions:"

# AC-1: opus resolves to the newest by release_date (claude-opus-4-6, 2026-02-05)
assert_eq "opus tier" \
          "anthropic/claude-opus-4-6" \
          "${OPUS_ID}"

# AC-2: date-not-string-sort lock — fixture has claude-sonnet-4-9 (release_date 2026-11-10)
#       and claude-sonnet-4-10 (release_date 2027-01-15).
#   Lexical sort: "claude-sonnet-4-9" > "claude-sonnet-4-10" → would pick 4-9 (wrong)
#   Date comparison: 2027-01-15 > 2026-11-10 → picks 4-10 (correct)
assert_eq "sonnet tier (date-not-string-sort: 4-10 beats 4-9)" \
          "anthropic/claude-sonnet-4-10" \
          "${SONNET_ID}"

# haiku: only one candidate in the fixture
assert_eq "haiku tier" \
          "anthropic/claude-haiku-4-5" \
          "${HAIKU_ID}"

# No gaps expected — all three tiers have valid candidates with parseable dates
assert_eq "gaps (none expected)" \
          "{}" \
          "${GAPS}"

echo ""
if [ "${FAILED}" -eq 0 ]; then
  echo "update-models resolver fixture test: PASS (4/4 assertions)"
  exit ${PASS}
else
  echo "update-models resolver fixture test: FAIL (${FAILED} assertion(s) failed)"
  exit ${FAIL}
fi
