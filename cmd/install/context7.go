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
		if envKey == "" || envKey == existingKey {
			fmt.Println("  context7 API key: preserving existing key in ~/.claude.json")
			return existingKey
		}

		// Env var present and different from the stored key.
		if isTerminal() {
			fmt.Printf("  context7 API key: existing (%s...) differs from env (%s...).\n",
				safePrefix(existingKey, 12), safePrefix(envKey, 12))
			choice := promptMenu("  Use [E]xisting / [N]ew env key / [A]bort? [E]: ",
				map[string]bool{"e": true, "n": true, "a": true}, "e")
			switch choice {
			case "e":
				return existingKey
			case "n":
				fmt.Println("  context7 API key: using env var (user chose N)")
				return envKey
			default: // "a"
				fmt.Fprintln(os.Stderr, "Aborted.")
				os.Exit(1)
			}
		}

		// Non-interactive: env var wins when explicitly set.
		fmt.Println("  context7 API key: existing key differs from env; using env (non-interactive).")
		return envKey
	}

	// No usable existing key — fall through to env var or interactive prompt.
	if envKey != "" {
		fmt.Println("  context7 API key: loaded from CONTEXT7_API_KEY env var")
		return envKey
	}

	if !isTerminal() {
		fmt.Fprintln(os.Stderr, "Error: CONTEXT7_API_KEY not set and stdin is not interactive.")
		fmt.Fprintln(os.Stderr, "  Export CONTEXT7_API_KEY and re-run.")
		os.Exit(1)
	}

	fmt.Println("  context7 API key required (get one at https://context7.com/).")
	fmt.Print("  Paste your CONTEXT7_API_KEY: ")
	key := strings.TrimSpace(readLine())
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

// readLine reads a line from stdin, trimming the trailing newline.
func readLine() string {
	scanner := bufio.NewScanner(os.Stdin)
	if scanner.Scan() {
		return scanner.Text()
	}
	return ""
}
