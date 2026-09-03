package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCodexPlacerWritesUnderConfigRoot(t *testing.T) {
	root := t.TempDir()
	p := newCodexPlacerAt(root)
	dest, err := p.Place([]byte("name = \"tester\"\n"), "{config_root}/agents/tester.toml", "config")
	if err != nil {
		t.Fatal(err)
	}
	if dest != filepath.Join(root, "agents", "tester.toml") {
		t.Fatalf("dest=%q", dest)
	}
	if p.Runtime() != "codex" {
		t.Fatalf("runtime=%q", p.Runtime())
	}
}

func TestCodexManifestsAreValidatedAndComplete(t *testing.T) {
	modules, components, err := loadDefaultManifests("codex")
	if err != nil {
		t.Fatal(err)
	}
	if len(modules) != 1 {
		t.Fatalf("modules=%d", len(modules))
	}
	wantComponents := []string{
		"codex-agent-architect",
		"codex-agent-implementer",
		"codex-agent-tester",
		"codex-agent-cleaner",
		"codex-agent-qa",
		"codex-agent-security",
		"codex-agent-inline-reviewer",
		"codex-agent-delivery",
		"codex-agent-pipeline-architect",
		"codex-agent-pipeline-implementer",
		"codex-agent-pipeline-tester",
		"codex-agent-pipeline-cleaner",
		"codex-agent-pipeline-qa",
		"codex-agent-pipeline-security",
		"codex-agent-pipeline-delivery",
		"codex-agent-reviewer",
		"codex-agent-pr-review-qa",
		"codex-agent-pr-review-security",
		"codex-agent-pr-review-verifier",
		"codex-agent-reviewer-consolidator",
	}
	if len(components) != len(wantComponents) {
		t.Fatalf("components=%d want %d", len(components), len(wantComponents))
	}
	seen := make(map[string]bool, len(components))
	for _, component := range components {
		seen[component.Component] = true
		if component.Component == "codex-config" || strings.HasSuffix(component.Emits.Files[0], "/config.toml") {
			t.Fatalf("installer must not own config.toml: %#v", component)
		}
	}
	for _, component := range wantComponents {
		if !seen[component] {
			t.Errorf("missing component %q", component)
		}
	}
}

func TestCodexRuntimeSelectsOwnLedger(t *testing.T) {
	original := runtimeFlag
	defer func() { runtimeFlag = original }()
	runtimeFlag = "codex"
	if got := selectLedgerFilename(); got != ledgerFilenameCodex {
		t.Fatalf("ledger=%q want %q", got, ledgerFilenameCodex)
	}
}

func TestCodexLedgerLivesUnderCodexRoot(t *testing.T) {
	root := t.TempDir()
	p := newCodexPlacerAt(root)
	configureLedger(p)
	t.Cleanup(func() {
		activeLedgerRoot = ""
		activeLedgerConfigRoot = ""
		activeLedgerFilename = ledgerFilename
	})

	got, err := activeLedgerDataHome()
	if err != nil {
		t.Fatal(err)
	}
	want := filepath.Join(root, "team-harness")
	if got != want {
		t.Fatalf("ledger root=%q want %q", got, want)
	}
}

func TestParseCodexDirAndSelectPlacer(t *testing.T) {
	originalRuntime, originalScope, originalDir := runtimeFlag, scopeFlag, codexDirFlag
	t.Cleanup(func() { runtimeFlag, scopeFlag, codexDirFlag = originalRuntime, originalScope, originalDir })
	runtimeFlag = "claude-code"
	root := t.TempDir()
	remaining := parseDispatchFlags([]string{"plan", "--runtime=codex", "--scope=project", "--codex-dir", root})
	if len(remaining) != 1 || remaining[0] != "plan" {
		t.Fatalf("remaining=%v", remaining)
	}
	p, err := selectPlacer()
	if err != nil {
		t.Fatal(err)
	}
	if p.Runtime() != "codex" || p.ConfigRoot() != root {
		t.Fatalf("placer=%s root=%q", p.Runtime(), p.ConfigRoot())
	}
}

func TestCodexDirRejectsFilesystemRoot(t *testing.T) {
	if _, err := newCodexPlacer("project", string(filepath.Separator)); err == nil || !strings.Contains(err.Error(), "filesystem or volume root") {
		t.Fatalf("filesystem root was accepted: %v", err)
	}
}

func TestCodexRootDetectorRecognizesOnlyRoots(t *testing.T) {
	if !isFilesystemRoot(string(filepath.Separator)) {
		t.Fatal("POSIX filesystem root was not recognized")
	}
	nested := filepath.Join(string(filepath.Separator), "tmp", "team-harness-codex")
	if isFilesystemRoot(nested) {
		t.Fatalf("nested config path was classified as a filesystem root: %q", nested)
	}
}

func TestCodexLifecyclePreservesConfigAndForeignAgents(t *testing.T) {
	root := t.TempDir()
	config := []byte("# operator comment\nmodel = \"operator-model\"\n[agents]\nmax_threads = 9\n")
	if err := os.WriteFile(filepath.Join(root, "config.toml"), config, 0o640); err != nil {
		t.Fatal(err)
	}
	foreignPath := filepath.Join(root, "agents", "foreign.toml")
	if err := os.MkdirAll(filepath.Dir(foreignPath), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(foreignPath, []byte("name = \"foreign\"\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	p := newCodexPlacerAt(root)
	originalRuntime := runtimeFlag
	runtimeFlag = "codex"
	configureLedger(p)
	t.Cleanup(func() {
		runtimeFlag = originalRuntime
		activeLedgerRoot = ""
		activeLedgerConfigRoot = ""
		activeLedgerFilename = ledgerFilename
	})
	modules, components, err := loadDefaultManifests("codex")
	if err != nil {
		t.Fatal(err)
	}
	diff, err := ComputePlan(modules, components, allComponentIDs(components), p, EmbeddedAssets(), nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(root, "team-harness")); !os.IsNotExist(err) {
		t.Fatalf("dry-run created Codex ledger root: %v", err)
	}
	if err := ApplyPlan(diff, p); err != nil {
		t.Fatal(err)
	}

	second, err := ComputePlan(modules, components, allComponentIDs(components), p, EmbeddedAssets(), nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(second.ToCreate)+len(second.ToUpdate)+len(second.ToRecord)+len(second.ToRemove) != 0 {
		t.Fatalf("second apply not idempotent: %+v", second)
	}

	report, err := Uninstall(allComponentIDs(components), p)
	if err != nil {
		t.Fatal(err)
	}
	if report.LedgerIntegrityWarning != "" || len(report.IncompleteComponents) != 0 {
		t.Fatalf("uninstall report=%+v", report)
	}
	gotConfig, err := os.ReadFile(filepath.Join(root, "config.toml"))
	if err != nil || !bytes.Equal(gotConfig, config) {
		t.Fatalf("config changed: err=%v got=%q", err, gotConfig)
	}
	info, err := os.Stat(filepath.Join(root, "config.toml"))
	if err != nil {
		t.Fatalf("stat config: %v", err)
	}
	if info.Mode().Perm() != 0o640 {
		t.Fatalf("config permissions changed: mode=%v", info.Mode().Perm())
	}
	if _, err := os.Stat(foreignPath); err != nil {
		t.Fatalf("foreign agent removed: %v", err)
	}
	for _, component := range components {
		if _, err := os.Stat(resolveTemplatedPath(component.Emits.Files[0], p)); !os.IsNotExist(err) {
			t.Fatalf("managed agent remains after uninstall: %s err=%v", component.Component, err)
		}
	}
}

func TestCodexRefusesUnownedSameNameAgent(t *testing.T) {
	root := t.TempDir()
	p := newCodexPlacerAt(root)
	originalRuntime := runtimeFlag
	runtimeFlag = "codex"
	configureLedger(p)
	t.Cleanup(func() {
		runtimeFlag = originalRuntime
		activeLedgerRoot = ""
		activeLedgerConfigRoot = ""
		activeLedgerFilename = ledgerFilename
	})
	modules, components, err := loadDefaultManifests("codex")
	if err != nil {
		t.Fatal(err)
	}
	conflict := resolveTemplatedPath(components[0].Emits.Files[0], p)
	if err := os.MkdirAll(filepath.Dir(conflict), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(conflict, []byte("operator owned\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	_, err = ComputePlan(modules, components, allComponentIDs(components), p, EmbeddedAssets(), nil)
	if err == nil || !strings.Contains(err.Error(), "refusing to overwrite unowned Codex agent") {
		t.Fatalf("err=%v", err)
	}
	got, readErr := os.ReadFile(conflict)
	if readErr != nil || string(got) != "operator owned\n" {
		t.Fatalf("conflict changed: err=%v got=%q", readErr, got)
	}
}

func TestCodexUninstallRejectsCrossRuntimeLedger(t *testing.T) {
	root := t.TempDir()
	p := newCodexPlacerAt(root)
	originalRuntime := runtimeFlag
	runtimeFlag = "codex"
	configureLedger(p)
	t.Cleanup(func() {
		runtimeFlag = originalRuntime
		activeLedgerRoot = ""
		activeLedgerConfigRoot = ""
		activeLedgerFilename = ledgerFilename
	})
	managed := filepath.Join(root, "agents", "architect.toml")
	if err := os.MkdirAll(filepath.Dir(managed), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(managed, []byte("must remain\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	ledgerRoot := filepath.Join(root, "team-harness")
	if err := os.Mkdir(ledgerRoot, 0o700); err != nil {
		t.Fatal(err)
	}
	foreign := LedgerEntry{
		SchemaVersion: 1,
		Op:            "install",
		Component:     "agent-architect",
		ConfigRoot:    root,
		Owns:          OwnershipTags{Files: []string{"{config_root}/agents/architect.md"}},
	}
	line, err := json.Marshal(foreign)
	if err != nil {
		t.Fatal(err)
	}
	line = append(line, '\n')
	if err := os.WriteFile(filepath.Join(ledgerRoot, ledgerFilenameCodex), line, 0o600); err != nil {
		t.Fatal(err)
	}

	report, err := Uninstall([]string{"codex-agent-architect"}, p)
	if err != nil {
		t.Fatal(err)
	}
	if report.LedgerIntegrityWarning == "" || len(report.LedgerErrors) != 1 {
		t.Fatalf("cross-runtime ledger was not rejected: %+v", report)
	}
	if got, err := os.ReadFile(managed); err != nil || string(got) != "must remain\n" {
		t.Fatalf("managed file changed despite invalid ledger: err=%v got=%q", err, got)
	}
}

func TestCodexPlanRemovesRetiredOwnedAgent(t *testing.T) {
	root := t.TempDir()
	p := newCodexPlacerAt(root)
	originalRuntime := runtimeFlag
	runtimeFlag = "codex"
	configureLedger(p)
	t.Cleanup(func() {
		runtimeFlag = originalRuntime
		activeLedgerRoot = ""
		activeLedgerConfigRoot = ""
		activeLedgerFilename = ledgerFilename
	})
	retiredPath := filepath.Join(root, "agents", "retired.toml")
	if err := os.MkdirAll(filepath.Dir(retiredPath), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(retiredPath, []byte("name = \"retired\"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := appendLedger([]LedgerEntry{{
		Op:        "install",
		Component: "codex-agent-retired",
		Owns:      OwnershipTags{Files: []string{"{config_root}/agents/retired.toml"}},
	}}); err != nil {
		t.Fatal(err)
	}
	modules, components, err := loadDefaultManifests("codex")
	if err != nil {
		t.Fatal(err)
	}
	diff, err := ComputePlan(modules, components, allComponentIDs(components), p, EmbeddedAssets(), nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(diff.LedgerErrors) != 0 || len(diff.ToRemove) != 1 || diff.ToRemove[0].Component != "codex-agent-retired" {
		t.Fatalf("retired agent removal not planned: %+v", diff)
	}
}
