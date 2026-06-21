package main

import (
	"errors"
	"fmt"
	"os"
	"strings"

	tea "charm.land/bubbletea/v2"
	"charm.land/huh/v2"
)

// opencodeSetupValues holds the values collected during opencode interactive
// setup. Only Memory MCP and context7 are configurable interactively — all
// other keys are set to their defaults.
//
// No secret values are stored here — the Memory bearer and context7 key are
// NEVER captured for persistence (SEC-OC-R1).
type opencodeSetupValues struct {
	// Agent output location — always "local" after the trim (AC-1).
	LogsMode string // always "local" on interactive path post-trim

	// MCP configuration (URL-only — no secret values captured; SEC-OC-R1).
	MCP opencodeMCPValues
}

// opencodeMCPValues holds the MCP-related fields from the setup flow.
// MemoryRequiresAuth and Context7Enabled are UI signals only — they govern
// what instructions are shown to the operator. No secret value is ever
// stored here.
type opencodeMCPValues struct {
	MemoryURL          string // literal URL (validated); empty = skip
	MemoryRequiresAuth bool   // true → show MEMORY_MCP_BEARER export note
	Context7Enabled    bool   // true → show CONTEXT7_API_KEY export note
}

// opencodeSetupFormData holds huh pointer bindings for the trimmed interactive
// opencode setup form. Only Memory MCP and context7 fields remain (AC-2).
type opencodeSetupFormData struct {
	// P3 import confirm (shown only when an existing config is detected).
	importExisting bool

	// Memory MCP.
	configureMCP       bool
	memoryURL          string
	memoryRequiresAuth bool

	// context7.
	configureContext7 bool
}

// collectOpencodeSetupInteractive presents the trimmed .team-harness.json
// setup form (Memory MCP + context7 only) and returns the collected values.
//
// When cand is non-nil (P3 detected a pre-existing config from either the
// opencode-owned path or the Claude Code fallback path), a STANDALONE PRE-FORM
// confirm runs BEFORE the main form is built. On "Import", the function goes
// straight to write-config + MCP-registration WITHOUT running the main form
// (AC-4 Import short-circuit).
//
// On ErrUserAborted, the function prints a notice and exits 0. Assets are
// already installed; this only governs config writing.
//
// JSON-snippet detection (MemoryURL starts with '{') is forwarded to
// handleJSONSnippetFallbackForOpencode after form.Run().
func collectOpencodeSetupInteractive(cand *importCandidate, importSource string) opencodeSetupValues {
	data := &opencodeSetupFormData{
		importExisting:     false,
		configureMCP:       false,
		memoryURL:          "",
		memoryRequiresAuth: false,
		configureContext7:  false,
	}

	// Pre-form import decision: runs BEFORE the main form so that on accept the
	// flow can short-circuit straight to write+register (AC-4).
	if cand != nil {
		confirm := huh.NewForm(
			huh.NewGroup(
				huh.NewNote().
					Title("Existing configuration detected").
					Description(importSourceNote(importSource)),
				huh.NewConfirm().
					Value(&data.importExisting).
					Title("Import existing settings as defaults?").
					Affirmative("Import").
					Negative("Start fresh"),
			).Title("Existing Config"),
		).
			WithAccessible(isAccessibleMode()).
			WithTheme(installerTheme())

		if err := runFormWithTTY(confirm); err != nil {
			if errors.Is(err, huh.ErrUserAborted) {
				fmt.Println("Setup cancelled. Assets remain installed.")
				os.Exit(0)
			}
			fmt.Fprintf(os.Stderr, "Error: setup form failed: %v\n", err)
			os.Exit(1)
		}

		// Import short-circuit (AC-4): on accept, skip the main form and return
		// immediately with defaults so the caller writes config + registers MCP.
		if data.importExisting {
			return buildOpencodeSetupValues(data)
		}
	}

	groups := buildOpencodeSetupGroups(data)
	form := huh.NewForm(groups...).
		WithAccessible(isAccessibleMode()).
		WithTheme(installerTheme())

	if err := runFormWithTTY(form); err != nil {
		if errors.Is(err, huh.ErrUserAborted) {
			fmt.Println("Setup cancelled. Assets remain installed.")
			os.Exit(0)
		}
		fmt.Fprintf(os.Stderr, "Error: setup form failed: %v\n", err)
		os.Exit(1)
	}

	// JSON snippet fallback: if memoryURL starts with '{', the operator pasted a
	// JSON snippet. Extract URL + bearer via the existing snippet reader (inside
	// the interactive gate, safe after form.Run()).
	if data.configureMCP && strings.HasPrefix(strings.TrimSpace(data.memoryURL), "{") {
		tuiData := &tuiFormData{memURL: data.memoryURL, memBearer: ""}
		handleJSONSnippetFallback(tuiData)
		data.memoryURL = tuiData.memURL
		// Bearer from snippet is discarded — secret values are never persisted
		// (SEC-OC-R1). Only the URL is retained for registerOpencodeMCPFromValues.
	}

	return buildOpencodeSetupValues(data)
}

// collectOpencodeSetupInteractivePreFilled is identical to
// collectOpencodeSetupInteractive but pre-fills data.memoryURL with initialURL
// (and flips data.configureMCP = true) before building the form groups. This
// implements the CC-URL migration pre-fill: the operator sees the CC-migrated
// URL in the Memory MCP URL field and can accept or edit it.
//
// When initialURL is empty, the behaviour is identical to the non-prefilled form.
func collectOpencodeSetupInteractivePreFilled(cand *importCandidate, importSource, initialURL string) opencodeSetupValues {
	data := &opencodeSetupFormData{
		importExisting:     false,
		configureMCP:       false,
		memoryURL:          "",
		memoryRequiresAuth: false,
		configureContext7:  false,
	}

	// Inject the resolved URL before the import confirm so that, if the operator
	// chooses "Start fresh", the URL is still pre-populated.
	if initialURL != "" {
		data.memoryURL = initialURL
		data.configureMCP = true
	}

	// Pre-form import decision (same as collectOpencodeSetupInteractive).
	if cand != nil {
		confirm := huh.NewForm(
			huh.NewGroup(
				huh.NewNote().
					Title("Existing configuration detected").
					Description(importSourceNote(importSource)),
				huh.NewConfirm().
					Value(&data.importExisting).
					Title("Import existing settings as defaults?").
					Affirmative("Import").
					Negative("Start fresh"),
			).Title("Existing Config"),
		).
			WithAccessible(isAccessibleMode()).
			WithTheme(installerTheme())

		if err := runFormWithTTY(confirm); err != nil {
			if errors.Is(err, huh.ErrUserAborted) {
				fmt.Println("Setup cancelled. Assets remain installed.")
				os.Exit(0)
			}
			fmt.Fprintf(os.Stderr, "Error: setup form failed: %v\n", err)
			os.Exit(1)
		}

		// Import short-circuit (AC-4): on accept, skip the main form.
		// Re-apply the pre-filled URL after import if no URL was imported.
		// Import candidates never carry MCP URLs — only non-secret keys.
		if data.importExisting {
			if data.memoryURL == "" && initialURL != "" {
				data.memoryURL = initialURL
				data.configureMCP = true
			}
			return buildOpencodeSetupValues(data)
		}
	}

	groups := buildOpencodeSetupGroups(data)
	form := huh.NewForm(groups...).
		WithAccessible(isAccessibleMode()).
		WithTheme(installerTheme())

	if err := runFormWithTTY(form); err != nil {
		if errors.Is(err, huh.ErrUserAborted) {
			fmt.Println("Setup cancelled. Assets remain installed.")
			os.Exit(0)
		}
		fmt.Fprintf(os.Stderr, "Error: setup form failed: %v\n", err)
		os.Exit(1)
	}

	if data.configureMCP && strings.HasPrefix(strings.TrimSpace(data.memoryURL), "{") {
		tuiData := &tuiFormData{memURL: data.memoryURL, memBearer: ""}
		handleJSONSnippetFallback(tuiData)
		data.memoryURL = tuiData.memURL
	}

	return buildOpencodeSetupValues(data)
}

// runFormWithTTY runs a huh form, wiring the controlling tty explicitly as
// the bubbletea input source on unix when /dev/tty is available (AC-5 paste fix).
//
// Explicit tty wiring ensures bubbletea's initInput() sets the program's
// ttyInput to the real controlling terminal so bracketed-paste is enabled and
// paste events are delivered as tea.PasteMsg — resolving the curl | bash paste
// bug where implicit input resolution could land on a pipe-backed handle.
//
// On Windows or when /dev/tty is unavailable, the form is run as-is (current
// behaviour — no regression for non-unix or headless paths).
//
// The accessible-mode (plain-prompt) branch bypasses bubbletea program options
// entirely; the TTY wiring is a no-op in that path.
func runFormWithTTY(form *huh.Form) error {
	if !isAccessibleMode() {
		// fix(paste-bug): wire /dev/tty explicitly so bubbletea's initInput
		// attaches raw mode + bracketed-paste to the controlling terminal, not
		// to a pipe-backed stdin that may be present under curl | bash.
		ttyR, errR := openTTYDevice()
		ttyW, errW := openTTYForWrite()
		if errR == nil && errW == nil {
			defer ttyR.Close()
			defer ttyW.Close()
			form = form.WithProgramOptions(
				tea.WithInput(ttyR),
				tea.WithOutput(ttyW),
			)
		}
		// When /dev/tty is unavailable (Windows stub returns err, or CI with no
		// controlling terminal) fall through and run the form as-is.
	}
	return form.Run()
}

// importSourceNote returns the human-readable description used in the pre-form
// confirm, naming the actual source (opencode-owned vs Claude Code config).
func importSourceNote(importSource string) string {
	if importSource == "claude-code" {
		return "A team-harness config was found at ~/.claude/.team-harness.json\n" +
			"(your existing Claude Code configuration).\n\n" +
			"Choose Import to use those settings as the starting point.\n" +
			"Choose Start fresh to begin with default values."
	}
	// opencode-owned re-run
	return "A .team-harness.json was found at the opencode config path.\n\n" +
		"Choose Import to use those settings as the starting point.\n" +
		"Choose Start fresh to begin with default values."
}

// buildOpencodeSetupGroups assembles all huh form groups for the trimmed opencode
// setup flow: Memory MCP (confirm + URL + auth + bearer note) and context7 only.
//
// The five groups removed by AC-2 are: Agent Output Location, Language,
// English-Learning, ClickUp, Obsidian Tasks. The final "Write configuration?"
// confirm is also removed (AC-3 — config is written directly after form.Run()).
//
// The import-confirm group is collected by a standalone pre-form confirm in
// collectOpencodeSetupInteractive BEFORE this function is called.
func buildOpencodeSetupGroups(data *opencodeSetupFormData) []*huh.Group {
	var groups []*huh.Group

	// ── Group 4: Memory MCP ───────────────────────────────────────────────────
	memURLField := huh.NewInput().
		Value(&data.memoryURL).
		Title("Memory MCP URL").
		Description("Paste the bare URL (https://...) or a full JSON snippet (starts with '{').").
		Placeholder("https://your-mcp.example.com/mcp").
		Validate(func(v string) error {
			v = strings.TrimSpace(v)
			if v == "" {
				return fmt.Errorf("URL is required — no default URL exists")
			}
			if strings.HasPrefix(v, "{") {
				return nil // JSON snippet: passes form; handled after Run()
			}
			return validateMCPURL(v)
		})

	groups = append(groups,
		huh.NewGroup(
			huh.NewNote().
				Title("Memory MCP").
				Description("The Memory MCP is an external server that provides knowledge-graph\nmemory for the agents. Only the URL is configured here — the bearer\ntoken (if required) stays in your shell environment.\n\nRegister it now (optional — re-run the install to add it later)."),
			huh.NewConfirm().
				Value(&data.configureMCP).
				Title("Configure Memory MCP now?").
				Affirmative("Yes").
				Negative("Skip"),
		).Title("Memory MCP"),

		huh.NewGroup(
			memURLField,
		).Title("Memory MCP URL").
			WithHideFunc(func() bool { return !data.configureMCP }),

		huh.NewGroup(
			huh.NewConfirm().
				Value(&data.memoryRequiresAuth).
				Title("Does this Memory MCP server require authentication?").
				Affirmative("Yes — it requires a bearer token").
				Negative("No — unauthenticated"),
		).Title("Memory MCP Auth").
			WithHideFunc(func() bool { return !data.configureMCP }),

		huh.NewGroup(
			huh.NewNote().
				Title("Bearer token required").
				Description("The bearer token is NEVER captured by this installer.\nopencode resolves it at runtime from your shell environment.\n\nExport it before launching opencode:\n\n  export MEMORY_MCP_BEARER=<your-token>\n\nYou can also add it to your shell profile (~/.bashrc, ~/.zshrc, etc.)."),
		).Title("Memory MCP Bearer").
			WithHideFunc(func() bool { return !data.configureMCP || !data.memoryRequiresAuth }),
	)

	// ── Group 5: context7 ─────────────────────────────────────────────────────
	groups = append(groups,
		huh.NewGroup(
			huh.NewNote().
				Title("context7 — Live Library Docs").
				Description("context7 provides up-to-date library documentation to the agents,\npreventing stale API usage. It requires a CONTEXT7_API_KEY.\n\nThe key is NEVER captured by this installer.\nopencode resolves it at runtime from your shell environment.\n\nIf you enable it here, export the key before launching opencode:\n\n  export CONTEXT7_API_KEY=<your-key>\n\nGet a key at https://context7.com/"),
			huh.NewConfirm().
				Value(&data.configureContext7).
				Title("Enable context7 library docs?").
				Affirmative("Yes — I will export CONTEXT7_API_KEY").
				Negative("Skip"),
		).Title("context7"),
	)

	return groups
}

// buildOpencodeSetupValues converts the raw form data into the typed
// opencodeSetupValues struct. LogsMode is always "local" — the work-logs
// group is removed (AC-1). EnglishLearning is never set (AC-1).
func buildOpencodeSetupValues(data *opencodeSetupFormData) opencodeSetupValues {
	cfg := opencodeSetupValues{}

	// Silent local default (AC-1) — no work-logs group to check.
	cfg.LogsMode = "local"

	// MCP.
	if data.configureMCP {
		cfg.MCP.MemoryURL = strings.TrimSpace(data.memoryURL)
		cfg.MCP.MemoryRequiresAuth = data.memoryRequiresAuth
	}
	cfg.MCP.Context7Enabled = data.configureContext7

	return cfg
}
