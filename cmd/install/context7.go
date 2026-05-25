package main

import (
	"fmt"
	"os"
	"strings"
)

// getContext7APIKey returns the context7 API key for non-interactive installs.
// It is only called from collectConfigNonInteractive.
//
// Priority (when --force is NOT set):
//  1. Existing valid key in ~/.claude.json → preserve.
//  2. CONTEXT7_API_KEY env var.
//  3. No env var and no TTY → ERROR + exit 1.
//
// The interactive (TUI) path is handled by runTUIForm in tui.go.
func getContext7APIKey() string {
	existing := readExistingMCPServers()
	existingEntry := mapGet(existing, "context7")
	existingKey := strings.TrimSpace(mapGetString(existingEntry, "headers", "CONTEXT7_API_KEY"))
	envKey := strings.TrimSpace(os.Getenv("CONTEXT7_API_KEY"))

	if !forceFlag && isValidContext7Key(existingKey) {
		// Non-interactive: preserve, unless env var explicitly overrides.
		if envKey != "" && envKey != existingKey {
			fmt.Println("  context7 API key: existing key differs from env; using env (non-interactive).")
			return envKey
		}
		fmt.Println("  context7 API key: preserving existing key in ~/.claude.json (non-interactive)")
		return existingKey
	}

	if envKey != "" {
		fmt.Println("  context7 API key: loaded from CONTEXT7_API_KEY env var")
		return envKey
	}

	fmt.Fprintln(os.Stderr, `CONTEXT7_API_KEY is required.
  Detected: this install is non-interactive (no controlling terminal available).
  Options:
    1. Run with the key inline:
         CONTEXT7_API_KEY=your-key-here \
           curl -fsSL https://valianx.github.io/team-harness/install.sh | bash -s -- --force
    2. Run interactively in a real terminal (TTY available).
  Get a key at https://context7.com/`)
	os.Exit(1)
	return "" // unreachable
}

// safePrefix returns the first n characters of s, or all of s if shorter.
func safePrefix(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}
