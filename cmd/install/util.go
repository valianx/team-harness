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

// warnCLI prints a non-fatal note when a recommended CLI is missing.
// Unlike requireCLI it does NOT exit — the installer continues and the
// agent/skill fallback paths handle the missing tool at runtime.
func warnCLI(cmd, hint string) {
	if _, err := exec.LookPath(cmd); err != nil {
		fmt.Printf("  [note] '%s' not found — recommended but not required.\n", cmd)
		fmt.Printf("         Skills /issue, /deliver, /review-pr will fall back to manual paths.\n")
		fmt.Printf("         %s\n", hint)
		return
	}
	fmt.Printf("  %s: ok\n", cmd)
}

// readLineFrom reads a single line from scan, trimming the trailing newline.
func readLineFrom(scan *bufio.Scanner) string {
	if scan.Scan() {
		return scan.Text()
	}
	return ""
}

// promptMenu prints the prompt and reads a single-character menu choice from
// an interactive input source. valid is the set of accepted lower-case
// characters; defaultVal is returned when the user presses Enter without
// typing, or when no interactive source is available (CI/non-interactive).
//
// This function is retained for the test suite (tty_test.go). The interactive
// install path now uses the huh TUI form; this function is only called from
// the non-interactive fallback in session_docs.go and is covered by regression
// tests that verify the /dev/tty-over-stdin behaviour.
func promptMenu(prompt string, valid map[string]bool, defaultVal string) string {
	input := openInteractiveInput()
	if input == nil {
		return defaultVal
	}
	defer input.Close()
	scan := newScanner(input)

	const maxAttempts = 3
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		fmt.Print(prompt)
		var raw string
		if scan.Scan() {
			raw = strings.TrimSpace(scan.Text())
		}

		if raw == "" {
			return defaultVal
		}

		if isPasteInput(raw) {
			fmt.Fprintf(os.Stderr, "  Pasted content ignored. This prompt accepts only: %s\n", validKeysSorted(valid))
			if attempt < maxAttempts {
				fmt.Fprintln(os.Stderr, "  Try again.")
			}
			continue
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

// promptMenuWith prints prompt and reads a single-character menu choice.
// valid is the set of accepted lower-case characters; defaultVal is returned
// when the user presses Enter without typing.
//
// scan is the caller-supplied scanner. When stdin is NOT a TTY (curl | bash
// case), the function opens /dev/tty directly instead of reading from scan to
// avoid consuming bash's remaining stdin bytes as operator input.
//
// This function is retained for the test suite (tty_test.go). The interactive
// install path now uses the huh TUI form.
func promptMenuWith(prompt string, valid map[string]bool, defaultVal string, scan *bufio.Scanner) string {
	if !isTerminal() {
		input := openInteractiveInput()
		if input == nil {
			return defaultVal
		}
		defer input.Close()
		scan = newScanner(input)
	}

	const maxAttempts = 3
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		fmt.Print(prompt)
		raw := strings.TrimSpace(readLineFrom(scan))

		if raw == "" {
			return defaultVal
		}

		if isPasteInput(raw) {
			fmt.Fprintf(os.Stderr, "  Pasted content ignored. This prompt accepts only: %s\n", validKeysSorted(valid))
			if attempt < maxAttempts {
				fmt.Fprintln(os.Stderr, "  Try again.")
			}
			continue
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
// or structured content rather than a deliberate single-key press.
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
