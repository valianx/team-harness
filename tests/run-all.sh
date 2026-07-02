#!/bin/bash
# tests/run-all.sh
# Convenience wrapper that runs every suite in tests/ and summarises results.
# Returns exit 0 if all suites pass, 1 otherwise.

set -u

TESTS_DIR="$(cd "$(dirname "$0")" && pwd)"

FAILED=0

# Suites 15/17/18/19/20 require node/npm/bun. A green run must mean "verified",
# never "not checked" — TH_REQUIRE_RUNTIMES=1 (set in CI) converts a missing-runtime
# SKIP into a FAIL. Unset/0 (local dev) preserves the graceful skip. go/python3
# skips (Suite 21 and others) are unaffected by this flag.
report_skip_or_fail() {
    local suite_label="$1" reason="$2"
    if [ "${TH_REQUIRE_RUNTIMES:-0}" = "1" ]; then
        echo "${suite_label}: FAIL (${reason} — TH_REQUIRE_RUNTIMES=1 requires it)"
        FAILED=$((FAILED + 1))
    else
        echo "${suite_label}: SKIP (${reason})"
    fi
}

# run_dual_target_suite <suite_label> <test_script>
# Runs the bash leg unconditionally (existing behavior, unchanged), then the
# same test script a second time with HOOK_IMPL=ts against the compiled TS
# artifact when node is present. A missing node under TH_REQUIRE_RUNTIMES=1
# reports FAIL via report_skip_or_fail — the ts leg can never silently skip
# in CI. Used by the 8 functional suites that dual-target a hook family
# (policy-block, checkpoint-guard, dev-guard, session-start,
# language-user-prompt, prepublish-guard, gcp-guard, worktree-guard).
run_dual_target_suite() {
    local label="$1" script="$2"
    if bash "$TESTS_DIR/$script"; then
        echo "${label} (bash): PASS"
    else
        echo "${label} (bash): FAIL"
        FAILED=$((FAILED + 1))
    fi
    if command -v node >/dev/null 2>&1; then
        if HOOK_IMPL=ts bash "$TESTS_DIR/$script"; then
            echo "${label} (ts): PASS"
        else
            echo "${label} (ts): FAIL"
            FAILED=$((FAILED + 1))
        fi
    else
        report_skip_or_fail "${label} (ts)" "node not found"
    fi
}

echo "############################################################"
echo "# Suite 1: hooks/policy-block.sh — functional tests (dual-target bash|ts)"
echo "############################################################"
run_dual_target_suite "policy-block" "test_policy_block.sh"

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
echo "# Suite 4: hooks/checkpoint-guard.sh — functional tests (dual-target bash|ts)"
echo "############################################################"
run_dual_target_suite "checkpoint-guard" "test_checkpoint_guard.sh"

echo
echo "############################################################"
echo "# Suite 5: hooks/dev-guard.sh — behavioral tests (dual-target bash|ts)"
echo "############################################################"
run_dual_target_suite "dev-guard" "test_dev_guard.sh"

echo
echo "############################################################"
echo "# Suite 6: hooks/session-start.sh — functional tests (dual-target bash|ts)"
echo "############################################################"
run_dual_target_suite "session-start" "test_session_start.sh"

echo
echo "############################################################"
echo "# Suite 7: hooks/language-user-prompt.sh — functional tests (dual-target bash|ts)"
echo "############################################################"
run_dual_target_suite "language-user-prompt" "test_language_user_prompt.sh"

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
echo "# Suite 10: hook-gates-hardening behavioral (Suite 85)"
echo "############################################################"
if bash "$TESTS_DIR/test_hook_gates_hardening.sh"; then
    echo "hook-gates-hardening: PASS"
else
    echo "hook-gates-hardening: FAIL"
    FAILED=$((FAILED + 1))
fi

echo
echo "############################################################"
echo "# Suite 11: hook-gates-hardening structural (Suite 85-py)"
echo "############################################################"
if python3 "$TESTS_DIR/test_agent_structure_hardening.py"; then
    echo "hook-gates-hardening-structural: PASS"
else
    echo "hook-gates-hardening-structural: FAIL"
    FAILED=$((FAILED + 1))
fi

echo
echo "############################################################"
echo "# Suite 12: security self-scan (5-check MVP)"
echo "############################################################"
if python3 "$TESTS_DIR/test_security_scan.py"; then
    echo "security-scan: PASS"
else
    echo "security-scan: FAIL"
    FAILED=$((FAILED + 1))
fi

echo
echo "############################################################"
echo "# Suite 13: harness scorecard (informational)"
echo "############################################################"
if python3 "$TESTS_DIR/harness_scorecard.py"; then
    echo "harness-scorecard: PASS"
else
    echo "harness-scorecard: FAIL"
    FAILED=$((FAILED + 1))
fi

echo
echo "############################################################"
echo "# Suite 14: changelog/version discipline — content-presence guard (registry Suite 119)"
echo "############################################################"
if python3 "$TESTS_DIR/test_changelog_version_rules.py"; then
    echo "changelog-version-rules: PASS"
else
    echo "changelog-version-rules: FAIL"
    FAILED=$((FAILED + 1))
fi

echo
echo "############################################################"
echo "# Suite 15: TypeScript hook parity (Bash <-> TS decision parity)"
echo "# Requires: node, npm, npx (esbuild). Skipped when absent."
echo "############################################################"
if ! command -v node >/dev/null 2>&1; then
    report_skip_or_fail "ts-hook-parity" "node not found"
elif ! command -v npm >/dev/null 2>&1; then
    report_skip_or_fail "ts-hook-parity" "npm not found"
else
    # Rebuild the TS bundles first — dist/ is committed, but the parity harness
    # must exercise a fresh build, not a possibly-stale committed artifact.
    TS_DIR="$TESTS_DIR/../hooks/ts"
    if [ -f "$TS_DIR/package.json" ]; then
        echo "  Building TS bundles (npm --prefix hooks/ts run build)..."
        if npm --prefix "$TS_DIR" run build >/dev/null 2>&1; then
            echo "  Build complete. Running parity harness..."
            if bash "$TESTS_DIR/test_ts_hook_parity.sh"; then
                echo "ts-hook-parity: PASS"
            else
                echo "ts-hook-parity: FAIL"
                FAILED=$((FAILED + 1))
            fi
        else
            # Build failed — report as FAIL so CI catches it (presence of node+npm
            # means the build environment supports TS hooks and a build failure is real).
            echo "ts-hook-parity: FAIL (build failed — run 'npm --prefix hooks/ts run build' for details)"
            FAILED=$((FAILED + 1))
        fi
    else
        echo "ts-hook-parity: SKIP (hooks/ts/package.json not found)"
    fi
fi

echo
echo "############################################################"
echo "# Suite 16: hooks/prepublish-guard.sh — bump-floor advisory (registry Suite 120, dual-target bash|ts)"
echo "############################################################"
run_dual_target_suite "prepublish-bump-floor" "test_prepublish_bump_floor.sh"

echo
echo "############################################################"
echo "# Suite 87: hooks/gcp-guard.sh — gcp-guard-hook-behavior (dual-target bash|ts)"
echo "############################################################"
run_dual_target_suite "gcp-guard" "test_gcp_guard.sh"

echo
echo "############################################################"
echo "# Suite 133: hooks/worktree-guard.sh — worktree-guard-hook-behavior (dual-target bash|ts)"
echo "############################################################"
run_dual_target_suite "worktree-guard" "test_worktree_guard.sh"

echo
echo "############################################################"
echo "# Suite 17: harness-migrate bidirectional transform (AC-1..AC-11)"
echo "# Requires: node. Skipped when absent (NOT a pass — see output)."
echo "############################################################"
if ! command -v node >/dev/null 2>&1; then
    report_skip_or_fail "harness-migrate" "node not found — install Node.js to run this suite"
else
    if node "$TESTS_DIR/../tools/harness-migrate/test_harness_migrate.mjs"; then
        echo "harness-migrate: PASS"
    else
        echo "harness-migrate: FAIL"
        FAILED=$((FAILED + 1))
    fi
fi

echo
echo "############################################################"
echo "# Suite 18: harness-migrate cross-language conformance (AC-3)"
echo "# Requires: node. Skipped when absent (NOT a pass — see output)."
echo "############################################################"
if ! command -v node >/dev/null 2>&1; then
    report_skip_or_fail "transform-conformance" "node not found — install Node.js to run this suite"
else
    if node "$TESTS_DIR/../tools/harness-migrate/test_transform_conformance.mjs"; then
        echo "transform-conformance: PASS"
    else
        echo "transform-conformance: FAIL"
        FAILED=$((FAILED + 1))
    fi
fi

echo
echo "############################################################"
echo "# Suite 19: opencode config-path resolver (AC-10 / SEC-OC-R3)"
echo "# Requires: node, npm, npx (esbuild). Skipped when absent."
echo "############################################################"
if ! command -v node >/dev/null 2>&1; then
    report_skip_or_fail "opencode-config-resolver" "node not found — install Node.js to run this suite"
elif ! command -v npm >/dev/null 2>&1; then
    report_skip_or_fail "opencode-config-resolver" "npm not found"
else
    if bash "$TESTS_DIR/test_opencode_config_resolver.sh"; then
        echo "opencode-config-resolver: PASS"
    else
        echo "opencode-config-resolver: FAIL"
        FAILED=$((FAILED + 1))
    fi
fi

echo
echo "############################################################"
echo "# Suite 20: opencode session.created enforcement (AC-1..AC-5 + S-1..S-4)"
echo "# Requires: node, npm, npx (esbuild). Skipped when absent."
echo "############################################################"
if ! command -v node >/dev/null 2>&1; then
    report_skip_or_fail "opencode-session-enforcement" "node not found — install Node.js to run this suite"
elif ! command -v npm >/dev/null 2>&1; then
    report_skip_or_fail "opencode-session-enforcement" "npm not found"
else
    if bash "$TESTS_DIR/test_opencode_session_enforcement.sh"; then
        echo "opencode-session-enforcement: PASS"
    else
        echo "opencode-session-enforcement: FAIL"
        FAILED=$((FAILED + 1))
    fi
fi

echo
echo "############################################################"
echo "# Suite 21: Go installer — opencode Windows completeness"
echo "# (buildImportCandidate 7-key read, accept/decline, SEC-004,"
echo "#  .ps1 static verify, banner gate logic)"
echo "# Requires: go. Skipped when absent."
echo "############################################################"
if ! command -v go >/dev/null 2>&1; then
    echo "go-installer-opencode-windows: SKIP (go not found — install Go to run this suite)"
else
    REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
    if go test "$REPO_ROOT/cmd/install/..." -count=1 -run "TestBuildImportCandidate|TestHasControlChar|TestIsValidISOLang|TestCCConfigFallback|TestApplyImportCandidate|TestAnsiSupported|TestInstallOpencodePS1" 2>&1; then
        echo "go-installer-opencode-windows: PASS"
    else
        echo "go-installer-opencode-windows: FAIL"
        FAILED=$((FAILED + 1))
    fi
fi

echo
echo "############################################################"
echo "# Suite 127: flow-event-schema-sync (AC-2.7 cross-repo guard)"
echo "############################################################"
if python3 "$TESTS_DIR/test_flow_event_schema_sync.py"; then
    echo "flow-event-schema-sync: PASS"
else
    echo "flow-event-schema-sync: FAIL"
    FAILED=$((FAILED + 1))
fi

echo
echo "############################################################"
echo "# Suite 22: update-models resolver fixture test (Suite 128)"
echo "# Requires: python3. Skips cleanly when absent."
echo "############################################################"
if bash "$TESTS_DIR/test_update_models_resolver.sh"; then
    echo "update-models-resolver: PASS"
else
    echo "update-models-resolver: FAIL"
    FAILED=$((FAILED + 1))
fi

echo
echo "############################################################"
echo "# Suite 23: /th:update managed-block sync — five-row matrix"
echo "# Requires: python3. Skips cleanly when absent."
echo "############################################################"
if bash "$TESTS_DIR/test_th_update_block_sync.sh"; then
    echo "th-update-block-sync: PASS"
else
    echo "th-update-block-sync: FAIL"
    FAILED=$((FAILED + 1))
fi

echo
echo "############################################################"
echo "# Suite 24: hooks/ts subagent-start — deterministic PreToolUse breadcrumb (registry Suite 134)"
echo "# Requires: node. Skipped when absent."
echo "############################################################"
if ! command -v node >/dev/null 2>&1; then
    report_skip_or_fail "subagent-start" "node not found — install Node.js to run this suite"
else
    if bash "$TESTS_DIR/test_subagent_start.sh"; then
        echo "subagent-start: PASS"
    else
        echo "subagent-start: FAIL"
        FAILED=$((FAILED + 1))
    fi
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
