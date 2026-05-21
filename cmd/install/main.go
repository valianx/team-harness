// Package main is the team-harness installer.
//
// It installs agents, skills, hooks, and registers the memory + context7 MCP
// servers in ~/.claude/ and ~/.claude.json. The Memory MCP server is an
// external service (context-harness-mcp or compatible); this installer does
// not bundle or copy any server source code.
//
// Flags:
//
//	--force   bypass preservation; overwrite existing mcpServer entries.
package main

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// version is injected at build time via -ldflags "-X main.version=2.0.0".
// Note: the value is the BARE semver (no leading "v"). The "v" is added by
// the printf in main(). The release workflow strips the leading "v" from
// the git tag (e.g. v2.0.1 → 2.0.1) before injecting — see release.yml.
var version = "2.1.0"

// forceFlag is set by parseFlags and read throughout the package.
var forceFlag bool

// repoRoot is the directory that contains go.mod / cmd/ / agents/ / skills/ etc.
// It is resolved at startup relative to the running binary's location.
var repoRoot string

// claudeDir is ~/.claude
var claudeDir string

// claudeJSON is ~/.claude.json
var claudeJSON string

func main() {
	parseFlags()
	resolveRepoPaths()

	// Force UTF-8 on Windows by ensuring output isn't transcoded.
	// (Go's stdout is already binary; this note is for awareness only.)

	fmt.Printf("team-harness installer v%s\n", version)
	fmt.Printf("  source:   %s\n", repoRoot)
	fmt.Printf("  target:   %s\n", claudeDir)
	fmt.Printf("  platform: %s\n", runtime.GOOS)
	fmt.Println()

	fmt.Println("Checking dependencies...")
	checkDependencies()
	fmt.Println("  gh: ok")
	fmt.Println()

	fmt.Println("context7 setup:")
	context7Key := getContext7APIKey()
	fmt.Println()

	fmt.Println("Memory MCP setup:")
	memChoice := promptMemoryMCPURL()
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
	installAgents()
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

	printSummary(backupPath, memChoice, context7Preserved)
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
	if forceFlag {
		fmt.Println("  --force: bypassing preservation; will overwrite existing entries.")
	}
}

// resolveRepoPaths locates the repo root by walking up from the binary's location
// until it finds go.mod, then sets claudeDir and claudeJSON.
func resolveRepoPaths() {
	exe, err := os.Executable()
	if err != nil {
		// Fallback: walk from cwd.
		exe, _ = os.Getwd()
	}
	dir := filepath.Dir(exe)

	// Walk up to find go.mod (repo root indicator).
	for {
		if _, statErr := os.Stat(filepath.Join(dir, "go.mod")); statErr == nil {
			repoRoot = dir
			break
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			// Hit filesystem root — fall back to cwd.
			repoRoot, _ = os.Getwd()
			break
		}
		dir = parent
	}

	home, _ := os.UserHomeDir()
	claudeDir = filepath.Join(home, ".claude")
	claudeJSON = filepath.Join(home, ".claude.json")
}

// checkDependencies ensures required CLI tools are in PATH.
func checkDependencies() {
	// uv is only needed by the deprecated Python installer; the Go binary doesn't
	// require it.  We still check for gh, which is used by skills at runtime.
	requireCLI("gh", "Install GitHub CLI: https://cli.github.com/")
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

// installAgents copies agents/*.md to ~/.claude/agents/.
func installAgents() {
	copyDirFlat(filepath.Join(repoRoot, "agents"), filepath.Join(claudeDir, "agents"), ".md", false)
}

// installSkills copies flat .md skills to ~/.claude/commands/ and subdirectory
// skills to ~/.claude/skills/<name>/.
func installSkills() {
	skillsSrc := filepath.Join(repoRoot, "skills")
	copyDirFlat(skillsSrc, filepath.Join(claudeDir, "commands"), ".md", false)

	entries, err := os.ReadDir(skillsSrc)
	if err != nil {
		return
	}
	for _, e := range entries {
		if e.IsDir() && !shouldSkip(e.Name()) {
			copyDirRecursive(
				filepath.Join(skillsSrc, e.Name()),
				filepath.Join(claudeDir, "skills", e.Name()),
				"",
			)
		}
	}
}

// installHooks copies hooks/*.sh to ~/.claude/hooks/ with executable bit.
func installHooks() {
	copyDirFlat(filepath.Join(repoRoot, "hooks"), filepath.Join(claudeDir, "hooks"), ".sh", true)
}
