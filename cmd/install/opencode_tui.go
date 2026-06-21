package main

import (
	"errors"
	"fmt"
	"os"
	"strings"

	"charm.land/huh/v2"
)

// opencodeSetupValues holds all values collected during the opencode interactive
// setup flow. Each field maps to a key in .team-harness.json or opencode.json.
// No secret values are stored here — the Memory bearer and context7 key are
// NEVER captured for persistence (SEC-OC-R1).
type opencodeSetupValues struct {
	// Agent output location (where agents write plans, implementations, test reports).
	LogsMode      string // "local" or "obsidian"
	LogsPath      string // absolute vault path (obsidian only)
	LogsSubfolder string // subfolder within vault (obsidian only; default "work-logs")

	// Agent language (ISO 639-1, optional — empty = skip).
	Language string

	// Opt-in english-learning correction mode.
	EnglishLearning bool

	// MCP configuration (URL-only — no secret values captured; SEC-OC-R1).
	MCP opencodeMCPValues

	// Optional integrations.
	ClickUpWorkspaceID   string
	ObsidianTasksEnabled bool
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

// opencodeSetupFormData holds all huh pointer bindings for the interactive
// opencode setup form. Each bool tracks a "configure this now?" confirm, each
// string tracks a detail input.
type opencodeSetupFormData struct {
	// P3 import confirm (shown only when an existing config is detected).
	importExisting bool

	// Agent output location.
	configureWorkLogs bool
	logsMode          string
	logsPath          string
	logsSubfolder     string

	// Language.
	configureLanguage bool
	language          string

	// English learning.
	configureEnglishLearning bool
	englishLearning          bool

	// Memory MCP.
	configureMCP      bool
	memoryURL         string
	memoryRequiresAuth bool

	// context7.
	configureContext7 bool

	// ClickUp.
	configureClickUp   bool
	clickUpWorkspaceID string

	// Obsidian tasks.
	configureObsidianTasks bool

	// Final confirm (Cancel → exit 0).
	doSetup bool
}

// collectOpencodeSetupInteractive presents the full-surface .team-harness.json
// setup form and returns the collected values.
//
// When cand is non-nil (P3 detected a pre-existing config from either the
// opencode-owned path or the Claude Code fallback path), a STANDALONE PRE-FORM
// confirm runs BEFORE the main form is built. The import decision gates the
// pre-fill: on accept, applyImportCandidate pre-fills data from the candidate;
// on decline, data stays at fresh defaults.
//
// The main form is then built with the (possibly pre-filled) data and has NO
// Group-0 import confirm — that decision was already collected pre-form.
//
// On ErrUserAborted or a "Cancel" choice in the final confirm, the function
// prints a notice and exits 0. Assets are already installed; this only
// governs config writing.
//
// JSON-snippet detection (MemoryURL starts with '{') is forwarded to
// handleJSONSnippetFallbackForOpencode after form.Run().
func collectOpencodeSetupInteractive(cand *importCandidate, importSource string) opencodeSetupValues {
	data := &opencodeSetupFormData{
		importExisting:         false,
		configureWorkLogs:      false,
		logsMode:               "local",
		logsPath:               "",
		logsSubfolder:          "work-logs",
		language:               "",
		englishLearning:        false,
		configureMCP:           false,
		memoryURL:              "",
		memoryRequiresAuth:     false,
		configureContext7:      false,
		configureClickUp:       false,
		clickUpWorkspaceID:     "",
		configureObsidianTasks: false,
		doSetup:                true,
	}

	// Pre-form import decision: runs BEFORE the main form is built so that the
	// main form's defaults are set correctly on first render. On decline, data
	// stays at fresh defaults and applyImportCandidate is never called (AC-3).
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

		if err := confirm.Run(); err != nil {
			if errors.Is(err, huh.ErrUserAborted) {
				fmt.Println("Setup cancelled. Assets remain installed.")
				os.Exit(0)
			}
			fmt.Fprintf(os.Stderr, "Error: setup form failed: %v\n", err)
			os.Exit(1)
		}

		// Apply the candidate ONLY when the operator chose Import (AC-3 oracle:
		// decline path leaves data at fresh defaults above).
		if data.importExisting {
			applyImportCandidate(data, cand)
		}
	}

	groups := buildOpencodeSetupGroups(data)
	form := huh.NewForm(groups...).
		WithAccessible(isAccessibleMode()).
		WithTheme(installerTheme())

	if err := form.Run(); err != nil {
		if errors.Is(err, huh.ErrUserAborted) {
			fmt.Println("Setup cancelled. Assets remain installed.")
			os.Exit(0)
		}
		fmt.Fprintf(os.Stderr, "Error: setup form failed: %v\n", err)
		os.Exit(1)
	}

	if !data.doSetup {
		fmt.Println("Setup cancelled. Assets remain installed.")
		os.Exit(0)
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
// implements the AC-9 CC-URL migration pre-fill: the operator sees the
// CC-migrated URL in the Memory MCP URL field and can accept or edit it.
//
// When initialURL is empty, the behaviour is identical to the non-prefilled form.
func collectOpencodeSetupInteractivePreFilled(cand *importCandidate, importSource, initialURL string) opencodeSetupValues {
	data := &opencodeSetupFormData{
		importExisting:         false,
		configureWorkLogs:      false,
		logsMode:               "local",
		logsPath:               "",
		logsSubfolder:          "work-logs",
		language:               "",
		englishLearning:        false,
		configureMCP:           false,
		memoryURL:              "",
		memoryRequiresAuth:     false,
		configureContext7:      false,
		configureClickUp:       false,
		clickUpWorkspaceID:     "",
		configureObsidianTasks: false,
		doSetup:                true,
	}

	// AC-9: inject the resolved URL before building the form so the operator
	// sees it pre-populated. Flip configureMCP so the MCP group is visible.
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

		if err := confirm.Run(); err != nil {
			if errors.Is(err, huh.ErrUserAborted) {
				fmt.Println("Setup cancelled. Assets remain installed.")
				os.Exit(0)
			}
			fmt.Fprintf(os.Stderr, "Error: setup form failed: %v\n", err)
			os.Exit(1)
		}

		if data.importExisting {
			applyImportCandidate(data, cand)
			// Re-apply the pre-filled URL after import if the import did not set
			// a URL (import candidates never carry MCP URLs — only non-secret keys).
			if data.memoryURL == "" && initialURL != "" {
				data.memoryURL = initialURL
				data.configureMCP = true
			}
		}
	}

	groups := buildOpencodeSetupGroups(data)
	form := huh.NewForm(groups...).
		WithAccessible(isAccessibleMode()).
		WithTheme(installerTheme())

	if err := form.Run(); err != nil {
		if errors.Is(err, huh.ErrUserAborted) {
			fmt.Println("Setup cancelled. Assets remain installed.")
			os.Exit(0)
		}
		fmt.Fprintf(os.Stderr, "Error: setup form failed: %v\n", err)
		os.Exit(1)
	}

	if !data.doSetup {
		fmt.Println("Setup cancelled. Assets remain installed.")
		os.Exit(0)
	}

	if data.configureMCP && strings.HasPrefix(strings.TrimSpace(data.memoryURL), "{") {
		tuiData := &tuiFormData{memURL: data.memoryURL, memBearer: ""}
		handleJSONSnippetFallback(tuiData)
		data.memoryURL = tuiData.memURL
	}

	return buildOpencodeSetupValues(data)
}

// importSourceNote returns the human-readable description used in the pre-form
// confirm, naming the actual source (opencode-owned vs Claude Code config).
func importSourceNote(importSource string) string {
	if importSource == "claude-code" {
		return "A team-harness config was found at ~/.claude/.team-harness.json\n" +
			"(your existing Claude Code configuration).\n\n" +
			"Settings detected: work-logs mode/path/subfolder, language,\n" +
			"english-learning, ClickUp workspace ID, Obsidian tasks.\n\n" +
			"Choose Import to pre-fill the form with those values\n" +
			"(you can adjust each setting before confirming).\n" +
			"Choose Start fresh to begin with default values."
	}
	// opencode-owned re-run
	return "A .team-harness.json was found at the opencode config path.\n" +
		"Settings detected: work-logs mode/path/subfolder, language,\n" +
		"english-learning, ClickUp workspace ID, Obsidian tasks.\n\n" +
		"Choose Import to pre-fill the form with those values\n" +
		"(you can adjust each setting before confirming).\n" +
		"Choose Start fresh to begin with default values."
}

// applyImportCandidate pre-fills data from the candidate on import-accept.
// Free-text values are validated at the pre-fill point (SEC-004):
//   - logs-path and clickup.workspace_id: rejected if they contain any char in
//     [\x00-\x1f\x7f] (parity with CONTROL_CHAR_RE from session-start.ts).
//   - language: accepted only when it satisfies ^[a-z]{2}$ (isValidISOLang).
//
// The 3 non-form keys (english_learning/clickup/obsidian_tasks) are carried by
// setting their configure* flags so buildOpencodeSetupValues carries them
// through unchanged (AC-15: buildOpencodeSetupValues is NOT modified).
func applyImportCandidate(data *opencodeSetupFormData, cand *importCandidate) {
	// Work-logs (form-backed).
	if cand.logsMode != "" {
		data.logsMode = cand.logsMode
		data.configureWorkLogs = true
	}
	// Guard logs-path for control characters before it becomes a form default.
	if cand.logsPath != "" && !hasControlChar(cand.logsPath) {
		data.logsPath = cand.logsPath
	}
	if cand.logsSubfolder != "" {
		data.logsSubfolder = cand.logsSubfolder
	}

	// Language (form-backed) — accept only a clean 2-letter ISO 639-1 code.
	if isValidISOLang(cand.language) {
		data.language = cand.language
		data.configureLanguage = true
	}

	// English-learning (NON-form) — carry via configure flag + value.
	if cand.englishLearning {
		data.configureEnglishLearning = true
		data.englishLearning = true
	}

	// ClickUp (NON-form) — guard the free-text workspace_id, then carry.
	if cand.clickUpWorkspaceID != "" && !hasControlChar(cand.clickUpWorkspaceID) {
		data.configureClickUp = true
		data.clickUpWorkspaceID = cand.clickUpWorkspaceID
	}

	// Obsidian-tasks (NON-form) — carry via configure flag.
	if cand.obsidianTasksEnabled {
		data.configureObsidianTasks = true
	}
}

// buildOpencodeSetupGroups assembles all huh form groups for the opencode
// setup flow. Groups are ordered: agent output location, language, english-learning,
// Memory MCP, context7, ClickUp, Obsidian tasks, final confirm.
//
// The import-confirm group (formerly Group 0) has been removed — that decision
// is now collected by a standalone pre-form confirm in collectOpencodeSetupInteractive
// BEFORE this function is called, so the main form always starts with data
// already at the correct defaults (imported or fresh).
func buildOpencodeSetupGroups(data *opencodeSetupFormData) []*huh.Group {
	var groups []*huh.Group

	// ── Group 0: agent output location ───────────────────────────────────────
	logsSelect := huh.NewSelect[string]().
		Value(&data.logsMode).
		Title("Save location").
		Description("Where pipeline workspace files are written by the agents.").
		Options(
			huh.NewOption("Local — ./workspaces/ relative to each project", "local"),
			huh.NewOption("Obsidian — writes to a vault folder (with metadata)", "obsidian"),
		)

	vaultPathInput := huh.NewInput().
		Value(&data.logsPath).
		Title("Obsidian Vault Path").
		Description("Absolute path to your vault (the folder containing .obsidian/).").
		Placeholder("/home/you/my-vault").
		Validate(func(v string) error {
			if data.logsMode != "obsidian" {
				return nil
			}
			if strings.TrimSpace(v) == "" {
				return fmt.Errorf("vault path is required when Obsidian mode is selected")
			}
			return nil
		})

	subfolderInput := huh.NewInput().
		Value(&data.logsSubfolder).
		Title("Folder inside the vault (optional)").
		Description("Subfolder inside the vault for work-logs (default: work-logs).").
		Placeholder("work-logs")

	groups = append(groups,
		huh.NewGroup(
			huh.NewNote().
				Title("Where agents save their work").
				Description("Agents write pipeline workspaces (plans, implementations, test reports)\nto a location you control. Local mode uses ./workspaces/ beside each\nproject. Obsidian mode writes structured notes to a vault you specify.\nThe opencode hook plugin reads this setting to locate the pipeline state."),
			huh.NewConfirm().
				Value(&data.configureWorkLogs).
				Title("Choose where agents save their plans, implementations, and reports now?").
				Affirmative("Yes").
				Negative("Skip (keep default: local)"),
		).Title("Agent Output Location"),

		huh.NewGroup(
			logsSelect,
			vaultPathInput,
			subfolderInput,
		).Title("Output Location Details").
			WithHideFunc(func() bool { return !data.configureWorkLogs }),
	)

	// ── Group 2: language ─────────────────────────────────────────────────────
	langInput := huh.NewInput().
		Value(&data.language).
		Title("Language code").
		Description("ISO 639-1 two-letter code (e.g. en, es, fr). Leave blank to skip.").
		Placeholder("en").
		Validate(func(v string) error {
			v = strings.TrimSpace(v)
			if v == "" {
				return nil // skip is valid
			}
			if len(v) != 2 {
				return fmt.Errorf("must be a 2-letter ISO 639-1 code (e.g. en, es)")
			}
			for _, c := range v {
				if c < 'a' || c > 'z' {
					return fmt.Errorf("must be lowercase letters only (e.g. en, es)")
				}
			}
			return nil
		})

	groups = append(groups,
		huh.NewGroup(
			huh.NewNote().
				Title("Agent Language").
				Description("This key records the language agents should respond in.\nStructural elements (headers, field names, status blocks) stay in English\nregardless of this setting. Runtime enforcement on opencode is a tracked\nfollow-up — the key is written to config now, forward-compatibly."),
			huh.NewConfirm().
				Value(&data.configureLanguage).
				Title("Configure language now?").
				Affirmative("Yes").
				Negative("Skip"),
		).Title("Language"),

		huh.NewGroup(langInput).
			Title("Language Code").
			WithHideFunc(func() bool { return !data.configureLanguage }),
	)

	// ── Group 3: english-learning ─────────────────────────────────────────────
	groups = append(groups,
		huh.NewGroup(
			huh.NewNote().
				Title("English-Learning Mode").
				Description("When enabled, agents gently correct English grammar and phrasing in your\nmessages while continuing the task. Requires language to be set to 'en'.\nRuntime enforcement on opencode is a tracked follow-up — the key is\nwritten to config now, forward-compatibly."),
			huh.NewConfirm().
				Value(&data.configureEnglishLearning).
				Title("Configure english-learning mode now?").
				Affirmative("Yes").
				Negative("Skip"),
		).Title("English-Learning"),

		huh.NewGroup(
			huh.NewConfirm().
				Value(&data.englishLearning).
				Title("Enable english-learning mode?").
				Affirmative("Enable").
				Negative("Disabled (default)"),
		).Title("English-Learning Setting").
			WithHideFunc(func() bool { return !data.configureEnglishLearning }),
	)

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

	// ── Group 6: ClickUp ──────────────────────────────────────────────────────
	clickupIDInput := huh.NewInput().
		Value(&data.clickUpWorkspaceID).
		Title("ClickUp Workspace ID").
		Description("Your ClickUp workspace ID (found in Settings → Workspace → ID).").
		Placeholder("12345678")

	groups = append(groups,
		huh.NewGroup(
			huh.NewNote().
				Title("ClickUp Integration").
				Description("Enables the /th:clickup skill for task sync between the pipeline\nand your ClickUp workspace. Requires a workspace ID."),
			huh.NewConfirm().
				Value(&data.configureClickUp).
				Title("Configure ClickUp integration?").
				Affirmative("Yes").
				Negative("Skip"),
		).Title("ClickUp"),

		huh.NewGroup(
			clickupIDInput,
		).Title("ClickUp Workspace ID").
			WithHideFunc(func() bool { return !data.configureClickUp }),
	)

	// ── Group 7: Obsidian tasks ───────────────────────────────────────────────
	groups = append(groups,
		huh.NewGroup(
			huh.NewNote().
				Title("Obsidian Task Management").
				Description("Enables the /th:todo skill for task management in Obsidian.\nRequires Obsidian with the Tasks plugin installed."),
			huh.NewConfirm().
				Value(&data.configureObsidianTasks).
				Title("Enable Obsidian task management?").
				Affirmative("Enable").
				Negative("Skip"),
		).Title("Obsidian Tasks"),
	)

	// ── Group 8: final confirm ────────────────────────────────────────────────
	groups = append(groups,
		huh.NewGroup(
			huh.NewNote().
				Title("Ready to write configuration").
				Description("Settings will be written to .team-harness.json in the opencode\nconfig directory. The agents and hook plugin are already installed.\n\nMCP servers marked with (export env-var) require you to export\nthe corresponding environment variable before launching opencode.\n\nYou can re-run the install link at any time to update settings."),
			huh.NewConfirm().
				Value(&data.doSetup).
				Title("Write configuration and complete setup?").
				Affirmative("Write config").
				Negative("Cancel (skip config)"),
		).Title("Confirm"),
	)

	return groups
}

// buildOpencodeSetupValues converts the raw form data into the typed
// opencodeSetupValues struct, applying defaults for skipped fields.
func buildOpencodeSetupValues(data *opencodeSetupFormData) opencodeSetupValues {
	cfg := opencodeSetupValues{}

	// Work-logs.
	if data.configureWorkLogs {
		cfg.LogsMode = data.logsMode
		if data.logsMode == "obsidian" {
			cfg.LogsPath = strings.TrimSpace(data.logsPath)
			cfg.LogsSubfolder = strings.TrimSpace(data.logsSubfolder)
			if cfg.LogsSubfolder == "" {
				cfg.LogsSubfolder = "work-logs"
			}
		}
	} else {
		cfg.LogsMode = "local"
	}

	// Language.
	if data.configureLanguage {
		cfg.Language = strings.TrimSpace(data.language)
	}

	// English learning.
	if data.configureEnglishLearning {
		cfg.EnglishLearning = data.englishLearning
	}

	// MCP.
	if data.configureMCP {
		cfg.MCP.MemoryURL = strings.TrimSpace(data.memoryURL)
		cfg.MCP.MemoryRequiresAuth = data.memoryRequiresAuth
	}
	cfg.MCP.Context7Enabled = data.configureContext7

	// ClickUp.
	if data.configureClickUp {
		cfg.ClickUpWorkspaceID = strings.TrimSpace(data.clickUpWorkspaceID)
	}

	// Obsidian tasks.
	cfg.ObsidianTasksEnabled = data.configureObsidianTasks

	return cfg
}
