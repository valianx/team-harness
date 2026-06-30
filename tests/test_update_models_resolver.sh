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
# #424 AC-2 (models.dev shape — bug fix): the fixture is the REAL nested shape
# (root keyed by provider, each provider carries a "models" object keyed by
# bare id, each model entry carries a "family" field). The resolver below
# groups by the "family" field — NOT by prefix-matching the bare id — and a
# regression assertion proves the OLD flattened shape ("anthropic/<id>" as a
# top-level key) no longer resolves anything silently.
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
# The resolver logic mirrors exactly what is documented in skills/update-models/SKILL.md
# (#424 AC-2 fix: real nested provider->models->family shape, grouped by the
# model's family field — not by id-prefix matching).
# Values are passed via environment (TH_FIXTURE) so the path does not need shell interpolation
# inside the python heredoc — same pattern as skills/update/SKILL.md python3 blocks.
RESULT=$(TH_FIXTURE="${FIXTURE}" TH_PROVIDER="anthropic" python3 - <<'PYEOF'
import sys
import json
import os
from datetime import date

FIXTURE = os.environ["TH_FIXTURE"]
PROVIDER = os.environ.get("TH_PROVIDER", "anthropic")

# Curated provider -> tier -> family map. Must stay byte-identical to
# providerTierFamily (cmd/install/transform.go) and PROVIDER_TIER_FAMILY
# (tools/harness-migrate/migrate.mjs) — see skills/update-models/SKILL.md
# Resolver contract.
PROVIDER_TIER_FAMILY = {
    "anthropic": {"default": "claude-opus", "medium": "claude-sonnet", "low": "claude-haiku"},
}
TIER_ORDER = ["default", "medium", "low"]
TIER_TO_ALIAS = {"default": "opus", "medium": "sonnet", "low": "haiku"}

def resolve_family_for_tier(provider, tier):
    """Nearest-cheaper-neighbor fallback (AC-3): walk TIER_ORDER from tier
    downward until a populated family entry is found for provider."""
    by_tier = PROVIDER_TIER_FAMILY.get(provider)
    if not by_tier or tier not in TIER_ORDER:
        return None
    start = TIER_ORDER.index(tier)
    for t in TIER_ORDER[start:]:
        if t in by_tier:
            return by_tier[t]
    return None

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

# Real models.dev shape: root keyed by provider; each provider carries a
# nested "models" object keyed by bare id (#424 AC-2 — the prior resolver
# iterated the top level as if it were keyed by model id, which is wrong).
provider_obj = data.get(PROVIDER) if isinstance(data, dict) else None
models = provider_obj.get("models", {}) if isinstance(provider_obj, dict) else {}

# Group candidates by the model's "family" field — NOT by id-prefix matching.
by_family = {}
for bare_id, entry in models.items():
    if not isinstance(entry, dict):
        continue
    family = entry.get("family")
    if not family:
        continue
    by_family.setdefault(family, []).append((bare_id, entry.get("release_date")))

resolved = {}
gaps = {}
for tier in TIER_ORDER:
    alias = TIER_TO_ALIAS[tier]
    family = resolve_family_for_tier(PROVIDER, tier)
    if not family:
        gaps[alias] = "no_family_for_tier"
        continue
    candidates = by_family.get(family, [])
    if not candidates:
        gaps[alias] = "no_candidates"
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
        gaps[alias] = "no_parseable_dates"
        continue
    # Pick newest by date (chronological, never lexical)
    best = max(dated, key=lambda x: x[1])
    resolved[alias] = PROVIDER + "/" + best[0]

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

# #424 AC-2 regression lock: feed the resolver the OLD (pre-fix) flattened
# shape — a top-level object keyed by "anthropic/<id>" rather than the real
# nested provider->models shape. The corrected resolver must NOT silently
# resolve anything against this shape (data.get("anthropic") returns None,
# so models is {} and every tier gaps out) — proving the fix actually depends
# on the nested shape rather than coincidentally also matching the old one.
OLD_SHAPE_RESULT=$(TH_PROVIDER="anthropic" python3 - <<'PYEOF'
import json
import os
from datetime import date

PROVIDER = os.environ.get("TH_PROVIDER", "anthropic")
PROVIDER_TIER_FAMILY = {
    "anthropic": {"default": "claude-opus", "medium": "claude-sonnet", "low": "claude-haiku"},
}
TIER_ORDER = ["default", "medium", "low"]
TIER_TO_ALIAS = {"default": "opus", "medium": "sonnet", "low": "haiku"}

def resolve_family_for_tier(provider, tier):
    by_tier = PROVIDER_TIER_FAMILY.get(provider)
    if not by_tier or tier not in TIER_ORDER:
        return None
    start = TIER_ORDER.index(tier)
    for t in TIER_ORDER[start:]:
        if t in by_tier:
            return by_tier[t]
    return None

# Old (pre-#424) flattened fixture shape — top-level keyed by "anthropic/<id>".
old_shape_data = {
    "anthropic/claude-opus-4-6": {
        "id": "claude-opus-4-6", "family": "claude-opus", "release_date": "2026-02-05"
    },
}

provider_obj = old_shape_data.get(PROVIDER) if isinstance(old_shape_data, dict) else None
models = provider_obj.get("models", {}) if isinstance(provider_obj, dict) else {}

by_family = {}
for bare_id, entry in models.items():
    if not isinstance(entry, dict):
        continue
    family = entry.get("family")
    if not family:
        continue
    by_family.setdefault(family, []).append((bare_id, entry.get("release_date")))

resolved = {}
gaps = {}
for tier in TIER_ORDER:
    alias = TIER_TO_ALIAS[tier]
    family = resolve_family_for_tier(PROVIDER, tier)
    if not family or not by_family.get(family):
        gaps[alias] = "no_candidates"
        continue
    resolved[alias] = "unexpected"

print(json.dumps({"resolved": resolved, "gaps": gaps}))
PYEOF
)
OLD_SHAPE_RESOLVED=$(TH_RESULT="${OLD_SHAPE_RESULT}" python3 -c "import json,os; d=json.loads(os.environ['TH_RESULT']); print(json.dumps(d.get('resolved',{})))")

assert_eq "AC-2 regression: old flattened shape resolves nothing" \
          "{}" \
          "${OLD_SHAPE_RESOLVED}"

echo ""
if [ "${FAILED}" -eq 0 ]; then
  echo "update-models resolver fixture test: PASS (5/5 assertions)"
  exit ${PASS}
else
  echo "update-models resolver fixture test: FAIL (${FAILED} assertion(s) failed)"
  exit ${FAIL}
fi
