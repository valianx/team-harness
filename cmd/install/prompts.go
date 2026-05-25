package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"strings"
)

// MemoryMCPChoice captures the result of the Memory MCP URL prompt.
type MemoryMCPChoice struct {
	URL         string // always set — either from existing config, env, or interactive input
	BearerToken string // empty when the MCP requires no auth
	Preserved   bool   // true when the existing entry was kept without change
}

// promptMemoryMCPURL determines the Memory MCP URL and Bearer token for
// non-interactive installs. It is only called from collectConfigNonInteractive.
//
// Decision priority (when --force is NOT set):
//  1. Existing valid mcpServers.memory in ~/.claude.json → preserve URL+bearer.
//  2. MEMORY_MCP_URL env var.
//  3. No env var and no TTY → ERROR + exit 1.
//
// The interactive (TUI) path is handled by runTUIForm in tui.go.
func promptMemoryMCPURL() MemoryMCPChoice {
	existing := readExistingMCPServers()
	existingMemory, _ := existing["memory"].(map[string]interface{})

	if !forceFlag {
		if looksLikeValidMemoryEntry(existingMemory) {
			existingURL := urlFromEntry(existingMemory)
			existingBearer := bearerFromEntry(existingMemory)
			// Non-interactive: preserve silently.
			fmt.Printf("  Memory MCP URL: preserving existing %s (non-interactive)\n", existingURL)
			return MemoryMCPChoice{URL: existingURL, BearerToken: existingBearer, Preserved: true}
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
		fmt.Printf("  Memory MCP URL: %s (loaded from MEMORY_MCP_URL env var)\n", colorValue(envURL))
		return MemoryMCPChoice{URL: envURL, BearerToken: promptMemoryMCPBearer()}
	}

	// No env var in non-interactive mode: error with helpful message.
	fmt.Fprintln(os.Stderr, `Memory MCP URL is required for non-interactive installs.
  Detected: no controlling terminal available (stdin is a pipe and /dev/tty is inaccessible).
  Options:
    1. Run with the URL inline:
         MEMORY_MCP_URL=https://your-mcp.example.com/mcp \
           curl -fsSL https://valianx.github.io/team-harness/install.sh | bash -s -- --force
    2. Run interactively in a real terminal (TTY available).
  There is no default URL.`)
	os.Exit(1)
	return MemoryMCPChoice{} // unreachable
}

// promptMemoryMCPBearer returns the bearer token from the MEMORY_MCP_BEARER
// env var, or "" when the var is not set. Used by the non-interactive path only.
//
// The function name is kept for backward compat with tty_test.go and
// preservation_test.go which test this env-var path directly.
func promptMemoryMCPBearer() string {
	if env := strings.TrimSpace(os.Getenv("MEMORY_MCP_BEARER")); env != "" {
		fmt.Println("  Memory MCP bearer: (loaded from MEMORY_MCP_BEARER env var)")
		return env
	}
	return ""
}

// snippetMaxLines caps how many lines parseSnippetPaste will read while
// assembling a JSON snippet. The standard mcpServers.memory shape is 8-10
// lines; the cap is generous to accommodate operator-added headers while
// preventing a runaway loop if the paste arrives malformed (unmatched braces).
const snippetMaxLines = 100

// parseSnippetPaste assembles a JSON snippet starting with firstLine, reading
// additional lines from scan until braces balance (or the safety cap is
// reached), then extracts URL + Bearer from
// mcpServers.memory.{url, headers.Authorization}.
//
// On any parse / validation failure the process exits 1 with a helpful
// error message — the user can re-run the installer and paste the URL alone.
func parseSnippetPaste(firstLine string, scan *bufio.Scanner) MemoryMCPChoice {
	var b strings.Builder
	b.WriteString(firstLine)
	depth := strings.Count(firstLine, "{") - strings.Count(firstLine, "}")

	for i := 0; depth > 0 && i < snippetMaxLines; i++ {
		next := readLineFrom(scan)
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
