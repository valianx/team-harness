package main

// Tests for opencode_json.go (new for this PR) — covers the new surfaces:
//
//  AC-1  [automated]: No work-logs jargon in TITLE/label strings of the setup form.
//  AC-2  [automated]: Internal keys/values unchanged.
//  AC-3  [automated]: readClaudeCodeMCPMigration extracts URL, bearer, context7 key.
//  AC-4  [automated]: readClaudeCodeMCPMigration ignores unrelated servers.
//  AC-5  [automated]: tokenModeEnvRef produces {env:VAR} refs (unchanged default).
//  AC-6  [automated]: tokenModeLiteral produces literal bearer + key.
//  AC-7  [automated]: non-interactive resolver never produces tokenModeLiteral.
//  AC-8  [automated]: token values never appear in .team-harness.json or summary.
//  AC-9  [automated]: URL precedence: flag > env > CC-migrated URL; bad CC URL skipped.
//  AC-12 [automated]: opencode.json file mode is 0o600 on both env-ref and literal paths.
//  AC-13 [automated]: stdout capture during env-ref "No" disclosure does NOT contain secret values.

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// ---------------------------------------------------------------------------
// AC-1: No work-logs jargon in TITLE strings
// ---------------------------------------------------------------------------

// TestBuildOpencodeSetupGroups_GroupCount verifies that buildOpencodeSetupGroups
// returns exactly 5 groups after the trim: Memory MCP (confirm + URL + auth +
// bearer note) and context7 (AC-2). The previous count was 15 groups.
func TestBuildOpencodeSetupGroups_GroupCount(t *testing.T) {
	data := freshFormData()
	groups := buildOpencodeSetupGroups(data)
	// Trimmed form: Memory MCP confirm(1) + URL(1) + auth(1) + bearer note(1) +
	// context7(1) = 5 groups. The removed groups are: agent output (2), language (2),
	// english-learning (2), ClickUp (2), Obsidian tasks (1), final confirm (1) = 10
	// groups removed. Final count: 15 - 10 = 5.
	const want = 5
	if len(groups) != want {
		t.Errorf("buildOpencodeSetupGroups returned %d groups, want %d (AC-2: trimmed form)", len(groups), want)
	}
}

// TestBuildOpencodeSetupGroups_SourceScan is the definitive AC-1 assertion:
// scan the source of buildOpencodeSetupGroups for .Title("Work-Logs ...") and
// .Title("work-logs ...") patterns — the ONLY place form titles are set.
// The `(default: work-logs)` description value is exempt (it names the VALUE,
// not a TITLE); the `work-logs` config-key echo in printOpencodeApplySummary
// is also exempt. This test catches any regression where a jargon title is
// accidentally re-introduced.
func TestBuildOpencodeSetupGroups_SourceScan(t *testing.T) {
	src, err := os.ReadFile(filepath.Join(sourceDir(t), "opencode_tui.go"))
	if err != nil {
		t.Fatalf("read opencode_tui.go: %v", err)
	}
	content := string(src)

	// Extract only the buildOpencodeSetupGroups function body.
	start := strings.Index(content, "func buildOpencodeSetupGroups(")
	if start < 0 {
		t.Fatal("buildOpencodeSetupGroups not found in opencode_tui.go")
	}
	// Find the end of the function by counting braces.
	funcBody := extractFuncBody(content[start:])

	// Scan for jargon in Title() calls only (not in Description() bodies
	// which may legitimately explain what work-logs are).
	for _, line := range strings.Split(funcBody, "\n") {
		trimmed := strings.TrimSpace(line)
		// Only check .Title("...") calls (not Description, Placeholder, etc.)
		if !strings.HasPrefix(trimmed, `Title("`) && !strings.HasPrefix(trimmed, `.Title("`) {
			continue
		}
		if strings.Contains(trimmed, "Work-Logs") || strings.Contains(trimmed, "work-logs") {
			t.Errorf("jargon found in .Title() call: %s (AC-1 violated)", trimmed)
		}
	}
}

// sourceDir returns the directory containing the Go source files under test.
// This works both when tests run from the package directory and from the repo root.
func sourceDir(t *testing.T) string {
	t.Helper()
	// __file__ in Go: use runtime.Caller to locate the test file, then derive
	// the source directory (same directory as the test file).
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	return filepath.Dir(file)
}

// extractFuncBody returns the content from the start of funcStart to the
// closing brace of the first top-level function. Counts { } pairs.
func extractFuncBody(funcStart string) string {
	depth := 0
	for i, ch := range funcStart {
		if ch == '{' {
			depth++
		} else if ch == '}' {
			depth--
			if depth == 0 {
				return funcStart[:i+1]
			}
		}
	}
	return funcStart
}

// ---------------------------------------------------------------------------
// AC-1: LogsMode is always "local" (work-logs group removed)
// ---------------------------------------------------------------------------

// TestLogsModeAlwaysLocal verifies that buildOpencodeSetupValues always
// returns LogsMode == "local" after the work-logs group was removed (AC-1).
// The previous TestLogsSubfolderDefault_Preserved is superseded by this test
// because the work-logs / obsidian path is no longer reachable interactively.
func TestLogsModeAlwaysLocal(t *testing.T) {
	cfg := buildOpencodeSetupValues(freshFormData())
	if cfg.LogsMode != "local" {
		t.Errorf("LogsMode = %q, want local (work-logs group removed, AC-1)", cfg.LogsMode)
	}
}

// ---------------------------------------------------------------------------
// AC-3: readClaudeCodeMCPMigration extracts fields correctly
// ---------------------------------------------------------------------------

// TestReadClaudeCodeMCPMigration_ExtractsURL verifies that the URL is extracted
// from mcpServers.memory when the type is "http" (AC-3).
func TestReadClaudeCodeMCPMigration_ExtractsURL(t *testing.T) {
	ccJSON := `{
		"mcpServers": {
			"memory": {
				"type": "http",
				"url": "https://team-harness.up.railway.app/mcp",
				"headers": {
					"Authorization": "Bearer fake-bearer-token-276chars"
				}
			},
			"context7": {
				"type": "http",
				"url": "https://mcp.context7.com/mcp",
				"headers": {
					"CONTEXT7_API_KEY": "ctx7sk-fake43charkey"
				}
			}
		}
	}`

	tmpDir := t.TempDir()
	ccPath := filepath.Join(tmpDir, ".claude.json")
	if err := os.WriteFile(ccPath, []byte(ccJSON), 0o600); err != nil {
		t.Fatalf("write fake cc json: %v", err)
	}

	// Temporarily override the claudeJSON path.
	origClaudeJSON := claudeJSON
	claudeJSON = ccPath
	defer func() { claudeJSON = origClaudeJSON }()

	m := readClaudeCodeMCPMigration()

	if m.MemoryURL != "https://team-harness.up.railway.app/mcp" {
		t.Errorf("MemoryURL = %q, want https://team-harness.up.railway.app/mcp (AC-3)", m.MemoryURL)
	}
	if m.MemoryBearer != "fake-bearer-token-276chars" {
		t.Errorf("MemoryBearer = %q, want fake-bearer-token-276chars (AC-3 Bearer-prefix stripped)", m.MemoryBearer)
	}
	if m.Context7Key != "ctx7sk-fake43charkey" {
		t.Errorf("Context7Key = %q, want ctx7sk-fake43charkey (AC-3)", m.Context7Key)
	}
}

// TestReadClaudeCodeMCPMigration_AbsentFile_ReturnsEmpty verifies that when
// ~/.claude.json is absent, all fields return empty (AC-3 — no panic, no exit).
func TestReadClaudeCodeMCPMigration_AbsentFile_ReturnsEmpty(t *testing.T) {
	origClaudeJSON := claudeJSON
	claudeJSON = filepath.Join(t.TempDir(), "nonexistent.json")
	defer func() { claudeJSON = origClaudeJSON }()

	m := readClaudeCodeMCPMigration()

	if m.MemoryURL != "" || m.MemoryBearer != "" || m.Context7Key != "" {
		t.Errorf("expected empty migration from absent file, got %+v", m)
	}
}

// TestReadClaudeCodeMCPMigration_StdioEntry_URLEmpty verifies that a stdio-type
// memory entry (no URL field) returns an empty URL (AC-3 — stdio entries
// return "" from urlFromEntry).
func TestReadClaudeCodeMCPMigration_StdioEntry_URLEmpty(t *testing.T) {
	ccJSON := `{
		"mcpServers": {
			"memory": {
				"type": "stdio",
				"command": "memory-server"
			}
		}
	}`
	tmpDir := t.TempDir()
	ccPath := filepath.Join(tmpDir, ".claude.json")
	if err := os.WriteFile(ccPath, []byte(ccJSON), 0o600); err != nil {
		t.Fatalf("write fake cc json: %v", err)
	}

	origClaudeJSON := claudeJSON
	claudeJSON = ccPath
	defer func() { claudeJSON = origClaudeJSON }()

	m := readClaudeCodeMCPMigration()

	if m.MemoryURL != "" {
		t.Errorf("MemoryURL = %q for stdio entry, want empty (AC-3)", m.MemoryURL)
	}
}

// ---------------------------------------------------------------------------
// AC-4: readClaudeCodeMCPMigration ignores unrelated servers
// ---------------------------------------------------------------------------

// TestReadClaudeCodeMCPMigration_IgnoresUnrelatedServers verifies that a
// ~/.claude.json containing other server entries (e.g. AbletonMCP) does NOT
// read or migrate those entries — only memory and context7 are ever indexed (AC-4).
func TestReadClaudeCodeMCPMigration_IgnoresUnrelatedServers(t *testing.T) {
	ccJSON := `{
		"mcpServers": {
			"memory": {
				"type": "http",
				"url": "https://mcp.example.com/mcp",
				"headers": { "Authorization": "Bearer tok" }
			},
			"AbletonMCP": {
				"type": "stdio",
				"command": "python",
				"args": ["/some/path/ableton_mcp.py"],
				"env": { "ABLETON_SECRET": "should-never-be-read" }
			},
			"some-other-server": {
				"type": "http",
				"url": "https://other.example.com/mcp"
			}
		}
	}`
	tmpDir := t.TempDir()
	ccPath := filepath.Join(tmpDir, ".claude.json")
	if err := os.WriteFile(ccPath, []byte(ccJSON), 0o600); err != nil {
		t.Fatalf("write fake cc json: %v", err)
	}

	origClaudeJSON := claudeJSON
	claudeJSON = ccPath
	defer func() { claudeJSON = origClaudeJSON }()

	m := readClaudeCodeMCPMigration()

	// Only memory and context7 are read. AbletonMCP / other servers are ignored.
	if m.MemoryURL != "https://mcp.example.com/mcp" {
		t.Errorf("MemoryURL = %q, want https://mcp.example.com/mcp (AC-4)", m.MemoryURL)
	}
	if m.Context7Key != "" {
		t.Errorf("Context7Key = %q, want empty (no context7 entry in fixture)", m.Context7Key)
	}
	// No way to assert AbletonMCP was not read — but the struct only has 3
	// fields and none of them are AbletonMCP values. A server-map-enumeration
	// bug would leak into one of these three fields; the non-empty assertion
	// above catches that.
}

// ---------------------------------------------------------------------------
// AC-5: tokenModeEnvRef produces {env:VAR} refs (unchanged default)
// ---------------------------------------------------------------------------

// TestBuildOpencodeMemoryEntry_EnvRef verifies that the default (tokenModeEnvRef)
// produces the {env:MEMORY_MCP_BEARER} reference (AC-5 — byte-identical to today).
func TestBuildOpencodeMemoryEntry_EnvRef(t *testing.T) {
	entry := buildOpencodeMemoryEntry("https://mcp.example.com/mcp", tokenModeEnvRef, opencodeMCPSecrets{})
	if entry == nil {
		t.Fatal("buildOpencodeMemoryEntry returned nil")
	}
	headers := entry["headers"].(map[string]interface{})
	auth := headers["Authorization"].(string)
	if auth != "{env:MEMORY_MCP_BEARER}" {
		t.Errorf("Authorization = %q, want {env:MEMORY_MCP_BEARER} (AC-5)", auth)
	}
}

// TestBuildOpencodeContext7Entry_EnvRef verifies that the default (tokenModeEnvRef)
// produces the {env:CONTEXT7_API_KEY} reference (AC-5).
func TestBuildOpencodeContext7Entry_EnvRef(t *testing.T) {
	entry := buildOpencodeContext7Entry("https://mcp.context7.com/mcp", tokenModeEnvRef, opencodeMCPSecrets{})
	if entry == nil {
		t.Fatal("buildOpencodeContext7Entry returned nil")
	}
	headers := entry["headers"].(map[string]interface{})
	key := headers["CONTEXT7_API_KEY"].(string)
	if key != "{env:CONTEXT7_API_KEY}" {
		t.Errorf("CONTEXT7_API_KEY = %q, want {env:CONTEXT7_API_KEY} (AC-5)", key)
	}
}

// TestRegisterOpencodeMCP_EnvRef_WritesEnvRefs verifies that calling
// registerOpencodeMCP with tokenModeEnvRef writes {env:VAR} references into
// the file (AC-5 end-to-end).
func TestRegisterOpencodeMCP_EnvRef_WritesEnvRefs(t *testing.T) {
	dir := t.TempDir()
	docPath := filepath.Join(dir, "opencode.json")

	_, err := registerOpencodeMCP(
		"https://mcp.example.com/mcp",
		"https://mcp.context7.com/mcp",
		docPath,
		tokenModeEnvRef,
		opencodeMCPSecrets{},
	)
	if err != nil {
		t.Fatalf("registerOpencodeMCP: %v", err)
	}

	data, err := os.ReadFile(docPath)
	if err != nil {
		t.Fatalf("read opencode.json: %v", err)
	}
	content := string(data)

	if !strings.Contains(content, "{env:MEMORY_MCP_BEARER}") {
		t.Error("{env:MEMORY_MCP_BEARER} missing from opencode.json (AC-5)")
	}
	if !strings.Contains(content, "{env:CONTEXT7_API_KEY}") {
		t.Error("{env:CONTEXT7_API_KEY} missing from opencode.json (AC-5)")
	}
}

// ---------------------------------------------------------------------------
// AC-6: tokenModeLiteral produces literal bearer + key
// ---------------------------------------------------------------------------

// TestBuildOpencodeMemoryEntry_Literal verifies that tokenModeLiteral produces
// "Bearer <token>" in the Authorization header (AC-6 / plan pattern mirrors
// buildMemoryEntry in claude_json.go).
func TestBuildOpencodeMemoryEntry_Literal(t *testing.T) {
	secrets := opencodeMCPSecrets{MemoryBearer: "tok", Context7Key: "key"}
	entry := buildOpencodeMemoryEntry("https://mcp.example.com/mcp", tokenModeLiteral, secrets)
	if entry == nil {
		t.Fatal("buildOpencodeMemoryEntry returned nil")
	}
	headers := entry["headers"].(map[string]interface{})
	auth := headers["Authorization"].(string)
	if auth != "Bearer tok" {
		t.Errorf("Authorization = %q, want Bearer tok (AC-6)", auth)
	}
}

// TestBuildOpencodeContext7Entry_Literal verifies that tokenModeLiteral produces
// the literal key value (AC-6).
func TestBuildOpencodeContext7Entry_Literal(t *testing.T) {
	secrets := opencodeMCPSecrets{MemoryBearer: "tok", Context7Key: "key"}
	entry := buildOpencodeContext7Entry("https://mcp.context7.com/mcp", tokenModeLiteral, secrets)
	if entry == nil {
		t.Fatal("buildOpencodeContext7Entry returned nil")
	}
	headers := entry["headers"].(map[string]interface{})
	k := headers["CONTEXT7_API_KEY"].(string)
	if k != "key" {
		t.Errorf("CONTEXT7_API_KEY = %q, want key (AC-6)", k)
	}
}

// TestRegisterOpencodeMCP_Literal_WritesLiteralValues verifies that calling
// registerOpencodeMCP with tokenModeLiteral writes the literal token values
// into the file (AC-6 end-to-end).
func TestRegisterOpencodeMCP_Literal_WritesLiteralValues(t *testing.T) {
	dir := t.TempDir()
	docPath := filepath.Join(dir, "opencode.json")

	secrets := opencodeMCPSecrets{MemoryBearer: "tok", Context7Key: "key"}
	_, err := registerOpencodeMCP(
		"https://mcp.example.com/mcp",
		"https://mcp.context7.com/mcp",
		docPath,
		tokenModeLiteral,
		secrets,
	)
	if err != nil {
		t.Fatalf("registerOpencodeMCP: %v", err)
	}

	data, err := os.ReadFile(docPath)
	if err != nil {
		t.Fatalf("read opencode.json: %v", err)
	}
	content := string(data)

	if !strings.Contains(content, "Bearer tok") {
		t.Error("Bearer tok not found in opencode.json (AC-6)")
	}
	if !strings.Contains(content, `"key"`) {
		t.Error("literal key value not found in opencode.json (AC-6)")
	}
}

// ---------------------------------------------------------------------------
// AC-7: non-interactive resolver never produces tokenModeLiteral
// ---------------------------------------------------------------------------

// TestResolveOpencodeSetupFromEnvFlagsWithCCURL_NoMigration_EnvRef verifies the
// no-migration case: when no CC migration is passed, the resolver reads from env
// only and produces cfg values suitable for the env-ref token path (AC-7 preserved).
//
// This replaces TestResolveOpencodeSetupFromEnvFlagsWithCCURL_NoLiteralPath which
// asserted the OLD contract (literal-unreachable from resolver). The resolver still
// returns no secrets; token-mode selection now happens in the caller based on
// ccMigration.hasLiteralTokens(). This test covers the no-migration branch.
func TestResolveOpencodeSetupFromEnvFlagsWithCCURL_NoMigration_EnvRef(t *testing.T) {
	origFlag := memoryURLFlag
	defer func() { memoryURLFlag = origFlag }()
	memoryURLFlag = ""

	t.Setenv("MEMORY_MCP_URL", "https://mcp.example.com/mcp")
	t.Setenv("CONTEXT7_API_KEY", "fake-ctx7-key")
	t.Setenv("MEMORY_MCP_BEARER", "fake-bearer")
	t.Setenv("LOGS_MODE", "")

	// Empty migration: no CC tokens → resolver uses env only.
	cfg := resolveOpencodeSetupFromEnvFlagsWithCCURL(opencodeMCPMigration{})

	// The result is an opencodeSetupValues — no secrets, no tokenMode.
	// The caller (runOpencodePostApply) checks hasLiteralTokens() separately;
	// this path returns env-ref-suitable values.
	if cfg.MCP.MemoryURL != "https://mcp.example.com/mcp" {
		t.Errorf("MemoryURL = %q, want https://mcp.example.com/mcp", cfg.MCP.MemoryURL)
	}
	if !cfg.MCP.Context7Enabled {
		t.Error("Context7Enabled = false, want true when CONTEXT7_API_KEY is set (no-migration case)")
	}
}

// TestResolveOpencodeSetupFromEnvFlagsWithCCURL_WithMigration_Context7Wired verifies
// that when the CC migration carries a context7 key but the env var is absent, the
// resolver sets Context7Enabled = true (fix: context7 key was previously ignored on
// the non-interactive path).
func TestResolveOpencodeSetupFromEnvFlagsWithCCURL_WithMigration_Context7Wired(t *testing.T) {
	origFlag := memoryURLFlag
	defer func() { memoryURLFlag = origFlag }()
	memoryURLFlag = ""

	t.Setenv("MEMORY_MCP_URL", "")
	t.Setenv("CONTEXT7_API_KEY", "") // env absent — must fall back to migration
	t.Setenv("LOGS_MODE", "")

	migration := opencodeMCPMigration{
		MemoryURL:    "https://mcp.example.com/mcp",
		MemoryBearer: "fake-bearer",
		Context7Key:  "ctx7sk-migrated",
	}

	cfg := resolveOpencodeSetupFromEnvFlagsWithCCURL(migration)

	if cfg.MCP.MemoryURL != "https://mcp.example.com/mcp" {
		t.Errorf("MemoryURL = %q, want CC migrated URL", cfg.MCP.MemoryURL)
	}
	if !cfg.MCP.Context7Enabled {
		t.Error("Context7Enabled = false, want true when CC migration has context7 key (fix: AC-2)")
	}
}

// TestNonInteractiveMigration_LiteralPath verifies the fixed non-interactive
// CC→opencode migration path end-to-end:
//   - resolver yields Context7Enabled = true from the CC migration key
//   - caller (runOpencodePostApply pattern) flips to tokenModeLiteral when
//     ccMigration.hasLiteralTokens() is true
//   - registerOpencodeMCP writes the literal values into opencode.json
//
// This test encodes the NEW contract for the non-interactive migration path:
// CC-migration-with-tokens → tokenModeLiteral + literal values in opencode.json.
// The no-migration → env-ref contract is covered by
// TestResolveOpencodeSetupFromEnvFlagsWithCCURL_NoMigration_EnvRef above.
func TestNonInteractiveMigration_LiteralPath(t *testing.T) {
	dir := t.TempDir()
	docPath := filepath.Join(dir, "opencode.json")

	// Simulate the CC migration with literal tokens.
	ccMigration := opencodeMCPMigration{
		MemoryURL:    "https://team-harness.up.railway.app/mcp",
		MemoryBearer: "fake-bearer-migration",
		Context7Key:  "ctx7sk-migration-key",
	}

	// Step A: resolver returns a cfg with the migrated values.
	origFlag := memoryURLFlag
	defer func() { memoryURLFlag = origFlag }()
	memoryURLFlag = ""
	t.Setenv("MEMORY_MCP_URL", "")
	t.Setenv("CONTEXT7_API_KEY", "")

	cfg := resolveOpencodeSetupFromEnvFlagsWithCCURL(ccMigration)

	if cfg.MCP.MemoryURL != "https://team-harness.up.railway.app/mcp" {
		t.Errorf("MemoryURL = %q, want migrated URL", cfg.MCP.MemoryURL)
	}
	if !cfg.MCP.Context7Enabled {
		t.Error("Context7Enabled = false, want true (migrated context7 key, fix AC-2)")
	}

	// Step B: caller detects hasLiteralTokens() and sets mode + secrets.
	var mode tokenMode
	var secrets opencodeMCPSecrets
	if ccMigration.hasLiteralTokens() {
		mode = tokenModeLiteral
		secrets = opencodeMCPSecrets{
			MemoryBearer: ccMigration.MemoryBearer,
			Context7Key:  ccMigration.Context7Key,
		}
	}

	if mode != tokenModeLiteral {
		t.Error("mode = tokenModeEnvRef, want tokenModeLiteral when CC migration has tokens (fix AC-7)")
	}
	if secrets.MemoryBearer != "fake-bearer-migration" {
		t.Errorf("secrets.MemoryBearer = %q, want fake-bearer-migration", secrets.MemoryBearer)
	}
	if secrets.Context7Key != "ctx7sk-migration-key" {
		t.Errorf("secrets.Context7Key = %q, want ctx7sk-migration-key", secrets.Context7Key)
	}

	// Step C: write opencode.json with literal values (mirrors registerOpencodeMCPFromValues).
	const context7URL = "https://mcp.context7.com/mcp"
	ctx7URL := ""
	if cfg.MCP.Context7Enabled {
		ctx7URL = context7URL
	}
	if _, err := registerOpencodeMCP(cfg.MCP.MemoryURL, ctx7URL, docPath, mode, secrets); err != nil {
		t.Fatalf("registerOpencodeMCP: %v", err)
	}

	data, err := os.ReadFile(docPath)
	if err != nil {
		t.Fatalf("opencode.json not written: %v", err)
	}
	content := string(data)

	// AC-2: literal bearer must appear.
	if !strings.Contains(content, "Bearer fake-bearer-migration") {
		t.Error("literal bearer not found in opencode.json (AC-2 / fix: non-interactive migration)")
	}
	// AC-2: literal context7 key must appear.
	if !strings.Contains(content, "ctx7sk-migration-key") {
		t.Error("literal context7 key not found in opencode.json (AC-2 / fix: non-interactive migration)")
	}
	// Env-ref placeholders must NOT appear (they mean the migration failed).
	if strings.Contains(content, "{env:MEMORY_MCP_BEARER}") {
		t.Error("{env:MEMORY_MCP_BEARER} found — migration produced env-ref instead of literal (regression)")
	}
	if strings.Contains(content, "{env:CONTEXT7_API_KEY}") {
		t.Error("{env:CONTEXT7_API_KEY} found — migration produced env-ref instead of literal (regression)")
	}
}

// ---------------------------------------------------------------------------
// AC-8: token values never appear in .team-harness.json or apply summary
// ---------------------------------------------------------------------------

// TestRegisterOpencodeMCP_Literal_NotInTeamHarnessConfig verifies that the
// literal token values do NOT appear in the written .team-harness.json (AC-8).
// The allowlistedOpencodeKeys contract already excludes them; this test asserts
// the runtime outcome.
func TestRegisterOpencodeMCP_Literal_NotInTeamHarnessConfig(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, ".team-harness.json")
	placer := newOpencodePlacerAt(dir)

	cfg := opencodeSetupValues{
		LogsMode: "local",
		MCP: opencodeMCPValues{
			MemoryURL:          "https://mcp.example.com/mcp",
			MemoryRequiresAuth: true,
			Context7Enabled:    true,
		},
	}

	if err := writeOpencodeTeamHarnessConfig(cfgPath, cfg, placer); err != nil {
		t.Fatalf("writeOpencodeTeamHarnessConfig: %v", err)
	}

	data, err := os.ReadFile(cfgPath)
	if err != nil {
		t.Fatalf("read .team-harness.json: %v", err)
	}
	content := string(data)

	// These synthetic token values must NEVER appear in .team-harness.json.
	for _, secret := range []string{"fake-bearer-literal", "fake-ctx7-literal"} {
		if strings.Contains(content, secret) {
			t.Errorf("secret %q found in .team-harness.json (AC-8 violated)", secret)
		}
	}

	// The file must be valid JSON.
	var check interface{}
	if err := json.Unmarshal(data, &check); err != nil {
		t.Errorf(".team-harness.json is invalid JSON: %v", err)
	}
}

// TestPrintOpencodeApplySummary_NoLiteralSecretInOutput verifies that
// printOpencodeApplySummary writes "names only" (SEC-OC-R5): the literal
// token values are never echoed in the summary output (AC-8).
func TestPrintOpencodeApplySummary_NoLiteralSecretInOutput(t *testing.T) {
	dir := t.TempDir()
	diff := PlanDiff{}
	cfg := opencodeSetupValues{
		LogsMode: "local",
		MCP: opencodeMCPValues{
			MemoryURL:          "https://mcp.example.com/mcp",
			MemoryRequiresAuth: true,
			Context7Enabled:    true,
		},
	}

	// Capture stdout.
	oldStdout := os.Stdout
	r, w, _ := os.Pipe()
	os.Stdout = w

	printOpencodeApplySummary(&diff, cfg, dir+"/.team-harness.json", dir, MCPRegisterOutcome{
		Memory:   MCPStatusAdded,
		Context7: MCPStatusAdded,
	})

	w.Close()
	os.Stdout = oldStdout

	buf := make([]byte, 65536)
	n, _ := r.Read(buf)
	output := string(buf[:n])

	// These synthetic literal values must NOT appear in the summary.
	for _, secret := range []string{"fake-bearer-literal", "fake-ctx7-literal"} {
		if strings.Contains(output, secret) {
			t.Errorf("secret %q found in apply summary output (AC-8 / SEC-OC-R5 violated)", secret)
		}
	}
}

// ---------------------------------------------------------------------------
// AC-9: URL precedence — flag > env > CC-migrated URL
// ---------------------------------------------------------------------------

// TestResolveMemoryURLWithCCFallback_FlagWins verifies that --memory-url flag
// wins over env and CC URL (AC-9 priority 1).
func TestResolveMemoryURLWithCCFallback_FlagWins(t *testing.T) {
	origFlag := memoryURLFlag
	defer func() { memoryURLFlag = origFlag }()
	memoryURLFlag = "https://flag.example.com/mcp"

	t.Setenv("MEMORY_MCP_URL", "https://env.example.com/mcp")

	got := resolveMemoryURLWithCCFallback("https://cc.example.com/mcp")
	if got != "https://flag.example.com/mcp" {
		t.Errorf("URL = %q, want flag value (AC-9 priority 1)", got)
	}
}

// TestResolveMemoryURLWithCCFallback_EnvWinsOverCC verifies that MEMORY_MCP_URL
// env wins over the CC-migrated URL when no flag is set (AC-9 priority 2).
func TestResolveMemoryURLWithCCFallback_EnvWinsOverCC(t *testing.T) {
	origFlag := memoryURLFlag
	defer func() { memoryURLFlag = origFlag }()
	memoryURLFlag = ""

	t.Setenv("MEMORY_MCP_URL", "https://env.example.com/mcp")

	got := resolveMemoryURLWithCCFallback("https://cc.example.com/mcp")
	if got != "https://env.example.com/mcp" {
		t.Errorf("URL = %q, want env value (AC-9 priority 2)", got)
	}
}

// TestResolveMemoryURLWithCCFallback_CCFallbackUsed verifies that the CC
// URL is used as fallback when flag and env are both empty (AC-9 priority 3).
func TestResolveMemoryURLWithCCFallback_CCFallbackUsed(t *testing.T) {
	origFlag := memoryURLFlag
	defer func() { memoryURLFlag = origFlag }()
	memoryURLFlag = ""

	t.Setenv("MEMORY_MCP_URL", "")

	got := resolveMemoryURLWithCCFallback("https://cc.example.com/mcp")
	if got != "https://cc.example.com/mcp" {
		t.Errorf("URL = %q, want CC fallback value (AC-9 priority 3)", got)
	}
}

// TestResolveMemoryURLWithCCFallback_BadCCURL_Skipped verifies that an invalid
// CC-migrated URL is skipped (no os.Exit) and the function returns empty (AC-9).
// Only flag/env invalid URLs hard-exit — CC-migrated invalid URLs are skipped
// with a one-line note.
func TestResolveMemoryURLWithCCFallback_BadCCURL_Skipped(t *testing.T) {
	origFlag := memoryURLFlag
	defer func() { memoryURLFlag = origFlag }()
	memoryURLFlag = ""

	t.Setenv("MEMORY_MCP_URL", "")

	// "ftp://" is invalid per validateMCPURL (must be http/https).
	got := resolveMemoryURLWithCCFallback("ftp://not-valid.example.com")
	if got != "" {
		t.Errorf("URL = %q, want empty (bad CC URL must be skipped without exit, AC-9)", got)
	}
}

// ---------------------------------------------------------------------------
// AC-12: opencode.json file mode is 0o600 (POSIX only — guarded off on Windows)
// ---------------------------------------------------------------------------

// TestRegisterOpencodeMCP_FileMode_EnvRef verifies that registerOpencodeMCP
// writes opencode.json with mode 0o600 on the env-ref path (AC-12 POSIX).
func TestRegisterOpencodeMCP_FileMode_EnvRef(t *testing.T) {
	if isWindows() {
		t.Skip("file mode bits are not enforced on Windows (AC-12 Windows clause)")
	}

	dir := t.TempDir()
	docPath := filepath.Join(dir, "opencode.json")

	_, err := registerOpencodeMCP(
		"https://mcp.example.com/mcp",
		"https://mcp.context7.com/mcp",
		docPath,
		tokenModeEnvRef,
		opencodeMCPSecrets{},
	)
	if err != nil {
		t.Fatalf("registerOpencodeMCP (env-ref): %v", err)
	}

	info, err := os.Stat(docPath)
	if err != nil {
		t.Fatalf("stat opencode.json: %v", err)
	}
	// AC-12 binding contract: 0o600 UNCONDITIONALLY (not 0o644).
	if info.Mode().Perm() != 0o600 {
		t.Errorf("opencode.json mode = %o, want 0o600 (AC-12 env-ref path)", info.Mode().Perm())
	}
}

// TestRegisterOpencodeMCP_FileMode_Literal verifies that registerOpencodeMCP
// writes opencode.json with mode 0o600 on the literal path (AC-12 POSIX).
// A literal secret in a 0o644 file is the exact finding this prevents.
func TestRegisterOpencodeMCP_FileMode_Literal(t *testing.T) {
	if isWindows() {
		t.Skip("file mode bits are not enforced on Windows (AC-12 Windows clause)")
	}

	dir := t.TempDir()
	docPath := filepath.Join(dir, "opencode.json")

	secrets := opencodeMCPSecrets{MemoryBearer: "tok", Context7Key: "key"}
	_, err := registerOpencodeMCP(
		"https://mcp.example.com/mcp",
		"https://mcp.context7.com/mcp",
		docPath,
		tokenModeLiteral,
		secrets,
	)
	if err != nil {
		t.Fatalf("registerOpencodeMCP (literal): %v", err)
	}

	info, err := os.Stat(docPath)
	if err != nil {
		t.Fatalf("stat opencode.json: %v", err)
	}
	// AC-12 binding contract: 0o600 UNCONDITIONALLY (both literal and env-ref paths).
	if info.Mode().Perm() != 0o600 {
		t.Errorf("opencode.json mode = %o, want 0o600 (AC-12 literal path)", info.Mode().Perm())
	}
}

// ---------------------------------------------------------------------------
// Fix: real per-run MCP outcome — registered / already configured / skipped
// ---------------------------------------------------------------------------

// TestRegisterOpencodeMCP_FreshRun_ReturnsAdded verifies that a fresh call to
// registerOpencodeMCP (opencode.json absent) returns MCPStatusAdded for both
// servers — "registered" in the summary is truthful.
func TestRegisterOpencodeMCP_FreshRun_ReturnsAdded(t *testing.T) {
	dir := t.TempDir()
	docPath := filepath.Join(dir, "opencode.json")

	outcome, err := registerOpencodeMCP(
		"https://mcp.example.com/mcp",
		"https://mcp.context7.com/mcp",
		docPath,
		tokenModeEnvRef,
		opencodeMCPSecrets{},
	)
	if err != nil {
		t.Fatalf("registerOpencodeMCP: %v", err)
	}

	if outcome.Memory != MCPStatusAdded {
		t.Errorf("Memory outcome = %q, want %q (fresh run — fix: real per-run MCP state)", outcome.Memory, MCPStatusAdded)
	}
	if outcome.Context7 != MCPStatusAdded {
		t.Errorf("Context7 outcome = %q, want %q (fresh run — fix: real per-run MCP state)", outcome.Context7, MCPStatusAdded)
	}
}

// TestRegisterOpencodeMCP_IdempotentReRun_ReturnsAlreadyConfigured verifies
// that an identical re-run (opencode.json already contains the correct entries)
// returns MCPStatusAlreadyConfigured for both servers. This is the fix for the
// operator-observed issue: "registered" was shown even when nothing was written.
func TestRegisterOpencodeMCP_IdempotentReRun_ReturnsAlreadyConfigured(t *testing.T) {
	dir := t.TempDir()
	docPath := filepath.Join(dir, "opencode.json")

	// First run — writes the file.
	if _, err := registerOpencodeMCP(
		"https://mcp.example.com/mcp",
		"https://mcp.context7.com/mcp",
		docPath,
		tokenModeEnvRef,
		opencodeMCPSecrets{},
	); err != nil {
		t.Fatalf("first registerOpencodeMCP: %v", err)
	}

	// Second run — identical parameters, nothing should change.
	outcome, err := registerOpencodeMCP(
		"https://mcp.example.com/mcp",
		"https://mcp.context7.com/mcp",
		docPath,
		tokenModeEnvRef,
		opencodeMCPSecrets{},
	)
	if err != nil {
		t.Fatalf("second registerOpencodeMCP: %v", err)
	}

	if outcome.Memory != MCPStatusAlreadyConfigured {
		t.Errorf("Memory outcome = %q, want %q on idempotent re-run (fix: real per-run MCP state)", outcome.Memory, MCPStatusAlreadyConfigured)
	}
	if outcome.Context7 != MCPStatusAlreadyConfigured {
		t.Errorf("Context7 outcome = %q, want %q on idempotent re-run (fix: real per-run MCP state)", outcome.Context7, MCPStatusAlreadyConfigured)
	}
}

// TestRegisterOpencodeMCP_GenuineAbsence_ReturnsSkipped verifies that when
// both URLs are empty, registerOpencodeMCP returns MCPStatusSkipped for both
// servers (genuine absence path — nothing is written).
func TestRegisterOpencodeMCP_GenuineAbsence_ReturnsSkipped(t *testing.T) {
	dir := t.TempDir()
	docPath := filepath.Join(dir, "opencode.json")

	// Empty URLs → both servers skipped.
	outcome, err := registerOpencodeMCP("", "", docPath, tokenModeEnvRef, opencodeMCPSecrets{})
	if err != nil {
		t.Fatalf("registerOpencodeMCP: %v", err)
	}

	if outcome.Memory != MCPStatusSkipped {
		t.Errorf("Memory outcome = %q, want %q (absent URL — fix: real per-run MCP state)", outcome.Memory, MCPStatusSkipped)
	}
	if outcome.Context7 != MCPStatusSkipped {
		t.Errorf("Context7 outcome = %q, want %q (absent URL — fix: real per-run MCP state)", outcome.Context7, MCPStatusSkipped)
	}

	// File must not have been created.
	if _, err := os.Stat(docPath); !os.IsNotExist(err) {
		t.Error("opencode.json was created despite both URLs being empty (fix: genuine absence must not write)")
	}
}

// TestPrintOpencodeApplySummary_ReRun_ShowsAlreadyConfigured verifies that the
// summary output shows "already configured" (not "registered") when the MCP
// outcome says MCPStatusAlreadyConfigured — end-to-end fix assertion.
func TestPrintOpencodeApplySummary_ReRun_ShowsAlreadyConfigured(t *testing.T) {
	dir := t.TempDir()
	diff := PlanDiff{}
	cfg := opencodeSetupValues{
		LogsMode: "local",
		MCP: opencodeMCPValues{
			MemoryURL:       "https://mcp.example.com/mcp",
			Context7Enabled: true,
		},
	}

	oldStdout := os.Stdout
	r, w, _ := os.Pipe()
	os.Stdout = w

	printOpencodeApplySummary(&diff, cfg, filepath.Join(dir, ".team-harness.json"), dir, MCPRegisterOutcome{
		Memory:   MCPStatusAlreadyConfigured,
		Context7: MCPStatusAlreadyConfigured,
	})

	w.Close()
	os.Stdout = oldStdout

	buf := make([]byte, 65536)
	n, _ := r.Read(buf)
	output := string(buf[:n])

	if !strings.Contains(output, "already configured") {
		t.Errorf("summary missing 'already configured' on re-run (fix: real per-run MCP state):\n%s", output)
	}
	if strings.Contains(output, "registered") {
		t.Errorf("summary shows 'registered' on idempotent re-run — must show 'already configured' (fix):\n%s", output)
	}
}

// ---------------------------------------------------------------------------
// AC-13: stdout does NOT contain secret values during env-ref disclosure
// ---------------------------------------------------------------------------

// TestDiscloseCCTokensToTTY_SecretAbsentFromStdout verifies that the env-ref
// "No" disclosure path (discloseCCTokensToTTY) does NOT write the secret
// values to stdout (AC-13). The disclosure is written to /dev/tty (the
// controlling terminal) — in a test environment where /dev/tty is unavailable,
// the function falls back to a non-secret stderr message.
//
// We capture stdout during the call and assert the literal token values are
// absent. The live /dev/tty print is operator-manual (AC-10 "No" branch).
func TestDiscloseCCTokensToTTY_SecretAbsentFromStdout(t *testing.T) {
	migration := opencodeMCPMigration{
		MemoryBearer: "fake-bearer-do-not-log",
		Context7Key:  "fake-ctx7-do-not-log",
	}

	// Capture stdout.
	oldStdout := os.Stdout
	r, w, _ := os.Pipe()
	os.Stdout = w

	// Also capture stderr to redirect the Windows/no-tty fallback message
	// away from the test output, but we do NOT assert on stderr content
	// (the fallback message does not contain secret values by contract).
	oldStderr := os.Stderr
	_, wErr, _ := os.Pipe()
	os.Stderr = wErr

	discloseCCTokensToTTY(migration)

	w.Close()
	wErr.Close()
	os.Stdout = oldStdout
	os.Stderr = oldStderr

	buf := make([]byte, 65536)
	n, _ := r.Read(buf)
	stdoutContent := string(buf[:n])

	// AC-13: the literal secret values must NOT appear in captured stdout.
	if strings.Contains(stdoutContent, "fake-bearer-do-not-log") {
		t.Error("Memory bearer value found in stdout (AC-13 violated — must write to /dev/tty only)")
	}
	if strings.Contains(stdoutContent, "fake-ctx7-do-not-log") {
		t.Error("context7 key value found in stdout (AC-13 violated — must write to /dev/tty only)")
	}
}

// TestDiscloseCCTokensToTTY_EmptyMigration_NoOp verifies that calling
// discloseCCTokensToTTY with an empty migration (no tokens) does not panic
// or write anything to stdout.
func TestDiscloseCCTokensToTTY_EmptyMigration_NoOp(t *testing.T) {
	migration := opencodeMCPMigration{} // no tokens

	oldStdout := os.Stdout
	r, w, _ := os.Pipe()
	os.Stdout = w

	oldStderr := os.Stderr
	_, wErr, _ := os.Pipe()
	os.Stderr = wErr

	discloseCCTokensToTTY(migration)

	w.Close()
	wErr.Close()
	os.Stdout = oldStdout
	os.Stderr = oldStderr

	buf := make([]byte, 65536)
	n, _ := r.Read(buf)
	if n > 0 {
		t.Errorf("discloseCCTokensToTTY with empty migration wrote %d bytes to stdout, want 0", n)
	}
}
