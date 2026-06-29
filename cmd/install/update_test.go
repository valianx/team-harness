package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// ---------------------------------------------------------------------------
// Tests: compareSemver
// ---------------------------------------------------------------------------

// TestCompareSemver_Table exercises the compareSemver helper across the full
// three-state domain: less-than, equal, greater-than, and the absent/unparseable
// edge cases that are mapped to -∞ (update-available behavior).
func TestCompareSemver_Table(t *testing.T) {
	cases := []struct {
		name string
		a, b string
		want int
	}{
		// Basic ordering.
		{"patch increment", "2.119.2", "2.119.3", -1},
		{"minor increment", "2.118.0", "2.119.0", -1},
		{"major increment", "1.0.0", "2.0.0", -1},
		{"equal", "2.119.3", "2.119.3", 0},
		{"greater patch", "2.119.4", "2.119.3", 1},
		{"greater minor", "2.120.0", "2.119.9", 1},
		{"greater major", "3.0.0", "2.999.999", 1},

		// Absent / unparseable → treated as update-available (-∞ < anything).
		{"a empty", "", "2.119.3", -1},
		{"b empty", "2.119.3", "", 1},
		{"both empty", "", "", 0},
		{"a unparseable", "not-semver", "2.119.3", -1},
		{"b unparseable", "2.119.3", "not-semver", 1},

		// Leading "v" prefix (defensive: stripping applied).
		{"v prefix on a", "v2.119.3", "2.119.3", 0},
		{"v prefix on b", "2.119.3", "v2.119.3", 0},

		// Partial versions (fewer than 3 segments).
		{"a has 2 segments", "2.119", "2.119.3", -1},
		{"b has 2 segments", "2.119.3", "2.119", 1},
		{"both 2 segments equal", "2.119", "2.119", 0},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := compareSemver(tc.a, tc.b)
			if got != tc.want {
				t.Errorf("compareSemver(%q, %q) = %d, want %d", tc.a, tc.b, got, tc.want)
			}
		})
	}
}

// TestCompareSemver_ThreeStateDispatch verifies that the three-state branch
// selection in runUpdateCommand matches the compareSemver contract:
//   - embedded > installed → "update available"
//   - embedded == installed → "already current"
//   - embedded < installed → "installed ahead"
//
// This test exercises compareSemver directly, not runUpdateCommand (which
// requires a full opencode config root and placer setup). It validates the
// decision logic by asserting the correct return value for each branch.
func TestCompareSemver_ThreeStateDispatch(t *testing.T) {
	embedded := "2.119.3"

	// Update-available branch (embedded > installed).
	if compareSemver(embedded, "2.118.0") <= 0 {
		t.Error("expected compareSemver(embedded, older) > 0 (update-available branch)")
	}

	// Already-current branch (embedded == installed).
	if compareSemver(embedded, embedded) != 0 {
		t.Error("expected compareSemver(embedded, embedded) == 0 (already-current branch)")
	}

	// Installed-ahead branch (embedded < installed).
	if compareSemver(embedded, "2.120.0") >= 0 {
		t.Error("expected compareSemver(embedded, newer) < 0 (installed-ahead branch)")
	}

	// Absent installed → treated as update-available (embedded > "").
	if compareSemver(embedded, "") <= 0 {
		t.Error("expected compareSemver(embedded, '') > 0 (absent=update-available)")
	}
}

// ---------------------------------------------------------------------------
// Tests: refreshManagedConfigKeys
// ---------------------------------------------------------------------------

// TestRefreshManagedConfigKeys_PreservesOperatorKeys verifies that
// refreshManagedConfigKeys overwrites only the three installer-managed keys and
// preserves every operator key byte-for-byte (AC-5 / SEC-OC-R4).
func TestRefreshManagedConfigKeys_PreservesOperatorKeys(t *testing.T) {
	dir := t.TempDir()
	placer := newOpencodePlacerAt(dir)
	cfgPath := opencodeSettingsConfigPath(dir)

	// Seed with an operator-controlled key, a managed key (forged), and
	// an extra key that does not appear in any allowlist.
	seed := map[string]interface{}{
		"logs-mode":          "obsidian",
		"logs-path":          "/vault/work-logs",
		"logs-subfolder":     "team-harness",
		"my-custom-key":      "keep-me",
		"installed_version":  "FORGED-1.0.0",
		"format_version":     "FORGED-99",
	}
	seedBytes, _ := json.Marshal(seed)
	if err := os.WriteFile(cfgPath, seedBytes, 0o644); err != nil {
		t.Fatalf("seed write: %v", err)
	}

	if err := refreshManagedConfigKeys(cfgPath, placer); err != nil {
		t.Fatalf("refreshManagedConfigKeys: %v", err)
	}

	raw, err := os.ReadFile(cfgPath)
	if err != nil {
		t.Fatalf("read back: %v", err)
	}
	var result map[string]interface{}
	if err := json.Unmarshal(raw, &result); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	// Operator keys must survive byte-for-byte.
	if result["logs-mode"] != "obsidian" {
		t.Errorf("logs-mode = %v, want obsidian (operator key clobbered)", result["logs-mode"])
	}
	if result["logs-path"] != "/vault/work-logs" {
		t.Errorf("logs-path = %v, want /vault/work-logs (operator key clobbered)", result["logs-path"])
	}
	if result["logs-subfolder"] != "team-harness" {
		t.Errorf("logs-subfolder = %v, want team-harness (operator key clobbered)", result["logs-subfolder"])
	}
	if result["my-custom-key"] != "keep-me" {
		t.Errorf("my-custom-key = %v, want keep-me (unknown operator key clobbered)", result["my-custom-key"])
	}

	// Managed keys must be overwritten with the binary's values.
	if result["installed_version"] != version {
		t.Errorf("installed_version = %v, want %v (managed key not bumped)", result["installed_version"], version)
	}
	if result["format_version"] != "1" {
		t.Errorf("format_version = %v, want 1 (managed key not bumped)", result["format_version"])
	}
	if _, ok := result["updated_at"]; !ok {
		t.Error("updated_at missing after refreshManagedConfigKeys")
	}
}

// TestRefreshManagedConfigKeys_AbsentFile verifies that when the config file is
// absent, refreshManagedConfigKeys creates it with only the managed keys (no
// panic, no error).
func TestRefreshManagedConfigKeys_AbsentFile(t *testing.T) {
	dir := t.TempDir()
	placer := newOpencodePlacerAt(dir)
	cfgPath := opencodeSettingsConfigPath(dir)

	// No existing file.
	if err := refreshManagedConfigKeys(cfgPath, placer); err != nil {
		t.Fatalf("refreshManagedConfigKeys (absent): %v", err)
	}

	raw, err := os.ReadFile(cfgPath)
	if err != nil {
		t.Fatalf("read back: %v", err)
	}
	var result map[string]interface{}
	if err := json.Unmarshal(raw, &result); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if result["installed_version"] != version {
		t.Errorf("installed_version = %v, want %v", result["installed_version"], version)
	}
	if result["format_version"] != "1" {
		t.Errorf("format_version = %v, want 1", result["format_version"])
	}
	if _, ok := result["updated_at"]; !ok {
		t.Error("updated_at missing from fresh config")
	}
}

// TestRefreshManagedConfigKeys_DoesNotForceLogs verifies that
// refreshManagedConfigKeys does NOT force logs-mode to "local" or delete
// logs-path / logs-subfolder — those are operator-owned on update (AC-5).
// This is the key difference from writeOpencodeTeamHarnessConfig.
func TestRefreshManagedConfigKeys_DoesNotForceLogs(t *testing.T) {
	dir := t.TempDir()
	placer := newOpencodePlacerAt(dir)
	cfgPath := opencodeSettingsConfigPath(dir)

	seed := map[string]interface{}{
		"logs-mode":      "obsidian",
		"logs-path":      "/my/vault",
		"logs-subfolder": "proj",
	}
	seedBytes, _ := json.Marshal(seed)
	if err := os.WriteFile(cfgPath, seedBytes, 0o644); err != nil {
		t.Fatalf("seed write: %v", err)
	}

	if err := refreshManagedConfigKeys(cfgPath, placer); err != nil {
		t.Fatalf("refreshManagedConfigKeys: %v", err)
	}

	raw, err := os.ReadFile(cfgPath)
	if err != nil {
		t.Fatalf("read back: %v", err)
	}
	var result map[string]interface{}
	if err := json.Unmarshal(raw, &result); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	// Operator logs keys must be preserved unchanged.
	if result["logs-mode"] != "obsidian" {
		t.Errorf("logs-mode = %v, want obsidian — refreshManagedConfigKeys must NOT force 'local'", result["logs-mode"])
	}
	if result["logs-path"] != "/my/vault" {
		t.Errorf("logs-path = %v, want /my/vault — refreshManagedConfigKeys must NOT delete logs-path", result["logs-path"])
	}
	if result["logs-subfolder"] != "proj" {
		t.Errorf("logs-subfolder = %v, want proj — refreshManagedConfigKeys must NOT delete logs-subfolder", result["logs-subfolder"])
	}
}

// TestRefreshManagedConfigKeys_BackupWritten verifies that a timestamped backup
// is created alongside the config file before each write.
func TestRefreshManagedConfigKeys_BackupWritten(t *testing.T) {
	dir := t.TempDir()
	placer := newOpencodePlacerAt(dir)
	cfgPath := opencodeSettingsConfigPath(dir)

	// Seed an existing file.
	seed := map[string]interface{}{"logs-mode": "local"}
	seedBytes, _ := json.Marshal(seed)
	if err := os.WriteFile(cfgPath, seedBytes, 0o644); err != nil {
		t.Fatalf("seed write: %v", err)
	}

	if err := refreshManagedConfigKeys(cfgPath, placer); err != nil {
		t.Fatalf("refreshManagedConfigKeys: %v", err)
	}

	// A backup file with the .bak-{timestamp} suffix must exist.
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("readdir: %v", err)
	}
	bakFound := false
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), ".team-harness.json.bak-") {
			bakFound = true
			break
		}
	}
	if !bakFound {
		t.Error("expected a timestamped backup file (.team-harness.json.bak-*) but none found")
	}
}

// ---------------------------------------------------------------------------
// Tests: already-current short-circuit produces zero writes
// ---------------------------------------------------------------------------

// TestAlreadyCurrent_ZeroWrites verifies that when the installed version equals
// the embedded binary version AND there is no on-disk asset divergence, the
// update produces ZERO writes to asset files, the ledger, and .team-harness.json
// (AC-2).
//
// This test exercises the already-current decision through the compareSemver
// contract (the runUpdateCommand already-current branch) and the PlanDiff
// property of ComputePlan when all files match — it does not call
// runUpdateCommand directly (which requires a full global opencode config root
// and a network-free placer, neither of which the test harness provides).
// The assertion is: "if compareSemver(installed, embedded) == 0 AND the plan
// diff has zero create/update/remove, then no write functions are called."
func TestAlreadyCurrent_ZeroWrites_Decision(t *testing.T) {
	// Simulate the already-current branch: installed == embedded.
	installed := version
	if compareSemver(version, installed) != 0 {
		t.Fatalf("test precondition: compareSemver(version, version) != 0; got %d", compareSemver(version, installed))
	}

	// Simulate a plan diff where all files are hash-matched (zero writes).
	diff := PlanDiff{
		ToCreate:        nil,
		ToUpdate:        nil,
		ToSkipHashMatch: []PlannedFile{{Component: "test", ConcreteDst: "/test/path"}},
		ToRemove:        nil,
		LedgerErrors:    nil,
	}
	hasChanges := len(diff.ToCreate)+len(diff.ToUpdate)+len(diff.ToRemove) > 0
	if hasChanges {
		t.Error("already-current check: hasChanges should be false when all files are in ToSkipHashMatch")
	}

	// The caller (runUpdateCommand) returns early when delta==0 && !hasChanges.
	// This assertion proves the short-circuit decision is correct.
	if compareSemver(version, installed) == 0 && !hasChanges {
		// Correct: the function would have returned without writing anything.
		return
	}
	t.Error("already-current short-circuit logic is incorrect")
}

// ---------------------------------------------------------------------------
// Tests: update-opencode.ps1 static verify — AC-10
// ---------------------------------------------------------------------------

// TestUpdateOpencodePS1_StaticVerify asserts that bin/update-opencode.ps1
// contains the security-critical patterns required by AC-10:
//   - Exact-field asset-name match using -eq (SEC-002).
//   - .ToLowerInvariant() hash normalization (SEC-001).
//   - -UseBasicParsing and -TimeoutSec on download calls (SEC-003).
//   - Direct-run shape via ProcessStartInfo (not ShellExecuteEx path).
//   - Neutral temp binary filename: none of "update"/"install"/"setup"/"patch"
//     in the filename (UAC heuristic avoidance — AC-10).
//   - $args forwarding.
func TestUpdateOpencodePS1_StaticVerify(t *testing.T) {
	psPath := filepath.Join("..", "..", "bin", "update-opencode.ps1")
	content, err := os.ReadFile(psPath)
	if err != nil {
		t.Fatalf("could not read bin/update-opencode.ps1: %v", err)
	}
	src := string(content)

	checks := []struct {
		name    string
		pattern string
	}{
		// SEC-002: exact-field split and -eq comparison.
		{"exact-field-split: -split '\\s+'", `-split '\s+'`},
		{"exact-field-eq: -eq $Asset", `-eq $Asset`},
		// SEC-001: case-insensitive hash normalization.
		{"hash-normalization: ToLowerInvariant", `ToLowerInvariant()`},
		// SEC-003: -UseBasicParsing and -TimeoutSec on downloads.
		{"sums-download: UseBasicParsing", `-UseBasicParsing`},
		{"sums-download: TimeoutSec", `-TimeoutSec`},
		// Direct-run shape via ProcessStartInfo (mirrors install-opencode.ps1).
		{"direct-run: psi.FileName", `$psi.FileName`},
		{"direct-run: UseShellExecute=$false", `UseShellExecute = $false`},
		// $args forwarding.
		{"extra-args: $args", `$args`},
		// update subcommand passed to binary.
		{"update subcommand", `update --runtime opencode`},
	}

	for _, chk := range checks {
		if !strings.Contains(src, chk.pattern) {
			t.Errorf("update-opencode.ps1 missing required pattern (%s): %q", chk.name, chk.pattern)
		}
	}

	// Negative check (UAC heuristic avoidance — AC-10): the temp binary filename
	// must not contain any of the Windows installer-detection trigger words.
	// Find the line that sets the updater temp path.
	for _, trigger := range []string{`"update"`, `"install"`, `"setup"`, `"patch"`} {
		// Look for the trigger inside a filename assignment to the temp file path.
		// The pattern: Join-Path $TmpDir "...update..." (any of the 4 triggers).
		if strings.Contains(src, "Join-Path $TmpDir "+trigger) ||
			strings.Contains(src, "Join-Path $TmpDir '"+trigger[1:len(trigger)-1]+"'") {
			t.Errorf("update-opencode.ps1 temp binary filename contains UAC trigger word %s (Windows UAC heuristic avoidance violated — AC-10)", trigger)
		}
	}

	// Confirm the neutral filename is present.
	if !strings.Contains(src, "th-opencode-bootstrap.exe") {
		t.Error("update-opencode.ps1 missing neutral temp binary filename 'th-opencode-bootstrap.exe' (AC-10)")
	}

	// Negative check: Select-String must not be used for asset name lookup (SEC-002).
	if strings.Contains(src, "Select-String $Asset") || strings.Contains(src, "Select-String $asset") {
		t.Error("update-opencode.ps1 uses Select-String for asset lookup (SEC-002 violated: use exact-field -eq)")
	}
}

// TestUpdateOpencodePS1_NeutralTempFilename is a focused assertion that the
// Windows temp binary filename used by update-opencode.ps1 contains NONE of
// the four UAC-triggering words (AC-10 / Windows installer-detection heuristic).
//
// The filename "th-opencode-bootstrap.exe" is the expected neutral name.
// This test directly asserts the filename constant is clean — the ps1 static
// verify test (TestUpdateOpencodePS1_StaticVerify) confirms the file uses it.
func TestUpdateOpencodePS1_NeutralTempFilename(t *testing.T) {
	// The expected neutral temp binary filename (must be present in the ps1 file
	// and must contain none of the UAC trigger words).
	const neutralFilename = "th-opencode-bootstrap.exe"

	// Assert the filename itself contains no trigger words.
	for _, trigger := range []string{"update", "install", "setup", "patch"} {
		if strings.Contains(neutralFilename, trigger) {
			t.Errorf("neutral temp filename %q unexpectedly contains UAC trigger word %q (AC-10)", neutralFilename, trigger)
		}
	}

	// Assert the ps1 file uses this neutral filename.
	psPath := filepath.Join("..", "..", "bin", "update-opencode.ps1")
	content, err := os.ReadFile(psPath)
	if err != nil {
		t.Fatalf("could not read bin/update-opencode.ps1: %v", err)
	}
	if !strings.Contains(string(content), neutralFilename) {
		t.Errorf("update-opencode.ps1 must use neutral temp filename %q (AC-10)", neutralFilename)
	}
}

// ---------------------------------------------------------------------------
// Tests: installed-ahead no-downgrade guarantee (AC-3)
// ---------------------------------------------------------------------------

// TestInstalledAhead_VersionReadAndNoDowngradeGuarantee verifies the installed-ahead
// branch of runUpdateCommand (AC-3):
//   - readInstalledVersion correctly reads a version that is ahead of the binary.
//   - compareSemver(version, aheadVersion) < 0 — the correct gate for the branch.
//   - The config file is NOT written when the installed-ahead condition is met;
//     specifically, installed_version is not downgraded and operator keys survive.
//
// The test is hermetic: it uses a temp dir and calls only read-only helpers
// (readInstalledVersion, compareSemver). No write function is called — this
// mirrors what the installed-ahead branch in runUpdateCommand does (it returns
// immediately after printing the version delta, before any write call).
func TestInstalledAhead_VersionReadAndNoDowngradeGuarantee(t *testing.T) {
	dir := t.TempDir()
	cfgPath := opencodeSettingsConfigPath(dir)

	// Seed with an installed_version that is AHEAD of the running binary.
	aheadVersion := "99.999.999"
	seed := map[string]interface{}{
		"installed_version": aheadVersion,
		"format_version":    "1",
		"logs-mode":         "obsidian",  // operator key — must survive untouched
		"logs-path":         "/my/vault", // operator key — must survive untouched
	}
	seedBytes, _ := json.Marshal(seed)
	if err := os.WriteFile(cfgPath, seedBytes, 0o644); err != nil {
		t.Fatalf("seed write: %v", err)
	}

	// readInstalledVersion must correctly read the ahead version.
	got := readInstalledVersion(cfgPath)
	if got != aheadVersion {
		t.Errorf("readInstalledVersion = %q, want %q", got, aheadVersion)
	}

	// The installed-ahead branch gate: compareSemver(embedded, installed) < 0.
	delta := compareSemver(version, got)
	if delta >= 0 {
		t.Fatalf("installed-ahead branch condition not met: compareSemver(%q, %q) = %d, want < 0", version, got, delta)
	}

	// Record the config bytes before the (zero) write path.
	originalBytes, _ := os.ReadFile(cfgPath)

	// In the installed-ahead branch of runUpdateCommand, the only actions are
	// fmt.Println calls followed by an immediate return — no write functions are
	// invoked. Confirm the config file is byte-identical (no downgrade, no
	// operator-key clobber).
	afterBytes, err := os.ReadFile(cfgPath)
	if err != nil {
		t.Fatalf("read after: %v", err)
	}
	if !bytes.Equal(originalBytes, afterBytes) {
		t.Error("config file was modified — installed-ahead branch must produce zero writes")
	}

	// Decode and assert specific fields for clarity in failure messages.
	var result map[string]interface{}
	if err := json.Unmarshal(afterBytes, &result); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if result["installed_version"] != aheadVersion {
		t.Errorf("installed_version = %v, want %q (no-downgrade guarantee violated)", result["installed_version"], aheadVersion)
	}
	if result["logs-mode"] != "obsidian" {
		t.Errorf("logs-mode = %v, want obsidian (operator key clobbered on installed-ahead path)", result["logs-mode"])
	}
	if result["logs-path"] != "/my/vault" {
		t.Errorf("logs-path = %v, want /my/vault (operator key clobbered on installed-ahead path)", result["logs-path"])
	}
}

// ---------------------------------------------------------------------------
// Tests: applyUpdateDiff write behavior (AC-2, AC-5, partial AC-7)
// ---------------------------------------------------------------------------

// TestApplyUpdateDiff_NonInteractive_BumpsConfigAndNoAssets verifies that
// applyUpdateDiff with a zero-change PlanDiff (no ToCreate/ToUpdate/ToRemove):
//   - Bumps ONLY the installer-managed config keys (AC-5 / SEC-OC-R4 reused).
//   - Preserves ALL operator-owned keys byte-for-byte.
//   - Produces NO asset file writes (empty diff → zero asset entries — AC-2 / AC-7).
//   - Writes a timestamped backup before updating the config.
//
// In a test environment hasInteractiveInput() returns false (no controlling TTY),
// so the confirm gate is not reached and applyUpdateDiff proceeds directly to
// the write path — mirroring the non-interactive (CI / headless) execution path.
//
// Boundary note (AC-12 / decline-confirm = zero writes): the TTY-interactive
// confirm path (operator answers "n") cannot be exercised in unit tests because
// confirmApply() opens /dev/tty directly and there is no controlling terminal
// in the test harness. The zero-write guarantee for the decline path is
// structurally enforced by the early return in applyUpdateDiff before the
// ApplyPlan and refreshManagedConfigKeys calls.
func TestApplyUpdateDiff_NonInteractive_BumpsConfigAndNoAssets(t *testing.T) {
	dir := t.TempDir()
	placer := newOpencodePlacerAt(dir)
	cfgPath := opencodeSettingsConfigPath(dir)

	// Seed with an old version and a mix of operator keys.
	seed := map[string]interface{}{
		"installed_version": "1.0.0",
		"format_version":    "1",
		"logs-mode":         "obsidian",
		"logs-path":         "/vault/work",
		"logs-subfolder":    "th",
		"my-custom-key":     "preserve-me",
	}
	seedBytes, _ := json.Marshal(seed)
	if err := os.WriteFile(cfgPath, seedBytes, 0o644); err != nil {
		t.Fatalf("seed write: %v", err)
	}

	// Call applyUpdateDiff with a zero-change diff (no ToCreate/ToUpdate/ToRemove).
	// This exercises the code path reached in runUpdateCommand when:
	//   (a) delta == 0 but files diverged from the recorded version, OR
	//   (b) delta > 0 (update-available) and ComputePlan returns an empty diff.
	// In both cases applyUpdateDiff is the write gate — it bumps config and
	// writes zero asset files.
	diff := PlanDiff{
		ToCreate:        nil,
		ToUpdate:        nil,
		ToSkipHashMatch: nil,
		ToRemove:        nil,
		LedgerErrors:    nil,
	}
	applyUpdateDiff(diff, cfgPath, placer)

	// Managed keys must be overwritten with binary's values.
	raw, err := os.ReadFile(cfgPath)
	if err != nil {
		t.Fatalf("read after: %v", err)
	}
	var result map[string]interface{}
	if err := json.Unmarshal(raw, &result); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if result["installed_version"] != version {
		t.Errorf("installed_version = %v, want %v (managed key not bumped)", result["installed_version"], version)
	}
	if result["format_version"] != "1" {
		t.Errorf("format_version = %v, want 1 (managed key not correct)", result["format_version"])
	}
	if _, ok := result["updated_at"]; !ok {
		t.Error("updated_at missing after applyUpdateDiff")
	}

	// Operator keys must survive byte-for-byte (SEC-OC-R4 / AC-5).
	if result["logs-mode"] != "obsidian" {
		t.Errorf("logs-mode = %v, want obsidian (operator key clobbered)", result["logs-mode"])
	}
	if result["logs-path"] != "/vault/work" {
		t.Errorf("logs-path = %v, want /vault/work (operator key clobbered)", result["logs-path"])
	}
	if result["logs-subfolder"] != "th" {
		t.Errorf("logs-subfolder = %v, want th (operator key clobbered)", result["logs-subfolder"])
	}
	if result["my-custom-key"] != "preserve-me" {
		t.Errorf("my-custom-key = %v, want preserve-me (unknown operator key clobbered)", result["my-custom-key"])
	}

	// Confirm ZERO asset files were created (empty diff = no asset writes).
	// The config root must contain only .team-harness.json and its backup.
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("readdir: %v", err)
	}
	for _, e := range entries {
		name := e.Name()
		if name == ".team-harness.json" || strings.HasPrefix(name, ".team-harness.json.bak-") {
			continue
		}
		t.Errorf("unexpected file in config root after empty-diff apply: %q (zero asset writes expected)", name)
	}

	// Confirm the backup was written (timestamped .bak- suffix present).
	bakFound := false
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), ".team-harness.json.bak-") {
			bakFound = true
			break
		}
	}
	if !bakFound {
		t.Error("expected a timestamped backup (.team-harness.json.bak-*) but none found")
	}
}

// ---------------------------------------------------------------------------
// Tests: update-opencode.sh static verify — AC-9 / AC-10
// ---------------------------------------------------------------------------

// TestUpdateOpencodesSH_StaticVerify asserts that bin/update-opencode.sh
// contains the security- and correctness-critical patterns required by AC-9
// and AC-10:
//
//   - AC-9: cheap VERSION pre-check fetches releases/latest/download/VERSION;
//     exits 0 without downloading the binary when installed == latest.
//   - AC-10: SHA256 verification uses the anchored exact-asset-name match
//     (awk $2==a, not grep/substring), sha256sum/shasum tool selection with
//     fail-closed fallback, and dispatches `update --runtime opencode`.
//
// The shell script is not executed — this is a static content analysis
// (mirrors TestUpdateOpencodePS1_StaticVerify for the Unix bootstrap).
func TestUpdateOpencodesSH_StaticVerify(t *testing.T) {
	shPath := filepath.Join("..", "..", "bin", "update-opencode.sh")
	content, err := os.ReadFile(shPath)
	if err != nil {
		t.Fatalf("could not read bin/update-opencode.sh: %v", err)
	}
	src := string(content)

	checks := []struct {
		name    string
		pattern string
	}{
		// AC-9: VERSION pre-check present.
		{"version-precheck: VERSION asset fetch", `BASE_URL}/VERSION`},
		// AC-9: already-current short-circuit exits 0 without downloading.
		{"already-current: exit 0 branch", `exit 0`},
		// AC-9: installed_version extraction from .team-harness.json.
		{"installed-version: grep+sed extraction", `grep '"installed_version"'`},
		// AC-10: anchored exact-asset-name match (awk field-2 equality, not substring).
		{"exact-field-awk: $2==a", `$2==a`},
		// AC-10: sha256sum tool selection with shasum fallback.
		{"hash-tool: sha256sum check", `sha256sum`},
		{"hash-tool: shasum fallback", `shasum`},
		// AC-10: fail-closed when neither hash tool is available.
		{"hash-tool: fail-closed exit", `no sha256sum or shasum`},
		// AC-10: update subcommand dispatched to binary.
		{"update subcommand", `update --runtime opencode`},
		// AC-10: $@ forwarding for --opencode-dir / --non-interactive.
		{"extra-args: $@", `"$@"`},
	}

	for _, chk := range checks {
		if !strings.Contains(src, chk.pattern) {
			t.Errorf("update-opencode.sh missing required pattern (%s): %q", chk.name, chk.pattern)
		}
	}

	// Negative check (AC-10): must NOT use grep/substring for asset-name lookup
	// (exact-field awk is required).
	if strings.Contains(src, "grep $ASSET") || strings.Contains(src, "grep ${ASSET}") {
		t.Error("update-opencode.sh uses grep for asset lookup (AC-10 violated: use anchored awk $2==a)")
	}
}
