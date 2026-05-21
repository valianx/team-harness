package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

// testEnv sets up a temporary HOME-equivalent directory and patches the
// package-level path variables so all installer functions operate in isolation.
// Returns a cleanup function that restores the original state.
func testEnv(t *testing.T) (tmpDir string, cleanup func()) {
	t.Helper()
	tmp := t.TempDir()

	origClaudeDir := claudeDir
	origClaudeJSON := claudeJSON
	origForce := forceFlag

	claudeDir = filepath.Join(tmp, ".claude")
	claudeJSON = filepath.Join(tmp, ".claude.json")
	forceFlag = false
	manifest.Files = map[string]manifestEntry{}
	manifest.InstalledVersion = ""

	return tmp, func() {
		claudeDir = origClaudeDir
		claudeJSON = origClaudeJSON
		forceFlag = origForce
		manifest.Files = map[string]manifestEntry{}
		manifest.InstalledVersion = ""
	}
}

func writeClaudeJSON(t *testing.T, data map[string]interface{}) {
	t.Helper()
	raw, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		t.Fatalf("writeClaudeJSON marshal: %v", err)
	}
	raw = append(raw, '\n')
	if err := os.WriteFile(claudeJSON, raw, 0o644); err != nil {
		t.Fatalf("writeClaudeJSON write: %v", err)
	}
}

func readClaudeJSON(t *testing.T) map[string]interface{} {
	t.Helper()
	data, err := os.ReadFile(claudeJSON)
	if err != nil {
		t.Fatalf("readClaudeJSON: %v", err)
	}
	var out map[string]interface{}
	if err := json.Unmarshal(data, &out); err != nil {
		t.Fatalf("readClaudeJSON unmarshal: %v", err)
	}
	return out
}

// Fixture builders.
func memoryHTTP(url string) map[string]interface{} {
	if url == "" {
		url = "http://localhost:8080/mcp"
	}
	return map[string]interface{}{"type": "http", "url": url}
}

func memoryStdio(path string) map[string]interface{} {
	if path == "" {
		path = "/fake/.claude/knowledge-graph"
	}
	return map[string]interface{}{
		"type":    "stdio",
		"command": "uv",
		"args":    []interface{}{"run", "--directory", path, "python", "-m", "server"},
		"env":     map[string]interface{}{},
	}
}

func context7Entry(key string) map[string]interface{} {
	if key == "" {
		key = "ctx7sk-real-key-12345"
	}
	return map[string]interface{}{
		"type": "http",
		"url":  "https://mcp.context7.com/mcp",
		"headers": map[string]interface{}{
			"CONTEXT7_API_KEY": key,
		},
	}
}

func memChoice(url string, preserved bool) MemoryMCPChoice {
	if url == "" {
		url = "http://localhost:8080/mcp"
	}
	return MemoryMCPChoice{URL: url, Preserved: preserved}
}

func memChoiceWithBearer(url, bearer string, preserved bool) MemoryMCPChoice {
	if url == "" {
		url = "http://localhost:8080/mcp"
	}
	return MemoryMCPChoice{URL: url, BearerToken: bearer, Preserved: preserved}
}

// ---------------------------------------------------------------------------
// Tests: readExistingMCPServers
// ---------------------------------------------------------------------------

func TestReadExistingMCPServers_AbsentFile(t *testing.T) {
	_, cleanup := testEnv(t)
	defer cleanup()

	result := readExistingMCPServers()
	if len(result) != 0 {
		t.Errorf("expected empty map, got %v", result)
	}
}

func TestReadExistingMCPServers_ReturnsMCPServersBlock(t *testing.T) {
	_, cleanup := testEnv(t)
	defer cleanup()

	writeClaudeJSON(t, map[string]interface{}{
		"mcpServers": map[string]interface{}{
			"memory": memoryHTTP(""),
		},
	})
	result := readExistingMCPServers()
	if len(result) == 0 {
		t.Fatal("expected non-empty map")
	}
	mem, ok := result["memory"].(map[string]interface{})
	if !ok || mem["type"] != "http" {
		t.Errorf("unexpected memory entry: %v", result["memory"])
	}
}

func TestReadExistingMCPServers_CorruptJSON(t *testing.T) {
	_, cleanup := testEnv(t)
	defer cleanup()

	if err := os.WriteFile(claudeJSON, []byte("{not: valid json"), 0o644); err != nil {
		t.Fatal(err)
	}
	result := readExistingMCPServers()
	if len(result) != 0 {
		t.Errorf("expected empty map for corrupt JSON, got %v", result)
	}
}

func TestReadExistingMCPServers_NoMCPServersKey(t *testing.T) {
	_, cleanup := testEnv(t)
	defer cleanup()

	writeClaudeJSON(t, map[string]interface{}{"other": "stuff"})
	result := readExistingMCPServers()
	if len(result) != 0 {
		t.Errorf("expected empty map when no mcpServers key, got %v", result)
	}
}

// ---------------------------------------------------------------------------
// Tests: looksLikeValidMemoryEntry
// ---------------------------------------------------------------------------

func TestLooksLikeValidMemoryEntry_ValidHTTP(t *testing.T) {
	if !looksLikeValidMemoryEntry(memoryHTTP("")) {
		t.Error("expected true for valid http entry")
	}
}

func TestLooksLikeValidMemoryEntry_ValidHTTPS(t *testing.T) {
	if !looksLikeValidMemoryEntry(memoryHTTP("https://example.com/mcp")) {
		t.Error("expected true for https entry")
	}
}

func TestLooksLikeValidMemoryEntry_RejectsStdio(t *testing.T) {
	// Issue #11: v2 only preserves http entries. Stdio entries (v1 shape) are
	// rejected here so they fall through to env-var / prompt and get
	// migrated to http. Preserving them would write {type:"http",url:""}.
	if looksLikeValidMemoryEntry(memoryStdio("")) {
		t.Error("expected false for stdio entry (v2 preserves only http; stdio must migrate)")
	}
}

func TestIsLegacyStdioMemoryEntry_TrueForValidStdio(t *testing.T) {
	if !isLegacyStdioMemoryEntry(memoryStdio("")) {
		t.Error("expected true for valid stdio entry")
	}
}

func TestIsLegacyStdioMemoryEntry_FalseForHTTP(t *testing.T) {
	if isLegacyStdioMemoryEntry(memoryHTTP("")) {
		t.Error("expected false for http entry")
	}
}

func TestIsLegacyStdioMemoryEntry_FalseForStdioWithoutCommand(t *testing.T) {
	if isLegacyStdioMemoryEntry(map[string]interface{}{"type": "stdio", "command": ""}) {
		t.Error("expected false for stdio with empty command")
	}
}

func TestLooksLikeValidMemoryEntry_EmptyDict(t *testing.T) {
	if looksLikeValidMemoryEntry(map[string]interface{}{}) {
		t.Error("expected false for empty dict")
	}
}

func TestLooksLikeValidMemoryEntry_HTTPWithoutURL(t *testing.T) {
	if looksLikeValidMemoryEntry(map[string]interface{}{"type": "http"}) {
		t.Error("expected false for http without url")
	}
}

func TestLooksLikeValidMemoryEntry_StdioWithoutCommand(t *testing.T) {
	if looksLikeValidMemoryEntry(map[string]interface{}{"type": "stdio", "command": ""}) {
		t.Error("expected false for stdio with empty command")
	}
}

func TestLooksLikeValidMemoryEntry_UnknownType(t *testing.T) {
	if looksLikeValidMemoryEntry(map[string]interface{}{"type": "grpc", "url": "http://x"}) {
		t.Error("expected false for unknown type")
	}
}

// ---------------------------------------------------------------------------
// Tests: isValidContext7Key
// ---------------------------------------------------------------------------

func TestIsValidContext7Key_ValidRealKey(t *testing.T) {
	if !isValidContext7Key("ctx7sk-real-key-12345") {
		t.Error("expected true for valid real key")
	}
}

func TestIsValidContext7Key_EmptyString(t *testing.T) {
	if isValidContext7Key("") {
		t.Error("expected false for empty string")
	}
}

func TestIsValidContext7Key_FakeTestKey(t *testing.T) {
	if isValidContext7Key("ctx7sk-fake-test-key") {
		t.Error("expected false for fake test placeholder key")
	}
}

func TestIsValidContext7Key_TooShort(t *testing.T) {
	// "ctx7sk-ab" is 9 chars — below the 12-char minimum.
	if isValidContext7Key("ctx7sk-ab") {
		t.Error("expected false for key shorter than 12 chars")
	}
}

func TestIsValidContext7Key_WrongPrefix(t *testing.T) {
	if isValidContext7Key("sk-real-key-12345") {
		t.Error("expected false for key with wrong prefix")
	}
}

// ---------------------------------------------------------------------------
// Tests: promptMemoryMCPURL — preservation path
// ---------------------------------------------------------------------------

func TestPromptMemoryMCPURL_PreservesExistingHTTPEntry(t *testing.T) {
	_, cleanup := testEnv(t)
	defer cleanup()

	url := "https://my-mcp.example.com/mcp"
	writeClaudeJSON(t, map[string]interface{}{
		"mcpServers": map[string]interface{}{
			"memory": memoryHTTP(url),
		},
	})
	forceFlag = false

	choice := promptMemoryMCPURL()

	if !choice.Preserved {
		t.Error("expected Preserved=true for existing valid http entry")
	}
	if choice.URL != url {
		t.Errorf("expected URL=%s, got %s", url, choice.URL)
	}
}

func TestPromptMemoryMCPURL_MigratesLegacyStdioEntry(t *testing.T) {
	// Regression for Issue #11: v2 installer running over a v1 install left
	// mcpServers.memory as {type:"http", url:""} because stdio was treated
	// as "preserve" and urlFromEntry returned "" for stdio. Correct flow:
	// stdio detected → migrate (don't preserve) → env var wins.
	_, cleanup := testEnv(t)
	defer cleanup()

	writeClaudeJSON(t, map[string]interface{}{
		"mcpServers": map[string]interface{}{
			"memory": memoryStdio(""),
		},
	})
	t.Setenv("MEMORY_MCP_URL", "https://migrated.example.com/mcp")
	forceFlag = false

	choice := promptMemoryMCPURL()

	if choice.Preserved {
		t.Error("expected Preserved=false for legacy stdio entry (must migrate, not preserve)")
	}
	if choice.URL != "https://migrated.example.com/mcp" {
		t.Errorf("expected env URL to win over stdio existing, got %s", choice.URL)
	}
}

func TestPromptMemoryMCPURL_StdioFallsThroughToDefaultNonInteractive(t *testing.T) {
	// Same stdio-migration story but with no env var set and non-interactive
	// (no TTY): falls through to default URL with notice, NOT preserve.
	_, cleanup := testEnv(t)
	defer cleanup()

	writeClaudeJSON(t, map[string]interface{}{
		"mcpServers": map[string]interface{}{
			"memory": memoryStdio(""),
		},
	})
	os.Unsetenv("MEMORY_MCP_URL")
	forceFlag = false

	choice := promptMemoryMCPURL()

	if choice.Preserved {
		t.Error("expected Preserved=false for legacy stdio entry")
	}
	if choice.URL != defaultMemoryMCPURL {
		t.Errorf("expected default URL fallback, got %s", choice.URL)
	}
}

// TestEndToEnd_V1StdioToV2HTTP is the integration test the issue called out
// as missing: plant a v1 stdio entry on disk, run the v2 prompt + register
// flow, assert the final entry written to ~/.claude.json has a non-empty
// http URL. This is the test that would have caught Issue #11.
func TestEndToEnd_V1StdioToV2HTTP(t *testing.T) {
	_, cleanup := testEnv(t)
	defer cleanup()

	// 1. Plant a v1 install's mcpServers state on disk.
	writeClaudeJSON(t, map[string]interface{}{
		"mcpServers": map[string]interface{}{
			"memory":   memoryStdio(""),
			"context7": context7Entry(""),
		},
	})

	// 2. Run the v2 flow in non-interactive mode with MEMORY_MCP_URL set
	//    (matches what `MEMORY_MCP_URL=... ./bin/install.sh` does in CI).
	t.Setenv("MEMORY_MCP_URL", "https://prod.example.com/mcp")
	forceFlag = false
	choice := promptMemoryMCPURL()
	registerMCPServers("ctx7sk-real-key-12345", choice)

	// 3. Assert the file ON DISK now has a working http memory entry.
	final := readClaudeJSON(t)
	servers, ok := final["mcpServers"].(map[string]interface{})
	if !ok {
		t.Fatal("mcpServers section missing from written file")
	}
	memory, ok := servers["memory"].(map[string]interface{})
	if !ok {
		t.Fatal("memory entry missing from written file")
	}
	if memory["type"] != "http" {
		t.Errorf("expected type=http after migration, got %v", memory["type"])
	}
	url, _ := memory["url"].(string)
	if url == "" {
		t.Fatal("regression #11: memory entry has empty URL after v1 stdio → v2 http migration")
	}
	if url != "https://prod.example.com/mcp" {
		t.Errorf("expected url from MEMORY_MCP_URL env, got %s", url)
	}
	// context7 must be preserved unchanged.
	c7, _ := servers["context7"].(map[string]interface{})
	if c7 == nil {
		t.Fatal("context7 entry lost during migration")
	}
}

func TestPromptMemoryMCPURL_ForceFlagBypassesPreservation(t *testing.T) {
	_, cleanup := testEnv(t)
	defer cleanup()

	writeClaudeJSON(t, map[string]interface{}{
		"mcpServers": map[string]interface{}{
			"memory": memoryHTTP("http://old-host/mcp"),
		},
	})
	forceFlag = true
	t.Setenv("MEMORY_MCP_URL", "https://new-host.example.com/mcp")

	choice := promptMemoryMCPURL()

	if choice.Preserved {
		t.Error("expected Preserved=false with --force")
	}
	if choice.URL != "https://new-host.example.com/mcp" {
		t.Errorf("expected env URL, got %s", choice.URL)
	}
}

func TestPromptMemoryMCPURL_EnvVarHighestPriority(t *testing.T) {
	_, cleanup := testEnv(t)
	defer cleanup()

	// No existing entry → env var is the source.
	forceFlag = false
	envURL := "https://railway.app/mcp"
	t.Setenv("MEMORY_MCP_URL", envURL)

	choice := promptMemoryMCPURL()

	if choice.Preserved {
		t.Error("expected Preserved=false when using env var")
	}
	if choice.URL != envURL {
		t.Errorf("expected URL=%s, got %s", envURL, choice.URL)
	}
}

func TestPromptMemoryMCPURL_NonInteractiveDefault(t *testing.T) {
	// Stdin is not a TTY in test execution, so non-interactive path runs.
	_, cleanup := testEnv(t)
	defer cleanup()

	forceFlag = false
	t.Setenv("MEMORY_MCP_URL", "")

	choice := promptMemoryMCPURL()

	if choice.Preserved {
		t.Error("expected Preserved=false for fresh install non-interactive")
	}
	if choice.URL != defaultMemoryMCPURL {
		t.Errorf("expected default URL=%s, got %s", defaultMemoryMCPURL, choice.URL)
	}
}

func TestPromptMemoryMCPURL_InvalidURLRejected(t *testing.T) {
	// validateMCPURL is the guard. Test the validator directly.
	cases := []struct {
		name string
		url  string
		want bool // true = valid, false = invalid
	}{
		{"empty", "", false},
		{"bare word", "memory", false},
		{"ftp scheme", "ftp://example.com/mcp", false},
		{"http valid", "http://localhost:7654/mcp", true},
		{"https valid", "https://my-service.com/mcp", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := validateMCPURL(tc.url)
			if tc.want && err != nil {
				t.Errorf("expected valid URL, got error: %v", err)
			}
			if !tc.want && err == nil {
				t.Error("expected invalid URL to return error")
			}
		})
	}
}

func TestPromptMemoryMCPURL_TrimsWhitespace(t *testing.T) {
	_, cleanup := testEnv(t)
	defer cleanup()

	forceFlag = false
	t.Setenv("MEMORY_MCP_URL", "  https://trimmed.example.com/mcp  ")

	choice := promptMemoryMCPURL()

	if choice.URL != "https://trimmed.example.com/mcp" {
		t.Errorf("expected trimmed URL, got %q", choice.URL)
	}
}

// ---------------------------------------------------------------------------
// Tests: registerMCPServers — no-write when nothing changed
// ---------------------------------------------------------------------------

func TestRegisterMCPServers_NoWriteWhenNothingChanged(t *testing.T) {
	_, cleanup := testEnv(t)
	defer cleanup()

	url := "http://localhost:8080/mcp"
	key := "ctx7sk-real-key-99999"
	initialData := map[string]interface{}{
		"mcpServers": map[string]interface{}{
			"memory":   memoryHTTP(url),
			"context7": context7Entry(key),
		},
	}
	writeClaudeJSON(t, initialData)

	backupsBefore, _ := filepath.Glob(claudeJSON + ".bak-*")

	mc := memChoice(url, true)
	backup := registerMCPServers(key, mc)

	backupsAfter, _ := filepath.Glob(claudeJSON + ".bak-*")
	if backup != "" {
		t.Errorf("expected no backup when nothing changed, got %s", backup)
	}
	if len(backupsAfter) != len(backupsBefore) {
		t.Errorf("unexpected backup file created: before=%d after=%d", len(backupsBefore), len(backupsAfter))
	}
}

func TestRegisterMCPServers_WritesWhenMemoryDiffers(t *testing.T) {
	_, cleanup := testEnv(t)
	defer cleanup()

	key := "ctx7sk-real-key-99999"
	oldURL := "http://old-host:8080/mcp"
	newURL := "http://new-host:9090/mcp"
	writeClaudeJSON(t, map[string]interface{}{
		"mcpServers": map[string]interface{}{
			"memory":   memoryHTTP(oldURL),
			"context7": context7Entry(key),
		},
	})

	mc := memChoice(newURL, false)
	backup := registerMCPServers(key, mc)

	if backup == "" {
		t.Error("expected a backup when memory entry changes")
	}
	result := readClaudeJSON(t)
	mcpServers, _ := result["mcpServers"].(map[string]interface{})
	mem, _ := mcpServers["memory"].(map[string]interface{})
	if mem["url"] != newURL {
		t.Errorf("expected url=%s, got %v", newURL, mem["url"])
	}
}

func TestRegisterMCPServers_WritesWhenContext7KeyChanges(t *testing.T) {
	_, cleanup := testEnv(t)
	defer cleanup()

	url := "http://localhost:8080/mcp"
	oldKey := "ctx7sk-old-key-00000"
	newKey := "ctx7sk-new-key-99999"
	writeClaudeJSON(t, map[string]interface{}{
		"mcpServers": map[string]interface{}{
			"memory":   memoryHTTP(url),
			"context7": context7Entry(oldKey),
		},
	})

	mc := memChoice(url, true)
	backup := registerMCPServers(newKey, mc)

	if backup == "" {
		t.Error("expected a backup when context7 key changes")
	}
	result := readClaudeJSON(t)
	mcpServers, _ := result["mcpServers"].(map[string]interface{})
	c7, _ := mcpServers["context7"].(map[string]interface{})
	headers, _ := c7["headers"].(map[string]interface{})
	storedKey, _ := headers["CONTEXT7_API_KEY"].(string)
	if storedKey != newKey {
		t.Errorf("expected context7 key=%s, got %s", newKey, storedKey)
	}
}

// TestRegisterMCPServers_PreservesMemoryHeaders is a regression test for the
// installer dropping `headers.Authorization` on existing `memory` entries.
//
// Bug: `buildMemoryEntry` returns only {type, url}; `rawEntryMatches` used
// byte-equality, so any entry with extra fields (e.g. Bearer headers configured
// for a remote auth-protected MCP like context-harness-mcp on Railway) was
// flagged "changed" and silently overwritten — destroying the bearer.
//
// Fix: rawEntryMatches uses subset semantics ("desired ⊆ existing"); when a
// real change is needed, mergeMCPEntry overlays desired fields on the existing
// entry, preserving operator-set fields like headers.
func TestRegisterMCPServers_PreservesMemoryHeaders(t *testing.T) {
	_, cleanup := testEnv(t)
	defer cleanup()

	url := "https://team-harness.up.railway.app/mcp/"
	bearer := "Bearer eyJhbGciOiJIUzI1NiJ9.test.signature"
	writeClaudeJSON(t, map[string]interface{}{
		"mcpServers": map[string]interface{}{
			"memory": map[string]interface{}{
				"type": "http",
				"url":  url,
				"headers": map[string]interface{}{
					"Authorization": bearer,
				},
			},
		},
	})

	// Run installer with the SAME url the operator chose AND empty context7 key
	// (skips context7 work) — no change expected, idempotent install.
	backup := registerMCPServers("", memChoice(url, true))

	// No-op path: nothing to backup since nothing changed.
	if backup != "" {
		t.Errorf("expected no backup (no-op install with matching url+headers), got %s", backup)
	}

	// Verify headers survived.
	result := readClaudeJSON(t)
	mem := result["mcpServers"].(map[string]interface{})["memory"].(map[string]interface{})
	headers, ok := mem["headers"].(map[string]interface{})
	if !ok {
		t.Fatal("memory.headers missing after install — operator config destroyed")
	}
	if headers["Authorization"] != bearer {
		t.Errorf("Bearer changed: want %q, got %q", bearer, headers["Authorization"])
	}
}

// TestRegisterMCPServers_MergesHeadersOnURLChange covers the "operator
// changed the url, but had set headers" case: the new url replaces the old,
// but the existing headers survive.
func TestRegisterMCPServers_MergesHeadersOnURLChange(t *testing.T) {
	_, cleanup := testEnv(t)
	defer cleanup()

	bearer := "Bearer test-bearer"
	writeClaudeJSON(t, map[string]interface{}{
		"mcpServers": map[string]interface{}{
			"memory": map[string]interface{}{
				"type": "http",
				"url":  "https://old.example.com/mcp/",
				"headers": map[string]interface{}{
					"Authorization": bearer,
				},
			},
		},
	})

	newURL := "https://new.example.com/mcp/"
	backup := registerMCPServers("", memChoice(newURL, false))

	if backup == "" {
		t.Error("expected a backup since url changed")
	}

	result := readClaudeJSON(t)
	mem := result["mcpServers"].(map[string]interface{})["memory"].(map[string]interface{})

	if mem["url"] != newURL {
		t.Errorf("url not updated: want %q, got %q", newURL, mem["url"])
	}
	headers, ok := mem["headers"].(map[string]interface{})
	if !ok {
		t.Fatal("headers dropped during url-change merge")
	}
	if headers["Authorization"] != bearer {
		t.Errorf("Bearer mutated during url-change: want %q, got %q", bearer, headers["Authorization"])
	}
}

func TestRegisterMCPServers_CreatesFileOnFirstInstall(t *testing.T) {
	_, cleanup := testEnv(t)
	defer cleanup()

	if _, err := os.Stat(claudeJSON); !os.IsNotExist(err) {
		t.Fatal("expected claudeJSON to not exist at start of test")
	}
	key := "ctx7sk-first-install-key"
	mc := memChoice("http://localhost:8080/mcp", false)

	backup := registerMCPServers(key, mc)

	// backupClaudeJSON returns "" when the file didn't exist yet.
	if backup != "" {
		t.Errorf("expected no backup for first install (file didn't exist), got %s", backup)
	}
	result := readClaudeJSON(t)
	mcpServers, ok := result["mcpServers"].(map[string]interface{})
	if !ok {
		t.Fatal("expected mcpServers key in result")
	}
	mem, _ := mcpServers["memory"].(map[string]interface{})
	if mem["url"] != "http://localhost:8080/mcp" {
		t.Errorf("unexpected memory url: %v", mem["url"])
	}
	c7, _ := mcpServers["context7"].(map[string]interface{})
	headers, _ := c7["headers"].(map[string]interface{})
	storedKey, _ := headers["CONTEXT7_API_KEY"].(string)
	if storedKey != key {
		t.Errorf("expected context7 key=%s, got %s", key, storedKey)
	}
}

// ---------------------------------------------------------------------------
// Tests: getContext7APIKey — preservation path
// ---------------------------------------------------------------------------

func TestGetContext7APIKey_PreservesExistingRealKeyWhenNoEnv(t *testing.T) {
	_, cleanup := testEnv(t)
	defer cleanup()

	realKey := "ctx7sk-real-key-99999"
	writeClaudeJSON(t, map[string]interface{}{
		"mcpServers": map[string]interface{}{
			"context7": context7Entry(realKey),
		},
	})
	forceFlag = false
	t.Setenv("CONTEXT7_API_KEY", "")

	result := getContext7APIKey()
	if result != realKey {
		t.Errorf("expected %s, got %s", realKey, result)
	}
}

func TestGetContext7APIKey_PreservesExistingKeyWhenEnvMatches(t *testing.T) {
	_, cleanup := testEnv(t)
	defer cleanup()

	realKey := "ctx7sk-real-key-99999"
	writeClaudeJSON(t, map[string]interface{}{
		"mcpServers": map[string]interface{}{
			"context7": context7Entry(realKey),
		},
	})
	forceFlag = false
	t.Setenv("CONTEXT7_API_KEY", realKey)

	result := getContext7APIKey()
	if result != realKey {
		t.Errorf("expected %s, got %s", realKey, result)
	}
}

func TestGetContext7APIKey_RejectsFakePlaceholderAndUsesEnv(t *testing.T) {
	_, cleanup := testEnv(t)
	defer cleanup()

	writeClaudeJSON(t, map[string]interface{}{
		"mcpServers": map[string]interface{}{
			"context7": context7Entry("ctx7sk-fake-test-key"),
		},
	})
	forceFlag = false
	realEnvKey := "ctx7sk-real-env-key-abc"
	t.Setenv("CONTEXT7_API_KEY", realEnvKey)

	result := getContext7APIKey()
	if result != realEnvKey {
		t.Errorf("expected %s, got %s", realEnvKey, result)
	}
}

func TestGetContext7APIKey_FirstInstallUsesEnvKey(t *testing.T) {
	_, cleanup := testEnv(t)
	defer cleanup()

	// No existing ~/.claude.json.
	forceFlag = false
	envKey := "ctx7sk-brand-new-key-xyz"
	t.Setenv("CONTEXT7_API_KEY", envKey)

	result := getContext7APIKey()
	if result != envKey {
		t.Errorf("expected %s, got %s", envKey, result)
	}
}

// ---------------------------------------------------------------------------
// Tests: bearer-token support (one-step install — URL + Authorization in one run)
// ---------------------------------------------------------------------------

// TestBearerFromEntry_PresentReturnsRawToken verifies that the helper strips
// the "Bearer " prefix and returns the raw JWT.
func TestBearerFromEntry_PresentReturnsRawToken(t *testing.T) {
	entry := map[string]interface{}{
		"type": "http",
		"url":  "https://x.example.com/mcp",
		"headers": map[string]interface{}{
			"Authorization": "Bearer eyJhbGci.payload.signature",
		},
	}
	if got := bearerFromEntry(entry); got != "eyJhbGci.payload.signature" {
		t.Errorf("expected raw token without prefix, got %q", got)
	}
}

// TestBearerFromEntry_AbsentReturnsEmpty verifies the helper returns "" when
// no headers are set (the localhost / unauthenticated case).
func TestBearerFromEntry_AbsentReturnsEmpty(t *testing.T) {
	entry := map[string]interface{}{"type": "http", "url": "http://localhost:7654/mcp"}
	if got := bearerFromEntry(entry); got != "" {
		t.Errorf("expected empty bearer, got %q", got)
	}
}

// TestBearerFromEntry_NonBearerSchemeIgnored verifies that the helper only
// extracts Bearer tokens — other auth schemes (Basic, custom) return "" so
// the installer doesn't accidentally mangle them.
func TestBearerFromEntry_NonBearerSchemeIgnored(t *testing.T) {
	entry := map[string]interface{}{
		"type": "http", "url": "https://x.example.com/mcp",
		"headers": map[string]interface{}{
			"Authorization": "Basic dXNlcjpwYXNz",
		},
	}
	if got := bearerFromEntry(entry); got != "" {
		t.Errorf("expected empty for non-Bearer scheme, got %q", got)
	}
}

// TestBuildMemoryEntry_WithBearer verifies that a non-empty bearer is written
// into headers.Authorization with the "Bearer " prefix.
func TestBuildMemoryEntry_WithBearer(t *testing.T) {
	entry := buildMemoryEntry(MemoryMCPChoice{URL: "https://x.example.com/mcp", BearerToken: "my-jwt"})
	headers, ok := entry["headers"].(map[string]interface{})
	if !ok {
		t.Fatal("expected headers when bearer is set")
	}
	if headers["Authorization"] != "Bearer my-jwt" {
		t.Errorf("expected 'Bearer my-jwt', got %v", headers["Authorization"])
	}
}

// TestBuildMemoryEntry_WithoutBearer verifies that an empty bearer produces
// no headers key — the localhost / unauthenticated case stays minimal.
func TestBuildMemoryEntry_WithoutBearer(t *testing.T) {
	entry := buildMemoryEntry(MemoryMCPChoice{URL: "http://localhost:7654/mcp"})
	if _, has := entry["headers"]; has {
		t.Error("expected no headers key when bearer is empty")
	}
}

// TestPromptMemoryMCPURL_PreservesBearerOnKeepNonInteractive verifies that an
// existing entry's bearer is captured into the choice when preserved silently
// (non-TTY). This is the typical CI / scripted re-install case.
func TestPromptMemoryMCPURL_PreservesBearerOnKeepNonInteractive(t *testing.T) {
	_, cleanup := testEnv(t)
	defer cleanup()

	url := "https://prod.example.com/mcp"
	bearer := "Bearer eyJ.preserved.signature"
	writeClaudeJSON(t, map[string]interface{}{
		"mcpServers": map[string]interface{}{
			"memory": map[string]interface{}{
				"type": "http", "url": url,
				"headers": map[string]interface{}{"Authorization": bearer},
			},
		},
	})
	forceFlag = false

	choice := promptMemoryMCPURL()

	if !choice.Preserved {
		t.Fatal("expected Preserved=true when existing valid http entry exists (non-interactive)")
	}
	if choice.URL != url {
		t.Errorf("expected URL=%s, got %s", url, choice.URL)
	}
	if choice.BearerToken != "eyJ.preserved.signature" {
		t.Errorf("expected bearer captured into choice (without prefix), got %q", choice.BearerToken)
	}
}

// TestPromptMemoryMCPBearer_FromEnvVar verifies the MEMORY_MCP_BEARER env var
// is honored in non-interactive mode (CI / scripted installs).
func TestPromptMemoryMCPBearer_FromEnvVar(t *testing.T) {
	t.Setenv("MEMORY_MCP_BEARER", "  env-supplied-jwt  ")
	if got := promptMemoryMCPBearer(); got != "env-supplied-jwt" {
		t.Errorf("expected trimmed env value, got %q", got)
	}
}

// TestPromptMemoryMCPBearer_NoEnvNonInteractive verifies that absent env var,
// non-interactive mode returns "" so unauthenticated localhost installs still
// work in CI.
func TestPromptMemoryMCPBearer_NoEnvNonInteractive(t *testing.T) {
	t.Setenv("MEMORY_MCP_BEARER", "")
	if got := promptMemoryMCPBearer(); got != "" {
		t.Errorf("expected empty bearer without env in non-interactive, got %q", got)
	}
}

// TestRegisterMCPServers_FirstInstallWithBearer verifies a fresh install with
// URL + bearer writes both fields into ~/.claude.json on disk — the headline
// "configure everything in one installer run" use case the operator asked for.
func TestRegisterMCPServers_FirstInstallWithBearer(t *testing.T) {
	_, cleanup := testEnv(t)
	defer cleanup()

	url := "https://team-harness.up.railway.app/mcp"
	bearer := "eyJhbGci.payload.signature"
	mc := memChoiceWithBearer(url, bearer, false)

	registerMCPServers("ctx7sk-test-key-12345", mc)

	result := readClaudeJSON(t)
	mem := result["mcpServers"].(map[string]interface{})["memory"].(map[string]interface{})
	if mem["url"] != url {
		t.Errorf("url not written: want %q, got %v", url, mem["url"])
	}
	headers, ok := mem["headers"].(map[string]interface{})
	if !ok {
		t.Fatal("headers not written on first install with bearer")
	}
	if headers["Authorization"] != "Bearer "+bearer {
		t.Errorf("Authorization wrong: want 'Bearer %s', got %v", bearer, headers["Authorization"])
	}
}

// TestRegisterMCPServers_ChangeBearer verifies that supplying a new bearer
// overwrites the old one while preserving other fields (the natural rotate-JWT
// scenario when the operator regenerates a token in the dashboard).
func TestRegisterMCPServers_ChangeBearer(t *testing.T) {
	_, cleanup := testEnv(t)
	defer cleanup()

	url := "https://prod.example.com/mcp"
	writeClaudeJSON(t, map[string]interface{}{
		"mcpServers": map[string]interface{}{
			"memory": map[string]interface{}{
				"type": "http", "url": url,
				"headers": map[string]interface{}{"Authorization": "Bearer old-token"},
			},
		},
	})

	mc := memChoiceWithBearer(url, "new-token", false)
	backup := registerMCPServers("", mc)

	if backup == "" {
		t.Error("expected backup when bearer changes")
	}
	result := readClaudeJSON(t)
	mem := result["mcpServers"].(map[string]interface{})["memory"].(map[string]interface{})
	headers := mem["headers"].(map[string]interface{})
	if headers["Authorization"] != "Bearer new-token" {
		t.Errorf("expected new bearer, got %v", headers["Authorization"])
	}
}

// TestRegisterMCPServers_BearerPreservesOtherHeaders verifies that setting a
// new Authorization header does NOT clobber other operator-set headers (e.g.
// a custom proxy header). Catches the regression where mergeMCPEntry replaced
// the entire `headers` map.
func TestRegisterMCPServers_BearerPreservesOtherHeaders(t *testing.T) {
	_, cleanup := testEnv(t)
	defer cleanup()

	url := "https://prod.example.com/mcp"
	writeClaudeJSON(t, map[string]interface{}{
		"mcpServers": map[string]interface{}{
			"memory": map[string]interface{}{
				"type": "http", "url": url,
				"headers": map[string]interface{}{
					"X-Custom-Proxy": "internal-value",
					"Authorization":  "Bearer old-jwt",
				},
			},
		},
	})

	mc := memChoiceWithBearer(url, "new-jwt", false)
	registerMCPServers("", mc)

	result := readClaudeJSON(t)
	mem := result["mcpServers"].(map[string]interface{})["memory"].(map[string]interface{})
	headers := mem["headers"].(map[string]interface{})
	if headers["X-Custom-Proxy"] != "internal-value" {
		t.Errorf("custom header dropped: got %v", headers["X-Custom-Proxy"])
	}
	if headers["Authorization"] != "Bearer new-jwt" {
		t.Errorf("authorization not updated: got %v", headers["Authorization"])
	}
}

// ── extractFromSnippet (smart-paste JSON parsing) ────────────────────────────

// TestExtractFromSnippet_FullDashboardShape verifies the happy path: the
// snippet shape rendered by context-harness-mcp's /dashboard parses cleanly
// into url + bearer with the "Bearer " prefix stripped.
func TestExtractFromSnippet_FullDashboardShape(t *testing.T) {
	raw := `{
  "mcpServers": {
    "memory": {
      "type": "http",
      "url": "https://team-harness.up.railway.app/mcp",
      "headers": {
        "Authorization": "Bearer eyJhbGci.payload.signature"
      }
    }
  }
}`
	url, bearer, err := extractFromSnippet(raw)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if url != "https://team-harness.up.railway.app/mcp" {
		t.Errorf("url: got %q", url)
	}
	if bearer != "eyJhbGci.payload.signature" {
		t.Errorf("bearer (Bearer prefix should be stripped): got %q", bearer)
	}
}

// TestExtractFromSnippet_NoHeaders verifies that a snippet without an
// Authorization header (localhost / unauthenticated deployments) yields an
// empty bearer rather than erroring.
func TestExtractFromSnippet_NoHeaders(t *testing.T) {
	raw := `{"mcpServers":{"memory":{"type":"http","url":"http://localhost:7654/mcp"}}}`
	url, bearer, err := extractFromSnippet(raw)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if url != "http://localhost:7654/mcp" {
		t.Errorf("url: got %q", url)
	}
	if bearer != "" {
		t.Errorf("expected empty bearer, got %q", bearer)
	}
}

// TestExtractFromSnippet_MalformedJSON verifies that invalid JSON returns
// an error so the caller can surface a helpful message to the user.
func TestExtractFromSnippet_MalformedJSON(t *testing.T) {
	if _, _, err := extractFromSnippet(`{not: valid json`); err == nil {
		t.Error("expected error for malformed JSON")
	}
}

// TestExtractFromSnippet_MissingMCPServers verifies that a JSON object
// without an mcpServers key reports a clear error (vs silently returning
// empty strings).
func TestExtractFromSnippet_MissingMCPServers(t *testing.T) {
	_, _, err := extractFromSnippet(`{"other": "stuff"}`)
	if err == nil {
		t.Error("expected error for missing mcpServers")
	}
}

// TestExtractFromSnippet_MissingMemory verifies the targeted error when
// mcpServers exists but the memory entry is absent.
func TestExtractFromSnippet_MissingMemory(t *testing.T) {
	_, _, err := extractFromSnippet(`{"mcpServers":{"context7":{}}}`)
	if err == nil {
		t.Error("expected error for missing mcpServers.memory")
	}
}

// TestExtractFromSnippet_MissingURL verifies the targeted error when memory
// exists but has no url field — a recognizable shape error operators can fix.
func TestExtractFromSnippet_MissingURL(t *testing.T) {
	_, _, err := extractFromSnippet(`{"mcpServers":{"memory":{"type":"http"}}}`)
	if err == nil {
		t.Error("expected error for missing mcpServers.memory.url")
	}
}

// TestExtractFromSnippet_NonBearerAuthorization verifies that an
// Authorization header using a non-Bearer scheme (Basic, custom) results in
// an empty bearer — we never silently mangle a non-matching scheme.
func TestExtractFromSnippet_NonBearerAuthorization(t *testing.T) {
	raw := `{"mcpServers":{"memory":{"type":"http","url":"https://x.example.com/mcp","headers":{"Authorization":"Basic dXNlcjpwYXNz"}}}}`
	_, bearer, err := extractFromSnippet(raw)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if bearer != "" {
		t.Errorf("non-Bearer scheme must produce empty bearer, got %q", bearer)
	}
}

// TestRegisterMCPServers_NoWriteWhenBearerUnchanged verifies that re-running
// the installer with the same URL + same bearer produces no backup.
func TestRegisterMCPServers_NoWriteWhenBearerUnchanged(t *testing.T) {
	_, cleanup := testEnv(t)
	defer cleanup()

	url := "https://prod.example.com/mcp"
	bearer := "stable-jwt"
	writeClaudeJSON(t, map[string]interface{}{
		"mcpServers": map[string]interface{}{
			"memory": map[string]interface{}{
				"type": "http", "url": url,
				"headers": map[string]interface{}{"Authorization": "Bearer " + bearer},
			},
		},
	})

	mc := memChoiceWithBearer(url, bearer, true)
	backup := registerMCPServers("", mc)
	if backup != "" {
		t.Errorf("expected no backup when nothing changes, got %s", backup)
	}
}

func TestGetContext7APIKey_ForceFlagIgnoresExistingKeyAndUsesEnv(t *testing.T) {
	_, cleanup := testEnv(t)
	defer cleanup()

	storedKey := "ctx7sk-stored-real-99999"
	envKey := "ctx7sk-new-override-12345"
	writeClaudeJSON(t, map[string]interface{}{
		"mcpServers": map[string]interface{}{
			"context7": context7Entry(storedKey),
		},
	})
	forceFlag = true
	t.Setenv("CONTEXT7_API_KEY", envKey)

	result := getContext7APIKey()
	if result != envKey {
		t.Errorf("expected %s, got %s", envKey, result)
	}
}
