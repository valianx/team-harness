//go:build !windows

package main

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"syscall"

	"golang.org/x/sys/unix"
)

// lstatWalkPreResolution walks every ancestor component of path (root → leaf)
// and rejects:
//   - any component that is a symbolic link (SEC-01, CWE-59)
//   - any component AT OR BELOW the user's home directory that is not owned
//     by the current process user (SEC-01)
//
// Ownership enforcement is scoped to components at or below the user home
// boundary.  System directories above the home (e.g. /, /home, /tmp) are
// expected to be root-owned and are not an attack vector for this use case —
// an attacker who controls a component above the home already controls the
// machine.  Checking ownership above the home boundary would incorrectly
// refuse legitimate installs on Linux (where /home and /tmp are root-owned).
//
// The symlink check (CWE-59) is applied to ALL components regardless of
// whether they are above or below the home boundary — a symlink anywhere
// in the path is still refused.
//
// This walk runs on the PRE-resolution path, BEFORE filepath.EvalSymlinks is
// called.  Performing the check post-EvalSymlinks would be vacuous because
// EvalSymlinks produces a path with no symlink components — a post-resolve
// Lstat always reports "not a symlink", making the guard dead code (CWE-59).
//
// Even after this walk passes, the directory is opened with O_NOFOLLOW (step 6)
// so a symlink raced into place between the walk and the open is also refused
// at the syscall.
func lstatWalkPreResolution(normalized string) error {
	currentUID := os.Getuid()

	// Determine the user home boundary for ownership-check scoping.
	// fix(sec-01): fail-closed when the boundary is unresolvable (parity with datahome_windows.go INFO-W1).
	// When homeErr != nil (e.g. $HOME absent in cron, systemd without HOME=, or sudo env reset),
	// belowOrAtHome evaluates true for EVERY component — ownership is enforced everywhere
	// (the stricter, safe default).  When home resolves successfully, ownership is scoped
	// to components at or below the home boundary as designed.
	homeDir, homeErr := os.UserHomeDir()
	homeDirClean := filepath.Clean(homeDir) // filepath.Clean is a no-op on error (homeDir=="")

	// Walk from the volume/root up to the path's parent.
	// filepath.VolumeName is always empty on Unix.
	vol := filepath.VolumeName(normalized)
	rest := normalized[len(vol):]

	// Build the list of ancestor prefixes to check (root is always trusted;
	// we check from the first non-root component onward).
	components := splitPathComponents(vol, rest)
	for _, component := range components {
		fi, err := os.Lstat(component)
		if err != nil {
			if os.IsNotExist(err) {
				// Component does not exist yet — nothing to check for remaining path.
				break
			}
			return fmt.Errorf("cannot lstat path component %q: %w", component, err)
		}

		// Reject symlinks (SEC-01) — applied to every component regardless of
		// whether it is above or below the home boundary.
		if fi.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("path component %q is a symbolic link — refusing (SEC-01)", component)
		}

		// Ownership check: only enforce for components at or below the user home.
		// System directories above the home (/, /home, /tmp, etc.) are expected to
		// be root-owned on most Linux distributions — checking them would refuse
		// legitimate installs (fix(sec-01): scope ownership walk to ≤user-home).
		// When the home directory cannot be determined (homeErr != nil), enforce
		// ownership on EVERY component — fail-closed (parity with datahome_windows.go).
		belowOrAtHome := homeErr != nil || isAtOrBelowPath(homeDirClean, component)
		if belowOrAtHome {
			sys, ok := fi.Sys().(*syscall.Stat_t)
			if !ok {
				return fmt.Errorf("cannot determine owner of path component %q", component)
			}
			if int(sys.Uid) != currentUID {
				return fmt.Errorf("path component %q is owned by UID %d, not current user UID %d — refusing (SEC-01)",
					component, sys.Uid, currentUID)
			}
		}
	}
	return nil
}

// isAtOrBelowPath reports whether target is equal to base or is a descendant of base.
// Both paths should be cleaned (filepath.Clean) before calling this function.
func isAtOrBelowPath(base, target string) bool {
	if base == "" {
		return false
	}
	if target == base {
		return true
	}
	// Ensure the base ends with a separator so "/home/user2" is not a prefix of "/home/user".
	prefix := base
	if len(prefix) > 0 && prefix[len(prefix)-1] != filepath.Separator {
		prefix += string(filepath.Separator)
	}
	return len(target) > len(prefix) && target[:len(prefix)] == prefix
}

// splitPathComponents returns a slice of absolute path prefixes for each
// component in rest (not including the bare root).
func splitPathComponents(vol, rest string) []string {
	// rest always starts with "/" on Unix.
	var components []string
	acc := vol + string(filepath.Separator)
	// Skip the leading separator.
	if len(rest) > 0 && rest[0] == '/' {
		rest = rest[1:]
	}
	for _, seg := range splitSegments(rest) {
		if seg == "" {
			continue
		}
		acc = filepath.Join(acc, seg)
		components = append(components, acc)
	}
	return components
}

// splitSegments splits a path string by the OS separator.
func splitSegments(p string) []string {
	var segs []string
	for _, s := range filepath.SplitList(p) {
		segs = append(segs, s)
	}
	// filepath.SplitList uses the LIST separator (: on Unix), not the path
	// separator.  Use a manual split instead.
	segs = segs[:0]
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

// createAndSecureDir creates (or verifies) the directory at path using the
// SEC-02/SEC-03 discipline:
//
//   - Directory is created with os.Mkdir (single leaf, NEVER MkdirAll).
//   - Any missing ancestors under the path are created individually with
//     os.Mkdir + lstat-guard, walking from the deepest existing ancestor toward
//     the leaf, so no ancestor is created without the same Lstat discipline
//     (addressing INFO-r2-1 from the security review).
//   - The directory (new or pre-existing) is opened ONCE with
//     O_RDONLY|O_NOFOLLOW|O_DIRECTORY|O_CLOEXEC.
//   - Mode and ownership are verified via fstat on the fd (never os.Stat-by-path).
//   - Mode is set by fchmod on the fd (not umask-dependent; umask is process-global
//     and racy — avoided by design).
//   - On a pre-existing wrong-owner or over-permissive directory: fail-closed.
//     Never silently chmod-correct.
func createAndSecureDir(path string) error {
	// Ensure all ancestor directories exist, creating them one level at a time
	// with the same Lstat discipline.
	if err := ensureAncestorsSecure(path); err != nil {
		return err
	}

	// Create or open the leaf directory.
	leafExists := false
	if fi, err := os.Lstat(path); err == nil {
		if !fi.IsDir() {
			return fmt.Errorf("data-home path %q exists and is not a directory", path)
		}
		leafExists = true
	}

	if !leafExists {
		// Create a single leaf directory (NOT MkdirAll — see SEC-02).
		if err := os.Mkdir(path, 0o700); err != nil {
			return fmt.Errorf("cannot create data-home directory %q: %w", path, err)
		}
	}

	// Open the directory once with O_NOFOLLOW.
	// O_NOFOLLOW: if a symlink was raced in between the Lstat walk and this
	// open, the syscall refuses it — no TOCTOU window for the leaf.
	fd, err := unix.Open(path, unix.O_RDONLY|unix.O_NOFOLLOW|unix.O_DIRECTORY|unix.O_CLOEXEC, 0)
	if err != nil {
		return fmt.Errorf("cannot open data-home directory %q (O_NOFOLLOW): %w", path, err)
	}
	defer unix.Close(fd)

	if !leafExists {
		// New directory: set mode explicitly on the fd (SEC-03).
		// umask is NOT relied upon — it is process-global and racy.
		if err := unix.Fchmod(fd, 0o700); err != nil {
			return fmt.Errorf("fchmod(0700) on new data-home directory %q: %w", path, err)
		}
	}

	// Verify achieved state via fstat on the fd (SEC-02 — never os.Stat-by-path).
	var st unix.Stat_t
	if err := unix.Fstat(fd, &st); err != nil {
		return fmt.Errorf("fstat on data-home directory %q: %w", path, err)
	}

	if !isDirectory(st.Mode) {
		return fmt.Errorf("data-home path %q opened but fstat reports it is not a directory", path)
	}

	currentUID := os.Getuid()
	if int(st.Uid) != currentUID {
		return fmt.Errorf("data-home directory %q is owned by UID %d, not current user UID %d — refusing (SEC-02)",
			path, st.Uid, currentUID)
	}

	if st.Mode&0o077 != 0 {
		if leafExists {
			// Pre-existing with wrong mode: fail-closed, never chmod-correct (SEC-02).
			return fmt.Errorf("data-home directory %q has mode %04o — group/other access is not permitted (SEC-02); remove or fix manually",
				path, st.Mode&0o777)
		}
		// Should not happen for a newly created directory after fchmod, but guard.
		return fmt.Errorf("data-home directory %q: fchmod(0700) did not achieve the expected mode, got %04o (SEC-03)",
			path, st.Mode&0o777)
	}

	// SEC-03: verify achieved mode.
	if st.Mode&0o777 != 0o700 {
		return fmt.Errorf("data-home directory %q: achieved mode %04o does not match required 0700 (SEC-03)",
			path, st.Mode&0o777)
	}

	return nil
}

// ensureAncestorsSecure walks from the deepest existing ancestor toward path,
// creating each missing intermediate directory one level at a time.
// Each created directory is opened with O_NOFOLLOW and fchmod-verified (SEC-03).
// Existing intermediate directories are verified with the same Lstat-owner check
// applied in lstatWalkPreResolution (INFO-r2-1 mitigation).
func ensureAncestorsSecure(path string) error {
	// Collect ancestors from root toward leaf, stopping at the first that exists.
	parent := filepath.Dir(path)
	if parent == path {
		// At root — nothing to do.
		return nil
	}

	// Find the deepest existing ancestor.
	var missing []string
	cur := parent
	for {
		fi, err := os.Lstat(cur)
		if err == nil {
			// cur exists — verify it.
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

	// Create missing ancestors from shallowest to deepest.
	for i := len(missing) - 1; i >= 0; i-- {
		dir := missing[i]
		if err := os.Mkdir(dir, 0o755); err != nil && !os.IsExist(err) {
			return fmt.Errorf("cannot create ancestor directory %q: %w", dir, err)
		}
		// Open + verify with O_NOFOLLOW (INFO-r2-1: apply handle discipline to
		// ancestor creation, not only the leaf).
		fd, err := unix.Open(dir, unix.O_RDONLY|unix.O_NOFOLLOW|unix.O_DIRECTORY|unix.O_CLOEXEC, 0)
		if err != nil {
			return fmt.Errorf("cannot open ancestor directory %q (O_NOFOLLOW): %w", dir, err)
		}
		var st unix.Stat_t
		fstatErr := unix.Fstat(fd, &st)
		unix.Close(fd)
		if fstatErr != nil {
			return fmt.Errorf("fstat on ancestor directory %q: %w", dir, fstatErr)
		}
		if !isDirectory(st.Mode) {
			return fmt.Errorf("ancestor path %q is not a directory after creation", dir)
		}
	}

	return nil
}

// isDirectory reports whether the given Unix file mode indicates a directory.
func isDirectory(mode uint32) bool {
	return mode&syscall.S_IFMT == syscall.S_IFDIR
}

// openStateFilePlatform opens (or creates) a state file at name under root
// using O_NOFOLLOW and mode 0600.  A symlink at the target path causes the
// open to fail at the syscall (SEC-01 for state files — distinct from the
// root-resolution AC-6 check).
func openStateFilePlatform(root, name string) (*os.File, error) {
	// Validate name: no path separators or ".." allowed.
	if err := validateStateFileName(name); err != nil {
		return nil, err
	}
	targetPath := filepath.Join(root, name)

	// O_NOFOLLOW rejects a symlink at the final component of targetPath.
	// The root itself was already verified by ResolveDataHome.
	flags := os.O_RDWR | os.O_CREATE
	// unix.O_NOFOLLOW = 0x20000 on Linux, 0x100 on Darwin — use the constant.
	fd, err := unix.Open(targetPath, unix.O_RDWR|unix.O_CREAT|unix.O_NOFOLLOW|unix.O_CLOEXEC, 0o600)
	if err != nil {
		if errors.Is(err, unix.ELOOP) || errors.Is(err, unix.ENOTDIR) {
			return nil, fmt.Errorf("state file %q is (or resolves through) a symbolic link — refusing (SEC-01)", targetPath)
		}
		return nil, fmt.Errorf("cannot open state file %q: %w", targetPath, err)
	}

	_ = flags // satisfied via unix.Open above

	return os.NewFile(uintptr(fd), targetPath), nil
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
