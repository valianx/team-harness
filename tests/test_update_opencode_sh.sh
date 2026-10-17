#!/usr/bin/env bash
# tests/test_update_opencode_sh.sh
#
# Regression test: bin/update-opencode.sh's cheap VERSION pre-check (AC-9) must
# trigger on harmless confirmation flags, and must not swallow arguments
# that select an installation root or change the desired installed assets.
#
# Prior defect: the skip condition was "any positional arg present" ($# -eq 0),
# so the pre-check never ran in the real invocation pattern shipped by
# installer-assets/opencode-commands/th-update.md (which always appends
# --non-interactive) — the "already current, zero downloads" AC-2 claim was
# never actually exercised.
#
# Mocks curl on PATH so the test runs offline and deterministically: the
# VERSION endpoint reports the fixture's installed_version; downloads serve
# a checksummed argument recorder so forwarding, spaces, and empty values
# are tested through the complete shell bootstrap.
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
FAKE_INSTALLER="$TMPROOT/installer"
cat > "$FAKE_INSTALLER" <<'MOCKINSTALLER'
#!/bin/sh
printf '<%s>\n' "$@" > "$BINARY_ARGS_FILE"
MOCKINSTALLER
if command -v sha256sum >/dev/null 2>&1; then
    FAKE_CHECKSUM=$(sha256sum "$FAKE_INSTALLER" | awk '{print $1}')
else
    FAKE_CHECKSUM=$(shasum -a 256 "$FAKE_INSTALLER" | awk '{print $1}')
fi
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
        printf '%s  install-linux-amd64\n' "$FAKE_CHECKSUM" > "$outfile"
        exit 0
        ;;
    */install-linux-amd64)
        cp "$FAKE_INSTALLER" "$outfile"
        exit 0
        ;;
    *)
        exit 1
        ;;
esac
MOCKCURL
chmod +x "$MOCKBIN/curl"

# The shell updater intentionally supports Unix/macOS only; make its platform
# probe deterministic so the pre-check itself is exercised when this test is
# launched from Git Bash on Windows.
cat > "$MOCKBIN/uname" <<'MOCKUNAME'
#!/bin/sh
case "$1" in
    -s) printf '%s\n' Linux ;;
    -m) printf '%s\n' x86_64 ;;
    *) exit 1 ;;
esac
MOCKUNAME
chmod +x "$MOCKBIN/uname"

FAKE_VERSION="9.9.9"
CONFIG_DIR="$TMPROOT/config"
mkdir -p "$CONFIG_DIR/opencode"
cat > "$CONFIG_DIR/opencode/.team-harness.json" <<EOF
{
  "installed_version": "$FAKE_VERSION"
}
EOF

MARKER="$TMPROOT/download-reached"
ARGS_FILE="$TMPROOT/binary-args"
TEST_OPENCODE_CONFIG_DIR=""
TEST_UPDATE_PATH="$MOCKBIN:$PATH"

run_update() {
    rm -f "$MARKER" "$ARGS_FILE"
    env \
        XDG_CONFIG_HOME="$CONFIG_DIR" \
        OPENCODE_CONFIG_DIR="$TEST_OPENCODE_CONFIG_DIR" \
        PATH="$TEST_UPDATE_PATH" \
        FAKE_VERSION="$FAKE_VERSION" \
        DOWNLOAD_MARKER="$MARKER" \
        FAKE_INSTALLER="$FAKE_INSTALLER" \
        FAKE_CHECKSUM="$FAKE_CHECKSUM" \
        BINARY_ARGS_FILE="$ARGS_FILE" \
        sh "$UPDATE_SCRIPT" "$@"
}

echo "=== Suite 154: update-opencode.sh pre-check preserves requested changes ==="

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

assert_forwarded() {
    local label="$1" expected="$2" output status actual
    shift 2
    output=$(run_update "$@" 2>&1)
    status=$?
    actual=$(cat "$ARGS_FILE" 2>/dev/null || true)
    assert_true "$label: updater completes" "$([ "$status" -eq 0 ] && echo 1 || echo 0)"
    assert_true "$label: downloaded binary receives exact arguments" "$([ "$actual" = "<update>
<--runtime>
<opencode>
<--scope>
<global>
$expected" ] && echo 1 || echo 0)"
}

assert_forwarded "project scope" '<--scope>
<project>
<--non-interactive>' --scope project --non-interactive
assert_forwarded "project scope equals" '<--scope=project>' --scope=project
assert_forwarded "explicit directory equals with spaces" "<--opencode-dir=$TMPROOT/other root>" --opencode-dir="$TMPROOT/other root"
assert_forwarded "provider change" '<--opencode-tier>
<anthropic>' --opencode-tier anthropic
assert_forwarded "provider change equals" '<--opencode-tier=anthropic>' --opencode-tier=anthropic
assert_forwarded "clear provider" '<--opencode-tier>
<>' --opencode-tier ''
assert_forwarded "clear provider equals" '<--opencode-tier=>' --opencode-tier=
assert_forwarded "unknown argument reaches native validation" '<--unknown-option>' --unknown-option

TEST_OPENCODE_CONFIG_DIR="$TMPROOT/environment root" \
    assert_forwarded "environment directory override" '<--non-interactive>' --non-interactive

for harmless in --yes --force; do
    OUTPUT=$(run_update "$harmless" 2>&1)
    STATUS=$?
    case "$OUTPUT" in
        *"already current"*) CURRENT=1 ;;
        *) CURRENT=0 ;;
    esac
    assert_true "$harmless alone: pre-check reports already current" "$CURRENT"
    assert_true "$harmless alone: exits without downloading" "$([ "$STATUS" -eq 0 ] && [ ! -f "$MARKER" ] && echo 1 || echo 0)"
done

for invalid_config in \
    'null' \
    '[{"installed_version":"9.9.9"}]' \
    '{"installed_version":"9.9.9",broken}' \
    '{"installed_version":"9.9.9","invalid":NaN}' \
    '{"installed_version":"9.9.9","invalid":Infinity}' \
    '{"installed_version":999}'; do
    printf '%s\n' "$invalid_config" > "$CONFIG_DIR/opencode/.team-harness.json"
    assert_forwarded "invalid pre-check configuration $invalid_config" '<--non-interactive>' --non-interactive
done
printf '{"installed_version":"%s"}\n' "$FAKE_VERSION" > "$CONFIG_DIR/opencode/.team-harness.json"

# An optional JSON reader must not become an updater dependency. Supply only
# bootstrap utilities and the download fixture, deliberately excluding Python.
NO_PARSER_BIN="$TMPROOT/no-parser-bin"
mkdir -p "$NO_PARSER_BIN"
for utility in awk chmod cp mktemp rm sh sha256sum shasum touch tr; do
    if command -v "$utility" >/dev/null 2>&1; then
        ln -s "$(command -v "$utility")" "$NO_PARSER_BIN/$utility"
    fi
done
cp "$MOCKBIN/curl" "$MOCKBIN/uname" "$NO_PARSER_BIN/"
TEST_UPDATE_PATH="$NO_PARSER_BIN" \
    assert_forwarded "missing optional JSON reader" '<--non-interactive>' --non-interactive

echo
echo "Results: $PASS passed, $FAIL failed"
if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
exit 0
