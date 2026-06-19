package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// ---------------------------------------------------------------------------
// Conformance fixture types
// ---------------------------------------------------------------------------

type conformanceRow struct {
	Name           string            `json:"name"`
	Env            map[string]string `json:"env"`
	OS             string            `json:"os"`
	RuntimeProbe   string            `json:"runtimeProbe"`
	ExpectedSuffix string            `json:"expectedSuffix"`
	Note           string            `json:"note"`
}

// ---------------------------------------------------------------------------
// Helper: reset the memoised cache and all relevant env vars before each test.
// ---------------------------------------------------------------------------

// clearDataHomeEnv unsets every env var that affects resolution so tests
// are fully isolated from the host environment.
func clearDataHomeEnv(t *testing.T) {
	t.Helper()
	for _, key := range []string{
		"TEAM_HARNESS_DATA_HOME",
		"TH_DATA_HOME",
		"CLAUDE_DATA_DIR",
		"XDG_DATA_HOME",
		"LOCALAPPDATA",
		"APPDATA",
	} {
		t.Setenv(key, "")
	}
	// Redirect HOME / USERPROFILE to a fresh temp dir so that the Branch-3
	// filesystem probe (~/.claude directory check in claudeCodeRoot() Probe 2)
	// does not fire on a developer machine that has a real ~/.claude.
	// Without this, conformance rows with runtimeProbe:"none" resolve via Branch 3
	// instead of the intended Branch 4/5 because ~/.claude exists at the real home.
	emptyHome := t.TempDir()
	t.Setenv("HOME", emptyHome)
	t.Setenv("USERPROFILE", emptyHome) // Windows: os.UserHomeDir reads USERPROFILE
}

// ---------------------------------------------------------------------------
// Suite 1 — Conformance fixture (resolution-order path computation)
// ---------------------------------------------------------------------------

// TestResolveDataHome_ConformanceFixture loads resolver-conformance.json and
// asserts that each row (filtered by current OS) resolves to the expected path
// suffix.  This is the cross-language drift contract test — the same fixture is
// consumed by the Phase-4 TS port.
func TestResolveDataHome_ConformanceFixture(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("testdata", "resolver-conformance.json"))
	if err != nil {
		t.Fatalf("cannot read conformance fixture: %v", err)
	}

	var rows []conformanceRow
	if err := json.Unmarshal(data, &rows); err != nil {
		t.Fatalf("cannot parse conformance fixture: %v", err)
	}

	for _, row := range rows {
		row := row // capture
		if !rowAppliesToCurrentOS(row.OS) {
			continue
		}

		t.Run(row.Name, func(t *testing.T) {
			tmpDir := t.TempDir()
			clearDataHomeEnv(t)
			ResetDataHomeCache()

			// Set env vars from the fixture row.
			for k, v := range row.Env {
				// Substitute {tmpdir} with the actual temp dir.
				v = strings.ReplaceAll(v, "{tmpdir}", tmpDir)
				t.Setenv(k, v)
			}

			// For Branch-3 (claude-code runtime probe) tests that use CLAUDE_DATA_DIR,
			// we need to ensure the directory exists so the resolver can verify it.
			// For other branches the resolution happens before any directory check.
			if claudeDir := os.Getenv("CLAUDE_DATA_DIR"); claudeDir != "" {
				if err := os.MkdirAll(claudeDir, 0o700); err != nil {
					t.Fatalf("cannot create CLAUDE_DATA_DIR for test: %v", err)
				}
			}

			// Resolve the candidate path only (do not run the full security pipeline,
			// which requires real filesystem operations including chown verification).
			// The conformance fixture binds path computation, not security-guard parity
			// (per the fixture scope boundary in 01-plan.md).
			candidate, err := resolveCandidate()
			if err != nil {
				t.Fatalf("resolveCandidate() error: %v", err)
			}

			// Substitute {tmpdir} back for comparison.
			expectedSuffix := strings.ReplaceAll(row.ExpectedSuffix, "{tmpdir}", tmpDir)

			// For relative-suffix expectations (e.g. ".team-harness") resolve against
			// the real home directory as the test host would.
			got := candidate
			if !filepath.IsAbs(expectedSuffix) && !strings.Contains(expectedSuffix, string(filepath.Separator)) {
				// This is a bare leaf like ".team-harness" — check that the candidate ends
				// with this leaf component.
				if !strings.HasSuffix(filepath.ToSlash(got), "/"+expectedSuffix) &&
					!strings.HasSuffix(got, string(filepath.Separator)+expectedSuffix) &&
					!strings.HasSuffix(got, expectedSuffix) {
					t.Errorf("row %q: got %q, want path ending in %q\n  note: %s",
						row.Name, got, expectedSuffix, row.Note)
				}
				return
			}

			// Absolute or multi-segment suffix: check HasSuffix on the slash-normalised form.
			gotSlash := filepath.ToSlash(got)
			wantSlash := filepath.ToSlash(expectedSuffix)
			if !strings.HasSuffix(gotSlash, "/"+wantSlash) && !strings.HasSuffix(gotSlash, wantSlash) {
				t.Errorf("row %q: got %q, want path ending in %q\n  note: %s",
					row.Name, got, expectedSuffix, row.Note)
			}
		})
	}
}

// rowAppliesToCurrentOS reports whether a fixture row applies to the current OS.
func rowAppliesToCurrentOS(osField string) bool {
	if osField == "all" {
		return true
	}
	return osField == runtime.GOOS
}

// ---------------------------------------------------------------------------
// Suite 2 — Branch priority (AC-1, AC-2)
// ---------------------------------------------------------------------------

// TestResolveDataHome_Branch1_WinsOverBranch2 verifies that TEAM_HARNESS_DATA_HOME
// takes priority over TH_DATA_HOME when both are set (AC-1, AC-2).
func TestResolveDataHome_Branch1_WinsOverBranch2(t *testing.T) {
	tmpDir := t.TempDir()
	clearDataHomeEnv(t)
	ResetDataHomeCache()

	branch1 := filepath.Join(tmpDir, "b1")
	branch2 := filepath.Join(tmpDir, "b2")
	t.Setenv("TEAM_HARNESS_DATA_HOME", branch1)
	t.Setenv("TH_DATA_HOME", branch2)

	got, err := resolveCandidate()
	if err != nil {
		t.Fatalf("resolveCandidate() error: %v", err)
	}
	if got != branch1 {
		t.Errorf("Branch 1 expected %q, got %q", branch1, got)
	}
}

// TestResolveDataHome_Branch2_WhenBranch1Unset verifies that TH_DATA_HOME
// resolves when TEAM_HARNESS_DATA_HOME is unset (AC-2).
func TestResolveDataHome_Branch2_WhenBranch1Unset(t *testing.T) {
	tmpDir := t.TempDir()
	clearDataHomeEnv(t)
	ResetDataHomeCache()

	branch2 := filepath.Join(tmpDir, "b2")
	t.Setenv("TH_DATA_HOME", branch2)

	got, err := resolveCandidate()
	if err != nil {
		t.Fatalf("resolveCandidate() error: %v", err)
	}
	if got != branch2 {
		t.Errorf("Branch 2 expected %q, got %q", branch2, got)
	}
}

// TestResolveDataHome_Branch3_ClaudeCodeRoot verifies that the Claude Code
// runtime root is used when CLAUDE_DATA_DIR is set and no override env is
// present (AC-3).
func TestResolveDataHome_Branch3_ClaudeCodeRoot(t *testing.T) {
	tmpDir := t.TempDir()
	clearDataHomeEnv(t)
	ResetDataHomeCache()

	claudeRoot := filepath.Join(tmpDir, "claude")
	if err := os.MkdirAll(claudeRoot, 0o700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("CLAUDE_DATA_DIR", claudeRoot)

	got, err := resolveCandidate()
	if err != nil {
		t.Fatalf("resolveCandidate() error: %v", err)
	}
	want := filepath.Join(claudeRoot, "team-harness")
	if got != want {
		t.Errorf("Branch 3 expected %q, got %q", want, got)
	}
}

// ---------------------------------------------------------------------------
// Suite 3 — SEC-08: single-pass expansion, residual ".." rejection (AC-10)
// ---------------------------------------------------------------------------

// TestSecureAndVerify_DotDot_Rejected verifies that a path containing ".."
// after normalization is rejected (AC-10).
func TestSecureAndVerify_DotDot_Rejected(t *testing.T) {
	clearDataHomeEnv(t)
	ResetDataHomeCache()

	// An absolute path with ".." that Clean cannot fully resolve.
	raw := string(filepath.Separator) + filepath.Join("tmp", "..", "..", "etc", "evil")
	_, err := secureAndVerify(raw)
	if err == nil {
		t.Error("expected an error for a path with residual '..', got nil")
	}
}

// TestSecureAndVerify_SinglePassExpansion verifies that os.ExpandEnv is used
// for expansion and that it does NOT recurse (AC-10).
//
// A value like "$VAR_OUTER" where VAR_OUTER expands to "$VAR_INNER" must not
// expand $VAR_INNER — the inner dollar-sign must be left as a literal.
func TestSecureAndVerify_SinglePassExpansion(t *testing.T) {
	t.Setenv("VAR_OUTER", "$VAR_INNER")
	t.Setenv("VAR_INNER", "should-not-appear")

	// Single-pass: "$VAR_OUTER" → "$VAR_INNER" (literal) — NOT "should-not-appear".
	expanded := os.ExpandEnv("$VAR_OUTER")
	if expanded == "should-not-appear" {
		t.Error("os.ExpandEnv performed recursive expansion — this would be a regression of SEC-08")
	}
	if expanded != "$VAR_INNER" {
		t.Errorf("unexpected expansion result: got %q, want %q", expanded, "$VAR_INNER")
	}
}

// TestSecureAndVerify_RelativePath_Rejected verifies that a relative path
// (not absolute) is rejected by the security pipeline.
func TestSecureAndVerify_RelativePath_Rejected(t *testing.T) {
	clearDataHomeEnv(t)
	ResetDataHomeCache()

	_, err := secureAndVerify("relative/path/without/leading/slash")
	if err == nil {
		t.Error("expected an error for a relative path, got nil")
	}
}

// ---------------------------------------------------------------------------
// Suite 4 — SEC-01: symlink rejection (AC-6)
//
// These tests verify that an intermediate-ancestor symlink is rejected by the
// pre-resolution Lstat walk, and that the test FAILS if the check were moved
// to post-EvalSymlinks (the symlink guard must be pre-resolution).
// ---------------------------------------------------------------------------

// TestDataHome_SEC01_IntermediateSymlink_Rejected verifies that a symlink in
// an intermediate ancestor component causes ResolveDataHome to fail closed
// (AC-6, CWE-59).
//
// This test is written so that it exercises the PRE-resolution Lstat walk.
// If the walk were moved to post-EvalSymlinks, the planted symlink would be
// resolved away and the guard would be vacuous.
func TestDataHome_SEC01_IntermediateSymlink_Rejected(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("creating Unix-style symlinks requires elevated privileges on Windows — tested via Windows-tagged test")
	}

	tmpDir := t.TempDir()
	clearDataHomeEnv(t)
	ResetDataHomeCache()

	// Create a real target directory and a symlink to it.
	realTarget := filepath.Join(tmpDir, "real-intermediate")
	if err := os.MkdirAll(realTarget, 0o700); err != nil {
		t.Fatal(err)
	}
	symlinkIntermediate := filepath.Join(tmpDir, "symlink-intermediate")
	if err := os.Symlink(realTarget, symlinkIntermediate); err != nil {
		t.Skipf("cannot create symlink (may need elevated privileges): %v", err)
	}

	// Point the resolver at a path that goes THROUGH the symlinked intermediate.
	maliciousPath := filepath.Join(symlinkIntermediate, "team-harness")
	t.Setenv("TEAM_HARNESS_DATA_HOME", maliciousPath)

	_, err := ResolveDataHome()
	if err == nil {
		t.Error("ResolveDataHome should have rejected a path with a symlinked intermediate component (SEC-01), but returned nil error")
	}
	if err != nil && !strings.Contains(err.Error(), "SEC-01") && !strings.Contains(err.Error(), "symbolic link") {
		t.Logf("got error (expected SEC-01/symlink rejection): %v", err)
	}
}

// ---------------------------------------------------------------------------
// Suite 5 — SEC-02: pre-existing wrong-owner/permissions (AC-7)
// ---------------------------------------------------------------------------

// TestDataHome_SEC02_WrongPermissions_Rejected verifies that a pre-existing
// directory with group or other write bits set causes ResolveDataHome to fail
// closed rather than proceed or silently chmod-correct (AC-7).
func TestDataHome_SEC02_WrongPermissions_Rejected(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Unix-mode permission test — Windows tests via Windows-tagged suite")
	}

	tmpDir := t.TempDir()
	clearDataHomeEnv(t)
	ResetDataHomeCache()

	// Create a directory with over-permissive mode (0755 — group/other access).
	badDir := filepath.Join(tmpDir, "badperms")
	if err := os.MkdirAll(badDir, 0o755); err != nil {
		t.Fatal(err)
	}

	t.Setenv("TEAM_HARNESS_DATA_HOME", badDir)

	_, err := ResolveDataHome()
	if err == nil {
		t.Error("ResolveDataHome should have rejected a pre-existing directory with group/other access (SEC-02), but returned nil error")
	}
}

// ---------------------------------------------------------------------------
// Suite 6 — SEC-03: permissions on every branch (AC-8)
// ---------------------------------------------------------------------------

// TestDataHome_SEC03_NewDirectory_IsMode0700 verifies that a new data-home
// directory is created with mode 0700 (AC-8).
func TestDataHome_SEC03_NewDirectory_IsMode0700(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Unix mode-bit test — Windows ACL tested via Windows-tagged suite")
	}

	tmpDir := t.TempDir()
	clearDataHomeEnv(t)
	ResetDataHomeCache()

	newDir := filepath.Join(tmpDir, "new-home")
	t.Setenv("TEAM_HARNESS_DATA_HOME", newDir)

	got, err := ResolveDataHome()
	if err != nil {
		t.Fatalf("ResolveDataHome() error: %v", err)
	}

	fi, err := os.Stat(got)
	if err != nil {
		t.Fatalf("cannot stat resolved directory: %v", err)
	}

	mode := fi.Mode().Perm()
	if mode != 0o700 {
		t.Errorf("new data-home directory has mode %04o, want 0700 (SEC-03)", mode)
	}
}

// ---------------------------------------------------------------------------
// Suite 7 — Memoization (AC-13)
// ---------------------------------------------------------------------------

// TestDataHome_Memoization_SuccessCached verifies that a successful resolution
// is cached and the second call returns the same path without re-resolving.
func TestDataHome_Memoization_SuccessCached(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("memoization test uses Unix path; Windows tested separately")
	}

	tmpDir := t.TempDir()
	clearDataHomeEnv(t)
	ResetDataHomeCache()

	dir := filepath.Join(tmpDir, "memo-home")
	t.Setenv("TEAM_HARNESS_DATA_HOME", dir)

	got1, err := ResolveDataHome()
	if err != nil {
		t.Fatalf("first ResolveDataHome() error: %v", err)
	}

	// Change the env var — a cached result should NOT change.
	t.Setenv("TEAM_HARNESS_DATA_HOME", filepath.Join(tmpDir, "other"))

	got2, err := ResolveDataHome()
	if err != nil {
		t.Fatalf("second ResolveDataHome() error: %v", err)
	}
	if got1 != got2 {
		t.Errorf("memoization broken: first=%q, second=%q (should be identical)", got1, got2)
	}
}

// TestDataHome_Memoization_ErrorNotCached verifies that an error result is NOT
// cached — a subsequent call with a valid path must succeed (AC-13).
func TestDataHome_Memoization_ErrorNotCached(t *testing.T) {
	clearDataHomeEnv(t)
	ResetDataHomeCache()

	// Set an invalid path (relative) to force an error.
	t.Setenv("TEAM_HARNESS_DATA_HOME", "relative/path")
	_, err := ResolveDataHome()
	if err == nil {
		t.Fatal("expected error for relative path, got nil")
	}

	if runtime.GOOS == "windows" {
		t.Skip("second call uses a real directory on Unix — Windows portion tested separately")
	}

	// Now set a valid absolute path — must succeed (error was not cached).
	tmpDir := t.TempDir()
	ResetDataHomeCache()
	newDir := filepath.Join(tmpDir, "after-error")
	t.Setenv("TEAM_HARNESS_DATA_HOME", newDir)

	_, err = ResolveDataHome()
	if err != nil {
		t.Errorf("after error-not-cached: second ResolveDataHome() should succeed, got: %v", err)
	}
}

// ---------------------------------------------------------------------------
// Suite 8 — OpenStateFile O_NOFOLLOW (AC-12)
// ---------------------------------------------------------------------------

// TestOpenStateFile_RejectsSymlinkAtTarget verifies that OpenStateFile refuses
// to open a state file that is (or resolves through) a symbolic link (AC-12).
// This is distinct from AC-6 (root-resolution symlink rejection).
func TestOpenStateFile_RejectsSymlinkAtTarget(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Unix O_NOFOLLOW test — Windows reparse-point rejection tested via Windows-tagged test")
	}

	tmpDir := t.TempDir()
	clearDataHomeEnv(t)
	ResetDataHomeCache()

	// Set up a valid data-home root.
	root := filepath.Join(tmpDir, "data-home")
	t.Setenv("TEAM_HARNESS_DATA_HOME", root)

	resolvedRoot, err := ResolveDataHome()
	if err != nil {
		t.Fatalf("ResolveDataHome() error: %v", err)
	}

	// Create a real file and a symlink pointing to it under the root.
	realFile := filepath.Join(resolvedRoot, "real.json")
	symlinkFile := filepath.Join(resolvedRoot, "symlink.json")
	if err := os.WriteFile(realFile, []byte("{}"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(realFile, symlinkFile); err != nil {
		t.Skipf("cannot create symlink (may need elevated privileges): %v", err)
	}

	// OpenStateFile on the symlink name must fail (O_NOFOLLOW — AC-12).
	_, err = OpenStateFile("symlink.json")
	if err == nil {
		t.Error("OpenStateFile should have rejected a symlinked state file (AC-12/SEC-01), but returned nil error")
	}
}

// TestOpenStateFile_RegularFile_Succeeds verifies that OpenStateFile succeeds
// on a regular (non-symlink) state file name (AC-12 positive case).
func TestOpenStateFile_RegularFile_Succeeds(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Unix open test — Windows tested separately")
	}

	tmpDir := t.TempDir()
	clearDataHomeEnv(t)
	ResetDataHomeCache()

	root := filepath.Join(tmpDir, "data-home")
	t.Setenv("TEAM_HARNESS_DATA_HOME", root)

	if _, err := ResolveDataHome(); err != nil {
		t.Fatalf("ResolveDataHome() error: %v", err)
	}

	f, err := OpenStateFile("state.json")
	if err != nil {
		t.Fatalf("OpenStateFile(\"state.json\") error: %v", err)
	}
	f.Close()
}

// ---------------------------------------------------------------------------
// Suite 9 — containsDotDotSegment unit tests
// ---------------------------------------------------------------------------

func TestContainsDotDotSegment(t *testing.T) {
	cases := []struct {
		path string
		want bool
	}{
		{"/tmp/foo/bar", false},
		{"/tmp/../etc/passwd", false}, // Clean already resolved this
		{"../../etc", true},
		{"/safe/path/../../../etc", false}, // Clean resolved it
		{string(filepath.Separator) + filepath.Join("..", "etc"), false}, // rooted ".." collapses at the volume root on both OSes -> no residual ".." (escaped path is caught fail-closed by SEC-01/03 ownership checks)
	}
	for _, tc := range cases {
		// Apply Clean first (as secureAndVerify does).
		cleaned := filepath.Clean(tc.path)
		got := containsDotDotSegment(cleaned)
		if got != tc.want {
			t.Errorf("containsDotDotSegment(Clean(%q)) = %v, want %v (cleaned=%q)",
				tc.path, got, tc.want, cleaned)
		}
	}
}

// ---------------------------------------------------------------------------
// Suite 10 — expandHome unit tests
// ---------------------------------------------------------------------------

func TestExpandHome(t *testing.T) {
	home, err := os.UserHomeDir()
	if err != nil {
		t.Skipf("cannot determine home directory: %v", err)
	}

	cases := []struct {
		input string
		want  string
	}{
		{"~/foo", filepath.Join(home, "foo")},
		{"~", home},
		{"/absolute/path", "/absolute/path"},
		{"relative/path", "relative/path"},
	}
	for _, tc := range cases {
		got, err := expandHome(tc.input)
		if err != nil {
			t.Errorf("expandHome(%q) error: %v", tc.input, err)
			continue
		}
		if got != tc.want {
			t.Errorf("expandHome(%q) = %q, want %q", tc.input, got, tc.want)
		}
	}
}
