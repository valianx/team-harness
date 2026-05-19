package main

import "path/filepath"

// installKnowledgeGraph copies the knowledge-graph source tree to
// ~/.claude/knowledge-graph/, marking .sh files executable.
func installKnowledgeGraph() {
	copyDirRecursive(
		filepath.Join(repoRoot, "knowledge-graph"),
		filepath.Join(claudeDir, "knowledge-graph"),
		".sh",
	)
}
