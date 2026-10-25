package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"testing/fstest"
)

func TestOpencodeRootPrecedencePlacesOnlyInSelectedRoot(t *testing.T) {
	for _, tc := range []struct {
		name, scope, flag, env, want string
		wantError                    bool
	}{
		{"default global", "global", "", "", "global", false},
		{"project scope", "project", "", "", "project", false},
		{"environment beats global", "global", "", "environment", "environment", false},
		{"environment beats project", "project", "", "environment", "environment", false},
		{"flag beats environment", "project", "explicit", "environment", "explicit", false},
		{"flag beats invalid environment", "global", "explicit", "relative-root", "explicit", false},
		{"invalid flag cannot fall back", "global", "relative-root", "environment", "", true},
		{"invalid environment cannot fall back to global", "global", "", "relative-root", "", true},
		{"invalid environment cannot fall back to project", "project", "", "relative-root", "", true},
		{"blank environment is invalid", "global", "", " ", "", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			base, err := filepath.EvalSymlinks(t.TempDir())
			if err != nil {
				t.Fatal(err)
			}
			roots := map[string]string{
				"global":      filepath.Join(base, "config", "opencode"),
				"project":     filepath.Join(base, "project", ".opencode"),
				"environment": filepath.Join(base, "environment"),
				"explicit":    filepath.Join(base, "explicit"),
			}
			for name, root := range roots {
				if err := os.MkdirAll(filepath.Join(root, "agents"), 0o755); err != nil {
					t.Fatal(err)
				}
				if err := os.WriteFile(filepath.Join(root, "agents", "fixture.md"), []byte(name+" unchanged\n"), 0o600); err != nil {
					t.Fatal(err)
				}
			}
			t.Chdir(filepath.Join(base, "project"))
			t.Setenv("XDG_CONFIG_HOME", filepath.Join(base, "config"))
			t.Setenv("APPDATA", filepath.Join(base, "config"))
			envRoot := tc.env
			if root, ok := roots[envRoot]; ok {
				envRoot = root
			}
			t.Setenv("OPENCODE_CONFIG_DIR", envRoot)
			previousRuntime, previousScope, previousFlag := runtimeFlag, scopeFlag, opencodeDirFlag
			t.Cleanup(func() {
				runtimeFlag, scopeFlag, opencodeDirFlag = previousRuntime, previousScope, previousFlag
			})
			runtimeFlag, scopeFlag, opencodeDirFlag = "opencode", tc.scope, tc.flag
			if root, ok := roots[tc.flag]; ok {
				opencodeDirFlag = root
			}

			before := snapshotFiles(t, base)
			placer, err := selectPlacer()
			if tc.wantError {
				if err == nil {
					t.Error("invalid selected root was accepted")
				}
			} else if err != nil {
				t.Fatalf("resolve root: %v", err)
			} else if placer.ConfigRoot() != roots[tc.want] {
				t.Errorf("selected root = %q, want %q", placer.ConfigRoot(), roots[tc.want])
			}
			if err == nil {
				if _, err := placer.Place([]byte("selected root updated\n"), "{config_root}/agents/fixture.md", "agent"); err != nil {
					t.Fatal(err)
				}
			}
			want := before
			if !tc.wantError {
				want[filepath.Join(roots[tc.want], "agents", "fixture.md")] = "selected root updated\n"
			}
			if after := snapshotFiles(t, base); !reflect.DeepEqual(after, want) {
				t.Error("root selection changed files outside the selected root, or wrote after an invalid selection")
			}
		})
	}
}

func TestOpencodeSettingsBindingUsesSelectedInstallation(t *testing.T) {
	for _, tc := range []struct {
		name, scope, override, environment, want string
	}{
		{"native global", "global", "", "", "global"},
		{"project", "project", "", "", "project"},
		{"environment", "project", "", "environment", "environment"},
		{"explicit", "project", "explicit", "environment", "explicit"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			base, err := filepath.EvalSymlinks(t.TempDir())
			if err != nil {
				t.Fatal(err)
			}
			roots := map[string]string{
				"global":      filepath.Join(base, "native config", "opencode"),
				"project":     filepath.Join(base, "project", ".opencode"),
				"environment": filepath.Join(base, "environment root"),
				"explicit":    filepath.Join(base, "explicit root"),
			}
			if err := os.MkdirAll(filepath.Join(base, "project"), 0o755); err != nil {
				t.Fatal(err)
			}
			t.Chdir(filepath.Join(base, "project"))
			t.Setenv("XDG_CONFIG_HOME", filepath.Join(base, "native config"))
			t.Setenv("APPDATA", filepath.Join(base, "native config"))
			t.Setenv("OPENCODE_CONFIG_DIR", roots[tc.environment])
			placer, err := newOpencodePlacer(tc.scope, roots[tc.override])
			if err != nil {
				t.Fatal(err)
			}
			installSettingsBindingFixture(t, placer, filepath.Join(roots[tc.want], ".team-harness.json"))
		})
	}
}

func TestOpencodeSettingsBindingPreservesPathData(t *testing.T) {
	for _, root := range []string{
		filepath.Join(t.TempDir(), "root with spaces"),
		`C:\Users\Operator Name\AppData\Roaming\opencode`,
	} {
		t.Run(root, func(t *testing.T) {
			// Windows separators are exercised as data on every host; native root
			// selection and placement run in the platform's own matrix above.
			placer := newOpencodePlacerAt(root)
			transform := settingsBindingTransformForTest(t, placer)
			bound, err := transform(settingsBindingSource, "skill", "installer-assets/opencode-skills/learn-english/SKILL.md")
			if err != nil {
				t.Fatal(err)
			}
			if got := settingsBindingValue(t, bound); got != filepath.Join(root, ".team-harness.json") {
				t.Fatalf("binding = %q, want exact root data %q", got, root)
			}
		})
	}
	if os.PathSeparator != '\\' {
		root := filepath.Join(t.TempDir(), "operator's \"config\" \\ literal")
		installSettingsBindingFixture(t, newOpencodePlacerAt(root), filepath.Join(root, ".team-harness.json"))
	}
}

func TestOpencodeSettingsBindingCoversModelTransforms(t *testing.T) {
	for _, tc := range []struct{ name, settings string }{
		{"baseline", `{}`},
		{"legacy cost tier", `{"opencode.cost_tier_provider":"anthropic"}`},
		{"worker profiles", `{"worker-models":` + string(workerPreferenceForTest(`{"mode":"inherit"}`)) + `}`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			root := t.TempDir()
			if err := os.WriteFile(filepath.Join(root, ".team-harness.json"), []byte(tc.settings), 0o600); err != nil {
				t.Fatal(err)
			}
			installSettingsBindingFixture(t, newOpencodePlacerAt(root), filepath.Join(root, ".team-harness.json"))
		})
	}
}

var settingsBindingSource = []byte("---\nname: learn-english\ndescription: Fixture\nmetadata:\n  team-harness/config: \"__TEAM_HARNESS_OPENCODE_CONFIG__\"\n---\n")

func settingsBindingTransformForTest(t *testing.T, placer Placer) func([]byte, string, string) ([]byte, error) {
	t.Helper()
	previousRuntime, previousTier, previousTierSet := runtimeFlag, opencodeTierFlag, opencodeTierFlagSet
	t.Cleanup(func() {
		runtimeFlag, opencodeTierFlag, opencodeTierFlagSet = previousRuntime, previousTier, previousTierSet
	})
	runtimeFlag, opencodeTierFlag, opencodeTierFlagSet = "opencode", "", false
	transform, err := selectTransform(placer)
	if err != nil {
		t.Fatal(err)
	}
	return transform
}

func settingsBindingValue(t *testing.T, data []byte) string {
	t.Helper()
	for _, line := range strings.Split(string(data), "\n") {
		if value, found := strings.CutPrefix(line, "  team-harness/config: "); found {
			var decoded string
			if err := json.Unmarshal([]byte(value), &decoded); err != nil {
				t.Fatalf("settings binding is not a JSON/YAML string: %v", err)
			}
			return decoded
		}
	}
	t.Fatal("settings binding missing from installed metadata")
	return ""
}

func installSettingsBindingFixture(t *testing.T, placer *opencodePlacer, want string) {
	t.Helper()
	isolatedOpencodeLedger(t)
	configureLedger(placer)
	component := ComponentManifest{
		SchemaVersion: 1, Component: "skill-learn-english-SKILL-md", Module: "opencode-harness", Kind: "skill",
		Source: "installer-assets/opencode-skills/learn-english/SKILL.md",
		Emits:  OwnershipTags{Files: []string{"{config_root}/skills/learn-english/SKILL.md"}},
	}
	transform := settingsBindingTransformForTest(t, placer)
	assets := fstest.MapFS{component.Source: &fstest.MapFile{Data: settingsBindingSource}}
	plan, err := ComputePlan(nil, []ComponentManifest{component}, []string{component.Component}, placer, assets, transform)
	if err != nil {
		t.Fatal(err)
	}
	if len(plan.ToCreate) != 1 || plan.ToCreate[0].SrcHash != hashBytes(plan.ToCreate[0].SrcData) {
		t.Fatalf("binding must precede source hashing: %+v", plan)
	}
	if got := settingsBindingValue(t, plan.ToCreate[0].SrcData); got != want {
		t.Fatalf("planned settings binding = %q, want %q", got, want)
	}
	if err := ApplyPlan(plan, placer); err != nil {
		t.Fatal(err)
	}
	installed, err := os.ReadFile(filepath.Join(placer.ConfigRoot(), "skills", "learn-english", "SKILL.md"))
	if err != nil {
		t.Fatal(err)
	}
	if got := settingsBindingValue(t, installed); got != want {
		t.Fatalf("installed settings binding = %q, want %q", got, want)
	}
	second, err := ComputePlan(nil, []ComponentManifest{component}, []string{component.Component}, placer, assets, transform)
	if err != nil {
		t.Fatal(err)
	}
	if len(second.ToCreate)+len(second.ToUpdate) != 0 || len(second.ToSkipHashMatch) != 1 {
		t.Fatalf("settings binding is not idempotent: %+v", second)
	}
}

func TestOpencodeEnvironmentRootRejectsSymlinks(t *testing.T) {
	base, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	target := filepath.Join(base, "target")
	if err := os.Mkdir(target, 0o755); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(base, "linked-root")
	if err := os.Symlink(target, link); err != nil {
		t.Skipf("symlink setup unavailable: %v", err)
	}
	t.Setenv("OPENCODE_CONFIG_DIR", link)
	before := snapshotFiles(t, target)
	if _, err := newOpencodePlacer("global", ""); err == nil {
		t.Error("environment root bypassed the symlink validation used for explicit roots")
	}
	if after := snapshotFiles(t, target); !reflect.DeepEqual(after, before) {
		t.Error("invalid environment root changed its symlink target")
	}
}
