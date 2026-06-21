package main

import (
	"fmt"
	"os/exec"
	"runtime"
)

// checkOpencodeDependencies detects optional runtime dependencies (python3, gh)
// and prints a one-line status for each: "found" when present, or
// "not found — <OS-appropriate hint>" when missing. No prompt is shown and no
// command is executed — this is detect-and-guide only (AC-9 MVP).
//
// Runs on both interactive and non-interactive branches (prints to stdout;
// never blocks).
func checkOpencodeDependencies() {
	fmt.Println("  Checking recommended tools:")
	checkDep("Python 3", "python3", python3InstallHint())
	checkDep("GitHub CLI", "gh", ghInstallHint())
}

// checkDep prints "    <displayName> (<binary>) ... found" when the binary is
// in PATH, or "    <displayName> (<binary>) ... not found — <hint>" when missing.
// displayName is the full human-readable name (e.g. "Python 3"), binary is the
// executable looked up in PATH (e.g. "python3").
func checkDep(displayName, binary, hint string) {
	label := fmt.Sprintf("%s (%s)", displayName, binary)
	if _, err := exec.LookPath(binary); err == nil {
		fmt.Printf("    %-30s found\n", label)
		return
	}
	fmt.Printf("    %-30s not found — %s\n", label, hint)
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
