#!/usr/bin/env bash
# tests/test_update_opencode_sh.sh
#
# Regression test: bin/update-opencode.sh's cheap VERSION pre-check (AC-9) must
# trigger on "--non-interactive" alone, and must be skipped ONLY when
# "--opencode-dir" is among the passthrough args (the flag that actually
# changes config-root resolution).
#
# Prior defect: the skip condition was "any positional arg present" ($# -eq 0),
# so the pre-check never ran in the real invocation pattern shipped by
# installer-assets/opencode-commands/th-update.md (which always appends
# --non-interactive) — the "already current, zero downloads" AC-2 claim was
# never actually exercised.
#
# Mocks curl on PATH so the test runs offline and deterministically: the
# VERSION endpoint mock always reports a version equal to the fixture's
# installed_version (forcing the "already current" branch when the pre-check
# runs), and the SHA256SUMS endpoint mock drops a marker file and fails
# (stopping the script early) so we can detect whether the download path was
# reached at all.
#
# Usage:
#   bash tests/test_update_opencode_sh.sh
# Exit 0 = all assertions pass, 1 = any failure.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
UPDATE_SCRIPT="$REPO_ROOT/bin/update-opencode.sh"

PASS=0
FAIL=0

assert_true() {
    local label="$1" condition="$2"
    if [ "$condition" = "1" ]; then
        echo "  PASS  $label"
        PASS=$((PASS + 1))
    else
        echo "  FAIL  $label"
        FAIL=$((FAIL + 1))
    fi
}

TMPROOT=$(mktemp -d)
trap 'rm -rf "$TMPROOT"' EXIT

MOCKBIN="$TMPROOT/mockbin"
mkdir -p "$MOCKBIN"
cat > "$MOCKBIN/curl" <<'MOCKCURL'
#!/bin/sh
# Minimal curl stand-in for test_update_opencode_sh.sh — see FAKE_VERSION /
# DOWNLOAD_MARKER env contract in the test driver.
url=""
outfile=""
prev=""
for arg in "$@"; do
    if [ "$prev" = "-o" ]; then
        outfile="$arg"
    fi
    case "$arg" in
        http*) url="$arg" ;;
    esac
    prev="$arg"
done

case "$url" in
    */VERSION)
        if [ -n "$outfile" ]; then
            : > "$outfile"
        else
            printf '%s' "$FAKE_VERSION"
        fi
        exit 0
        ;;
    */SHA256SUMS)
        touch "$DOWNLOAD_MARKER"
        exit 1
        ;;
    *)
        exit 1
        ;;
esac
MOCKCURL
chmod +x "$MOCKBIN/curl"

FAKE_VERSION="9.9.9"
CONFIG_DIR="$TMPROOT/config"
mkdir -p "$CONFIG_DIR/opencode"
cat > "$CONFIG_DIR/opencode/.team-harness.json" <<EOF
{
  "installed_version": "$FAKE_VERSION"
}
EOF

MARKER="$TMPROOT/download-reached"

run_update() {
    rm -f "$MARKER"
    env \
        XDG_CONFIG_HOME="$CONFIG_DIR" \
        PATH="$MOCKBIN:$PATH" \
        FAKE_VERSION="$FAKE_VERSION" \
        DOWNLOAD_MARKER="$MARKER" \
        sh "$UPDATE_SCRIPT" "$@"
}

echo "=== Suite 154: update-opencode.sh cheap pre-check honors --non-interactive ==="

# Case A: --non-interactive alone must trigger the pre-check and short-circuit
# before any download is attempted.
OUTPUT_A=$(run_update --non-interactive 2>&1)
EXIT_A=$?
case "$OUTPUT_A" in
    *"already current"*) ALREADY_CURRENT_SHOWN=1 ;;
    *) ALREADY_CURRENT_SHOWN=0 ;;
esac
[ -f "$MARKER" ] && DOWNLOAD_A=1 || DOWNLOAD_A=0

assert_true "non-interactive alone: pre-check reports already current" "$ALREADY_CURRENT_SHOWN"
assert_true "non-interactive alone: pre-check exits 0" "$([ "$EXIT_A" -eq 0 ] && echo 1 || echo 0)"
assert_true "non-interactive alone: no download attempted" "$([ "$DOWNLOAD_A" -eq 0 ] && echo 1 || echo 0)"

# Case B: --opencode-dir must still skip the pre-check (the config root the
# shell-side check reads is not necessarily the one the operator targeted).
OUTPUT_B=$(run_update --opencode-dir "$TMPROOT/other-root" --non-interactive 2>&1)
case "$OUTPUT_B" in
    *"already current"*) ALREADY_CURRENT_SHOWN_B=1 ;;
    *) ALREADY_CURRENT_SHOWN_B=0 ;;
esac
[ -f "$MARKER" ] && DOWNLOAD_B=1 || DOWNLOAD_B=0

assert_true "opencode-dir present: pre-check is skipped (no already-current)" "$([ "$ALREADY_CURRENT_SHOWN_B" -eq 0 ] && echo 1 || echo 0)"
assert_true "opencode-dir present: download path is reached" "$DOWNLOAD_B"

echo
echo "Results: $PASS passed, $FAIL failed"
if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
exit 0
