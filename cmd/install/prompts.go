package main

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
)

const defaultMemoryMCPURL = "http://localhost:7654/mcp"

// MemoryMCPChoice captures the result of the Memory MCP URL prompt.
type MemoryMCPChoice struct {
	URL         string // always set — either from input, env, or default
	BearerToken string // empty when the MCP requires no auth
	Preserved   bool   // true when the existing entry was kept without change
}

// promptMemoryMCPURL determines the Memory MCP URL and Bearer token from
// existing config, env vars, or an interactive prompt.
//
// Decision priority for URL (when --force is NOT set):
//  1. Existing valid mcpServers.memory in ~/.claude.json → preserve URL+bearer.
//  2. MEMORY_MCP_URL env var (non-interactive / CI / scripted installs).
//  3. Non-interactive without env var → default to defaultMemoryMCPURL, print notice.
//  4. Interactive TTY → prompt the user; Enter → defaultMemoryMCPURL.
//
// Bearer token (only prompted when URL was NOT preserved):
//  1. MEMORY_MCP_BEARER env var (non-interactive / CI / scripted installs).
//  2. Non-interactive without env var → empty (unauthenticated).
//  3. Interactive TTY → optional prompt; empty input means unauthenticated.
//
// With --force: skips step 1 of URL preservation and re-prompts both URL and bearer.
func promptMemoryMCPURL() MemoryMCPChoice {
	existing := readExistingMCPServers()
	existingMemory, _ := existing["memory"].(map[string]interface{})

	if !forceFlag {
		if looksLikeValidMemoryEntry(existingMemory) {
			existingURL := urlFromEntry(existingMemory)
			existingBearer := bearerFromEntry(existingMemory)

			// Non-interactive (CI / scripted re-installs): preserve silently
			// so an automated re-run doesn't break on a Keep/Change prompt.
			if !isTerminal() {
				fmt.Printf("  Memory MCP URL: preserving existing %s (non-interactive)\n", existingURL)
				return MemoryMCPChoice{URL: existingURL, BearerToken: existingBearer, Preserved: true}
			}

			// Interactive: surface the existing value and let the user decide.
			// Common case where the previous install accepted a wrong default
			// and the user wants to override on the next run.
			fmt.Println()
			fmt.Printf("  Existing Memory MCP URL: %s\n", existingURL)
			if existingBearer != "" {
				fmt.Println("  Existing Memory MCP bearer: (preserved)")
			}
			choice := promptMenu("  Keep [Y] / Change [c]? [Y]: ",
				map[string]bool{"y": true, "c": true}, "y")
			if choice == "y" {
				return MemoryMCPChoice{URL: existingURL, BearerToken: existingBearer, Preserved: true}
			}
			fmt.Println("  Changing Memory MCP URL — falling through to env var / prompt.")
		}
		if isLegacyStdioMemoryEntry(existingMemory) {
			fmt.Println("  Legacy stdio mcpServers.memory entry detected (v1 shape pointing at")
			fmt.Println("  the removed knowledge-graph/ Python server). Migrating to http; the")
			fmt.Println("  existing stdio entry will be replaced with an http entry derived from")
			fmt.Println("  the MEMORY_MCP_URL env var or the prompt below.")
		}
	}

	envURL := strings.TrimSpace(os.Getenv("MEMORY_MCP_URL"))

	if envURL != "" {
		if err := validateMCPURL(envURL); err != nil {
			fmt.Fprintf(os.Stderr, "Error: MEMORY_MCP_URL=%q is invalid: %s\n", envURL, err)
			os.Exit(1)
		}
		fmt.Printf("  Memory MCP URL: %s (loaded from MEMORY_MCP_URL env var)\n", envURL)
		return MemoryMCPChoice{URL: envURL, BearerToken: promptMemoryMCPBearer()}
	}

	if !isTerminal() {
		fmt.Printf("  Memory MCP URL: %s (default for non-interactive installs)."+
			" Set MEMORY_MCP_URL=https://... to override.\n", defaultMemoryMCPURL)
		return MemoryMCPChoice{URL: defaultMemoryMCPURL, BearerToken: promptMemoryMCPBearer()}
	}

	return promptURLInteractive()
}

// promptURLInteractive shows the URL prompt on a TTY. It accepts two formats:
//
//   - A bare URL (`https://your-mcp.example.com/mcp`) — proceeds to the bearer
//     prompt afterwards.
//   - A full mcpServers.memory JSON snippet starting with `{` (as copied from
//     the context-harness-mcp dashboard) — parsed directly to extract URL +
//     Bearer in one paste; the bearer prompt is then skipped.
func promptURLInteractive() MemoryMCPChoice {
	fmt.Println()
	fmt.Println("Memory MCP URL or paste-ready snippet")
	fmt.Println("=====================================")
	fmt.Println()
	fmt.Println("Paste either:")
	fmt.Println("  • the bare URL of your Knowledge Graph MCP, OR")
	fmt.Println("  • the full JSON snippet from your context-harness-mcp /dashboard")
	fmt.Println("    (we parse it and skip the separate bearer prompt).")
	fmt.Println("Press Enter to use the local Docker default.")
	fmt.Println()
	fmt.Printf("Memory MCP URL [%s]: ", defaultMemoryMCPURL)

	raw := strings.TrimSpace(readLine())
	if raw == "" {
		return MemoryMCPChoice{URL: defaultMemoryMCPURL, BearerToken: promptMemoryMCPBearer()}
	}

	// Smart-paste: if the input opens a JSON object, slurp the rest of the
	// snippet (across multiple stdin lines) and extract URL + Bearer.
	if strings.HasPrefix(raw, "{") {
		return parseSnippetPaste(raw)
	}

	if err := validateMCPURL(raw); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %q is not a valid URL: %s\n", raw, err)
		fmt.Fprintln(os.Stderr, "  URL must start with http:// or https://")
		os.Exit(1)
	}
	return MemoryMCPChoice{URL: raw, BearerToken: promptMemoryMCPBearer()}
}

// snippetMaxLines caps how many lines parseSnippetPaste will read while
// assembling a JSON snippet. The standard mcpServers.memory shape is 8-10
// lines; the cap is generous to accommodate operator-added headers while
// preventing a runaway loop if the paste arrives malformed (unmatched braces).
const snippetMaxLines = 100

// parseSnippetPaste assembles a JSON snippet from stdin, starting with
// firstLine, reading additional lines until braces balance (or the safety
// cap is reached), then extracts URL + Bearer from
// mcpServers.memory.{url, headers.Authorization}.
//
// On any parse / validation failure the process exits 1 with a helpful
// error message — the user can re-run the installer and paste the URL alone.
func parseSnippetPaste(firstLine string) MemoryMCPChoice {
	var b strings.Builder
	b.WriteString(firstLine)
	depth := strings.Count(firstLine, "{") - strings.Count(firstLine, "}")

	for i := 0; depth > 0 && i < snippetMaxLines; i++ {
		next := readLine()
		b.WriteByte('\n')
		b.WriteString(next)
		depth += strings.Count(next, "{") - strings.Count(next, "}")
	}
	if depth != 0 {
		fmt.Fprintln(os.Stderr, "Error: pasted JSON snippet has unmatched braces.")
		fmt.Fprintln(os.Stderr, "  Re-run the installer and paste the URL alone, or copy the")
		fmt.Fprintln(os.Stderr, "  snippet again from your context-harness-mcp /dashboard.")
		os.Exit(1)
	}

	url, bearer, err := extractFromSnippet(b.String())
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: couldn't parse pasted snippet: %s\n", err)
		fmt.Fprintln(os.Stderr, `  Expected format: { "mcpServers": { "memory": { "url": "...", "headers": { "Authorization": "Bearer ..." } } } }`)
		os.Exit(1)
	}
	if err := validateMCPURL(url); err != nil {
		fmt.Fprintf(os.Stderr, "Error: snippet URL %q is invalid: %s\n", url, err)
		os.Exit(1)
	}

	fmt.Printf("  Memory MCP URL: %s (parsed from pasted snippet)\n", url)
	if bearer != "" {
		fmt.Println("  Memory MCP bearer: (parsed from pasted snippet)")
	}
	return MemoryMCPChoice{URL: url, BearerToken: bearer}
}

// extractFromSnippet parses a JSON blob and returns the URL + Bearer (without
// the "Bearer " prefix) from mcpServers.memory. The Authorization header is
// optional — empty bearer means the MCP is unauthenticated.
func extractFromSnippet(raw string) (url, bearer string, err error) {
	var parsed map[string]interface{}
	if jsonErr := json.Unmarshal([]byte(raw), &parsed); jsonErr != nil {
		return "", "", jsonErr
	}
	mcps, ok := parsed["mcpServers"].(map[string]interface{})
	if !ok {
		return "", "", fmt.Errorf("missing mcpServers")
	}
	mem, ok := mcps["memory"].(map[string]interface{})
	if !ok {
		return "", "", fmt.Errorf("missing mcpServers.memory")
	}
	url, _ = mem["url"].(string)
	if url == "" {
		return "", "", fmt.Errorf("missing mcpServers.memory.url")
	}
	if headers, ok := mem["headers"].(map[string]interface{}); ok {
		if auth, ok := headers["Authorization"].(string); ok {
			const prefix = "Bearer "
			if strings.HasPrefix(auth, prefix) {
				bearer = strings.TrimSpace(auth[len(prefix):])
			}
		}
	}
	return url, bearer, nil
}

// promptMemoryMCPBearer captures the optional Bearer token for the Memory MCP.
//
// Decision priority:
//  1. MEMORY_MCP_BEARER env var (non-interactive / CI / scripted installs).
//  2. Non-interactive without env var → empty (unauthenticated).
//  3. Interactive TTY → prompt; Enter → empty (unauthenticated).
//
// The returned string is the raw token (the "Bearer " prefix is added later by
// buildMemoryEntry when writing the Authorization header).
func promptMemoryMCPBearer() string {
	if env := strings.TrimSpace(os.Getenv("MEMORY_MCP_BEARER")); env != "" {
		fmt.Println("  Memory MCP bearer: (loaded from MEMORY_MCP_BEARER env var)")
		return env
	}
	if !isTerminal() {
		return ""
	}

	fmt.Println()
	fmt.Println("Memory MCP Bearer token (optional)")
	fmt.Println("==================================")
	fmt.Println()
	fmt.Println("If your Memory MCP requires authentication, paste the JWT here. For")
	fmt.Println("context-harness-mcp deployments, generate one at <base-url>/dashboard.")
	fmt.Println("Press Enter to skip (local / unauthenticated MCPs need no token).")
	fmt.Println()
	fmt.Print("Bearer token: ")
	return strings.TrimSpace(readLine())
}

// validateMCPURL returns an error if the URL does not start with http:// or https://.
func validateMCPURL(url string) error {
	if strings.HasPrefix(url, "http://") || strings.HasPrefix(url, "https://") {
		return nil
	}
	return fmt.Errorf("must start with http:// or https://")
}

// urlFromEntry extracts the URL from an existing memory entry map.
// Returns the http url for http-type entries, or "" for stdio entries.
func urlFromEntry(entry map[string]interface{}) string {
	if entry == nil {
		return ""
	}
	kind, _ := entry["type"].(string)
	if kind == "http" {
		url, _ := entry["url"].(string)
		return url
	}
	return ""
}

// bearerFromEntry extracts the raw Bearer token (without the "Bearer " prefix)
// from an existing memory entry's headers.Authorization, if present. Returns ""
// when no auth header is set or when the header doesn't have the Bearer prefix.
func bearerFromEntry(entry map[string]interface{}) string {
	if entry == nil {
		return ""
	}
	headers, ok := entry["headers"].(map[string]interface{})
	if !ok {
		return ""
	}
	auth, _ := headers["Authorization"].(string)
	const prefix = "Bearer "
	if strings.HasPrefix(auth, prefix) {
		return strings.TrimSpace(auth[len(prefix):])
	}
	return ""
}

// isTerminal returns true when stdin is an interactive terminal.
func isTerminal() bool {
	stat, err := os.Stdin.Stat()
	if err != nil {
		return false
	}
	return (stat.Mode() & os.ModeCharDevice) != 0
}
