package main

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"sort"
	"strings"
)

// requireCLI exits with a helpful message if the named CLI is not in PATH.
func requireCLI(cmd, hint string) {
	if _, err := exec.LookPath(cmd); err != nil {
		fmt.Fprintf(os.Stderr, "Error: required CLI '%s' not found in PATH.\n", cmd)
		fmt.Fprintf(os.Stderr, "  %s\n", hint)
		os.Exit(1)
	}
}

// readLineFrom reads a single line from scan, trimming the trailing newline.
func readLineFrom(scan *bufio.Scanner) string {
	if scan.Scan() {
		return scan.Text()
	}
	return ""
}

// promptMenuWith prints prompt and reads a single-character menu choice from
// scan. valid is the set of accepted lower-case characters; defaultVal is
// returned when the user presses Enter without typing.
//
// Invalid single-character input triggers a re-prompt (up to maxAttempts=3).
// Multi-character or structured input (starting with '{', '[', '"') exits
// immediately: the scanner buffer is now polluted with remaining lines, and
// there is no safe way to flush a bufio.Scanner mid-stream. The operator must
// re-run the installer and answer prompts one at a time.
func promptMenuWith(prompt string, valid map[string]bool, defaultVal string, scan *bufio.Scanner) string {
	const maxAttempts = 3
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		fmt.Print(prompt)
		raw := strings.TrimSpace(readLineFrom(scan))

		if raw == "" {
			return defaultVal
		}

		if isPasteInput(raw) {
			fmt.Fprintln(os.Stderr, "")
			fmt.Fprintln(os.Stderr, "Error: pasted multi-character or structured content at a single-letter prompt.")
			fmt.Fprintf(os.Stderr, "  This prompt accepts only: %s\n", validKeysSorted(valid))
			fmt.Fprintln(os.Stderr, "  The URL/snippet prompt comes later in the flow.")
			fmt.Fprintln(os.Stderr, "  Re-run the installer and answer the prompts one at a time.")
			os.Exit(1)
		}

		lower := strings.ToLower(raw[:1])
		if valid[lower] {
			return lower
		}

		fmt.Fprintf(os.Stderr, "  Invalid input %q. Expected one of: %s\n", raw, validKeysSorted(valid))
		if attempt < maxAttempts {
			fmt.Fprintln(os.Stderr, "  Try again.")
		}
	}
	fmt.Fprintf(os.Stderr, "Error: too many invalid attempts. Aborting.\n")
	os.Exit(1)
	return "" // unreachable
}

// isPasteInput returns true when the input looks like pasted multi-character
// or structured content rather than a deliberate single-key press. This guards
// against the scanner-buffer-leak failure mode: when an operator pastes a JSON
// snippet or URL at a y/n prompt, the scanner absorbs the first line but leaves
// the remaining lines in the underlying buffer, corrupting subsequent prompts.
func isPasteInput(s string) bool {
	if len(s) > 1 {
		return true
	}
	return strings.HasPrefix(s, "{") || strings.HasPrefix(s, "[") || strings.HasPrefix(s, "\"")
}

// validKeysSorted returns the valid keys as a deterministically sorted,
// slash-separated string (e.g. "c/y"). Deterministic order is required for
// testability and consistent operator-facing error messages.
func validKeysSorted(valid map[string]bool) string {
	keys := make([]string, 0, len(valid))
	for k := range valid {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return strings.Join(keys, "/")
}
