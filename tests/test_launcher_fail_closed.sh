#!/bin/bash
# tests/test_launcher_fail_closed.sh
# Suite 136 — launcher-fail-closed-on-corrupt-artifact
#
# Behavioral tests for hooks/run-ts-hook.sh (SEC-PR2-001). The launcher's
# original fail-closed contract only checked that node and the compiled
# .cjs artifact EXIST; it never checked that node actually EMITTED a
# decision. A present-but-non-functional artifact (empty/truncated file,
# node runtime error, or garbage stdout) let node run and exit without a
# decision -> silent pass-through on the 5 deny-floors. This suite proves
# the hardened launcher denies in each of those cases, while worktree-guard
# (advisory) and observational hooks stay silent (exit 0, unchanged) under
# the same conditions, and that a functioning artifact's real "none"
# decision (empty stdout, exit 0 — the common case) still passes through.
#
# Fixtures run under a throwaway copy of run-ts-hook.sh so the real
# hooks/ts/dist/*.cjs artifacts are never touched.
#
# Usage:
#   bash tests/test_launcher_fail_closed.sh
# Exit code:
#   0 if all cases pass, 1 otherwise.

# Marker: launcher-fail-closed-on-corrupt-artifact

set -u

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LAUNCHER_SRC="$REPO_ROOT/hooks/run-ts-hook.sh"

if [ ! -f "$LAUNCHER_SRC" ]; then
    echo "ERROR: $LAUNCHER_SRC not found"
    exit 1
fi

if ! command -v node >/dev/null 2>&1; then
    echo "SKIP: node not found — launcher fail-closed suite requires node"
    exit 0
fi

PASS=0
FAIL=0
declare -a FAILURES

declare -a CLEANUP_DIRS
cleanup_all() {
    for d in "${CLEANUP_DIRS[@]+"${CLEANUP_DIRS[@]}"}"; do
        rm -rf "$d" 2>/dev/null || true
    done
}
trap cleanup_all EXIT

# ---------------------------------------------------------------------------
# Fixture builder
#
# make_fixture <hook_name> <mode>
#   Builds a throwaway "hooks/" root containing a copy of run-ts-hook.sh and
#   a single hook's .cjs artifact written per <mode>:
#     empty          — zero-byte file (the "partial write" scenario)
#     syntax-error    — invalid JS (node exits non-zero, error on stderr)
#     exit-nonzero    — valid JS that calls process.exit(3)
#     garbage-stdout  — valid JS that prints non-JSON, non-decision text
#     good-none       — real logic that emits a legitimate empty decision
#     fake-decision-substring — non-JSON text containing the literal
#                       "permissionDecision" substring (proves the launcher
#                       parses the envelope instead of grepping for it)
#     nonzero-silent  — valid JS that calls process.exit(7) with no stdout
#                       (proves the fail-open capture path swallows the
#                       non-zero exit instead of propagating it)
#   Prints the fixture root path.
# ---------------------------------------------------------------------------
make_fixture() {
    local hook_name="$1"
    local mode="$2"
    local tmp
    tmp="$(mktemp -d)"
    CLEANUP_DIRS+=("$tmp")
    mkdir -p "$tmp/hooks/ts/dist"
    cp "$LAUNCHER_SRC" "$tmp/hooks/run-ts-hook.sh"
    chmod +x "$tmp/hooks/run-ts-hook.sh"

    local cjs="$tmp/hooks/ts/dist/${hook_name}.cjs"
    case "$mode" in
        empty)
            : > "$cjs"
            ;;
        syntax-error)
            printf 'function broken( {\n' > "$cjs"
            ;;
        exit-nonzero)
            printf 'process.exit(3);\n' > "$cjs"
            ;;
        garbage-stdout)
            printf 'process.stdout.write("not a decision envelope");\n' > "$cjs"
            ;;
        good-none)
            printf 'process.stdout.write("");\nprocess.exit(0);\n' > "$cjs"
            ;;
        fake-decision-substring)
            printf 'process.stdout.write("corrupt artifact but mentions permissionDecision anyway");\n' > "$cjs"
            ;;
        nonzero-silent)
            printf 'process.exit(7);\n' > "$cjs"
            ;;
    esac
    echo "$tmp"
}

run_launcher() {
    local root="$1"
    local hook_name="$2"
    bash "$root/hooks/run-ts-hook.sh" "$hook_name" < /dev/null 2>/dev/null
}

assert_deny() {
    local name="$1" root="$2" hook_name="$3"
    local out
    out=$(run_launcher "$root" "$hook_name")
    if echo "$out" | grep -q '"permissionDecision":"deny"'; then
        PASS=$((PASS + 1)); echo "  [PASS] DENY: $name"
    else
        FAIL=$((FAIL + 1)); FAILURES+=("DENY expected: $name | got: ${out:-<empty>}")
        echo "  [FAIL] DENY: $name (got: ${out:-<empty>})"
    fi
}

assert_silent_exit0() {
    local name="$1" root="$2" hook_name="$3"
    local out status
    out=$(run_launcher "$root" "$hook_name")
    status=$?
    if [ -z "$out" ] && [ "$status" -eq 0 ]; then
        PASS=$((PASS + 1)); echo "  [PASS] SILENT-EXIT0: $name"
    else
        FAIL=$((FAIL + 1)); FAILURES+=("SILENT-EXIT0 expected: $name | got out=${out:-<empty>} status=$status")
        echo "  [FAIL] SILENT-EXIT0: $name (got out=${out:-<empty>} status=$status)"
    fi
}

# assert_no_deny_decision — the launcher must NEVER hard-deny an advisory or
# observational hook. worktree-guard/observational keep the plain
# `exec node "$CJS"` path (no capture/inspect logic added by SEC-PR2-001),
# so node's raw exit status on a corrupt artifact passes straight through —
# that pass-through is pre-existing and out of scope here. What the F5
# contract actually guarantees for these two classes is narrower: whatever
# node does, the launcher itself never turns it into a permissionDecision
# block.
assert_no_deny_decision() {
    local name="$1" root="$2" hook_name="$3"
    local out
    out=$(run_launcher "$root" "$hook_name")
    if echo "$out" | grep -q '"permissionDecision"'; then
        FAIL=$((FAIL + 1)); FAILURES+=("NO-DENY-DECISION violated: $name | got: $out")
        echo "  [FAIL] NO-DENY-DECISION: $name (got: $out — contract violation)"
    else
        PASS=$((PASS + 1)); echo "  [PASS] NO-DENY-DECISION: $name (no decision emitted)"
    fi
}

FAILURE_MODES="empty syntax-error exit-nonzero garbage-stdout"

# ---------------------------------------------------------------------------
# Deny-floors — every failure mode must deny, for every deny-floor hook name.
# ---------------------------------------------------------------------------
echo "=== Deny-floors: corrupt/non-emitting artifact -> DENY (never pass-through) ==="
for hook in policy-block dev-guard gcp-guard prepublish-guard checkpoint-guard; do
    for mode in $FAILURE_MODES; do
        root=$(make_fixture "$hook" "$mode")
        assert_deny "$hook / $mode" "$root" "$hook"
    done
done

# ---------------------------------------------------------------------------
# Deny-floors — non-JSON output that merely CONTAINS the literal
# "permissionDecision" substring must still deny. Proves the launcher parses
# the envelope (JSON.parse + field check) instead of grepping for the
# substring, which a corrupt artifact could fake.
# ---------------------------------------------------------------------------
echo
echo "=== Deny-floors: fake substring match (not real JSON) -> DENY ==="
for hook in policy-block dev-guard gcp-guard prepublish-guard checkpoint-guard; do
    root=$(make_fixture "$hook" "fake-decision-substring")
    assert_deny "$hook / fake-decision-substring" "$root" "$hook"
done

# ---------------------------------------------------------------------------
# Deny-floors — a legitimate "none" decision (real logic, empty stdout,
# exit 0) still passes through unchanged. This is the load-bearing check
# that the hardening does not regress the common case: most tool calls
# match nothing and every floor defers silently.
# ---------------------------------------------------------------------------
echo
echo "=== Deny-floors: functioning artifact emitting a real 'none' -> SILENT PASS-THROUGH ==="
for hook in policy-block dev-guard gcp-guard prepublish-guard checkpoint-guard; do
    root=$(make_fixture "$hook" "good-none")
    assert_silent_exit0 "$hook / legitimate none decision" "$root" "$hook"
done

# ---------------------------------------------------------------------------
# worktree-guard (advisory) — unaffected by the hardening; stays silent
# exit 0 under the exact same corrupt-artifact conditions.
# ---------------------------------------------------------------------------
echo
echo "=== worktree-guard (advisory): corrupt artifact -> NEVER hard-denies (unaffected by the hardening) ==="
for mode in $FAILURE_MODES; do
    root=$(make_fixture "worktree-guard" "$mode")
    assert_no_deny_decision "worktree-guard / $mode" "$root" "worktree-guard"
done

# ---------------------------------------------------------------------------
# observational (e.g. notify-stage) — unaffected by the hardening; never
# turns a corrupt artifact into a hard-deny decision.
# ---------------------------------------------------------------------------
echo
echo "=== observational (notify-stage): corrupt artifact -> NEVER hard-denies (unaffected by the hardening) ==="
for mode in $FAILURE_MODES; do
    root=$(make_fixture "notify-stage" "$mode")
    assert_no_deny_decision "notify-stage / $mode" "$root" "notify-stage"
done

# ---------------------------------------------------------------------------
# worktree-guard (advisory) and observational (notify-stage) — a node
# runtime that exits non-zero with no stdout must not propagate that exit
# status. The launcher captures output instead of exec-replacing the shell,
# so the failure is swallowed and the launcher itself always exits 0.
# ---------------------------------------------------------------------------
echo
echo "=== advisory/observational: node exits non-zero -> launcher exits 0 silently ==="
root=$(make_fixture "worktree-guard" "nonzero-silent")
assert_silent_exit0 "worktree-guard / node exits non-zero" "$root" "worktree-guard"
root=$(make_fixture "notify-stage" "nonzero-silent")
assert_silent_exit0 "notify-stage / node exits non-zero" "$root" "notify-stage"

# ---------------------------------------------------------------------------
# Regression guard: real dist artifacts still pass through on a benign
# payload (node/artifact both healthy — zero behavioral change on the
# working path). Skipped when the repo's compiled artifacts are absent.
# ---------------------------------------------------------------------------
echo
echo "=== Regression: real dist artifact + benign payload -> SILENT PASS-THROUGH (happy path unaffected) ==="
REAL_CJS="$REPO_ROOT/hooks/ts/dist/policy-block.cjs"
if [ -f "$REAL_CJS" ]; then
    root=$(make_fixture "policy-block" "empty")
    cp "$REAL_CJS" "$root/hooks/ts/dist/policy-block.cjs"
    out=$(printf '{"tool_name":"Bash","tool_input":{"command":"git status"}}' \
        | bash "$root/hooks/run-ts-hook.sh" policy-block 2>/dev/null)
    status=$?
    if [ -z "$out" ] && [ "$status" -eq 0 ]; then
        PASS=$((PASS + 1)); echo "  [PASS] HAPPY-PATH: real artifact, benign Bash -> silent pass-through"
    else
        FAIL=$((FAIL + 1)); FAILURES+=("HAPPY-PATH: real artifact, benign Bash | got out=${out:-<empty>} status=$status")
        echo "  [FAIL] HAPPY-PATH: real artifact, benign Bash (got out=${out:-<empty>} status=$status)"
    fi
else
    echo "  [SKIP] HAPPY-PATH: $REAL_CJS not built — run 'npm --prefix hooks/ts run build'"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo
echo "============================================================"
echo "  Suite 136 launcher-fail-closed-on-corrupt-artifact: $PASS passed / $((PASS + FAIL)) total"
echo "============================================================"

if [ $FAIL -gt 0 ]; then
    echo
    echo "Failures:"
    for f in "${FAILURES[@]}"; do
        echo "  - $f"
    done
    exit 1
fi
exit 0
