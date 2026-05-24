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

// promptMemoryMCPURL determines the Memory MCP URL and Bearer token from
// existing config, env vars, or an interactive prompt. There is intentionally
// NO default URL fallback — falling back silently produced misleading runtime
// errors (a "connection refused" trace pointing at the removed default host
// when the operator had pointed the MCP somewhere else entirely). Every
// install requires the operator to make an explicit URL choice; the installer
// never fabricates one. This is an open-source distribution — the MCP can
// live on any host (Railway/Render/Fly/Docker/local), so no specific URL is
// canonical to this repo.
//
// Decision priority for URL (when --force is NOT set):
//  1. Existing valid mcpServers.memory in ~/.claude.json → preserve URL+bearer.
//  2. MEMORY_MCP_URL env var (non-interactive / CI / scripted installs).
//  3. /dev/tty or stdin TTY available → prompt the user interactively.
//  4. No interactive source and no env var → ERROR + exit 1.
//
// Bearer token (only prompted when URL was NOT preserved):
//  1. MEMORY_MCP_BEARER env var (non-interactive / CI / scripted installs).
//  2. No interactive source → empty (unauthenticated).
//  3. Interactive TTY or /dev/tty → optional prompt; empty input means unauthenticated.
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
			// hasInteractiveInput also checks /dev/tty so curl | bash users
			// (stdin is a pipe but /dev/tty is available) reach the prompt.
			if !hasInteractiveInput() {
				fmt.Printf("  Memory MCP URL: preserving existing %s (non-interactive)\n", existingURL)
				return MemoryMCPChoice{URL: existingURL, BearerToken: existingBearer, Preserved: true}
			}

			// Interactive: surface the existing value and let the user decide.
			// Common case where the previous install accepted a wrong default
			// and the user wants to override on the next run.
			fmt.Println()
			fmt.Printf("  Existing Memory MCP URL: %s\n", colorValue(existingURL))
			if existingBearer != "" {
				fmt.Println("  Existing Memory MCP bearer: (preserved)")
			}
			choice := promptMenu("  Keep [Y] / Change [c]? [Y]: ",
				map[string]bool{"y": true, "c": true}, "y")
			if choice == "y" {
				return MemoryMCPChoice{URL: existingURL, BearerToken: existingBearer, Preserved: true}
			}
			fmt.Println("  Changing Memory MCP URL — going to interactive prompt.")
			// Operator explicitly chose Change. Skip the env var check so the prompt
			// always fires interactively — they want to replace the value with what
			// they paste, not silently inherit MEMORY_MCP_URL.
			input := openInteractiveInput()
			if input == nil {
				fmt.Fprintln(os.Stderr, "Error: Change selected but no interactive input source is available.")
				os.Exit(1)
			}
			defer input.Close()
			return promptURLInteractive(bufio.NewScanner(input))
		}
		if isLegacyStdioMemoryEntry(existingMemory) {
			fmt.Println("  Legacy stdio mcpServers.memory entry detected (v1 shape pointing at")
			fmt.Println("  the removed knowledge-graph/ Python server). Migrating to http; the")
			fmt.Println("  existing stdio entry will be replaced with an http entry derived from")
			fmt.Println("  the MEMORY_MCP_URL env var or the prompt below.")
		}
	}

	// Env var takes precedence over interactive prompt (per prompt, independently).
	envURL := strings.TrimSpace(os.Getenv("MEMORY_MCP_URL"))

	if envURL != "" {
		if err := validateMCPURL(envURL); err != nil {
			fmt.Fprintf(os.Stderr, "Error: MEMORY_MCP_URL=%q is invalid: %s\n", envURL, err)
			os.Exit(1)
		}
		fmt.Printf("  Memory MCP URL: %s (loaded from MEMORY_MCP_URL env var)\n", colorValue(envURL))
		return MemoryMCPChoice{URL: envURL, BearerToken: promptMemoryMCPBearer()}
	}

	// No env var — try to open an interactive input source (stdin TTY or /dev/tty).
	input := openInteractiveInput()
	if input == nil {
		fmt.Fprintln(os.Stderr, `Memory MCP URL is required for non-interactive installs.
  Detected: no controlling terminal available (stdin is a pipe and /dev/tty is inaccessible).
  Options:
    1. Run with the URL inline:
         MEMORY_MCP_URL=https://your-mcp.example.com/mcp \
           curl -fsSL https://valianx.github.io/team-harness/install.sh | bash -s -- --force
    2. Run interactively in a real terminal (TTY available).
  There is no default URL.`)
		os.Exit(1)
	}
	defer input.Close()

	return promptURLInteractive(bufio.NewScanner(input))
}

// promptURLInteractive shows the URL prompt on an interactive terminal. It
// accepts two formats:
//
//   - A bare URL (`https://your-mcp.example.com/mcp`) — proceeds to the bearer
//     prompt afterwards.
//   - A full mcpServers.memory JSON snippet starting with `{` (as copied from
//     the context-harness-mcp dashboard) — parsed directly to extract URL +
//     Bearer in one paste; the bearer prompt is then skipped.
func promptURLInteractive(scan *bufio.Scanner) MemoryMCPChoice {
	fmt.Println()
	fmt.Println("Paste either:")
	fmt.Println("  • the bare URL of your Knowledge Graph MCP, OR")
	fmt.Println("  • the full JSON snippet from your context-harness-mcp /dashboard")
	fmt.Println("    (we parse it and skip the separate bearer prompt).")
	fmt.Println("There is no default — empty input is rejected (no silent localhost fallback).")
	fmt.Println()
	fmt.Print("Memory MCP URL: ")

	raw := strings.TrimSpace(readLineFrom(scan))
	if raw == "" {
		fmt.Fprintln(os.Stderr, "Error: empty Memory MCP URL.")
		fmt.Fprintln(os.Stderr, "  Paste the URL of your Knowledge Graph MCP server (https://... or http://...)")
		fmt.Fprintln(os.Stderr, "  or the full JSON snippet from your context-harness-mcp /dashboard.")
		os.Exit(1)
	}

	// Smart-paste: if the input opens a JSON object, slurp the rest of the
	// snippet (across multiple lines) and extract URL + Bearer.
	if strings.HasPrefix(raw, "{") {
		return parseSnippetPaste(raw, scan)
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

// promptMemoryMCPBearer captures the optional Bearer token for the Memory MCP.
//
// Decision priority:
//  1. MEMORY_MCP_BEARER env var (non-interactive / CI / scripted installs).
//  2. No interactive source → empty (unauthenticated).
//  3. Interactive TTY or /dev/tty → prompt; Enter → empty (unauthenticated).
//
// The returned string is the raw token (the "Bearer " prefix is added later by
// buildMemoryEntry when writing the Authorization header).
func promptMemoryMCPBearer() string {
	if env := strings.TrimSpace(os.Getenv("MEMORY_MCP_BEARER")); env != "" {
		fmt.Println("  Memory MCP bearer: (loaded from MEMORY_MCP_BEARER env var)")
		return env
	}

	// MEMORY_MCP_BEARER not set — try to prompt interactively.
	input := openInteractiveInput()
	if input == nil {
		return ""
	}
	defer input.Close()

	scan := bufio.NewScanner(input)
	fmt.Println()
	fmt.Println("Memory MCP Bearer token (optional)")
	fmt.Println("==================================")
	fmt.Println()
	fmt.Println("If your Memory MCP requires authentication, paste the JWT here. For")
	fmt.Println("context-harness-mcp deployments, generate one at <base-url>/dashboard.")
	fmt.Println("Press Enter to skip (local / unauthenticated MCPs need no token).")
	fmt.Println()
	fmt.Print("Bearer token: ")
	return strings.TrimSpace(readLineFrom(scan))
}

// promptInstallMode determines the install mode via:
//
//  1. INSTALL_MODE env var (non-interactive / CI / scripted installs).
//  2. No interactive source and no env var → default ModeStandard (preserves v1.1.0 behaviour).
//  3. Interactive TTY or /dev/tty → prompt with [s] standard (default) / [l] low-cost menu.
//
// The env var is validated: unknown values exit 1 with a clear error. The default
// is always ModeStandard so an unset env var behaves identically to v1.1.0.
func promptInstallMode() InstallMode {
	if env := strings.TrimSpace(os.Getenv("INSTALL_MODE")); env != "" {
		switch env {
		case string(ModeStandard):
			fmt.Printf("  Install mode: standard (loaded from INSTALL_MODE env var)\n")
			return ModeStandard
		case string(ModeLowCost):
			fmt.Printf("  Install mode: low-cost (loaded from INSTALL_MODE env var)\n")
			return ModeLowCost
		default:
			fmt.Fprintf(os.Stderr, "Error: INSTALL_MODE=%q is invalid. Accepted values: standard, low-cost\n", env)
			os.Exit(1)
		}
	}

	// No env var — try to prompt interactively.
	input := openInteractiveInput()
	if input == nil {
		// Non-interactive with no env var: default to standard (v1.1.0 behaviour).
		return ModeStandard
	}
	defer input.Close()

	scan := bufio.NewScanner(input)
	fmt.Println("  [s] standard  — default. Canonical matrix as documented in agents/README.md.")
	fmt.Println("                  Best quality, highest API cost.")
	fmt.Println("  [l] low-cost  — for developers on lower-tier Anthropic plans (Free, Pro,")
	fmt.Println("                  or tight personal budget). Uniform sonnet matrix (effort:")
	fmt.Println("                  medium or high). Lower API cost. Accepts documented quality")
	fmt.Println("                  trade-offs (rougher analysis across the board, more Phase 3")
	fmt.Println("                  iteration loops, weaker security audit caught by the human")
	fmt.Println("                  reviewer at STAGE-GATE).")
	fmt.Println("                  See agents/README.md §\"Low-cost mode\".")
	fmt.Println()
	choice := promptMenuWith("Install mode [s/l]? [s]: ", map[string]bool{"s": true, "l": true}, "s", scan)
	if choice == "l" {
		return ModeLowCost
	}
	return ModeStandard
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
