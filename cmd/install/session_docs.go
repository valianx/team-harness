package main

import (
	"fmt"
	"os"
	"strings"
)

// promptInstallMode determines install mode for non-interactive installs only.
// It is called from collectConfigNonInteractive. The interactive path uses the
// TUI form's Select field in buildInstallOptionsGroup.
//
// Priority:
//  1. INSTALL_MODE env var.
//  2. No env var → default ModeStandard (preserves v1.1.0 behaviour).
func promptInstallMode() InstallMode {
	if env := strings.TrimSpace(os.Getenv("INSTALL_MODE")); env != "" {
		switch env {
		case string(ModeStandard):
			fmt.Printf("  Install mode: standard (loaded from INSTALL_MODE env var)\n")
			return ModeStandard
		case string(ModeLowCost):
			fmt.Printf("  Install mode: low-cost (loaded from INSTALL_MODE env var)\n")
			return ModeLowCost
		default:
			fmt.Fprintf(os.Stderr, "Error: INSTALL_MODE=%q is invalid. Accepted values: standard, low-cost\n", env)
			os.Exit(1)
		}
	}
	// No env var in non-interactive mode: default to standard.
	return ModeStandard
}

// promptLogsMode determines the work-logs output mode. Decision priority:
//
//  1. Existing manifest.LogsMode (loaded from .team-harness.json) → always preserved.
//  2. LOGS_MODE env var (first-time installs only).
//  3. No env var, no existing config → default "local" silently.
//
// Once set, the installer never modifies logs config. To change it, the
// operator edits ~/.claude/.team-harness.json directly. The interactive path
// (TUI form) handles first-time setup via buildInstallOptionsGroup.
func promptLogsMode() {
	if manifest.LogsMode != "" {
		displayPath := manifest.LogsMode
		if manifest.LogsMode == "obsidian" && manifest.LogsPath != "" {
			displayPath = fmt.Sprintf("obsidian → %s", manifest.LogsPath)
		}
		fmt.Printf("  Work-logs mode: %s (preserved)\n", displayPath)
		return
	}
	if env := strings.TrimSpace(os.Getenv("LOGS_MODE")); env != "" {
		promptLogsModeFromEnv(env)
		return
	}
	// No env var, no existing config: default to local.
	manifest.LogsMode = "local"
}

// promptLogsModeFromEnv sets manifest fields from the LOGS_MODE env var.
// Valid values: "local", "obsidian". Any other value exits 1.
// When mode is "obsidian", LOGS_PATH is also required.
func promptLogsModeFromEnv(env string) {
	switch env {
	case "local":
		fmt.Printf("  Work-logs mode: local (loaded from LOGS_MODE env var)\n")
		manifest.LogsMode = "local"
	case "obsidian":
		logsPath := strings.TrimSpace(os.Getenv("LOGS_PATH"))
		if logsPath == "" {
			fmt.Fprintln(os.Stderr, "Error: LOGS_PATH is required when LOGS_MODE=obsidian")
			os.Exit(1)
		}
		fmt.Printf("  Work-logs mode: obsidian → %s (loaded from LOGS_MODE/LOGS_PATH env vars)\n", colorValue(logsPath))
		manifest.LogsMode = "obsidian"
		manifest.LogsPath = logsPath
		manifest.LogsSubfolder = "work-logs"
	default:
		fmt.Fprintf(os.Stderr, "Error: LOGS_MODE=%q is invalid. Accepted values: local, obsidian\n", env)
		os.Exit(1)
	}
}
