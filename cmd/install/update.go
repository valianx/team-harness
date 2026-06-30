package main

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"
)

// compareSemver compares two bare semver strings (e.g. "2.119.3", "2.120.0").
// Returns -1 when a < b, 0 when a == b, +1 when a > b.
// A missing, empty, or unparseable value is treated as the lowest possible
// version (-∞): it compares less than any parseable version.
func compareSemver(a, b string) int {
	pa := parseSemver(a)
	pb := parseSemver(b)
	for i := 0; i < 3; i++ {
		if pa[i] < pb[i] {
			return -1
		}
		if pa[i] > pb[i] {
			return 1
		}
	}
	return 0
}

// parseSemver splits a bare semver string into its three numeric components.
// Any component that is absent or non-numeric is treated as 0.
func parseSemver(v string) [3]int {
	var parts [3]int
	segs := strings.SplitN(strings.TrimPrefix(v, "v"), ".", 4)
	for i := 0; i < 3 && i < len(segs); i++ {
		n, err := strconv.Atoi(segs[i])
		if err != nil {
			// Non-numeric segment — treat the whole version as unparseable.
			return [3]int{0, 0, 0}
		}
		parts[i] = n
	}
	return parts
}

// runUpdateCommand implements the `install update` subcommand for the opencode
// runtime. It performs a version-delta check, surfaces the ComputePlan diff as
// a preview, confirms with the operator on an interactive TTY, applies the
// changes, bumps the managed config keys, and prints the restart-to-activate
// honesty block.
//
// Security: all asset writes go through the reused ApplyPlan → appendLedger
// path (SEC-04/05 enforced). Config key updates go through
// refreshManagedConfigKeys (allowlisted, hardened write, backup before write —
// SEC-OC-R4 / SEC-OC-R2 / SEC-01..08 reused). opencode.json is never touched.
func runUpdateCommand() {
	// Only the opencode runtime supports `update`.
	if runtimeFlag != "opencode" {
		fmt.Fprintf(os.Stderr, "update: --runtime opencode is required (got %q)\n", runtimeFlag)
		os.Exit(1)
	}

	placer, err := selectPlacer()
	if err != nil {
		fmt.Fprintf(os.Stderr, "update: %v\n", err)
		os.Exit(1)
	}

	// Set the runtime-scoped ledger before any ledger I/O (mirrors plan/apply).
	setActiveLedgerFilename(selectLedgerFilename())

	opencodePlacer, ok := placer.(*opencodePlacer)
	if !ok {
		fmt.Fprintln(os.Stderr, "update: internal error: unexpected placer type")
		os.Exit(1)
	}

	cfgPath := opencodeSettingsConfigPath(opencodePlacer.ConfigRoot())

	// Step 1: Read the installed version from the managed config.
	installedVersion := readInstalledVersion(cfgPath)

	// Step 2: Three-state version delta.
	delta := compareSemver(version, installedVersion)
	switch {
	case delta == 0:
		// Versions match — still compute the plan to check for on-disk divergence.
		diff, planErr := computeUpdatePlan(placer)
		if planErr != nil {
			fmt.Fprintf(os.Stderr, "update: compute plan: %v\n", planErr)
			os.Exit(1)
		}
		hasChanges := len(diff.ToCreate)+len(diff.ToUpdate)+len(diff.ToRemove) > 0
		if !hasChanges {
			printAlreadyCurrent(installedVersion)
			return // AC-2: zero writes when already current
		}
		// Version matches but on-disk diverged (e.g. partial previous apply).
		// Fall through to apply with an informational header.
		fmt.Printf("th update — files diverged from recorded version %s\n", installedVersion)
		applyUpdateDiff(diff, cfgPath, opencodePlacer)

	case delta < 0:
		// installed > embedded: this binary is older than the recorded install.
		// AC-3: report and exit without downgrading.
		fmt.Println("th update — installed ahead")
		fmt.Printf("  installed version   %s\n", installedVersion)
		fmt.Printf("  binary version      %s\n", version)
		fmt.Println("The installed version is newer than this binary.")
		fmt.Println("To upgrade, re-download the latest binary from GitHub Releases.")
		return

	default:
		// embedded > installed: update available.
		fmt.Println("th update — new version available")
		fmt.Printf("  installed version   %s\n", installedVersion)
		fmt.Printf("  latest version      %s\n", version)
		diff, planErr := computeUpdatePlan(placer)
		if planErr != nil {
			fmt.Fprintf(os.Stderr, "update: compute plan: %v\n", planErr)
			os.Exit(1)
		}
		applyUpdateDiff(diff, cfgPath, opencodePlacer)
	}
}

// computeUpdatePlan loads the manifests and computes the plan diff.
func computeUpdatePlan(placer Placer) (PlanDiff, error) {
	modules, components, err := loadDefaultManifests(runtimeFlag)
	if err != nil {
		return PlanDiff{}, fmt.Errorf("load manifests: %w", err)
	}
	transform, err := selectTransform(placer)
	if err != nil {
		return PlanDiff{}, err
	}
	selected := allComponentIDs(components)
	return ComputePlan(modules, components, selected, placer, EmbeddedAssets(), transform)
}

// applyUpdateDiff surfaces ledger errors, prints the plan, confirms with the
// operator on a TTY, applies the asset changes, and bumps the config keys.
// When the operator declines at the confirm prompt, ZERO writes are performed.
func applyUpdateDiff(diff PlanDiff, cfgPath string, placer *opencodePlacer) {
	// Surface ledger errors prominently before the plan preview (AC-8).
	if len(diff.LedgerErrors) > 0 {
		fmt.Fprintf(os.Stderr, "Warning: %d ledger error(s) detected — ToRemove entries may be incomplete:\n", len(diff.LedgerErrors))
		for _, le := range diff.LedgerErrors {
			fmt.Fprintf(os.Stderr, "  ! %s\n", le.Error())
		}
		fmt.Fprintln(os.Stderr, "Asset create/update will proceed; removal is limited to well-formed ledger entries.")
	}

	// Print the four-bucket diff preview (reused PrintPlan).
	PrintPlan(diff, os.Stdout)

	// Confirm with operator on interactive TTY (unless --non-interactive/--yes).
	// AC-12: operator answer "n" → ZERO writes (no asset files, no ledger, no config).
	if !nonInteractiveFlag && hasInteractiveInput() {
		if !confirmApply() {
			fmt.Println("Update cancelled. No changes were written.")
			return
		}
	}

	// Apply asset files through the reused engine (SEC-04/05/ledger all enforced).
	if err := ApplyPlan(diff, placer); err != nil {
		fmt.Fprintf(os.Stderr, "update: apply: %v\n", err)
		os.Exit(1)
	}

	// Bump only the installer-managed config keys (SEC-OC-R4 / AC-5).
	if err := refreshManagedConfigKeys(cfgPath, placer); err != nil {
		fmt.Fprintf(os.Stderr, "update: refresh config keys: %v\n", err)
		os.Exit(1)
	}

	// AC-4 / AC-6: restart-to-activate honesty block.
	fmt.Println()
	fmt.Println("Asset files updated on disk. Restart opencode to activate —")
	fmt.Println("the update is NOT live in any running opencode session until you restart.")
}

// confirmApply prompts the operator for [Y/n] and returns true when the
// operator confirms. Returns true as the default when no input is received
// (enter pressed on an empty line). Returns false when the operator types
// "n" or "N".
//
// The prompt is written to os.Stderr so it is visible even when stdout is
// piped. Input is read from /dev/tty when available (the curl | bash case
// where stdin is the pipe), or from os.Stdin when stdin is an interactive
// TTY but /dev/tty is unavailable (Windows interactive sessions).
//
// Why a raw bufio.Scanner prompt instead of the installer's huh/v2 TUI:
// the update subcommand is a thin, non-interactive-aware path that runs
// in contexts (curl | bash, headless CI) where a full bubbletea TUI
// would be inappropriate or fail. The raw stderr-prompt + /dev/tty-read
// pattern is deliberately lighter and correctly handles the piped-stdin
// case that the TUI stack cannot.
//
// AC-12: operator answer "n" → ZERO writes performed by the caller.
func confirmApply() bool {
	// Resolve the best available reader for the operator's answer.
	// /dev/tty is preferred so the prompt works in curl | bash scenarios.
	// On Windows (openTTYDevice always fails) and when stdin is a TTY,
	// fall back to os.Stdin so the operator still gets a visible prompt.
	var reader *os.File
	var closeFn func()
	if tty, err := openTTYDevice(); err == nil {
		reader = tty
		closeFn = func() { tty.Close() }
	} else if isTerminal() {
		// fix(update): Windows interactive path — tty unavailable but stdin is a TTY.
		reader = os.Stdin
		closeFn = func() {}
	} else {
		// No interactive input available; apply as the safe default.
		// (Caller guards via hasInteractiveInput, but be defensive.)
		return true
	}
	defer closeFn()

	// Write the prompt to stderr: the tty handle is O_RDONLY on Unix, and
	// stderr is always writable and visible even when stdout is redirected.
	// fix(update): old code wrote to the O_RDONLY tty handle — silently dropped on Linux/macOS.
	fmt.Fprint(os.Stderr, "Apply this update? [Y/n] ")
	scanner := bufio.NewScanner(reader)
	if scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if strings.EqualFold(line, "n") {
			return false
		}
	}
	return true
}

// readInstalledVersion reads the installed_version key from the .team-harness.json
// at path. Returns "" when the file is absent, unreadable, or the key is missing.
func readInstalledVersion(cfgPath string) string {
	m := detectExistingConfig(cfgPath)
	if m == nil {
		return ""
	}
	return extractStringFromRaw(m, "installed_version")
}

// printAlreadyCurrent prints the "already current, no changes" message.
func printAlreadyCurrent(installedVersion string) {
	fmt.Println("th update — already current")
	fmt.Printf("  installed version   %s\n", installedVersion)
	fmt.Printf("  latest version      %s\n", version)
	fmt.Println("No action required.")
}
