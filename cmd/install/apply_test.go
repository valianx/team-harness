package main

import (
	"os"
	"path/filepath"
	"testing"
	"testing/fstest"
)

// ---------------------------------------------------------------------------
// AC-3: apply executes + appends ledger, idempotent
// ---------------------------------------------------------------------------

// buildTestManifestPair returns a minimal module+component pair for test use.
func buildTestManifestPair(srcPath, compID, templateDest string) (ModuleManifest, ComponentManifest) {
	m := ModuleManifest{
		SchemaVersion:  1,
		Module:         "test-mod",
		Description:    "test",
		DefaultInstall: "always",
		Components:     []string{compID},
	}
	c := ComponentManifest{
		SchemaVersion: 1,
		Component:     compID,
		Module:        "test-mod",
		Kind:          "agent",
		Source:        srcPath,
		Cost:          "low",
		Stability:     "stable",
		Emits: OwnershipTags{
			Files:      []string{templateDest},
			ConfigKeys: []string{},
		},
	}
	return m, c
}

// TestApplyPlan_CreatesFilesAndAppendsLedger verifies AC-3 first half:
// ApplyPlan writes the files and appends one install ledger entry per component.
func TestApplyPlan_CreatesFilesAndAppendsLedger(t *testing.T) {
	dataDir, cleanup := ledgerTestEnv(t)
	defer cleanup()

	configRoot := t.TempDir()
	srcData := []byte("# Test agent\n")

	mockFS := fstest.MapFS{
		"agents/test.md": &fstest.MapFile{Data: srcData},
	}

	m, c := buildTestManifestPair("agents/test.md", "test-comp", "{config_root}/agents/test.md")
	placer := newClaudeCodePlacerAt(configRoot)

	diff, err := ComputePlan([]ModuleManifest{m}, []ComponentManifest{c}, []string{"test-comp"}, placer, mockFS, nil)
	if err != nil {
		t.Fatalf("ComputePlan: %v", err)
	}
	if len(diff.ToCreate) != 1 {
		t.Fatalf("expected 1 ToCreate, got %d", len(diff.ToCreate))
	}

	if err := ApplyPlan(diff, placer); err != nil {
		t.Fatalf("ApplyPlan: %v", err)
	}

	// Verify the file was created at the concrete destination.
	destPath := filepath.Join(configRoot, "agents", "test.md")
	got, err := os.ReadFile(destPath)
	if err != nil {
		t.Fatalf("destination file not created: %v", err)
	}
	if string(got) != string(srcData) {
		t.Errorf("destination content mismatch: got %q, want %q", got, srcData)
	}

	// Verify the ledger was appended.
	entries, errs := readLedger()
	if len(errs) > 0 {
		t.Errorf("unexpected ledger errors: %v", errs)
	}
	if len(entries) == 0 {
		t.Fatal("ledger should have at least one entry after apply")
	}
	found := false
	for _, e := range entries {
		if e.Component == "test-comp" && e.Op == "install" {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("ledger entry for test-comp install not found; entries=%v", entries)
	}

	_ = dataDir // consumed by ledgerTestEnv
}

// TestApplyPlan_Idempotent verifies AC-3 second half: a second
// ComputePlan+ApplyPlan on an unchanged tree results in all files bucketed to
// ToSkipHashMatch and zero new ledger entries.
func TestApplyPlan_Idempotent(t *testing.T) {
	dataDir, cleanup := ledgerTestEnv(t)
	defer cleanup()

	configRoot := t.TempDir()
	srcData := []byte("# Idempotent agent\n")

	mockFS := fstest.MapFS{
		"agents/idempotent.md": &fstest.MapFile{Data: srcData},
	}

	m, c := buildTestManifestPair("agents/idempotent.md", "idempotent-comp", "{config_root}/agents/idempotent.md")
	placer := newClaudeCodePlacerAt(configRoot)

	// First apply.
	diff1, err := ComputePlan([]ModuleManifest{m}, []ComponentManifest{c}, []string{"idempotent-comp"}, placer, mockFS, nil)
	if err != nil {
		t.Fatalf("first ComputePlan: %v", err)
	}
	if err := ApplyPlan(diff1, placer); err != nil {
		t.Fatalf("first ApplyPlan: %v", err)
	}

	// Count ledger entries after first apply.
	entriesAfterFirst, _ := readLedger()
	countAfterFirst := len(entriesAfterFirst)

	// Second apply on unchanged tree.
	diff2, err := ComputePlan([]ModuleManifest{m}, []ComponentManifest{c}, []string{"idempotent-comp"}, placer, mockFS, nil)
	if err != nil {
		t.Fatalf("second ComputePlan: %v", err)
	}

	if len(diff2.ToSkipHashMatch) != 1 {
		t.Errorf("expected 1 ToSkipHashMatch on second plan, got create=%d update=%d skip=%d",
			len(diff2.ToCreate), len(diff2.ToUpdate), len(diff2.ToSkipHashMatch))
	}
	if len(diff2.ToCreate) != 0 || len(diff2.ToUpdate) != 0 {
		t.Errorf("second plan has unexpected create/update actions: create=%d update=%d",
			len(diff2.ToCreate), len(diff2.ToUpdate))
	}

	if err := ApplyPlan(diff2, placer); err != nil {
		t.Fatalf("second ApplyPlan: %v", err)
	}

	// Ledger count must not have increased.
	entriesAfterSecond, _ := readLedger()
	if len(entriesAfterSecond) != countAfterFirst {
		t.Errorf("second idempotent apply added ledger entries: before=%d, after=%d",
			countAfterFirst, len(entriesAfterSecond))
	}

	_ = dataDir
}

// TestApplyPlan_RemoveAppendsClosure verifies that ToRemove items cause a
// remove ledger entry to be appended via appendLedger.
func TestApplyPlan_RemoveAppendsClosure(t *testing.T) {
	dataDir, cleanup := ledgerTestEnv(t)
	defer cleanup()

	configRoot := t.TempDir()

	// Pre-populate the ledger with comp-old.
	oldLine := `{"ts":"2026-06-18T00:00:00Z","op":"install","component":"comp-old","owns":{"files":["{config_root}/agents/old.md"],"configKeys":[]},"schemaVersion":1}`
	writeLedgerLines(t, dataDir, []string{oldLine})

	// selected = empty → comp-old goes to ToRemove.
	m := ModuleManifest{SchemaVersion: 1, Module: "m", DefaultInstall: "always", Components: []string{}}
	placer := newClaudeCodePlacerAt(configRoot)

	diff, err := ComputePlan([]ModuleManifest{m}, []ComponentManifest{}, []string{}, placer, fstest.MapFS{}, nil)
	if err != nil {
		t.Fatalf("ComputePlan: %v", err)
	}
	if len(diff.ToRemove) != 1 {
		t.Fatalf("expected 1 ToRemove, got %d", len(diff.ToRemove))
	}

	if err := ApplyPlan(diff, placer); err != nil {
		t.Fatalf("ApplyPlan: %v", err)
	}

	// After apply, the ledger should have a remove entry for comp-old.
	entries, _ := readLedger()
	found := false
	for _, e := range entries {
		if e.Component == "comp-old" && e.Op == "remove" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected remove ledger entry for comp-old, not found")
	}
}
