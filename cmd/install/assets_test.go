package main

import (
	"io/fs"
	"strings"
	"testing"
)

// TestEmbeddedAssets_ArchitectMD asserts that agents/architect.md is present,
// non-empty, and starts with a YAML frontmatter opening ("---\n" or "---\r\n").
// This is the key-file presence check from AC-6.
func TestEmbeddedAssets_ArchitectMD(t *testing.T) {
	embedded := EmbeddedAssets()

	data, err := fs.ReadFile(embedded, "agents/architect.md")
	if err != nil {
		t.Fatalf("agents/architect.md not found in embedded FS: %v", err)
	}
	if len(data) == 0 {
		t.Fatal("agents/architect.md is empty in embedded FS")
	}
	// Must start with a YAML frontmatter opening fence.
	hasLF := strings.HasPrefix(string(data), "---\n")
	hasCRLF := strings.HasPrefix(string(data), "---\r\n")
	if !hasLF && !hasCRLF {
		t.Errorf("agents/architect.md does not start with '---\\n' or '---\\r\\n'; first 20 bytes: %q", data[:min20(len(data))])
	}
}

// TestEmbeddedAssets_SharedSnippets asserts that the agents/_shared/ subdirectory
// is present in the embedded FS and contains the gh-fallback.md snippet. This
// validates that the "all:" prefix on the //go:embed directive correctly includes
// the underscore-prefixed directory.
func TestEmbeddedAssets_SharedSnippets(t *testing.T) {
	embedded := EmbeddedAssets()

	data, err := fs.ReadFile(embedded, "agents/_shared/gh-fallback.md")
	if err != nil {
		t.Fatalf("agents/_shared/gh-fallback.md not found in embedded FS: %v", err)
	}
	if len(data) == 0 {
		t.Fatal("agents/_shared/gh-fallback.md is empty in embedded FS")
	}
	// Spot-check that it contains the detection probe (canonical content marker).
	if !strings.Contains(string(data), "command -v gh") {
		t.Error("agents/_shared/gh-fallback.md is missing the detection probe ('command -v gh')")
	}
}

// TestEmbeddedAssets_AllExpectedAgents asserts every agent in the canonical
// roster is present in the embedded FS. This catches the case where a new agent is
// added to the repo but the embed directive is still pointing at the old directory.
func TestEmbeddedAssets_AllExpectedAgents(t *testing.T) {
	roster := []string{
		"adversary", "agent-builder", "architect", "cleaner", "code-researcher",
		"d2-diagrammer", "delivery", "diagrammer", "documenter", "gcp-cost-analyzer",
		"gcp-infra", "implementer", "init-project", "inline-reviewer",
		"likec4-diagrammer", "mentor",
		"orchestrator", "plan-reviewer", "qa", "research-consolidator",
		"pr-review-qa", "pr-review-security", "researcher", "reviewer",
		"reviewer-consolidator", "security", "tester",
		"translator", "ux-reviewer",
	}
	embedded := EmbeddedAssets()
	for _, name := range roster {
		path := "agents/" + name + ".md"
		data, err := fs.ReadFile(embedded, path)
		if err != nil {
			t.Errorf("agent %q not found in embedded FS: %v", name, err)
			continue
		}
		if len(data) == 0 {
			t.Errorf("agent %q is empty in embedded FS", name)
		}
	}
}

// TestEmbeddedAssets_SkillsPresent asserts that skills/ has at least 1 .md file.
// The exact count is intentionally loose here — skills are updated more
// frequently than agents and an exact count would require this test to change
// every time a new skill is added.
func TestEmbeddedAssets_SkillsPresent(t *testing.T) {
	embedded := EmbeddedAssets()
	var skillFiles []string
	err := fs.WalkDir(embedded, "skills", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !d.IsDir() && strings.HasSuffix(d.Name(), ".md") {
			skillFiles = append(skillFiles, path)
		}
		return nil
	})
	if err != nil {
		t.Fatalf("WalkDir skills: %v", err)
	}
	if len(skillFiles) == 0 {
		t.Error("no .md files found under skills/ in embedded FS")
	}
}

// TestEmbeddedAssets_HooksPresent asserts that hooks/ contains at least one .sh
// file (the hook scripts).
func TestEmbeddedAssets_HooksPresent(t *testing.T) {
	embedded := EmbeddedAssets()
	var hookFiles []string
	err := fs.WalkDir(embedded, "hooks", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !d.IsDir() && strings.HasSuffix(d.Name(), ".sh") {
			hookFiles = append(hookFiles, path)
		}
		return nil
	})
	if err != nil {
		t.Fatalf("WalkDir hooks: %v", err)
	}
	if len(hookFiles) == 0 {
		t.Error("no .sh files found under hooks/ in embedded FS")
	}
}

// TestEmbeddedAssets_HooksConfigJSONRetired asserts that hooks/config.json —
// the Go installer's CC wiring template — no longer exists in the embedded
// FS. The CC install path was retired in the hook Bash->TS cutover (#446):
// the marketplace plugin's .claude-plugin/hooks.json is the only CC wiring
// path now, and config.json is not rewired to it.
func TestEmbeddedAssets_HooksConfigJSONRetired(t *testing.T) {
	embedded := EmbeddedAssets()

	if _, err := fs.ReadFile(embedded, "hooks/config.json"); err == nil {
		t.Fatal("hooks/config.json still present in embedded FS — the Go installer's CC path was retired and this file should have been deleted")
	}
}

// min20 returns the minimum of n and 20, for safe slice bounds on short data.
func min20(n int) int {
	if n < 20 {
		return n
	}
	return 20
}
