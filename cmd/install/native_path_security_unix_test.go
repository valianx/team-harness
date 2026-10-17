//go:build !windows

package main

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"
)

func TestLedgerRejectsLiteralBackslashSymlinkBindings(t *testing.T) {
	for _, ancestor := range []bool{false, true} {
		name := "leaf"
		if ancestor {
			name = "ancestor"
		}
		t.Run(name, func(t *testing.T) {
			dataDir := isolatedOpencodeLedger(t)
			original := filepath.Join(dataDir, `runtime\config`)
			foreign := filepath.Join(dataDir, `RUNTIME\CONFIG`)
			if err := os.Mkdir(original, 0o755); err != nil {
				t.Fatal(err)
			}
			if _, err := os.Lstat(foreign); err == nil {
				t.Skip("filesystem aliases case variants")
			}
			if err := os.Symlink(original, foreign); err != nil {
				t.Fatal(err)
			}
			if ancestor {
				original, foreign = filepath.Join(original, "nested"), filepath.Join(foreign, "nested")
			}
			asset := filepath.Join(original, "agents", "tester.md")
			if err := os.MkdirAll(filepath.Dir(asset), 0o755); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(asset, []byte("operator asset\n"), 0o600); err != nil {
				t.Fatal(err)
			}
			writeRootBindingFixture(t, dataDir, ledgerFilenameOpencode, "agent-tester", foreign, "{config_root}/agents/tester.md")
			ledgerPath := filepath.Join(dataDir, ledgerFilenameOpencode)
			before, err := os.ReadFile(ledgerPath)
			if err != nil {
				t.Fatal(err)
			}
			placer := newOpencodePlacerAt(original)
			configureLedger(placer)
			report, err := Uninstall([]string{"agent-tester"}, placer)
			if err != nil || len(report.Removed) != 0 {
				t.Errorf("literal-backslash symlink granted foreign ownership: report=%+v err=%v", report, err)
			}
			got, err := os.ReadFile(asset)
			if err != nil || string(got) != "operator asset\n" {
				t.Errorf("foreign binding changed an operator asset: %q %v", got, err)
			}
			after, err := os.ReadFile(ledgerPath)
			if err != nil || !bytes.Equal(before, after) {
				t.Errorf("foreign binding changed the ledger: %v", err)
			}
		})
	}
}

func TestOpencodeConfigRootRejectsLiteralBackslashSymlinks(t *testing.T) {
	base, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	target := filepath.Join(base, "outside")
	if err := os.MkdirAll(filepath.Join(target, "nested"), 0o755); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(base, `linked\config`)
	if err := os.Symlink(target, link); err != nil {
		t.Fatal(err)
	}
	for _, root := range []string{link, filepath.Join(link, "nested")} {
		if _, err := newOpencodePlacer("global", root); err == nil {
			t.Errorf("native root validation accepted a literal-backslash symlink: %q", root)
		}
	}
}

func TestHardenedWriteRejectsLiteralBackslashSymlinkAncestor(t *testing.T) {
	base, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	outside := filepath.Join(base, "outside")
	asset := filepath.Join(outside, "config", "agents", "tester.md")
	if err := os.MkdirAll(filepath.Dir(asset), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(asset, []byte("outside asset\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(base, `linked\parent`)
	if err := os.Symlink(outside, link); err != nil {
		t.Fatal(err)
	}
	root := filepath.Join(link, "config")
	dest := filepath.Join(root, "agents", "tester.md")
	if err := hardenedWriteFile([]byte("must not escape\n"), dest, root, false); err == nil {
		t.Error("hardened write followed a literal-backslash symlink ancestor")
	}
	got, err := os.ReadFile(asset)
	if err != nil || string(got) != "outside asset\n" {
		t.Errorf("hardened write changed an outside asset: %q %v", got, err)
	}
}

func TestHardenedWriteCreatesLiteralBackslashDirectories(t *testing.T) {
	base, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	root := filepath.Join(base, `literal\directory`)
	dest := filepath.Join(root, "agents", "tester.md")
	if err := hardenedWriteFile([]byte("native path\n"), dest, root, false); err != nil {
		t.Fatalf("write to a valid literal-backslash directory: %v", err)
	}
	got, err := os.ReadFile(dest)
	if err != nil || string(got) != "native path\n" {
		t.Fatalf("native destination was not written: %q %v", got, err)
	}
	if _, err := os.Stat(filepath.Join(base, "literal")); !os.IsNotExist(err) {
		t.Errorf("write created a phantom directory by splitting a literal backslash: %v", err)
	}
}
