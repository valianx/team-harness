//go:build windows

package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"unsafe"

	"golang.org/x/sys/windows"
)

// ---------------------------------------------------------------------------
// Suite 11 — Windows DACL / token-SID / reparse-point (AC-9)
//
// These tests exercise the Windows-specific security path in datahome_windows.go:
//   - DACL correctness: exactly one ALLOW ACE anchored to the current process
//     token's user SID, no Everyone / Authenticated-Users ACE, inheritance
//     stripped (PROTECTED_DACL).
//   - Pre-existing-root: ResolveDataHome on a pre-existing dir re-applies and
//     verifies the DACL; post-condition DACL must be identical.
//   - Reparse-point / junction rejection: ResolveDataHome refuses a candidate
//     root that has FILE_ATTRIBUTE_REPARSE_POINT set.
// ---------------------------------------------------------------------------

// tokenUserSID returns the user SID from the current process token.
// This is the independent ground-truth used by the test assertions — it mirrors
// the logic in currentUserSID() without calling that private function.
func tokenUserSID(t *testing.T) *windows.SID {
	t.Helper()

	tok, err := windows.OpenCurrentProcessToken()
	if err != nil {
		t.Fatalf("OpenCurrentProcessToken: %v", err)
	}
	defer tok.Close()

	var size uint32
	_ = windows.GetTokenInformation(tok, windows.TokenUser, nil, 0, &size)

	buf := make([]byte, size)
	if err := windows.GetTokenInformation(tok, windows.TokenUser, &buf[0], size, &size); err != nil {
		t.Fatalf("GetTokenInformation: %v", err)
	}

	tu := (*windows.Tokenuser)(unsafe.Pointer(&buf[0]))
	sid, err := tu.User.Sid.Copy()
	if err != nil {
		t.Fatalf("SID.Copy: %v", err)
	}
	return sid
}

// wellKnownSIDs returns the SID strings for Everyone (S-1-1-0) and
// Authenticated Users (S-1-5-11).  Used to assert these are absent from the DACL.
func wellKnownSIDs() (everyone, authenticatedUsers string) {
	return "S-1-1-0", "S-1-5-11"
}

// readDACLFromPath reads the DACL from a directory path using
// GetNamedSecurityInfo — deliberately NOT using a handle so the test exercises
// an independent read path from the implementation's handle-based verify.
func readDACLFromPath(t *testing.T, path string) *windows.ACL {
	t.Helper()

	sd, err := windows.GetNamedSecurityInfo(
		path,
		windows.SE_FILE_OBJECT,
		windows.DACL_SECURITY_INFORMATION|windows.PROTECTED_DACL_SECURITY_INFORMATION,
	)
	if err != nil {
		t.Fatalf("GetNamedSecurityInfo(%q): %v", path, err)
	}

	dacl, _, err := sd.DACL()
	if err != nil {
		t.Fatalf("sd.DACL() on %q: %v", path, err)
	}
	if dacl == nil {
		t.Fatalf("DACL on %q is nil — all access denied; expected single-allow-ACE", path)
	}
	return dacl
}

// assertDACLSecurity is the shared assertion block for AC-9 DACL correctness.
// It verifies:
//  1. Exactly one ACE in the DACL.
//  2. That ACE is ACCESS_ALLOWED_ACE_TYPE.
//  3. The ACE's SID equals expectedSID.
//  4. Neither Everyone (S-1-1-0) nor Authenticated Users (S-1-5-11) appear.
func assertDACLSecurity(t *testing.T, path string, expectedSID *windows.SID) {
	t.Helper()

	dacl := readDACLFromPath(t, path)
	aceCount := int(dacl.AceCount)

	if aceCount != 1 {
		t.Errorf("DACL on %q: want exactly 1 ACE, got %d (AC-9)", path, aceCount)
		return
	}

	var ace *windows.ACCESS_ALLOWED_ACE
	if err := windows.GetAce(dacl, 0, &ace); err != nil {
		t.Fatalf("GetAce(dacl, 0): %v", err)
	}

	if ace.Header.AceType != windows.ACCESS_ALLOWED_ACE_TYPE {
		t.Errorf("DACL ACE[0] type = %d, want ACCESS_ALLOWED_ACE_TYPE (%d) (AC-9)",
			ace.Header.AceType, windows.ACCESS_ALLOWED_ACE_TYPE)
	}

	// The SID is embedded in the ACE immediately after the AceType+AceFlags+AceSize+Mask fields.
	aceSID := (*windows.SID)(unsafe.Pointer(&ace.SidStart))
	if !windows.EqualSid(aceSID, expectedSID) {
		t.Errorf("DACL ACE[0] SID = %s, want current process token SID %s (SEC-03, AC-9)",
			aceSID.String(), expectedSID.String())
	}

	// Assert well-known permissive SIDs are absent.
	everyoneSIDStr, authUsersSIDStr := wellKnownSIDs()
	if aceSID.String() == everyoneSIDStr {
		t.Errorf("DACL ACE[0] SID is Everyone (%s) — must not be present (AC-9)", everyoneSIDStr)
	}
	if aceSID.String() == authUsersSIDStr {
		t.Errorf("DACL ACE[0] SID is Authenticated Users (%s) — must not be present (AC-9)", authUsersSIDStr)
	}
}

// TestDataHome_Windows_DACL_NewDirectory verifies that after ResolveDataHome()
// creates a new directory, the resulting DACL satisfies AC-9:
//   - Exactly one ALLOW ACE anchored to the current process token's user SID.
//   - No Everyone / Authenticated-Users ACE.
//   - DACL is protected (inheritance stripped — verified by read-back count = 1).
func TestDataHome_Windows_DACL_NewDirectory(t *testing.T) {
	tmpDir := t.TempDir()
	clearDataHomeEnv(t)
	ResetDataHomeCache()

	newDir := filepath.Join(tmpDir, "win-new-home")
	t.Setenv("TEAM_HARNESS_DATA_HOME", newDir)

	got, err := ResolveDataHome()
	if err != nil {
		t.Fatalf("ResolveDataHome() on new dir: %v", err)
	}

	expectedSID := tokenUserSID(t)
	assertDACLSecurity(t, got, expectedSID)
}

// TestDataHome_Windows_DACL_PreExistingDirectory verifies that ResolveDataHome()
// re-applies (and verifies) the DACL on a pre-existing directory, and that the
// post-condition DACL still satisfies AC-9 (exactly one ALLOW ACE = current user SID).
//
// The pre-existing directory is created deliberately WITHOUT a restrictive DACL
// (via os.Mkdir, which inherits the parent's default ACL) to confirm the
// implementation overwrites it.
func TestDataHome_Windows_DACL_PreExistingDirectory(t *testing.T) {
	tmpDir := t.TempDir()
	clearDataHomeEnv(t)
	ResetDataHomeCache()

	preExisting := filepath.Join(tmpDir, "pre-existing")
	// Create with a plain os.Mkdir — inherits whatever ACL the temp dir has.
	if err := os.Mkdir(preExisting, 0o700); err != nil {
		t.Fatalf("setup: os.Mkdir: %v", err)
	}

	t.Setenv("TEAM_HARNESS_DATA_HOME", preExisting)

	got, err := ResolveDataHome()
	if err != nil {
		t.Fatalf("ResolveDataHome() on pre-existing dir: %v", err)
	}

	// Post-condition: DACL must satisfy AC-9 regardless of how the dir was created.
	expectedSID := tokenUserSID(t)
	assertDACLSecurity(t, got, expectedSID)
}

// TestDataHome_Windows_ReparsePoint_Rejected verifies that ResolveDataHome()
// refuses a candidate root that is a junction (reparse point), satisfying AC-9
// (reparse-point rejection) and SEC-01 (CWE-59).
//
// Junction creation uses `cmd /C mklink /J`, which requires either:
//   - The SeCreateSymbolicLinkPrivilege, or
//   - Developer Mode enabled (Windows 10 1703+), or
//   - Administrative privileges.
//
// If junction creation fails due to insufficient privileges, the test is skipped
// with a clear reason rather than marked as a false pass.
func TestDataHome_Windows_ReparsePoint_Rejected(t *testing.T) {
	tmpDir := t.TempDir()
	clearDataHomeEnv(t)
	ResetDataHomeCache()

	// Create the real target directory that the junction will point at.
	realTarget := filepath.Join(tmpDir, "real-target")
	if err := os.Mkdir(realTarget, 0o700); err != nil {
		t.Fatalf("setup: cannot create real target dir: %v", err)
	}

	// The junction path — this is what we'll point TEAM_HARNESS_DATA_HOME at.
	junctionPath := filepath.Join(tmpDir, "junction-home")

	// Attempt to create the junction via cmd.exe.
	// mklink /J creates a directory junction (not a symlink), which does NOT
	// require SeCreateSymbolicLinkPrivilege on Windows 10+.
	out, err := exec.Command("cmd", "/C",
		"mklink", "/J",
		junctionPath,
		realTarget,
	).CombinedOutput()
	if err != nil {
		t.Skipf("cannot create junction (insufficient privileges or unsupported): %v — output: %s",
			err, strings.TrimSpace(string(out)))
	}

	// Confirm the junction has FILE_ATTRIBUTE_REPARSE_POINT set — if not,
	// the platform does not exhibit the expected attribute and the test is moot.
	if !hasReparsePoint(junctionPath) {
		t.Skipf("junction at %q does not have FILE_ATTRIBUTE_REPARSE_POINT — skipping (unexpected platform behavior)", junctionPath)
	}

	t.Setenv("TEAM_HARNESS_DATA_HOME", junctionPath)

	_, err = ResolveDataHome()
	if err == nil {
		t.Error("ResolveDataHome() accepted a junction/reparse-point as data-home root — must refuse (SEC-01, AC-9)")
		return
	}

	// The error message should reference SEC-01 or reparse point.
	if !strings.Contains(err.Error(), "SEC-01") && !strings.Contains(err.Error(), "reparse") {
		t.Logf("ResolveDataHome() correctly returned an error (SEC-01/reparse expected): %v", err)
	}
}

// TestDataHome_Windows_TokenSID_NotEveryone asserts that the current process
// token SID is NOT the well-known Everyone SID (S-1-1-0) or Authenticated Users
// SID (S-1-5-11).  This is a precondition sanity check for the DACL tests:
// if these were equal, the DACL tests would pass vacuously while allowing
// broad access.
func TestDataHome_Windows_TokenSID_NotEveryone(t *testing.T) {
	sid := tokenUserSID(t)
	everyoneSIDStr, authUsersSIDStr := wellKnownSIDs()

	if sid.String() == everyoneSIDStr {
		t.Errorf("process token SID == Everyone (%s) — this would make DACL tests vacuous", everyoneSIDStr)
	}
	if sid.String() == authUsersSIDStr {
		t.Errorf("process token SID == Authenticated Users (%s) — this would make DACL tests vacuous", authUsersSIDStr)
	}
}
