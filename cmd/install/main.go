// Package main is the team-harness installer.
//
// It installs agents, skills, hooks, and registers the memory + context7 MCP
// servers in ~/.claude/ and ~/.claude.json. The Memory MCP server is an
// external service (context-harness-mcp or compatible); this installer does
// not bundle or copy any server source code.
//
// Flags:
//
//	--force   bypass preservation of existing mcpServer entries in ~/.claude.json.
//	          Has no effect on file installation — agents/skills/hooks are always
//	          overwritten unconditionally regardless of this flag.
package main

import (
	"errors"
	"fmt"
	"os"
	"runtime"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"
	"charm.land/huh/v2"
	"charm.land/huh/v2/spinner"
)

// version is injected at build time via -ldflags "-X main.version=2.0.0".
// Note: the value is the BARE semver (no leading "v"). The "v" is added by
// the printf in main(). The release workflow strips the leading "v" from
// the git tag (e.g. v2.0.1 → 2.0.1) before injecting — see release.yml.
var version = "2.44.0"

// forceFlag is preserved as a no-op for backward compatibility. The installer
// always overwrites embedded files; this flag once disabled the conflict gate,
// but the gate itself has been removed. Scripts and skills that pass --force
// keep working without modification.
var forceFlag bool

// claudeDir is ~/.claude
var claudeDir string

// claudeJSON is ~/.claude.json
var claudeJSON string

// printDeprecationBanner writes a DEPRECATED notice to stderr before any
// installer work begins. The Go installer is the legacy install path as of
// v2.33.0; the canonical path is the Claude Code plugin.
func printDeprecationBanner() {
	fmt.Fprintln(os.Stderr, "==== DEPRECATED ====")
	fmt.Fprintln(os.Stderr, "The Go installer is now the legacy install path.")
	fmt.Fprintln(os.Stderr, "Canonical install: /plugin marketplace add valianx/team-harness")
	fmt.Fprintln(os.Stderr, "                   /plugin install th && /th:setup")
	fmt.Fprintln(os.Stderr, "=====================")
}

func main() {
	parseFlags()
	printDeprecationBanner()
	resolveClaudePaths()
	resolveSettingsJSON()

	printWelcomeBanner()

	fmt.Printf("team-harness installer %s\n", colorValue("v"+version))
	fmt.Printf("  source:   %s\n", colorLabel("embedded"))
	fmt.Printf("  target:   %s\n", colorValue(claudeDir))
	fmt.Printf("  platform: %s\n", colorLabel(runtime.GOOS))
	fmt.Println()

	ensureDir(claudeDir)
	loadManifest()
	if prev := manifest.InstalledVersion; prev != "" {
		fmt.Printf("Detected previous install (version %s). Updating...\n", prev)
	} else {
		fmt.Println("Fresh install.")
	}
	fmt.Println()

	sectionHeader("Dependencies")
	checkDependencies()

	// Collect all configuration through the TUI (interactive) or env-var paths
	// (non-interactive / CI).
	context7Key, memChoice, installMode := collectConfig()

	// File installation with progress spinner.
	sectionHeader("Installing Files")
	runInstallWithSpinner(installMode)

	// Determine whether the context7 key changed for accurate summary reporting.
	existing := readExistingMCPServers()
	existingC7 := mapGet(existing, "context7")
	existingC7Key := strings.TrimSpace(mapGetString(existingC7, "headers", "CONTEXT7_API_KEY"))
	context7Preserved := context7Key == existingC7Key && isValidContext7Key(existingC7Key)

	sectionHeader("Global Config")
	ensureGlobalClaudeMD()
	registerHooks()

	fmt.Println("Registering MCP servers in ~/.claude.json...")
	backupPath := registerMCPServers(context7Key, memChoice)

	saveManifest()

	printSummary(backupPath, memChoice, context7Preserved, installMode)
	pressEnterToExit()
}

// collectConfig determines context7 key, memory MCP choice, and install mode
// from either the interactive TUI or existing env-var / config paths. It
// also populates manifest.LogsMode and related fields.
//
// Decision tree:
//  1. No interactive TTY available (CI / non-interactive) → use env-var paths
//     unchanged. Existing behaviour preserved.
//  2. All values already set via env vars → confirm with user or use silently.
//  3. Interactive TTY available → run the huh TUI form.
func collectConfig() (ctx7Key string, mem MemoryMCPChoice, mode InstallMode) {
	if !hasInteractiveInput() {
		// Non-interactive path: fall through to existing env-var + preservation logic.
		return collectConfigNonInteractive()
	}

	return collectConfigInteractive()
}

// collectConfigNonInteractive preserves the pre-TUI behaviour for CI and
// scripted installs. It calls the existing env-var / preservation helpers
// that were in prompts.go, context7.go, and workspaces.go before the TUI
// refactor. Those helpers still contain the non-interactive code paths.
func collectConfigNonInteractive() (ctx7Key string, mem MemoryMCPChoice, mode InstallMode) {
	sectionHeader("context7 Setup")
	ctx7Key = getContext7APIKey()

	sectionHeader("Memory MCP Setup")
	mem = promptMemoryMCPURL()

	sectionHeader("Install Mode")
	mode = promptInstallMode()

	sectionHeader("Work-Logs Output")
	promptLogsMode()
	fmt.Println()

	return ctx7Key, mem, mode
}

// collectConfigInteractive runs the huh TUI form to collect all configuration
// values in one go. It handles:
//   - Pre-population from existing config and manifest
//   - JSON snippet paste detection via handleJSONSnippetFallback
//   - User-abort (prints "Installation cancelled." and exits 0)
//   - Final confirm: if user picks "Cancel" the installer exits 0
func collectConfigInteractive() (ctx7Key string, mem MemoryMCPChoice, mode InstallMode) {
	// Read existing values to pre-populate the form.
	existing := readExistingMCPServers()
	existingMemory, _ := existing["memory"].(map[string]interface{})
	existingC7 := mapGet(existing, "context7")

	existingCtx7Key := strings.TrimSpace(mapGetString(existingC7, "headers", "CONTEXT7_API_KEY"))
	existingMemURL := urlFromEntry(existingMemory)
	existingMemBearer := bearerFromEntry(existingMemory)
	existingMemValid := !forceFlag && looksLikeValidMemoryEntry(existingMemory)

	existingLogsMode := manifest.LogsMode
	existingLogsPath := manifest.LogsPath

	// No persistent install mode in the manifest — default to standard for TUI
	// pre-population. Operators who want a different mode set it via INSTALL_MODE
	// or choose it interactively each time.
	const existingInstallMode = ModeStandard

	data, err := runTUIForm(
		existingCtx7Key,
		existingMemURL, existingMemBearer,
		existingMemValid,
		existingLogsMode, existingLogsPath,
		existingInstallMode,
	)
	if err != nil {
		if errors.Is(err, huh.ErrUserAborted) {
			fmt.Println("Installation cancelled.")
			os.Exit(0)
		}
		fmt.Fprintf(os.Stderr, "Error: TUI form failed: %v\n", err)
		os.Exit(1)
	}

	// User clicked "Cancel" in the confirm group.
	if !data.doInstall {
		fmt.Println("Installation cancelled.")
		os.Exit(0)
	}

	// JSON snippet fallback: if data.memURL starts with '{', the user pasted a
	// JSON snippet into the URL field. Read the remaining lines via raw scanner.
	handleJSONSnippetFallback(data)

	ctx7Key, mem, mode = applyTUIResults(
		data,
		existingCtx7Key, existingMemURL, existingMemBearer,
		existingMemValid,
	)

	// Print a brief confirmation of what was collected before file install starts.
	fmt.Printf("  context7 API key: %s\n", colorValue(safePrefix(ctx7Key, 12)+"..."))
	fmt.Printf("  Memory MCP URL:   %s\n", colorValue(mem.URL))
	fmt.Printf("  Install mode:     %s\n", colorValue(string(mode)))
	fmt.Printf("  Work-logs mode:   %s\n", colorValue(manifest.LogsMode))
	fmt.Println()

	return ctx7Key, mem, mode
}

// runInstallWithSpinner runs installAgents / installSkills / installHooks with
// a progress spinner. In accessible mode it falls back to a static message.
// In interactive mode it uses a custom bubbletea model that updates the title
// in real time as files are installed (AC-6).
func runInstallWithSpinner(mode InstallMode) {
	installProgressCount.Store(0)

	if isAccessibleMode() {
		runInstallAccessible(mode)
	} else {
		runInstallProgressSpinner(mode)
	}

	fmt.Printf("  installed: %s\n", colorValue(fmt.Sprintf("%d", len(stats.Installed))))
	fmt.Printf("  updated:   %s\n", colorValue(fmt.Sprintf("%d", len(stats.Updated))))
	fmt.Printf("  unchanged: %s\n", colorValue(fmt.Sprintf("%d", len(stats.Unchanged))))
	fmt.Println()
}

// runInstallAccessible runs the file install with a static "Installing…" line
// and no animated spinner. Used when isAccessibleMode() is true.
func runInstallAccessible(mode InstallMode) {
	s := spinner.New().
		Title("Installing files to ~/.claude/...").
		Action(func() {
			installAgents(mode)
			installSkills()
			installHooks()
		}).
		WithAccessible(true)

	if err := s.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "Error during file installation: %v\n", err)
		os.Exit(1)
	}
}

// runInstallProgressSpinner runs the file install behind a custom bubbletea
// model that shows a real-time file count in the spinner title (AC-6). The
// install goroutine sends installProgressDoneMsg to the program when done.
func runInstallProgressSpinner(mode InstallMode) {
	model := newInstallProgressModel()
	prog := tea.NewProgram(model)

	installDone := make(chan error, 1)
	go func() {
		installAgents(mode)
		installSkills()
		installHooks()
		installDone <- nil
	}()

	go func() {
		err := <-installDone
		prog.Send(installProgressDoneMsg{err: err})
	}()

	if _, err := prog.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "Error during file installation: %v\n", err)
		os.Exit(1)
	}
}

func parseFlags() {
	newArgs := make([]string, 0, len(os.Args))
	for _, a := range os.Args {
		if a == "--force" {
			forceFlag = true
		} else {
			newArgs = append(newArgs, a)
		}
	}
	os.Args = newArgs
	// --force is accepted but has no effect on file installation (always overwrites).
	// It still bypasses preservation of existing mcpServer entries in ~/.claude.json.
}

// resolveClaudePaths sets claudeDir and claudeJSON from the user's home
// directory. The repoRoot walk is intentionally removed — agents/skills/hooks
// are now embedded at compile time, so no filesystem clone is required.
func resolveClaudePaths() {
	home, _ := os.UserHomeDir()
	claudeDir = fmt.Sprintf("%s/.claude", home)
	claudeJSON = fmt.Sprintf("%s/.claude.json", home)
}

// checkDependencies checks CLI tools used by agents and skills at runtime.
// gh is recommended (graceful fallback paths exist) but not required.
func checkDependencies() {
	warnCLI("gh", "Install GitHub CLI: https://cli.github.com/")
}

// backupClaudeJSON copies ~/.claude.json to a timestamped backup.
// Returns the backup path, or "" if the source doesn't exist.
func backupClaudeJSON() string {
	if _, err := os.Stat(claudeJSON); os.IsNotExist(err) {
		return ""
	}
	timestamp := time.Now().Format("20060102-150405")
	backup := claudeJSON + ".bak-" + timestamp
	if err := copyFileRaw(claudeJSON, backup); err != nil {
		fmt.Fprintf(os.Stderr, "  [warn] could not create backup of ~/.claude.json: %v\n", err)
		return ""
	}
	return backup
}

// installAgents copies agents/*.md to ~/.claude/agents/ and recursively copies
// the agents/_shared/ subdirectory. The mode transformer is applied to top-level
// agent files only; shared snippets are copied byte-identical.
func installAgents(mode InstallMode) {
	destDir := fmt.Sprintf("%s/agents", claudeDir)
	entries, err := readEmbeddedDir("agents")
	if err != nil {
		return
	}
	for _, e := range entries {
		if shouldSkip(e.Name()) {
			continue
		}
		if e.IsDir() {
			// Recurse into subdirectories (e.g. _shared/).
			copyEmbeddedDirRecursive(
				"agents/"+e.Name(),
				fmt.Sprintf("%s/%s", destDir, e.Name()),
				"",
			)
			continue
		}
		if !strings.HasSuffix(e.Name(), ".md") {
			continue
		}
		srcPath := "agents/" + e.Name()
		dest := fmt.Sprintf("%s/%s", destDir, e.Name())
		copyAgentFile(srcPath, dest, mode)
	}
}

// installSkills copies all skill directories to ~/.claude/skills/<name>/.
// All skills use the directory format (skills/<name>/SKILL.md).
// Legacy flat .md files in skills/ are no longer shipped.
func installSkills() {
	entries, err := readEmbeddedDir("skills")
	if err != nil {
		return
	}
	for _, e := range entries {
		if e.IsDir() && !shouldSkip(e.Name()) {
			copyEmbeddedDirRecursive(
				"skills/"+e.Name(),
				fmt.Sprintf("%s/skills/%s", claudeDir, e.Name()),
				"",
			)
		}
	}
}

// installHooks copies hooks/*.sh to ~/.claude/hooks/ with executable bit.
func installHooks() {
	destDir := fmt.Sprintf("%s/hooks", claudeDir)
	copyEmbeddedDirFlat("hooks", destDir, ".sh", true)
	// config.json is not executable but is needed by the user.
	copyEmbeddedDirFlat("hooks", destDir, ".json", false)
}
