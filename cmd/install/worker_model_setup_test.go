package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

type workerSetupTestFixture struct {
	placer               *opencodePlacer
	cli, draft, dataRoot string
}

func newWorkerSetupTestFixture(t *testing.T) workerSetupTestFixture {
	t.Helper()
	dataRoot, cleanup := ledgerTestEnv(t)
	t.Cleanup(cleanup)
	placer := newOpencodePlacerAt(t.TempDir())
	configureLedger(placer)
	files := map[string]string{
		".team-harness.json":     `{"workspace-mode":"gpt-space","workspace":{"page_id":"retained-binding"},"operator":{"credential":"synthetic-preserve-canary"},"opencode.cost_tier_provider":"anthropic"}`,
		"opencode.json":          `{"model":"custom/chat","default_agent":"custom-primary","agent":{"TH-orchestrator":{"model":"custom/native-override"}},"mcp":{"operator":{"headers":{"Authorization":"synthetic-native-canary"}}}}`,
		"agents/orchestrator.md": "---\nname: custom coordinator\nmode: primary\nmodel: \"custom/primary\"\nvariant: high\ntemperature: 0.25\ntop_p: 0.8\npermission: {bash: allow}\n---\nOriginal primary body.\n",
		"agents/architect.md":    "---\nmode: all\nmodel: custom/another-primary\n---\nAnother primary.\n",
		"skills/setup/SKILL.md":  "Operator's unrelated managed skill bytes.\n",
	}
	for relative, content := range files {
		destination := filepath.Join(placer.ConfigRoot(), filepath.FromSlash(relative))
		if err := os.MkdirAll(filepath.Dir(destination), 0o700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(destination, []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	if err := appendLedger([]LedgerEntry{{Op: "install", Component: "agent-orchestrator", Owns: OwnershipTags{Files: []string{"{config_root}/agents/orchestrator.md"}, ConfigKeys: []string{}}}}); err != nil {
		t.Fatal(err)
	}
	draft := filepath.Join(t.TempDir(), "worker draft.json")
	if err := os.WriteFile(draft, workerPreferenceForTest(`{"mode":"model","provider":"native","model":"owner/model"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	cli := catalogExecutableForTest(t)
	t.Setenv("TH_CATALOG_MODE", "valid")
	return workerSetupTestFixture{placer: placer, cli: cli, draft: draft, dataRoot: dataRoot}
}

func snapshotWorkerSetup(t *testing.T, roots ...string) map[string]string {
	t.Helper()
	files := map[string]string{}
	for _, root := range roots {
		err := filepath.WalkDir(root, func(path string, entry fs.DirEntry, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}
			if entry.Type().IsRegular() {
				data, err := os.ReadFile(path)
				if err != nil {
					return err
				}
				files[path] = string(data)
			}
			return nil
		})
		if err != nil {
			t.Fatal(err)
		}
	}
	return files
}

func TestWorkerModelsSetupPlanConsumesDraftBeforeApply(t *testing.T) {
	fixture := newWorkerSetupTestFixture(t)
	before := snapshotWorkerSetup(t, fixture.placer.ConfigRoot(), fixture.dataRoot)
	categories := workerCategoriesForTest(t)
	raw, _ := os.ReadFile(fixture.draft)
	preference, err := validateWorkerModelsJSON(raw, categories)
	if err != nil {
		t.Fatal(err)
	}
	diff, err := computeWorkerModelSetupPlan(fixture.placer, preference, categories)
	if err != nil {
		t.Fatal(err)
	}
	if len(diff.ToRemove) != 0 || len(diff.LedgerErrors) != 0 {
		t.Fatalf("targeted model plan contains removal/ownership errors: %+v", diff)
	}
	found := false
	for _, file := range append(append(append(diff.ToCreate, diff.ToUpdate...), diff.ToSkipHashMatch...), diff.ToRecord...) {
		if !strings.HasPrefix(file.Component, "agent-") || file.Component == "agent-orchestrator" || file.Component == "agent-architect" {
			t.Fatalf("non-worker asset reached targeted plan: %s", file.Component)
		}
		if file.Component == "agent-implementer" {
			found = true
			if !bytes.Contains(file.SrcData, []byte("model: \"native/owner/model\"\n")) || file.SrcHash != hashBytes(file.SrcData) {
				t.Fatal("confirmed draft did not reach the actual pre-apply model bytes/hash")
			}
		}
	}
	if !found || !reflect.DeepEqual(before, snapshotWorkerSetup(t, fixture.placer.ConfigRoot(), fixture.dataRoot)) {
		t.Fatal("plan omitted the draft worker or wrote installation state")
	}
}

func TestWorkerModelsSetupPreviewAndConfirmedApply(t *testing.T) {
	for _, scenario := range []struct {
		name                                      string
		dryRun, yes, interactive, confirm, writes bool
	}{
		{"dry run", true, false, false, false, false},
		{"headless preview", false, false, false, false, false},
		{"decline confirmation", false, false, true, false, false},
		{"explicit file approval", false, true, false, false, true},
		{"guided confirmation", false, false, true, true, true},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			fixture := newWorkerSetupTestFixture(t)
			before := snapshotWorkerSetup(t, fixture.placer.ConfigRoot(), fixture.dataRoot)
			var output bytes.Buffer
			ui := workerModelSetupUI{Confirm: func() (bool, error) { return scenario.confirm, nil }}
			err := runWorkerModelSetup(context.Background(), fixture.placer, workerModelSetupOptions{File: fixture.draft, CLI: fixture.cli, DryRun: scenario.dryRun, Yes: scenario.yes, Interactive: scenario.interactive}, ui, &output)
			if err != nil {
				t.Fatal(err)
			}
			if !strings.Contains(output.String(), "native/owner/model") || strings.Contains(output.String(), "synthetic-preserve-canary") || strings.Contains(output.String(), "synthetic-native-canary") {
				t.Fatal("preview omitted explicit selection or exposed unrelated preferences")
			}
			after := snapshotWorkerSetup(t, fixture.placer.ConfigRoot(), fixture.dataRoot)
			if !scenario.writes {
				if !reflect.DeepEqual(before, after) {
					t.Fatal("preview/cancellation changed preferences, agents, primary or ledger")
				}
				return
			}
			for _, relative := range []string{"opencode.json", "agents/orchestrator.md", "agents/architect.md", "skills/setup/SKILL.md"} {
				path := filepath.Join(fixture.placer.ConfigRoot(), filepath.FromSlash(relative))
				if after[path] != before[path] {
					t.Fatalf("targeted profile action changed unrelated/primary bytes: %s", relative)
				}
			}
			configPath := opencodeSettingsConfigPath(fixture.placer.ConfigRoot())
			var saved, original map[string]json.RawMessage
			_ = json.Unmarshal([]byte(after[configPath]), &saved)
			_ = json.Unmarshal([]byte(before[configPath]), &original)
			profile := saved["worker-models"]
			delete(saved, "worker-models")
			var savedValues, originalValues any
			savedJSON, _ := json.Marshal(saved)
			originalJSON, _ := json.Marshal(original)
			_ = json.Unmarshal(savedJSON, &savedValues)
			_ = json.Unmarshal(originalJSON, &originalValues)
			if !reflect.DeepEqual(savedValues, originalValues) || !bytes.Contains(profile, []byte("owner/model")) {
				t.Fatal("profile save lost opaque preferences or did not save the explicit draft")
			}
			worker := after[filepath.Join(fixture.placer.ConfigRoot(), "agents", "implementer.md")]
			if !strings.Contains(worker, "model: \"native/owner/model\"\n") {
				t.Fatal("applied specialist does not use the confirmed native model")
			}
			ledgerPath := filepath.Join(fixture.dataRoot, ledgerFilenameOpencode)
			appended := strings.TrimPrefix(after[ledgerPath], before[ledgerPath])
			for _, line := range strings.Split(strings.TrimSpace(appended), "\n") {
				var entry LedgerEntry
				if json.Unmarshal([]byte(line), &entry) != nil || !strings.HasPrefix(entry.Component, "agent-") || entry.Component == "agent-orchestrator" || entry.Component == "agent-architect" {
					t.Fatalf("targeted action recorded unrelated/primary ownership: %s", line)
				}
			}
		})
	}
}

func TestWorkerModelsSetupCancellationAtNativeSelections(t *testing.T) {
	for _, cancelAt := range []int{1, 2, 3, 10, 11, 12, 13} {
		t.Run(string(rune('a'+cancelAt)), func(t *testing.T) {
			fixture := newWorkerSetupTestFixture(t)
			before := snapshotWorkerSetup(t, fixture.placer.ConfigRoot(), fixture.dataRoot)
			steps := []string{"model", "native", "owner/model", "model", "native", "owner/model", "model", "native", "owner/model", "tester", "model", "native", "owner/model", "done"}
			calls := 0
			ui := workerModelSetupUI{Select: func(_ string, _ []workerModelSetupOption, _ string) (string, error) {
				calls++
				if calls == cancelAt {
					return "", errWorkerModelSetupCancelled
				}
				return steps[calls-1], nil
			}}
			var output bytes.Buffer
			err := runWorkerModelSetup(context.Background(), fixture.placer, workerModelSetupOptions{CLI: fixture.cli, Interactive: true}, ui, &output)
			if err != nil || calls != cancelAt || !reflect.DeepEqual(before, snapshotWorkerSetup(t, fixture.placer.ConfigRoot(), fixture.dataRoot)) {
				t.Fatalf("native cancellation changed state or was not reached: calls=%d error=%v", calls, err)
			}
		})
	}
}

func TestWorkerModelsSetupRejectsWithoutPublishing(t *testing.T) {
	for _, scenario := range []struct{ name, input, mode, code string }{
		{"invalid whole object", `{"schema_version":1,"profiles":{"reasoning":{"mode":"inherit"},"general":{"mode":"inherit"},"mechanical":{"mode":"invalid"}}}`, "valid", "invalid_mode"},
		{"selection absent", string(workerPreferenceForTest(`{"mode":"model","provider":"native","model":"retired"}`)), "valid", "selection_missing"},
		{"catalog unavailable", string(workerPreferenceForTest(`{"mode":"inherit"}`)), "failure", "catalog_unavailable"},
		{"catalog malformed", string(workerPreferenceForTest(`{"mode":"inherit"}`)), "malformed", "catalog_invalid"},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			fixture := newWorkerSetupTestFixture(t)
			if err := os.WriteFile(fixture.draft, []byte(scenario.input), 0o600); err != nil {
				t.Fatal(err)
			}
			t.Setenv("TH_CATALOG_MODE", scenario.mode)
			before := snapshotWorkerSetup(t, fixture.placer.ConfigRoot(), fixture.dataRoot)
			err := runWorkerModelSetup(context.Background(), fixture.placer, workerModelSetupOptions{File: fixture.draft, CLI: fixture.cli, Yes: true}, workerModelSetupUI{}, &bytes.Buffer{})
			if err == nil || err.Error() != "worker_models_"+scenario.code || !reflect.DeepEqual(before, snapshotWorkerSetup(t, fixture.placer.ConfigRoot(), fixture.dataRoot)) {
				t.Fatalf("invalid/unavailable request modified healthy installation: %v", err)
			}
		})
	}
}

type failedWorkerModelPlacer struct{ Placer }

func (placer failedWorkerModelPlacer) Place([]byte, string, string) (string, error) {
	return "", errors.New("synthetic-write-failure")
}

func TestWorkerModelsSetupApplyFailurePreservesHealthyPreference(t *testing.T) {
	fixture := newWorkerSetupTestFixture(t)
	path := opencodeSettingsConfigPath(fixture.placer.ConfigRoot())
	before, _ := os.ReadFile(path)
	err := runWorkerModelSetup(context.Background(), failedWorkerModelPlacer{fixture.placer}, workerModelSetupOptions{File: fixture.draft, CLI: fixture.cli, Yes: true}, workerModelSetupUI{}, &bytes.Buffer{})
	after, _ := os.ReadFile(path)
	if err == nil || err.Error() != "worker_models_partial_runtime_failure" || !bytes.Equal(before, after) {
		t.Fatalf("partial runtime failure changed healthy preferences or was hidden: %v", err)
	}
}

func TestWorkerModelsDraftFileDeclaredBoundary(t *testing.T) {
	input := workerPreferenceForTest(`{"mode":"inherit"}`)
	for _, extra := range []int{0, 1} {
		t.Run(string(rune('a'+extra)), func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "draft.json")
			data := append(append([]byte{}, input...), bytes.Repeat([]byte(" "), workerModelDraftLimit-len(input)+extra)...)
			if err := os.WriteFile(path, data, 0o600); err != nil {
				t.Fatal(err)
			}
			got, err := readWorkerModelDraftFile(path)
			if extra == 0 && (err != nil || !bytes.Equal(got, data)) {
				t.Fatalf("exact draft boundary refused: %v", err)
			}
			if extra == 1 && (err == nil || err.Error() != "worker_models_input_limit" || got != nil) {
				t.Fatalf("draft overflow accepted: %v", err)
			}
		})
	}
}

func TestWorkerModelsDispatchRequiresSeparateApproval(t *testing.T) {
	previousFile, previousCLI := workerModelsFileFlag, opencodeCLIFlag
	previousDryRun, previousYes, previousNonInteractive := workerModelsDryRunFlag, workerModelsYesFlag, nonInteractiveFlag
	t.Cleanup(func() {
		workerModelsFileFlag, opencodeCLIFlag = previousFile, previousCLI
		workerModelsDryRunFlag, workerModelsYesFlag, nonInteractiveFlag = previousDryRun, previousYes, previousNonInteractive
	})
	for _, scenario := range []struct {
		name string
		args []string
		yes  bool
	}{
		{"headless is preview", []string{"setup", "models", "--worker-models-file", "draft with spaces.json", "--opencode-cli", filepath.Join(t.TempDir(), "native CLI"), "--non-interactive", "--dry-run"}, false},
		{"file approval", []string{"--worker-models-file=draft with spaces.json", "setup", "models", "--opencode-cli=" + filepath.Join(t.TempDir(), "native CLI"), "--yes", "--dry-run"}, true},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			workerModelsFileFlag, opencodeCLIFlag = "", ""
			workerModelsDryRunFlag, workerModelsYesFlag, nonInteractiveFlag = false, false, false
			remaining := parseDispatchFlags(scenario.args)
			if !reflect.DeepEqual(remaining, []string{"setup", "models"}) || workerModelsFileFlag != "draft with spaces.json" || !filepath.IsAbs(opencodeCLIFlag) || !workerModelsDryRunFlag || !nonInteractiveFlag || workerModelsYesFlag != scenario.yes {
				t.Fatalf("setup flags did not preserve explicit file/launcher/confirmation: %v %q %q %t", remaining, workerModelsFileFlag, opencodeCLIFlag, workerModelsYesFlag)
			}
		})
	}
}

func TestWorkerModelsReapplyPreservesPrimaryModelMetadata(t *testing.T) {
	fixture := newWorkerSetupTestFixture(t)
	previousRuntime, previousTier, previousTierSet := runtimeFlag, opencodeTierFlag, opencodeTierFlagSet
	t.Cleanup(func() {
		runtimeFlag, opencodeTierFlag, opencodeTierFlagSet = previousRuntime, previousTier, previousTierSet
	})
	runtimeFlag, opencodeTierFlag, opencodeTierFlagSet = "opencode", "", false
	settings, err := readWorkerModelSettings(fixture.placer)
	if err != nil {
		t.Fatal(err)
	}
	settings["worker-models"], _ = os.ReadFile(fixture.draft)
	settings["opencode.cost_tier_provider"] = json.RawMessage(`"unknown-retained-provider"`)
	raw, _ := json.Marshal(settings)
	configPath := opencodeSettingsConfigPath(fixture.placer.ConfigRoot())
	if err := os.WriteFile(configPath, raw, 0o600); err != nil {
		t.Fatal(err)
	}
	diff, err := computeUpdatePlan(fixture.placer)
	if err != nil {
		t.Fatal(err)
	}
	if err := ApplyPlan(diff, fixture.placer); err != nil {
		t.Fatal(err)
	}
	primary, _ := os.ReadFile(filepath.Join(fixture.placer.ConfigRoot(), "agents", "orchestrator.md"))
	for _, line := range []string{`model: "custom/primary"`, "variant: high", "temperature: 0.25", "top_p: 0.8"} {
		if !strings.Contains(string(primary), line+"\n") {
			t.Fatalf("ordinary reapply lost primary model metadata: %s", line)
		}
	}
	if strings.Contains(string(primary), "Original primary body.") || strings.Contains(string(primary), "permission: {bash: allow}") {
		t.Fatal("ordinary reapply froze primary body or security metadata")
	}
	worker, _ := os.ReadFile(filepath.Join(fixture.placer.ConfigRoot(), "agents", "implementer.md"))
	if !strings.Contains(string(worker), "model: \"native/owner/model\"\n") {
		t.Fatal("ordinary update ignored saved worker profiles")
	}
	if err := writeOpencodeTeamHarnessConfig(configPath, opencodeSetupValues{LogsMode: "local"}, fixture.placer); err != nil {
		t.Fatal(err)
	}
	beforeTier, _ := os.ReadFile(configPath)
	if err := persistResolvedTierProvider(configPath, "anthropic", fixture.placer); err != nil {
		t.Fatal(err)
	}
	afterTier, _ := os.ReadFile(configPath)
	if !bytes.Equal(beforeTier, afterTier) {
		t.Fatal("inactive legacy-tier refresh rewrote a profile installation")
	}
	updated, err := readWorkerModelSettings(fixture.placer)
	if err != nil || string(updated["opencode.cost_tier_provider"]) != `"unknown-retained-provider"` || !bytes.Contains(updated["worker-models"], []byte("owner/model")) {
		t.Fatalf("reapply changed retained profile/legacy preferences: %v", err)
	}
}

func TestWorkerModelsCatalogUsesSelectedNativeRoot(t *testing.T) {
	for _, scope := range []string{"global", "project"} {
		t.Run(scope, func(t *testing.T) {
			fixture := newWorkerSetupTestFixture(t)
			foreign := t.TempDir()
			sentinel := filepath.Join(foreign, ".team-harness.json")
			if err := os.WriteFile(sentinel, []byte(`{"operator":"foreign-root"}`), 0o600); err != nil {
				t.Fatal(err)
			}
			t.Setenv("OPENCODE_CONFIG_DIR", foreign)
			contextPath := filepath.Join(t.TempDir(), "native-context.json")
			t.Setenv("TH_CATALOG_CONTEXT", contextPath)
			placer, err := newOpencodePlacer(scope, fixture.placer.ConfigRoot())
			if err != nil {
				t.Fatal(err)
			}
			err = runWorkerModelSetup(context.Background(), placer, workerModelSetupOptions{File: fixture.draft, CLI: fixture.cli, DryRun: true}, workerModelSetupUI{}, &bytes.Buffer{})
			if err != nil {
				t.Fatal(err)
			}
			raw, err := os.ReadFile(contextPath)
			var observed map[string]string
			if err != nil || json.Unmarshal(raw, &observed) != nil || observed["config_root"] != placer.ConfigRoot() {
				t.Fatalf("catalog used a different native configuration root: %s %v", raw, err)
			}
			retained, _ := os.ReadFile(sentinel)
			if string(retained) != `{"operator":"foreign-root"}` || os.Getenv("OPENCODE_CONFIG_DIR") != foreign {
				t.Fatal("catalog probe changed parent or foreign runtime configuration")
			}
		})
	}
}

func TestWorkerModelsSavedRetiredIdentityIsNotReplacedByGuidedDefaults(t *testing.T) {
	fixture := newWorkerSetupTestFixture(t)
	settings, err := readWorkerModelSettings(fixture.placer)
	if err != nil {
		t.Fatal(err)
	}
	settings["worker-models"] = workerPreferenceForTest(`{"mode":"model","provider":"native","model":"retired"}`)
	raw, _ := json.Marshal(settings)
	if err := os.WriteFile(opencodeSettingsConfigPath(fixture.placer.ConfigRoot()), raw, 0o600); err != nil {
		t.Fatal(err)
	}
	before := snapshotWorkerSetup(t, fixture.placer.ConfigRoot(), fixture.dataRoot)
	selected := false
	ui := workerModelSetupUI{Select: func(string, []workerModelSetupOption, string) (string, error) {
		selected = true
		return "inherit", nil
	}}
	err = runWorkerModelSetup(context.Background(), fixture.placer, workerModelSetupOptions{CLI: fixture.cli, Interactive: true}, ui, &bytes.Buffer{})
	var gap *workerModelSelectionGap
	if !errors.As(err, &gap) || gap.Target != "profiles.general" || gap.Selection.Provider != "native" || gap.Selection.Model != "retired" || selected || !reflect.DeepEqual(before, snapshotWorkerSetup(t, fixture.placer.ConfigRoot(), fixture.dataRoot)) {
		t.Fatalf("retired saved choice was replaced/hidden or lacked precise gap: %v", err)
	}
}
