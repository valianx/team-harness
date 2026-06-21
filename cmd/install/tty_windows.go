//go:build windows

package main

import (
	"errors"
	"os"
)

// openTTYDevice is a no-op stub on Windows. Windows has no /dev/tty equivalent
// accessible via a portable open call; interactive input arrives on os.Stdin
// (the TTY check in isTerminal covers the normal interactive case).
func openTTYDevice() (*os.File, error) {
	return nil, errors.New("/dev/tty not available on Windows")
}

// openTTYForWrite is a no-op stub on Windows. On Windows the disclosure path
// falls back to instructing the operator to retrieve values from ~/.claude.json,
// rather than writing secret values to any redirectable stream (AC-13).
func openTTYForWrite() (*os.File, error) {
	return nil, errors.New("/dev/tty not available on Windows")
}
