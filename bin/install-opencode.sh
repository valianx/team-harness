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
# Run the verified binary.
#
# Interactive setup: when a terminal (/dev/tty) is present, the binary
# presents the trimmed .team-harness.json setup surface as a sequence of
# skippable, explanatory prompts. Only two settings are configurable:
#   - Memory MCP URL (paste or JSON snippet; bearer token stays in your shell)
#   - context7 (enable/skip; API key stays in your shell)
# All other settings use silent defaults (work-logs → local; no language,
# no english-learning, no ClickUp, no Obsidian tasks).
#
# Non-interactive (headless/CI): when /dev/tty is absent, the binary
# installs all assets and resolves configuration from env vars + defaults only
# — no prompt, no hang. Use --non-interactive (alias: --yes) to force this
# path even when a terminal is present (e.g. automated deployments).
#
# MEMORY_MCP_URL and CONTEXT7_API_KEY are OPTIONAL. When MEMORY_MCP_URL is
# set, it is passed via --memory-url argv (not env, to avoid shell history).
# To configure MCP servers later, re-run with the env vars set:
#   MEMORY_MCP_URL=https://your-mcp.example.com/mcp \
#     CONTEXT7_API_KEY=your-key \
#     curl -fsSL https://valianx.github.io/team-harness/install-opencode.sh | bash
#
# Redirect stdin from /dev/tty when present — same rationale as install.sh:
# when invoked via 'curl | bash', bash holds the pipe as stdin; the binary
# must read from the operator's terminal, not the remaining pipe bytes. The
# binary also wires /dev/tty explicitly into the huh form as the bubbletea
# input source so that pasting a bare Memory MCP URL is reliably delivered
# as a single paste event (not dropped or split under curl | bash).
# Forward "$@" so the operator can pass --scope, --opencode-dir, or
# --non-interactive / --yes to the binary.
# ---------------------------------------------------------------------------
chmod +x "$TMP/install"

echo "Launching installer..."
if [ -n "${MEMORY_MCP_URL:-}" ]; then
    # URL provided — pass it via argv (not via env that shell records in history).
    if (exec < /dev/tty) 2>/dev/null; then
        "$TMP/install" apply --runtime opencode --scope global --memory-url "$MEMORY_MCP_URL" "$@" </dev/tty
    else
        "$TMP/install" apply --runtime opencode --scope global --memory-url "$MEMORY_MCP_URL" "$@"
    fi
else
    # No URL — install assets only; MCP registration is skipped inside the binary.
    if (exec < /dev/tty) 2>/dev/null; then
        "$TMP/install" apply --runtime opencode --scope global "$@" </dev/tty
    else
        "$TMP/install" apply --runtime opencode --scope global "$@"
    fi
fi
INSTALL_EXIT=$?

# The binary (dispatch.go::registerOpencodeMCPIfConfigured) emits any
# MCP-related notes authoritatively. The script does not duplicate them.
exit $INSTALL_EXIT
