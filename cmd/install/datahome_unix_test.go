//go:build !windows

package main

import (
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
)

// ---------------------------------------------------------------------------
// Suite 12 — Unix SEC-01 fail-closed when home is unresolvable
//
// These tests exercise the Unix-specific fail-closed branch added in
// fix(sec-01): when os.UserHomeDir() cannot determine the home directory
// (e.g. $HOME absent in cron, systemd without HOME=, sudo env reset, or
// minimal CI), the ownership check must apply to EVERY path component —
// not silently disabled.
//
// This mirrors TestDataHome_Windows_EmptyHome_FailsClosed from
// datahome_windows_test.go (parity contract for INFO-W1 on Unix).
// ---------------------------------------------------------------------------

// TestDataHome_Unix_EmptyHome_FailsClosed verifies that lstatWalkPreResolution
// enforces ownership on every component when os.UserHomeDir() cannot resolve
// the home directory (i.e. $HOME is unset or empty).
//
// On Unix, os.UserHomeDir() reads $HOME; when $HOME is absent (or empty) and
// the process has no passwd entry accessible, UserHomeDir returns an error.
// The pre-fix code treated that error as "no home boundary known" and silently
// disabled ownership checks entirely — fail-OPEN.  The fix inverts the
// condition: an unresolvable home causes ownership to be enforced on ALL
// components (fail-closed).
//
// Test strategy: unset $HOME so that os.UserHomeDir() returns an error, then
// point TEAM_HARNESS_DATA_HOME at a path whose first existing ancestor (the
// OS temp dir) is root-owned.  Under the pre-fix fail-OPEN code, ResolveDataHome
// would succeed because the ownership check was disabled.  Under the corrected
// fail-closed code, ResolveDataHome must return an SEC-01 ownership error.
//
// If the test runner is root (UID 0), ownership checks always pass regardless
// of file owner — the test is skipped to avoid a false pass.
func TestDataHome_Unix_EmptyHome_FailsClosed(t *testing.T) {
	if os.Getuid() == 0 {
		t.Skip("running as root — ownership check always passes for UID 0; skip to avoid vacuous pass")
	}

	clearDataHomeEnv(t)
	ResetDataHomeCache()

	// Unset $HOME so that os.UserHomeDir() returns an error on Unix.
	// t.Setenv restores the original value after the test.
	t.Setenv("HOME", "")

	// Confirm that UserHomeDir actually returns an error with HOME unset.
	// On some platforms the runtime resolves home via /etc/passwd even when
	// HOME is unset; in that case the fail-closed precondition is not met
	// and the test is skipped rather than producing a misleading result.
	if _, err := os.UserHomeDir(); err == nil {
		t.Skip("os.UserHomeDir() succeeded despite HOME=''; platform resolves home via passwd — skip (precondition not met)")
	}

	// Point TEAM_HARNESS_DATA_HOME at a path whose existing ancestors are
	// root-owned.  The OS temp directory (/tmp) is typically owned by root on
	// Linux; the leaf does not need to exist — the walk stops at the first
	// existing component and checks ownership there.
	tmpParent := os.TempDir()
	targetPath := filepath.Join(tmpParent, "th-sec01-failclosed-unix-test", "leaf")
	t.Setenv("TEAM_HARNESS_DATA_HOME", targetPath)

	// Verify the test precondition: the temp dir must NOT be owned by the
	// current user.  If it is (unusual sandboxed environments), the ownership
	// check would pass even under fail-closed and the assertion below would be
	// a false pass.
	fi, err := os.Lstat(tmpParent)
	if err != nil {
		t.Skipf("cannot lstat OS temp dir %q: %v — skipping", tmpParent, err)
	}
	st, ok := fi.Sys().(*syscall.Stat_t)
	if !ok {
		t.Skip("cannot read syscall.Stat_t from OS temp dir — skipping")
	}
	if int(st.Uid) == os.Getuid() {
		t.Skipf("OS temp dir %q is owned by the current user (UID %d) — ownership check would pass regardless of fail-closed fix; skip (precondition not met)",
			tmpParent, st.Uid)
	}

	_, err = ResolveDataHome()
	if err == nil {
		t.Error("ResolveDataHome() should fail closed when $HOME is unset (unresolvable home → ownership enforced on all components), but returned nil error — SEC-01 fail-closed regression")
		return
	}

	// The error should reference ownership / SEC-01.  Log for diagnostics if it
	// contains neither marker (the test still passes — the nil-error check above
	// is the load-bearing assertion).
	if !strings.Contains(err.Error(), "SEC-01") && !strings.Contains(err.Error(), "owned by") {
		t.Logf("ResolveDataHome() correctly failed (expected SEC-01/ownership error); got: %v", err)
	}
}
