package main

import (
	"context"
	"fmt"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

// checkOpencodeDependencies detects optional runtime dependencies (Python 3, gh)
// and prints a one-line status for each: "found" when present, or
// "not found — <OS-appropriate hint>" when missing. No prompt or install is
// shown; the Python check uses a short, read-only version probe so Windows
// launchers such as "py -3" are accepted without recommending a duplicate
// installation.
//
// Runs on both interactive and non-interactive branches (prints to stdout;
// each probe has a bounded timeout).
func checkOpencodeDependencies() {
	fmt.Println("  Checking recommended tools:")
	checkPython3("Python 3", python3InstallHint())
	checkDep("GitHub CLI", "gh", ghInstallHint())
}

type pythonCandidate struct {
	binary string
	args   []string
}

// pythonCandidates returns executable forms supported by the current OS.
// Windows commonly exposes Python through the py launcher or python.exe,
// while Unix installations conventionally use python3 (with python as a
// compatibility fallback).
func pythonCandidates() []pythonCandidate {
	if runtime.GOOS == "windows" {
		return []pythonCandidate{
			{binary: "py", args: []string{"-3", "--version"}},
			{binary: "python", args: []string{"--version"}},
			{binary: "python3", args: []string{"--version"}},
		}
	}
	return []pythonCandidate{
		{binary: "python3", args: []string{"--version"}},
		{binary: "python", args: []string{"--version"}},
	}
}

// hasPython3Version confirms that a candidate resolves to Python 3. A
// bounded --version probe avoids treating an unrelated executable named
// "python" as a valid dependency and keeps dependency reporting non-blocking.
func hasPython3Version(candidate pythonCandidate) bool {
	if _, err := exec.LookPath(candidate.binary); err != nil {
		return false
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	output, err := exec.CommandContext(ctx, candidate.binary, candidate.args...).CombinedOutput()
	if err != nil || ctx.Err() != nil {
		return false
	}
	return strings.Contains(string(output), "Python 3.")
}

func checkPython3(displayName, hint string) {
	for _, candidate := range pythonCandidates() {
		if hasPython3Version(candidate) {
			label := fmt.Sprintf("%s (%s)", displayName, candidate.binary)
			fmt.Printf("    %-30s found\n", label)
			return
		}
	}
	fmt.Printf("    %-30s not found — %s\n", displayName, hint)
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
	case "windows":
		return "install with: winget install Python.Python.3.12 (or see https://www.python.org/downloads/windows/)"
	case "darwin":
		return "install with: brew install python3"
	case "linux":
		return "install with: apt install python3 (Debian/Ubuntu) or dnf install python3 (Fedora) or pacman -S python (Arch)"
	default:
		return "install Python 3 from https://www.python.org/downloads/"
	}
}

// ghInstallHint returns the OS-appropriate install guidance for the GitHub CLI.
func ghInstallHint() string {
	switch runtime.GOOS {
	case "windows":
		return "install with: winget install GitHub.cli (or see https://cli.github.com/)"
	case "darwin":
		return "install with: brew install gh  (see https://cli.github.com/)"
	case "linux":
		return "install with: apt install gh (Debian/Ubuntu) or see https://cli.github.com/ for other distros"
	default:
		return "install GitHub CLI from https://cli.github.com/"
	}
}
