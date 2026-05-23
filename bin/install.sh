#!/bin/sh
# team-harness installer bootstrap (Unix / macOS)
# Curl-pipeable: curl -fsSL https://valianx.github.io/team-harness/install.sh | bash
# Or run from a clone: ./bin/install.sh
set -eu

REPO="valianx/team-harness"
BASE_URL="https://github.com/${REPO}/releases/latest/download"

# Detect OS.
OS=$(uname -s 2>/dev/null | tr '[:upper:]' '[:lower:]' || echo unknown)
case "$OS" in
    linux|darwin) ;;
    *)
        echo "Error: unsupported OS '$OS'." >&2
        echo "  team-harness supports linux and darwin via install.sh." >&2
        echo "  For Windows, see: https://valianx.github.io/team-harness/install.ps1" >&2
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
URL="${BASE_URL}/${ASSET}"

# Download to a tmp dir we clean up on exit.
TMP=$(mktemp -d 2>/dev/null) || {
    echo "Error: could not create temporary directory." >&2
    exit 1
}
trap 'rm -rf "$TMP"' EXIT

echo "Downloading ${ASSET} from latest release..."
if ! curl -fsSL --max-time 120 -o "$TMP/install" "$URL"; then
    echo "Error: download failed from ${URL}" >&2
    echo "  This usually means: (a) no release has been tagged yet, (b) GitHub is" >&2
    echo "  unreachable from this network, or (c) your firewall blocks github.com." >&2
    echo "  Releases: https://github.com/${REPO}/releases" >&2
    exit 1
fi

chmod +x "$TMP/install"

echo "Launching installer..."
# When invoked via `curl | bash`, bash reads install.sh line-by-line from the
# curl pipe (stdin). When bash spawns the installer binary below, the binary
# inherits that same stdin pipe, which still contains the subsequent `exit $?`
# line that bash has not yet consumed. If we allow the binary to inherit that
# stdin, its first menu prompt reads those leftover bytes and the paste-
# detection logic fires — even though the operator pasted nothing.
# Redirect stdin from /dev/tty so the binary reads from the operator's
# terminal directly. Fall back to inherited stdin in non-TTY environments
# (CI, containers) where /dev/tty does not exist.
if [ -e /dev/tty ]; then
    "$TMP/install" "$@" < /dev/tty
else
    "$TMP/install" "$@"
fi
exit $?
