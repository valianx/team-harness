package main

import (
	"fmt"
	"os"
	"strings"
)

// runtimeFlag holds the --runtime flag value (default: claude-code).
var runtimeFlag = "claude-code"

// scopeFlag holds the --scope flag value (default: global).
var scopeFlag = "global"

// opencodeDirFlag holds the --opencode-dir flag value (default: "", uses scope).
var opencodeDirFlag = ""

// memoryURLFlag holds the --memory-url flag value (default: "", falls back to MEMORY_MCP_URL env).
var memoryURLFlag = ""

// nonInteractiveFlag holds the --non-interactive / --yes flag value.
// When true, the opencode apply path skips the interactive form even when a
// TTY is present, resolving configuration from env/flags only. This closes
// the "tty present, no human" hang class (SEC-DR-7).
var nonInteractiveFlag = false

// dispatchSubcommand checks os.Args for a plan|apply|uninstall subcommand and
// runs it. Returns true if a subcommand was handled (caller should not run the
// legacy interactive install). Returns false if no subcommand matched.
//
// The no-arg path is the existing interactive install, unchanged.
func dispatchSubcommand() bool {
	if len(os.Args) < 2 {
		return false
	}

	// Parse global flags before the subcommand name.
	// Flags may appear as --flag=value or --flag value.
	args := os.Args[1:]
	args = parseDispatchFlags(args)

	if len(args) == 0 {
		return false
	}

	switch args[0] {
	case "plan":
		runPlanCommand()
		return true
	case "apply":
		runApplyCommand()
		return true
	case "uninstall":
		runUninstallCommand()
		return true
	default:
		return false
	}
}

// parseDispatchFlags extracts --runtime, --scope, and --opencode-dir flags from
// args (which may precede or follow the subcommand name). Returns the remaining
// args with flags consumed.
//
// --runtime is FIRST-WINS: once set by an earlier occurrence, a later
// --runtime is ignored with a stderr warning. This makes the pin in
// bin/install-opencode.sh ("--runtime opencode") authoritative — an
// operator-supplied extra "--runtime claude-code" cannot silently override it.
// --scope and --opencode-dir remain last-wins (operators legitimately override
// these via "$@").
func parseDispatchFlags(args []string) []string {
	var remaining []string
	i := 0
	for i < len(args) {
		arg := args[i]
		switch {
		case arg == "--runtime" && i+1 < len(args):
			if runtimeFlag != "claude-code" {
				// Already set by an earlier occurrence — first-wins for --runtime.
				fmt.Fprintf(os.Stderr, "Warning: --runtime already set to %q; ignoring later --runtime %q\n", runtimeFlag, args[i+1])
			} else {
				runtimeFlag = args[i+1]
			}
			i += 2
		case strings.HasPrefix(arg, "--runtime="):
			val := strings.TrimPrefix(arg, "--runtime=")
			if runtimeFlag != "claude-code" {
				// Already set by an earlier occurrence — first-wins for --runtime.
				fmt.Fprintf(os.Stderr, "Warning: --runtime already set to %q; ignoring later --runtime=%q\n", runtimeFlag, val)
			} else {
				runtimeFlag = val
			}
			i++
		case arg == "--scope" && i+1 < len(args):
			scopeFlag = args[i+1]
			i += 2
		case strings.HasPrefix(arg, "--scope="):
			scopeFlag = strings.TrimPrefix(arg, "--scope=")
			i++
		case arg == "--opencode-dir" && i+1 < len(args):
			opencodeDirFlag = args[i+1]
			i += 2
		case strings.HasPrefix(arg, "--opencode-dir="):
			opencodeDirFlag = strings.TrimPrefix(arg, "--opencode-dir=")
			i++
		case arg == "--memory-url" && i+1 < len(args):
			memoryURLFlag = args[i+1]
			i += 2
		case strings.HasPrefix(arg, "--memory-url="):
			memoryURLFlag = strings.TrimPrefix(arg, "--memory-url=")
			i++
		case arg == "--non-interactive", arg == "--yes":
			// Both forms are accepted as aliases (SEC-DR-7).
			nonInteractiveFlag = true
			i++
		default:
			remaining = append(remaining, arg)
			i++
		}
	}
	return remaining
}

// selectPlacer returns the Placer for the configured runtime and scope.
func selectPlacer() (Placer, error) {
	switch runtimeFlag {
	case "claude-code", "":
		return newClaudeCodePlacer(), nil
	case "opencode":
		return newOpencodePlacer(scopeFlag, opencodeDirFlag)
	default:
		return nil, fmt.Errorf("unrecognized runtime %q (want claude-code|opencode)", runtimeFlag)
	}
}

// selectTransform returns the transform function for the configured runtime.
// The function signature matches ComputePlan's transform parameter:
// func(src, kind, sourcePath) ([]byte, error).
func selectTransform() func([]byte, string, string) ([]byte, error) {
	if runtimeFlag == "opencode" {
		return opencodeRuntimeTransform
	}
	// claude-code: identity (nil is treated as identity by ComputePlan).
	return nil
}

// selectLedgerFilename returns the runtime-scoped ledger filename.
// This prevents a claude-code uninstall from removing opencode files.
func selectLedgerFilename() string {
	if runtimeFlag == "opencode" {
		return ledgerFilenameOpencode
	}
	return ledgerFilename
}

// runPlanCommand runs the manifest plan (dry-run) subcommand.
// Exits non-zero on error.
func runPlanCommand() {
	placer, err := selectPlacer()
	if err != nil {
		fmt.Fprintf(os.Stderr, "plan: %v\n", err)
		os.Exit(1)
	}

	// Set the runtime-scoped ledger before any ledger I/O.
	setActiveLedgerFilename(selectLedgerFilename())

	modules, components, err := loadDefaultManifests(runtimeFlag)
	if err != nil {
		fmt.Fprintf(os.Stderr, "plan: load manifests: %v\n", err)
		os.Exit(1)
	}

	selected := allComponentIDs(components)
	diff, err := ComputePlan(modules, components, selected, placer, EmbeddedAssets(), selectTransform())
	if err != nil {
		fmt.Fprintf(os.Stderr, "plan: compute: %v\n", err)
		os.Exit(1)
	}

	PrintPlan(diff, os.Stdout)
}

// runApplyCommand runs the manifest apply subcommand.
// Exits non-zero on error.
func runApplyCommand() {
	// Show the welcome banner at the top of the apply output (Fix 2).
	// The dispatch path returns before main():70, so the banner would otherwise
	// be skipped entirely for opencode installs.
	printWelcomeBanner()

	placer, err := selectPlacer()
	if err != nil {
		fmt.Fprintf(os.Stderr, "apply: %v\n", err)
		os.Exit(1)
	}

	// Set the runtime-scoped ledger before any ledger I/O.
	setActiveLedgerFilename(selectLedgerFilename())

	modules, components, err := loadDefaultManifests(runtimeFlag)
	if err != nil {
		fmt.Fprintf(os.Stderr, "apply: load manifests: %v\n", err)
		os.Exit(1)
	}

	selected := allComponentIDs(components)
	diff, err := ComputePlan(modules, components, selected, placer, EmbeddedAssets(), selectTransform())
	if err != nil {
		fmt.Fprintf(os.Stderr, "apply: compute plan: %v\n", err)
		os.Exit(1)
	}

	if err := ApplyPlan(diff, placer); err != nil {
		fmt.Fprintf(os.Stderr, "apply: execute: %v\n", err)
		os.Exit(1)
	}

	// For the opencode runtime: run the full setup flow (interactive or
	// env/flags), write .team-harness.json, and register MCP servers.
	if runtimeFlag == "opencode" {
		opencodePlacer, ok := placer.(*opencodePlacer)
		if !ok {
			fmt.Fprintln(os.Stderr, "apply: internal error: opencode runtime has unexpected placer type")
			os.Exit(1)
		}
		runOpencodePostApply(&diff, opencodePlacer)
		return
	}

	fmt.Printf("apply: done (created %d, updated %d, skipped %d, removed %d)\n",
		len(diff.ToCreate), len(diff.ToUpdate), len(diff.ToSkipHashMatch), len(diff.ToRemove))
}

// runOpencodePostApply handles the opencode-specific post-apply flow:
//  1. Determine whether to run the interactive form or the env/flags path.
//  2. Collect opencode setup values.
//  3. Write .team-harness.json (allowlisted merge-preserving).
//  4. Register MCP servers in opencode.json.
//  5. Print the explanatory apply summary.
func runOpencodePostApply(diff *PlanDiff, placer *opencodePlacer) {
	cfgPath := opencodeSettingsConfigPath(placer.ConfigRoot())

	// Gate: interactive ONLY when a real TTY is present AND --non-interactive
	// is NOT set. The nonInteractiveFlag closes the "tty present, no human"
	// hang class (#378 by another door — SEC-DR-7).
	interactive := !nonInteractiveFlag && hasInteractiveInput()

	var cfg opencodeSetupValues
	if interactive {
		// P3: detect pre-existing config and ask before reusing.
		existing := detectExistingConfig(cfgPath)
		var existingStrings map[string]string
		if existing != nil {
			existingStrings = map[string]string{
				"logs-mode":      extractStringFromRaw(existing, "logs-mode"),
				"logs-path":      extractStringFromRaw(existing, "logs-path"),
				"logs-subfolder": extractStringFromRaw(existing, "logs-subfolder"),
				"language":       extractStringFromRaw(existing, "language"),
			}
		}
		cfg = collectOpencodeSetupInteractive(existingStrings)
	} else {
		cfg = resolveOpencodeSetupFromEnvFlags()
	}

	// Write the .team-harness.json through the hardened write path (SEC-OC-R2).
	if err := writeOpencodeTeamHarnessConfig(cfgPath, cfg, placer); err != nil {
		fmt.Fprintf(os.Stderr, "apply: write .team-harness.json: %v\n", err)
		os.Exit(1)
	}

	// Register MCP servers in opencode.json.
	registerOpencodeMCPFromValues(cfg.MCP, placer.SettingsDocPath())

	// Print the explanatory summary.
	printOpencodeApplySummary(diff, cfg, cfgPath, placer.ConfigRoot())
}

// resolveOpencodeSetupFromEnvFlags builds opencodeSetupValues from environment
// variables and flags only, with sensible defaults. This is the non-interactive
// path: no prompts, no blocking, no /dev/tty access.
func resolveOpencodeSetupFromEnvFlags() opencodeSetupValues {
	cfg := opencodeSetupValues{}

	// Work-logs mode from LOGS_MODE env (default: local).
	logsMode := strings.TrimSpace(os.Getenv("LOGS_MODE"))
	if logsMode == "" {
		logsMode = "local"
	}
	cfg.LogsMode = logsMode
	if logsMode == "obsidian" {
		cfg.LogsPath = strings.TrimSpace(os.Getenv("LOGS_PATH"))
		cfg.LogsSubfolder = strings.TrimSpace(os.Getenv("LOGS_SUBFOLDER"))
		if cfg.LogsSubfolder == "" {
			cfg.LogsSubfolder = "work-logs"
		}
	}

	// Language from LANGUAGE env (optional).
	cfg.Language = strings.TrimSpace(os.Getenv("LANGUAGE"))
	// Strip locale variants (e.g. "es_MX" → "es").
	if idx := strings.IndexByte(cfg.Language, '_'); idx >= 0 {
		cfg.Language = cfg.Language[:idx]
	}
	if len(cfg.Language) != 2 {
		cfg.Language = "" // only accept clean ISO 639-1
	}

	// Memory MCP from flag / env.
	memURL := resolveOpencodeMemoryURL()
	cfg.MCP.MemoryURL = memURL
	if memURL != "" {
		cfg.MCP.MemoryRequiresAuth = strings.TrimSpace(os.Getenv("MEMORY_MCP_BEARER")) != ""
	}

	// context7 from env.
	cfg.MCP.Context7Enabled = strings.TrimSpace(os.Getenv("CONTEXT7_API_KEY")) != ""

	return cfg
}

// registerOpencodeMCPFromValues registers MCP servers in opencode.json using
// the values from an opencodeSetupValues struct. This is the refactored sink
// that accepts an explicit struct rather than reading from global env/flags.
//
// Contract (unchanged from the former registerOpencodeMCPIfConfigured):
//   - Memory MCP: registered when mcp.MemoryURL is non-empty. A provided-but-
//     invalid URL exits non-zero (provided-but-invalid is always an error).
//     If absent: skipped with a one-line note; no os.Exit.
//   - context7: registered when mcp.Context7Enabled is true.
//     If absent: skipped with a one-line note; no os.Exit.
//   - A non-blocking warning is printed when the bearer is unset (opencode
//     resolves {env:MEMORY_MCP_BEARER} at runtime).
//   - Summary: names only, never URL values or secret values (SEC-OC-R5).
func registerOpencodeMCPFromValues(mcp opencodeMCPValues, settingsDocPath string) {
	const context7URL = "https://mcp.context7.com/mcp"

	memRegistered := false
	ctx7Registered := false

	if mcp.MemoryURL != "" {
		// URL was provided — validate scheme; exit on bad value.
		if err := validateMCPURL(mcp.MemoryURL); err != nil {
			fmt.Fprintf(os.Stderr, "Error: Memory MCP URL is invalid: %s\n", err)
			os.Exit(1)
		}
		memRegistered = true

		// Non-blocking warning when the bearer env var is unset at install time.
		// opencode resolves {env:MEMORY_MCP_BEARER} at runtime.
		if strings.TrimSpace(os.Getenv("MEMORY_MCP_BEARER")) == "" {
			fmt.Fprintln(os.Stderr, "Warning: MEMORY_MCP_BEARER is not set. opencode will send an empty Authorization header to the Memory MCP until you export MEMORY_MCP_BEARER in your shell.")
		}
	} else {
		fmt.Fprintln(os.Stderr, "Memory MCP not configured. To register later: re-run the install with MEMORY_MCP_URL set, or edit opencode.json directly.")
	}

	if mcp.Context7Enabled {
		ctx7Registered = true
	} else {
		fmt.Fprintln(os.Stderr, "context7 not configured. To register later: export CONTEXT7_API_KEY and re-run the install, or edit opencode.json directly.")
	}

	// Register whichever servers are configured in a single opencode.json write.
	if memRegistered || ctx7Registered {
		ctx7URL := ""
		if ctx7Registered {
			ctx7URL = context7URL
		}
		if err := registerOpencodeMCP(mcp.MemoryURL, ctx7URL, settingsDocPath); err != nil {
			fmt.Fprintf(os.Stderr, "apply: opencode.json MCP registration: %v\n", err)
			os.Exit(1)
		}
	}
}

// resolveOpencodeMemoryURL returns the Memory MCP URL from --memory-url flag or
// MEMORY_MCP_URL env (trimmed). Returns an empty string when neither is set —
// the caller decides whether absence is an error (skip-if-absent for optional
// registration; error for explicit --memory-url with invalid value).
func resolveOpencodeMemoryURL() string {
	if memoryURLFlag != "" {
		return strings.TrimSpace(memoryURLFlag)
	}
	return strings.TrimSpace(os.Getenv("MEMORY_MCP_URL"))
}

// printOpencodeApplySummary prints the explanatory post-apply summary for the
// opencode runtime. The summary describes what was placed, what was written to
// config, and MCP status — using names only, never echoing URL values or
// secrets (SEC-OC-R5).
//
// Keys with no live opencode reader today (language, english_learning, clickup,
// obsidian_tasks) are described as "written to config" to avoid overstating
// enforcement. The keys WITH a live reader (logs-mode/logs-path/logs-subfolder
// via checkpoint-guard; prepublish_check via prepublish-guard) are described
// as "read by the opencode hook plugin".
func printOpencodeApplySummary(diff *PlanDiff, cfg opencodeSetupValues, cfgPath, configRoot string) {
	created := len(diff.ToCreate)
	updated := len(diff.ToUpdate)
	skipped := len(diff.ToSkipHashMatch)
	removed := len(diff.ToRemove)

	fmt.Println("apply: done — opencode runtime")
	fmt.Printf("  Components placed (created %d, updated %d, skipped %d, removed %d):\n",
		created, updated, skipped, removed)
	fmt.Printf("    agents  → %s/agents/\n", configRoot)
	fmt.Printf("    plugin  → %s/plugins/\n", configRoot)
	fmt.Println()
	fmt.Printf("  Settings written → %s\n", cfgPath)

	// Work-logs (has a live opencode reader via checkpoint-guard).
	switch cfg.LogsMode {
	case "obsidian":
		fmt.Printf("    work-logs        → obsidian → %s\n", cfg.LogsPath)
		fmt.Printf("                       (read by the opencode hook plugin; agents write pipeline workspaces here)\n")
	default:
		fmt.Printf("    work-logs        → local\n")
		fmt.Printf("                       (read by the opencode hook plugin; agents write pipeline workspaces here)\n")
	}

	// Language (no live opencode reader yet — written forward-compatibly).
	if cfg.Language != "" {
		fmt.Printf("    language         → %s (written to config; runtime enforcement on opencode is a tracked follow-up)\n", cfg.Language)
	} else {
		fmt.Printf("    language         → (not set)\n")
	}

	// English learning (no live opencode reader yet).
	if cfg.EnglishLearning {
		fmt.Printf("    english-learning → enabled (written to config; runtime enforcement on opencode is a tracked follow-up)\n")
	} else {
		fmt.Printf("    english-learning → off\n")
	}

	// ClickUp (no live opencode reader yet).
	if cfg.ClickUpWorkspaceID != "" {
		fmt.Printf("    clickup          → configured (written to config)\n")
	} else {
		fmt.Printf("    clickup          → (not configured)\n")
	}

	// Obsidian tasks (no live opencode reader yet).
	if cfg.ObsidianTasksEnabled {
		fmt.Printf("    obsidian-tasks   → enabled (written to config)\n")
	} else {
		fmt.Printf("    obsidian-tasks   → (not enabled)\n")
	}

	// MCP status — names only, never values (SEC-OC-R5).
	fmt.Println()
	fmt.Println("  MCP servers (opencode.json):")
	if cfg.MCP.MemoryURL != "" {
		if cfg.MCP.MemoryRequiresAuth {
			fmt.Println("    memory    → registered  (bearer resolved at runtime from {env:MEMORY_MCP_BEARER} — export it in your shell)")
		} else {
			fmt.Println("    memory    → registered")
		}
	} else {
		fmt.Println("    memory    → skipped     (set MEMORY_MCP_URL and re-run to register)")
	}

	if cfg.MCP.Context7Enabled {
		fmt.Println("    context7  → registered  (API key resolved at runtime from {env:CONTEXT7_API_KEY} — export it in your shell)")
	} else {
		fmt.Println("    context7  → skipped     (export CONTEXT7_API_KEY and re-run to register)")
	}

	fmt.Println()
	fmt.Println("  Update later: re-run the install link, or type /th-update inside opencode.")
}

// runUninstallCommand runs the manifest uninstall subcommand.
// Exits non-zero on error.
func runUninstallCommand() {
	placer, err := selectPlacer()
	if err != nil {
		fmt.Fprintf(os.Stderr, "uninstall: %v\n", err)
		os.Exit(1)
	}

	// Set the runtime-scoped ledger before any ledger I/O.
	setActiveLedgerFilename(selectLedgerFilename())

	_, components, err := loadDefaultManifests(runtimeFlag)
	if err != nil {
		fmt.Fprintf(os.Stderr, "uninstall: load manifests: %v\n", err)
		os.Exit(1)
	}

	selected := allComponentIDs(components)
	report, err := Uninstall(selected, placer)
	if err != nil {
		fmt.Fprintf(os.Stderr, "uninstall: %v\n", err)
		os.Exit(1)
	}

	if report.LedgerIntegrityWarning != "" {
		fmt.Fprintln(os.Stderr, "uninstall:", report.LedgerIntegrityWarning)
		os.Exit(1)
	}

	for _, comp := range report.Removed {
		for _, f := range comp.FilesRemoved {
			fmt.Printf("  removed file: %s\n", f)
		}
		for _, k := range comp.KeysRemoved {
			fmt.Printf("  removed key:  %s\n", k)
		}
	}
	for _, ic := range report.IncompleteComponents {
		fmt.Fprintf(os.Stderr, "  incomplete: %s — %s\n", ic.Component, ic.Err)
	}

	fmt.Printf("uninstall: done (%d components, %d incomplete)\n",
		len(report.Removed), len(report.IncompleteComponents))
}

// loadDefaultManifests returns the manifest set for the given runtime.
// For claude-code, the existing engine behavior is preserved (empty manifests,
// exercised via tests). For opencode, returns the real component set AND
// validates it against the schema/SEC-05 gates before returning (F3 — the
// production apply path always runs validateManifests so a malformed component
// fails loudly at install time rather than silently mis-emitting later).
func loadDefaultManifests(runtime string) ([]ModuleManifest, []ComponentManifest, error) {
	if runtime == "opencode" {
		modules, components, err := buildOpencodeManifests()
		if err != nil {
			return nil, nil, err
		}
		if err := validateManifests(modules, components, EmbeddedAssets()); err != nil {
			return nil, nil, fmt.Errorf("opencode manifest validation: %w", err)
		}
		return modules, components, nil
	}
	// claude-code: empty manifests (existing behavior — engine exercised via tests).
	return nil, nil, nil
}

// allComponentIDs returns the component ids from the given slice.
func allComponentIDs(components []ComponentManifest) []string {
	ids := make([]string, 0, len(components))
	for _, c := range components {
		ids = append(ids, c.Component)
	}
	return ids
}
