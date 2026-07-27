#!/bin/bash
# tests/test_subagent_start.sh
# Functional tests for hooks/ts/dist/subagent-start.cjs — the PreToolUse (Task)
# breadcrumb writer that is the start-side twin of hooks/subagent-trace.sh.
#
# Asserts (Task-7, issue #452):
#   - AC-1: a th:* subagent_type dispatch appends exactly one
#     {"ts","event":"subagent.start","agent_type"} line to the resolved
#     workspace's 00-subagent-trace.jsonl; a non-th:* dispatch writes nothing
#     and exits 0.
#   - AC-2: node runtime errors, malformed JSON, missing/wrong-typed fields,
#     an unreachable workspace path, and an oversize (SEC-07) payload all
#     fail open — exit 0, empty stdout, no crash, dispatch never blocked.
#
# Also asserts (Section 4, T6c): hooks/ts/dist/subagent-trace.cjs (the
# STOP-side twin, SubagentStop) writes its breadcrumb even under
# TH_HOOK_PROFILE=minimal — the breadcrumb is non-suppressible, matching the
# Bash oracle hooks/subagent-trace.sh (which has no profile gate at all).
#
# Also asserts (Section 5, Task-5 AC-5.1/5.3/5.4/5.5): the `project` key
# stamped from a `TH-LANE: {project-key}` marker on the FIRST LINE of the
# dispatch prompt (controlled header, mirrors checkpoint-guard's
# TH-STATE-REF parse) —
#   - AC-5.1: marker present on the first line + valid → `project` on the
#     breadcrumb.
#   - AC-5.3: marker absent → `project` omitted (backward-compat key set).
#   - AC-5.4: marker present but out of the [a-z0-9-]{1,60} bound → `project`
#     omitted (never written unbounded).
#   - AC-5.5: a well-shaped marker present LOWER in the prompt (not the first
#     line) is ignored — untrusted content per CLAUDE.md §6.6 cannot smuggle
#     a project key onto the breadcrumb.
#
# Also asserts (Section 6, AC-1/AC-2/AC-5): `payload_bytes` — the
# byte length of the dispatch prompt —
#   - AC-1: every breadcrumb carries `payload_bytes`, ungated by any
#     threshold.
#   - AC-2: no threshold constant, comparison, or decision branch on
#     `payload_bytes` exists in the hook body (static check on the source).
#   - AC-5: the value is exactly the byte count and nothing else — no
#     content beyond that count enters the record.
#
# Also asserts (Section 7, AC-4/AC-5): docs/observability.md's
# `### subagent.start` section documents `payload_bytes` — the line-schema
# example includes the key, the visibility-only/no-ceiling posture is
# stated, the Claude-Code-plugin-only coverage limitation is named without
# overclaiming opencode coverage, and the content-boundary invariant (byte
# count only, never the prompt itself) is stated.
#
# Usage: bash tests/test_subagent_start.sh
# Exit code: 0 all cases pass, 1 otherwise.

set -u

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CJS="$REPO_ROOT/hooks/ts/dist/subagent-start.cjs"
BODY_TS="$REPO_ROOT/hooks/ts/bodies/subagent-start.ts"

PASS=0
FAIL=0
declare -a FAILURES

# assert_true LABEL — reads the numeric result (0 or 1) from stdin-free arg $2.
assert_true() {
    local label="$1" result="$2"
    if [ "$result" -eq 1 ]; then
        PASS=$((PASS + 1))
        echo "  [PASS] $label"
    else
        FAIL=$((FAIL + 1))
        FAILURES+=("$label")
        echo "  [FAIL] $label"
    fi
}

echo "=== subagent-start functional tests ==="
echo "  CJS: $CJS"
echo ""

if [ ! -f "$CJS" ]; then
    echo "FATAL: TS bundle not found at $CJS — run 'npm --prefix hooks/ts run build:subagent-start' first."
    exit 1
fi
if ! command -v node >/dev/null 2>&1; then
    echo "subagent-start: SKIP (node not found — install Node.js to run this suite)"
    exit 0
fi

make_payload() {
    local subagent_type="$1"
    python3 -c "
import json, sys
print(json.dumps({'tool_name': 'Task', 'tool_input': {'subagent_type': sys.argv[1], 'description': 'test dispatch'}}))
" "$subagent_type"
}

# make_payload_with_prompt SUBAGENT_TYPE PROMPT — Task dispatch payload that
# carries a `prompt` field, used to exercise the TH-LANE marker parser.
make_payload_with_prompt() {
    local subagent_type="$1" prompt="$2"
    python3 -c "
import json, sys
print(json.dumps({'tool_name': 'Task', 'tool_input': {'subagent_type': sys.argv[1], 'description': 'test dispatch', 'prompt': sys.argv[2]}}))
" "$subagent_type" "$prompt"
}

# ---------------------------------------------------------------------------
# Fixture: throwaway workspace with an active (non-terminal) 00-state.md
# ---------------------------------------------------------------------------
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

mkdir -p "$WORKDIR/workspaces/test-feature"
cat > "$WORKDIR/workspaces/test-feature/00-state.md" <<'EOF'
- status: in_progress
EOF

TRACE_FILE="$WORKDIR/workspaces/test-feature/00-subagent-trace.jsonl"

# ---------------------------------------------------------------------------
# Section 1 — AC-1: th:* dispatch writes the breadcrumb
# ---------------------------------------------------------------------------
echo "--- Section 1: start-write (AC-1) ---"

rm -f "$TRACE_FILE"
payload="$(make_payload "th:tester")"
out="$(cd "$WORKDIR" && echo "$payload" | node "$CJS" 2>/dev/null)"
rc=$?

[ "$rc" -eq 0 ] && r=1 || r=0
assert_true "th:* dispatch exits 0" "$r"

[ -z "$out" ] && r=1 || r=0
assert_true "th:* dispatch emits no stdout" "$r"

[ -f "$TRACE_FILE" ] && r=1 || r=0
assert_true "th:* dispatch writes the trace file" "$r"

if [ -f "$TRACE_FILE" ]; then
    LINE="$(cat "$TRACE_FILE")"

    if echo "$LINE" | grep -q '"event":"subagent.start"'; then r=1; else r=0; fi
    assert_true "trace line has event=subagent.start" "$r"

    if echo "$LINE" | grep -q '"agent_type":"th:tester"'; then r=1; else r=0; fi
    assert_true "trace line has agent_type=th:tester" "$r"

    if echo "$LINE" | grep -q '"ts":"'; then r=1; else r=0; fi
    assert_true "trace line has a ts field" "$r"

    if echo "$LINE" | grep -q '"agent_id"'; then r=0; else r=1; fi
    assert_true "trace line does NOT carry agent_id (not yet assigned at PreToolUse time)" "$r"

    if echo "$LINE" | grep -qE '"payload_bytes":[0-9]+'; then r=1; else r=0; fi
    assert_true "trace line has a numeric payload_bytes field" "$r"

    # Exact key set: ts, event, agent_type, payload_bytes — no extra fields leaked.
    KEYS="$(python3 -c "import json,sys; print(','.join(sorted(json.loads(sys.argv[1]).keys())))" "$LINE" 2>/dev/null || true)"
    [ "$KEYS" = "agent_type,event,payload_bytes,ts" ] && r=1 || r=0
    assert_true "trace line has exactly {ts, event, agent_type, payload_bytes} keys" "$r"
fi

# ---------------------------------------------------------------------------
# Section 2 — AC-1: non-th:* dispatch guard
# ---------------------------------------------------------------------------
echo ""
echo "--- Section 2: non-th:* scope guard (AC-1) ---"

rm -f "$TRACE_FILE"
payload="$(make_payload "general-purpose")"
out="$(cd "$WORKDIR" && echo "$payload" | node "$CJS" 2>/dev/null)"
rc=$?

[ "$rc" -eq 0 ] && r=1 || r=0
assert_true "non-th:* dispatch exits 0" "$r"

[ -z "$out" ] && r=1 || r=0
assert_true "non-th:* dispatch emits no stdout" "$r"

[ ! -f "$TRACE_FILE" ] && r=1 || r=0
assert_true "non-th:* dispatch does NOT write the trace file" "$r"

# ---------------------------------------------------------------------------
# Section 3 — AC-2: fail-open on known-bad inputs
# ---------------------------------------------------------------------------
echo ""
echo "--- Section 3: fail-open on known-bad inputs (AC-2) ---"

rm -f "$TRACE_FILE"

# 3a. Malformed JSON.
out="$(cd "$WORKDIR" && printf 'not json {{{' | node "$CJS" 2>/dev/null)"
rc=$?
[ "$rc" -eq 0 ] && r=1 || r=0
assert_true "malformed JSON exits 0" "$r"
[ -z "$out" ] && r=1 || r=0
assert_true "malformed JSON emits no stdout" "$r"

# 3b. Empty stdin.
out="$(cd "$WORKDIR" && printf '' | node "$CJS" 2>/dev/null)"
rc=$?
[ "$rc" -eq 0 ] && r=1 || r=0
assert_true "empty stdin exits 0" "$r"

# 3c. Missing fields entirely (empty object).
out="$(cd "$WORKDIR" && printf '{}' | node "$CJS" 2>/dev/null)"
rc=$?
[ "$rc" -eq 0 ] && r=1 || r=0
assert_true "missing-fields payload exits 0" "$r"
[ ! -f "$TRACE_FILE" ] && r=1 || r=0
assert_true "missing-fields payload does NOT write the trace file" "$r"

# 3d. subagent_type present but wrong type (number, not string).
out="$(cd "$WORKDIR" && printf '{"tool_name":"Task","tool_input":{"subagent_type":42}}' | node "$CJS" 2>/dev/null)"
rc=$?
[ "$rc" -eq 0 ] && r=1 || r=0
assert_true "non-string subagent_type exits 0" "$r"

# 3e. Unreachable workspace path — no workspaces/ directory at all.
NOWORKSPACE_DIR="$(mktemp -d)"
payload="$(make_payload "th:tester")"
out="$(cd "$NOWORKSPACE_DIR" && echo "$payload" | node "$CJS" 2>/dev/null)"
rc=$?
[ "$rc" -eq 0 ] && r=1 || r=0
assert_true "no-workspace-dir dispatch exits 0" "$r"
[ -z "$out" ] && r=1 || r=0
assert_true "no-workspace-dir dispatch emits no stdout" "$r"
rm -rf "$NOWORKSPACE_DIR"

# 3f. Oversize payload — SEC-07 pre-parse size bound (MAX_PAYLOAD_BYTES = 1 MiB).
BIG_VALUE="$(python3 -c "print('x' * 2000000)")"
out="$(cd "$WORKDIR" && printf '{"tool_name":"Task","tool_input":{"subagent_type":"th:tester","description":"%s"}}' "$BIG_VALUE" | node "$CJS" 2>/dev/null)"
rc=$?
[ "$rc" -eq 0 ] && r=1 || r=0
assert_true "oversize payload exits 0 (SEC-07 reject, fail-open)" "$r"
[ -z "$out" ] && r=1 || r=0
assert_true "oversize payload emits no stdout" "$r"
[ ! -f "$TRACE_FILE" ] && r=1 || r=0
assert_true "oversize payload does NOT write the trace file" "$r"

# ---------------------------------------------------------------------------
# Section 4 — regression: subagent-trace.cjs (SubagentStop, the STOP-side
# twin of this hook) breadcrumb is NON-SUPPRESSIBLE under
# TH_HOOK_PROFILE=minimal (T6c). The Bash oracle (hooks/subagent-trace.sh)
# has no hook-profile gate at all — the breadcrumb must fire unconditionally,
# same as the start-side hook tested above. See docs/reasoning-checkpoint.md
# SEC-DR-002/004/005/007.
# ---------------------------------------------------------------------------
echo ""
echo "--- Section 4: subagent-trace.cjs non-suppressible under TH_HOOK_PROFILE=minimal ---"

STOP_CJS="$REPO_ROOT/hooks/ts/dist/subagent-trace.cjs"

if [ ! -f "$STOP_CJS" ]; then
    echo "  [SKIP] subagent-trace.cjs not found at $STOP_CJS — run 'npm --prefix hooks/ts run build:subagent-trace' first."
else
    make_stop_payload() {
        local agent_type="$1" agent_id="$2"
        python3 -c "
import json, sys
print(json.dumps({'tool_name': 'SubagentStop', 'tool_input': {'agent_type': sys.argv[1], 'agent_id': sys.argv[2], 'stop_reason': 'complete'}}))
" "$agent_type" "$agent_id"
    }

    rm -f "$TRACE_FILE"
    stop_payload="$(make_stop_payload "th:tester" "agent-fixture-42")"
    out="$(cd "$WORKDIR" && echo "$stop_payload" | TH_HOOK_PROFILE=minimal node "$STOP_CJS" 2>/dev/null)"
    rc=$?

    [ "$rc" -eq 0 ] && r=1 || r=0
    assert_true "TH_HOOK_PROFILE=minimal: subagent-trace exits 0" "$r"

    [ -z "$out" ] && r=1 || r=0
    assert_true "TH_HOOK_PROFILE=minimal: subagent-trace emits no stdout" "$r"

    [ -f "$TRACE_FILE" ] && r=1 || r=0
    assert_true "TH_HOOK_PROFILE=minimal: subagent-trace STILL writes the breadcrumb (non-suppressible)" "$r"

    if [ -f "$TRACE_FILE" ]; then
        LINE="$(cat "$TRACE_FILE")"
        if echo "$LINE" | grep -q '"event":"subagent.stop"'; then r=1; else r=0; fi
        assert_true "TH_HOOK_PROFILE=minimal: trace line has event=subagent.stop" "$r"

        if echo "$LINE" | grep -q '"agent_id":"agent-fixture-42"'; then r=1; else r=0; fi
        assert_true "TH_HOOK_PROFILE=minimal: trace line carries the agent_id correlation key (SEC-DR-007)" "$r"
    fi
fi

# ---------------------------------------------------------------------------
# Section 5 — Task-5 AC-5.1/5.3/5.4: `project` key from the TH-LANE marker
# ---------------------------------------------------------------------------
echo ""
echo "--- Section 5: project key from TH-LANE marker (AC-5.1/5.3/5.4) ---"

# 5a. AC-5.1 — valid marker on the first line (controlled header) → project
# stamped on the breadcrumb.
rm -f "$TRACE_FILE"
payload="$(make_payload_with_prompt "th:implementer" $'TH-LANE: project-alpha\nYou are th:implementer.\nDo the work.')"
out="$(cd "$WORKDIR" && echo "$payload" | node "$CJS" 2>/dev/null)"
rc=$?

[ "$rc" -eq 0 ] && r=1 || r=0
assert_true "AC-5.1: valid TH-LANE marker dispatch exits 0" "$r"

if [ -f "$TRACE_FILE" ]; then
    LINE="$(cat "$TRACE_FILE")"

    if echo "$LINE" | grep -q '"project":"project-alpha"'; then r=1; else r=0; fi
    assert_true "AC-5.1: trace line carries project=project-alpha" "$r"

    KEYS="$(python3 -c "import json,sys; print(','.join(sorted(json.loads(sys.argv[1]).keys())))" "$LINE" 2>/dev/null || true)"
    [ "$KEYS" = "agent_type,event,payload_bytes,project,ts" ] && r=1 || r=0
    assert_true "AC-5.1: trace line has exactly {ts, event, agent_type, project, payload_bytes} keys" "$r"
else
    assert_true "AC-5.1: trace line carries project=project-alpha" 0
    assert_true "AC-5.1: trace line has exactly {ts, event, agent_type, project, payload_bytes} keys" 0
fi

# 5b. AC-5.3 — marker absent → project omitted, backward-compat key set.
rm -f "$TRACE_FILE"
payload="$(make_payload_with_prompt "th:implementer" "You are th:implementer. Do the work.")"
out="$(cd "$WORKDIR" && echo "$payload" | node "$CJS" 2>/dev/null)"
rc=$?

[ "$rc" -eq 0 ] && r=1 || r=0
assert_true "AC-5.3: no-marker dispatch exits 0" "$r"

if [ -f "$TRACE_FILE" ]; then
    LINE="$(cat "$TRACE_FILE")"

    if echo "$LINE" | grep -q '"project"'; then r=0; else r=1; fi
    assert_true "AC-5.3: trace line does NOT carry project (marker absent)" "$r"

    KEYS="$(python3 -c "import json,sys; print(','.join(sorted(json.loads(sys.argv[1]).keys())))" "$LINE" 2>/dev/null || true)"
    [ "$KEYS" = "agent_type,event,payload_bytes,ts" ] && r=1 || r=0
    assert_true "AC-5.3: trace line has exactly {ts, event, agent_type, payload_bytes} keys (backward-compat)" "$r"
else
    assert_true "AC-5.3: trace line does NOT carry project (marker absent)" 0
    assert_true "AC-5.3: trace line has exactly {ts, event, agent_type, payload_bytes} keys (backward-compat)" 0
fi

# 5c. AC-5.4 — marker present but out of the [a-z0-9-]{1,60} bound → omitted.
for bad_value in "Project_Alpha" "has/slash" "$(python3 -c "print('a'*61)")"; do
    rm -f "$TRACE_FILE"
    payload="$(make_payload_with_prompt "th:implementer" "TH-LANE: ${bad_value}")"
    out="$(cd "$WORKDIR" && echo "$payload" | node "$CJS" 2>/dev/null)"
    rc=$?

    [ "$rc" -eq 0 ] && r=1 || r=0
    assert_true "AC-5.4: out-of-bound marker ('${bad_value:0:20}...') dispatch exits 0" "$r"

    if [ -f "$TRACE_FILE" ]; then
        LINE="$(cat "$TRACE_FILE")"
        if echo "$LINE" | grep -q '"project"'; then r=0; else r=1; fi
        assert_true "AC-5.4: out-of-bound marker ('${bad_value:0:20}...') omits project" "$r"
    else
        assert_true "AC-5.4: out-of-bound marker ('${bad_value:0:20}...') omits project" 0
    fi
done

# 5e. AC-5.5 — a valid, well-shaped TH-LANE marker that appears LOWER in the
# prompt (not the first line) must be ignored: it is untrusted content per
# CLAUDE.md §6.6, not the dispatcher's own controlled header. Mirrors
# checkpoint-guard's AC-4.5a (marker outside the controlled header is never
# scanned).
rm -f "$TRACE_FILE"
payload="$(make_payload_with_prompt "th:implementer" $'You are th:implementer.\nTH-LANE: project-alpha\nDo the work.')"
out="$(cd "$WORKDIR" && echo "$payload" | node "$CJS" 2>/dev/null)"
rc=$?

[ "$rc" -eq 0 ] && r=1 || r=0
assert_true "AC-5.5: TH-LANE not on first line dispatch exits 0" "$r"

if [ -f "$TRACE_FILE" ]; then
    LINE="$(cat "$TRACE_FILE")"

    if echo "$LINE" | grep -q '"project"'; then r=0; else r=1; fi
    assert_true "AC-5.5: TH-LANE marker not on first line is IGNORED (project omitted)" "$r"

    KEYS="$(python3 -c "import json,sys; print(','.join(sorted(json.loads(sys.argv[1]).keys())))" "$LINE" 2>/dev/null || true)"
    [ "$KEYS" = "agent_type,event,payload_bytes,ts" ] && r=1 || r=0
    assert_true "AC-5.5: trace line has exactly {ts, event, agent_type, payload_bytes} keys (backward-compat)" "$r"
else
    assert_true "AC-5.5: TH-LANE marker not on first line is IGNORED (project omitted)" 0
    assert_true "AC-5.5: trace line has exactly {ts, event, agent_type, payload_bytes} keys (backward-compat)" 0
fi

# ---------------------------------------------------------------------------
# Section 6 — AC-1/AC-2/AC-5: payload_bytes visibility, no ceiling
# ---------------------------------------------------------------------------
echo ""
echo "--- Section 6: payload_bytes (AC-1/AC-2/AC-5) ---"

# 6a. AC-1/AC-5 — a real-size prompt yields payload_bytes equal to the exact
# UTF-8 byte length of that prompt, nothing more and nothing less.
rm -f "$TRACE_FILE"
PROMPT_TEXT="You are th:implementer. Implement Task-6 per 01-plan.md."
EXPECTED_BYTES="$(printf '%s' "$PROMPT_TEXT" | wc -c | tr -d ' ')"
payload="$(make_payload_with_prompt "th:implementer" "$PROMPT_TEXT")"
out="$(cd "$WORKDIR" && echo "$payload" | node "$CJS" 2>/dev/null)"
rc=$?

[ "$rc" -eq 0 ] && r=1 || r=0
assert_true "AC-1: payload_bytes dispatch exits 0" "$r"

if [ -f "$TRACE_FILE" ]; then
    LINE="$(cat "$TRACE_FILE")"
    ACTUAL_BYTES="$(python3 -c "import json,sys; print(json.loads(sys.argv[1])['payload_bytes'])" "$LINE" 2>/dev/null || true)"
    [ "$ACTUAL_BYTES" = "$EXPECTED_BYTES" ] && r=1 || r=0
    assert_true "AC-5: payload_bytes ($ACTUAL_BYTES) equals the prompt's exact byte length ($EXPECTED_BYTES)" "$r"
else
    assert_true "AC-5: payload_bytes equals the prompt's exact byte length" 0
fi

# 6b. AC-2 — static check: no threshold constant, comparison, or decision
# branch on payload_bytes in the hook body. The only conditional touching
# the computed value is the fail-open null check, which this pattern does
# not match.
if command grep -qE 'payloadBytes\s*(>|<|>=|<=)' "$BODY_TS"; then r=0; else r=1; fi
assert_true "AC-2: no size comparison operator applied to payloadBytes in the hook body" "$r"

if command grep -qE 'PAYLOAD_BYTES_(MAX|MIN|THRESHOLD|LIMIT|CAP)' "$BODY_TS"; then r=0; else r=1; fi
assert_true "AC-2: no payload_bytes threshold constant declared in the hook body" "$r"

# ---------------------------------------------------------------------------
# Section 7 — AC-4/AC-5: docs/observability.md documents the field
# ---------------------------------------------------------------------------
echo ""
echo "--- Section 7: docs/observability.md § subagent.start documents payload_bytes (AC-4) ---"

OBS_MD="$REPO_ROOT/docs/observability.md"
if [ ! -f "$OBS_MD" ]; then
    echo "  [SKIP] docs/observability.md not found at $OBS_MD"
else
    # Slice from the "### subagent.start" heading to the next "## "/"### "
    # heading (or EOF), then collapse whitespace runs to a single space so a
    # phrase that hard-wraps across source lines still matches a contiguous
    # substring check.
    OBS_SECTION="$(awk '
        /^### subagent\.start/ { found=1 }
        found && /^(##|###) / && !/^### subagent\.start/ { exit }
        found { print }
    ' "$OBS_MD" | tr "\n" " " | tr -s " ")"

    [ -n "$OBS_SECTION" ] && r=1 || r=0
    assert_true "AC-4: docs/observability.md has a '### subagent.start' section" "$r"

    if echo "$OBS_SECTION" | grep -qF '"payload_bytes"'; then r=1; else r=0; fi
    assert_true "AC-4: section's line-schema example includes payload_bytes" "$r"

    if echo "$OBS_SECTION" | grep -qF 'visibility, no ceiling'; then r=1; else r=0; fi
    assert_true "AC-4: section declares payload_bytes visibility-only, no ceiling" "$r"

    if echo "$OBS_SECTION" | grep -qF 'measured only on the Claude Code plugin path' \
        && echo "$OBS_SECTION" | grep -qF 'no `subagent-start.opencode.ts`' \
        && echo "$OBS_SECTION" | grep -qF 'opencode dispatch never gets this field'; then r=1; else r=0; fi
    assert_true "AC-4: section names the Claude-Code-plugin-only coverage limitation without overclaiming" "$r"

    if echo "$OBS_SECTION" | grep -qF 'No content beyond the byte count'; then r=1; else r=0; fi
    assert_true "AC-5: section states the content-boundary invariant (byte count only)" "$r"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
if [ "$FAIL" -gt 0 ]; then
    echo "Failures:"
    for f in "${FAILURES[@]}"; do
        echo "  - $f"
    done
    exit 1
fi
exit 0
