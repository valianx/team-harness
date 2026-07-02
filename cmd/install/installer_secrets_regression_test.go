package main

// installer_secrets_regression_test.go — regression tests for PR-B security
// fixes (installer-secrets-at-rest). Commits B1, B2, B3.
//
// B1 (f0e06f6): ~/.claude.json written at 0o600 via atomic temp-file + rename;
//               backup also 0o600.  Tests: writeAtomicSecret (unit) +
//               registerMCPServers (end-to-end, live file and backup).
//
// B2 (911d0fa): malformed ~/.claude.json aborts registerMCPServers with
//               os.Exit(1); the file is never truncated / partially rewritten,
//               preserving all operator top-level keys.
//
// B3 (14418cd): claudeCodePlacer.Place now routes through hardenedWriteFile
//               (symlink reject + O_NOFOLLOW), matching opencode_placer.go.
//               Tests: symlink in parent path caught by lstatWalkForWrite;
//               symlink at leaf caught by O_NOFOLLOW.

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

// ---------------------------------------------------------------------------
// B1 — writeAtomicSecret unit tests
// ---------------------------------------------------------------------------

// TestWriteAtomicSecret_Mode0600 verifies that writeAtomicSecret creates the
// destination at mode 0o600. os.CreateTemp defaults to 0o600 and os.Rename
// preserves the source inode's permissions on POSIX, so the live file is
// always 0o600 regardless of what mode the destination previously had.
func TestWriteAtomicSecret_Mode0600(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("permission bits not enforced on Windows")
	}

	dir := t.TempDir()
	dest := filepath.Join(dir, ".claude.json")
	payload := []byte(`{"mcpServers":{}}` + "\n")

	if err := writeAtomicSecret(dest, payload); err != nil {
		t.Fatalf("writeAtomicSecret: %v", err)
	}

	info, err := os.Stat(dest)
	if err != nil {
		t.Fatalf("stat %q: %v", dest, err)
	}
	if got := info.Mode().Perm(); got != 0o600 {
		t.Errorf("mode = %04o, want 0o600 (B1: secrets-at-rest regression)", got)
	}
}

// TestWriteAtomicSecret_ContentCorrect verifies that the exact payload lands
// in the destination file — no truncation, no corruption.
func TestWriteAtomicSecret_ContentCorrect(t *testing.T) {
	dir := t.TempDir()
	dest := filepath.Join(dir, ".claude.json")
	payload := []byte(`{"mcpServers":{"memory":{"type":"http","url":"https://mcp.example.com/mcp"}}}` + "\n")

	if err := writeAtomicSecret(dest, payload); err != nil {
		t.Fatalf("writeAtomicSecret: %v", err)
	}

	got, err := os.ReadFile(dest)
	if err != nil {
		t.Fatalf("read dest: %v", err)
	}
	if string(got) != string(payload) {
		t.Errorf("content mismatch:\n got  %q\n want %q", got, payload)
	}
}

// TestWriteAtomicSecret_NoTempFileLeak verifies that on a successful write no
// .claude.json.tmp-* staging file is left behind in the parent directory.
// The final os.Rename consumes the temp file atomically; any leftover indicates
// a broken cleanup path that could expose partial secrets.
func TestWriteAtomicSecret_NoTempFileLeak(t *testing.T) {
	dir := t.TempDir()
	dest := filepath.Join(dir, ".claude.json")

	if err := writeAtomicSecret(dest, []byte(`{"foo":"bar"}`+"\n")); err != nil {
		t.Fatalf("writeAtomicSecret: %v", err)
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("read dir %q: %v", dir, err)
	}
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), ".claude.json.tmp-") {
			t.Errorf("temp file leaked after successful write: %s (B1: os.Rename should consume it)", e.Name())
		}
	}
}

// ---------------------------------------------------------------------------
// B1 — registerMCPServers end-to-end: live file and backup at 0o600
// ---------------------------------------------------------------------------

// TestRegisterMCPServers_ClaudeJSON_WrittenAt0600 verifies that the full
// registerMCPServers flow writes ~/.claude.json at 0o600. Before B1 the call
// site used os.WriteFile(path, data, 0o644); after B1 it uses writeAtomicSecret
// whose temp file inherits 0o600 from os.CreateTemp.
func TestRegisterMCPServers_ClaudeJSON_WrittenAt0600(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("permission bits not enforced on Windows")
	}

	_, cleanup := testEnv(t)
	defer cleanup()

	// claudeJSON does not exist yet → a fresh write is triggered.
	mc := memChoice("https://mcp.example.com/mcp", false)
	registerMCPServers("", mc)

	info, err := os.Stat(claudeJSON)
	if err != nil {
		t.Fatalf("stat claudeJSON: %v", err)
	}
	if got := info.Mode().Perm(); got != 0o600 {
		t.Errorf("~/.claude.json mode = %04o, want 0o600 (B1: was 0o644 before fix)", got)
	}
}

// TestRegisterMCPServers_BackupWrittenAt0600 verifies that the timestamped
// backup created by backupClaudeJSON is written at 0o600. Before B1 the
// backup was written at whatever mode os.Create produced (0o644 by default);
// after B1 copyFileRaw is called with explicit 0o600.
func TestRegisterMCPServers_BackupWrittenAt0600(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("permission bits not enforced on Windows")
	}

	tmp, cleanup := testEnv(t)
	defer cleanup()

	// Plant a pre-existing ~/.claude.json with one memory URL.
	writeClaudeJSON(t, map[string]interface{}{
		"mcpServers": map[string]interface{}{
			"memory": memoryHTTP("https://old.example.com/mcp"),
		},
	})

	// Provide a DIFFERENT URL so a write + backup are triggered.
	mc := memChoice("https://new.example.com/mcp", false)
	backup := registerMCPServers("", mc)
	if backup == "" {
		t.Fatal("expected a backup path when the memory URL changes")
	}

	info, err := os.Stat(backup)
	if err != nil {
		t.Fatalf("stat backup %q: %v", backup, err)
	}
	if got := info.Mode().Perm(); got != 0o600 {
		t.Errorf("backup mode = %04o, want 0o600 (B1: copyFileRaw was called with 0o644 before fix)", got)
	}

	_ = tmp // consumed by testEnv
}

// ---------------------------------------------------------------------------
// B-L1 — copyBackupHardened: mode 0o600 and symlink rejection at backup dest
// ---------------------------------------------------------------------------

// TestCopyBackupHardened_Mode0600 verifies that copyBackupHardened creates the
// destination file at mode 0o600. The backup contains the previous bearer token
// and API key, so it must be owner-read/write only — same contract as the live
// ~/.claude.json written by writeAtomicSecret.
func TestCopyBackupHardened_Mode0600(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("permission bits not enforced on Windows")
	}

	dir := t.TempDir()
	src := filepath.Join(dir, "src.json")
	dest := filepath.Join(dir, "dest.json.bak")

	if err := os.WriteFile(src, []byte(`{"mcpServers":{}}`+"\n"), 0o600); err != nil {
		t.Fatalf("setup src: %v", err)
	}

	if err := copyBackupHardened(src, dest, 0o600); err != nil {
		t.Fatalf("copyBackupHardened: %v", err)
	}

	info, err := os.Stat(dest)
	if err != nil {
		t.Fatalf("stat dest: %v", err)
	}
	if got := info.Mode().Perm(); got != 0o600 {
		t.Errorf("backup mode = %04o, want 0o600 (B-L1: backup must protect old bearer token)", got)
	}
}

// TestCopyBackupHardened_RejectsSymlinkAtDest verifies that copyBackupHardened
// refuses to follow a symlink pre-placed at the backup destination path. Without
// O_NOFOLLOW|O_EXCL, an attacker who knows the timestamped backup path could
// redirect the old secret to a path they control.
func TestCopyBackupHardened_RejectsSymlinkAtDest(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("os.Symlink requires elevated privileges on Windows; O_NOFOLLOW is not available (documented residual)")
	}

	dir := t.TempDir()
	outside := t.TempDir() // attacker-controlled escape target

	src := filepath.Join(dir, "src.json")
	if err := os.WriteFile(src, []byte(`{"token":"secret"}`+"\n"), 0o600); err != nil {
		t.Fatalf("setup src: %v", err)
	}

	// Pre-plant a symlink at the backup destination pointing outside dir.
	backupDest := filepath.Join(dir, ".claude.json.bak-20060102-150405")
	escapeTarget := filepath.Join(outside, "stolen-secret.json")
	if err := os.Symlink(escapeTarget, backupDest); err != nil {
		t.Fatalf("create symlink at backup dest: %v", err)
	}

	err := copyBackupHardened(src, backupDest, 0o600)
	if err == nil {
		t.Fatal("copyBackupHardened returned nil — expected symlink at backup dest to be rejected (B-L1)")
	}

	// The escape target must NOT have been written.
	if _, statErr := os.Stat(escapeTarget); !os.IsNotExist(statErr) {
		content, _ := os.ReadFile(escapeTarget)
		t.Errorf("secret was written to escape target through symlink (B-L1 regression): %q", content)
	}
}

// ---------------------------------------------------------------------------
// B2 — malformed ~/.claude.json: os.Exit(1), file not modified
// ---------------------------------------------------------------------------

// TestRegisterMCPServers_MalformedJSON_AbortsWithExitOne verifies that when
// ~/.claude.json exists but contains invalid JSON, registerMCPServers calls
// os.Exit(1) and the file is not modified. Before B2 the unmarshal error was
// silently ignored (fall back to an empty map), causing the subsequent write to
// drop every top-level operator key already in the file.
//
// Uses the standard Go subprocess pattern for testing os.Exit: the test
// re-execs itself with a sentinel env var. In the subprocess, registerMCPServers
// is called against the malformed file and must exit 1. The parent asserts:
//   1. exit code is 1.
//   2. the file is byte-for-byte unchanged (no truncation, no partial write).
func TestRegisterMCPServers_MalformedJSON_AbortsWithExitOne(t *testing.T) {
	const guardEnv = "TH_SUBPROCESS_MALFORMED_B2"

	// ── Subprocess branch ───────────────────────────────────────────────────
	// When this guard is set we ARE the subprocess: patch the path variable and
	// call registerMCPServers. If registerMCPServers returns (it must not),
	// os.Exit(0) lets the parent detect that the early-abort did not trigger.
	if os.Getenv(guardEnv) == "1" {
		claudeJSON = os.Getenv("TH_CLAUDE_JSON")
		forceFlag = false
		registerMCPServers("", memChoice("https://mcp.example.com/mcp", false))
		os.Exit(0) // must never reach here
	}

	// ── Parent branch ───────────────────────────────────────────────────────
	tmp := t.TempDir()
	malformedPath := filepath.Join(tmp, ".claude.json")
	// The file contains a real top-level operator key ("apiPreference") that
	// must NOT be lost when the installer aborts.
	malformedContent := `{not: valid json, "apiPreference": "must-survive"}`
	if err := os.WriteFile(malformedPath, []byte(malformedContent), 0o644); err != nil {
		t.Fatalf("setup malformed file: %v", err)
	}

	// Bound the subprocess so a regression that never reaches os.Exit cannot
	// hang CI indefinitely — the context timeout makes the test fail fast.
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, os.Args[0],
		"-test.run=^TestRegisterMCPServers_MalformedJSON_AbortsWithExitOne$",
	)
	cmd.Env = append(os.Environ(),
		guardEnv+"=1",
		"TH_CLAUDE_JSON="+malformedPath,
	)
	runErr := cmd.Run()
	if ctx.Err() == context.DeadlineExceeded {
		t.Fatal("subprocess timed out after 60s — registerMCPServers may be hanging instead of calling os.Exit(1) (B2 regression)")
	}

	// Subprocess must exit non-zero (registerMCPServers calls os.Exit(1)).
	if runErr == nil {
		t.Fatal("subprocess exited 0 — registerMCPServers should call os.Exit(1) for malformed JSON (B2 regression)")
	}
	var exitErr *exec.ExitError
	if !errors.As(runErr, &exitErr) {
		t.Fatalf("unexpected error type from subprocess: %v", runErr)
	}
	if exitErr.ExitCode() != 1 {
		t.Errorf("subprocess exit code = %d, want 1 (B2: malformed JSON must abort with exit 1)", exitErr.ExitCode())
	}

	// The file must be byte-for-byte unchanged — no truncation, no partial write,
	// no dropped operator keys.
	content, readErr := os.ReadFile(malformedPath)
	if readErr != nil {
		t.Fatalf("read malformed file after subprocess: %v", readErr)
	}
	if string(content) != malformedContent {
		t.Errorf("malformed file was modified despite expected abort — operator keys may have been dropped\n got  %q\n want %q (B2 regression)", content, malformedContent)
	}
}

// ---------------------------------------------------------------------------
// B3 — claudeCodePlacer.Place rejects symlinks via hardenedWriteFile
// ---------------------------------------------------------------------------

// TestClaudeCodePlacer_Place_RejectsSymlinkInParentPath verifies that a
// symlink planted at a path component BELOW configRoot and ABOVE the
// destination file is rejected by lstatWalkForWrite before any write occurs
// (SEC-DR-3 / B3). Before B3, claudeCodePlacer.Place called writeBytesToDest
// (plain os.WriteFile) which would follow the symlink.
func TestClaudeCodePlacer_Place_RejectsSymlinkInParentPath(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("os.Symlink requires elevated privileges on Windows")
	}

	configRoot := t.TempDir()
	outside := t.TempDir() // escape target outside configRoot

	// Plant a symlink at configRoot/evil-dir → outside.
	symlinkDir := filepath.Join(configRoot, "evil-dir")
	if err := os.Symlink(outside, symlinkDir); err != nil {
		t.Fatalf("create symlink in parent path: %v", err)
	}

	placer := newClaudeCodePlacerAt(configRoot)
	_, err := placer.Place([]byte("secret content"), "{config_root}/evil-dir/agent.md", "agent")
	if err == nil {
		t.Fatal("Place returned nil — expected symlink in parent path to be rejected (B3 / SEC-DR-3)")
	}
	if !strings.Contains(err.Error(), "symbolic link") {
		t.Errorf("error does not mention symbolic link: %v\n(B3: lstatWalkForWrite should identify the symlink component)", err)
	}

	// The file must NOT have been created through the symlink.
	escapedPath := filepath.Join(outside, "agent.md")
	if _, statErr := os.Stat(escapedPath); !os.IsNotExist(statErr) {
		t.Error("file was written through symlink into outside/ — directory-symlink escape succeeded (B3 regression)")
	}
}

// TestClaudeCodePlacer_Place_RejectsSymlinkAtLeaf verifies that a symlink
// planted AT the destination file is rejected by the O_NOFOLLOW flag on the
// leaf open (SEC-DR-3 / B3). lstatWalkForWrite checks only parent path
// components; O_NOFOLLOW in writeLeafNoFollow catches a symlink at the leaf
// itself. Before B3 there was no O_NOFOLLOW on the claude-code placer path.
//
// Note: O_NOFOLLOW is a POSIX primitive. On Windows, protection rests on the
// per-component Lstat reparse-point rejection in lstatWalkForWrite; see
// hardened_write_windows.go.
func TestClaudeCodePlacer_Place_RejectsSymlinkAtLeaf(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("O_NOFOLLOW is a no-op on Windows; leaf protection is via Lstat walk (SEC-DR-3 doc)")
	}

	configRoot := t.TempDir()
	outside := t.TempDir() // escape zone outside configRoot

	// Create the parent directory inside configRoot (a real dir, not a symlink).
	agentsDir := filepath.Join(configRoot, "agents")
	if err := os.MkdirAll(agentsDir, 0o755); err != nil {
		t.Fatalf("mkdir agents: %v", err)
	}

	// Plant a symlink at the leaf destination pointing to a file outside configRoot.
	leafSymlink := filepath.Join(agentsDir, "escape.md")
	escapeTarget := filepath.Join(outside, "escape.md")
	if err := os.Symlink(escapeTarget, leafSymlink); err != nil {
		t.Fatalf("create leaf symlink: %v", err)
	}

	placer := newClaudeCodePlacerAt(configRoot)
	_, err := placer.Place([]byte("secret content"), "{config_root}/agents/escape.md", "agent")
	if err == nil {
		t.Fatal("Place returned nil — expected O_NOFOLLOW to reject symlink at leaf (B3 / SEC-DR-3)")
	}

	// The escape target must NOT have been written.
	if _, statErr := os.Stat(escapeTarget); !os.IsNotExist(statErr) {
		content, _ := os.ReadFile(escapeTarget)
		t.Errorf("escape target was written through leaf symlink (B3 regression): %q", content)
	}
}

// ---------------------------------------------------------------------------
// B4 — legacy production leaf writers (copyAgentFile / copyEmbeddedFile)
// route through hardenedWriteFile (finding 5 / B-L2).
//
// B3 hardened claudeCodePlacer.Place, but the production no-subcommand
// claude-code install never calls the placer — it uses copyAgentFile and
// copyEmbeddedFile (installAgents/Skills/Hooks), which wrote via plain
// os.WriteFile / writeBytesToDest and therefore followed symlinks. These
// tests exercise the production leaf writers directly, mirroring the B3
// placer-level assertions.
// ---------------------------------------------------------------------------

// TestCopyAgentFile_RejectsSymlinkInParentPath verifies that copyAgentFile
// rejects a symlink planted at a path component between claudeDir and the
// destination file.
func TestCopyAgentFile_RejectsSymlinkInParentPath(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("os.Symlink requires elevated privileges on Windows")
	}
	_, cleanup := testEnv(t)
	defer cleanup()

	outside := t.TempDir() // escape target outside claudeDir

	if err := os.MkdirAll(claudeDir, 0o755); err != nil {
		t.Fatalf("mkdir claudeDir: %v", err)
	}
	symlinkDir := filepath.Join(claudeDir, "agents")
	if err := os.Symlink(outside, symlinkDir); err != nil {
		t.Fatalf("create symlink in parent path: %v", err)
	}

	stats.Installed, stats.Updated, stats.Unchanged = nil, nil, nil
	destPath := filepath.Join(claudeDir, "agents", "architect.md")
	copyAgentFile("agents/architect.md", destPath, ModeStandard)

	if len(stats.Installed) != 0 {
		t.Error("copyAgentFile reported the file installed despite a symlinked parent component (finding 5 regression)")
	}

	escapedPath := filepath.Join(outside, "architect.md")
	if _, statErr := os.Stat(escapedPath); !os.IsNotExist(statErr) {
		t.Error("file was written through symlink into outside/ — directory-symlink escape succeeded (finding 5 regression)")
	}
}

// TestCopyAgentFile_RejectsSymlinkAtLeaf verifies that copyAgentFile rejects
// a symlink planted at the destination leaf itself.
func TestCopyAgentFile_RejectsSymlinkAtLeaf(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("O_NOFOLLOW is a no-op on Windows; leaf protection is via Lstat walk")
	}
	_, cleanup := testEnv(t)
	defer cleanup()

	outside := t.TempDir()
	agentsDir := filepath.Join(claudeDir, "agents")
	if err := os.MkdirAll(agentsDir, 0o755); err != nil {
		t.Fatalf("mkdir agents: %v", err)
	}

	leafSymlink := filepath.Join(agentsDir, "architect.md")
	escapeTarget := filepath.Join(outside, "architect.md")
	if err := os.Symlink(escapeTarget, leafSymlink); err != nil {
		t.Fatalf("create leaf symlink: %v", err)
	}

	stats.Installed, stats.Updated, stats.Unchanged = nil, nil, nil
	copyAgentFile("agents/architect.md", leafSymlink, ModeStandard)

	if _, statErr := os.Stat(escapeTarget); !os.IsNotExist(statErr) {
		content, _ := os.ReadFile(escapeTarget)
		t.Errorf("escape target was written through leaf symlink (finding 5 regression): %q", content)
	}
}

// TestCopyEmbeddedFile_RejectsSymlinkInParentPath verifies that
// copyEmbeddedFile (the skills/hooks leaf writer) rejects a symlink planted
// at a path component between claudeDir and the destination file.
func TestCopyEmbeddedFile_RejectsSymlinkInParentPath(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("os.Symlink requires elevated privileges on Windows")
	}
	_, cleanup := testEnv(t)
	defer cleanup()

	outside := t.TempDir()

	if err := os.MkdirAll(claudeDir, 0o755); err != nil {
		t.Fatalf("mkdir claudeDir: %v", err)
	}
	symlinkDir := filepath.Join(claudeDir, "hooks")
	if err := os.Symlink(outside, symlinkDir); err != nil {
		t.Fatalf("create symlink in parent path: %v", err)
	}

	stats.Installed, stats.Updated, stats.Unchanged = nil, nil, nil
	destPath := filepath.Join(claudeDir, "hooks", "run-ts-hook.sh")
	copyEmbeddedFile("hooks/run-ts-hook.sh", destPath, true)

	if len(stats.Installed) != 0 {
		t.Error("copyEmbeddedFile reported the file installed despite a symlinked parent component (finding 5 regression)")
	}

	escapedPath := filepath.Join(outside, "run-ts-hook.sh")
	if _, statErr := os.Stat(escapedPath); !os.IsNotExist(statErr) {
		t.Error("file was written through symlink into outside/ — directory-symlink escape succeeded (finding 5 regression)")
	}
}

// TestCopyEmbeddedFile_RejectsSymlinkAtLeaf verifies that copyEmbeddedFile
// rejects a symlink planted at the destination leaf itself.
func TestCopyEmbeddedFile_RejectsSymlinkAtLeaf(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("O_NOFOLLOW is a no-op on Windows; leaf protection is via Lstat walk")
	}
	_, cleanup := testEnv(t)
	defer cleanup()

	outside := t.TempDir()
	hooksDir := filepath.Join(claudeDir, "hooks")
	if err := os.MkdirAll(hooksDir, 0o755); err != nil {
		t.Fatalf("mkdir hooks: %v", err)
	}

	leafSymlink := filepath.Join(hooksDir, "run-ts-hook.sh")
	escapeTarget := filepath.Join(outside, "run-ts-hook.sh")
	if err := os.Symlink(escapeTarget, leafSymlink); err != nil {
		t.Fatalf("create leaf symlink: %v", err)
	}

	stats.Installed, stats.Updated, stats.Unchanged = nil, nil, nil
	copyEmbeddedFile("hooks/run-ts-hook.sh", leafSymlink, true)

	if _, statErr := os.Stat(escapeTarget); !os.IsNotExist(statErr) {
		content, _ := os.ReadFile(escapeTarget)
		t.Errorf("escape target was written through leaf symlink (finding 5 regression): %q", content)
	}
}

// TestCopyEmbeddedFile_ExecutableModeMatchesLegacyBehavior verifies that a
// hook asset installed through copyEmbeddedFile (executable=true) lands at
// mode 0o755 — matching the pre-fix writeBytesToDest behavior (0o644 +
// chmod +0o111) (AC-4).
func TestCopyEmbeddedFile_ExecutableModeMatchesLegacyBehavior(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("permission bits not enforced on Windows")
	}
	_, cleanup := testEnv(t)
	defer cleanup()

	destPath := filepath.Join(claudeDir, "hooks", "run-ts-hook.sh")
	copyEmbeddedFile("hooks/run-ts-hook.sh", destPath, true)

	info, err := os.Stat(destPath)
	if err != nil {
		t.Fatalf("stat %q: %v", destPath, err)
	}
	if got := info.Mode().Perm(); got != 0o755 {
		t.Errorf("hook mode = %04o, want 0o755 (AC-4)", got)
	}
}

// TestCopyAgentFile_ModeMatchesLegacyBehavior verifies that a non-executable
// agent asset installed through copyAgentFile lands at mode 0o644 (AC-4).
func TestCopyAgentFile_ModeMatchesLegacyBehavior(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("permission bits not enforced on Windows")
	}
	_, cleanup := testEnv(t)
	defer cleanup()

	destPath := filepath.Join(claudeDir, "agents", "architect.md")
	copyAgentFile("agents/architect.md", destPath, ModeStandard)

	info, err := os.Stat(destPath)
	if err != nil {
		t.Fatalf("stat %q: %v", destPath, err)
	}
	if got := info.Mode().Perm(); got != 0o644 {
		t.Errorf("agent mode = %04o, want 0o644 (AC-4)", got)
	}
}
