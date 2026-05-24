package main

import (
	"bufio"
	"fmt"
	"os"
	"strings"
)

// promptLogsMode determines the work-logs output mode from env vars, an
// existing manifest value, or an interactive prompt. The result is written
// directly into the global manifest struct. Decision priority:
//
//  1. LOGS_MODE env var (non-interactive / CI / scripted installs).
//  2. Existing manifest.LogsMode (loaded from .team-harness.json).
//  3. Interactive TTY or /dev/tty → prompt with [l] local / [o] obsidian menu.
//  4. No env var, no existing config, no TTY → default to "local" silently.
func promptLogsMode() {
	if env := strings.TrimSpace(os.Getenv("LOGS_MODE")); env != "" {
		promptLogsModeFromEnv(env)
		return
	}

	if manifest.LogsMode != "" {
		promptLogsModePreserveOrChange()
		return
	}

	promptLogsModeInteractive()
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

// promptLogsModePreserveOrChange handles the case where an existing
// manifest.LogsMode was loaded from disk. Non-interactive installs silently
// preserve; interactive installs show a Keep/Change menu.
func promptLogsModePreserveOrChange() {
	if !hasInteractiveInput() {
		displayPath := manifest.LogsMode
		if manifest.LogsMode == "obsidian" && manifest.LogsPath != "" {
			displayPath = fmt.Sprintf("obsidian → %s", manifest.LogsPath)
		}
		fmt.Printf("  Work-logs mode: preserving existing %s (non-interactive)\n", displayPath)
		return
	}

	fmt.Println()
	if manifest.LogsMode == "obsidian" && manifest.LogsPath != "" {
		fmt.Printf("  Existing work-logs mode: %s → %s\n",
			colorValue(manifest.LogsMode),
			colorValue(manifest.LogsPath))
	} else {
		fmt.Printf("  Existing work-logs mode: %s\n", colorValue(manifest.LogsMode))
	}
	choice := promptMenu("  Keep [Y] / Change [c]? [Y]: ",
		map[string]bool{"y": true, "c": true}, "y")
	if choice == "y" {
		// Preserve — manifest fields already loaded from disk.
		return
	}

	// Operator chose Change: fall through to interactive prompt.
	// Reset existing values so the prompt starts clean.
	manifest.LogsMode = ""
	manifest.LogsPath = ""
	manifest.LogsSubfolder = ""
	promptLogsModeInteractive()
}

// promptLogsModeInteractive shows the [l]/[o] menu and, when obsidian is
// selected, prompts for the vault path. Falls back to "local" silently
// when no TTY is available (backward compatibility).
func promptLogsModeInteractive() {
	input := openInteractiveInput()
	if input == nil {
		// Non-interactive with no env var and no existing config: default to local.
		manifest.LogsMode = "local"
		return
	}
	defer input.Close()

	scan := bufio.NewScanner(input)
	fmt.Println("  [l] local     — ./session-docs/{date}_{feature}/ relative to each project (default)")
	fmt.Println("  [o] obsidian  — writes to work-logs/ in an Obsidian vault with metadata")
	fmt.Println()
	choice := promptMenuWith("  Work-logs output [l/o]? [l]: ",
		map[string]bool{"l": true, "o": true}, "l", scan)

	if choice == "l" {
		manifest.LogsMode = "local"
		return
	}

	// Obsidian selected: prompt for vault path.
	fmt.Println()
	fmt.Print("  Absolute path to your Obsidian vault (folder containing .obsidian/): ")
	path := strings.TrimSpace(readLineFrom(scan))
	if path == "" {
		fmt.Fprintln(os.Stderr, "Error: Obsidian vault path cannot be empty.")
		os.Exit(1)
	}
	manifest.LogsMode = "obsidian"
	manifest.LogsPath = path
	manifest.LogsSubfolder = "work-logs"
}
