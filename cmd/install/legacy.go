package main

import (
	"fmt"
	"os"
	"path/filepath"
)

// detectLegacyChromadbMCP surfaces the legacy ~/.claude/chromadb-mcp/ folder
// if it is present.
//
// In 1.0.x the knowledge-graph MCP server was installed at
// ~/.claude/chromadb-mcp/. As of 1.1.0 the destination moved to
// ~/.claude/knowledge-graph/. The MCP server entry in ~/.claude.json is
// rewritten by registerMCPServers(), so the legacy folder just becomes unused
// code on disk.
//
// The installer does NOT auto-delete the legacy folder (the user owns ~/.claude/).
// It surfaces the folder so the user can clean it up manually. The persistent
// KG data at ~/.claude/chromadb/ is unaffected.
func detectLegacyChromadbMCP() {
	legacy := filepath.Join(claudeDir, "chromadb-mcp")
	if _, err := os.Stat(legacy); os.IsNotExist(err) {
		return
	}

	newPath := filepath.Join(claudeDir, "knowledge-graph")
	fmt.Println()
	fmt.Println("Legacy install detected:")
	fmt.Printf("  %s\n", legacy)
	fmt.Println("  This folder was the 1.0.x install location of the knowledge-graph")
	fmt.Println("  MCP server. As of 1.1.0 the MCP server lives at")
	fmt.Printf("  %s and ~/.claude.json has been\n", newPath)
	fmt.Println("  rewritten to point at the new path. The legacy folder is unused.")
	fmt.Println("  To clean up (optional, the installer never deletes user files):")
	if isWindowsRuntime() {
		fmt.Printf(`    Remove-Item -Recurse -Force "%s"`+"\n", legacy)
	} else {
		fmt.Printf("    rm -rf %s\n", legacy)
	}
	fmt.Println("  Persistent KG data at ~/.claude/chromadb/ is unaffected and")
	fmt.Println("  continues to be read by the relocated MCP server.")
	fmt.Println()
}
