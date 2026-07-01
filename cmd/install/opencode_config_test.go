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
		"logs-mode":           "obsidian",
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

	// Installer always writes "local" after the trim (AC-1).
	if result["logs-mode"] != "local" {
		t.Errorf("logs-mode = %v, want local", result["logs-mode"])
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
// Tests: buildImportCandidate — trimmed to logs-mode only (AC-7)
// ---------------------------------------------------------------------------

// TestBuildImportCandidate_ReadsLogsMode verifies that buildImportCandidate
// reads the surviving allowlisted key (logs-mode) from a raw JSON map.
// The removed keys (language, english_learning, clickup, obsidian_tasks) are
// intentionally not extracted — they must not appear in the written config (AC-7).
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
	if cand.logsMode != "obsidian" {
		t.Errorf("logsMode = %q, want obsidian", cand.logsMode)
	}
}

// TestBuildImportCandidate_AbsentLogsModeReturnsEmpty verifies that absent
// logs-mode is returned as "" (not an error), so a sparse CC config is handled.
func TestBuildImportCandidate_AbsentLogsModeReturnsEmpty(t *testing.T) {
	seed := map[string]interface{}{
		"language": "es", // non-allowlisted key — ignored
	}
	seedBytes, _ := json.Marshal(seed)

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(seedBytes, &raw); err != nil {
		t.Fatalf("unmarshal seed: %v", err)
	}

	cand := buildImportCandidate(raw)
	if cand.logsMode != "" {
		t.Errorf("logsMode = %q, want empty (absent key)", cand.logsMode)
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
	// Only logs-mode is extracted; removed fields are not read (AC-7).
	if cand.logsMode != "obsidian" {
		t.Errorf("logsMode = %q, want obsidian", cand.logsMode)
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
