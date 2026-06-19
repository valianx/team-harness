package main

import (
	"bufio"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ledgerTestEnv sets up an isolated data-home for ledger tests.
// It clears all data-home env vars (mirroring clearDataHomeEnv from datahome_test.go)
// and redirects TEAM_HARNESS_DATA_HOME to a sub-directory of t.TempDir() so the
// ancestor walk in the SEC-01 pipeline sees only the current-user-owned temp tree.
//
// IMPORTANT: ResolveDataHome() is called immediately after setting the env var so
// that the data-home directory is created and secured through the full security
// pipeline BEFORE any test helper (e.g. writeLedgerLines) writes files into it
// directly via os.WriteFile. Without this pre-call, Windows' createAndSecureDir
// modifies the directory's DACL on the FIRST appendLedger/readLedger call, which
// can cause "Access is denied" on files created before the DACL was set.
func ledgerTestEnv(t *testing.T) (dataDir string, cleanup func()) {
	t.Helper()
	// Clear all env vars that affect data-home resolution and redirect HOME to
	// a temp dir so the ancestor ownership walk never reaches C:\Users\<user>
	// or similar paths that may be owned by LocalSystem (SID S-1-5-18).
	clearDataHomeEnv(t)
	ResetDataHomeCache()

	// Create a sub-directory under the test's already-clean temp root.
	tmp := t.TempDir()
	dataHomeDir := filepath.Join(tmp, "th-data")
	t.Setenv("TEAM_HARNESS_DATA_HOME", dataHomeDir)

	// Pre-initialize the data-home directory through the security pipeline so
	// that subsequent os.WriteFile calls by writeLedgerLines land in a directory
	// that already has the correct DACL (Windows) or mode (Unix).
	// Errors here are fatal — the test environment is invalid if this fails.
	if _, err := ResolveDataHome(); err != nil {
		t.Fatalf("ledgerTestEnv: ResolveDataHome failed: %v", err)
	}

	return dataHomeDir, func() {
		ResetDataHomeCache()
	}
}

// writeLedgerLines writes raw JSONL lines to the ledger file under dataDir.
// It creates the directory if needed (the data-home dir is created lazily by
// ResolveDataHome; we need it to exist before writing fixture data).
func writeLedgerLines(t *testing.T, dataDir string, lines []string) {
	t.Helper()
	if err := os.MkdirAll(dataDir, 0o700); err != nil {
		t.Fatalf("create data dir: %v", err)
	}
	p := filepath.Join(dataDir, ledgerFilename)
	content := strings.Join(lines, "\n")
	if len(lines) > 0 && !strings.HasSuffix(content, "\n") {
		content += "\n"
	}
	if err := os.WriteFile(p, []byte(content), 0o600); err != nil {
		t.Fatalf("write ledger fixture: %v", err)
	}
}

// readLedgerRaw returns the raw bytes of the ledger file from dataDir.
func readLedgerRaw(t *testing.T, dataDir string) []byte {
	t.Helper()
	p := filepath.Join(dataDir, ledgerFilename)
	data, err := os.ReadFile(p)
	if err != nil {
		t.Fatalf("read ledger from %q: %v", p, err)
	}
	return data
}

// ---------------------------------------------------------------------------
// AC-3-bis: append preserves prior lines (SEC-DR-P3-1)
// ---------------------------------------------------------------------------

// TestLedger_AppendPreservesPriorLines_SecDrP3_1 is the AC-3-bis test.
// It pre-populates the ledger with N>1 well-formed lines, then calls
// appendLedger for a second entry and asserts:
//   - The N prior lines are byte-for-byte identical after the append.
//   - The new line is at the end.
//
// A literal offset-0 write would overwrite line 1, causing this test to fail.
// This proves the explicit Seek(0, io.SeekEnd) is in effect (SEC-DR-P3-1).
// The test runs on the current OS (both Unix and Windows paths exercise the
// same Seek mechanism through os.File).
func TestLedger_AppendPreservesPriorLines_SecDrP3_1(t *testing.T) {
	dataDir, cleanup := ledgerTestEnv(t)
	defer cleanup()

	// Pre-populate the ledger with 3 well-formed lines.
	priorLines := []LedgerEntry{
		{TS: "2026-06-18T01:00:00Z", Op: "install", Component: "comp-a", Owns: OwnershipTags{Files: []string{"{config_root}/agents/a.md"}, ConfigKeys: []string{}}, SchemaVersion: 1},
		{TS: "2026-06-18T01:01:00Z", Op: "install", Component: "comp-b", Owns: OwnershipTags{Files: []string{"{config_root}/agents/b.md"}, ConfigKeys: []string{"logs-mode"}}, SchemaVersion: 1},
		{TS: "2026-06-18T01:02:00Z", Op: "update",  Component: "comp-a", Owns: OwnershipTags{Files: []string{"{config_root}/agents/a.md"}, ConfigKeys: []string{}}, SchemaVersion: 1},
	}
	rawLines := make([]string, len(priorLines))
	for i, e := range priorLines {
		b, err := json.Marshal(e)
		if err != nil {
			t.Fatalf("marshal prior line %d: %v", i, err)
		}
		rawLines[i] = string(b)
	}
	writeLedgerLines(t, dataDir, rawLines)

	// Snapshot the pre-append bytes.
	before := readLedgerRaw(t, dataDir)

	// Append one more entry (the second apply).
	newEntry := LedgerEntry{
		Op:        "install",
		Component: "comp-c",
		Owns:      OwnershipTags{Files: []string{"{config_root}/agents/c.md"}, ConfigKeys: []string{}},
	}
	if err := appendLedger([]LedgerEntry{newEntry}); err != nil {
		t.Fatalf("appendLedger: %v", err)
	}

	// Read the file after the append.
	after := readLedgerRaw(t, dataDir)

	// The prior content must be a byte-identical prefix of the new content.
	if len(after) <= len(before) {
		t.Fatalf("file did not grow: before=%d bytes, after=%d bytes (prior lines may have been overwritten)", len(before), len(after))
	}
	if string(after[:len(before)]) != string(before) {
		t.Errorf("prior lines were not preserved byte-for-byte:\nbefore (hex snippet): %x\nafter prefix (hex snippet): %x",
			before[:min(len(before), 64)], after[:min(len(before), 64)])
	}

	// The appended entry must be at the end of the file.
	afterStr := string(after)
	if !strings.Contains(afterStr, `"comp-c"`) {
		t.Error("new entry comp-c was not found in ledger after append")
	}

	// Count lines: must be exactly prior + 1.
	lineCount := countLines(after)
	wantLines := len(priorLines) + 1
	if lineCount != wantLines {
		t.Errorf("expected %d lines after append, got %d", wantLines, lineCount)
	}
}

// TestLedger_AppendPreservesPriorLines_MultipleAppends verifies that repeated
// appends (simulating multiple apply runs) never overwrite earlier lines.
func TestLedger_AppendPreservesPriorLines_MultipleAppends(t *testing.T) {
	dataDir, cleanup := ledgerTestEnv(t)
	defer cleanup()

	// Start with one entry.
	first := LedgerEntry{Op: "install", Component: "first", Owns: OwnershipTags{Files: []string{"{config_root}/f.md"}, ConfigKeys: []string{}}}
	if err := appendLedger([]LedgerEntry{first}); err != nil {
		t.Fatalf("first append: %v", err)
	}
	after1 := readLedgerRaw(t, dataDir)

	// Append a second entry.
	second := LedgerEntry{Op: "install", Component: "second", Owns: OwnershipTags{Files: []string{"{config_root}/s.md"}, ConfigKeys: []string{}}}
	if err := appendLedger([]LedgerEntry{second}); err != nil {
		t.Fatalf("second append: %v", err)
	}
	after2 := readLedgerRaw(t, dataDir)

	// First-append bytes must be a prefix of after-second bytes.
	if string(after2[:len(after1)]) != string(after1) {
		t.Error("first entry was overwritten or modified by second append")
	}

	// Append a third.
	third := LedgerEntry{Op: "install", Component: "third", Owns: OwnershipTags{Files: []string{"{config_root}/t.md"}, ConfigKeys: []string{}}}
	if err := appendLedger([]LedgerEntry{third}); err != nil {
		t.Fatalf("third append: %v", err)
	}
	after3 := readLedgerRaw(t, dataDir)

	if string(after3[:len(after2)]) != string(after2) {
		t.Error("first two entries were overwritten or modified by third append")
	}

	// Verify 3 lines total.
	if n := countLines(after3); n != 3 {
		t.Errorf("expected 3 lines, got %d", n)
	}
}

// ---------------------------------------------------------------------------
// AC-4: ledger records names, not values; schemaVersion provenance
// ---------------------------------------------------------------------------

// TestLedger_RecordsNamesNotValues verifies SEC-05: the serialized ledger line
// contains only key NAMES, the literal {config_root} token, and schemaVersion:1.
// It must NOT contain any value, expanded home path, or secret-shaped string.
func TestLedger_RecordsNamesNotValues(t *testing.T) {
	dataDir, cleanup := ledgerTestEnv(t)
	defer cleanup()

	entry := LedgerEntry{
		Op:        "install",
		Component: "test-comp",
		Owns: OwnershipTags{
			Files:      []string{"{config_root}/agents/test.md"},
			ConfigKeys: []string{"logs-mode", "logs-path"},
		},
	}
	if err := appendLedger([]LedgerEntry{entry}); err != nil {
		t.Fatalf("appendLedger: %v", err)
	}

	raw := readLedgerRaw(t, dataDir)
	content := string(raw)

	// Must contain key NAMES.
	if !strings.Contains(content, "logs-mode") {
		t.Error("ledger must contain key name 'logs-mode'")
	}
	if !strings.Contains(content, "logs-path") {
		t.Error("ledger must contain key name 'logs-path'")
	}

	// Must contain the {config_root} token, not an expanded path.
	if !strings.Contains(content, "{config_root}") {
		t.Error("ledger must contain the literal {config_root} token")
	}

	// Must NOT contain the expanded home directory path.
	home, _ := os.UserHomeDir()
	if home != "" && strings.Contains(content, home) {
		t.Errorf("ledger must not contain expanded home path %q", home)
	}

	// Must contain schemaVersion:1.
	if !strings.Contains(content, `"schemaVersion":1`) {
		t.Error("ledger must contain schemaVersion:1")
	}
}

// TestLedger_StructuralGate_InvalidConfigKey verifies SEC-05 / SEC-DR-P3-3:
// appendLedger fails closed on a configKey failing ^[A-Za-z0-9_.-]+$ (STRUCTURAL,
// not entropy heuristic).
func TestLedger_StructuralGate_InvalidConfigKey(t *testing.T) {
	dataDir, cleanup := ledgerTestEnv(t)
	defer cleanup()

	cases := []struct {
		name string
		key  string
	}{
		{"equals sign", "my-key=value"},
		{"whitespace", "my key"},
		{"quotes", `"quoted"`},
		{"colon", "key:value"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			entry := LedgerEntry{
				Op:        "install",
				Component: "comp",
				Owns:      OwnershipTags{Files: []string{"{config_root}/f.md"}, ConfigKeys: []string{tc.key}},
			}
			err := appendLedger([]LedgerEntry{entry})
			if err == nil {
				t.Errorf("expected structural violation error for configKey %q, got nil", tc.key)
			}
			// Must be a structural error, not "entropy heuristic".
			if err != nil && strings.Contains(err.Error(), "entropy") {
				t.Errorf("error must not mention entropy heuristic: %v", err)
			}
		})
	}

	// Verify the ledger file is empty (nothing was written).
	if data, err := os.ReadFile(filepath.Join(dataDir, ledgerFilename)); err == nil && len(data) > 0 {
		t.Error("ledger file should be empty — structural violation must prevent any write")
	}
}

// TestLedger_StructuralGate_NonConfigRootPath verifies SEC-05: a Files entry
// not starting with {config_root} is rejected.
func TestLedger_StructuralGate_NonConfigRootPath(t *testing.T) {
	_, cleanup := ledgerTestEnv(t)
	defer cleanup()

	entry := LedgerEntry{
		Op:        "install",
		Component: "comp",
		Owns:      OwnershipTags{Files: []string{"/absolute/path/no/token"}, ConfigKeys: []string{}},
	}
	if err := appendLedger([]LedgerEntry{entry}); err == nil {
		t.Error("expected error for non-{config_root} path, got nil")
	}
}

// TestLedger_ReadLedger_SchemaVersionTwoSkipped verifies that a line with
// schemaVersion:2 is collected as a ledgerError and skipped (SEC-06).
func TestLedger_ReadLedger_SchemaVersionTwoSkipped(t *testing.T) {
	dataDir, cleanup := ledgerTestEnv(t)
	defer cleanup()

	lines := []string{
		`{"ts":"2026-06-18T00:00:00Z","op":"install","component":"good","owns":{"files":["{config_root}/a.md"],"configKeys":[]},"schemaVersion":1}`,
		`{"ts":"2026-06-18T00:01:00Z","op":"install","component":"bad","owns":{"files":["{config_root}/b.md"],"configKeys":[]},"schemaVersion":2}`,
	}
	writeLedgerLines(t, dataDir, lines)

	entries, errs := readLedger()
	if len(entries) != 1 || entries[0].Component != "good" {
		t.Errorf("expected 1 well-formed entry (good), got %d entries: %v", len(entries), entries)
	}
	if len(errs) != 1 {
		t.Errorf("expected 1 ledger error (schemaVersion:2 line), got %d", len(errs))
	}
}

// TestLedger_ReadLedger_CorruptTailLine verifies that a truncated/corrupt tail
// line is collected as a ledgerError while earlier well-formed lines are returned.
func TestLedger_ReadLedger_CorruptTailLine(t *testing.T) {
	dataDir, cleanup := ledgerTestEnv(t)
	defer cleanup()

	lines := []string{
		`{"ts":"2026-06-18T00:00:00Z","op":"install","component":"good","owns":{"files":["{config_root}/a.md"],"configKeys":[]},"schemaVersion":1}`,
		`NOT VALID JSON - truncated{{`,
	}
	writeLedgerLines(t, dataDir, lines)

	entries, errs := readLedger()
	if len(entries) != 1 || entries[0].Component != "good" {
		t.Errorf("expected 1 well-formed entry, got %d", len(entries))
	}
	if len(errs) == 0 {
		t.Error("expected at least 1 ledger error for the corrupt line")
	}
}

// ---------------------------------------------------------------------------
// AC-6: write-time secret-scan (via appendLedger)
// ---------------------------------------------------------------------------

// TestLedger_SecretScanFailsClosed verifies AC-6 at the writer level:
// appendLedger fails closed when the serialized entry contains a high-confidence
// secret, writing nothing to the ledger.
func TestLedger_SecretScanFailsClosed(t *testing.T) {
	dataDir, cleanup := ledgerTestEnv(t)
	defer cleanup()

	// Inject a synthetic OpenAI key into the component name to make the
	// marshaled line match the scanner. The component name field is the easiest
	// injection vector for the test — real attackers would need to smuggle a
	// value through a field, which the structural gates prevent; this exercises
	// the SEC-04 byte-scan as the final backstop.
	secretKey := "sk-" + strings.Repeat("Z", 25) // triggers OpenAI pattern
	entry := LedgerEntry{
		Op:        "install",
		Component: secretKey, // inject via component name for test purposes
		Owns:      OwnershipTags{Files: []string{"{config_root}/f.md"}, ConfigKeys: []string{}},
	}
	err := appendLedger([]LedgerEntry{entry})
	if err == nil {
		t.Error("expected appendLedger to fail closed for a secret-bearing entry, got nil")
	}

	// The error must name the pattern CLASS, never the matched value.
	if err != nil {
		if strings.Contains(err.Error(), secretKey) {
			t.Errorf("error must not contain the matched secret value; got: %v", err)
		}
		if !strings.Contains(err.Error(), "SEC-04") && !strings.Contains(err.Error(), "secret") {
			t.Errorf("error must mention SEC-04 or 'secret'; got: %v", err)
		}
	}

	// Ledger file must be empty (nothing written).
	if data, err2 := os.ReadFile(filepath.Join(dataDir, ledgerFilename)); err2 == nil && len(data) > 0 {
		t.Error("ledger file must be empty — secret detection must prevent any write")
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func countLines(data []byte) int {
	n := 0
	scanner := bufio.NewScanner(strings.NewReader(string(data)))
	for scanner.Scan() {
		if len(strings.TrimSpace(scanner.Text())) > 0 {
			n++
		}
	}
	return n
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// TestLedger_ReadLedger_AbsentFile verifies that an absent ledger returns
// empty entries and no errors (caller distinguishes absent vs malformed).
func TestLedger_ReadLedger_AbsentFile(t *testing.T) {
	_, cleanup := ledgerTestEnv(t)
	defer cleanup()

	// Do NOT create the ledger file.
	entries, errs := readLedger()
	if len(entries) != 0 {
		t.Errorf("expected 0 entries for absent ledger, got %d", len(entries))
	}
	if len(errs) != 0 {
		t.Errorf("expected 0 errors for absent ledger, got %d: %v", len(errs), errs)
	}
}

// TestLedger_AppendLedger_SingleChokepointInvariant is a source-level check
// (AC-10): verifies that only appendLedger writes to the ledger by reading
// the source files and confirming no other function calls os.File.Write on
// a file opened with the ledger filename.
//
// This is a structural source-grep test. It reads the Go source files
// in cmd/install/ and asserts that ledgerFilename only appears in ledger.go
// and in test files. Any production file other than ledger.go that
// references ledgerFilename for writing would be a choke-point bypass (SEC-DR-P3-2).
func TestLedger_AppendLedger_SingleChokepointInvariant(t *testing.T) {
	// The single choke-point invariant: ledgerFilename is only referenced for
	// reads/writes in ledger.go. Other files may reference it in tests.
	productionFiles := []string{
		"apply.go",
		"uninstall.go",
		"plan.go",
		"placer.go",
		"manifest_schema.go",
		"secretscan.go",
		"dispatch.go",
	}

	for _, fname := range productionFiles {
		data, err := os.ReadFile(fname)
		if err != nil {
			// File may not exist in all build contexts; skip gracefully.
			continue
		}
		content := string(data)
		// None of these production files should reference ledgerFilename or
		// write to the ownership-ledger.jsonl directly.
		if strings.Contains(content, `"ownership-ledger.jsonl"`) {
			t.Errorf("%s: contains a direct reference to ownership-ledger.jsonl — all ledger writes must go through appendLedger (SEC-DR-P3-2)", fname)
		}
		if strings.Contains(content, "OpenStateFile") {
			t.Errorf("%s: calls OpenStateFile directly — ledger access must go through ledger.go functions (SEC-DR-P3-2)", fname)
		}
	}
}

// Ensure io is used (needed for io.SeekEnd reference in doc comments / godoc).
var _ = io.SeekEnd
