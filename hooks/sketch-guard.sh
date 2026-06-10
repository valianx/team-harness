#!/usr/bin/env bash
# hooks/sketch-guard.sh
# Orchestrator-invoked STAGE-GATE-1 gate script — plan-stage sketch verifier.
#
# NOT a PreToolUse hook. Do NOT add to hooks/config.json or .claude-plugin/hooks.json.
# Invoked by the orchestrator at STAGE-GATE-1 (same pattern as notify-stage.sh).
# Also invoked by direct-entry skills (/th:review-pr, /th:deliver, /th:validate)
# as a prerequisite probe when entering mid-pipeline.
#
# Contract: docs/plan-sketches.md § 5 (Enforcement)
#
# Usage:
#   hooks/sketch-guard.sh <docs_root>
#
# Where <docs_root> is the absolute path to the workspace folder for the
# current pipeline run (e.g. /path/to/workspaces/2026-06-09_plan-sketches/).
#
# Output: JSON verdict on stdout:
#   {"verdict":"pass","required":[],"missing":[],"concerns":[]}
#   {"verdict":"concerns","required":[...],"missing":[...],"concerns":["..."]}
#   {"verdict":"pass","required":[],"missing":[],"concerns":[]}  (no classification)
#
# Verdict values:
#   pass     — all required sketches present, or no required set (no classification).
#   concerns — one or more required sketches missing OR anti-gaming signal fired.
#              (never "fail" — this is a completeness gate, not a security gate).
#
# Fail-OPEN: if anything prevents reading state, emit pass (exit 0).
# Rationale: completeness gate, not security gate. The human at STAGE-GATE-1
# and plan-reviewer Rule 11 are the real backstops.
#
# Cross-platform: runs under Git Bash on Windows, native bash on macOS/Linux.
# Generic: no tokens, no private endpoints, no personal config. CLAUDE.md §12.

set -euo pipefail

# ---------------------------------------------------------------------------
# Manifest — hardcoded trigger→sketch mapping (must match docs/plan-sketches.md
# and the agent-readable table in agents/architect.md).
# Drift is caught by tests/test_agent_structure.py Suite 82.
#
# Format: BOOLEAN_NAME:SKETCH_FILENAME
# Special: touches_data_model+destructive → data-migration (both must be true)
# ---------------------------------------------------------------------------

# Standard boolean→file mappings (single boolean trigger).
# Values are bare type filenames; resolve_sketch_path composes the sketches/ prefix.
SKETCH_MAP=(
    "touches_http_api:api-contract.md"
    "touches_ui:ui-wireframe.md"
    "touches_data_model:data-model.md"
    "touches_cli:cli-surface.md"
    "touches_public_lib_api:public-api.md"
    "touches_async_messaging:event-contract.md"
    "spans_multiple_services:service-interaction.md"
)

# The data-migration sketch requires BOTH touches_data_model AND destructive.
# Handled separately below.
MIGRATION_SKETCH="data-migration.md"

# Anti-gaming keyword table: these patterns in Files: paths suggest a boolean
# that should be true but may be false.
# Format: KEYWORD_PATTERN:BOOLEAN_NAME
ANTIGAMING_MAP=(
    "route:touches_http_api"
    "controller:touches_http_api"
    "handler:touches_http_api"
    "endpoint:touches_http_api"
    "openapi:touches_http_api"
    "schema:touches_data_model"
    "migration:touches_data_model"
    "model:touches_data_model"
    "component:touches_ui"
    "page:touches_ui"
    "view:touches_ui"
    "widget:touches_ui"
    "event:touches_async_messaging"
    "queue:touches_async_messaging"
    "message:touches_async_messaging"
    "topic:touches_async_messaging"
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

pass_verdict() {
    local required_json="${1:-[]}"
    local missing_json="${2:-[]}"
    local concerns_json="${3:-[]}"
    printf '{"verdict":"pass","required":%s,"missing":%s,"concerns":%s}\n' \
        "$required_json" "$missing_json" "$concerns_json"
    exit 0
}

concerns_verdict() {
    local required_json="${1:-[]}"
    local missing_json="${2:-[]}"
    local concerns_json="${3:-[]}"
    printf '{"verdict":"concerns","required":%s,"missing":%s,"concerns":%s}\n' \
        "$required_json" "$missing_json" "$concerns_json"
    exit 0
}

# JSON-encode a bash array as a JSON array of strings.
json_array() {
    local arr=("$@")
    if [ ${#arr[@]} -eq 0 ]; then
        printf '[]'
        return
    fi
    printf '['
    local first=1
    for item in "${arr[@]}"; do
        if [ "$first" -eq 0 ]; then printf ','; fi
        # Escape backslashes and double-quotes
        local escaped
        escaped=$(printf '%s' "$item" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g')
        printf '"%s"' "$escaped"
        first=0
    done
    printf ']'
}

# Read a boolean field from 00-state.md.
# Returns 0 (true) if the field value is exactly "true", 1 otherwise.
read_bool_field() {
    local field="$1"
    local state_file="$2"
    grep -q "^[[:space:]]*-[[:space:]]*${field}:[[:space:]]*true[[:space:]]*$" \
        "$state_file" 2>/dev/null
}

# Check if any classification boolean is present in the state file.
has_classification_block() {
    local state_file="$1"
    grep -q "^[[:space:]]*-[[:space:]]*touches_http_api:" "$state_file" 2>/dev/null
}

# ---------------------------------------------------------------------------
# Step 1 — Validate arguments
# ---------------------------------------------------------------------------

if [ $# -lt 1 ]; then
    # No docs_root argument — fail-open (called without context)
    pass_verdict
fi

DOCS_ROOT="$1"

# ---------------------------------------------------------------------------
# Step 2 — Locate 00-state.md
# ---------------------------------------------------------------------------

STATE_FILE=""

# First try the provided docs_root directly.
if [ -f "${DOCS_ROOT}/00-state.md" ]; then
    STATE_FILE="${DOCS_ROOT}/00-state.md"
else
    # Fall back to find (same pattern as checkpoint-guard.sh, bounded depth).
    while IFS= read -r f; do
        STATE_FILE="$f"
        break
    done < <(find "$DOCS_ROOT" -maxdepth 5 -name "00-state.md" 2>/dev/null | sort | head -1)
fi

if [ -z "$STATE_FILE" ] || [ ! -f "$STATE_FILE" ]; then
    # No state file — fail-open (Tier 0 or path not yet created)
    pass_verdict
fi

# ---------------------------------------------------------------------------
# Step 3 — Check for classification block
# If the block is absent, run the missing-block anti-gaming scan first, then
# emit pass (block absent is fail-OPEN per the completeness-gate contract).
# Anti-gaming: if the plan's Files: contain contract-surface keywords, that is
# a visible reliability concern — emit concerns (exit 0), never fail.
# ---------------------------------------------------------------------------

if ! has_classification_block "$STATE_FILE"; then
    PLAN_FILE_EARLY="${DOCS_ROOT}/01-plan.md"
    early_concerns=()

    if [ -f "$PLAN_FILE_EARLY" ]; then
        # Contract-surface keywords that suggest a boolean may have been skipped
        CONTRACT_KEYWORDS=(
            "route" "controller" "handler" "endpoint" "openapi"
            "schema" "migration" "model" "component"
        )
        plan_paths_text=""
        if command -v python3 >/dev/null 2>&1; then
            plan_paths_text=$(python3 - <<'PYEOF' "$PLAN_FILE_EARLY" 2>/dev/null || true
import sys, re
path_re = re.compile(r'`([^`]+\.[a-zA-Z][^`]*)`')
results = []
with open(sys.argv[1], encoding='utf-8', errors='replace') as f:
    in_files = False
    for line in f:
        if '**Files:**' in line or line.strip().startswith('- **Files:**'):
            in_files = True
            continue
        if in_files:
            if re.match(r'\s*-\s+\*\*\w', line) and '**Files:**' not in line:
                in_files = False
            for m in path_re.finditer(line):
                results.append(m.group(1).lower())
for r in results:
    print(r)
PYEOF
            )
        else
            plan_paths_text=$(grep -A50 '\*\*Files:\*\*' "$PLAN_FILE_EARLY" 2>/dev/null \
                | grep -o '`[^`]*`' | tr -d '`' | tr '[:upper:]' '[:lower:]' \
                || true)
        fi

        if [ -n "$plan_paths_text" ]; then
            for kw in "${CONTRACT_KEYWORDS[@]}"; do
                if echo "$plan_paths_text" | grep -q "$kw" 2>/dev/null; then
                    early_concerns+=("Classification block absent but plan Files: contain '${kw}' paths — classification may have been skipped (concerns only, not a block)")
                    break  # one concern is enough; avoid flooding
                fi
            done
        fi
    fi

    if [ ${#early_concerns[@]} -gt 0 ]; then
        con_json=$(json_array "${early_concerns[@]}")
        concerns_verdict "[]" "[]" "$con_json"
    else
        # No contract-surface keywords found — normal fail-open pass
        pass_verdict
    fi
fi

# ---------------------------------------------------------------------------
# Step 4 — Read classification booleans
# ---------------------------------------------------------------------------

touches_http_api=false
touches_ui=false
touches_data_model=false
touches_cli=false
touches_public_lib_api=false
touches_async_messaging=false
destructive=false
spans_multiple_services=false

if read_bool_field "touches_http_api" "$STATE_FILE"; then touches_http_api=true; fi
if read_bool_field "touches_ui" "$STATE_FILE"; then touches_ui=true; fi
if read_bool_field "touches_data_model" "$STATE_FILE"; then touches_data_model=true; fi
if read_bool_field "touches_cli" "$STATE_FILE"; then touches_cli=true; fi
if read_bool_field "touches_public_lib_api" "$STATE_FILE"; then touches_public_lib_api=true; fi
if read_bool_field "touches_async_messaging" "$STATE_FILE"; then touches_async_messaging=true; fi
if read_bool_field "destructive" "$STATE_FILE"; then destructive=true; fi
if read_bool_field "spans_multiple_services" "$STATE_FILE"; then spans_multiple_services=true; fi

# ---------------------------------------------------------------------------
# Step 5 — Compute required sketch set
# ---------------------------------------------------------------------------

required_files=()

eval_map() {
    local bool_val="$1"
    local filename="$2"
    if [ "$bool_val" = "true" ]; then
        required_files+=("$filename")
    fi
}

eval_map "$touches_http_api"        "api-contract.md"
eval_map "$touches_ui"              "ui-wireframe.md"
eval_map "$touches_data_model"      "data-model.md"
eval_map "$touches_cli"             "cli-surface.md"
eval_map "$touches_public_lib_api"  "public-api.md"
eval_map "$touches_async_messaging" "event-contract.md"
eval_map "$spans_multiple_services" "service-interaction.md"

# Data-migration sketch requires BOTH touches_data_model AND destructive
if [ "$touches_data_model" = "true" ] && [ "$destructive" = "true" ]; then
    required_files+=("$MIGRATION_SKETCH")
fi

# ---------------------------------------------------------------------------
# Step 5b — Resolve consolidated sketches/ path (multi-project detection)
# When a parent overview.md exists at the parent of DOCS_ROOT, this is a
# project folder within a multi-project initiative. Required sketch files
# resolve to {overview_root}/sketches/{project}-{sketch_file} for per-project
# sketches, and {overview_root}/sketches/service-interaction.md for the
# shared service-interaction sketch (un-prefixed, cross-project).
# When no overview.md parent is found, use the flat single-project path.
# Ambiguity → flat path + concerns, never fail. Always fail-OPEN.
# ---------------------------------------------------------------------------

OVERVIEW_ROOT=""
PROJECT_PREFIX=""

parent_dir=$(dirname "$DOCS_ROOT")
if [ -f "${parent_dir}/overview.md" ]; then
    OVERVIEW_ROOT="$parent_dir"
    # Project name is the basename of DOCS_ROOT (the project folder name)
    PROJECT_PREFIX=$(basename "$DOCS_ROOT")
fi

resolve_sketch_path() {
    local sketch_file="$1"   # bare type filename, e.g. api-contract.md
    # The shared service-interaction sketch is un-prefixed in the sketches/ folder
    if [ -n "$OVERVIEW_ROOT" ]; then
        if [ "$sketch_file" = "service-interaction.md" ]; then
            printf '%s/sketches/service-interaction.md' "$OVERVIEW_ROOT"
        else
            printf '%s/sketches/%s-%s' "$OVERVIEW_ROOT" "$PROJECT_PREFIX" "$sketch_file"
        fi
    else
        printf '%s/sketches/%s' "$DOCS_ROOT" "$sketch_file"
    fi
}

# ---------------------------------------------------------------------------
# Step 6 — Check presence of each required sketch (fidelity heuristic)
# ---------------------------------------------------------------------------

missing_files=()
concerns=()

for sketch_file in "${required_files[@]}"; do
    full_path=$(resolve_sketch_path "$sketch_file")
    if [ ! -f "$full_path" ]; then
        # Also check the flat single-project path (no sketches/ subfolder) as a
        # transitional safety net when in multi-project mode.
        flat_path="${DOCS_ROOT}/${sketch_file}"
        if [ -n "$OVERVIEW_ROOT" ] && [ -f "$flat_path" ]; then
            # Found at flat path in multi-project workspace — surface as concern
            concerns+=("Sketch ${sketch_file} found at flat path ${flat_path} instead of consolidated path ${full_path} — consider moving to sketches/ folder")
        else
            missing_files+=("$sketch_file")
            concerns+=("Missing required sketch: ${sketch_file} (triggered by classification block)")
        fi
    else
        # Fidelity heuristic: file must be non-empty and have a heading
        local_size=$(wc -c < "$full_path" 2>/dev/null || echo 0)
        if [ "$local_size" -lt 4 ]; then
            concerns+=("Sketch ${sketch_file} exists but appears empty (size: ${local_size} bytes)")
        fi
    fi
done

# ---------------------------------------------------------------------------
# Step 7 — Anti-gaming consistency check (concerns-level only)
# Read the Files: list from 01-plan.md and check for keyword mismatches.
# ---------------------------------------------------------------------------

PLAN_FILE="${DOCS_ROOT}/01-plan.md"

if [ -f "$PLAN_FILE" ]; then
    # Extract file paths from the plan's Files: list using python3 (preferred)
    # or grep (fallback). We look for lines under "- **Files:**" that have
    # backtick-quoted paths or plain indented paths.
    plan_files_text=""
    if command -v python3 >/dev/null 2>&1; then
        plan_files_text=$(python3 - <<'PYEOF' "$PLAN_FILE" 2>/dev/null || true
import sys, re

path_re = re.compile(r'`([^`]+\.[a-zA-Z][^`]*)`')
results = []
with open(sys.argv[1], encoding='utf-8', errors='replace') as f:
    in_files = False
    for line in f:
        if '**Files:**' in line or line.strip().startswith('- **Files:**'):
            in_files = True
            continue
        if in_files:
            # Stop at the next bold label or heading
            if re.match(r'\s*-\s+\*\*\w', line) and '**Files:**' not in line:
                in_files = False
            for m in path_re.finditer(line):
                results.append(m.group(1).lower())
for r in results:
    print(r)
PYEOF
        )
    else
        # grep fallback: extract backtick-quoted tokens from lines after Files:
        plan_files_text=$(grep -A50 '\*\*Files:\*\*' "$PLAN_FILE" 2>/dev/null \
            | grep -o '`[^`]*`' | tr -d '`' | tr '[:upper:]' '[:lower:]' \
            || true)
    fi

    if [ -n "$plan_files_text" ]; then
        # Check each anti-gaming pattern
        while IFS=':' read -r keyword bool_name; do
            # Get the current value of the boolean
            current_val="false"
            case "$bool_name" in
                touches_http_api)        current_val="$touches_http_api" ;;
                touches_data_model)      current_val="$touches_data_model" ;;
                touches_ui)              current_val="$touches_ui" ;;
                touches_async_messaging) current_val="$touches_async_messaging" ;;
            esac

            if [ "$current_val" = "false" ]; then
                # Check if the keyword appears in the plan files
                if echo "$plan_files_text" | grep -q "$keyword" 2>/dev/null; then
                    concerns+=("Anti-gaming check: plan Files: contain '${keyword}' paths but ${bool_name}=false — verify classification is correct (concerns only, not a block)")
                fi
            fi
        done <<< "$(printf '%s\n' "${ANTIGAMING_MAP[@]}")"
    fi
fi

# ---------------------------------------------------------------------------
# Step 8 — Emit verdict
# ---------------------------------------------------------------------------

req_json=$(json_array "${required_files[@]}")
miss_json=$(json_array "${missing_files[@]}")
con_json=$(json_array "${concerns[@]}")

if [ ${#missing_files[@]} -gt 0 ] || [ ${#concerns[@]} -gt 0 ]; then
    concerns_verdict "$req_json" "$miss_json" "$con_json"
else
    pass_verdict "$req_json" "$miss_json" "$con_json"
fi
