package main

import (
	"bytes"
	"fmt"
	"io/fs"
	"path/filepath"
	"runtime"
	"strings"
)

// printSummary prints the post-install report to stdout.
func printSummary(claudeJSONBackup string, mem MemoryMCPChoice, context7Preserved bool, mode InstallMode) {
	osLabel := map[string]string{
		"windows": "windows",
		"darwin":  "macos",
		"linux":   "linux",
	}[runtime.GOOS]
	if osLabel == "" {
		osLabel = runtime.GOOS
	}

	fmt.Println()
	fmt.Println("Summary:")
	fmt.Printf("  installed: %d\n", len(stats.Installed))
	fmt.Printf("  updated:   %d\n", len(stats.Updated))
	fmt.Printf("  unchanged: %d\n", len(stats.Unchanged))
	fmt.Printf("  conflicts: %d\n", len(stats.Conflicts))

	printModeSummary(mode)

	if len(stats.Conflicts) > 0 {
		fmt.Println()
		fmt.Println("Conflicts (on-disk differs from what this install mode would produce):")
		fmt.Println("  This happens when either:")
		fmt.Println("    (a) you modified the file manually — keep your edits, or")
		fmt.Println("    (b) you switched INSTALL_MODE since the last install — delete and re-run.")
		fmt.Println("  To overwrite all conflicts: re-run the installer with --force.")
		for _, c := range stats.Conflicts {
			fmt.Printf("  - %s\n", c)
		}
	}

	fmt.Println()
	fmt.Println("MCP servers in ~/.claude.json:")
	fmt.Printf("  %s\n", formatMemorySummary(mem))
	c7Status := "updated"
	if context7Preserved {
		c7Status = "preserved"
	}
	fmt.Printf("  - context7 (library docs): %s\n", c7Status)
	if claudeJSONBackup != "" {
		fmt.Printf("  backup: %s\n", claudeJSONBackup)
	} else {
		fmt.Println("  (no backup needed — file was not modified)")
	}

	fmt.Println()
	fmt.Printf("Manifest: %s\n", filepath.Join(claudeDir, manifestFilename))

	fmt.Println()
	fmt.Println("Next steps:")
	fmt.Println("  1. Restart Claude Code so it picks up the new MCP servers.")
	fmt.Printf("  2. To enable notification hooks, copy the \"%s\" section from\n", osLabel)
	fmt.Printf("     ~/.claude/hooks/config.json and merge it into\n")
	fmt.Printf("     ~/.claude/settings.json under the \"hooks\" key.\n")

	agentCount, skillCount := countInstalledAgentsAndSkills()
	fmt.Println()
	fmt.Printf("Installation complete. %d agents, %d skills installed.\n", agentCount, skillCount)
	fmt.Println("Restart Claude Code to load them.")
}

// countInstalledAgentsAndSkills counts the number of agent files (installed
// under an "agents" path segment) and skill files (installed under a "commands"
// path segment) across all outcome buckets. A file is counted only once
// regardless of which bucket it landed in.
func countInstalledAgentsAndSkills() (agents, skills int) {
	all := make([]string, 0, len(stats.Installed)+len(stats.Updated)+len(stats.Unchanged))
	all = append(all, stats.Installed...)
	all = append(all, stats.Updated...)
	all = append(all, stats.Unchanged...)
	for _, p := range all {
		fp := filepath.ToSlash(p)
		switch {
		case strings.Contains(fp, "/agents/"):
			agents++
		case strings.Contains(fp, "/commands/"):
			skills++
		}
	}
	return agents, skills
}

// readSourceFrontmatter reads the model: and effort: values from the embedded
// source frontmatter of an agent .md file. It uses the same line-by-line parse
// as the transformer, so it is always in sync with what the installer reads.
// Returns ("", "") if the file cannot be read or has no parseable values.
func readSourceFrontmatter(agentName string) (model, effort string) {
	data, err := fs.ReadFile(EmbeddedAssets(), "agents/"+agentName+".md")
	if err != nil {
		return "", ""
	}
	// Accept both LF and CRLF openers, consistent with transformAgentFile.
	hasCRLF := bytes.HasPrefix(data, []byte("---\r\n"))
	hasLF := bytes.HasPrefix(data, []byte("---\n"))
	if !hasCRLF && !hasLF {
		return "", ""
	}
	preambleLen := 4
	if hasCRLF {
		preambleLen = 5
	}
	fmEnd := findFrontmatterEnd(data, preambleLen)
	if fmEnd < 0 {
		return "", ""
	}
	// Walk frontmatter lines looking for model: and effort:.
	lines := bytes.Split(data[preambleLen:fmEnd], []byte("\n"))
	for _, raw := range lines {
		line := strings.TrimRight(string(raw), "\r")
		key := strings.TrimLeft(line, " \t")
		if isExactKey(key, "model:") && model == "" {
			model = strings.TrimSpace(key[len("model:"):])
		}
		if isExactKey(key, "effort:") && effort == "" {
			effort = strings.TrimSpace(key[len("effort:"):])
		}
	}
	return model, effort
}

// agentPrintOrder gives a stable output order for the per-agent diff lines.
var agentPrintOrder = []string{
	"orchestrator", "architect", "agent-builder", "security", "reviewer", "qa",
	"gcp-cost-analyzer", "init", "implementer", "plan-reviewer", "tester",
	"acceptance-checker", "diagrammer", "likec4-diagrammer", "d2-diagrammer",
	"translator", "delivery",
}

// printModeSummary prints the install-mode line and (for low-cost) a one-line
// per-agent diff for traceability (AC-8). Standard-mode values are read from
// the source agents/*.md frontmatter at runtime so the diff cannot drift from
// the actual files.
func printModeSummary(mode InstallMode) {
	fmt.Println()
	if mode == ModeStandard {
		fmt.Println("Install mode: standard")
		return
	}

	fmt.Println("Install mode: low-cost applied")
	fmt.Println()
	fmt.Println("Agent tier changes (model: standard → low-cost | effort: standard → low-cost):")
	for _, name := range agentPrintOrder {
		override, ok := lowCostMatrix[name]
		if !ok {
			continue
		}
		stdModel, stdEffort := readSourceFrontmatter(name)
		if stdModel == "" && stdEffort == "" {
			// Source file unreadable — skip rather than printing misleading diff.
			continue
		}
		modelChanged := stdModel != override.Model
		effortChanged := stdEffort != override.Effort
		if !modelChanged && !effortChanged {
			fmt.Printf("  %-20s (unchanged)\n", name)
			continue
		}
		modelPart := fmt.Sprintf("model: %s", stdModel)
		if modelChanged {
			modelPart = fmt.Sprintf("model: %s → %s", stdModel, override.Model)
		}
		effortPart := fmt.Sprintf("effort: %s", stdEffort)
		if effortChanged {
			effortPart = fmt.Sprintf("effort: %s → %s", stdEffort, override.Effort)
		}
		fmt.Printf("  %-20s %s | %s\n", name, modelPart, effortPart)
	}
}

// formatMemorySummary formats the memory MCP line for the summary.
func formatMemorySummary(mem MemoryMCPChoice) string {
	tag := " [updated]"
	if mem.Preserved {
		tag = " [preserved]"
	}
	return fmt.Sprintf("- memory (http) -> %s%s", mem.URL, tag)
}
