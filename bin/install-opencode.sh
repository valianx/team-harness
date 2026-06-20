#!/bin/sh
# team-harness opencode installer bootstrap (Unix / macOS)
# curl -fsSL https://valianx.github.io/team-harness/install-opencode.sh | bash
# Or run from a clone: ./bin/install-opencode.sh
# NOT deprecated — this is the live opencode install path.
#
# The downloaded binary is verified against the published SHA256SUMS before
# it runs. See README.md for the env-var contract.
set -eu

REPO="valianx/team-harness"
BASE_URL="https://github.com/${REPO}/releases/latest/download"

# Detect OS.
OS=$(uname -s 2>/dev/null | tr '[:upper:]' '[:lower:]' || echo unknown)
case "$OS" in
    linux|darwin) ;;
    *)
        echo "Error: unsupported OS '$OS'." >&2
        echo "  team-harness supports linux and darwin via install-opencode.sh." >&2
        echo "  For Windows, a PowerShell variant is planned as a follow-up." >&2
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

# Download to a private tmp dir (mode 0700) cleaned up on exit.
TMP=$(mktemp -d 2>/dev/null) || {
    echo "Error: could not create temporary directory." >&2
    exit 1
}
chmod 700 "$TMP"
trap 'rm -rf "$TMP"' EXIT

# ---------------------------------------------------------------------------
# SHA256 verification (AC-4): fail-closed and TOCTOU-safe.
# (d) Pick a checksum tool; abort fail-closed if neither is available.
# ---------------------------------------------------------------------------
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
    echo "  This usually means: (a) no release has been tagged yet, (b) GitHub is" >&2
    echo "  unreachable from this network, or (c) your firewall blocks github.com." >&2
    echo "  Releases: https://github.com/${REPO}/releases" >&2
    exit 1
fi

# (b) Extract expected hash by ANCHORED asset-name match.
# SHA256SUMS lines have the format: <hash>  <bare-filename>
# awk '$2==a' anchors the exact bare name — no substring match.
# (c) Abort as a distinct branch when the entry is absent (never skip-verify).
EXPECTED=$(awk -v a="$ASSET" '$2==a {print $1}' "$TMP/SHA256SUMS")
if [ -z "$EXPECTED" ]; then
    echo "Error: no SHA256SUMS entry for '${ASSET}'; refusing to run unverified binary." >&2
    echo "  The release may not include this platform. See: https://github.com/${REPO}/releases" >&2
    exit 1
fi

# (e) Compute actual hash of the SAME downloaded file and compare.
# Use extract-and-compare, NOT 'sha256sum -c SHA256SUMS' (that would fail on
# the four other asset entries in the file).
# (a) No re-fetch occurs between this point and chmod/exec — verified file IS executed.
ACTUAL=$($HASH_CMD "$TMP/install" | awk '{print $1}')
if [ "$ACTUAL" != "$EXPECTED" ]; then
    echo "Error: checksum verification failed for ${ASSET}." >&2
    echo "  Expected: ${EXPECTED}" >&2
    echo "  Got:      ${ACTUAL}" >&2
    echo "  The downloaded file may be corrupt or tampered. Re-run to retry." >&2
    exit 1
fi

echo "Checksum verified."

# ---------------------------------------------------------------------------
# Memory URL resolution (AC-2, AC-3, AC-5).
# Read MEMORY_MCP_URL from env; fall back to /dev/tty prompt; error if neither.
# Never echo or log the URL value (AC-5, SEC-DR-4).
# ---------------------------------------------------------------------------
if [ -z "${MEMORY_MCP_URL:-}" ]; then
    if [ -e /dev/tty ]; then
        printf 'Memory MCP URL (e.g. https://your-mcp.example.com/mcp): ' >/dev/tty
        IFS= read -r MEMORY_MCP_URL </dev/tty
        if [ -z "${MEMORY_MCP_URL:-}" ]; then
            echo "Error: Memory MCP URL is required. Set MEMORY_MCP_URL or enter it at the prompt." >&2
            exit 1
        fi
    else
        echo "Error: Memory MCP URL is required." >&2
        echo "  Detected: no controlling terminal available and MEMORY_MCP_URL is not set." >&2
        echo "  Options:" >&2
        echo "    1. Set the env var before running:" >&2
        echo "         MEMORY_MCP_URL=https://your-mcp.example.com/mcp \\" >&2
        echo "           curl -fsSL https://valianx.github.io/team-harness/install-opencode.sh | bash" >&2
        echo "    2. Run interactively in a real terminal (TTY available)." >&2
        echo "  There is no default URL." >&2
        exit 1
    fi
fi

# ---------------------------------------------------------------------------
# Run the verified binary.
# Pass --memory-url on the argv so the URL is NOT passed via the environment
# that the shell would record in history.
# Redirect stdin from /dev/tty when present — same rationale as install.sh:
# when invoked via 'curl | bash', bash holds the pipe as stdin; the binary
# must read from the operator's terminal, not the remaining pipe bytes.
# Forward "$@" so the operator can override --scope or --opencode-dir.
# ---------------------------------------------------------------------------
chmod +x "$TMP/install"

echo "Launching installer..."
if [ -e /dev/tty ]; then
    "$TMP/install" apply --runtime opencode --scope global --memory-url "$MEMORY_MCP_URL" "$@" </dev/tty
else
    "$TMP/install" apply --runtime opencode --scope global --memory-url "$MEMORY_MCP_URL" "$@"
fi
INSTALL_EXIT=$?

# AC-10: the binary (dispatch.go::registerOpencodeRequiredMCP) emits the
# MEMORY_MCP_BEARER warning authoritatively because it knows whether the MCP
# registration happened. The script must NOT duplicate that warning — the
# operator would see it twice per install. Exit with the binary's exit code.

exit $INSTALL_EXIT
