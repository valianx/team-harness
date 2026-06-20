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

	// For opencode runtime, register MCP servers in opencode.json.
	// The Memory URL is required — no silent skip (repo policy: no default URL).
	if runtimeFlag == "opencode" {
		registerOpencodeRequiredMCP(placer.SettingsDocPath())
	}

	fmt.Printf("apply: done (created %d, updated %d, skipped %d, removed %d)\n",
		len(diff.ToCreate), len(diff.ToUpdate), len(diff.ToSkipHashMatch), len(diff.ToRemove))
}

// registerOpencodeRequiredMCP registers MCP servers in opencode.json for the
// opencode runtime. The Memory URL is mandatory (repo policy: no default URL,
// no silent skip). Resolution order: --memory-url flag → MEMORY_MCP_URL env.
// Exits non-zero when the URL is absent or has a non-http(s) scheme.
// Emits a non-blocking stderr warning when MEMORY_MCP_BEARER is unset (AC-10).
func registerOpencodeRequiredMCP(settingsDocPath string) {
	memURL := resolveOpencodeMemoryURL()

	if err := validateMCPURL(memURL); err != nil {
		fmt.Fprintf(os.Stderr, "Error: MEMORY_MCP_URL=%q is invalid: %s\n", memURL, err)
		os.Exit(1)
	}

	const context7URL = "https://mcp.context7.com/mcp"
	if err := registerOpencodeMCP(memURL, context7URL, settingsDocPath); err != nil {
		fmt.Fprintf(os.Stderr, "apply: opencode.json MCP registration: %v\n", err)
		os.Exit(1)
	}

	// AC-10: non-blocking warning when the bearer is unset at install time.
	// opencode resolves {env:MEMORY_MCP_BEARER} at runtime; if unset, the
	// Authorization header will be empty until the operator exports the variable.
	if strings.TrimSpace(os.Getenv("MEMORY_MCP_BEARER")) == "" {
		fmt.Fprintln(os.Stderr, "Warning: MEMORY_MCP_BEARER is not set. opencode will send an empty Authorization header to the Memory MCP until you export MEMORY_MCP_BEARER in your shell.")
	}
}

// resolveOpencodeMemoryURL returns the Memory MCP URL from --memory-url flag or
// MEMORY_MCP_URL env (trimmed). Exits non-zero with an instructive message when
// neither is set (AC-2: no silent skip — a --runtime opencode apply requires an
// explicit URL).
func resolveOpencodeMemoryURL() string {
	if memoryURLFlag != "" {
		return strings.TrimSpace(memoryURLFlag)
	}
	if env := strings.TrimSpace(os.Getenv("MEMORY_MCP_URL")); env != "" {
		return env
	}
	fmt.Fprintln(os.Stderr, `Memory MCP URL is required for opencode installs.
  Detected: neither --memory-url flag nor MEMORY_MCP_URL env var is set.
  Options:
    1. Pass the URL as a flag:
         install apply --runtime opencode --memory-url https://your-mcp.example.com/mcp
    2. Set the env var before running:
         MEMORY_MCP_URL=https://your-mcp.example.com/mcp \
           install apply --runtime opencode
  There is no default URL.`)
	os.Exit(1)
	return "" // unreachable
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
// exercised via tests). For opencode, returns the real component set.
func loadDefaultManifests(runtime string) ([]ModuleManifest, []ComponentManifest, error) {
	if runtime == "opencode" {
		return buildOpencodeManifests()
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
