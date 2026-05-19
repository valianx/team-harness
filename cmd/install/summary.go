package main

import (
	"fmt"
	"path/filepath"
	"runtime"
)

// printSummary prints the post-install report to stdout.
func printSummary(claudeJSONBackup string, kg KGBackendChoice, context7Preserved bool) {
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
	fmt.Printf("  %s\n", formatKGBackendSummary(kg))
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

// formatKGBackendSummary formats the memory backend line for the summary.
func formatKGBackendSummary(kg KGBackendChoice) string {
	if kg.Skipped {
		return "- memory: (skipped - no MCP entry written)"
	}
	tag := " [updated]"
	if kg.Preserved {
		tag = " [preserved]"
	}
	if kg.Backend == "context-harness" && kg.URL != "" {
		return fmt.Sprintf("- memory: context-harness (http) -> %s%s", kg.URL, tag)
	}
	kgPath := filepath.Join(claudeDir, "knowledge-graph")
	return fmt.Sprintf("- memory: ChromaDB (stdio) -> %s%s", kgPath, tag)
}
