package main

import (
	"errors"
	"fmt"
	"os"
	"strings"

	tea "charm.land/bubbletea/v2"
	"charm.land/huh/v2"
)

// opencodeSetupValues holds the values collected during opencode setup.
// Context7 can be enabled from the native form; knowledge-graph registration
// is available only through an explicit flag/environment value. Existing MCP
// entries remain untouched when no explicit value is supplied.
//
// No secret values are stored here — the Memory bearer and context7 key are
// NEVER captured for persistence (SEC-OC-R1).
type opencodeSetupValues struct {
	// Agent output location — always "local" after the trim (AC-1).
	LogsMode string // always "local" on interactive path post-trim

	// MCP configuration (URL-only — no secret values captured; SEC-OC-R1).
	MCP opencodeMCPValues

	// CostTierProvider is the opt-in per-provider cost-tiering selection
	// (#424): "" means the model-less baseline (unchanged default); a curated
	// provider name (e.g. "anthropic") means the transform bakes a concrete
	// model: id per agent. Resolved by resolveActiveTierProvider — NOT a huh
	// form field (the interactive setup form exposes only the independent
	// context7 choice; see TestBuildOpencodeSetupGroups_GroupCountIsInRange).
	CostTierProvider string
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
// opencode setup form. Memory fields remain as compatibility data for explicit
// --memory-url/MEMORY_MCP_URL callers; they are never rendered as a prompt.
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
// setup form (context7 only) and returns the collected values. Memory/KG MCP
// registration is opt-in through --memory-url or MEMORY_MCP_URL.
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
	seedExplicitMemoryURL(data)

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
// collectOpencodeSetupInteractive but accepts an explicit initialURL
// (and flips data.configureMCP = true) and, when initialContext7Enabled is true,
// flips data.configureContext7 = true before building the form groups.
//
// This implements two CC-migration pre-fills:
//   - Memory URL: the operator sees the CC-migrated URL pre-populated.
//   - context7: when the CC config had a context7 key, context7 is enabled by
//     default on the import short-circuit AND on the full form. The operator
//     decision "si se importa, no preguntes — solo copia las credenciales" means
//     CC-migrated context7 key presence → context7 enabled, no extra prompt.
//
// When initialURL is empty and initialContext7Enabled is false, behaviour is
// identical to collectOpencodeSetupInteractive with default values.
func collectOpencodeSetupInteractivePreFilled(cand *importCandidate, importSource, initialURL string, initialContext7Enabled bool) opencodeSetupValues {
	data := &opencodeSetupFormData{
		importExisting:     false,
		configureMCP:       false,
		memoryURL:          "",
		memoryRequiresAuth: false,
		configureContext7:  false,
	}
	seedExplicitMemoryURL(data)

	// Inject the resolved URL before the import confirm so that, if the operator
	// chooses "Start fresh", the URL is still pre-populated.
	if initialURL != "" {
		data.memoryURL = initialURL
		data.configureMCP = true
	}

	// fix(install): inject CC context7 key presence before the import confirm
	// so the import short-circuit (and "Start fresh" main form) both default
	// context7 to enabled when the CC migration had a key.
	if initialContext7Enabled {
		data.configureContext7 = true
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
			// fix(install): re-apply context7 default on import path — the form
			// was not run, so data.configureContext7 retains the initialContext7Enabled
			// value set above. buildOpencodeSetupValues reads it directly.
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

// buildOpencodeSetupGroups assembles the huh form groups for the trimmed
// opencode setup flow. Context7 is independent and can be selected here;
// Memory/KG configuration is intentionally absent from the normal form and is
// available only through an explicit flag or environment value.
//
// The prior setup-only groups (agent output location, language,
// English-Learning, ClickUp, Obsidian Tasks, and the final write confirmation)
// remain absent; config is written directly after form.Run().
//
// The import-confirm group is collected by a standalone pre-form confirm in
// collectOpencodeSetupInteractive BEFORE this function is called.
func buildOpencodeSetupGroups(data *opencodeSetupFormData) []*huh.Group {
	var groups []*huh.Group

	// Context7 is an independent, explicitly selected integration.
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

// seedExplicitMemoryURL carries an operator-supplied knowledge-graph URL into
// the interactive path without turning it into a setup offer. Existing MCP
// entries are preserved by registerOpencodeMCPFromValues when this returns no
// value.
func seedExplicitMemoryURL(data *opencodeSetupFormData) {
	url := resolveMemoryURLWithCCFallback("")
	if url == "" {
		return
	}
	data.memoryURL = url
	data.configureMCP = true
	data.memoryRequiresAuth = strings.TrimSpace(os.Getenv("MEMORY_MCP_BEARER")) != ""
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
