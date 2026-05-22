package main

import (
	"fmt"
	"path/filepath"
	"runtime"
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
		fmt.Println("Conflicts (locally modified — left untouched):")
		fmt.Println("  Delete the file manually and re-run to replace with the repo version.")
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
	fmt.Printf("  2. To enable notification hooks, open hooks/config.json in this repo,\n")
	fmt.Printf("     copy the \"%s\" section, and merge it into\n", osLabel)
	fmt.Printf("     ~/.claude/settings.json under the \"hooks\" key.\n")
}

// standardMatrix is the canonical standard-mode model+effort per agent, read
// from agents/README.md §Roster. Used only for computing the per-agent diff
// line in the summary — no file IO at install time. Kept in sync with the
// agents/*.md source frontmatter by the test suite (modes_test.go).
var standardMatrix = map[string][2]string{
	"orchestrator":       {"opus", "high"},
	"architect":          {"opus", "max"},
	"agent-builder":      {"opus", "max"},
	"security":           {"opus", "max"},
	"reviewer":           {"opus", "max"},
	"qa":                 {"opus", "high"},
	"gcp-cost-analyzer":  {"opus", "high"},
	"init":               {"opus", "medium"},
	"implementer":        {"sonnet", "high"},
	"plan-reviewer":      {"sonnet", "medium"},
	"tester":             {"sonnet", "medium"},
	"acceptance-checker": {"sonnet", "medium"},
	"diagrammer":         {"sonnet", "medium"},
	"likec4-diagrammer":  {"sonnet", "medium"},
	"d2-diagrammer":      {"sonnet", "medium"},
	"translator":         {"sonnet", "medium"},
	"delivery":           {"sonnet", "medium"},
}

// agentPrintOrder gives a stable output order for the per-agent diff lines.
var agentPrintOrder = []string{
	"orchestrator", "architect", "agent-builder", "security", "reviewer", "qa",
	"gcp-cost-analyzer", "init", "implementer", "plan-reviewer", "tester",
	"acceptance-checker", "diagrammer", "likec4-diagrammer", "d2-diagrammer",
	"translator", "delivery",
}

// printModeSummary prints the install-mode line and (for low-cost) a one-line
// per-agent diff for traceability (AC-8).
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
		std, stdOK := standardMatrix[name]
		if !stdOK {
			continue
		}
		// Only print lines where something actually changed.
		modelChanged := std[0] != override.Model
		effortChanged := std[1] != override.Effort
		if !modelChanged && !effortChanged {
			fmt.Printf("  %-20s (unchanged)\n", name)
			continue
		}
		modelPart := fmt.Sprintf("model: %s", std[0])
		if modelChanged {
			modelPart = fmt.Sprintf("model: %s → %s", std[0], override.Model)
		}
		effortPart := fmt.Sprintf("effort: %s", std[1])
		if effortChanged {
			effortPart = fmt.Sprintf("effort: %s → %s", std[1], override.Effort)
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
