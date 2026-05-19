package main

import (
	"fmt"
	"net/http"
	"os"
	"strings"
)

// KGBackendChoice captures the result of the backend selection prompt.
type KGBackendChoice struct {
	Backend   string // "memory" or "context-harness"
	URL       string // non-empty only for context-harness with a resolved URL
	Skipped   bool   // true when backend is context-harness but user chose to skip URL
	Preserved bool   // true when the existing entry was kept without change
}

// promptKGBackend determines the KG backend from existing config, env vars, or
// interactive prompts.
//
// Decision priority (when --force is NOT set):
//  1. Existing valid mcpServers.memory in ~/.claude.json → preserve.
//  2. KG_BACKEND env var (non-interactive / CI / scripted installs).
//  3. Non-interactive without env vars → default to "memory".
//  4. Interactive TTY → prompt the user.
//
// With --force: skips step 1 and falls through to env var / interactive.
func promptKGBackend() KGBackendChoice {
	existing := readExistingMCPServers()
	existingMemory, _ := existing["memory"].(map[string]interface{})

	if !forceFlag && looksLikeValidMemoryEntry(existingMemory) {
		kind, _ := existingMemory["type"].(string)
		url, _ := existingMemory["url"].(string)
		backend := "memory"
		if kind == "http" {
			backend = "context-harness"
		}
		fmt.Printf("  KG backend: preserving existing mcpServers.memory (type=%s)\n", kind)
		return KGBackendChoice{Backend: backend, URL: url, Skipped: false, Preserved: true}
	}

	envBackend := strings.TrimSpace(strings.ToLower(os.Getenv("KG_BACKEND")))
	isTTY := isTerminal()

	switch envBackend {
	case "memory":
		fmt.Println("  KG backend: memory (loaded from KG_BACKEND env var)")
		return KGBackendChoice{Backend: "memory"}
	case "context-harness":
		return handleContextHarnessEnvURL()
	case "":
		// Fall through to non-interactive default or TTY prompt.
	default:
		fmt.Fprintf(os.Stderr, "Error: KG_BACKEND='%s' is not a recognised value.\n", envBackend)
		fmt.Fprintln(os.Stderr, "  Valid values: memory, context-harness")
		os.Exit(1)
	}

	if !isTTY {
		fmt.Println("  KG backend: memory (default for non-interactive installs)." +
			" Set KG_BACKEND=context-harness + CONTEXT_HARNESS_URL=https://..." +
			" to use the remote backend.")
		return KGBackendChoice{Backend: "memory"}
	}

	// Interactive TTY.
	fmt.Println()
	fmt.Println("  Knowledge Graph backend:")
	fmt.Println("    1) context-harness  (Go server + Postgres+pgvector. Cloud or local.)")
	fmt.Println("    2) memory           (Python ChromaDB. Local single-machine.)")

	backendChoice := promptMenu("  Choice [1]: ", map[string]bool{"1": true, "2": true}, "1")
	if backendChoice == "2" {
		return KGBackendChoice{Backend: "memory"}
	}
	return promptContextHarnessURL()
}

// handleContextHarnessEnvURL resolves context-harness from env vars (non-interactive).
func handleContextHarnessEnvURL() KGBackendChoice {
	url := strings.TrimSpace(os.Getenv("CONTEXT_HARNESS_URL"))
	if url == "" {
		fmt.Fprintln(os.Stderr, "Error: KG_BACKEND=context-harness requires CONTEXT_HARNESS_URL to be set.")
		fmt.Fprintln(os.Stderr, "  Export CONTEXT_HARNESS_URL=https://<your-url>/mcp and re-run.")
		os.Exit(1)
	}
	fmt.Println("  KG backend: context-harness (loaded from env vars)")
	checkURLReachability(url, false)
	return KGBackendChoice{Backend: "context-harness", URL: url}
}

// promptContextHarnessURL asks for hosting type then URL.
func promptContextHarnessURL() KGBackendChoice {
	fmt.Println()
	fmt.Println("  Hosting:")
	fmt.Println("    1) Cloud (Render+Supabase Free)  (recommended; see context-harness-mcp docs/deployment.md)")
	fmt.Println("    2) Local (Docker)                (dev/testing offline; docker compose up in context-harness-mcp/)")

	hosting := promptMenu("  Choice [1]: ", map[string]bool{"1": true, "2": true}, "1")

	var url string
	if hosting == "1" {
		url = promptURLCloud()
	} else {
		url = promptURLLocal()
	}

	if url == "" {
		return KGBackendChoice{Backend: "context-harness", Skipped: true}
	}

	if !checkURLReachability(url, true) {
		return KGBackendChoice{Backend: "context-harness", Skipped: true}
	}
	return KGBackendChoice{Backend: "context-harness", URL: url}
}

// promptURLCloud prompts for a cloud Render URL; returns "" if the user skips.
func promptURLCloud() string {
	fmt.Println()
	fmt.Println("  Render endpoint URL (e.g. https://context-harness-mcp-xyz.onrender.com/mcp).")
	fmt.Println("  If you haven't deployed yet, type 'skip' and complete this later by re-running")
	fmt.Println("  the installer or editing ~/.claude.json under mcpServers.memory manually.")
	fmt.Print("  URL [skip]: ")
	raw := strings.TrimSpace(readLine())
	if raw == "" || strings.ToLower(raw) == "skip" {
		return ""
	}
	return raw
}

// promptURLLocal prompts for a local Docker URL with a sensible default.
func promptURLLocal() string {
	const defaultURL = "http://localhost:8080/mcp"
	fmt.Println()
	fmt.Printf("  Local endpoint URL [%s]:\n", defaultURL)
	fmt.Println("  (Enter accepts default - assumes you ran 'docker compose up' in context-harness-mcp/)")
	fmt.Print("  URL: ")
	raw := strings.TrimSpace(readLine())
	if raw == "" {
		return defaultURL
	}
	return raw
}

// checkURLReachability tries GET {base}/healthz.
// Returns true if the URL should be saved, false if the user declined.
// On non-interactive runs always returns true (warn, don't fail install).
func checkURLReachability(url string, interactive bool) bool {
	base := strings.TrimRight(url, "/")
	if strings.HasSuffix(base, "/mcp") {
		base = base[:len(base)-4]
	}
	healthURL := base + "/healthz"

	resp, err := http.Get(healthURL) //nolint:gosec // user-supplied URL, not attacker-controlled
	if err == nil {
		defer resp.Body.Close()
		if resp.StatusCode == http.StatusOK {
			fmt.Println("  [ok] reachable")
			return true
		}
		fmt.Printf("  [warn] not reachable: HTTP %d\n", resp.StatusCode)
	} else {
		fmt.Printf("  [warn] not reachable: %v\n", err)
	}

	if !interactive {
		return true
	}

	fmt.Print("  URL not responding. Save the entry anyway? [Y/n]: ")
	raw := strings.TrimSpace(strings.ToLower(readLine()))
	return raw != "n" && raw != "no"
}

// promptMenu re-prompts until the user enters a valid choice or presses Enter for
// the default.
func promptMenu(prompt string, choices map[string]bool, defaultChoice string) string {
	for {
		fmt.Print(prompt)
		raw := strings.TrimSpace(strings.ToLower(readLine()))
		if raw == "" {
			return defaultChoice
		}
		if choices[raw] {
			return raw
		}
		keys := make([]string, 0, len(choices))
		for k := range choices {
			keys = append(keys, k)
		}
		fmt.Printf("  Invalid choice '%s'. Please enter one of: %s.\n", raw, strings.Join(keys, ", "))
	}
}

// isTerminal returns true when stdin is an interactive terminal.
func isTerminal() bool {
	stat, err := os.Stdin.Stat()
	if err != nil {
		return false
	}
	return (stat.Mode() & os.ModeCharDevice) != 0
}
