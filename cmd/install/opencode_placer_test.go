package main

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
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
