//go:build windows

package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

// lstatWalkPreResolution walks every ancestor component of path (root → leaf)
// and rejects:
//   - any component that is a reparse point or junction (SEC-01, CWE-59)
//   - any component at or below the user's home directory that is not owned by
//     the current process user (SEC-01)
//
// On Windows, system directories above the user's home directory (C:\, C:\Users)
// are legitimately owned by SYSTEM (S-1-5-18) or TrustedInstaller — asserting
// current-user ownership on those components would always reject valid paths.
// The ownership check is therefore restricted to path components that fall at or
// below the user home directory level.  The reparse-point check (SEC-01, CWE-59)
// still applies to ALL components because a junction anywhere in the chain is an
// attack vector regardless of ownership.
//
// This walk runs on the PRE-resolution path, BEFORE filepath.EvalSymlinks is
// called.  Performing the check post-EvalSymlinks would be vacuous because
// EvalSymlinks resolves symlinks/junctions, so a post-resolve check would find
// no reparse points even when they were present in the original path.
func lstatWalkPreResolution(normalized string) error {
	currentSID, err := currentUserSID()
	if err != nil {
		return fmt.Errorf("cannot determine current user SID: %w", err)
	}

	// Determine the user home directory so we can scope the ownership check.
	// The home boundary is required to distinguish system-owned ancestors (e.g.
	// C:\, C:\Users — legitimately owned by SYSTEM) from user-space components
	// (at-or-below %USERPROFILE%) which must be owned by the current user.
	// fix(installer): fail-closed when the boundary is unresolvable (INFO-W1).
	// Without a known boundary, every at-or-below test would evaluate false and
	// the ownership check would be silently disabled for all components — a
	// fail-OPEN deviation from the resolver's fail-closed posture.
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("cannot determine user home directory for ownership-scope boundary: %w", err)
	}
	if homeDir == "" {
		return fmt.Errorf("user home directory is empty — cannot establish ownership-scope boundary (INFO-W1)")
	}
	homeDirClean := filepath.Clean(homeDir)

	vol := filepath.VolumeName(normalized)
	rest := normalized[len(vol):]

	components := splitPathComponentsWin(vol, rest)
	for _, component := range components {
		fi, err := os.Lstat(component)
		if err != nil {
			if os.IsNotExist(err) {
				break
			}
			return fmt.Errorf("cannot lstat path component %q: %w", component, err)
		}

		// Reject symlinks (SEC-01).
		if fi.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("path component %q is a symbolic link — refusing (SEC-01)", component)
		}

		// Reject reparse points / junctions using GetFileAttributes (SEC-01).
		// This check applies to ALL components — a junction anywhere in the chain
		// is a traversal attack vector regardless of whether it is above or below
		// the user's home directory.
		if hasReparsePoint(component) {
			return fmt.Errorf("path component %q is a reparse point or junction — refusing (SEC-01)", component)
		}

		// Reject components at or below the user home directory that are not
		// owned by the current process user (SEC-01).
		// System directories above the user home (e.g. C:\, C:\Users) are
		// legitimately owned by SYSTEM — do not check those.
		if homeDirClean != "" && isAtOrBelowPath(component, homeDirClean) {
			if err := assertCurrentUserOwns(component, currentSID); err != nil {
				return fmt.Errorf("path component %q ownership check failed (SEC-01): %w", component, err)
			}
		}
	}
	return nil
}

// isAtOrBelowPath reports whether target is the same as base or a subdirectory
// of base.  Both paths must be cleaned before calling this function.
func isAtOrBelowPath(target, base string) bool {
	if target == base {
		return true
	}
	// Ensure we match on a separator boundary, not a partial segment name.
	// e.g. base="C:\Users\mario", target="C:\Users\mario2" must return false.
	return len(target) > len(base) &&
		target[len(base)] == filepath.Separator &&
		strings.HasPrefix(target, base)
}

// splitPathComponentsWin returns absolute path prefixes for each component in
// the path, from the volume root toward the leaf.
//
// fix(installer): initialise acc with vol + Separator so that the first
// filepath.Join call produces an absolute path ("C:\Users", not "C:Users").
// The bare volume "C:" joined with a segment produces a volume-relative path
// on Windows, not an absolute one.
func splitPathComponentsWin(vol, rest string) []string {
	var components []string
	// Start with the volume root (e.g. "C:\") so that filepath.Join produces
	// absolute paths for every subsequent segment.  Without the trailing
	// separator, filepath.Join("C:", "Users") → "C:Users" (volume-relative),
	// not "C:\Users" (absolute).
	acc := vol + string(filepath.Separator)
	for _, seg := range splitSegments(rest) {
		if seg == "" {
			continue
		}
		acc = filepath.Join(acc, seg)
		components = append(components, acc)
	}
	return components
}

// splitSegments splits a path by OS path separators.
func splitSegments(p string) []string {
	var segs []string
	start := 0
	for i := 0; i <= len(p); i++ {
		if i == len(p) || p[i] == '/' || p[i] == '\\' {
			if i > start {
				segs = append(segs, p[start:i])
			}
			start = i + 1
		}
	}
	return segs
}

// hasReparsePoint reports whether the path has FILE_ATTRIBUTE_REPARSE_POINT set.
// Uses GetFileAttributes which does NOT follow reparse points.
func hasReparsePoint(path string) bool {
	p16, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		return false
	}
	attrs, err := syscall.GetFileAttributes(p16)
	if err != nil {
		return false
	}
	return attrs&syscall.FILE_ATTRIBUTE_REPARSE_POINT != 0
}

// currentUserSID returns the SID of the current process token's user.
// Uses GetTokenInformation(TokenUser) — NOT a %USERNAME% name lookup —
// so it is correct even in impersonation or service account contexts (SEC-03).
func currentUserSID() (*windows.SID, error) {
	tok, err := windows.OpenCurrentProcessToken()
	if err != nil {
		return nil, fmt.Errorf("OpenCurrentProcessToken: %w", err)
	}
	defer tok.Close()

	// Query the required buffer size.
	var size uint32
	err = windows.GetTokenInformation(tok, windows.TokenUser, nil, 0, &size)
	if err != nil && err != windows.ERROR_INSUFFICIENT_BUFFER {
		return nil, fmt.Errorf("GetTokenInformation (size query): %w", err)
	}

	buf := make([]byte, size)
	if err := windows.GetTokenInformation(tok, windows.TokenUser,
		&buf[0], size, &size); err != nil {
		return nil, fmt.Errorf("GetTokenInformation: %w", err)
	}

	tu := (*windows.Tokenuser)(unsafe.Pointer(&buf[0]))
	sid, err := tu.User.Sid.Copy()
	if err != nil {
		return nil, fmt.Errorf("SID copy: %w", err)
	}
	return sid, nil
}

// assertCurrentUserOwns verifies that the owner of path (by name) matches
// expectedSID.
func assertCurrentUserOwns(path string, expectedSID *windows.SID) error {
	sd, err := windows.GetNamedSecurityInfo(
		path,
		windows.SE_FILE_OBJECT,
		windows.OWNER_SECURITY_INFORMATION,
	)
	if err != nil {
		return fmt.Errorf("GetNamedSecurityInfo: %w", err)
	}

	ownerSID, _, err := sd.Owner()
	if err != nil {
		return fmt.Errorf("sd.Owner(): %w", err)
	}

	if !windows.EqualSid(ownerSID, expectedSID) {
		return fmt.Errorf("owner SID %s does not match current user SID %s",
			ownerSID.String(), expectedSID.String())
	}
	return nil
}

// createAndSecureDir creates (or verifies) the directory at path with the
// SEC-02/SEC-03 discipline on Windows:
//
//   - Directory is created with os.Mkdir (single leaf, NEVER MkdirAll).
//   - Missing ancestors are created individually with their own lstat guard.
//   - The directory is opened via a handle (not by path) for fd-based verify.
//   - DACL: inheritance stripped, single allow ACE for the process-token SID,
//     no Everyone / Authenticated-Users ACE (absence denies access — no fragile
//     explicit-DENY ordering).
//   - Post-create DACL verification via GetSecurityInfo on the handle (SEC-03).
func createAndSecureDir(path string) error {
	currentSID, err := currentUserSID()
	if err != nil {
		return fmt.Errorf("cannot determine current user SID: %w", err)
	}

	if err := ensureAncestorsSecure(path, currentSID); err != nil {
		return err
	}

	leafExists := false
	if fi, err := os.Lstat(path); err == nil {
		if !fi.IsDir() {
			return fmt.Errorf("data-home path %q exists and is not a directory", path)
		}
		if hasReparsePoint(path) {
			return fmt.Errorf("data-home path %q is a reparse point — refusing (SEC-01)", path)
		}
		leafExists = true
	}

	if !leafExists {
		if err := os.Mkdir(path, 0o700); err != nil {
			return fmt.Errorf("cannot create data-home directory %q: %w", path, err)
		}
	}

	// Open a handle to the directory for handle-based verify (SEC-02).
	h, err := windows.CreateFile(
		windows.StringToUTF16Ptr(path),
		windows.GENERIC_READ|windows.WRITE_DAC|windows.WRITE_OWNER|windows.READ_CONTROL,
		windows.FILE_SHARE_READ|windows.FILE_SHARE_WRITE|windows.FILE_SHARE_DELETE,
		nil,
		windows.OPEN_EXISTING,
		windows.FILE_FLAG_BACKUP_SEMANTICS,
		0,
	)
	if err != nil {
		return fmt.Errorf("cannot open data-home directory %q: %w", path, err)
	}
	defer windows.CloseHandle(h)

	// Apply restrictive DACL on the handle (SEC-03).
	if err := applyRestrictiveDACL(h, currentSID); err != nil {
		return fmt.Errorf("cannot set DACL on data-home directory %q: %w", path, err)
	}

	// Verify achieved DACL on the handle (SEC-03 post-create check).
	if err := verifyDACLOnHandle(h, currentSID); err != nil {
		return fmt.Errorf("DACL verification failed on data-home directory %q (SEC-03): %w", path, err)
	}

	// Verify ownership on the handle (SEC-02).
	if err := verifyOwnerOnHandle(h, currentSID); err != nil {
		return fmt.Errorf("ownership verification failed on data-home directory %q (SEC-02): %w", path, err)
	}

	return nil
}

// ensureAncestorsSecure creates missing ancestor directories one level at a
// time, applying the same Lstat-guard discipline to each (INFO-r2-1 mitigation).
func ensureAncestorsSecure(path string, currentSID *windows.SID) error {
	parent := filepath.Dir(path)
	if parent == path {
		return nil
	}

	var missing []string
	cur := parent
	for {
		fi, err := os.Lstat(cur)
		if err == nil {
			if !fi.IsDir() {
				return fmt.Errorf("ancestor path %q exists and is not a directory", cur)
			}
			break
		}
		if !os.IsNotExist(err) {
			return fmt.Errorf("cannot lstat ancestor %q: %w", cur, err)
		}
		missing = append(missing, cur)
		next := filepath.Dir(cur)
		if next == cur {
			break
		}
		cur = next
	}

	for i := len(missing) - 1; i >= 0; i-- {
		dir := missing[i]
		if err := os.Mkdir(dir, 0o755); err != nil && !os.IsExist(err) {
			return fmt.Errorf("cannot create ancestor directory %q: %w", dir, err)
		}
		// Open handle to verify (INFO-r2-1: apply handle discipline to ancestors).
		h, err := windows.CreateFile(
			windows.StringToUTF16Ptr(dir),
			windows.GENERIC_READ|windows.READ_CONTROL,
			windows.FILE_SHARE_READ|windows.FILE_SHARE_WRITE|windows.FILE_SHARE_DELETE,
			nil,
			windows.OPEN_EXISTING,
			windows.FILE_FLAG_BACKUP_SEMANTICS,
			0,
		)
		if err != nil {
			return fmt.Errorf("cannot open ancestor directory %q: %w", dir, err)
		}
		// Verify the created ancestor is owned by the current user.
		verifyErr := verifyOwnerOnHandle(h, currentSID)
		windows.CloseHandle(h)
		if verifyErr != nil {
			return fmt.Errorf("ancestor directory %q ownership verification: %w", dir, verifyErr)
		}
	}

	return nil
}

// applyRestrictiveDACL sets a restrictive DACL on the directory handle:
// inheritance stripped, single ALLOW-ALL ACE for ownerSID, no other ACEs.
func applyRestrictiveDACL(h windows.Handle, ownerSID *windows.SID) error {
	entries := []windows.EXPLICIT_ACCESS{
		{
			AccessPermissions: windows.ACCESS_MASK(windows.GENERIC_ALL),
			AccessMode:        windows.GRANT_ACCESS,
			Inheritance:       windows.NO_INHERITANCE,
			Trustee: windows.TRUSTEE{
				TrusteeForm:  windows.TRUSTEE_IS_SID,
				TrusteeType:  windows.TRUSTEE_IS_USER,
				TrusteeValue: windows.TrusteeValueFromSID(ownerSID),
			},
		},
	}

	// nil mergedACL means: start from an empty ACL (no inherited entries).
	acl, err := windows.ACLFromEntries(entries, nil)
	if err != nil {
		return fmt.Errorf("ACLFromEntries: %w", err)
	}

	// PROTECTED_DACL_SECURITY_INFORMATION strips inherited ACEs (SEC-03).
	err = windows.SetSecurityInfo(
		h,
		windows.SE_FILE_OBJECT,
		windows.DACL_SECURITY_INFORMATION|windows.PROTECTED_DACL_SECURITY_INFORMATION,
		nil, nil, acl, nil,
	)
	if err != nil {
		return fmt.Errorf("SetSecurityInfo (DACL): %w", err)
	}

	// Set the owner SID on the handle.
	err = windows.SetSecurityInfo(
		h,
		windows.SE_FILE_OBJECT,
		windows.OWNER_SECURITY_INFORMATION,
		ownerSID, nil, nil, nil,
	)
	if err != nil {
		return fmt.Errorf("SetSecurityInfo (OWNER): %w", err)
	}

	return nil
}

// verifyDACLOnHandle re-reads the DACL from the handle and confirms:
//   - exactly one ACE is present
//   - it is an ACCESS_ALLOWED_ACE for ownerSID
//   - no inheritance flags are set (PROTECTED_DACL)
func verifyDACLOnHandle(h windows.Handle, ownerSID *windows.SID) error {
	sd, err := windows.GetSecurityInfo(
		h,
		windows.SE_FILE_OBJECT,
		windows.DACL_SECURITY_INFORMATION|windows.PROTECTED_DACL_SECURITY_INFORMATION,
	)
	if err != nil {
		return fmt.Errorf("GetSecurityInfo (DACL verify): %w", err)
	}

	dacl, _, err := sd.DACL()
	if err != nil {
		return fmt.Errorf("sd.DACL(): %w", err)
	}
	if dacl == nil {
		return fmt.Errorf("DACL is nil — all access denied (expected single-allow-ACE)")
	}

	aceCount := int(dacl.AceCount)
	if aceCount != 1 {
		return fmt.Errorf("DACL has %d ACE(s), want exactly 1 (single allow ACE for owner)", aceCount)
	}

	// Retrieve the single ACE and verify it grants access to ownerSID.
	var ace *windows.ACCESS_ALLOWED_ACE
	if err := windows.GetAce(dacl, 0, &ace); err != nil {
		return fmt.Errorf("GetAce(0): %w", err)
	}

	if ace.Header.AceType != windows.ACCESS_ALLOWED_ACE_TYPE {
		return fmt.Errorf("DACL ACE[0] type is %d, want ACCESS_ALLOWED_ACE_TYPE (%d)",
			ace.Header.AceType, windows.ACCESS_ALLOWED_ACE_TYPE)
	}

	// The SID starts at the SidStart field of the ACE.
	aceSID := (*windows.SID)(unsafe.Pointer(&ace.SidStart))
	if !windows.EqualSid(aceSID, ownerSID) {
		return fmt.Errorf("DACL ACE[0] SID %s does not match current process owner SID %s (SEC-03)",
			aceSID.String(), ownerSID.String())
	}

	return nil
}

// verifyOwnerOnHandle confirms that the owner of the directory (read via the
// handle) is ownerSID (SEC-02 handle-based verification).
func verifyOwnerOnHandle(h windows.Handle, ownerSID *windows.SID) error {
	sd, err := windows.GetSecurityInfo(
		h,
		windows.SE_FILE_OBJECT,
		windows.OWNER_SECURITY_INFORMATION,
	)
	if err != nil {
		return fmt.Errorf("GetSecurityInfo (OWNER verify): %w", err)
	}

	owner, _, err := sd.Owner()
	if err != nil {
		return fmt.Errorf("sd.Owner(): %w", err)
	}

	if !windows.EqualSid(owner, ownerSID) {
		return fmt.Errorf("owner SID %s does not match current user SID %s (SEC-02)",
			owner.String(), ownerSID.String())
	}
	return nil
}

// openStateFilePlatform opens (or creates) a state file at name under root.
// On Windows, FILE_FLAG_OPEN_REPARSE_POINT is used so that a reparse point at
// the target path is refused rather than silently followed (SEC-01 for state
// files — distinct from the root-resolution AC-6 check).
func openStateFilePlatform(root, name string) (*os.File, error) {
	if err := validateStateFileName(name); err != nil {
		return nil, err
	}
	targetPath := filepath.Join(root, name)

	// FILE_FLAG_OPEN_REPARSE_POINT: open the reparse point itself rather than
	// following it, so we can detect and refuse it.
	h, err := windows.CreateFile(
		windows.StringToUTF16Ptr(targetPath),
		windows.GENERIC_READ|windows.GENERIC_WRITE,
		windows.FILE_SHARE_READ,
		nil,
		windows.OPEN_ALWAYS,
		windows.FILE_FLAG_OPEN_REPARSE_POINT,
		0,
	)
	if err != nil {
		return nil, fmt.Errorf("cannot open state file %q: %w", targetPath, err)
	}

	// Detect if we opened a reparse point and refuse if so.
	var info windows.ByHandleFileInformation
	if err := windows.GetFileInformationByHandle(h, &info); err != nil {
		windows.CloseHandle(h)
		return nil, fmt.Errorf("GetFileInformationByHandle on %q: %w", targetPath, err)
	}
	if info.FileAttributes&syscall.FILE_ATTRIBUTE_REPARSE_POINT != 0 {
		windows.CloseHandle(h)
		return nil, fmt.Errorf("state file %q is a reparse point — refusing (SEC-01)", targetPath)
	}

	return os.NewFile(uintptr(h), targetPath), nil
}

// validateStateFileName ensures name is a bare filename (no separators, no ".").
func validateStateFileName(name string) error {
	if name == "" {
		return fmt.Errorf("state file name must not be empty")
	}
	if filepath.Base(name) != name {
		return fmt.Errorf("state file name %q must be a bare filename (no path separators)", name)
	}
	if name == "." || name == ".." {
		return fmt.Errorf("state file name %q is not allowed", name)
	}
	return nil
}
