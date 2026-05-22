package main

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
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
func promptMenuWith(prompt string, valid map[string]bool, defaultVal string, scan *bufio.Scanner) string {
	fmt.Print(prompt)
	raw := strings.TrimSpace(readLineFrom(scan))
	if raw == "" {
		return defaultVal
	}
	lower := strings.ToLower(raw[:1])
	if !valid[lower] {
		return defaultVal
	}
	return lower
}
