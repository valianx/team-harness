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

	// For opencode runtime, optionally register MCP servers in opencode.json.
	// Both Memory MCP URL and context7 key are optional — assets are installed
	// regardless. Skip-if-absent; no os.Exit when neither is supplied.
	if runtimeFlag == "opencode" {
		registerOpencodeMCPIfConfigured(placer.SettingsDocPath())
	}

	fmt.Printf("apply: done (created %d, updated %d, skipped %d, removed %d)\n",
		len(diff.ToCreate), len(diff.ToUpdate), len(diff.ToSkipHashMatch), len(diff.ToRemove))

	// For the opencode runtime, remind the operator how to update later.
	// The Claude Code path uses /th:update via the plugin marketplace; opencode
	// has no plugin marketplace — re-running the install link is the only update
	// mechanism, and /th-update in opencode triggers the same instruction.
	if runtimeFlag == "opencode" {
		fmt.Println("To update later, re-run: curl -fsSL https://valianx.github.io/team-harness/install-opencode.sh | bash (or type /th-update in opencode).")
	}
}

// registerOpencodeMCPIfConfigured registers MCP servers in opencode.json when
// the corresponding credentials are present. Both entries are optional:
//
//   - Memory MCP: registered when --memory-url flag or MEMORY_MCP_URL env is set.
//     If the value fails scheme validation (non-http/https), the install exits
//     non-zero — a provided-but-invalid URL is always an error.
//     If absent: skipped with a one-line note; no exit.
//
//   - context7: registered when CONTEXT7_API_KEY env is set.
//     If absent: skipped with a one-line note; no exit.
//
// A summary line lists which servers were registered vs skipped (names only,
// never values).
func registerOpencodeMCPIfConfigured(settingsDocPath string) {
	memURL := resolveOpencodeMemoryURL()
	ctx7Present := strings.TrimSpace(os.Getenv("CONTEXT7_API_KEY")) != ""

	const context7URL = "https://mcp.context7.com/mcp"

	memRegistered := false
	ctx7Registered := false

	if memURL != "" {
		// URL was provided — validate scheme; exit on bad value.
		if err := validateMCPURL(memURL); err != nil {
			fmt.Fprintf(os.Stderr, "Error: MEMORY_MCP_URL=%q is invalid: %s\n", memURL, err)
			os.Exit(1)
		}
		memRegistered = true

		// Non-blocking warning when the bearer is unset at install time.
		// opencode resolves {env:MEMORY_MCP_BEARER} at runtime.
		if strings.TrimSpace(os.Getenv("MEMORY_MCP_BEARER")) == "" {
			fmt.Fprintln(os.Stderr, "Warning: MEMORY_MCP_BEARER is not set. opencode will send an empty Authorization header to the Memory MCP until you export MEMORY_MCP_BEARER in your shell.")
		}
	} else {
		fmt.Fprintln(os.Stderr, "Memory MCP not configured (MEMORY_MCP_URL not set). To register later: re-run with MEMORY_MCP_URL=<url> --memory-url <url>, or edit opencode.json directly.")
	}

	if ctx7Present {
		ctx7Registered = true
	} else {
		fmt.Fprintln(os.Stderr, "context7 not configured (CONTEXT7_API_KEY not set). To register later: re-run with CONTEXT7_API_KEY=<key> set, or edit opencode.json directly.")
	}

	// Register whichever servers are configured in a single opencode.json write.
	// registerOpencodeMCP skips an entry when its URL is empty (buildOpencodeMemoryEntry
	// returns nil for empty URL; buildOpencodeContext7Entry is guarded below).
	if memRegistered || ctx7Registered {
		ctx7URL := ""
		if ctx7Registered {
			ctx7URL = context7URL
		}
		if err := registerOpencodeMCP(memURL, ctx7URL, settingsDocPath); err != nil {
			fmt.Fprintf(os.Stderr, "apply: opencode.json MCP registration: %v\n", err)
			os.Exit(1)
		}
	}

	// Summary: names only, never values.
	switch {
	case memRegistered && ctx7Registered:
		fmt.Println("apply: MCP registered: memory, context7")
	case memRegistered:
		fmt.Println("apply: MCP registered: memory (context7 skipped — CONTEXT7_API_KEY not set)")
	case ctx7Registered:
		fmt.Println("apply: MCP registered: context7 (memory skipped — MEMORY_MCP_URL not set)")
	default:
		fmt.Println("apply: MCP registration skipped (neither MEMORY_MCP_URL nor CONTEXT7_API_KEY set)")
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
