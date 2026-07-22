package main

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// ---------------------------------------------------------------------------
// Suite A — lowCostMatrix invariants
// ---------------------------------------------------------------------------

// TestLowCostMatrixInvariants verifies the canonical constraints on the matrix:
//   - every model is "sonnet" (no opus, no haiku)
//   - every effort is "medium" or "high" (no max, no low)
//   - all 18 expected agents are present
func TestLowCostMatrixInvariants(t *testing.T) {
	expectedAgents := []string{
		"leader", "orchestrator", "architect", "agent-builder", "security", "reviewer",
		"reviewer-consolidator",
		"qa", "plan-reviewer", "gcp-cost-analyzer", "init", "implementer",
		"tester", "diagrammer", "likec4-diagrammer",
		"d2-diagrammer", "translator", "delivery",
	}

	if len(lowCostMatrix) != len(expectedAgents) {
		t.Errorf("lowCostMatrix has %d entries, want %d", len(lowCostMatrix), len(expectedAgents))
	}

	for _, name := range expectedAgents {
		override, ok := lowCostMatrix[name]
		if !ok {
			t.Errorf("lowCostMatrix missing entry for %q", name)
			continue
		}
		if override.Model != "sonnet" {
			t.Errorf("lowCostMatrix[%q].Model = %q, want \"sonnet\"", name, override.Model)
		}
		validEffort := override.Effort == "medium" || override.Effort == "high"
		if !validEffort {
			t.Errorf("lowCostMatrix[%q].Effort = %q, want \"medium\" or \"high\"", name, override.Effort)
		}
	}
}

// TestLowCostMatrixTally verifies the 7 high / 11 medium split from the architecture.
func TestLowCostMatrixTally(t *testing.T) {
	high := []string{"leader", "orchestrator", "architect", "agent-builder", "security", "reviewer", "qa"}
	medium := []string{
		"plan-reviewer", "gcp-cost-analyzer", "init", "implementer",
		"tester", "diagrammer", "likec4-diagrammer",
		"d2-diagrammer", "translator", "delivery",
		"reviewer-consolidator",
	}

	for _, name := range high {
		if o, ok := lowCostMatrix[name]; !ok || o.Effort != "high" {
			t.Errorf("expected %q to have effort=high in low-cost matrix", name)
		}
	}
	for _, name := range medium {
		if o, ok := lowCostMatrix[name]; !ok || o.Effort != "medium" {
			t.Errorf("expected %q to have effort=medium in low-cost matrix", name)
		}
	}
}

// ---------------------------------------------------------------------------
// Suite B — transformAgentFile: standard mode pass-through
// ---------------------------------------------------------------------------

func TestTransformAgentFile_StandardMode_IsPassthrough(t *testing.T) {
	src := []byte("---\nname: architect\nmodel: opus\neffort: max\n---\nBody text.\n")
	got := transformAgentFile(src, "architect", ModeStandard)
	if string(got) != string(src) {
		t.Errorf("standard mode should be a pass-through; got:\n%s", got)
	}
}

func TestTransformAgentFile_StandardMode_UnknownAgent_IsPassthrough(t *testing.T) {
	src := []byte("---\nname: unknown\nmodel: opus\neffort: max\n---\n")
	got := transformAgentFile(src, "unknown", ModeStandard)
	if string(got) != string(src) {
		t.Errorf("standard mode must never transform any file")
	}
}

// ---------------------------------------------------------------------------
// Suite C — transformAgentFile: low-cost mode rewrites
// ---------------------------------------------------------------------------

// TestTransformAgentFile_LowCostMode_RewritesModelAndEffort verifies the core
// behaviour: model: and effort: lines are rewritten; everything else is unchanged.
func TestTransformAgentFile_LowCostMode_RewritesModelAndEffort(t *testing.T) {
	src := []byte("---\nname: architect\nmodel: opus\neffort: max\ncolor: yellow\n---\nPrompt body.\n")
	got := transformAgentFile(src, "architect", ModeLowCost)

	want := "---\nname: architect\nmodel: sonnet\neffort: high\ncolor: yellow\n---\nPrompt body.\n"
	if string(got) != want {
		t.Errorf("unexpected transform output:\ngot:  %q\nwant: %q", got, want)
	}
}

// TestTransformAgentFile_LowCostMode_BodyPreservedVerbatim verifies that a
// "model:" occurrence in the prompt body (e.g. a code block) is NOT rewritten.
func TestTransformAgentFile_LowCostMode_BodyPreservedVerbatim(t *testing.T) {
	src := []byte("---\nmodel: opus\neffort: max\n---\n# Notes\nmodel: some discussion\neffort: explanation\n")
	got := transformAgentFile(src, "architect", ModeLowCost)
	body := strings.Split(string(got), "---\n")
	if len(body) < 3 {
		t.Fatal("expected frontmatter + body split")
	}
	promptBody := body[2] // everything after the closing ---
	if !strings.Contains(promptBody, "model: some discussion") {
		t.Errorf("body model: line was rewritten; should be preserved: %q", promptBody)
	}
	if !strings.Contains(promptBody, "effort: explanation") {
		t.Errorf("body effort: line was rewritten; should be preserved: %q", promptBody)
	}
}

// TestTransformAgentFile_LowCostMode_AllAgents verifies that every agent in
// the canonical matrix gets the correct model+effort when transformed.
func TestTransformAgentFile_LowCostMode_AllAgents(t *testing.T) {
	for name, want := range lowCostMatrix {
		src := []byte(fmt.Sprintf("---\nname: %s\nmodel: opus\neffort: max\ncolor: blue\n---\nbody.\n", name))
		got := transformAgentFile(src, name, ModeLowCost)

		if !strings.Contains(string(got), "model: "+want.Model+"\n") {
			t.Errorf("agent %q: expected model=%q in output; got:\n%s", name, want.Model, got)
		}
		if !strings.Contains(string(got), "effort: "+want.Effort+"\n") {
			t.Errorf("agent %q: expected effort=%q in output; got:\n%s", name, want.Effort, got)
		}
	}
}

// TestTransformAgentFile_LowCostMode_PassthroughAgentsUnchanged verifies that
// agents already at sonnet/medium produce byte-identical output.
func TestTransformAgentFile_LowCostMode_PassthroughAgentsUnchanged(t *testing.T) {
	passthroughAgents := []string{
		"plan-reviewer", "tester",
		"diagrammer", "likec4-diagrammer", "d2-diagrammer", "translator", "delivery",
	}
	for _, name := range passthroughAgents {
		src := []byte(fmt.Sprintf("---\nname: %s\nmodel: sonnet\neffort: medium\n---\nbody.\n", name))
		got := transformAgentFile(src, name, ModeLowCost)
		if string(got) != string(src) {
			t.Errorf("agent %q: sonnet/medium should be unchanged; got:\n%s", name, got)
		}
	}
}

// ---------------------------------------------------------------------------
// Suite D — transformAgentFile: edge cases
// ---------------------------------------------------------------------------

// TestTransformAgentFile_LowCostMode_UnknownAgent_IsPassthrough verifies that
// an agent not in the matrix (e.g. a reference file) is returned unchanged.
func TestTransformAgentFile_LowCostMode_UnknownAgent_IsPassthrough(t *testing.T) {
	src := []byte("---\nname: ref-direct-modes\nmodel: sonnet\neffort: medium\n---\nbody.\n")
	got := transformAgentFile(src, "ref-direct-modes", ModeLowCost)
	if string(got) != string(src) {
		t.Errorf("unknown agent in low-cost mode should be a pass-through; got:\n%s", got)
	}
}

// TestTransformAgentFile_LowCostMode_MalformedFrontmatter_NoClosingFence returns
// bytes unchanged when the opening --- exists but the closing --- is absent.
func TestTransformAgentFile_LowCostMode_MalformedFrontmatter_NoClosingFence(t *testing.T) {
	src := []byte("---\nname: architect\nmodel: opus\n")
	got := transformAgentFile(src, "architect", ModeLowCost)
	if string(got) != string(src) {
		t.Errorf("malformed frontmatter (no closing fence) must return unchanged bytes")
	}
}

// TestTransformAgentFile_LowCostMode_MalformedFrontmatter_NoOpeningFence returns
// bytes unchanged when no frontmatter opening is present.
func TestTransformAgentFile_LowCostMode_MalformedFrontmatter_NoOpeningFence(t *testing.T) {
	src := []byte("name: architect\nmodel: opus\n")
	got := transformAgentFile(src, "architect", ModeLowCost)
	if string(got) != string(src) {
		t.Errorf("malformed frontmatter (no opening fence) must return unchanged bytes")
	}
}

// TestTransformAgentFile_LowCostMode_EmptyInput returns empty bytes unchanged.
func TestTransformAgentFile_LowCostMode_EmptyInput(t *testing.T) {
	src := []byte("")
	got := transformAgentFile(src, "architect", ModeLowCost)
	if len(got) != 0 {
		t.Errorf("empty input must return empty output, got: %q", got)
	}
}

// TestTransformAgentFile_LowCostMode_CRLFInput_RewritesCorrectly verifies that
// agent files with CRLF line endings (produced by git on Windows with
// core.autocrlf=true, the default) are correctly transformed and that the CRLF
// line endings are preserved verbatim in the output — not normalised to LF.
// This is the platform-correctness test for IR-001.
func TestTransformAgentFile_LowCostMode_CRLFInput_RewritesCorrectly(t *testing.T) {
	// Fixture with CRLF throughout — mirrors what git checkout produces on
	// Windows with core.autocrlf=true for a typical agent file.
	src := []byte("---\r\nname: architect\r\nmodel: opus\r\neffort: max\r\n---\r\nBody text.\r\n")
	got := transformAgentFile(src, "architect", ModeLowCost)

	// model: must be rewritten to sonnet.
	if !strings.Contains(string(got), "model: sonnet\r\n") {
		t.Errorf("CRLF input: expected 'model: sonnet\\r\\n' in output; got: %q", got)
	}
	// effort: must be rewritten to high (architect is in the high tier).
	if !strings.Contains(string(got), "effort: high\r\n") {
		t.Errorf("CRLF input: expected 'effort: high\\r\\n' in output; got: %q", got)
	}
	// No LF-only newlines should appear — all lines must end with CRLF.
	// A LF not preceded by CR indicates the transformer silently converted the file.
	gotStr := string(got)
	for i, ch := range gotStr {
		if ch == '\n' && (i == 0 || gotStr[i-1] != '\r') {
			t.Errorf("CRLF input: bare LF found at position %d — transformer must not normalise line endings; full output: %q", i, got)
			break
		}
	}
}

// TestTransformAgentFile_LowCostMode_ModelIDKey_NotRewritten verifies that a
// hypothetical future frontmatter key like "model_id:" is not matched by the
// "model:" prefix check. This is the regression fixture for IR-004.
func TestTransformAgentFile_LowCostMode_ModelIDKey_NotRewritten(t *testing.T) {
	// Frontmatter with model_id: alongside the real model: key.
	src := []byte("---\nname: architect\nmodel: opus\nmodel_id: 4-6\neffort: max\n---\nbody.\n")
	got := transformAgentFile(src, "architect", ModeLowCost)

	// model: must be rewritten.
	if !strings.Contains(string(got), "model: sonnet\n") {
		t.Errorf("expected 'model: sonnet' in output; got: %q", got)
	}
	// model_id: must be left untouched.
	if !strings.Contains(string(got), "model_id: 4-6\n") {
		t.Errorf("model_id: line was incorrectly rewritten; got: %q", got)
	}
}

// ---------------------------------------------------------------------------
// Suite E — agentNameFromPath
// ---------------------------------------------------------------------------

func TestAgentNameFromPath(t *testing.T) {
	// POSIX-path cases run on all platforms.
	posixCases := []struct {
		path string
		want string
	}{
		{"/home/user/.claude/agents/architect.md", "architect"},
		{"delivery.md", "delivery"},
		{"plan-reviewer.md", "plan-reviewer"},
		{"noextension", "noextension"},
	}
	for _, tc := range posixCases {
		got := agentNameFromPath(tc.path)
		if got != tc.want {
			t.Errorf("agentNameFromPath(%q) = %q, want %q", tc.path, got, tc.want)
		}
	}

	// Windows-style backslash paths: filepath.Base does not split backslashes on
	// Linux, so this case is gated to Windows only.
	if runtime.GOOS == "windows" {
		windowsCases := []struct {
			path string
			want string
		}{
			{`C:\Users\user\.claude\agents\leader.md`, "leader"},
		}
		for _, tc := range windowsCases {
			got := agentNameFromPath(tc.path)
			if got != tc.want {
				t.Errorf("agentNameFromPath(%q) = %q, want %q", tc.path, got, tc.want)
			}
		}
	}
}

// ---------------------------------------------------------------------------
// Suite F — AC-5 integration: same-mode re-install → unchanged;
//           cross-mode re-install → overwrite (unconditional);
//           --force flag → no-op for file installation (accepted, no behavior change).
// ---------------------------------------------------------------------------

// TestAC5_SameModeReinstall_ReportsUnchanged verifies that a same-mode re-install
// reports the agent as unchanged (the manifest stores the transformed hash).
// Uses the embedded architect.md as the source (the real embedded bytes).
func TestAC5_SameModeReinstall_ReportsUnchanged(t *testing.T) {
	_, cleanup := testEnv(t)
	defer cleanup()

	// Use the embedded architect.md as the source path.
	srcPath := "agents/architect.md"
	destPath := filepath.Join(claudeDir, "agents", "architect.md")

	// First install in low-cost mode.
	stats.Installed = nil
	stats.Unchanged = nil
	stats.Updated = nil
	copyAgentFile(srcPath, destPath, ModeLowCost)

	if len(stats.Installed) != 1 {
		t.Fatalf("expected 1 installed file, got installed=%v unchanged=%v", stats.Installed, stats.Unchanged)
	}

	// Re-install with the same mode — must report unchanged.
	stats.Installed = nil
	stats.Unchanged = nil
	stats.Updated = nil
	copyAgentFile(srcPath, destPath, ModeLowCost)

	if len(stats.Unchanged) != 1 {
		t.Errorf("same-mode re-install must report unchanged; got installed=%v unchanged=%v updated=%v",
			stats.Installed, stats.Unchanged, stats.Updated)
	}
}

// TestAC5_CrossModeReinstall_OverwritesOnDiskDiffers verifies that switching from
// low-cost to standard overwrites the file unconditionally (no conflict gating).
func TestAC5_CrossModeReinstall_OverwritesOnDiskDiffers(t *testing.T) {
	_, cleanup := testEnv(t)
	defer cleanup()

	srcPath := "agents/architect.md"
	destPath := filepath.Join(claudeDir, "agents", "architect.md")

	// Install in low-cost mode.
	stats.Installed = nil
	stats.Unchanged = nil
	stats.Updated = nil
	copyAgentFile(srcPath, destPath, ModeLowCost)

	if len(stats.Installed) != 1 {
		t.Fatal("expected initial install")
	}

	// Re-install in standard mode: on-disk hash is the low-cost transformed hash;
	// the standard transformed hash is the source hash (no transform); they differ.
	// The installer must overwrite unconditionally — no conflict gate.
	forceFlag = false
	stats.Installed = nil
	stats.Unchanged = nil
	stats.Updated = nil
	copyAgentFile(srcPath, destPath, ModeStandard)

	if len(stats.Updated) != 1 {
		t.Errorf("cross-mode re-install must overwrite and report updated; got installed=%v unchanged=%v updated=%v",
			stats.Installed, stats.Unchanged, stats.Updated)
	}

	// On-disk content must now be standard (original frontmatter — no sonnet rewrite).
	content, _ := os.ReadFile(destPath)
	if strings.Contains(string(content), "model: sonnet") {
		t.Errorf("after standard re-install, disk must not have model: sonnet (low-cost bytes); got:\n%s", content)
	}
}

// TestAC5_CrossModeReinstall_ForceFlagIsNoOp verifies that --force is accepted
// but does not change behavior — the installer always overwrites regardless.
func TestAC5_CrossModeReinstall_ForceFlagIsNoOp(t *testing.T) {
	_, cleanup := testEnv(t)
	defer cleanup()

	srcPath := "agents/architect.md"
	destPath := filepath.Join(claudeDir, "agents", "architect.md")

	// Install in low-cost mode.
	stats.Installed = nil
	stats.Unchanged = nil
	stats.Updated = nil
	copyAgentFile(srcPath, destPath, ModeLowCost)

	if len(stats.Installed) != 1 {
		t.Fatal("expected initial install")
	}

	// Read what was written to disk (should be low-cost: sonnet/high — architect is high).
	lowCostContent, _ := os.ReadFile(destPath)
	if !strings.Contains(string(lowCostContent), "model: sonnet") {
		t.Fatalf("low-cost install must produce sonnet on disk; got:\n%s", lowCostContent)
	}

	// Re-install in standard mode with --force (which is now a no-op for file installs).
	// The installer overwrites unconditionally whether --force is set or not.
	forceFlag = true
	stats.Installed = nil
	stats.Unchanged = nil
	stats.Updated = nil
	copyAgentFile(srcPath, destPath, ModeStandard)

	if len(stats.Updated) != 1 {
		t.Errorf("cross-mode re-install must report updated; got installed=%v updated=%v unchanged=%v",
			stats.Installed, stats.Updated, stats.Unchanged)
	}

	// On-disk content must now be standard (original frontmatter from the embedded file).
	standardContent, _ := os.ReadFile(destPath)
	if strings.Contains(string(standardContent), "model: sonnet") {
		t.Errorf("after standard re-install, disk must not have model: sonnet (low-cost); got:\n%s", standardContent)
	}
}

// ---------------------------------------------------------------------------
// Suite G — AC-2: promptInstallMode env-var and non-interactive-default paths
//
// These tests cover the non-interactive paths of promptInstallMode():
//   - INSTALL_MODE=low-cost  → ModeLowCost
//   - INSTALL_MODE=standard  → ModeStandard
//   - INSTALL_MODE unset     → ModeStandard (v1.1.0 compatibility default)
//
// The interactive TTY path and the invalid-value exit-1 path are not exercised
// here because (a) the test runner is never a TTY so the interactive branch is
// unreachable in CI, and (b) capturing os.Exit requires subprocess wiring that
// is disproportionate for a single validation error path. Both are noted in
// 03-testing.md as manual-only.
// ---------------------------------------------------------------------------

// TestPromptInstallMode_EnvVarLowCost verifies that INSTALL_MODE=low-cost is
// read and returned as ModeLowCost without prompting. This is the primary
// non-interactive install path for operators who want low-cost mode in CI.
func TestPromptInstallMode_EnvVarLowCost(t *testing.T) {
	t.Setenv("INSTALL_MODE", "low-cost")
	got := promptInstallMode()
	if got != ModeLowCost {
		t.Errorf("INSTALL_MODE=low-cost: expected ModeLowCost, got %q", got)
	}
}

// TestPromptInstallMode_EnvVarStandard verifies that INSTALL_MODE=standard is
// read and returned as ModeStandard without prompting.
func TestPromptInstallMode_EnvVarStandard(t *testing.T) {
	t.Setenv("INSTALL_MODE", "standard")
	got := promptInstallMode()
	if got != ModeStandard {
		t.Errorf("INSTALL_MODE=standard: expected ModeStandard, got %q", got)
	}
}

// TestPromptInstallMode_EnvVarUnset_DefaultsToStandard verifies that an unset
// INSTALL_MODE in non-interactive mode returns ModeStandard — preserving the
// byte-identical v1.1.0 behaviour (AC-2: "INSTALL_MODE unset → standard").
// The test runner is never a TTY, so isTerminal() returns false and the
// non-interactive default branch fires.
func TestPromptInstallMode_EnvVarUnset_DefaultsToStandard(t *testing.T) {
	t.Setenv("INSTALL_MODE", "")
	got := promptInstallMode()
	if got != ModeStandard {
		t.Errorf("INSTALL_MODE unset (non-interactive): expected ModeStandard, got %q", got)
	}
}

// TestPromptInstallMode_EnvVarWithWhitespace verifies that leading/trailing
// whitespace in the env var is trimmed before matching (defensive: shell
// quoting edge case with trailing space).
func TestPromptInstallMode_EnvVarWithWhitespace(t *testing.T) {
	t.Setenv("INSTALL_MODE", "  low-cost  ")
	got := promptInstallMode()
	if got != ModeLowCost {
		t.Errorf("INSTALL_MODE with whitespace: expected ModeLowCost, got %q", got)
	}
}
