#!/bin/bash
# tests/test_bin_tty_behavioral.sh
#
# Suite 152 — bin-tty-guard-behavioral (#473 follow-up)
#
# Behavioral companion to Suite 151 (tests/test_bin_tty_execbit.py). Suite 151
# is STATIC: it checks the git-tracked file mode and greps `bin/*.sh` source
# text for the presence/absence of specific guard idioms. It cannot catch a
# case where an idiom is textually present but behaves wrong at RUNTIME under
# a real shell — which is exactly the class of defect this bug was about: the
# plan's round-1 candidate fix (`{ : < /dev/tty; }`) looked correct on paper
# (would have passed a purely textual "guard replaced" check) but is
# empirically fatal under dash — see `01-plan.md § Review Summary § Fix
# propuesto` for the `setsid dash -c '...'` reproduction that surfaced this.
#
# This suite exercises the ACTUAL guard logic — extracted verbatim from the
# real source files via `awk` (never duplicated/reproduced by hand, so a
# future source edit cannot silently drift out of sync with this test) — under
# two simulated runtime conditions, using a stub `install` binary so nothing
# is ever downloaded or invoked over the network:
#
#   1. No controlling terminal (agentic Bash / CI / cron — AC-2, AC-3): the
#      extracted guard block runs via `setsid dash -c "$snippet" </dev/null`.
#      `setsid` detaches the process from any controlling terminal, so
#      `/dev/tty` exists as a device node but is NOT openable — this is the
#      exact condition the bug report describes. Asserts: exit 0, the
#      no-redirect fallback branch is reached (stub invoked), and no ENXIO
#      ("No such device or address") surfaces.
#   2. An openable /dev/tty (interactive shell — AC-4): the extracted guard
#      block runs inside a pseudo-terminal via Python's `pty.spawn`, which
#      gives the child process a real controlling terminal. Asserts the
#      redirect branch is taken and the stub's stdin is actually a TTY —
#      i.e. interactive/paste behavior is unchanged.
#
# A negative-control canary (the FORBIDDEN `{ : < /dev/tty; }` special-builtin
# form — never present in `bin/*.sh`, reproduced here only as a canary)
# confirms the harness can actually discriminate a broken guard from a
# working one: under dash + setsid this form terminates the shell silently
# (no fallback reached, non-zero exit) rather than falling through — proving
# a purely textual check would have missed this defect class but this
# behavioral harness does not.
#
# Requires: dash (the real shebang shell of the 4 guard sites on the primary
# target OS), setsid, python3 (for the pty.spawn openable-tty simulation).
# Skips cleanly (exit 0) when any is absent, UNLESS TH_REQUIRE_RUNTIMES=1
# (CI), which converts the skip into a FAIL — mirrors the report_skip_or_fail
# convention in tests/run-all.sh.
#
# Usage:
#   ./tests/test_bin_tty_behavioral.sh
# Exit code:
#   0 if all assertions pass (or the suite skips outside CI), 1 otherwise.
#
# Marker: bin-tty-guard-behavioral

set -u

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN_DIR="$REPO_ROOT/bin"

echo "=== Suite 152: bin-tty-guard-behavioral ==="
echo

MISSING=""
command -v dash >/dev/null 2>&1 || MISSING="$MISSING dash"
command -v setsid >/dev/null 2>&1 || MISSING="$MISSING setsid"
command -v python3 >/dev/null 2>&1 || MISSING="$MISSING python3"
if [ -n "$MISSING" ]; then
    if [ "${TH_REQUIRE_RUNTIMES:-0}" = "1" ]; then
        echo "FAIL: missing required runtime(s):$MISSING (TH_REQUIRE_RUNTIMES=1 requires them)"
        exit 1
    fi
    echo "SKIP: missing required runtime(s):$MISSING — behavioral /dev/tty guard coverage not verified on this machine"
    exit 0
fi

PASS=0
FAIL=0
declare -a FAILURES

check() {
    local name="$1" condition="$2" detail="${3:-}"
    if [ "$condition" = "true" ]; then
        PASS=$((PASS + 1))
        echo "  [PASS] $name"
    else
        FAIL=$((FAIL + 1))
        FAILURES+=("$name${detail:+ — $detail}")
        echo "  [FAIL] $name${detail:+ — $detail}"
    fi
}

# Extracts the Nth occurrence (1-based) of the `if (exec < /dev/tty)
# 2>/dev/null; then ... fi` guard block from a source file, verbatim, with no
# reproduction/duplication. Tolerant of leading indentation (install-opencode.sh
# nests both guard sites one level deep inside an outer if/else).
extract_guard_block() {
    local file="$1" occurrence="$2"
    awk -v want="$occurrence" '
        /^[ \t]*if \(exec < \/dev\/tty\) 2>\/dev\/null; then[ \t]*$/ {
            count++
            if (count == want) { flag=1 }
        }
        flag { print }
        flag && /^[ \t]*fi[ \t]*$/ { exit }
    ' "$file"
}

# Stub `install` binary — replaces the real (network-fetched) binary via the
# `$TMP/install` invocation inside the extracted guard block. Reports whether
# its own stdin is a TTY, which is how assert_site_pty distinguishes the
# redirect branch from the fallback branch.
STUBDIR="$(mktemp -d)"
cat > "$STUBDIR/install" << 'STUB'
#!/bin/sh
if [ -t 0 ]; then
    echo "STUB-RAN:STDIN-IS-TTY"
else
    echo "STUB-RAN:STDIN-NOT-TTY"
fi
exit 0
STUB
chmod +x "$STUBDIR/install"
trap 'rm -rf "$STUBDIR"' EXIT

# assert_site_no_tty <label> <file> <occurrence>
# Simulates AC-2/AC-3: /dev/tty exists but is not openable (no controlling
# terminal). The guard must fall through to the no-redirect branch, exit 0,
# and never surface ENXIO.
assert_site_no_tty() {
    local label="$1" file="$2" occ="$3"
    local snippet
    snippet="$(extract_guard_block "$file" "$occ")"
    if [ -z "$snippet" ]; then
        check "$label (no-controlling-tty): guard block extracted from source" "false" \
            "extraction found no match at occurrence $occ in $file — guard pattern may have drifted"
        return
    fi

    local outfile errfile rc out err
    outfile="$(mktemp)"; errfile="$(mktemp)"
    TMP="$STUBDIR" setsid dash -c "$snippet" </dev/null >"$outfile" 2>"$errfile"
    rc=$?
    out="$(cat "$outfile")"; err="$(cat "$errfile")"
    rm -f "$outfile" "$errfile"

    local ok_exit=false ok_fallback=false ok_no_enxio=true
    [ "$rc" -eq 0 ] && ok_exit=true
    case "$out" in *STUB-RAN*) ok_fallback=true ;; esac
    case "$err" in *"No such device or address"*) ok_no_enxio=false ;; esac

    check "$label: exits 0 under no-controlling-terminal (setsid)" "$ok_exit" "exit=$rc"
    check "$label: falls through to the no-redirect fallback branch" "$ok_fallback" "stdout=[$out]"
    check "$label: no ENXIO ('No such device or address') surfaces" "$ok_no_enxio" "stderr=[$err]"
}

# assert_site_pty <label> <file> <occurrence>
# Simulates AC-4: an interactive shell with an openable /dev/tty. The guard
# must take the redirect branch — the invoked binary's stdin must actually be
# a terminal.
assert_site_pty() {
    local label="$1" file="$2" occ="$3"
    local snippet
    snippet="$(extract_guard_block "$file" "$occ")"
    if [ -z "$snippet" ]; then
        check "$label (openable-tty): guard block extracted from source" "false" \
            "extraction found no match at occurrence $occ in $file — guard pattern may have drifted"
        return
    fi

    local outfile out
    outfile="$(mktemp)"
    TMP="$STUBDIR" python3 - "$snippet" > "$outfile" 2>&1 << 'PYEOF'
import pty, sys
snippet = sys.argv[1]
pty.spawn(["dash", "-c", snippet])
sys.exit(0)
PYEOF
    out="$(tr -d '\r' < "$outfile")"
    rm -f "$outfile"

    local ok_stub_ran=false
    case "$out" in *STUB-RAN:STDIN-IS-TTY*) ok_stub_ran=true ;; esac

    check "$label: redirects stdin from an openable /dev/tty (interactive path unchanged)" "$ok_stub_ran" "output=[$out]"
}

echo "--- install.sh (AC-3) ---"
assert_site_no_tty "install.sh" "$BIN_DIR/install.sh" 1
assert_site_pty "install.sh" "$BIN_DIR/install.sh" 1

echo
echo "--- install-opencode.sh, memory-url branch (AC-3) ---"
assert_site_no_tty "install-opencode.sh (memory-url branch)" "$BIN_DIR/install-opencode.sh" 1
assert_site_pty "install-opencode.sh (memory-url branch)" "$BIN_DIR/install-opencode.sh" 1

echo
echo "--- install-opencode.sh, no-url branch (AC-3) ---"
assert_site_no_tty "install-opencode.sh (no-url branch)" "$BIN_DIR/install-opencode.sh" 2
assert_site_pty "install-opencode.sh (no-url branch)" "$BIN_DIR/install-opencode.sh" 2

echo
echo "--- update-opencode.sh (AC-2) ---"
assert_site_no_tty "update-opencode.sh" "$BIN_DIR/update-opencode.sh" 1
assert_site_pty "update-opencode.sh" "$BIN_DIR/update-opencode.sh" 1

echo
echo "--- Canary (negative control — proves this harness discriminates) ---"
# The forbidden `{ : < /dev/tty; }` special-builtin form is NEVER present in
# bin/*.sh (Suite 151 asserts this statically). It is reproduced here only as
# a negative control: under dash, a redirection error on `:` (a POSIX special
# builtin) terminates the non-interactive shell — silently, before reaching
# the fallback branch or any statement after the `fi`. If this canary ever
# reached CANARY-REACHED-END with exit 0, this harness's ability to
# distinguish a broken guard from a working one would be in question.
FATAL_SNIPPET='if { : < /dev/tty; } 2>/dev/null; then
    "$TMP/install" < /dev/tty
else
    "$TMP/install"
fi
echo CANARY-REACHED-END'
outfile="$(mktemp)"
TMP="$STUBDIR" setsid dash -c "$FATAL_SNIPPET" </dev/null >"$outfile" 2>&1
canary_rc=$?
canary_out="$(cat "$outfile")"
rm -f "$outfile"
canary_confirms_fatal=false
if [ "$canary_rc" -ne 0 ] && ! printf '%s' "$canary_out" | grep -q "CANARY-REACHED-END"; then
    canary_confirms_fatal=true
fi
check "canary: forbidden '{ : < /dev/tty; }' special-builtin form (not present in bin/*.sh) fails silently under dash+setsid, never reaching the fallback branch" \
    "$canary_confirms_fatal" "exit=$canary_rc output=[$canary_out]"

echo
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
    echo
    echo "Failures:"
    for f in "${FAILURES[@]}"; do
        echo "  - $f"
    done
    exit 1
fi

exit 0
