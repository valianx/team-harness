#!/bin/sh
# team-harness installer bootstrap (Unix / macOS)
# Downloads the right prebuilt Go binary from the latest GitHub Release and execs it.
set -e

REPO="valianx/team-harness"

# Find latest release tag.
LATEST=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name"' | cut -d'"' -f4)
if [ -z "$LATEST" ]; then
    echo "Error: could not resolve latest release. Has a release been tagged yet?"
    echo "See: https://github.com/$REPO/releases"
    exit 1
fi

# Detect OS + arch.
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)
case "$ARCH" in
    x86_64|amd64) ARCH="amd64" ;;
    aarch64|arm64) ARCH="arm64" ;;
    *) echo "Error: unsupported arch '$ARCH'"; exit 1 ;;
esac
case "$OS" in
    linux|darwin) ;;
    *) echo "Error: unsupported OS '$OS'. For Windows, use install.ps1."; exit 1 ;;
esac

ASSET="install-${OS}-${ARCH}"
URL="https://github.com/$REPO/releases/download/$LATEST/$ASSET"

TMP=$(mktemp -d)
trap "rm -rf $TMP" EXIT

echo "Downloading $ASSET from $LATEST..."
curl -fsSL -o "$TMP/install" "$URL"
chmod +x "$TMP/install"

echo "Running install (you may be prompted for backend choice + API key)..."
exec "$TMP/install" "$@"
