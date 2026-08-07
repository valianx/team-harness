package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"
	"time"
)

// ---------------------------------------------------------------------------
// AC-2: plan writes nothing
// ---------------------------------------------------------------------------

// TestComputePlan_WritesNothing verifies AC-2: ComputePlan returns a PlanDiff
// but does not create, modify, or delete any files under the placer's config
// root, and does not modify the ledger file.
func TestComputePlan_WritesNothing(t *testing.T) {
	dataDir, cleanup := ledgerTestEnv(t)
	defer cleanup()

	configRoot := t.TempDir()

	// Build a small in-memory FS with the source file.
	mockFS := fstest.MapFS{
		"agents/test.md": &fstest.MapFile{
			Data:    []byte("# Test agent\n"),
			ModTime: time.Now(),
		},
	}

	m := ModuleManifest{
		SchemaVersion:  1,
		Module:         "test-mod",
		Description:    "test",
		DefaultInstall: "always",
		Components:     []string{"test-comp"},
	}
	c := ComponentManifest{
		SchemaVersion: 1,
		Component:     "test-comp",
		Module:        "test-mod",
		Kind:          "agent",
		Source:        "agents/test.md",
		Cost:          "low",
		Stability:     "stable",
		Emits: OwnershipTags{
			Files:      []string{"{config_root}/agents/test.md"},
			ConfigKeys: []string{},
		},
	}

	placer := newClaudeCodePlacerAt(configRoot)

	// Snapshot config root before plan.
	beforeEntries, _ := os.ReadDir(configRoot)

	// Snapshot ledger mtime before plan.
	ledgerPath := filepath.Join(dataDir, ledgerFilename)
	var ledgerMtimeBefore time.Time
	if fi, err := os.Stat(ledgerPath); err == nil {
		ledgerMtimeBefore = fi.ModTime()
	}

	diff, err := ComputePlan([]ModuleManifest{m}, []ComponentManifest{c}, []string{"test-comp"}, placer, mockFS, nil)
	if err != nil {
		t.Fatalf("ComputePlan: %v", err)
	}

	// Verify the diff result (file is absent → ToCreate).
	if len(diff.ToCreate) != 1 {
		t.Errorf("expected 1 ToCreate, got %d", len(diff.ToCreate))
	}

	// Verify no files were created under config root.
	afterEntries, _ := os.ReadDir(configRoot)
	if len(afterEntries) != len(beforeEntries) {
		t.Errorf("ComputePlan created files under config root: before=%d entries, after=%d entries", len(beforeEntries), len(afterEntries))
	}

	// Verify ledger was not modified.
	if fi, err := os.Stat(ledgerPath); err == nil {
		if !fi.ModTime().Equal(ledgerMtimeBefore) {
			t.Error("ComputePlan modified the ledger file — it must write nothing")
		}
	}
}

// TestComputePlan_HashMatchBucket verifies that a file whose on-disk hash
// matches the source is bucketed to ToSkipHashMatch.
func TestComputePlan_HashMatchBucket(t *testing.T) {
	_, cleanup := ledgerTestEnv(t)
	defer cleanup()

	configRoot := t.TempDir()
	srcData := []byte("# Agent content\n")

	// Pre-create the destination with identical content.
	destDir := filepath.Join(configRoot, "agents")
	if err := os.MkdirAll(destDir, 0o755); err != nil {
		t.Fatal(err)
	}
	destPath := filepath.Join(destDir, "test.md")
	if err := os.WriteFile(destPath, srcData, 0o644); err != nil {
		t.Fatal(err)
	}

	mockFS := fstest.MapFS{
		"agents/test.md": &fstest.MapFile{Data: srcData},
	}

	m := ModuleManifest{SchemaVersion: 1, Module: "m", DefaultInstall: "always", Components: []string{"c"}}
	c := ComponentManifest{
		SchemaVersion: 1, Component: "c", Module: "m", Kind: "agent",
		Source: "agents/test.md", Cost: "low", Stability: "stable",
		Emits: OwnershipTags{Files: []string{"{config_root}/agents/test.md"}, ConfigKeys: []string{}},
	}

	placer := newClaudeCodePlacerAt(configRoot)
	diff, err := ComputePlan([]ModuleManifest{m}, []ComponentManifest{c}, []string{"c"}, placer, mockFS, nil)
	if err != nil {
		t.Fatalf("ComputePlan: %v", err)
	}

	if len(diff.ToSkipHashMatch) != 1 {
		t.Errorf("expected 1 ToSkipHashMatch, got %d (ToCreate=%d, ToUpdate=%d)",
			len(diff.ToSkipHashMatch), len(diff.ToCreate), len(diff.ToUpdate))
	}
}

// TestComputePlan_UpdateBucket verifies that a file whose on-disk content
// differs from the source is bucketed to ToUpdate.
func TestComputePlan_UpdateBucket(t *testing.T) {
	_, cleanup := ledgerTestEnv(t)
	defer cleanup()

	configRoot := t.TempDir()

	// Pre-create the destination with DIFFERENT content.
	destDir := filepath.Join(configRoot, "agents")
	if err := os.MkdirAll(destDir, 0o755); err != nil {
		t.Fatal(err)
	}
	destPath := filepath.Join(destDir, "test.md")
	if err := os.WriteFile(destPath, []byte("old content"), 0o644); err != nil {
		t.Fatal(err)
	}

	mockFS := fstest.MapFS{
		"agents/test.md": &fstest.MapFile{Data: []byte("new content")},
	}

	m := ModuleManifest{SchemaVersion: 1, Module: "m", DefaultInstall: "always", Components: []string{"c"}}
	c := ComponentManifest{
		SchemaVersion: 1, Component: "c", Module: "m", Kind: "agent",
		Source: "agents/test.md", Cost: "low", Stability: "stable",
		Emits: OwnershipTags{Files: []string{"{config_root}/agents/test.md"}, ConfigKeys: []string{}},
	}

	placer := newClaudeCodePlacerAt(configRoot)
	diff, err := ComputePlan([]ModuleManifest{m}, []ComponentManifest{c}, []string{"c"}, placer, mockFS, nil)
	if err != nil {
		t.Fatalf("ComputePlan: %v", err)
	}

	if len(diff.ToUpdate) != 1 {
		t.Errorf("expected 1 ToUpdate, got %d", len(diff.ToUpdate))
	}
}

// TestComputePlan_ToRemove verifies that ledger-owned components not in the
// selected set are bucketed to ToRemove.
func TestComputePlan_ToRemove(t *testing.T) {
	dataDir, cleanup := ledgerTestEnv(t)
	defer cleanup()

	configRoot := t.TempDir()

	// Pre-populate the ledger with an entry for comp-old.
	oldLine := `{"ts":"2026-06-18T00:00:00Z","op":"install","component":"hook-plugin-entry","owns":{"files":["{config_root}/plugins/team-harness.ts"],"configKeys":[]},"schemaVersion":1}`
	writeLedgerLines(t, dataDir, []string{oldLine})

	mockFS := fstest.MapFS{}

	m := ModuleManifest{SchemaVersion: 1, Module: "m", DefaultInstall: "always", Components: []string{}}
	placer := newClaudeCodePlacerAt(configRoot)

	// selected = empty — comp-old is ledger-owned but not selected → ToRemove.
	diff, err := ComputePlan([]ModuleManifest{m}, []ComponentManifest{}, []string{}, placer, mockFS, nil)
	if err != nil {
		t.Fatalf("ComputePlan: %v", err)
	}

	if len(diff.ToRemove) != 1 || diff.ToRemove[0].Component != "hook-plugin-entry" {
		t.Errorf("expected comp-old in ToRemove, got %v", diff.ToRemove)
	}
}

// TestComputePlan_OpencodeRetiresRenamedInitAgent covers the v3.4.2 -> v3.6.1+
// update path. v3.4.2 recorded agent-init in the OpenCode ledger; the agent was
// later renamed to init-project, so the old managed file must be removable.
func TestComputePlan_OpencodeRetiresRenamedInitAgent(t *testing.T) {
	dataDir, cleanup := ledgerTestEnv(t)
	defer cleanup()

	configRoot := t.TempDir()
	placer := newOpencodePlacerAt(configRoot)
	configureLedger(placer)
	defer setActiveLedgerContext(ledgerFilename, "")

	oldEntry := LedgerEntry{
		TS:            "2026-07-31T00:00:00Z",
		Op:            "install",
		Component:     "agent-init",
		Owns:          OwnershipTags{Files: []string{"{config_root}/agents/init.md"}, ConfigKeys: []string{}},
		SchemaVersion: 1,
		ConfigRoot:    configRoot,
	}
	oldLine, err := json.Marshal(oldEntry)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dataDir, ledgerFilenameOpencode), append(oldLine, '\n'), 0o600); err != nil {
		t.Fatal(err)
	}

	diff, err := ComputePlan(nil, nil, nil, placer, fstest.MapFS{}, nil)
	if err != nil {
		t.Fatalf("ComputePlan: %v", err)
	}
	if len(diff.LedgerErrors) != 0 {
		t.Fatalf("unexpected ledger errors: %v", diff.LedgerErrors)
	}
	if len(diff.ToRemove) != 1 || diff.ToRemove[0].Component != "agent-init" {
		t.Fatalf("expected agent-init in ToRemove, got %v", diff.ToRemove)
	}
	wantPath := filepath.Join(configRoot, "agents", "init.md")
	if len(diff.ToRemove[0].Files) != 1 || diff.ToRemove[0].Files[0] != wantPath {
		t.Fatalf("retired file = %v, want %q", diff.ToRemove[0].Files, wantPath)
	}
}

func TestComputePlan_UnknownAgentStillFailsClosed(t *testing.T) {
	dataDir, cleanup := ledgerTestEnv(t)
	defer cleanup()

	configRoot := t.TempDir()
	oldLine := `{"ts":"2026-07-31T00:00:00Z","op":"install","component":"agent-unknown","owns":{"files":["{config_root}/agents/unknown.md"],"configKeys":[]},"schemaVersion":1}`
	writeLedgerLines(t, dataDir, []string{oldLine})

	diff, err := ComputePlan(nil, nil, nil, newClaudeCodePlacerAt(configRoot), fstest.MapFS{}, nil)
	if err != nil {
		t.Fatalf("ComputePlan: %v", err)
	}
	if len(diff.ToRemove) != 0 {
		t.Fatalf("unknown component was scheduled for removal: %v", diff.ToRemove)
	}
	if len(diff.LedgerErrors) != 1 || !strings.Contains(diff.LedgerErrors[0].Reason, "neither currently managed") {
		t.Fatalf("expected fail-closed ledger error, got %v", diff.LedgerErrors)
	}
}

func TestComputePlan_RetiredAgentOwnershipMustMatchHistory(t *testing.T) {
	dataDir, cleanup := ledgerTestEnv(t)
	defer cleanup()

	configRoot := t.TempDir()
	forgedLine := `{"ts":"2026-07-31T00:00:00Z","op":"install","component":"agent-init","owns":{"files":["{config_root}/agents/init.md"],"configKeys":["logs-mode"]},"schemaVersion":1}`
	writeLedgerLines(t, dataDir, []string{forgedLine})

	diff, err := ComputePlan(nil, nil, nil, newClaudeCodePlacerAt(configRoot), fstest.MapFS{}, nil)
	if err != nil {
		t.Fatalf("ComputePlan: %v", err)
	}
	if len(diff.ToRemove) != 0 || len(diff.LedgerErrors) != 1 {
		t.Fatalf("forged historical ownership did not fail closed: removals=%v errors=%v", diff.ToRemove, diff.LedgerErrors)
	}
}

// TestComputePlan_LedgerErrorsSurfaced verifies that ledger parse errors are
// carried into the diff (SEC-06 binding).
func TestComputePlan_LedgerErrorsSurfaced(t *testing.T) {
	dataDir, cleanup := ledgerTestEnv(t)
	defer cleanup()

	configRoot := t.TempDir()
	writeLedgerLines(t, dataDir, []string{"NOT VALID JSON"})

	m := ModuleManifest{SchemaVersion: 1, Module: "m", DefaultInstall: "always", Components: []string{}}
	placer := newClaudeCodePlacerAt(configRoot)

	diff, err := ComputePlan([]ModuleManifest{m}, []ComponentManifest{}, []string{}, placer, fstest.MapFS{}, nil)
	if err != nil {
		t.Fatalf("ComputePlan: %v", err)
	}

	if len(diff.LedgerErrors) == 0 {
		t.Error("expected ledger errors to be surfaced in PlanDiff, got none")
	}
}
