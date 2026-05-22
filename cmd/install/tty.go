package main

import (
	"bufio"
	"io"
	"os"
)

// openInteractiveInput returns an io.ReadCloser suitable for interactive
// prompts, or nil when no interactive input source is available.
//
// Priority:
//  1. os.Stdin is a TTY → return os.Stdin (wrapped as a no-op-closer).
//  2. /dev/tty opens successfully (Unix only) → return that file handle.
//     This is the curl | bash case: stdin is the pipe, but the user's keyboard
//     is still reachable via /dev/tty. rustup, oh-my-zsh, and nvm use the
//     same pattern.
//  3. Neither available → return nil (truly non-interactive; require env vars).
//
// Callers must check env vars BEFORE calling this function. The helper is
// intentionally unaware of env vars — it only determines whether a human is
// reachable, not whether a prompt is needed.
func openInteractiveInput() io.ReadCloser {
	if isTerminal() {
		return io.NopCloser(os.Stdin)
	}
	f, err := openTTYDevice()
	if err != nil {
		return nil
	}
	return f
}

// isTerminal returns true when os.Stdin is an interactive terminal (TTY).
func isTerminal() bool {
	stat, err := os.Stdin.Stat()
	if err != nil {
		return false
	}
	return (stat.Mode() & os.ModeCharDevice) != 0
}

// newScanner constructs a bufio.Scanner from r with a buffer large enough
// for typical interactive input lines (up to 64 KiB — handles very long
// bearer tokens and URL values without truncation).
func newScanner(r io.Reader) *bufio.Scanner {
	s := bufio.NewScanner(r)
	s.Buffer(make([]byte, 65536), 65536)
	return s
}
