package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"testing/fstest"
	"time"
)

func TestOpencodeLedgerSeparatesConfigRootLifecycles(t *testing.T) {
	dataDir := isolatedOpencodeLedger(t)
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(dataDir, "config"))
	t.Setenv("APPDATA", filepath.Join(dataDir, "config"))
	globalRoot, err := opencodeGlobalConfigDir()
	if err != nil {
		t.Fatal(err)
	}
	roots := []*opencodePlacer{
		newOpencodePlacerAt(globalRoot),
		newOpencodePlacerAt(filepath.Join(dataDir, "project", ".opencode")),
	}
	components := []ComponentManifest{{
		Component: "agent-orchestrator", Source: "fixture.md", Kind: "agent",
		Emits: OwnershipTags{Files: []string{"{config_root}/agents/orchestrator.md"}},
	}}
	apply := func(placer *opencodePlacer, contents string) {
		t.Helper()
		configureLedger(placer)
		diff, err := ComputePlan(nil, components, []string{"agent-orchestrator"}, placer,
			fstest.MapFS{"fixture.md": {Data: []byte(contents)}}, nil)
		if err != nil {
			t.Fatal(err)
		}
		if err := ApplyPlan(diff, placer); err != nil {
			t.Fatalf("apply %s: %v", placer.ConfigRoot(), err)
		}
	}
	assertContents := func(placer *opencodePlacer, want string) {
		t.Helper()
		got, err := os.ReadFile(filepath.Join(placer.ConfigRoot(), "agents", "orchestrator.md"))
		if err != nil || string(got) != want {
			t.Fatalf("%s contents = %q, %v; want %q", placer.ConfigRoot(), got, err, want)
		}
	}
	uninstall := func(placer *opencodePlacer) {
		t.Helper()
		configureLedger(placer)
		report, err := Uninstall([]string{"agent-orchestrator"}, placer)
		if err != nil || report.LedgerIntegrityWarning != "" || len(report.IncompleteComponents) != 0 || len(report.Removed) != 1 {
			t.Fatalf("uninstall %s: report=%+v err=%v", placer.ConfigRoot(), report, err)
		}
		if _, err := os.Stat(filepath.Join(placer.ConfigRoot(), "agents", "orchestrator.md")); !os.IsNotExist(err) {
			t.Fatalf("uninstalled asset remains: %v", err)
		}
	}

	apply(roots[0], "global v1\n")
	apply(roots[1], "project v1\n")
	assertContents(roots[0], "global v1\n")
	apply(roots[0], "global v2\n")
	assertContents(roots[1], "project v1\n")
	apply(roots[1], "project v2\n")
	assertContents(roots[0], "global v2\n")
	uninstall(roots[0])
	assertContents(roots[1], "project v2\n")
	apply(roots[1], "project v3\n")
	apply(roots[0], "global v3\n")
	assertContents(roots[1], "project v3\n")
	uninstall(roots[1])
	assertContents(roots[0], "global v3\n")
	uninstall(roots[0])
}

func TestOpencodeLedgerValidatesForeignRecordsBeforeFiltering(t *testing.T) {
	dataDir := isolatedOpencodeLedger(t)
	placer := newOpencodePlacerAt(filepath.Join(dataDir, "selected"))
	configureLedger(placer)
	for _, tc := range []struct {
		name string
		edit func(*LedgerEntry)
	}{
		{"unsupported schema", func(e *LedgerEntry) { e.SchemaVersion = 2 }},
		{"invalid operation", func(e *LedgerEntry) { e.Op = "forget" }},
		{"missing component", func(e *LedgerEntry) { e.Component = "" }},
		{"escaped file", func(e *LedgerEntry) { e.Owns.Files = []string{"{config_root}/../../victim"} }},
		{"forged file", func(e *LedgerEntry) { e.Owns.Files = []string{"{config_root}/opencode.json"} }},
		{"forged config key", func(e *LedgerEntry) { e.Owns.ConfigKeys = []string{"operator.secret"} }},
		{"foreign runtime", func(e *LedgerEntry) { e.Component = "codex-agent-orchestrator" }},
		{"relative binding", func(e *LedgerEntry) { e.ConfigRoot = "other-root" }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			entry := LedgerEntry{SchemaVersion: 1, Op: "install", Component: "agent-orchestrator",
				ConfigRoot: filepath.Join(dataDir, "foreign"),
				Owns:       OwnershipTags{Files: []string{"{config_root}/agents/orchestrator.md"}}}
			tc.edit(&entry)
			line, err := json.Marshal(entry)
			if err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(filepath.Join(dataDir, ledgerFilenameOpencode), append(line, '\n'), 0o600); err != nil {
				t.Fatal(err)
			}
			entries, errs := readLedger()
			if len(entries) != 0 || len(errs) != 1 {
				t.Fatalf("invalid foreign entry was ignored: entries=%v errors=%v", entries, errs)
			}
			if err := ApplyPlan(PlanDiff{LedgerErrors: errs}, placer); err == nil {
				t.Fatal("apply accepted a corrupt foreign record")
			}
		})
	}
	if err := os.WriteFile(filepath.Join(dataDir, ledgerFilenameOpencode), []byte("{truncated\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if entries, errs := readLedger(); len(entries) != 0 || len(errs) != 1 {
		t.Fatalf("malformed JSON was ignored: entries=%v errors=%v", entries, errs)
	}
}

func TestOpencodeLedgerUnboundLegacyEntriesRemainGlobalOnly(t *testing.T) {
	dataDir := isolatedOpencodeLedger(t)
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(dataDir, "config"))
	t.Setenv("APPDATA", filepath.Join(dataDir, "config"))
	globalRoot, err := opencodeGlobalConfigDir()
	if err != nil {
		t.Fatal(err)
	}
	line := `{"op":"install","component":"agent-orchestrator","owns":{"files":["{config_root}/agents/orchestrator.md"]},"schemaVersion":1}` + "\n"
	if err := os.WriteFile(filepath.Join(dataDir, ledgerFilenameOpencode), []byte(line), 0o600); err != nil {
		t.Fatal(err)
	}
	configureLedger(newOpencodePlacerAt(globalRoot))
	if entries, errs := readLedger(); len(entries) != 1 || len(errs) != 0 {
		t.Fatalf("default root cannot read its legacy entry: entries=%v errors=%v", entries, errs)
	}
	configureLedger(newOpencodePlacerAt(filepath.Join(dataDir, "project", ".opencode")))
	if entries, errs := readLedger(); len(entries) != 0 || len(errs) != 1 || !strings.Contains(errs[0].Reason, "legacy ledger entry") {
		t.Fatalf("nondefault root reinterpreted legacy ownership: entries=%v errors=%v", entries, errs)
	}
}

func isolatedOpencodeLedger(t *testing.T) string {
	t.Helper()
	name, root, dataRoot := activeLedgerFilename, activeLedgerConfigRoot, activeLedgerRoot
	activeLedgerRoot = ""
	t.Cleanup(func() {
		activeLedgerFilename, activeLedgerConfigRoot, activeLedgerRoot = name, root, dataRoot
	})
	dataDir, cleanup := ledgerTestEnv(t)
	t.Cleanup(cleanup)
	return dataDir
}

func TestOpencodeCommandsRejectNonobjectConfigBeforeWrites(t *testing.T) {
	const guard = "TH_TEST_NONOBJECT_COMMAND"
	if command := os.Getenv(guard); command != "" {
		os.Args = []string{"installer", command, "--runtime", "opencode", "--opencode-dir", os.Getenv("TH_TEST_CONFIG_ROOT"), "--non-interactive"}
		switch os.Getenv("TH_TEST_CONFIG_TIER_MODE") {
		case "provider":
			os.Args = append(os.Args, "--opencode-tier=anthropic")
		case "clear":
			os.Args = append(os.Args, "--opencode-tier=")
		}
		main()
		os.Exit(0)
	}
	for _, command := range []string{"apply", "update"} {
		for _, tc := range []struct {
			name, invalid, tierMode string
		}{
			{"null", "null\n", ""},
			{"array", "[]\n", ""},
			{"string", "\"text\"\n", ""},
			{"boolean", "true\n", ""},
			{"number", "42\n", ""},
			{"empty", "", ""},
			{"null with provider", "null\n", "provider"},
			{"null with explicit provider clear", "null\n", "clear"},
		} {
			t.Run(command+"/"+tc.name, func(t *testing.T) {
				dataDir := isolatedOpencodeLedger(t)
				root := filepath.Join(dataDir, "config-root")
				if err := os.MkdirAll(filepath.Join(root, "agents"), 0o755); err != nil {
					t.Fatal(err)
				}
				cfgPath := opencodeSettingsConfigPath(root)
				if err := os.WriteFile(cfgPath, []byte(tc.invalid), 0o600); err != nil {
					t.Fatal(err)
				}
				if err := os.WriteFile(filepath.Join(root, "agents", "orchestrator.md"), []byte("existing installation\n"), 0o600); err != nil {
					t.Fatal(err)
				}
				configureLedger(newOpencodePlacerAt(root))
				if err := appendLedger([]LedgerEntry{{Op: "install", Component: "agent-orchestrator", Owns: OwnershipTags{Files: []string{"{config_root}/agents/orchestrator.md"}}}}); err != nil {
					t.Fatal(err)
				}
				before := snapshotFiles(t, dataDir)
				run := func() (string, error) {
					t.Helper()
					ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
					defer cancel()
					cmd := exec.CommandContext(ctx, os.Args[0], "-test.run=^TestOpencodeCommandsRejectNonobjectConfigBeforeWrites$")
					cmd.Env = append(os.Environ(), guard+"="+command, "TH_TEST_CONFIG_ROOT="+root, "TH_TEST_CONFIG_TIER_MODE="+tc.tierMode)
					output, err := cmd.CombinedOutput()
					if ctx.Err() != nil {
						t.Fatalf("installer command timed out: %v", ctx.Err())
					}
					return string(output), err
				}
				output, err := run()
				var exitErr *exec.ExitError
				if !errors.As(err, &exitErr) || exitErr.ExitCode() != 1 || !strings.Contains(output, "preflight config") || strings.Contains(output, "panic:") {
					t.Errorf("invalid config should return an ordinary preflight error: err=%v output=%s", err, output)
				}
				if after := snapshotFiles(t, dataDir); !reflect.DeepEqual(before, after) {
					t.Error("invalid config changed assets, ownership, or configuration files")
				}
				repaired := `{"operator_key":"retained"}`
				if tc.tierMode == "clear" {
					repaired = `{"operator_key":"retained","opencode.cost_tier_provider":"anthropic"}`
				}
				if err := os.WriteFile(cfgPath, []byte(repaired), 0o600); err != nil {
					t.Fatal(err)
				}
				if output, err := run(); err != nil {
					t.Fatalf("retry after repairing config: %v\n%s", err, output)
				}
				config, err := os.ReadFile(cfgPath)
				if err != nil || !bytes.Contains(config, []byte(`"operator_key": "retained"`)) || !bytes.Contains(config, []byte(`"installed_version"`)) {
					t.Fatalf("repaired config lost operator data or installer metadata: %q %v", config, err)
				}
				var raw map[string]json.RawMessage
				if err := json.Unmarshal(config, &raw); err != nil {
					t.Fatal(err)
				}
				provider := extractStringFromRaw(raw, "opencode.cost_tier_provider")
				if tc.tierMode == "provider" && provider != "anthropic" || tc.tierMode == "clear" && provider != "" {
					t.Errorf("retry did not retain the requested provider selection: %q", provider)
				}
			})
		}
	}
}

func snapshotFiles(t *testing.T, root string) map[string]string {
	t.Helper()
	files := map[string]string{}
	err := filepath.WalkDir(root, func(path string, entry fs.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			return err
		}
		data, err := os.ReadFile(path)
		if err == nil {
			files[path] = string(data)
		}
		return err
	})
	if err != nil {
		t.Fatal(err)
	}
	return files
}
