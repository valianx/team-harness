package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"testing/fstest"
)

func TestOpencodeLedgerCaseAliasKeepsUpdateAndUninstallOwnership(t *testing.T) {
	dataDir := isolatedOpencodeLedger(t)
	root := filepath.Join(dataDir, "RuntimeConfig")
	alias := filepath.Join(dataDir, "RUNTIMECONFIG")
	if err := os.Mkdir(root, 0o755); err != nil {
		t.Fatal(err)
	}
	requireDirectoryCaseAlias(t, root, alias)
	original, alternate := newOpencodePlacerAt(root), newOpencodePlacerAt(alias)
	applyLedgerRootFixture(t, original, "initial\n")
	ledgerPath := filepath.Join(dataDir, ledgerFilenameOpencode)
	before, err := os.ReadFile(ledgerPath)
	if err != nil {
		t.Fatal(err)
	}
	applyLedgerRootFixture(t, alternate, "initial\n")
	after, err := os.ReadFile(ledgerPath)
	if err != nil || !bytes.Equal(before, after) {
		t.Errorf("unchanged update through a case alias rewrote ownership: %v", err)
	}
	configureLedger(alternate)
	report, err := Uninstall([]string{"agent-orchestrator"}, alternate)
	if err != nil || len(report.Removed) != 1 || len(report.IncompleteComponents) != 0 || report.LedgerIntegrityWarning != "" {
		t.Fatalf("case-alias uninstall lost original ownership: report=%+v err=%v", report, err)
	}
	if _, err := os.Stat(filepath.Join(root, "agents", "orchestrator.md")); !os.IsNotExist(err) {
		t.Fatalf("case-alias uninstall left the original asset: %v", err)
	}
	applyLedgerRootFixture(t, alternate, "reinstalled\n")
	applyLedgerRootFixture(t, original, "updated\n")
	got, err := os.ReadFile(filepath.Join(alias, "agents", "orchestrator.md"))
	if err != nil || string(got) != "updated\n" {
		t.Fatalf("update through original spelling failed: %q %v", got, err)
	}
}

func TestOpencodeLegacyLedgerAcceptsOnlyProvenDefaultCaseAlias(t *testing.T) {
	dataDir := isolatedOpencodeLedger(t)
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(dataDir, "config"))
	t.Setenv("APPDATA", filepath.Join(dataDir, "config"))
	root, err := opencodeGlobalConfigDir()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(root, 0o755); err != nil {
		t.Fatal(err)
	}
	alias := filepath.Join(filepath.Dir(root), "OPENCODE")
	requireDirectoryCaseAlias(t, root, alias)
	asset := filepath.Join(root, "agents", "orchestrator.md")
	if _, err := newOpencodePlacerAt(root).Place([]byte("legacy\n"), "{config_root}/agents/orchestrator.md", "agent"); err != nil {
		t.Fatal(err)
	}
	writeRootBindingFixture(t, dataDir, ledgerFilenameOpencode, "agent-orchestrator", "", "{config_root}/agents/orchestrator.md")
	alternate := newOpencodePlacerAt(alias)
	configureLedger(alternate)
	report, err := Uninstall([]string{"agent-orchestrator"}, alternate)
	if err != nil || len(report.Removed) != 1 || len(report.IncompleteComponents) != 0 || len(report.LedgerErrors) != 0 {
		t.Fatalf("default root case alias rejected legacy ownership: report=%+v err=%v", report, err)
	}
	if _, err := os.Stat(asset); !os.IsNotExist(err) {
		t.Fatalf("legacy asset remains after alias uninstall: %v", err)
	}
}

func TestOpencodeLedgerKeepsCaseDistinctDirectoriesIndependent(t *testing.T) {
	dataDir := isolatedOpencodeLedger(t)
	first := filepath.Join(dataDir, "RuntimeConfig")
	second := filepath.Join(dataDir, "RUNTIMECONFIG")
	for _, root := range []string{first, second} {
		if err := os.MkdirAll(root, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	firstInfo, err := os.Stat(first)
	if err != nil {
		t.Fatal(err)
	}
	secondInfo, err := os.Stat(second)
	if err != nil {
		t.Fatal(err)
	}
	if os.SameFile(firstInfo, secondInfo) {
		t.Skip("filesystem does not provide case-distinct directories")
	}
	firstPlacer, secondPlacer := newOpencodePlacerAt(first), newOpencodePlacerAt(second)
	applyLedgerRootFixture(t, firstPlacer, "first root\n")
	applyLedgerRootFixture(t, secondPlacer, "second root\n")
	for _, placer := range []*opencodePlacer{secondPlacer, firstPlacer} {
		configureLedger(placer)
		report, err := Uninstall([]string{"agent-orchestrator"}, placer)
		if err != nil || len(report.Removed) != 1 || len(report.IncompleteComponents) != 0 || report.LedgerIntegrityWarning != "" {
			t.Fatalf("foreign removal erased independent ownership: root=%s report=%+v err=%v", placer.ConfigRoot(), report, err)
		}
	}
}

func TestOpencodeLedgerDoesNotAdoptCaseEquivalentSymlinkBinding(t *testing.T) {
	dataDir := isolatedOpencodeLedger(t)
	root, alias := filepath.Join(dataDir, "RuntimeConfig"), filepath.Join(dataDir, "RUNTIMECONFIG")
	if err := os.Mkdir(root, 0o755); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Lstat(alias); err == nil {
		t.Skip("filesystem aliases case variants")
	}
	if err := os.Symlink(root, alias); err != nil {
		t.Skipf("symlink setup unavailable: %v", err)
	}
	placer := newOpencodePlacerAt(root)
	if _, err := placer.Place([]byte("operator asset\n"), "{config_root}/agents/orchestrator.md", "agent"); err != nil {
		t.Fatal(err)
	}
	writeRootBindingFixture(t, dataDir, ledgerFilenameOpencode, "agent-orchestrator", alias, "{config_root}/agents/orchestrator.md")
	configureLedger(placer)
	report, err := Uninstall([]string{"agent-orchestrator"}, placer)
	if err != nil || len(report.Removed) != 0 {
		t.Fatalf("symlink granted foreign ownership: report=%+v err=%v", report, err)
	}
	got, err := os.ReadFile(filepath.Join(root, "agents", "orchestrator.md"))
	if err != nil || string(got) != "operator asset\n" {
		t.Fatalf("symlink-bound record deleted an operator asset: %q %v", got, err)
	}
}

func TestLedgerRootBindingsDoNotGuessMissingOrForeignIdentity(t *testing.T) {
	for _, tc := range []struct {
		name, ledger, component, binding string
		wantEntries, wantErrors          int
	}{
		{"exact missing root", ledgerFilenameOpencode, "agent-orchestrator", "RuntimeConfig", 1, 0},
		{"unproven case alias", ledgerFilenameOpencode, "agent-orchestrator", "RUNTIMECONFIG", 0, 0},
		{"foreign root", ledgerFilenameOpencode, "agent-orchestrator", "OtherRoot", 0, 0},
		{"Codex foreign root", ledgerFilenameCodex, "codex-agent-orchestrator", "OtherRoot", 0, 1},
		{"Codex unbound root", ledgerFilenameCodex, "codex-agent-orchestrator", "", 0, 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			dataDir := isolatedOpencodeLedger(t)
			selected := filepath.Join(dataDir, "RuntimeConfig")
			binding := tc.binding
			if binding != "" {
				binding = filepath.Join(dataDir, binding)
			}
			file := "{config_root}/agents/orchestrator.md"
			if tc.ledger == ledgerFilenameCodex {
				file = "{config_root}/agents/orchestrator.toml"
			}
			writeRootBindingFixture(t, dataDir, tc.ledger, tc.component, binding, file)
			setActiveLedgerContext(tc.ledger, selected)
			entries, errs := readLedger()
			if len(entries) != tc.wantEntries || len(errs) != tc.wantErrors {
				t.Fatalf("root binding changed authority: entries=%v errors=%v", entries, errs)
			}
		})
	}
}

func requireDirectoryCaseAlias(t *testing.T, root, alias string) {
	t.Helper()
	original, err := os.Stat(root)
	if err != nil {
		t.Fatal(err)
	}
	alternate, err := os.Stat(alias)
	if err != nil || !os.SameFile(original, alternate) {
		t.Skip("filesystem does not resolve alternate casing to the same existing directory")
	}
}

func applyLedgerRootFixture(t *testing.T, placer *opencodePlacer, contents string) {
	t.Helper()
	configureLedger(placer)
	components := []ComponentManifest{{Component: "agent-orchestrator", Source: "fixture.md", Kind: "agent",
		Emits: OwnershipTags{Files: []string{"{config_root}/agents/orchestrator.md"}}}}
	diff, err := ComputePlan(nil, components, []string{"agent-orchestrator"}, placer,
		fstest.MapFS{"fixture.md": {Data: []byte(contents)}}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := ApplyPlan(diff, placer); err != nil {
		t.Fatal(err)
	}
}

func writeRootBindingFixture(t *testing.T, dataDir, ledger, component, binding, file string) {
	t.Helper()
	entry := LedgerEntry{SchemaVersion: 1, Op: "install", Component: component, ConfigRoot: binding,
		Owns: OwnershipTags{Files: []string{file}}}
	line, err := json.Marshal(entry)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dataDir, ledger), append(line, '\n'), 0o600); err != nil {
		t.Fatal(err)
	}
}
