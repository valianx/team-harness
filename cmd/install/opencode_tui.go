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
	// Work-logs output.
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

	// Work-logs.
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
// When existing is non-nil (P3 detected pre-existing config), the form opens
// with an import-confirm group that asks the operator whether to use the
// existing values as defaults. The form NEVER silently consumes or overwrites
// an existing config.
//
// On ErrUserAborted or a "Cancel" choice in the final confirm, the function
// prints a notice and exits 0. Assets are already installed; this only
// governs config writing.
//
// JSON-snippet detection (MemoryURL starts with '{') is forwarded to
// handleJSONSnippetFallbackForOpencode after form.Run().
func collectOpencodeSetupInteractive(existing map[string]string) opencodeSetupValues {
	data := &opencodeSetupFormData{
		importExisting:    false,
		configureWorkLogs: false,
		logsMode:          "local",
		logsPath:          "",
		logsSubfolder:     "work-logs",
		language:          "",
		englishLearning:   false,
		configureMCP:      false,
		memoryURL:         "",
		memoryRequiresAuth: false,
		configureContext7: false,
		configureClickUp:  false,
		clickUpWorkspaceID: "",
		configureObsidianTasks: false,
		doSetup:           true,
	}

	// Pre-populate defaults from existing config when operator agrees (P3).
	// The actual import is applied after the form if data.importExisting is true.
	if existing != nil {
		if v, ok := existing["logs-mode"]; ok && v != "" {
			data.logsMode = v
		}
		if v, ok := existing["logs-path"]; ok && v != "" {
			data.logsPath = v
		}
		if v, ok := existing["logs-subfolder"]; ok && v != "" {
			data.logsSubfolder = v
		}
		if v, ok := existing["language"]; ok && v != "" {
			data.language = v
		}
	}

	groups := buildOpencodeSetupGroups(data, existing)
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

// buildOpencodeSetupGroups assembles all huh form groups for the opencode
// setup flow. Groups are ordered: import confirm (conditional), work-logs,
// language, english-learning, Memory MCP, context7, ClickUp, Obsidian tasks,
// final confirm.
func buildOpencodeSetupGroups(data *opencodeSetupFormData, existing map[string]string) []*huh.Group {
	var groups []*huh.Group

	// ── Group 0: import existing config (P3, conditional) ─────────────────────
	if existing != nil {
		groups = append(groups,
			huh.NewGroup(
				huh.NewNote().
					Title("Existing configuration detected").
					Description("A .team-harness.json was found at the opencode config path.\nThe following prompts will pre-fill from those values if you choose to import."),
				huh.NewConfirm().
					Value(&data.importExisting).
					Title("Import existing settings as defaults?").
					Affirmative("Import").
					Negative("Start fresh"),
			).Title("Existing Config"),
		)
	}

	// ── Group 1: work-logs output ─────────────────────────────────────────────
	logsSelect := huh.NewSelect[string]().
		Value(&data.logsMode).
		Title("Work-Logs Output").
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
		Title("Vault Subfolder (optional)").
		Description("Subfolder inside the vault for work-logs (default: work-logs).").
		Placeholder("work-logs")

	groups = append(groups,
		huh.NewGroup(
			huh.NewNote().
				Title("Work-Logs Output").
				Description("Agents write pipeline workspaces (plans, implementations, test reports)\nto a location you control. Local mode uses ./workspaces/ beside each\nproject. Obsidian mode writes structured notes to a vault you specify.\nThe opencode hook plugin reads this setting to locate the pipeline state."),
			huh.NewConfirm().
				Value(&data.configureWorkLogs).
				Title("Configure work-logs output now?").
				Affirmative("Yes").
				Negative("Skip (keep default: local)"),
		).Title("Work-Logs Setup"),

		huh.NewGroup(
			logsSelect,
			vaultPathInput,
			subfolderInput,
		).Title("Work-Logs Details").
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
