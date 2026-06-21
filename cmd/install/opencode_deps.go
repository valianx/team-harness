package main

import (
	"fmt"
	"os/exec"
	"runtime"
)

// checkOpencodeDependencies detects optional runtime dependencies (python3, gh)
// and prints a one-line OK note when present or OS-appropriate install guidance
// when missing. No prompt is shown and no command is executed — this is
// detect-and-guide only (AC-9 MVP; offer-to-run is a deferred follow-up).
//
// Runs on the interactive branch; on the non-interactive branch the caller
// decides whether to invoke it (prints to stdout; never blocks).
func checkOpencodeDependencies() {
	fmt.Println("  Checking recommended dependencies:")
	checkDep("python3", python3InstallHint())
	checkDep("gh", ghInstallHint())
}

// checkDep prints "<tool>: ok" when the tool is in PATH, or OS-appropriate
// install guidance when it is missing. Mirrors warnCLI's present/missing shape
// but uses a detect-and-guide message rather than warnCLI's generic note.
func checkDep(tool, hint string) {
	if _, err := exec.LookPath(tool); err == nil {
		fmt.Printf("    %s: ok\n", tool)
		return
	}
	fmt.Printf("    %s: not found — %s\n", tool, hint)
}

// python3InstallHint returns the OS-appropriate install guidance for python3.
func python3InstallHint() string {
	switch runtime.GOOS {
	case "darwin":
		return "install with: brew install python3"
	default: // linux
		return "install with: apt install python3 (Debian/Ubuntu) or dnf install python3 (Fedora) or pacman -S python (Arch)"
	}
}

// ghInstallHint returns the OS-appropriate install guidance for the GitHub CLI.
func ghInstallHint() string {
	switch runtime.GOOS {
	case "darwin":
		return "install with: brew install gh  (see https://cli.github.com/)"
	default: // linux
		return "install with: apt install gh (Debian/Ubuntu) or see https://cli.github.com/ for other distros"
	}
}
