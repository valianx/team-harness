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

// opencodeTierFlag holds the --opencode-tier flag value (default: "", opt-in
// per-provider cost tiering, #424). Unset ⇒ the model-less baseline transform
// (opencodeRuntimeTransform); set to a curated provider (e.g. "anthropic") ⇒
// the tiered transform bakes a concrete model: id per agent.
var opencodeTierFlag = ""

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
	case "update":
		runUpdateCommand()
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
		case arg == "--opencode-tier" && i+1 < len(args):
			opencodeTierFlag = args[i+1]
			i += 2
		case strings.HasPrefix(arg, "--opencode-tier="):
			opencodeTierFlag = strings.TrimPrefix(arg, "--opencode-tier=")
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

// selectTransform returns the transform function for the configured runtime
// and the active per-provider cost-tiering selection (#424), or an error when
// --opencode-tier names a provider absent from the curated map. The function
// signature matches ComputePlan's transform parameter:
// func(src, kind, sourcePath) ([]byte, error).
func selectTransform(placer Placer) (func([]byte, string, string) ([]byte, error), error) {
	if runtimeFlag != "opencode" {
		// claude-code: identity (nil is treated as identity by ComputePlan).
		return nil, nil
	}

	provider, err := resolveActiveTierProvider(placer)
	if err != nil {
		return nil, err
	}
	if provider == "" {
		return opencodeRuntimeTransform, nil
	}
	return func(src []byte, kind, sourcePath string) ([]byte, error) {
		return opencodeRuntimeTransformTiered(src, kind, sourcePath, provider)
	}, nil
}

// resolveActiveTierProvider resolves the opt-in per-provider cost-tiering
// selection that the CC→opencode transform should bake into agent files.
// Precedence: --opencode-tier flag (highest) > the value already persisted in
// the opencode .team-harness.json from a prior install (re-run, AC-7) >
// "" (absent — model-less baseline, unchanged default).
//
// Returns an error when a non-empty selection names a provider absent from
// the curated map (providerTierFamily) — fails closed rather than silently
// falling back to model-less on a typo'd provider name.
func resolveActiveTierProvider(placer Placer) (string, error) {
	provider := opencodeTierFlag
	if provider == "" {
		if opencodePlacer, ok := placer.(*opencodePlacer); ok {
			cfgPath := opencodeSettingsConfigPath(opencodePlacer.ConfigRoot())
			provider = extractStringFromRaw(detectExistingConfig(cfgPath), "opencode.cost_tier_provider")
		}
	}
	if provider == "" {
		return "", nil
	}
	if _, ok := providerTierFamily[provider]; !ok {
		return "", fmt.Errorf("--opencode-tier: unrecognized provider %q (supported: anthropic)", provider)
	}
	return provider, nil
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

	transform, err := selectTransform(placer)
	if err != nil {
		fmt.Fprintf(os.Stderr, "plan: %v\n", err)
		os.Exit(1)
	}

	selected := allComponentIDs(components)
	diff, err := ComputePlan(modules, components, selected, placer, EmbeddedAssets(), transform)
	if err != nil {
		fmt.Fprintf(os.Stderr, "plan: compute: %v\n", err)
		os.Exit(1)
	}

	PrintPlan(diff, os.Stdout)
}

// runApplyCommand runs the manifest apply subcommand.
// Exits non-zero on error.
func runApplyCommand() {
	// Initialise claudeJSON (and claudeDir) before any MCP read. The legacy
	// main() path calls resolveClaudePaths() at main.go:67, which is never
	// reached on the apply sub-command path — so we call it here instead.
	// fix(install): root-cause of the CC→opencode migration bug (AC-4).
	resolveClaudePaths()

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

	transform, err := selectTransform(placer)
	if err != nil {
		fmt.Fprintf(os.Stderr, "apply: %v\n", err)
		os.Exit(1)
	}

	selected := allComponentIDs(components)
	diff, err := ComputePlan(modules, components, selected, placer, EmbeddedAssets(), transform)
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
//  1. Read the CC MCP migration candidate (URL + optional literal tokens).
//  2. Determine whether to run the interactive form or the env/flags path.
//  3. Collect opencode setup values (with CC URL pre-fill on the interactive path).
//  4. When literal tokens were detected in CC, copy them directly (literal is the
//     unconditional default on both the interactive and non-interactive paths —
//     scoped relaxation of SEC-OC-R1 for the CC→opencode migration, operator-locked).
//  5. Write .team-harness.json (allowlisted merge-preserving).
//  6. Register MCP servers in opencode.json (with the resolved tokenMode + secrets).
//  7. Print the explanatory apply summary.
func runOpencodePostApply(diff *PlanDiff, placer *opencodePlacer) {
	cfgPath := opencodeSettingsConfigPath(placer.ConfigRoot())

	// Step 1: read the CC MCP migration candidate. This is always done (cheap
	// read of ~/.claude.json); the result is used to pre-fill the Memory URL
	// and to populate the literal tokens (copied unconditionally when present
	// on the migration path — both interactive and non-interactive).
	ccMigration := readClaudeCodeMCPMigration()

	// Gate: interactive ONLY when a real TTY is present AND --non-interactive
	// is NOT set. The nonInteractiveFlag closes the "tty present, no human"
	// hang class (#378 by another door — SEC-DR-7).
	interactive := !nonInteractiveFlag && hasInteractiveInput()

	// Default token mode and secrets — env-ref is the safe starting point.
	// Overridden on both paths when ccMigration.hasLiteralTokens() is true:
	// literal copy is the unconditional default for the CC→opencode migration.
	mode := tokenModeEnvRef
	secrets := opencodeMCPSecrets{}

	// Detect optional runtime dependencies and print guidance (no prompt, no exec).
	// Runs on both branches — output is informational only and never blocks.
	checkOpencodeDependencies()

	var cfg opencodeSetupValues
	if interactive {
		// P3: detect pre-existing config and offer import before asking again.
		//   (a) Check the opencode-owned config path first (re-run case).
		//   (b) When absent, fall back to the CC config at ~/.claude/.team-harness.json
		//       (first install on a machine that already has Claude Code team-harness).
		//   (c) When neither exists: candidate is nil → fresh defaults (AC-5 / P2 preserved).
		existingRaw := detectExistingConfig(cfgPath)
		importSource := "opencode"
		if existingRaw == nil {
			if ccPath, err := claudeCodeTeamHarnessConfigPath(); err == nil {
				if cc := detectExistingConfig(ccPath); cc != nil {
					existingRaw = cc
					importSource = "claude-code"
				}
			}
			// os.UserHomeDir error or absent CC config → existingRaw stays nil → fresh.
		}

		var cand *importCandidate
		if existingRaw != nil {
			cand = buildImportCandidate(existingRaw)
		}

		// Pre-fill the Memory URL from the CC migration when the operator has
		// not supplied --memory-url / MEMORY_MCP_URL. This resolves URL
		// precedence: flag > env > CC-migrated URL (AC-9).
		resolvedMemURL := resolveMemoryURLWithCCFallback(ccMigration.MemoryURL)

		// fix(install): thread the CC migration's context7 key into the interactive
		// collectors so that Import short-circuit (and the full form default) set
		// Context7Enabled=true when a context7 key was present — matching the
		// operator's directive: "si se importa, no preguntes — solo copia las credenciales".
		ccHasContext7 := strings.TrimSpace(ccMigration.Context7Key) != ""

		cfg = collectOpencodeSetupInteractiveWithURL(cand, importSource, resolvedMemURL, ccHasContext7)

		// Step 4: when literal tokens were detected in CC, copy them directly
		// (literal is the unconditional default — no confirm prompt needed).
		// This matches the non-interactive path and the operator-authorized
		// SEC-OC-R1 relaxation for the CC→opencode migration path.
		if ccMigration.hasLiteralTokens() {
			mode = tokenModeLiteral
			secrets = opencodeMCPSecrets{
				MemoryBearer: ccMigration.MemoryBearer,
				Context7Key:  ccMigration.Context7Key,
			}
		}
	} else {
		// Non-interactive path: resolve setup values from env/flags with the
		// full CC migration as lowest-precedence fallback for URL and context7.
		cfg = resolveOpencodeSetupFromEnvFlagsWithCCURL(ccMigration)

		// Scoped relaxation of SEC-OC-R1 for the CC→opencode migration path.
		// When the migration carried literal tokens, copy them directly into
		// opencode.json so the servers work out of the box — no env-var export
		// step required. Literal is used ONLY when the operator's own
		// ~/.claude.json actually carried the tokens (ccMigration.hasLiteralTokens()).
		// When CC lacked a token, the corresponding secret in opencodeMCPSecrets
		// stays empty and buildOpencode*Entry falls back to the env-ref placeholder.
		if ccMigration.hasLiteralTokens() {
			mode = tokenModeLiteral
			secrets = opencodeMCPSecrets{
				MemoryBearer: ccMigration.MemoryBearer,
				Context7Key:  ccMigration.Context7Key,
			}
		}
	}

	// Resolve the per-provider cost-tiering selection (#424) — same precedence
	// selectTransform already validated before ApplyPlan ran above, re-read
	// here only because cfg was rebuilt by the interactive/non-interactive
	// branch above and does not carry it. The provider name was already
	// validated against providerTierFamily; an error here is unreachable in
	// practice (runApplyCommand exits earlier on an invalid selection).
	if provider, err := resolveActiveTierProvider(placer); err == nil {
		cfg.CostTierProvider = provider
	}

	// Write the .team-harness.json through the hardened write path (SEC-OC-R2).
	if err := writeOpencodeTeamHarnessConfig(cfgPath, cfg, placer); err != nil {
		fmt.Fprintf(os.Stderr, "apply: write .team-harness.json: %v\n", err)
		os.Exit(1)
	}

	// Register MCP servers in opencode.json (with the resolved mode + secrets).
	registerOpencodeMCPFromValues(cfg.MCP, placer.SettingsDocPath(), mode, secrets)

	// Print the explanatory summary.
	printOpencodeApplySummary()
}

// resolveOpencodeSetupFromEnvFlags builds opencodeSetupValues from environment
// variables and flags only, with sensible defaults. This is the non-interactive
// path: no prompts, no blocking, no /dev/tty access.
//
// Deprecated: prefer resolveOpencodeSetupFromEnvFlagsWithCCURL which includes
// the CC migration as the lowest-precedence fallback (AC-9).
func resolveOpencodeSetupFromEnvFlags() opencodeSetupValues {
	return resolveOpencodeSetupFromEnvFlagsWithCCURL(opencodeMCPMigration{})
}

// resolveOpencodeSetupFromEnvFlagsWithCCURL builds opencodeSetupValues from
// environment variables and flags, using the supplied CC migration as the
// lowest-precedence fallback for the Memory URL (AC-9) and for context7
// presence detection (fix: wires migration.Context7Key into context7 check).
//
// After the trim, logs-mode is always "local" on the non-interactive path
// (the work-logs group is removed from the interactive form). Language,
// english_learning, clickup, and obsidian_tasks are not written (AC-7).
//
// Security note: this function resolves the setup VALUES (URLs, presence bools)
// only — it does NOT populate opencodeMCPSecrets. Token-mode selection (env-ref
// vs literal) happens in the caller (runOpencodePostApply) based on whether the
// CC migration carried literal tokens (AC-7 / fix(install): scoped relaxation
// for CC→opencode path when ccMigration.hasLiteralTokens() is true).
func resolveOpencodeSetupFromEnvFlagsWithCCURL(migration opencodeMCPMigration) opencodeSetupValues {
	cfg := opencodeSetupValues{}

	// Work-logs mode — always "local" (the work-logs group was removed in the
	// interactive flow; the non-interactive path follows suit for consistency).
	cfg.LogsMode = "local"

	// Memory MCP: flag > env > CC-migrated URL (AC-9 precedence).
	memURL := resolveMemoryURLWithCCFallback(migration.MemoryURL)
	cfg.MCP.MemoryURL = memURL
	if memURL != "" {
		cfg.MCP.MemoryRequiresAuth = strings.TrimSpace(os.Getenv("MEMORY_MCP_BEARER")) != ""
	}

	// context7: env var takes priority; CC-migrated key is the fallback.
	// fix(install): previously only checked the env var; the CC migration's
	// context7 key was never wired in on the non-interactive path.
	cfg.MCP.Context7Enabled = strings.TrimSpace(os.Getenv("CONTEXT7_API_KEY")) != "" ||
		strings.TrimSpace(migration.Context7Key) != ""

	return cfg
}

// resolveMemoryURLWithCCFallback resolves the Memory MCP URL following the
// AC-9 precedence chain: --memory-url flag > MEMORY_MCP_URL env > ccURL fallback.
// A CC-migrated URL that fails validateMCPURL is skipped with a one-line note
// (no os.Exit) — only an explicitly supplied bad flag/env URL hard-exits (unchanged).
func resolveMemoryURLWithCCFallback(ccURL string) string {
	// Priority 1: --memory-url flag (hard-validates on bad value, unchanged).
	if memoryURLFlag != "" {
		return strings.TrimSpace(memoryURLFlag)
	}
	// Priority 2: MEMORY_MCP_URL env (hard-validates on bad value, unchanged).
	if v := strings.TrimSpace(os.Getenv("MEMORY_MCP_URL")); v != "" {
		return v
	}
	// Priority 3: CC-migrated URL — validate but skip on bad value (not hard-exit).
	if ccURL != "" {
		if err := validateMCPURL(ccURL); err != nil {
			fmt.Fprintf(os.Stderr, "Note: CC-migrated Memory URL %q is invalid (%s) — skipping migration; set MEMORY_MCP_URL to configure.\n", ccURL, err)
			return ""
		}
		return ccURL
	}
	return ""
}

// registerOpencodeMCPFromValues registers MCP servers in opencode.json using
// the values from an opencodeSetupValues struct. This is the refactored sink
// that accepts an explicit struct rather than reading from global env/flags.
//
// mode and secrets control whether secrets are written as {env:VAR} references
// (default: tokenModeEnvRef) or as literal values (tokenModeLiteral). The literal
// mode is the unconditional default on both the interactive and non-interactive
// CC→opencode migration paths, gated on ccMigration.hasLiteralTokens()
// (scoped relaxation of SEC-OC-R1, operator-locked at STAGE-GATE-1).
//
// Contract (unchanged from the former registerOpencodeMCPIfConfigured):
//   - Memory MCP: registered when mcp.MemoryURL is non-empty. A provided-but-
//     invalid URL exits non-zero (provided-but-invalid is always an error).
//     If absent: skipped with a one-line note; no os.Exit.
//   - context7: registered when mcp.Context7Enabled is true.
//     If absent: skipped with a one-line note; no os.Exit.
//   - A non-blocking warning is printed when the bearer is unset (env-ref path only;
//     on the literal path the bearer is known).
//   - Summary: names only, never URL values or secret values (SEC-OC-R5).
func registerOpencodeMCPFromValues(mcp opencodeMCPValues, settingsDocPath string, mode tokenMode, secrets opencodeMCPSecrets) MCPRegisterOutcome {
	const context7URL = "https://mcp.context7.com/mcp"

	memWanted := false
	ctx7Wanted := false

	if mcp.MemoryURL != "" {
		// URL was provided — validate scheme; exit on bad value.
		if err := validateMCPURL(mcp.MemoryURL); err != nil {
			fmt.Fprintf(os.Stderr, "Error: Memory MCP URL is invalid: %s\n", err)
			os.Exit(1)
		}
		memWanted = true

		// Non-blocking warning when the bearer env var is unset at install time
		// AND we are using env-ref mode. On the literal path the bearer is already
		// embedded in opencode.json — no env var warning needed.
		if mode == tokenModeEnvRef && strings.TrimSpace(os.Getenv("MEMORY_MCP_BEARER")) == "" {
			fmt.Fprintln(os.Stderr, "Warning: MEMORY_MCP_BEARER is not set. opencode will send an empty Authorization header to the Memory MCP until you export MEMORY_MCP_BEARER in your shell.")
		}
	} else {
		fmt.Fprintln(os.Stderr, "Memory MCP not configured. To register later: re-run the install with MEMORY_MCP_URL set, or edit opencode.json directly.")
	}

	if mcp.Context7Enabled {
		ctx7Wanted = true
	} else {
		fmt.Fprintln(os.Stderr, "context7 not configured. To register later: export CONTEXT7_API_KEY and re-run the install, or edit opencode.json directly.")
	}

	// Register whichever servers are configured in a single opencode.json write.
	// Return the real per-server outcome so the caller can display truthful status.
	if memWanted || ctx7Wanted {
		ctx7URL := ""
		if ctx7Wanted {
			ctx7URL = context7URL
		}
		outcome, err := registerOpencodeMCP(mcp.MemoryURL, ctx7URL, settingsDocPath, mode, secrets)
		if err != nil {
			fmt.Fprintf(os.Stderr, "apply: opencode.json MCP registration: %v\n", err)
			os.Exit(1)
		}
		return outcome
	}

	// Neither server was wanted — both are skipped.
	return MCPRegisterOutcome{
		Memory:   MCPStatusSkipped,
		Context7: MCPStatusSkipped,
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

// collectOpencodeSetupInteractiveWithURL calls collectOpencodeSetupInteractivePreFilled
// with the resolved Memory URL and a context7-present signal injected as initial values.
// This implements the AC-9 CC-URL migration: when the operator has not supplied
// --memory-url / MEMORY_MCP_URL, the CC-migrated URL is shown pre-populated so the
// operator can accept or edit it.
//
// When resolvedURL is empty and initialContext7Enabled is false, this is identical
// to collectOpencodeSetupInteractive with default values.
//
// fix(install): the initialContext7Enabled parameter threads the CC migration's
// context7-present signal so the Import short-circuit and the default form value
// both reflect the operator's existing CC context7 configuration.
func collectOpencodeSetupInteractiveWithURL(cand *importCandidate, importSource, resolvedURL string, initialContext7Enabled bool) opencodeSetupValues {
	return collectOpencodeSetupInteractivePreFilled(cand, importSource, resolvedURL, initialContext7Enabled)
}

// discloseCCTokensToTTY writes the found CC token values to the controlling
// terminal (/dev/tty) so the operator can export them manually (AC-13).
//
// The values are NEVER written to stdout (so `install > log.txt` cannot capture
// them). On Windows / when /dev/tty is unavailable, the values are NOT written
// to any redirectable stream — instead the operator is instructed to retrieve
// them from ~/.claude.json.
func discloseCCTokensToTTY(migration opencodeMCPMigration) {
	// Try to open the controlling terminal for write.
	tty, err := openTTYForWrite()
	if err != nil {
		// No controlling terminal available — instruct the operator to retrieve
		// values from ~/.claude.json instead of printing to any redirectable stream.
		fmt.Fprintln(os.Stderr, "Note: Could not open controlling terminal. To use these MCP servers, retrieve the token values from ~/.claude.json and export them manually:")
		if migration.MemoryBearer != "" {
			fmt.Fprintln(os.Stderr, "  export MEMORY_MCP_BEARER=<see ~/.claude.json mcpServers.memory.headers.Authorization>")
		}
		if migration.Context7Key != "" {
			fmt.Fprintln(os.Stderr, "  export CONTEXT7_API_KEY=<see ~/.claude.json mcpServers.context7.headers.CONTEXT7_API_KEY>")
		}
		return
	}
	defer tty.Close()

	fmt.Fprintln(tty, "\nTo use these MCP servers, export the following in your shell before launching opencode:")
	if migration.MemoryBearer != "" {
		fmt.Fprintf(tty, "  export MEMORY_MCP_BEARER=%s\n", migration.MemoryBearer)
	}
	if migration.Context7Key != "" {
		fmt.Fprintf(tty, "  export CONTEXT7_API_KEY=%s\n", migration.Context7Key)
	}
	fmt.Fprintln(tty, "You can also add these to your shell profile (~/.bashrc, ~/.zshrc, etc.).")
}

// printOpencodeApplySummary prints the post-apply summary for the opencode
// runtime to stdout. The summary ends at the "Installed successfully." headline —
// the detail block (components, settings, MCP status) is intentionally omitted
// to keep the operator-facing output minimal (operator-locked change).
func printOpencodeApplySummary() {
	fmt.Println()
	fmt.Println("Installed successfully.")
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
