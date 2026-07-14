#!/bin/sh
# team-harness opencode updater bootstrap (Unix / macOS)
# curl -fsSL https://valianx.github.io/team-harness/update-opencode.sh | bash
# Or run from a clone: ./bin/update-opencode.sh
#
# Flow:
#   1. Cheap VERSION pre-check — avoids an 8 MB binary download when already
#      current (short-circuits with no download).
#   2. Download SHA256SUMS + platform binary; verify fail-closed (anchored
#      exact-asset-name match, case-insensitive hash compare).
#   3. Run: binary update --runtime opencode --scope global "$@"
#      The Go side re-confirms the three-state delta authoritatively.
#
# AC-9: when the cheap pre-check determines the install is already current,
# the script prints "already current" and exits 0 without downloading.
# AC-10: SHA256 verification mirrors install-opencode.sh byte-for-byte.
set -eu

REPO="valianx/team-harness"
BASE_URL="https://github.com/${REPO}/releases/latest/download"

# Detect OS.
OS=$(uname -s 2>/dev/null | tr '[:upper:]' '[:lower:]' || echo unknown)
case "$OS" in
    linux|darwin) ;;
    *)
        echo "Error: unsupported OS '$OS'." >&2
        echo "  team-harness supports linux and darwin via update-opencode.sh." >&2
        exit 1
        ;;
esac

# Detect arch.
ARCH=$(uname -m 2>/dev/null || echo unknown)
case "$ARCH" in
    x86_64|amd64)  ARCH="amd64" ;;
    aarch64|arm64) ARCH="arm64" ;;
    *)
        echo "Error: unsupported arch '$ARCH'." >&2
        echo "  team-harness supports amd64 and arm64." >&2
        echo "  See: https://github.com/${REPO}/releases" >&2
        exit 1
        ;;
esac

ASSET="install-${OS}-${ARCH}"
SUMS_URL="${BASE_URL}/SHA256SUMS"
BIN_URL="${BASE_URL}/${ASSET}"

# ---------------------------------------------------------------------------
# Cheap VERSION pre-check (AC-9).
#
# Resolve the opencode config root — mirrors opencodeGlobalConfigDir in Go:
#   $XDG_CONFIG_HOME/opencode (or ~/.config/opencode when XDG is unset).
#
# Best-effort read of installed_version from .team-harness.json.
# On any read uncertainty, fall through to download + the authoritative Go-side
# comparison (which parses JSON robustly and is idempotent).
#
# Skipped ONLY when --opencode-dir is among the passthrough args — that flag
# (in either "--opencode-dir <path>" or "--opencode-dir=<path>" form) points
# the Go binary at a non-default config root, and the shell-side check only
# reads the default global path, so it would incorrectly short-circuit before
# the binary resolves the correct root. --non-interactive does not affect
# config-root resolution, so its presence alone must not skip the pre-check.
# ---------------------------------------------------------------------------
HAS_OPENCODE_DIR_FLAG=0
for _arg in "$@"; do
    case "$_arg" in
        --opencode-dir|--opencode-dir=*)
            HAS_OPENCODE_DIR_FLAG=1
            ;;
    esac
done

if [ "$HAS_OPENCODE_DIR_FLAG" -eq 0 ]; then
if [ -n "${XDG_CONFIG_HOME:-}" ]; then
    OC_CONFIG_DIR="${XDG_CONFIG_HOME}/opencode"
else
    OC_CONFIG_DIR="${HOME}/.config/opencode"
fi
TH_JSON="${OC_CONFIG_DIR}/.team-harness.json"

INSTALLED_VERSION=""
if [ -f "$TH_JSON" ]; then
    # Extract "installed_version" from the JSON file using grep + sed.
    # The key is always written on one line by the Go installer (json.MarshalIndent).
    INSTALLED_VERSION=$(grep '"installed_version"' "$TH_JSON" 2>/dev/null \
        | sed 's/.*"installed_version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' \
        | head -1 || true)
fi

LATEST_VERSION=""
if curl -fsSL --max-time 10 -o /dev/null --write-out "%{http_code}" \
        "${BASE_URL}/VERSION" >/dev/null 2>&1; then
    LATEST_VERSION=$(curl -fsSL --max-time 10 "${BASE_URL}/VERSION" 2>/dev/null || true)
    LATEST_VERSION=$(echo "$LATEST_VERSION" | tr -d '[:space:]')
fi

if [ -n "$INSTALLED_VERSION" ] && [ -n "$LATEST_VERSION" ]; then
    if [ "$INSTALLED_VERSION" = "$LATEST_VERSION" ]; then
        echo "th update — already current"
        echo "  installed version   ${INSTALLED_VERSION}"
        echo "  latest version      ${LATEST_VERSION}"
        echo "No action required."
        exit 0
    fi

    # Shell-based semver compare: if installed > latest, report installed-ahead.
    # This is best-effort (shell arithmetic); the Go side is authoritative.
    # Only acts when both look like "N.N.N" numeric semver.
    _semver_gt() {
        # Returns 0 (true) when $1 > $2 using shell string split + arithmetic.
        IFS=. read -r _a1 _a2 _a3 <<EOF
$1
EOF
        IFS=. read -r _b1 _b2 _b3 <<EOF
$2
EOF
        _a1=${_a1:-0}; _a2=${_a2:-0}; _a3=${_a3:-0}
        _b1=${_b1:-0}; _b2=${_b2:-0}; _b3=${_b3:-0}
        if [ "$_a1" -gt "$_b1" ]; then return 0; fi
        if [ "$_a1" -lt "$_b1" ]; then return 1; fi
        if [ "$_a2" -gt "$_b2" ]; then return 0; fi
        if [ "$_a2" -lt "$_b2" ]; then return 1; fi
        if [ "$_a3" -gt "$_b3" ]; then return 0; fi
        return 1
    }

    if _semver_gt "$INSTALLED_VERSION" "$LATEST_VERSION" 2>/dev/null; then
        echo "th update — installed ahead"
        echo "  installed version   ${INSTALLED_VERSION}"
        echo "  latest version      ${LATEST_VERSION}"
        echo "The installed version is newer than the latest release."
        echo "To upgrade, wait for the next release or re-install from GitHub Releases."
        exit 0
    fi
fi
fi # end: HAS_OPENCODE_DIR_FLAG -eq 0 pre-check guard

# ---------------------------------------------------------------------------
# Download and verify (mirrors install-opencode.sh byte-for-byte — AC-10).
# ---------------------------------------------------------------------------
TMP=$(mktemp -d 2>/dev/null) || {
    echo "Error: could not create temporary directory." >&2
    exit 1
}
chmod 700 "$TMP"
trap 'rm -rf "$TMP"' EXIT

# SHA256 tool selection — fail-closed if neither is available.
if command -v sha256sum >/dev/null 2>&1; then
    HASH_CMD="sha256sum"
elif command -v shasum >/dev/null 2>&1; then
    HASH_CMD="shasum -a 256"
else
    echo "Error: no sha256sum or shasum available; cannot verify binary." >&2
    echo "  Install coreutils (Linux) or use macOS where shasum ships by default." >&2
    exit 1
fi

echo "Downloading SHA256SUMS..."
if ! curl -fsSL --max-time 30 -o "$TMP/SHA256SUMS" "$SUMS_URL"; then
    echo "Error: download failed from ${SUMS_URL}" >&2
    echo "  Check that a release has been tagged at https://github.com/${REPO}/releases" >&2
    exit 1
fi

echo "Downloading ${ASSET} from latest release..."
if ! curl -fsSL --max-time 120 -o "$TMP/install" "$BIN_URL"; then
    echo "Error: download failed from ${BIN_URL}" >&2
    echo "  Releases: https://github.com/${REPO}/releases" >&2
    exit 1
fi

# Anchored exact-asset-name match — no substring match (mirrors install-opencode.sh).
EXPECTED=$(awk -v a="$ASSET" '$2==a {print $1}' "$TMP/SHA256SUMS")
if [ -z "$EXPECTED" ]; then
    echo "Error: no SHA256SUMS entry for '${ASSET}'; refusing to run unverified binary." >&2
    exit 1
fi

ACTUAL=$($HASH_CMD "$TMP/install" | awk '{print $1}')
if [ "$ACTUAL" != "$EXPECTED" ]; then
    echo "Error: checksum verification failed for ${ASSET}." >&2
    echo "  Expected: ${EXPECTED}" >&2
    echo "  Got:      ${ACTUAL}" >&2
    exit 1
fi

echo "Checksum verified."

chmod +x "$TMP/install"

echo "Running updater..."
# Forward "$@" so the operator can pass --opencode-dir or --non-interactive.
if [ -e /dev/tty ]; then
    "$TMP/install" update --runtime opencode --scope global "$@" </dev/tty
else
    "$TMP/install" update --runtime opencode --scope global "$@"
fi
