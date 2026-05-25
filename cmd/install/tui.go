package main

import (
	"fmt"
	"os"
	"strings"
	"time"

	bubblesSpinner "charm.land/bubbles/v2/spinner"
	tea "charm.land/bubbletea/v2"
	"charm.land/huh/v2"
	"charm.land/lipgloss/v2"
)

// tuiFormData collects all values across the form groups so they can be
// passed through huh via pointer bindings.
type tuiFormData struct {
	// Group 1 — context7 Setup
	ctx7KeepExisting bool   // confirm: keep the existing key?
	ctx7Key          string // new key value (used when not keeping)

	// Group 2 — Memory MCP Setup
	memKeepExisting bool   // confirm: keep the existing MCP entry?
	memURL          string // URL value entered by user
	memBearer       string // bearer token (optional, masked)

	// Group 3 — Install Options
	installMode string // "standard" or "low-cost"
	logsMode    string // "local" or "obsidian"
	logsPath    string // vault path (only when logsMode == "obsidian")

	// Group 4 — Final confirm
	doInstall bool // true → proceed, false → cancel
}

// runTUIForm presents the full huh TUI form and returns the collected values.
// It is only called when hasInteractiveInput() is true. On user-abort it returns
// huh.ErrUserAborted. On JSON-snippet detection the returned data.memURL starts
// with '{' — the caller must invoke handleJSONSnippetFallback before proceeding.
func runTUIForm(
	existingCtx7Key string,
	existingMemURL, existingMemBearer string,
	existingMemValid bool,
	existingLogsMode, existingLogsPath string,
	existingMode InstallMode,
) (*tuiFormData, error) {
	data := &tuiFormData{
		ctx7KeepExisting: isValidContext7Key(existingCtx7Key),
		ctx7Key:          existingCtx7Key,
		memKeepExisting:  existingMemValid,
		memURL:           existingMemURL,
		memBearer:        existingMemBearer,
		installMode:      string(existingMode),
		logsMode:         existingLogsMode,
		logsPath:         existingLogsPath,
		doInstall:        true,
	}
	if data.installMode == "" {
		data.installMode = string(ModeStandard)
	}
	if data.logsMode == "" {
		data.logsMode = "local"
	}

	accessible := isAccessibleMode()

	groups := buildFormGroups(data, existingCtx7Key, existingMemURL, existingMemValid)
	form := huh.NewForm(groups...).
		WithAccessible(accessible).
		WithTheme(installerTheme())

	err := form.Run()
	if err != nil {
		return nil, err
	}
	return data, nil
}

// buildFormGroups creates all form groups. Groups that are conditional (e.g.
// "new key entry" shown only on Change) use WithHideFunc so the form can skip
// them dynamically.
func buildFormGroups(
	data *tuiFormData,
	existingCtx7Key, existingMemURL string,
	existingMemValid bool,
) []*huh.Group {
	var groups []*huh.Group

	// ── Group 1a: keep/change for context7 (only when existing valid key) ─────
	if isValidContext7Key(existingCtx7Key) {
		groups = append(groups, huh.NewGroup(
			huh.NewConfirm().
				Value(&data.ctx7KeepExisting).
				Title("context7 API Key").
				Description(fmt.Sprintf("Existing key: %s... — keep it?", safePrefix(existingCtx7Key, 12))).
				Affirmative("Keep").
				Negative("Change"),
		).Title("context7 Setup"))

		// Group 1b: new key entry — hidden when user chose Keep.
		groups = append(groups, huh.NewGroup(
			ctx7KeyInputField(data),
		).Title("context7 Setup — New Key").
			WithHideFunc(func() bool { return data.ctx7KeepExisting }))
	} else {
		// No existing key: always show the input directly.
		groups = append(groups, huh.NewGroup(
			ctx7KeyInputField(data),
		).Title("context7 Setup"))
	}

	// ── Group 2a: keep/change for Memory MCP (only when existing valid entry) ──
	if existingMemValid {
		groups = append(groups, huh.NewGroup(
			huh.NewConfirm().
				Value(&data.memKeepExisting).
				Title("Memory MCP").
				Description(fmt.Sprintf("Existing URL: %s — keep it?", existingMemURL)).
				Affirmative("Keep").
				Negative("Change"),
		).Title("Memory MCP Setup"))

		// Group 2b: URL + bearer — hidden when user chose Keep.
		groups = append(groups, huh.NewGroup(
			memURLInputField(data),
			memBearerInputField(data),
		).Title("Memory MCP Setup — New Entry").
			WithHideFunc(func() bool { return data.memKeepExisting }))
	} else {
		// No existing entry: always show URL + bearer inputs.
		groups = append(groups, huh.NewGroup(
			memURLInputField(data),
			memBearerInputField(data),
		).Title("Memory MCP Setup"))
	}

	// ── Group 3: install mode + logs mode ──────────────────────────────────────
	groups = append(groups, buildInstallOptionsGroup(data))

	// ── Group 4: final summary + confirm ──────────────────────────────────────
	groups = append(groups, buildConfirmGroup(data))

	return groups
}

// ctx7KeyInputField returns the huh.Input field for the context7 API key.
func ctx7KeyInputField(data *tuiFormData) *huh.Input {
	return huh.NewInput().
		Value(&data.ctx7Key).
		Title("context7 API Key").
		Description("Get a key at https://context7.com/").
		Placeholder("ctx7sk-...").
		EchoMode(huh.EchoModePassword).
		Validate(func(v string) error {
			v = strings.TrimSpace(v)
			if v == "" {
				return fmt.Errorf("API key is required")
			}
			if !strings.HasPrefix(v, "ctx7sk-") {
				return fmt.Errorf("key must start with ctx7sk-")
			}
			if len(v) < 12 {
				return fmt.Errorf("key is too short (minimum 12 characters)")
			}
			return nil
		})
}

// memURLInputField returns the huh.Input field for the Memory MCP URL.
// When the entered value starts with '{', errJSONSnippetDetected is returned
// by the Validate function. The form treats this as a validation error but the
// caller can inspect data.memURL after Run() to detect the sentinel prefix and
// invoke handleJSONSnippetFallback.
func memURLInputField(data *tuiFormData) *huh.Input {
	return huh.NewInput().
		Value(&data.memURL).
		Title("Memory MCP URL").
		Description("Paste the bare URL (https://...) OR the full JSON snippet from your /dashboard (starts with '{').").
		Placeholder("https://your-mcp.example.com/mcp").
		Validate(func(v string) error {
			v = strings.TrimSpace(v)
			if v == "" {
				return fmt.Errorf("URL is required — no default URL exists")
			}
			// JSON snippet paste: treat as a passing state to allow form to advance;
			// the actual extraction happens via handleJSONSnippetFallback after Run().
			if strings.HasPrefix(v, "{") {
				return nil
			}
			return validateMCPURL(v)
		})
}

// memBearerInputField returns the huh.Input field for the optional bearer token.
func memBearerInputField(data *tuiFormData) *huh.Input {
	return huh.NewInput().
		Value(&data.memBearer).
		Title("Memory MCP Bearer Token (optional)").
		Description("Leave blank for unauthenticated MCPs. For context-harness-mcp, generate a JWT at <base-url>/dashboard.").
		Placeholder("(leave blank for no auth)").
		EchoMode(huh.EchoModePassword)
}

// buildInstallOptionsGroup constructs Group 3: install mode and logs mode.
// The vault path input is shown only when logs mode is "obsidian".
func buildInstallOptionsGroup(data *tuiFormData) *huh.Group {
	modeSelect := huh.NewSelect[string]().
		Value(&data.installMode).
		Title("Install Mode").
		Options(
			huh.NewOption("Standard — canonical quality. Best for Anthropic Max or Team plans.", string(ModeStandard)),
			huh.NewOption("Low-cost — sonnet matrix. Lower API cost; accepts quality trade-offs.", string(ModeLowCost)),
		)

	logsSelect := huh.NewSelect[string]().
		Value(&data.logsMode).
		Title("Work-Logs Output").
		Options(
			huh.NewOption("Local — ./session-docs/{date}_{feature}/ relative to each project.", "local"),
			huh.NewOption("Obsidian — writes to work-logs/ in an Obsidian vault with metadata.", "obsidian"),
		)

	vaultInput := huh.NewInput().
		Value(&data.logsPath).
		Title("Obsidian Vault Path").
		Description("Absolute path to your vault (the folder that contains .obsidian/).").
		Placeholder("/home/you/my-vault").
		Validate(func(v string) error {
			// Only validate when obsidian mode is actually selected.
			if data.logsMode != "obsidian" {
				return nil
			}
			if strings.TrimSpace(v) == "" {
				return fmt.Errorf("vault path is required when Obsidian mode is selected")
			}
			return nil
		})

	return huh.NewGroup(modeSelect, logsSelect, vaultInput).Title("Install Options")
}

// buildConfirmGroup constructs Group 4: dynamic value summary + final install/cancel confirm.
// The summary note reflects the actual values collected in data so the operator can
// review every chosen setting before committing to the install.
func buildConfirmGroup(data *tuiFormData) *huh.Group {
	noteField := huh.NewNote().
		Title("Ready to Install").
		DescriptionFunc(func() string { return buildSummaryContent(data) }, data)

	confirmField := huh.NewConfirm().
		Value(&data.doInstall).
		Title("Proceed with installation?").
		Affirmative("Install").
		Negative("Cancel")

	return huh.NewGroup(noteField, confirmField).Title("Confirm")
}

// buildSummaryContent renders a lipgloss-styled multi-line summary of all values
// collected in data. It is called by the DescriptionFunc of the summary note so
// it reflects live form state — if earlier groups were revisited and changed, the
// summary always shows the current value.
func buildSummaryContent(data *tuiFormData) string {
	label := lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#7B4EA3"))
	value := lipgloss.NewStyle().Foreground(lipgloss.Color("#2E7D32"))
	muted := lipgloss.NewStyle().Foreground(lipgloss.Color("#888888"))

	var sb strings.Builder

	// context7 key
	ctx7Display := data.ctx7Key
	if strings.TrimSpace(ctx7Display) == "" {
		ctx7Display = "(not set)"
	} else {
		ctx7Display = safePrefix(strings.TrimSpace(ctx7Display), 12) + "..."
	}
	sb.WriteString(label.Render("context7 key:  "))
	sb.WriteString(value.Render(ctx7Display))
	sb.WriteString("\n")

	// Memory MCP URL
	memDisplay := strings.TrimSpace(data.memURL)
	if memDisplay == "" {
		memDisplay = "(not set)"
	}
	sb.WriteString(label.Render("Memory URL:    "))
	sb.WriteString(value.Render(memDisplay))
	sb.WriteString("\n")

	// Bearer token presence
	bearerDisplay := "none"
	if strings.TrimSpace(data.memBearer) != "" {
		bearerDisplay = "(provided)"
	}
	sb.WriteString(label.Render("Bearer token:  "))
	sb.WriteString(muted.Render(bearerDisplay))
	sb.WriteString("\n")

	// Install mode
	modeDisplay := data.installMode
	if modeDisplay == "" {
		modeDisplay = string(ModeStandard)
	}
	sb.WriteString(label.Render("Install mode:  "))
	sb.WriteString(value.Render(modeDisplay))
	sb.WriteString("\n")

	// Logs mode + optional vault path
	sb.WriteString(label.Render("Logs mode:     "))
	sb.WriteString(value.Render(data.logsMode))
	sb.WriteString("\n")
	if data.logsMode == "obsidian" {
		vaultDisplay := strings.TrimSpace(data.logsPath)
		if vaultDisplay == "" {
			vaultDisplay = "(not set)"
		}
		sb.WriteString(label.Render("Vault path:    "))
		sb.WriteString(value.Render(vaultDisplay))
		sb.WriteString("\n")
	}

	sb.WriteString("\n")
	sb.WriteString(muted.Render("Files → ~/.claude/   Config → ~/.claude.json (backup created)"))

	return sb.String()
}

// applyTUIResults converts a completed tuiFormData into the concrete types
// consumed by the install flow. It also writes logs-mode values directly into
// the global manifest (consistent with the existing promptLogsMode* functions).
func applyTUIResults(
	data *tuiFormData,
	existingCtx7Key, existingMemURL, existingMemBearer string,
	existingMemValid bool,
) (ctx7Key string, mem MemoryMCPChoice, mode InstallMode) {
	// context7 key.
	if isValidContext7Key(existingCtx7Key) && data.ctx7KeepExisting {
		ctx7Key = existingCtx7Key
	} else {
		ctx7Key = strings.TrimSpace(data.ctx7Key)
	}

	// Memory MCP.
	if existingMemValid && data.memKeepExisting {
		mem = MemoryMCPChoice{
			URL:         existingMemURL,
			BearerToken: existingMemBearer,
			Preserved:   true,
		}
	} else {
		mem = MemoryMCPChoice{
			URL:         strings.TrimSpace(data.memURL),
			BearerToken: strings.TrimSpace(data.memBearer),
		}
	}

	// Install mode.
	if data.installMode == string(ModeLowCost) {
		mode = ModeLowCost
	} else {
		mode = ModeStandard
	}

	// Logs mode — written directly to global manifest.
	manifest.LogsMode = data.logsMode
	switch data.logsMode {
	case "obsidian":
		manifest.LogsPath = strings.TrimSpace(data.logsPath)
		manifest.LogsSubfolder = "work-logs"
	default:
		manifest.LogsPath = ""
		manifest.LogsSubfolder = ""
	}

	return ctx7Key, mem, mode
}

// handleJSONSnippetFallback is called when data.memURL starts with '{' after the
// form exits. It opens a raw scanner on the interactive TTY and calls the existing
// parseSnippetPaste function to assemble and parse the multi-line JSON. On success
// it updates data.memURL and data.memBearer. On failure it exits 1.
//
// This is safe to call after huh.Run() because bubbletea has released the TTY by
// the time Run() returns.
func handleJSONSnippetFallback(data *tuiFormData) {
	raw := data.memURL
	if !strings.HasPrefix(strings.TrimSpace(raw), "{") {
		return
	}

	input := openInteractiveInput()
	if input == nil {
		fmt.Fprintln(os.Stderr, "Error: JSON snippet detected but no interactive input available to read remaining lines.")
		os.Exit(1)
	}
	defer input.Close()

	choice := parseSnippetPaste(strings.TrimSpace(raw), newScanner(input))
	data.memURL = choice.URL
	data.memBearer = choice.BearerToken
}

// isAccessibleMode returns true when the TUI should fall back to the accessible
// (plain-prompt) rendering mode. Triggers:
//   - ACCESSIBLE env var is set (explicit opt-in)
//   - Windows legacy cmd.exe without ConPTY (no WT_SESSION, no TERM_PROGRAM, no TERM)
func isAccessibleMode() bool {
	if os.Getenv("ACCESSIBLE") != "" {
		return true
	}
	if isWindowsRuntime() &&
		os.Getenv("WT_SESSION") == "" &&
		os.Getenv("TERM_PROGRAM") == "" &&
		os.Getenv("TERM") == "" {
		return true
	}
	return false
}

// ── Progress spinner model (AC-6) ────────────────────────────────────────────

// installProgressTickMsg is sent on every poll interval to refresh the spinner
// title with the latest file count from installProgressCount.
type installProgressTickMsg struct{}

// installProgressDoneMsg is sent by the install goroutine when all files are
// processed. The model quits the tea program on receipt.
type installProgressDoneMsg struct{ err error }

// installProgressModel is a bubbletea model (tea.Model) that renders a
// spinner with a real-time file count title. It polls the atomic
// installProgressCount counter every pollInterval to update its display.
type installProgressModel struct {
	spinner      bubblesSpinner.Model
	title        string
	done         bool
	err          error
	pollInterval time.Duration
}

const spinnerPollInterval = 80 * time.Millisecond

func newInstallProgressModel() installProgressModel {
	s := bubblesSpinner.New(bubblesSpinner.WithSpinner(bubblesSpinner.Dot))
	s.Style = lipgloss.NewStyle().Foreground(lipgloss.Color("#FF8C00"))
	return installProgressModel{
		spinner:      s,
		title:        "Installing files... 0",
		pollInterval: spinnerPollInterval,
	}
}

// Init starts the spinner tick and the first poll command.
func (m installProgressModel) Init() tea.Cmd {
	return tea.Batch(m.spinner.Tick, installProgressPollCmd(m.pollInterval))
}

// installProgressPollCmd returns a command that fires after d to poll the
// progress counter. Using tea.Tick (not Every) means we schedule one tick at
// a time — no accumulated backlog if the model is slow.
func installProgressPollCmd(d time.Duration) tea.Cmd {
	return tea.Tick(d, func(_ time.Time) tea.Msg {
		return installProgressTickMsg{}
	})
}

// Update processes spinner ticks, poll ticks, and done/error messages.
// It satisfies the tea.Model interface (returns tea.Model, not compat.Model).
func (m installProgressModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case bubblesSpinner.TickMsg:
		var cmd tea.Cmd
		m.spinner, cmd = m.spinner.Update(msg)
		return m, cmd

	case installProgressTickMsg:
		count := installProgressCount.Load()
		m.title = fmt.Sprintf("Installing files... %d", count)
		return m, installProgressPollCmd(m.pollInterval)

	case installProgressDoneMsg:
		m.done = true
		m.err = msg.err
		return m, tea.Quit
	}
	return m, nil
}

// View renders the spinner frame followed by the current title.
// It satisfies the tea.Model interface by returning tea.View.
func (m installProgressModel) View() tea.View {
	if m.done {
		return tea.NewView("")
	}
	titleStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("#FFFDF5"))
	content := m.spinner.View() + titleStyle.Render(m.title)
	return tea.NewView(content)
}
