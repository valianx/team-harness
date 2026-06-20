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
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

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
		"logs-mode":           "local",
	}
	seedBytes, _ := json.Marshal(seed)
	if err := os.WriteFile(cfgPath, seedBytes, 0o644); err != nil {
		t.Fatalf("seed write: %v", err)
	}

	cfg := opencodeSetupValues{LogsMode: "obsidian", LogsPath: "/tmp/vault", LogsSubfolder: "work-logs"}
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

	// Installer sets logs-mode from cfg (obsidian overrides the seed's local).
	if result["logs-mode"] != "obsidian" {
		t.Errorf("logs-mode = %v, want obsidian", result["logs-mode"])
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
	if _, ok := result["updated_at"]; !ok {
		t.Error("updated_at missing from fresh install")
	}
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
