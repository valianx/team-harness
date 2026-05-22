package main

import (
	"bufio"
	"fmt"
	"os"
	"strings"
)

// getContext7APIKey returns the context7 API key to use, or "" if it should be
// left unchanged.
//
// Priority (when --force is NOT set):
//  1. Existing valid key in ~/.claude.json with no conflicting env var → preserve.
//  2. Env var present and matching existing key → preserve.
//  3. Env var differs from existing valid key → ask interactively; non-interactive prefers env.
//  4. No existing valid key → fall through to env var or interactive prompt.
//
// With --force: existing key is ignored; env var or interactive prompt decides.
func getContext7APIKey() string {
	existing := readExistingMCPServers()
	existingEntry := mapGet(existing, "context7")
	existingKey := strings.TrimSpace(mapGetString(existingEntry, "headers", "CONTEXT7_API_KEY"))
	envKey := strings.TrimSpace(os.Getenv("CONTEXT7_API_KEY"))

	if !forceFlag && isValidContext7Key(existingKey) {
		// Non-interactive (CI / scripted re-installs): preserve silently
		// unless env explicitly overrides with a different value.
		if !isTerminal() {
			if envKey != "" && envKey != existingKey {
				fmt.Println("  context7 API key: existing key differs from env; using env (non-interactive).")
				return envKey
			}
			fmt.Println("  context7 API key: preserving existing key in ~/.claude.json (non-interactive)")
			return existingKey
		}

		// Interactive: always surface the existing key + offer to change.
		// Covers the case where the user typed a wrong key on the first run
		// and wants to update it on the next re-run.
		fmt.Println()
		fmt.Printf("  Existing context7 API key in ~/.claude.json: %s...\n", safePrefix(existingKey, 12))

		if envKey != "" && envKey != existingKey {
			// Env var present and different — three-way prompt.
			fmt.Printf("  CONTEXT7_API_KEY env var differs: %s...\n", safePrefix(envKey, 12))
			choice := promptMenu("  Use [E]xisting / [N]ew env key / [C]ustom (paste) / [A]bort? [E]: ",
				map[string]bool{"e": true, "n": true, "c": true, "a": true}, "e")
			switch choice {
			case "e":
				return existingKey
			case "n":
				fmt.Println("  context7 API key: using env var")
				return envKey
			case "c":
				// Fall through to the manual paste prompt below.
			default: // "a"
				fmt.Fprintln(os.Stderr, "Aborted.")
				os.Exit(1)
			}
		} else {
			// No conflicting env — simple Keep/Change.
			choice := promptMenu("  Keep [Y] / Change [c]? [Y]: ",
				map[string]bool{"y": true, "c": true}, "y")
			if choice == "y" {
				return existingKey
			}
			// Fall through to the manual paste prompt below.
		}

		// Reached only via [C]ustom in either of the two prompts above.
		fmt.Println("  Paste the replacement context7 API key (get one at https://context7.com/).")
		fmt.Print("  CONTEXT7_API_KEY: ")
		key := strings.TrimSpace(readLine())
		if key == "" {
			fmt.Fprintln(os.Stderr, "Error: empty API key.")
			os.Exit(1)
		}
		return key
	}

	// No usable existing key — fall through to env var or interactive prompt.
	if envKey != "" {
		fmt.Println("  context7 API key: loaded from CONTEXT7_API_KEY env var")
		return envKey
	}

	// CONTEXT7_API_KEY not set — try to prompt interactively.
	input := openInteractiveInput()
	if input == nil {
		fmt.Fprintln(os.Stderr, `CONTEXT7_API_KEY is required.
  Detected: this install is non-interactive (no controlling terminal available).
  Options:
    1. Run with the key inline:
         CONTEXT7_API_KEY=your-key-here \
           curl -fsSL https://valianx.github.io/team-harness/install.sh | bash -s -- --force
    2. Run interactively in a real terminal (TTY available).
  Get a key at https://context7.com/`)
		os.Exit(1)
	}
	defer input.Close()

	scan := bufio.NewScanner(input)
	fmt.Println("  context7 API key required (get one at https://context7.com/).")
	fmt.Print("  Paste your CONTEXT7_API_KEY: ")
	key := strings.TrimSpace(readLineFrom(scan))
	if key == "" {
		fmt.Fprintln(os.Stderr, "Error: empty API key.")
		os.Exit(1)
	}
	return key
}

// safePrefix returns the first n characters of s, or all of s if shorter.
func safePrefix(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}

// promptMenu prints the prompt and reads a single-character menu choice from
// the shared stdin scanner (stdinScanner). valid is the set of accepted
// lower-case characters; defaultVal is returned when the user presses Enter
// without typing.
//
// Invalid single-character input triggers a re-prompt (up to maxAttempts=3).
// Multi-character or structured input (starting with '{', '[', '"') exits
// immediately: the shared scanner buffer is now polluted with remaining lines,
// and there is no safe way to flush a bufio.Scanner mid-stream. The operator
// must re-run the installer and answer prompts one at a time.
func promptMenu(prompt string, valid map[string]bool, defaultVal string) string {
	const maxAttempts = 3
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		fmt.Print(prompt)
		raw := strings.TrimSpace(readLine())

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

// Note: validKeysSorted and isPasteInput are defined in util.go.

// stdinScanner is the shared package-level scanner used by readLine. A single
// scanner is required because pasted multi-line input (e.g., a JSON snippet)
// arrives in stdin's buffer all at once; allocating a new scanner per call
// would internally buffer trailing bytes and then discard them along with the
// scanner, losing lines after the first.
var stdinScanner = bufio.NewScanner(os.Stdin)

// readLine reads a line from stdin (trimming the trailing newline) using the
// shared package-level scanner.
func readLine() string {
	if stdinScanner.Scan() {
		return stdinScanner.Text()
	}
	return ""
}
