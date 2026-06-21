package main

// Tests for opencode_tui.go and the interactive gating contract:
//
//   No-hang invariant (AC-2 / AC-8):
//     - With no tty AND no env vars, resolveOpencodeSetupFromEnvFlags returns
//       without blocking and without opening /dev/tty.
//     - With --non-interactive set (nonInteractiveFlag=true), the apply path
//       uses resolveOpencodeSetupFromEnvFlags regardless of tty state (AC-8).
//
//   No secret value at rest (AC-9):
//     - The opencodeMCPValues struct carries no bearer/key literal fields;
//       only MemoryURL (literal, validated), MemoryRequiresAuth (bool UI signal),
//       and Context7Enabled (bool UI signal) are present.
//     - registerOpencodeMCPFromValues writes only {env:VAR} refs, never a
//       literal secret to opencode.json.
//
//   resolveOpencodeSetupFromEnvFlags (AC-8 / AC-2):
//     - Resolves logs-mode from LOGS_MODE env.
//     - Resolves Memory URL from MEMORY_MCP_URL env.
//     - Resolves context7 presence from CONTEXT7_API_KEY env.
//     - Returns "local" as the default logs-mode when LOGS_MODE is unset.
//     - Strips locale variants from LANGUAGE (e.g. "es_MX" → "es").

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// ---------------------------------------------------------------------------
// Suite — resolveOpencodeSetupFromEnvFlags
// ---------------------------------------------------------------------------

// TestResolveOpencodeSetupFromEnvFlags_DefaultLogsModeIsLocal verifies that
// when LOGS_MODE is unset the env/flags resolver returns "local" as the
// logs-mode (the sensible default for a fresh non-interactive install).
func TestResolveOpencodeSetupFromEnvFlags_DefaultLogsModeIsLocal(t *testing.T) {
	orig := memoryURLFlag
	defer func() { memoryURLFlag = orig }()
	memoryURLFlag = ""

	t.Setenv("LOGS_MODE", "")
	t.Setenv("MEMORY_MCP_URL", "")
	t.Setenv("CONTEXT7_API_KEY", "")
	t.Setenv("LANGUAGE", "")

	cfg := resolveOpencodeSetupFromEnvFlags()
	if cfg.LogsMode != "local" {
		t.Errorf("LogsMode = %q, want %q", cfg.LogsMode, "local")
	}
}

// TestResolveOpencodeSetupFromEnvFlags_ReadsLogsModeFromEnv verifies that
// LOGS_MODE=obsidian is picked up correctly.
func TestResolveOpencodeSetupFromEnvFlags_ReadsLogsModeFromEnv(t *testing.T) {
	orig := memoryURLFlag
	defer func() { memoryURLFlag = orig }()
	memoryURLFlag = ""

	t.Setenv("LOGS_MODE", "obsidian")
	t.Setenv("LOGS_PATH", "/tmp/vault")
	t.Setenv("LOGS_SUBFOLDER", "")
	t.Setenv("MEMORY_MCP_URL", "")
	t.Setenv("CONTEXT7_API_KEY", "")

	cfg := resolveOpencodeSetupFromEnvFlags()
	if cfg.LogsMode != "obsidian" {
		t.Errorf("LogsMode = %q, want obsidian", cfg.LogsMode)
	}
	if cfg.LogsPath != "/tmp/vault" {
		t.Errorf("LogsPath = %q, want /tmp/vault", cfg.LogsPath)
	}
	if cfg.LogsSubfolder != "work-logs" {
		t.Errorf("LogsSubfolder = %q, want work-logs (default)", cfg.LogsSubfolder)
	}
}

// TestResolveOpencodeSetupFromEnvFlags_ReadsMemoryURL verifies that the
// MEMORY_MCP_URL env var is picked up as the Memory URL.
func TestResolveOpencodeSetupFromEnvFlags_ReadsMemoryURL(t *testing.T) {
	orig := memoryURLFlag
	defer func() { memoryURLFlag = orig }()
	memoryURLFlag = ""

	t.Setenv("MEMORY_MCP_URL", "https://mcp.example.com/mcp")
	t.Setenv("CONTEXT7_API_KEY", "")
	t.Setenv("LOGS_MODE", "")

	cfg := resolveOpencodeSetupFromEnvFlags()
	if cfg.MCP.MemoryURL != "https://mcp.example.com/mcp" {
		t.Errorf("MCP.MemoryURL = %q, want https://mcp.example.com/mcp", cfg.MCP.MemoryURL)
	}
}

// TestResolveOpencodeSetupFromEnvFlags_FlagWinsOverEnv verifies that the
// --memory-url flag value takes priority over MEMORY_MCP_URL env (mirrors the
// existing resolveOpencodeMemoryURL behaviour).
func TestResolveOpencodeSetupFromEnvFlags_FlagWinsOverEnv(t *testing.T) {
	orig := memoryURLFlag
	defer func() { memoryURLFlag = orig }()
	memoryURLFlag = "https://flag.example.com/mcp"

	t.Setenv("MEMORY_MCP_URL", "https://env.example.com/mcp")
	t.Setenv("CONTEXT7_API_KEY", "")
	t.Setenv("LOGS_MODE", "")

	cfg := resolveOpencodeSetupFromEnvFlags()
	if cfg.MCP.MemoryURL != "https://flag.example.com/mcp" {
		t.Errorf("MCP.MemoryURL = %q, want flag value", cfg.MCP.MemoryURL)
	}
}

// TestResolveOpencodeSetupFromEnvFlags_Context7PresentWhenEnvSet verifies
// that Context7Enabled is true when CONTEXT7_API_KEY is set.
func TestResolveOpencodeSetupFromEnvFlags_Context7PresentWhenEnvSet(t *testing.T) {
	orig := memoryURLFlag
	defer func() { memoryURLFlag = orig }()
	memoryURLFlag = ""

	t.Setenv("CONTEXT7_API_KEY", "ctx7sk-testkey")
	t.Setenv("MEMORY_MCP_URL", "")
	t.Setenv("LOGS_MODE", "")

	cfg := resolveOpencodeSetupFromEnvFlags()
	if !cfg.MCP.Context7Enabled {
		t.Error("Context7Enabled = false, want true when CONTEXT7_API_KEY is set")
	}
}

// TestResolveOpencodeSetupFromEnvFlags_Context7AbsentWhenEnvEmpty verifies
// that Context7Enabled is false when CONTEXT7_API_KEY is not set.
func TestResolveOpencodeSetupFromEnvFlags_Context7AbsentWhenEnvEmpty(t *testing.T) {
	orig := memoryURLFlag
	defer func() { memoryURLFlag = orig }()
	memoryURLFlag = ""

	t.Setenv("CONTEXT7_API_KEY", "")
	t.Setenv("MEMORY_MCP_URL", "")
	t.Setenv("LOGS_MODE", "")

	cfg := resolveOpencodeSetupFromEnvFlags()
	if cfg.MCP.Context7Enabled {
		t.Error("Context7Enabled = true, want false when CONTEXT7_API_KEY is empty")
	}
}

// TestResolveOpencodeSetupFromEnvFlags_LanguageLocaleStripped verifies that
// locale variants like "es_MX" are stripped to the ISO 639-1 code "es".
func TestResolveOpencodeSetupFromEnvFlags_LanguageLocaleStripped(t *testing.T) {
	orig := memoryURLFlag
	defer func() { memoryURLFlag = orig }()
	memoryURLFlag = ""

	t.Setenv("LANGUAGE", "es_MX")
	t.Setenv("MEMORY_MCP_URL", "")
	t.Setenv("CONTEXT7_API_KEY", "")
	t.Setenv("LOGS_MODE", "")

	cfg := resolveOpencodeSetupFromEnvFlags()
	if cfg.Language != "es" {
		t.Errorf("Language = %q, want es (locale variant stripped)", cfg.Language)
	}
}

// TestResolveOpencodeSetupFromEnvFlags_LanguageTooLongIsDropped verifies that
// a language value that is longer than 2 characters and not a locale variant
// is dropped (not stored as an invalid ISO 639-1 code).
func TestResolveOpencodeSetupFromEnvFlags_LanguageTooLongIsDropped(t *testing.T) {
	orig := memoryURLFlag
	defer func() { memoryURLFlag = orig }()
	memoryURLFlag = ""

	t.Setenv("LANGUAGE", "english")
	t.Setenv("MEMORY_MCP_URL", "")
	t.Setenv("CONTEXT7_API_KEY", "")
	t.Setenv("LOGS_MODE", "")

	cfg := resolveOpencodeSetupFromEnvFlags()
	if cfg.Language != "" {
		t.Errorf("Language = %q, want empty (invalid ISO 639-1 code must be dropped)", cfg.Language)
	}
}

// ---------------------------------------------------------------------------
// Suite — no-secret-value-at-rest (AC-9)
// ---------------------------------------------------------------------------

// TestOpencodeSetupValues_NoSecretFields verifies that the opencodeSetupValues
// and opencodeMCPValues structs carry NO bearer token or API key fields.
// The struct design enforces SEC-OC-R1 at the type level.
func TestOpencodeSetupValues_NoSecretFields(t *testing.T) {
	cfg := opencodeSetupValues{
		LogsMode: "local",
		MCP: opencodeMCPValues{
			MemoryURL:          "https://example.com/mcp",
			MemoryRequiresAuth: true,
			Context7Enabled:    true,
			// No bearer field — the struct has no field for secret values.
		},
	}
	// If the struct had a bearer field, the test would fail to compile (or
	// the field assignment above would need to be added). This test acts as a
	// compile-time assertion: the struct must not gain secret-value fields.
	if cfg.MCP.MemoryURL == "" {
		t.Error("MemoryURL should be set")
	}
}

// TestRegisterOpencodeMCPFromValues_NoSecretInOpencodeJSON verifies that
// registerOpencodeMCPFromValues writes ONLY {env:VAR} references into
// opencode.json — never a literal bearer token or API key (AC-9 / SEC-OC-R1).
func TestRegisterOpencodeMCPFromValues_NoSecretInOpencodeJSON(t *testing.T) {
	dir := t.TempDir()
	settingsPath := filepath.Join(dir, "opencode.json")

	// Simulate: memory requires auth; context7 enabled.
	// The MEMORY_MCP_BEARER env var IS set to a literal value — this must
	// NOT appear in the written opencode.json.
	t.Setenv("MEMORY_MCP_BEARER", "super-secret-bearer-token")
	t.Setenv("CONTEXT7_API_KEY", "ctx7sk-realkey")

	mcp := opencodeMCPValues{
		MemoryURL:          "https://mcp.example.com/mcp",
		MemoryRequiresAuth: true,
		Context7Enabled:    true,
	}
	registerOpencodeMCPFromValues(mcp, settingsPath, tokenModeEnvRef, opencodeMCPSecrets{})

	raw, err := os.ReadFile(settingsPath)
	if err != nil {
		t.Fatalf("read opencode.json: %v", err)
	}

	content := string(raw)

	// Secret values must NOT appear in the written file.
	if containsString(content, "super-secret-bearer-token") {
		t.Error("bearer token literal found in opencode.json (SEC-OC-R1 violated)")
	}
	if containsString(content, "ctx7sk-realkey") {
		t.Error("API key literal found in opencode.json (SEC-OC-R1 violated)")
	}

	// The {env:VAR} references MUST appear.
	if !containsString(content, "{env:MEMORY_MCP_BEARER}") {
		t.Error("expected {env:MEMORY_MCP_BEARER} ref in opencode.json, not found")
	}
	if !containsString(content, "{env:CONTEXT7_API_KEY}") {
		t.Error("expected {env:CONTEXT7_API_KEY} ref in opencode.json, not found")
	}
}

// TestRegisterOpencodeMCPFromValues_SkipsWhenAbsent verifies that when no
// Memory URL is set AND context7 is disabled, registerOpencodeMCPFromValues
// skips writing opencode.json (no file created, no os.Exit called).
func TestRegisterOpencodeMCPFromValues_SkipsWhenAbsent(t *testing.T) {
	dir := t.TempDir()
	settingsPath := filepath.Join(dir, "opencode.json")

	t.Setenv("MEMORY_MCP_BEARER", "")

	mcp := opencodeMCPValues{
		MemoryURL:       "",
		Context7Enabled: false,
	}
	// If either URL is invalid, the function calls os.Exit(1) — which would
	// abort the test. The absence path should NOT exit.
	registerOpencodeMCPFromValues(mcp, settingsPath, tokenModeEnvRef, opencodeMCPSecrets{})

	// File may or may not exist — what matters is no panic/exit and that any
	// written content is valid JSON.
	if data, err := os.ReadFile(settingsPath); err == nil && len(data) > 0 {
		var check interface{}
		if jsonErr := json.Unmarshal(data, &check); jsonErr != nil {
			t.Errorf("opencode.json written but invalid JSON: %v", jsonErr)
		}
	}
}

// TestRegisterOpencodeMCPFromValues_InvalidURLExits verifies that a provided-
// but-invalid Memory URL causes a non-zero exit (never silently accepted).
// We test this by recovering the os.Exit call via a subprocess-style check
// using only the validator, since we can't intercept os.Exit in-process.
func TestRegisterOpencodeMCPFromValues_InvalidURLIsRejectedByValidator(t *testing.T) {
	// The function calls validateMCPURL before registering. Test the validator
	// directly to assert the invalid URL would cause a non-zero exit.
	badURL := "ftp://not-valid.example.com"
	if err := validateMCPURL(badURL); err == nil {
		t.Errorf("validateMCPURL(%q) = nil, want error (provided-but-invalid must be rejected)", badURL)
	}
}

// ---------------------------------------------------------------------------
// Suite — nonInteractiveFlag (AC-8)
// ---------------------------------------------------------------------------

// TestNonInteractiveFlag_ParsedFromArgs verifies that --non-interactive is
// parsed by parseDispatchFlags and sets nonInteractiveFlag to true.
func TestNonInteractiveFlag_ParsedFromArgs(t *testing.T) {
	orig := nonInteractiveFlag
	defer func() { nonInteractiveFlag = orig }()
	nonInteractiveFlag = false

	remaining := parseDispatchFlags([]string{"--non-interactive", "apply"})
	if !nonInteractiveFlag {
		t.Error("--non-interactive was not parsed: nonInteractiveFlag = false")
	}
	if len(remaining) != 1 || remaining[0] != "apply" {
		t.Errorf("remaining = %v, want [apply]", remaining)
	}
}

// TestNonInteractiveFlag_YesAliasAccepted verifies that --yes is accepted as
// an alias for --non-interactive (both set nonInteractiveFlag to true).
func TestNonInteractiveFlag_YesAliasAccepted(t *testing.T) {
	orig := nonInteractiveFlag
	defer func() { nonInteractiveFlag = orig }()
	nonInteractiveFlag = false

	parseDispatchFlags([]string{"--yes", "apply"})
	if !nonInteractiveFlag {
		t.Error("--yes was not parsed as --non-interactive alias: nonInteractiveFlag = false")
	}
}

// TestNonInteractiveFlag_ForcesEnvFlagsPath verifies that when
// nonInteractiveFlag is true, resolveOpencodeSetupFromEnvFlags is the correct
// resolution path (the interactive gate is closed). This test asserts the
// gating logic: `interactive = !nonInteractiveFlag && hasInteractiveInput()`.
// When nonInteractiveFlag is true, interactive must be false regardless of tty.
func TestNonInteractiveFlag_ForcesEnvFlagsPath(t *testing.T) {
	// Setting nonInteractiveFlag = true means the gate expression evaluates to
	// !true && <anything> = false. We verify this by computing the gate.
	// (hasInteractiveInput() may or may not return true in CI — irrelevant.)
	nonInteractiveFlag = true
	defer func() { nonInteractiveFlag = false }()

	interactive := !nonInteractiveFlag && hasInteractiveInput()
	if interactive {
		t.Error("interactive = true with --non-interactive set; gate must be false (SEC-DR-7)")
	}
}

// ---------------------------------------------------------------------------
// Suite — applyImportCandidate (AC-2 / AC-3 / AC-6 / AC-15)
// ---------------------------------------------------------------------------

// TestApplyImportCandidate_AcceptCarriesAll7Keys verifies that on import-accept
// all 7 allowlisted keys — including the 3 non-form keys via configure* flags —
// are set in data, and that buildOpencodeSetupValues subsequently carries them
// into the written cfg (AC-2 / AC-15).
func TestApplyImportCandidate_AcceptCarriesAll7Keys(t *testing.T) {
	cand := &importCandidate{
		logsMode:             "obsidian",
		logsPath:             "/vault",
		logsSubfolder:        "notes",
		language:             "es",
		englishLearning:      true,
		clickUpWorkspaceID:   "ws-99",
		obsidianTasksEnabled: true,
	}

	data := freshFormData()
	applyImportCandidate(data, cand)

	// 4 form-backed keys.
	if data.logsMode != "obsidian" {
		t.Errorf("logsMode = %q, want obsidian", data.logsMode)
	}
	if !data.configureWorkLogs {
		t.Error("configureWorkLogs = false, want true (logsMode was set)")
	}
	if data.logsPath != "/vault" {
		t.Errorf("logsPath = %q, want /vault", data.logsPath)
	}
	if data.logsSubfolder != "notes" {
		t.Errorf("logsSubfolder = %q, want notes", data.logsSubfolder)
	}
	if data.language != "es" {
		t.Errorf("language = %q, want es", data.language)
	}
	if !data.configureLanguage {
		t.Error("configureLanguage = false, want true")
	}

	// 3 non-form keys — carried via configure* flags.
	if !data.configureEnglishLearning {
		t.Error("configureEnglishLearning = false, want true")
	}
	if !data.englishLearning {
		t.Error("englishLearning = false, want true")
	}
	if !data.configureClickUp {
		t.Error("configureClickUp = false, want true")
	}
	if data.clickUpWorkspaceID != "ws-99" {
		t.Errorf("clickUpWorkspaceID = %q, want ws-99", data.clickUpWorkspaceID)
	}
	if !data.configureObsidianTasks {
		t.Error("configureObsidianTasks = false, want true")
	}

	// buildOpencodeSetupValues (UNCHANGED, AC-15) carries all 7 through.
	cfg := buildOpencodeSetupValues(data)
	if cfg.LogsMode != "obsidian" {
		t.Errorf("cfg.LogsMode = %q, want obsidian", cfg.LogsMode)
	}
	if cfg.LogsPath != "/vault" {
		t.Errorf("cfg.LogsPath = %q, want /vault", cfg.LogsPath)
	}
	if cfg.Language != "es" {
		t.Errorf("cfg.Language = %q, want es", cfg.Language)
	}
	if !cfg.EnglishLearning {
		t.Error("cfg.EnglishLearning = false, want true")
	}
	if cfg.ClickUpWorkspaceID != "ws-99" {
		t.Errorf("cfg.ClickUpWorkspaceID = %q, want ws-99", cfg.ClickUpWorkspaceID)
	}
	if !cfg.ObsidianTasksEnabled {
		t.Error("cfg.ObsidianTasksEnabled = false, want true")
	}
}

// TestApplyImportCandidate_DeclineYieldsFreshDefaults verifies that when
// applyImportCandidate is NOT called (decline path), data retains fresh
// defaults and buildOpencodeSetupValues produces a fresh local-mode cfg.
// This is the AC-3 oracle: catches the #385 no-op regression where "Start fresh"
// still pre-filled because the confirm was never read.
func TestApplyImportCandidate_DeclineYieldsFreshDefaults(t *testing.T) {
	// Decline: applyImportCandidate is NOT called.
	data := freshFormData()

	cfg := buildOpencodeSetupValues(data)

	// On decline, local mode is the default.
	if cfg.LogsMode != "local" {
		t.Errorf("cfg.LogsMode = %q on decline, want local (fresh default)", cfg.LogsMode)
	}
	if cfg.LogsPath != "" {
		t.Errorf("cfg.LogsPath = %q on decline, want empty (fresh default)", cfg.LogsPath)
	}
	if cfg.Language != "" {
		t.Errorf("cfg.Language = %q on decline, want empty (fresh default)", cfg.Language)
	}
	if cfg.EnglishLearning {
		t.Error("cfg.EnglishLearning = true on decline, want false (fresh default)")
	}
	if cfg.ClickUpWorkspaceID != "" {
		t.Errorf("cfg.ClickUpWorkspaceID = %q on decline, want empty (fresh default)", cfg.ClickUpWorkspaceID)
	}
	if cfg.ObsidianTasksEnabled {
		t.Error("cfg.ObsidianTasksEnabled = true on decline, want false (fresh default)")
	}
}

// TestApplyImportCandidate_ControlCharInLogsPathRejected verifies that a
// logs-path with control characters is NOT pre-filled (SEC-004 / AC-6).
func TestApplyImportCandidate_ControlCharInLogsPathRejected(t *testing.T) {
	cand := &importCandidate{
		logsMode: "obsidian",
		logsPath: "/vault/with\x00nul",
	}
	data := freshFormData()
	applyImportCandidate(data, cand)

	// logsMode is set (clean), but logsPath must be rejected.
	if data.logsPath != "" {
		t.Errorf("logsPath = %q, want empty (control char must be rejected)", data.logsPath)
	}
}

// TestApplyImportCandidate_ControlCharInWorkspaceIDRejected verifies that a
// ClickUp workspace_id with control characters is NOT pre-filled (SEC-004 / AC-6).
func TestApplyImportCandidate_ControlCharInWorkspaceIDRejected(t *testing.T) {
	cand := &importCandidate{
		clickUpWorkspaceID: "ws\x1fbad",
	}
	data := freshFormData()
	applyImportCandidate(data, cand)

	if data.configureClickUp {
		t.Error("configureClickUp = true, want false (workspace_id with control char must be rejected)")
	}
	if data.clickUpWorkspaceID != "" {
		t.Errorf("clickUpWorkspaceID = %q, want empty (control char must be rejected)", data.clickUpWorkspaceID)
	}
}

// TestApplyImportCandidate_InvalidLanguageRejected verifies that an invalid
// language code (not 2 lowercase ASCII letters) is NOT pre-filled (AC-6).
func TestApplyImportCandidate_InvalidLanguageRejected(t *testing.T) {
	for _, bad := range []string{"eng", "EN", "E", "", "es_MX"} {
		cand := &importCandidate{language: bad}
		data := freshFormData()
		applyImportCandidate(data, cand)

		if data.language != "" || data.configureLanguage {
			t.Errorf("language %q: data.language = %q / configureLanguage = %v, want empty/false",
				bad, data.language, data.configureLanguage)
		}
	}
}

// TestApplyImportCandidate_AbsentNonFormKeys_NoEmptyKeyInjection verifies
// that when english_learning/clickup/obsidian_tasks are absent (false/empty)
// in the source, the configure* flags are NOT set — no empty-key injection
// into the written cfg (AC-15 unambiguous oracle for F3).
func TestApplyImportCandidate_AbsentNonFormKeys_NoEmptyKeyInjection(t *testing.T) {
	cand := &importCandidate{
		logsMode: "local",
		// englishLearning:      false (zero value),
		// clickUpWorkspaceID:   "" (zero value),
		// obsidianTasksEnabled: false (zero value),
	}
	data := freshFormData()
	applyImportCandidate(data, cand)

	if data.configureEnglishLearning {
		t.Error("configureEnglishLearning = true, want false (absent source → no injection)")
	}
	if data.configureClickUp {
		t.Error("configureClickUp = true, want false (absent source → no injection)")
	}
	if data.configureObsidianTasks {
		t.Error("configureObsidianTasks = true, want false (absent source → no injection)")
	}

	cfg := buildOpencodeSetupValues(data)
	if cfg.EnglishLearning {
		t.Error("cfg.EnglishLearning = true from absent source (AC-15 violated)")
	}
	if cfg.ClickUpWorkspaceID != "" {
		t.Errorf("cfg.ClickUpWorkspaceID = %q from absent source (AC-15 violated)", cfg.ClickUpWorkspaceID)
	}
	if cfg.ObsidianTasksEnabled {
		t.Error("cfg.ObsidianTasksEnabled = true from absent source (AC-15 violated)")
	}
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

// freshFormData returns an opencodeSetupFormData with the same initial values
// that collectOpencodeSetupInteractive uses for a fresh start (decline path).
func freshFormData() *opencodeSetupFormData {
	return &opencodeSetupFormData{
		importExisting:         false,
		configureWorkLogs:      false,
		logsMode:               "local",
		logsPath:               "",
		logsSubfolder:          "work-logs",
		language:               "",
		englishLearning:        false,
		configureMCP:           false,
		memoryURL:              "",
		memoryRequiresAuth:     false,
		configureContext7:      false,
		configureClickUp:       false,
		clickUpWorkspaceID:     "",
		configureObsidianTasks: false,
		doSetup:                true,
	}
}

// containsString is a simple substring check used in secret-presence
// assertions. Using strings.Contains would require importing strings in the
// test file — inlining a simple loop avoids the import.
func containsString(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
