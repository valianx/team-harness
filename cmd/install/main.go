// Package main is the team-harness agent installer for the opencode and Codex
// runtimes. Plugin installation remains owned by each runtime's marketplace.
//
// Claude Code installs exclusively through the marketplace plugin
// (/plugin marketplace add valianx/team-harness) — this binary's former CC
// install path (bare invocation, no subcommand) is retired and only prints a
// redirect notice. The manifest engine (`install plan|apply|uninstall
// --runtime opencode`) installs agents and skills, and
// preserves existing MCP registrations in opencode.json and can register
// explicitly selected Context7 or knowledge-graph values. It does not bundle,
// migrate, or provision any external MCP server.
//
// Flags:
//
//	--force   bypass preservation of existing mcpServer entries.
package main

import (
	"fmt"
	"os"
	"strings"
	"time"
)

// version is injected at build time via -ldflags "-X main.version=2.0.0".
// Note: the value is the BARE semver (no leading "v"). The "v" is added by
// the printf in main(). The release workflow strips the leading "v" from
// the git tag (e.g. v2.0.1 → 2.0.1) before injecting — see release.yml.
var version = "3.38.0"

// forceFlag is preserved as a no-op for backward compatibility. The installer
// always overwrites embedded files; this flag once disabled the conflict gate,
// but the gate itself has been removed. Scripts and skills that pass --force
// keep working without modification.
var forceFlag bool

// claudeDir is ~/.claude
var claudeDir string

// claudeJSON is ~/.claude.json
var claudeJSON string

func main() {
	parseFlags()

	// plan|apply|uninstall|update subcommands (the manifest engine — the only
	// install path this binary still serves for Claude Code — --runtime
	// claude-code resolves to empty manifests, a deliberate no-op; the live
	// agent-installer runtimes are opencode and Codex) are handled first.
	if dispatchSubcommand() {
		return
	}

	// The legacy no-arg interactive path used to install Claude Code
	// hooks/agents/skills directly into ~/.claude/. Retired: Claude Code
	// installs exclusively through the marketplace plugin as of the hook
	// Bash->TS cutover (issue #446). This binary remains the agent installer
	// for opencode and Codex.
	printClaudeCodeRetiredNotice()
}

// printClaudeCodeRetiredNotice tells an operator who ran the bare binary (the
// former Claude Code interactive install) that Claude Code now installs
// exclusively through the marketplace plugin. The binary itself remains the
// agent installer for the opencode and Codex runtimes.
func printClaudeCodeRetiredNotice() {
	fmt.Println("team-harness installer — Claude Code install path retired.")
	fmt.Println()
	fmt.Println("Claude Code now installs exclusively through the marketplace plugin:")
	fmt.Println("  /plugin marketplace add valianx/team-harness")
	fmt.Println("  /plugin install th")
	fmt.Println("  /th:setup")
	fmt.Println()
	fmt.Println("This binary remains the agent installer for opencode and Codex:")
	fmt.Println("  install apply --runtime opencode")
	fmt.Println("  install apply --runtime codex --scope project")
	fmt.Println("Codex plugin installation is separate: use its marketplace commands first.")
}

// runInstallProgressSpinner runs the file install behind a custom bubbletea
// model that shows a real-time file count in the spinner title (AC-6). The
// install goroutine sends installProgressDoneMsg to the program when done.
func parseFlags() {
	newArgs := make([]string, 0, len(os.Args))
	for _, a := range os.Args {
		if a == "--force" {
			forceFlag = true
		} else {
			newArgs = append(newArgs, a)
		}
	}
	os.Args = newArgs
	// --force is accepted but has no effect on file installation (always overwrites).
	// It still bypasses preservation of existing mcpServer entries in ~/.claude.json.
}

// resolveClaudePaths sets claudeDir and claudeJSON from the user's home
// directory. The repoRoot walk is intentionally removed — agents/skills/hooks
// are now embedded at compile time, so no filesystem clone is required.
func resolveClaudePaths() {
	home, _ := os.UserHomeDir()
	claudeDir = fmt.Sprintf("%s/.claude", home)
	claudeJSON = fmt.Sprintf("%s/.claude.json", home)
}

// checkDependencies checks CLI tools used by agents and skills at runtime.
// gh is recommended (graceful fallback paths exist) but not required.
func checkDependencies() {
	warnCLI("gh", "Install GitHub CLI: https://cli.github.com/")
}

// backupClaudeJSON copies ~/.claude.json to a timestamped backup.
// Returns the backup path, or "" if the source doesn't exist.
func backupClaudeJSON() string {
	if _, err := os.Stat(claudeJSON); os.IsNotExist(err) {
		return ""
	}
	timestamp := time.Now().Format("20060102-150405")
	backup := claudeJSON + ".bak-" + timestamp
	if err := copyBackupHardened(claudeJSON, backup, 0o600); err != nil {
		fmt.Fprintf(os.Stderr, "  [warn] could not create backup of ~/.claude.json: %v\n", err)
		return ""
	}
	return backup
}

// installAgents copies agents/*.md to ~/.claude/agents/ and recursively copies
// the agents/_shared/ subdirectory. The mode transformer is applied to top-level
// agent files only; shared snippets are copied byte-identical.
func installAgents(mode InstallMode) {
	destDir := fmt.Sprintf("%s/agents", claudeDir)
	entries, err := readEmbeddedDir("agents")
	if err != nil {
		return
	}
	for _, e := range entries {
		if shouldSkip(e.Name()) {
			continue
		}
		if e.IsDir() {
			// Recurse into subdirectories (e.g. _shared/).
			copyEmbeddedDirRecursive(
				"agents/"+e.Name(),
				fmt.Sprintf("%s/%s", destDir, e.Name()),
				"",
			)
			continue
		}
		if !strings.HasSuffix(e.Name(), ".md") {
			continue
		}
		srcPath := "agents/" + e.Name()
		dest := fmt.Sprintf("%s/%s", destDir, e.Name())
		copyAgentFile(srcPath, dest, mode)
	}
}

// installSkills copies all skill directories to ~/.claude/skills/<name>/.
// All skills use the directory format (skills/<name>/SKILL.md).
// Legacy flat .md files in skills/ are no longer shipped.
func installSkills() {
	entries, err := readEmbeddedDir("skills")
	if err != nil {
		return
	}
	for _, e := range entries {
		if e.IsDir() && !shouldSkip(e.Name()) {
			copyEmbeddedDirRecursive(
				"skills/"+e.Name(),
				fmt.Sprintf("%s/skills/%s", claudeDir, e.Name()),
				"",
			)
		}
	}
}

// installHooks copies hooks/*.sh to ~/.claude/hooks/ with executable bit.
func installHooks() {
	destDir := fmt.Sprintf("%s/hooks", claudeDir)
	copyEmbeddedDirFlat("hooks", destDir, ".sh", true)
	// config.json is not executable but is needed by the user.
	copyEmbeddedDirFlat("hooks", destDir, ".json", false)
}
