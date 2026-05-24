// Package main is the team-harness installer.
//
// It installs agents, skills, hooks, and registers the memory + context7 MCP
// servers in ~/.claude/ and ~/.claude.json. The Memory MCP server is an
// external service (context-harness-mcp or compatible); this installer does
// not bundle or copy any server source code.
//
// Flags:
//
//	--force   bypass preservation of existing mcpServer entries in ~/.claude.json.
//	          Has no effect on file installation — agents/skills/hooks are always
//	          overwritten unconditionally regardless of this flag.
package main

import (
	"fmt"
	"os"
	"runtime"
	"strings"
	"time"
)

// version is injected at build time via -ldflags "-X main.version=2.0.0".
// Note: the value is the BARE semver (no leading "v"). The "v" is added by
// the printf in main(). The release workflow strips the leading "v" from
// the git tag (e.g. v2.0.1 → 2.0.1) before injecting — see release.yml.
var version = "2.16.1"

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
	resolveClaudePaths()

	printWelcomeBanner()

	// Force UTF-8 on Windows by ensuring output isn't transcoded.
	// (Go's stdout is already binary; this note is for awareness only.)

	fmt.Printf("team-harness installer v%s\n", version)
	fmt.Printf("  source:   embedded\n")
	fmt.Printf("  target:   %s\n", claudeDir)
	fmt.Printf("  platform: %s\n", runtime.GOOS)
	fmt.Println()

	fmt.Println("Checking dependencies...")
	checkDependencies()
	fmt.Println()

	fmt.Println("context7 setup:")
	context7Key := getContext7APIKey()
	fmt.Println()

	fmt.Println("Memory MCP setup:")
	memChoice := promptMemoryMCPURL()
	fmt.Println()

	fmt.Println("Install mode setup:")
	installMode := promptInstallMode()
	fmt.Println()

	ensureDir(claudeDir)
	loadManifest()
	if prev := manifest.InstalledVersion; prev != "" {
		fmt.Printf("Detected previous install (version %s). Updating...\n", prev)
	} else {
		fmt.Println("Fresh install.")
	}
	fmt.Println()

	fmt.Println("Installing files...")
	installAgents(installMode)
	installSkills()
	installHooks()

	// Determine whether the context7 key will change for accurate summary reporting.
	existing := readExistingMCPServers()
	existingC7 := mapGet(existing, "context7")
	existingC7Key := strings.TrimSpace(mapGetString(existingC7, "headers", "CONTEXT7_API_KEY"))
	context7Preserved := context7Key == existingC7Key && isValidContext7Key(existingC7Key)

	fmt.Println("Registering MCP servers in ~/.claude.json...")
	backupPath := registerMCPServers(context7Key, memChoice)

	saveManifest()

	printSummary(backupPath, memChoice, context7Preserved, installMode)
	pressEnterToExit()
}

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
	if err := copyFileRaw(claudeJSON, backup); err != nil {
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

// installSkills copies flat .md skills to ~/.claude/commands/ and subdirectory
// skills to ~/.claude/skills/<name>/.
func installSkills() {
	destCommands := fmt.Sprintf("%s/commands", claudeDir)
	copyEmbeddedDirFlat("skills", destCommands, ".md", false)

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
