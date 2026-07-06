#!/bin/bash
# tests/test_sketch_guard.sh
# Functional tests for hooks/sketch-guard.sh
#
# Each test case creates a temporary workspace with a synthetic 00-state.md
# (and optionally a sketches/*.md file or 01-plan.md), runs the guard script,
# and asserts the expected JSON verdict field.
#
# Usage:
#   bash tests/test_sketch_guard.sh
# Exit code:
#   0 if all cases pass, 1 otherwise.

set -u

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GUARD="$REPO_ROOT/hooks/sketch-guard.sh"

if [ ! -x "$GUARD" ]; then
    chmod +x "$GUARD"
fi

PASS=0
FAIL=0
declare -a FAILURES

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

make_tmp() {
    mktemp -d
}

make_state() {
    local tmp="$1"
    local content="$2"
    printf '%s\n' "$content" > "$tmp/00-state.md"
}

run_guard() {
    local tmp="$1"
    bash "$GUARD" "$tmp" 2>/dev/null
}

assert_verdict() {
    local name="$1"
    local output="$2"
    local expected="$3"

    local actual
    if command -v python3 >/dev/null 2>&1; then
        actual=$(python3 -c "import json,sys; d=json.loads(sys.argv[1]); print(d.get('verdict',''))" "$output" 2>/dev/null || echo "")
    else
        actual=$(printf '%s' "$output" | grep -o '"verdict":"[^"]*"' | head -1 | sed 's/.*"verdict":"\([^"]*\)".*/\1/' || echo "")
    fi

    if [ "$actual" = "$expected" ]; then
        echo "  [PASS] $name"
        PASS=$((PASS + 1))
    else
        echo "  [FAIL] $name — expected verdict='$expected', got verdict='$actual'"
        echo "         Output: $output"
        FAIL=$((FAIL + 1))
        FAILURES+=("$name")
    fi
}

assert_contains() {
    local name="$1"
    local output="$2"
    local needle="$3"

    if echo "$output" | grep -q "$needle"; then
        echo "  [PASS] $name"
        PASS=$((PASS + 1))
    else
        echo "  [FAIL] $name — expected output to contain '$needle'"
        echo "         Output: $output"
        FAIL=$((FAIL + 1))
        FAILURES+=("$name")
    fi
}

assert_not_contains() {
    local name="$1"
    local output="$2"
    local needle="$3"

    if ! echo "$output" | grep -q "$needle"; then
        echo "  [PASS] $name"
        PASS=$((PASS + 1))
    else
        echo "  [FAIL] $name — expected output NOT to contain '$needle'"
        echo "         Output: $output"
        FAIL=$((FAIL + 1))
        FAILURES+=("$name")
    fi
}

# ---------------------------------------------------------------------------
# Test Suite
# ---------------------------------------------------------------------------

echo "=== Suite: sketch-guard functional tests ==="

# --- Case 1: No docs_root argument → pass (fail-open) ---
TMP1=$(make_tmp)
OUT1=$(bash "$GUARD" 2>/dev/null)
assert_verdict "no-args: fail-open pass" "$OUT1" "pass"
rm -rf "$TMP1"

# --- Case 2: Non-existent docs_root → pass (fail-open) ---
OUT2=$(bash "$GUARD" "/nonexistent/path/xyz" 2>/dev/null)
assert_verdict "nonexistent-path: fail-open pass" "$OUT2" "pass"

# --- Case 3: docs_root exists but no 00-state.md → pass (fail-open) ---
TMP3=$(make_tmp)
OUT3=$(run_guard "$TMP3")
assert_verdict "no-state-file: fail-open pass" "$OUT3" "pass"
rm -rf "$TMP3"

# --- Case 4: 00-state.md exists but NO classification block → pass (fail-open) ---
TMP4=$(make_tmp)
make_state "$TMP4" "## Current State
- type: feature
- phase: 2-implementation"
OUT4=$(run_guard "$TMP4")
assert_verdict "no-classification-block: fail-open pass" "$OUT4" "pass"
rm -rf "$TMP4"

# --- Case 5: All booleans false → empty required set → pass ---
TMP5=$(make_tmp)
make_state "$TMP5" "## Current State
- touches_http_api: false
- touches_ui: false
- touches_data_model: false
- touches_cli: false
- touches_public_lib_api: false
- touches_async_messaging: false
- destructive: false"
OUT5=$(run_guard "$TMP5")
assert_verdict "all-false: pass (empty required set)" "$OUT5" "pass"
rm -rf "$TMP5"

# --- Case 6: touches_http_api=true, sketch PRESENT → pass ---
TMP6=$(make_tmp)
make_state "$TMP6" "## Current State
- touches_http_api: true
- touches_ui: false
- touches_data_model: false
- touches_cli: false
- touches_public_lib_api: false
- touches_async_messaging: false
- destructive: false"
mkdir -p "$TMP6/sketches"
echo "# API Contract sketch content" > "$TMP6/sketches/api-contract.md"
OUT6=$(run_guard "$TMP6")
assert_verdict "http_api=true, sketch present: pass" "$OUT6" "pass"
rm -rf "$TMP6"

# --- Case 7: touches_http_api=true, sketch MISSING → concerns ---
TMP7=$(make_tmp)
make_state "$TMP7" "## Current State
- touches_http_api: true
- touches_ui: false
- touches_data_model: false
- touches_cli: false
- touches_public_lib_api: false
- touches_async_messaging: false
- destructive: false"
OUT7=$(run_guard "$TMP7")
assert_verdict "http_api=true, sketch missing: concerns" "$OUT7" "concerns"
assert_contains "missing sketch named in concerns" "$OUT7" "api-contract.md"
rm -rf "$TMP7"

# --- Case 8: touches_ui=true, sketch MISSING → concerns ---
TMP8=$(make_tmp)
make_state "$TMP8" "## Current State
- touches_http_api: false
- touches_ui: true
- touches_data_model: false
- touches_cli: false
- touches_public_lib_api: false
- touches_async_messaging: false
- destructive: false"
OUT8=$(run_guard "$TMP8")
assert_verdict "ui=true, sketch missing: concerns" "$OUT8" "concerns"
assert_contains "ui wireframe missing in concerns" "$OUT8" "ui-wireframe.html"
rm -rf "$TMP8"

# --- Case 9: touches_data_model=true + destructive=true, BOTH sketches needed ---
TMP9=$(make_tmp)
make_state "$TMP9" "## Current State
- touches_http_api: false
- touches_ui: false
- touches_data_model: true
- touches_cli: false
- touches_public_lib_api: false
- touches_async_messaging: false
- destructive: true"
OUT9=$(run_guard "$TMP9")
assert_verdict "data_model+destructive, both missing: concerns" "$OUT9" "concerns"
assert_contains "data-model sketch missing" "$OUT9" "data-model.md"
assert_contains "data-migration sketch missing" "$OUT9" "data-migration.md"
rm -rf "$TMP9"

# --- Case 10: touches_data_model=true + destructive=true, BOTH present → pass ---
TMP10=$(make_tmp)
make_state "$TMP10" "## Current State
- touches_http_api: false
- touches_ui: false
- touches_data_model: true
- touches_cli: false
- touches_public_lib_api: false
- touches_async_messaging: false
- destructive: true"
mkdir -p "$TMP10/sketches"
echo "# Data Model" > "$TMP10/sketches/data-model.md"
echo "# Data Migration" > "$TMP10/sketches/data-migration.md"
OUT10=$(run_guard "$TMP10")
assert_verdict "data_model+destructive, both present: pass" "$OUT10" "pass"
rm -rf "$TMP10"

# --- Case 11: touches_data_model=true, destructive=false → only data-model needed ---
TMP11=$(make_tmp)
make_state "$TMP11" "## Current State
- touches_http_api: false
- touches_ui: false
- touches_data_model: true
- touches_cli: false
- touches_public_lib_api: false
- touches_async_messaging: false
- destructive: false"
mkdir -p "$TMP11/sketches"
echo "# Data Model" > "$TMP11/sketches/data-model.md"
OUT11=$(run_guard "$TMP11")
assert_verdict "data_model only (no destructive): pass with sketch present" "$OUT11" "pass"
assert_not_contains "data-migration NOT required" "$OUT11" "data-migration.md"
rm -rf "$TMP11"

# --- Case 12: Anti-gaming — route file in plan but touches_http_api=false → concerns ---
TMP12=$(make_tmp)
make_state "$TMP12" "## Current State
- touches_http_api: false
- touches_ui: false
- touches_data_model: false
- touches_cli: false
- touches_public_lib_api: false
- touches_async_messaging: false
- destructive: false"
cat > "$TMP12/01-plan.md" << 'PLANEOF'
## Task List
### Task-1
- **Files:**
  - `src/routes/user.controller.ts` (modify)
PLANEOF
OUT12=$(run_guard "$TMP12")
assert_verdict "anti-gaming: route file, http_api=false: concerns" "$OUT12" "concerns"
assert_contains "anti-gaming concern mentions route" "$OUT12" "touches_http_api=false"
rm -rf "$TMP12"

# --- Case 13: All booleans true, all sketches present → pass ---
TMP13=$(make_tmp)
make_state "$TMP13" "## Current State
- touches_http_api: true
- touches_ui: true
- touches_data_model: true
- touches_cli: true
- touches_public_lib_api: true
- touches_async_messaging: true
- destructive: true"
mkdir -p "$TMP13/sketches"
echo "# API" > "$TMP13/sketches/api-contract.md"
echo "<h1>UI</h1>" > "$TMP13/sketches/ui-wireframe.html"
echo "# Data Model" > "$TMP13/sketches/data-model.md"
echo "# CLI" > "$TMP13/sketches/cli-surface.md"
echo "# Public API" > "$TMP13/sketches/public-api.md"
echo "# Event" > "$TMP13/sketches/event-contract.md"
echo "# Migration" > "$TMP13/sketches/data-migration.md"
OUT13=$(run_guard "$TMP13")
assert_verdict "all-true, all sketches present: pass" "$OUT13" "pass"
rm -rf "$TMP13"

# --- Case 14: Verdict is never 'fail' (completeness gate, not security gate) ---
TMP14=$(make_tmp)
make_state "$TMP14" "## Current State
- touches_http_api: true
- touches_ui: true
- touches_data_model: true
- touches_cli: true
- touches_public_lib_api: true
- touches_async_messaging: true
- destructive: true"
# Leave all sketches missing
OUT14=$(run_guard "$TMP14")
assert_verdict "all-true, all missing: concerns (never fail)" "$OUT14" "concerns"
assert_not_contains "verdict is never fail" "$OUT14" '"verdict":"fail"'
rm -rf "$TMP14"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

echo
echo "sketch-guard: ${PASS} passed, ${FAIL} failed"

if [ $FAIL -gt 0 ]; then
    echo "Failed tests:"
    for f in "${FAILURES[@]}"; do
        echo "  - $f"
    done
    exit 1
fi

exit 0
