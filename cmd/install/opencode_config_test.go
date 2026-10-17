package main

// Tests for opencode_config.go:
//   - writeOpencodeTeamHarnessConfig preserves unknown operator keys
//     (CLAUDE.md §5 single-config-file merge rule).
//   - Forgery test: a forged installer-managed key (installed_version) in the
//     existing file is overwritten; an extra unknown operator key survives
//     (AC-7 / SEC-OC-R4 mass-assignment defense).
//   - Writer routes through the hardened opencodePlacer write path, not a
//     raw os.WriteFile (SEC-OC-R2 — path must be under the config root).
//   - detectExistingConfig returns nil when the file is absent.
//   - detectExistingConfig returns a populated map when the file is present.

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"
)

type workspacePreferenceCase struct {
	Name     string                     `json:"name"`
	Config   map[string]json.RawMessage `json:"config"`
	Expected struct {
		Status       string `json:"status"`
		Mode         string `json:"mode"`
		SelectedFrom string `json:"selected_from"`
		Conflict     bool   `json:"conflict"`
		ReasonCode   string `json:"reason_code"`
	} `json:"expected"`
}

func workspacePreferenceCases(t *testing.T) []workspacePreferenceCase {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "..", "tests", "fixtures", "workspace-preferences.json"))
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		SchemaVersion int                       `json:"schema_version"`
		Cases         []workspacePreferenceCase `json:"cases"`
	}
	if err := json.Unmarshal(data, &fixture); err != nil {
		t.Fatal(err)
	}
	if fixture.SchemaVersion != 1 || len(fixture.Cases) == 0 {
		t.Fatal("unsupported or empty workspace preference fixture")
	}
	return fixture.Cases
}

func TestTeamHarnessConfigWritersRejectNonobjectsWithoutChanges(t *testing.T) {
	for _, tc := range []struct {
		name  string
		write func(string, *opencodePlacer) error
	}{
		{"setup", func(path string, p *opencodePlacer) error {
			return writeOpencodeTeamHarnessConfig(path, opencodeSetupValues{}, p)
		}},
		{"update", refreshManagedConfigKeys},
		{"tier", func(path string, p *opencodePlacer) error {
			return persistResolvedTierProvider(path, "anthropic", p)
		}},
		{"tier-clear", func(path string, p *opencodePlacer) error {
			return persistResolvedTierProvider(path, "", p)
		}},
	} {
		for _, invalid := range []string{"null\n", "[]\n", "\"text\"\n", "true\n", "42\n", ""} {
			t.Run(tc.name+"/"+invalid, func(t *testing.T) {
				root := t.TempDir()
				path := opencodeSettingsConfigPath(root)
				if err := os.WriteFile(path, []byte(invalid), 0o600); err != nil {
					t.Fatal(err)
				}
				if err := validateTeamHarnessConfigFile(path); err == nil {
					t.Error("preflight accepted a nonobject configuration")
				}
				defer func() {
					if value := recover(); value != nil {
						t.Errorf("writer panicked on a nonobject configuration: %v", value)
					}
				}()
				if err := tc.write(path, newOpencodePlacerAt(root)); err == nil {
					t.Error("writer accepted a nonobject configuration")
				}
				if after, err := os.ReadFile(path); err != nil || !bytes.Equal(after, []byte(invalid)) {
					t.Errorf("writer modified invalid configuration: %q %v", after, err)
				}
				entries, err := os.ReadDir(root)
				if err != nil || len(entries) != 1 {
					t.Errorf("writer created a backup or temporary file for invalid configuration: %v %v", entries, err)
				}
			})
		}
	}
}

// TestWriteOpencodeTeamHarnessConfig_PreservesUnknownKeys verifies that keys
// in the existing .team-harness.json that are not part of the installer's
// allowlist survive the write byte-for-byte (CLAUDE.md §5 / AC-7).
func TestWriteOpencodeTeamHarnessConfig_PreservesUnknownKeys(t *testing.T) {
	dir := t.TempDir()
	placer := newOpencodePlacerAt(dir)
	cfgPath := opencodeSettingsConfigPath(dir)

	// Seed an existing config with an unknown operator key and a known key.
	seed := map[string]interface{}{
		"operator_custom_key": "keep-me-intact",
		"logs-mode":           "obsidian",
		"logs-path":           "C:/Users/operator/Obsidian",
		"logs-subfolder":      "work-logs",
	}
	seedBytes, _ := json.Marshal(seed)
	if err := os.WriteFile(cfgPath, seedBytes, 0o644); err != nil {
		t.Fatalf("seed write: %v", err)
	}

	cfg := opencodeSetupValues{LogsMode: "local"}
	if err := writeOpencodeTeamHarnessConfig(cfgPath, cfg, placer); err != nil {
		t.Fatalf("writeOpencodeTeamHarnessConfig: %v", err)
	}

	raw, err := os.ReadFile(cfgPath)
	if err != nil {
		t.Fatalf("read back: %v", err)
	}
	var result map[string]interface{}
	if err := json.Unmarshal(raw, &result); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	// Unknown operator key must survive.
	if result["operator_custom_key"] != "keep-me-intact" {
		t.Errorf("operator_custom_key was not preserved: got %v", result["operator_custom_key"])
	}

	// Existing workspace preferences remain operator-owned across re-apply.
	if result["logs-mode"] != "obsidian" {
		t.Errorf("logs-mode = %v, want obsidian", result["logs-mode"])
	}
	if result["logs-path"] != "C:/Users/operator/Obsidian" {
		t.Errorf("logs-path = %v, want existing workspace path", result["logs-path"])
	}
	if result["logs-subfolder"] != "work-logs" {
		t.Errorf("logs-subfolder = %v, want existing workspace subfolder", result["logs-subfolder"])
	}
}

// TestWriteOpencodeTeamHarnessConfig_ForgeryDefense verifies that a forged
// installer-managed key (installed_version) in the existing file is overwritten
// by the installer's own value, while an extra unknown operator key survives
// intact (AC-7 / SEC-OC-R4 mass-assignment defense).
func TestWriteOpencodeTeamHarnessConfig_ForgeryDefense(t *testing.T) {
	dir := t.TempDir()
	placer := newOpencodePlacerAt(dir)
	cfgPath := opencodeSettingsConfigPath(dir)

	// Seed with a forged installed_version and an extra operator key.
	seed := map[string]interface{}{
		"installed_version":  "FORGED-9999.0.0",
		"format_version":     "FORGED-42",
		"operator_extra_key": "must-survive",
	}
	seedBytes, _ := json.Marshal(seed)
	if err := os.WriteFile(cfgPath, seedBytes, 0o644); err != nil {
		t.Fatalf("seed write: %v", err)
	}

	cfg := opencodeSetupValues{LogsMode: "local"}
	if err := writeOpencodeTeamHarnessConfig(cfgPath, cfg, placer); err != nil {
		t.Fatalf("writeOpencodeTeamHarnessConfig: %v", err)
	}

	raw, err := os.ReadFile(cfgPath)
	if err != nil {
		t.Fatalf("read back: %v", err)
	}
	var result map[string]interface{}
	if err := json.Unmarshal(raw, &result); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	// Forged installed_version must be overwritten with the real installer version.
	got, _ := result["installed_version"].(string)
	if got == "FORGED-9999.0.0" {
		t.Error("forged installed_version was NOT overwritten (SEC-OC-R4 violated)")
	}
	if got != version {
		t.Errorf("installed_version = %q, want %q", got, version)
	}

	// Forged format_version must also be overwritten.
	fv, _ := result["format_version"].(string)
	if fv == "FORGED-42" {
		t.Error("forged format_version was NOT overwritten (SEC-OC-R4 violated)")
	}
	if fv != "1" {
		t.Errorf("format_version = %q, want %q", fv, "1")
	}

	// Extra operator key must survive byte-for-byte.
	if result["operator_extra_key"] != "must-survive" {
		t.Errorf("operator_extra_key was lost: got %v", result["operator_extra_key"])
	}
}

// TestWriteOpencodeTeamHarnessConfig_InstallerManagedKeysAlwaysSet verifies
// that installer-managed keys are always written, even when the existing file
// has no value for them (fresh install).
func TestWriteOpencodeTeamHarnessConfig_InstallerManagedKeysAlwaysSet(t *testing.T) {
	dir := t.TempDir()
	placer := newOpencodePlacerAt(dir)
	cfgPath := opencodeSettingsConfigPath(dir)

	// No existing file — fresh install.
	cfg := opencodeSetupValues{LogsMode: "local"}
	if err := writeOpencodeTeamHarnessConfig(cfgPath, cfg, placer); err != nil {
		t.Fatalf("writeOpencodeTeamHarnessConfig: %v", err)
	}

	raw, err := os.ReadFile(cfgPath)
	if err != nil {
		t.Fatalf("read back: %v", err)
	}
	var result map[string]interface{}
	if err := json.Unmarshal(raw, &result); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if result["format_version"] != "1" {
		t.Errorf("format_version = %v, want 1", result["format_version"])
	}
	if result["installed_version"] != version {
		t.Errorf("installed_version = %v, want %v", result["installed_version"], version)
	}
	if result["logs-mode"] != "local" {
		t.Errorf("fresh logs-mode = %v, want local", result["logs-mode"])
	}
	if result["workspace-mode"] != "local" {
		t.Errorf("fresh workspace-mode = %v, want local", result["workspace-mode"])
	}
	if _, ok := result["updated_at"]; !ok {
		t.Error("updated_at missing from fresh install")
	}
}

func TestWriteOpencodeTeamHarnessConfig_PreservesWorkspacePreferenceGroup(t *testing.T) {
	for _, tc := range workspacePreferenceCases(t) {
		t.Run(tc.Name, func(t *testing.T) {
			root := t.TempDir()
			path := opencodeSettingsConfigPath(root)
			original := tc.Config
			original["operator-metadata"] = json.RawMessage(`{"nested":[null,{"keep":true}]}`)
			before, err := json.Marshal(original)
			if err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(path, before, 0o600); err != nil {
				t.Fatal(err)
			}
			preferenceKeys := []string{"workspace-mode", "logs-mode", "logs-path", "logs-subfolder", "workspace-space-id", "workspace-container-page-id"}
			wantPreferences := make(map[string]json.RawMessage, len(preferenceKeys))
			for _, key := range preferenceKeys {
				wantPreferences[key] = original[key]
			}
			if tc.Expected.SelectedFrom == "default" {
				wantPreferences["workspace-mode"] = json.RawMessage(`"local"`)
				wantPreferences["logs-mode"] = json.RawMessage(`"local"`)
			}
			placer := newOpencodePlacerAt(root)
			for attempt := 0; attempt < 2; attempt++ {
				if err := writeOpencodeTeamHarnessConfig(path, opencodeSetupValues{LogsMode: "local"}, placer); err != nil {
					t.Fatal(err)
				}
				after, err := os.ReadFile(path)
				if err != nil {
					t.Fatal(err)
				}
				var compactAfter bytes.Buffer
				if err := json.Compact(&compactAfter, after); err != nil {
					t.Fatal(err)
				}
				var got map[string]json.RawMessage
				if err := json.Unmarshal(compactAfter.Bytes(), &got); err != nil {
					t.Fatal(err)
				}
				for key, want := range original {
					var compact bytes.Buffer
					if err := json.Compact(&compact, got[key]); err != nil {
						t.Fatalf("invalid value for %s: %v", key, err)
					}
					if !bytes.Equal(compact.Bytes(), want) {
						t.Errorf("attempt %d: %s = %s, want %s", attempt, key, got[key], want)
					}
				}
				gotPreferences := make(map[string]json.RawMessage, len(preferenceKeys))
				for _, key := range preferenceKeys {
					gotPreferences[key] = got[key]
				}
				if !reflect.DeepEqual(gotPreferences, wantPreferences) {
					t.Errorf("attempt %d: workspace preferences = %s, want %s", attempt, gotPreferences, wantPreferences)
				}
			}
		})
	}
}

func TestBuildImportCandidate_WorkspacePreferenceFixture(t *testing.T) {
	for _, tc := range workspacePreferenceCases(t) {
		t.Run(tc.Name, func(t *testing.T) {
			got := buildImportCandidate(tc.Config).workspace
			want := workspacePreference{
				status: tc.Expected.Status, mode: tc.Expected.Mode,
				selectedFrom: tc.Expected.SelectedFrom, conflict: tc.Expected.Conflict,
				reasonCode: tc.Expected.ReasonCode,
			}
			if got != want {
				t.Errorf("workspace selection = %+v, want %+v", got, want)
			}
		})
	}
}

func TestRefreshManagedConfigKeys_PreservesWorkspacePreferenceGroup(t *testing.T) {
	for _, tc := range workspacePreferenceCases(t) {
		t.Run(tc.Name, func(t *testing.T) {
			root := t.TempDir()
			path := opencodeSettingsConfigPath(root)
			original := tc.Config
			original["operator-metadata"] = json.RawMessage(`{"nested":[null,{"keep":true}]}`)
			original["installed_version"] = json.RawMessage(`"old-version"`)
			before, err := json.Marshal(original)
			if err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(path, before, 0o600); err != nil {
				t.Fatal(err)
			}
			placer := newOpencodePlacerAt(root)
			for attempt := 0; attempt < 2; attempt++ {
				if err := refreshManagedConfigKeys(path, placer); err != nil {
					t.Fatal(err)
				}
				after, err := os.ReadFile(path)
				if err != nil {
					t.Fatal(err)
				}
				var got map[string]json.RawMessage
				if err := json.Unmarshal(after, &got); err != nil {
					t.Fatal(err)
				}
				if string(got["installed_version"]) != string(mustMarshalJSON(version)) {
					t.Errorf("metadata was not refreshed: %s", got["installed_version"])
				}
				delete(got, "format_version")
				delete(got, "installed_version")
				delete(got, "updated_at")
				delete(original, "installed_version")
				want, err := json.Marshal(original)
				if err != nil {
					t.Fatal(err)
				}
				actual, err := json.Marshal(got)
				if err != nil {
					t.Fatal(err)
				}
				if !bytes.Equal(actual, want) {
					t.Errorf("attempt %d: update changed preferences: %s, want %s", attempt, actual, want)
				}
			}
		})
	}
}

func TestOpencodeConfigWriters_DiagnoseInvalidOrConflictingPreferenceOnce(t *testing.T) {
	for _, operation := range []struct {
		name  string
		write func(string, *opencodePlacer) error
	}{
		{"apply", func(path string, p *opencodePlacer) error {
			return writeOpencodeTeamHarnessConfig(path, opencodeSetupValues{LogsMode: "local"}, p)
		}},
		{"update", refreshManagedConfigKeys},
	} {
		for _, tc := range workspacePreferenceCases(t) {
			if tc.Expected.ReasonCode == "" {
				continue
			}
			t.Run(operation.name+"/"+tc.Name, func(t *testing.T) {
				root := t.TempDir()
				path := opencodeSettingsConfigPath(root)
				seed, err := json.Marshal(tc.Config)
				if err != nil {
					t.Fatal(err)
				}
				if err := os.WriteFile(path, seed, 0o600); err != nil {
					t.Fatal(err)
				}
				capture, err := os.CreateTemp(t.TempDir(), "stderr")
				if err != nil {
					t.Fatal(err)
				}
				defer capture.Close()
				originalStderr := os.Stderr
				os.Stderr = capture
				defer func() { os.Stderr = originalStderr }()
				if err := operation.write(path, newOpencodePlacerAt(root)); err != nil {
					t.Fatal(err)
				}
				os.Stderr = originalStderr
				output, err := os.ReadFile(capture.Name())
				if err != nil {
					t.Fatal(err)
				}
				if strings.Count(string(output), "\n") != 1 || !strings.Contains(string(output), tc.Expected.ReasonCode) {
					t.Errorf("diagnosis = %q, want one %s diagnosis", output, tc.Expected.ReasonCode)
				}
			})
		}
	}
}

func TestOpencodeConfigWriters_DiagnoseWorkspaceDestinationsWithoutRepair(t *testing.T) {
	windowsDestinationCodes := []string{"invalid_obsidian_destination"}
	if runtime.GOOS == "windows" {
		windowsDestinationCodes = nil
	}
	for _, operation := range []struct {
		name  string
		write func(string, *opencodePlacer) error
	}{
		{"apply", func(path string, p *opencodePlacer) error {
			return writeOpencodeTeamHarnessConfig(path, opencodeSetupValues{LogsMode: "local"}, p)
		}},
		{"update", refreshManagedConfigKeys},
	} {
		for _, tc := range []struct {
			name   string
			config string
			codes  []string
		}{
			{"remote missing both IDs", `{"workspace-mode":"gpt-space"}`, []string{"incomplete_space_destination"}},
			{"remote missing container ID", `{"workspace-mode":"gpt-space","workspace-space-id":"space_one"}`, []string{"incomplete_space_destination"}},
			{"remote missing Space ID", `{"workspace-mode":"gpt-space","workspace-container-page-id":"page_one"}`, []string{"incomplete_space_destination"}},
			{"missing ID before invalid ID", `{"workspace-mode":"gpt-space","workspace-space-id":null}`, []string{"incomplete_space_destination"}},
			{"remote null ID", `{"workspace-mode":"gpt-space","workspace-space-id":"space_one","workspace-container-page-id":null}`, []string{"invalid_space_destination"}},
			{"remote numeric ID", `{"workspace-mode":"gpt-space","workspace-space-id":7,"workspace-container-page-id":"page_one"}`, []string{"invalid_space_destination"}},
			{"remote list ID", `{"workspace-mode":"gpt-space","workspace-space-id":[],"workspace-container-page-id":"page_one"}`, []string{"invalid_space_destination"}},
			{"remote empty ID", `{"workspace-mode":"gpt-space","workspace-space-id":"","workspace-container-page-id":"page_one"}`, []string{"invalid_space_destination"}},
			{"remote URL ID", `{"workspace-mode":"gpt-space","workspace-space-id":"https://example.test/private-value","workspace-container-page-id":"page_one"}`, []string{"invalid_space_destination"}},
			{"remote path ID", `{"workspace-mode":"gpt-space","workspace-space-id":"space_one","workspace-container-page-id":"/private-value/page"}`, []string{"invalid_space_destination"}},
			{"remote whitespace ID", `{"workspace-mode":"gpt-space","workspace-space-id":"space_one","workspace-container-page-id":"private-value page"}`, []string{"invalid_space_destination"}},
			{"remote invalid initial character", `{"workspace-mode":"gpt-space","workspace-space-id":"_space_one","workspace-container-page-id":"page_one"}`, []string{"invalid_space_destination"}},
			{"remote oversized ID", `{"workspace-mode":"gpt-space","workspace-space-id":"` + strings.Repeat("s", 257) + `","workspace-container-page-id":"page_one"}`, []string{"invalid_space_destination"}},
			{"remote valid opaque IDs", `{"workspace-mode":"gpt-space","workspace-space-id":"Space_1-a","workspace-container-page-id":"Page_2-b"}`, nil},
			{"remote longest valid ID", `{"workspace-mode":"gpt-space","workspace-space-id":"` + strings.Repeat("s", 256) + `","workspace-container-page-id":"page_one"}`, nil},
			{"remote conflict and missing IDs", `{"workspace-mode":"gpt-space","logs-mode":"local"}`, []string{"selector_conflict", "incomplete_space_destination"}},
			{"invalid selector before destination", `{"workspace-mode":null,"workspace-space-id":"https://example.test/private-value"}`, []string{"invalid_workspace_mode"}},
			{"legacy Obsidian missing destination", `{"logs-mode":"obsidian"}`, []string{"incomplete_obsidian_destination"}},
			{"legacy Obsidian missing subfolder", `{"logs-mode":"obsidian","logs-path":"/private-value/vault"}`, []string{"incomplete_obsidian_destination"}},
			{"canonical Obsidian missing vault", `{"workspace-mode":"obsidian","logs-subfolder":"work-logs"}`, []string{"incomplete_obsidian_destination"}},
			{"Obsidian wrong type", `{"workspace-mode":"obsidian","logs-path":null,"logs-subfolder":"work-logs"}`, []string{"invalid_obsidian_destination"}},
			{"Obsidian empty subfolder", `{"logs-mode":"obsidian","logs-path":"/private-value/vault","logs-subfolder":""}`, []string{"invalid_obsidian_destination"}},
			{"Obsidian native Windows destination", `{"logs-mode":"obsidian","logs-path":"C:/private-value/Vault","logs-subfolder":"work-logs"}`, windowsDestinationCodes},
			{"local ignores unused remote destination", `{"workspace-mode":"local","workspace-space-id":null}`, nil},
		} {
			t.Run(operation.name+"/"+tc.name, func(t *testing.T) {
				root := t.TempDir()
				path := opencodeSettingsConfigPath(root)
				var original map[string]json.RawMessage
				if err := json.Unmarshal([]byte(tc.config), &original); err != nil {
					t.Fatal(err)
				}
				original["operator-metadata"] = json.RawMessage(`{"nested":["private-value",null,{"keep":true}]}`)
				before, err := json.Marshal(original)
				if err != nil {
					t.Fatal(err)
				}
				if err := os.WriteFile(path, before, 0o600); err != nil {
					t.Fatal(err)
				}
				capture, err := os.CreateTemp(t.TempDir(), "stderr")
				if err != nil {
					t.Fatal(err)
				}
				defer capture.Close()
				originalStderr := os.Stderr
				os.Stderr = capture
				defer func() { os.Stderr = originalStderr }()
				if err := operation.write(path, newOpencodePlacerAt(root)); err != nil {
					t.Fatal(err)
				}
				os.Stderr = originalStderr
				output, err := os.ReadFile(capture.Name())
				if err != nil {
					t.Fatal(err)
				}
				if len(tc.codes) == 0 && len(output) != 0 {
					t.Errorf("unexpected destination diagnosis: %q", output)
				}
				if len(tc.codes) > 0 && strings.Count(string(output), "\n") != 1 {
					t.Errorf("diagnosis = %q, want one line", output)
				}
				for _, code := range tc.codes {
					if !strings.Contains(string(output), code) {
						t.Errorf("diagnosis = %q, want %s", output, code)
					}
				}
				if strings.Contains(string(output), "private-value") || len(output) > 512 {
					t.Errorf("diagnosis disclosed values or exceeded its bound: %q", output)
				}
				after, err := os.ReadFile(path)
				if err != nil {
					t.Fatal(err)
				}
				var got map[string]json.RawMessage
				if err := json.Unmarshal(after, &got); err != nil {
					t.Fatal(err)
				}
				for _, key := range []string{"format_version", "installed_version", "updated_at"} {
					delete(got, key)
				}
				actual, err := json.Marshal(got)
				if err != nil {
					t.Fatal(err)
				}
				if !bytes.Equal(actual, before) {
					t.Errorf("destination or metadata was repaired: %s, want %s", actual, before)
				}
			})
		}
	}
}

type obsidianDestinationCase struct {
	name, base, subfolder, reason string
}

func obsidianDestinationCases(t *testing.T) []obsidianDestinationCase {
	t.Helper()
	home := filepath.Join(t.TempDir(), "private-value", "home")
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	vault := filepath.Join(t.TempDir(), "private-value", "Vault")
	root := filepath.VolumeName(vault) + string(filepath.Separator)
	windowsReason := "invalid_obsidian_destination"
	literalBackslashReason := ""
	homeCaseReason := ""
	if runtime.GOOS == "windows" {
		windowsReason = ""
		literalBackslashReason = "invalid_obsidian_destination"
		homeCaseReason = "invalid_obsidian_destination"
	}
	return []obsidianDestinationCase{
		{"parent subfolder", vault, "../notes", "invalid_obsidian_destination"},
		{"nested parent subfolder", vault, "notes/../archive", "invalid_obsidian_destination"},
		{"current subfolder", vault, "./notes", "invalid_obsidian_destination"},
		{"nested current subfolder", vault, "notes/./archive", "invalid_obsidian_destination"},
		{"empty subfolder segment", vault, "notes//archive", "invalid_obsidian_destination"},
		{"trailing subfolder separator", vault, "notes/", "invalid_obsidian_destination"},
		{"absolute subfolder", vault, "/notes", "invalid_obsidian_destination"},
		{"backslash subfolder", vault, `notes\archive`, "invalid_obsidian_destination"},
		{"Windows absolute subfolder", vault, "C:/notes", "invalid_obsidian_destination"},
		{"Windows drive-relative subfolder", vault, "C:notes", "invalid_obsidian_destination"},
		{"star subfolder", vault, "notes*", "invalid_obsidian_destination"},
		{"question subfolder", vault, "notes?", "invalid_obsidian_destination"},
		{"open bracket subfolder", vault, "notes[archive", "invalid_obsidian_destination"},
		{"close bracket subfolder", vault, "notes]archive", "invalid_obsidian_destination"},
		{"open brace subfolder", vault, "notes{archive", "invalid_obsidian_destination"},
		{"close brace subfolder", vault, "notes}archive", "invalid_obsidian_destination"},
		{"control subfolder", vault, "notes\x00", "invalid_obsidian_destination"},
		{"DEL subfolder", vault, "notes\x7f", "invalid_obsidian_destination"},
		{"oversized ASCII subfolder", vault, strings.Repeat("a", 1025), "invalid_obsidian_destination"},
		{"oversized Unicode subfolder", vault, strings.Repeat("é", 512) + "a", "invalid_obsidian_destination"},
		{"relative base", "private-value/Vault", "notes", "invalid_obsidian_destination"},
		{"unexpanded home base", "~private-value/Vault", "notes", "invalid_obsidian_destination"},
		{"root base", root, "notes", "invalid_obsidian_destination"},
		{"normalized root base", root + ".", "notes", "invalid_obsidian_destination"},
		{"home base", home, "notes", "invalid_obsidian_destination"},
		{"normalized home base", home + string(filepath.Separator), "notes", "invalid_obsidian_destination"},
		{"native home case base", strings.ToUpper(home), "notes", homeCaseReason},
		{"parent base", vault + string(filepath.Separator) + "../outside", "notes", "invalid_obsidian_destination"},
		{"star base", vault + "*", "notes", "invalid_obsidian_destination"},
		{"question base", vault + "?", "notes", "invalid_obsidian_destination"},
		{"bracket base", vault + "[archive]", "notes", "invalid_obsidian_destination"},
		{"control base", vault + "\x00", "notes", "invalid_obsidian_destination"},
		{"DEL base", vault + "\x7f", "notes", "invalid_obsidian_destination"},
		{"unavailable native vault", vault, "notes", ""},
		{"nested subfolder", vault, "notes/archive", ""},
		{"literal space subfolder", vault, " ", ""},
		{"literal spaced segments", filepath.Join(vault, " personal "), " team / notes ", ""},
		{"literal parent prefix", filepath.Join(vault, "..personal"), "..notes", ""},
		{"Unicode destination", filepath.Join(vault, "Vúlt_資料"), "équipe/調査", ""},
		{"Unicode byte boundary", vault, strings.Repeat("é", 512), ""},
		{"ASCII byte boundary", vault, strings.Repeat("a", 1024), ""},
		{"base braces remain valid", vault + "{archive}", "notes", ""},
		{"base backslash remains valid", filepath.Join(vault, `vault\personal`), "notes", ""},
		{"literal POSIX backslash base", vault + `\..\personal`, "notes", literalBackslashReason},
		{"long base remains valid", vault + strings.Repeat(string(filepath.Separator)+"segment", 600), "notes", ""},
		{"home child remains valid", filepath.Join(home, "Vault"), "notes", ""},
		{"native Windows drive base", `C:\private-value\Vault`, "notes", windowsReason},
		{"native Windows slash base", "C:/private-value/Vault", "notes", windowsReason},
		{"native Windows UNC base", `\\server\share\private-value\Vault`, "notes", windowsReason},
		{"native Windows UNC root", `\\server\share`, "notes", "invalid_obsidian_destination"},
		{"native Windows drive-relative base", `C:private-value`, "notes", "invalid_obsidian_destination"},
	}
}

func TestWorkspaceDestinationDiagnosis_ObsidianPathContract(t *testing.T) {
	for _, tc := range obsidianDestinationCases(t) {
		t.Run(tc.name, func(t *testing.T) {
			encoded, err := json.Marshal(map[string]string{"logs-path": tc.base, "logs-subfolder": tc.subfolder})
			if err != nil {
				t.Fatal(err)
			}
			var raw map[string]json.RawMessage
			if err := json.Unmarshal(encoded, &raw); err != nil {
				t.Fatal(err)
			}
			diagnosis := workspaceDestinationDiagnosis(raw, "obsidian")
			if reason := strings.SplitN(diagnosis, ":", 2)[0]; reason != tc.reason {
				t.Errorf("diagnosis reason = %q, want %q", reason, tc.reason)
			}
			after, err := json.Marshal(raw)
			if err != nil {
				t.Fatal(err)
			}
			if !bytes.Equal(after, encoded) {
				t.Error("destination validator changed its input")
			}
		})
	}
}

func TestOpencodeConfigWriters_PreserveObsidianPathContract(t *testing.T) {
	cases := obsidianDestinationCases(t)
	for _, operation := range []struct {
		name  string
		write func(string, *opencodePlacer) error
	}{
		{"apply", func(path string, p *opencodePlacer) error {
			return writeOpencodeTeamHarnessConfig(path, opencodeSetupValues{LogsMode: "local"}, p)
		}},
		{"update", refreshManagedConfigKeys},
	} {
		for _, selector := range []string{"workspace-mode", "logs-mode"} {
			for _, tc := range cases {
				t.Run(operation.name+"/"+selector+"/"+tc.name, func(t *testing.T) {
					root := t.TempDir()
					path := opencodeSettingsConfigPath(root)
					seed := map[string]interface{}{
						selector: "obsidian", "logs-path": tc.base, "logs-subfolder": tc.subfolder,
						"operator-metadata": map[string]interface{}{"private-value": []interface{}{nil, true, 1}},
					}
					before, err := json.Marshal(seed)
					if err != nil {
						t.Fatal(err)
					}
					if err := os.WriteFile(path, before, 0o600); err != nil {
						t.Fatal(err)
					}
					wantLines := 0
					if tc.reason != "" {
						wantLines = 1
					}
					capture, err := os.CreateTemp(t.TempDir(), "stderr")
					if err != nil {
						t.Fatal(err)
					}
					defer capture.Close()
					originalStderr := os.Stderr
					os.Stderr = capture
					defer func() { os.Stderr = originalStderr }()
					if err := operation.write(path, newOpencodePlacerAt(root)); err != nil {
						t.Fatal(err)
					}
					os.Stderr = originalStderr
					output, err := os.ReadFile(capture.Name())
					if err != nil {
						t.Fatal(err)
					}
					if (len(output) == 0) != (tc.reason == "") {
						t.Errorf("diagnosis emptiness does not match reason %q: %q", tc.reason, output)
					}
					if strings.Count(string(output), "\n") != wantLines || !strings.Contains(string(output), tc.reason) {
						t.Errorf("diagnosis = %q, want %d lines with reason %q", output, wantLines, tc.reason)
					}
					if strings.Contains(string(output), "private-value") || len(output) > 512 {
						t.Error("diagnosis disclosed a value or exceeded its bound")
					}
					after, err := os.ReadFile(path)
					if err != nil {
						t.Fatal(err)
					}
					var got map[string]json.RawMessage
					if err := json.Unmarshal(after, &got); err != nil {
						t.Fatal(err)
					}
					for _, key := range []string{"format_version", "installed_version", "updated_at"} {
						delete(got, key)
					}
					actual, err := json.Marshal(got)
					if err != nil {
						t.Fatal(err)
					}
					if !bytes.Equal(actual, before) {
						t.Error("apply/update changed the destination or unrelated values")
					}
				})
			}
		}
	}
}

// TestAssertCfgDerivedKeysMatchAllowlist_DoesNotPanicOnCurrentMaps verifies
// that the live cfgDerivedKeysWritten / allowlistedOpencodeKeys pair stays in
// sync (the normal, expected state) — assertCfgDerivedKeysMatchAllowlist must
// not panic when called with the package's real maps. This is exercised
// indirectly on every writeOpencodeTeamHarnessConfig call; this test isolates
// the guard itself so a future drift between the two maps is caught at the
// guard, not only via a downstream write-path failure.
func TestAssertCfgDerivedKeysMatchAllowlist_DoesNotPanicOnCurrentMaps(t *testing.T) {
	defer func() {
		if r := recover(); r != nil {
			t.Errorf("assertCfgDerivedKeysMatchAllowlist panicked on the current maps: %v", r)
		}
	}()
	assertCfgDerivedKeysMatchAllowlist()
}

// TestAssertCfgDerivedKeysMatchAllowlist_PanicsOnDrift verifies the guard is
// load-bearing: when cfgDerivedKeysWritten and allowlistedOpencodeKeys
// diverge, the assertion panics rather than silently allowing the mismatch.
// This makes allowlistedOpencodeKeys an actual consulted source of truth
// instead of documentation that can drift unnoticed.
func TestAssertCfgDerivedKeysMatchAllowlist_PanicsOnDrift(t *testing.T) {
	origWritten := cfgDerivedKeysWritten
	defer func() { cfgDerivedKeysWritten = origWritten }()
	cfgDerivedKeysWritten = []string{"logs-mode", "opencode.cost_tier_provider", "an-extra-key-not-in-allowlist"}

	defer func() {
		if recover() == nil {
			t.Error("assertCfgDerivedKeysMatchAllowlist did not panic on a drifted key set")
		}
	}()
	assertCfgDerivedKeysMatchAllowlist()
}

// TestWriteOpencodeTeamHarnessConfig_HardenedPath verifies that the writer
// rejects a destination that is not under the placer's config root. This
// exercises the SEC-OC-R2 hardened-write requirement — the write must go
// through the placer's validated config root, not an arbitrary path.
func TestWriteOpencodeTeamHarnessConfig_HardenedPath(t *testing.T) {
	dir := t.TempDir()
	placer := newOpencodePlacerAt(dir)

	// Attempt to write outside the config root (traversal path).
	outsidePath := filepath.Join(t.TempDir(), ".team-harness.json")

	cfg := opencodeSetupValues{LogsMode: "local"}
	err := writeOpencodeTeamHarnessConfig(outsidePath, cfg, placer)
	if err == nil {
		t.Error("expected error when writing outside the config root (SEC-OC-R2), got nil")
	}
}

// TestDetectExistingConfig_Absent verifies that detectExistingConfig returns
// nil when no file exists at the given path.
func TestDetectExistingConfig_Absent(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, ".team-harness.json")

	if got := detectExistingConfig(path); got != nil {
		t.Errorf("detectExistingConfig (absent) = non-nil, want nil")
	}
}

// TestDetectExistingConfig_Present verifies that detectExistingConfig returns
// a populated map when a valid .team-harness.json is present.
func TestDetectExistingConfig_Present(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, ".team-harness.json")

	seed := map[string]interface{}{
		"logs-mode": "obsidian",
		"language":  "es",
	}
	seedBytes, _ := json.Marshal(seed)
	if err := os.WriteFile(cfgPath, seedBytes, 0o644); err != nil {
		t.Fatalf("seed write: %v", err)
	}

	got := detectExistingConfig(cfgPath)
	if got == nil {
		t.Fatal("detectExistingConfig returned nil for an existing file")
	}

	logsMode := extractStringFromRaw(got, "logs-mode")
	if logsMode != "obsidian" {
		t.Errorf("logs-mode = %q, want obsidian", logsMode)
	}
	lang := extractStringFromRaw(got, "language")
	if lang != "es" {
		t.Errorf("language = %q, want es", lang)
	}
}

// TestOpencodeSettingsConfigPath verifies the path helper returns the correct
// filename under the config root.
func TestOpencodeSettingsConfigPath(t *testing.T) {
	got := opencodeSettingsConfigPath("/some/config/root")
	want := filepath.Join("/some/config/root", ".team-harness.json")
	if got != want {
		t.Errorf("opencodeSettingsConfigPath = %q, want %q", got, want)
	}
}

// ---------------------------------------------------------------------------
// Tests: buildImportCandidate — workspace preference only
// ---------------------------------------------------------------------------

func TestBuildImportCandidate_ReadsLogsMode(t *testing.T) {
	seed := map[string]interface{}{
		"logs-mode": "obsidian",
		// Removed fields present in the file — must NOT be read into the candidate.
		"language":         "es",
		"english_learning": true,
		"clickup":          map[string]interface{}{"workspace_id": "ws-42"},
		"obsidian_tasks":   map[string]interface{}{"enabled": true},
	}
	seedBytes, _ := json.Marshal(seed)

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(seedBytes, &raw); err != nil {
		t.Fatalf("unmarshal seed: %v", err)
	}

	cand := buildImportCandidate(raw)
	if cand == nil {
		t.Fatal("buildImportCandidate returned nil")
	}
	if cand.workspace.mode != "obsidian" {
		t.Errorf("workspace mode = %q, want obsidian", cand.workspace.mode)
	}
}

func TestBuildImportCandidate_AbsentSelectorsDefaultsLocal(t *testing.T) {
	seed := map[string]interface{}{
		"language": "es", // non-allowlisted key — ignored
	}
	seedBytes, _ := json.Marshal(seed)

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(seedBytes, &raw); err != nil {
		t.Fatalf("unmarshal seed: %v", err)
	}

	cand := buildImportCandidate(raw)
	if cand.workspace.mode != "local" || cand.workspace.selectedFrom != "default" {
		t.Errorf("workspace = %+v, want default local", cand.workspace)
	}
}

// ---------------------------------------------------------------------------
// Tests: hasControlChar / isValidISOLang — SEC-004 pre-fill validation (AC-6)
// ---------------------------------------------------------------------------

// TestHasControlChar_DetectsNul verifies that \x00 is detected.
func TestHasControlChar_DetectsNul(t *testing.T) {
	if !hasControlChar("/path/with\x00nul") {
		t.Error("hasControlChar: missed \\x00")
	}
}

// TestHasControlChar_DetectsUnit1F verifies that \x1f (the last C0 control) is detected.
func TestHasControlChar_DetectsUnit1F(t *testing.T) {
	if !hasControlChar("/path/with\x1f") {
		t.Error("hasControlChar: missed \\x1f")
	}
}

// TestHasControlChar_DetectsDel verifies that \x7f (DEL) is detected.
func TestHasControlChar_DetectsDel(t *testing.T) {
	if !hasControlChar("bad\x7fvalue") {
		t.Error("hasControlChar: missed \\x7f")
	}
}

// TestHasControlChar_AcceptsCleanPath verifies that a normal path is accepted.
func TestHasControlChar_AcceptsCleanPath(t *testing.T) {
	if hasControlChar("/home/user/my-vault") {
		t.Error("hasControlChar: false positive on clean path")
	}
}

// TestIsValidISOLang_AcceptsLowercasePairs verifies valid 2-letter codes.
func TestIsValidISOLang_AcceptsLowercasePairs(t *testing.T) {
	for _, code := range []string{"en", "es", "fr", "de", "zh"} {
		if !isValidISOLang(code) {
			t.Errorf("isValidISOLang(%q) = false, want true", code)
		}
	}
}

// TestIsValidISOLang_RejectsTooLong verifies that codes longer than 2 letters
// are rejected.
func TestIsValidISOLang_RejectsTooLong(t *testing.T) {
	for _, code := range []string{"eng", "english", "es_MX"} {
		if isValidISOLang(code) {
			t.Errorf("isValidISOLang(%q) = true, want false (too long)", code)
		}
	}
}

// TestIsValidISOLang_RejectsUppercase verifies that uppercase codes are rejected.
func TestIsValidISOLang_RejectsUppercase(t *testing.T) {
	for _, code := range []string{"EN", "Es", "FR"} {
		if isValidISOLang(code) {
			t.Errorf("isValidISOLang(%q) = true, want false (uppercase not allowed)", code)
		}
	}
}

// TestIsValidISOLang_RejectsEmpty verifies that empty string is rejected.
func TestIsValidISOLang_RejectsEmpty(t *testing.T) {
	if isValidISOLang("") {
		t.Error("isValidISOLang(\"\") = true, want false")
	}
}

// ---------------------------------------------------------------------------
// Tests: CC-config fallback path — AC-1, AC-4, AC-5
// ---------------------------------------------------------------------------

// TestCCConfigFallback_CandidateBuiltFromCCConfig verifies that when the
// opencode-owned config is absent but ~/.claude/.team-harness.json exists,
// detectExistingConfig finds it (AC-1 oracle: CC-config candidate detected).
// This test exercises detectExistingConfig on the CC path directly (the HOME
// override approach makes claudeCodeTeamHarnessConfigPath testable without
// env manipulation on all platforms).
func TestCCConfigFallback_DetectFromArbitraryPath(t *testing.T) {
	// Simulate: write a valid .team-harness.json to a temp directory.
	tmpHome := t.TempDir()
	ccDir := filepath.Join(tmpHome, ".claude")
	if err := os.MkdirAll(ccDir, 0o700); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	ccCfgPath := filepath.Join(ccDir, ".team-harness.json")

	seed := map[string]interface{}{
		"logs-mode": "obsidian",
		// Removed keys may exist in old CC configs — must be ignored (AC-7).
		"language":         "es",
		"english_learning": true,
	}
	seedBytes, _ := json.Marshal(seed)
	if err := os.WriteFile(ccCfgPath, seedBytes, 0o600); err != nil {
		t.Fatalf("write CC config: %v", err)
	}

	// Use detectExistingConfig directly on the CC path (same function the
	// CC-fallback branch in dispatch.go calls).
	m := detectExistingConfig(ccCfgPath)
	if m == nil {
		t.Fatal("detectExistingConfig returned nil for an existing CC config")
	}
	cand := buildImportCandidate(m)
	if cand.workspace.mode != "obsidian" {
		t.Errorf("workspace mode = %q, want obsidian", cand.workspace.mode)
	}
}

// TestCCConfigFallback_AbsentReturnNil verifies that detectExistingConfig
// returns nil when the CC config file does not exist (AC-5: no CC config →
// candidate nil → fresh defaults, install completes without requiring it).
func TestCCConfigFallback_AbsentReturnNil(t *testing.T) {
	tmpHome := t.TempDir()
	nonExistentPath := filepath.Join(tmpHome, ".claude", ".team-harness.json")

	m := detectExistingConfig(nonExistentPath)
	if m != nil {
		t.Error("detectExistingConfig returned non-nil for absent CC config (AC-5 violated)")
	}
}

// ---------------------------------------------------------------------------
// Tests: .ps1 static-verify check — AC-7, AC-9 (Step 10)
// ---------------------------------------------------------------------------

// TestInstallOpencodePS1_StaticVerify asserts that bin/install-opencode.ps1
// contains the correct security-critical patterns required by AC-7 / AC-9:
//   - Exact-field asset-name match using -eq (not Select-String, -match, or
//     substring), per SEC-002.
//   - .ToLowerInvariant() hash normalization, per SEC-001.
//   - -UseBasicParsing and -TimeoutSec on BOTH download calls, per SEC-003.
//   - Direct-run shape: & $exe / $psi.FileName with the binary file, per AC-8.
//   - --memory-url argv shape, per AC-9.
//   - $args forwarding, per AC-9.
func TestInstallOpencodePS1_StaticVerify(t *testing.T) {
	psPath := filepath.Join("..", "..", "bin", "install-opencode.ps1")
	content, err := os.ReadFile(psPath)
	if err != nil {
		t.Fatalf("could not read bin/install-opencode.ps1: %v", err)
	}
	src := string(content)

	checks := []struct {
		name    string
		pattern string
	}{
		// SEC-002: exact-field split, not substring match.
		{"exact-field-split: -split '\\s+'", `-split '\s+'`},
		{"exact-field-eq: -eq $Asset", `-eq $Asset`},
		// SEC-001: case-insensitive hash normalization.
		{"hash-normalization: ToLowerInvariant", `ToLowerInvariant()`},
		// SEC-003: -UseBasicParsing and -TimeoutSec on downloads.
		{"sums-download: UseBasicParsing", `-UseBasicParsing`},
		{"sums-download: TimeoutSec", `-TimeoutSec`},
		// Direct-run shape via ProcessStartInfo (AC-8).
		{"direct-run: psi.FileName", `$psi.FileName`},
		{"direct-run: UseShellExecute=$false", `UseShellExecute = $false`},
		// --memory-url argv shape (AC-9).
		{"memory-url-argv: --memory-url", `--memory-url`},
		// $args forwarding (AC-9).
		{"extra-args: $args", `$args`},
		// No Select-String / -match for the asset name (SEC-002 negative check).
	}

	for _, chk := range checks {
		if !containsString(src, chk.pattern) {
			t.Errorf("install-opencode.ps1 missing required pattern (%s): %q", chk.name, chk.pattern)
		}
	}

	// Negative check: SEC-002 requires exact-field match, NOT Select-String or -match
	// against the asset name as a standalone substring matcher.
	// "Select-String" may appear in comments explaining what NOT to do, so we check
	// for the functional form: Select-String used with the $Asset variable.
	if containsString(src, "Select-String $Asset") || containsString(src, "Select-String $asset") {
		t.Error("install-opencode.ps1 uses Select-String for asset lookup (SEC-002 violated: use exact-field -eq)")
	}
}
