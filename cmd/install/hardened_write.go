package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// hardenedWriteFile writes src bytes to dest using the SEC-DR-3 hardened write
// path. It rejects symlinks / reparse points at every existing path segment
// between configRoot and dest (per-component Lstat walk), then creates missing
// intermediate directories one at a time (NOT os.MkdirAll), and writes the
// leaf with O_NOFOLLOW on POSIX (Windows: reparse-point checked via Lstat).
//
// Security contract (SEC-DR-3-R2):
//   - ONLY the symlink/reparse-point rejection and the per-segment mkdir are
//     transplanted from the data-home security stack.
//   - The current-user-ownership check and exact-0700-mode check from the
//     data-home resolver are NOT applied here — those checks would regress the
//     legitimate claude-code path (~/.claude is 0755 with variable ownership
//     on CI).
//   - O_NOFOLLOW on the leaf write (POSIX only — no-op on Windows; protection
//     on Windows rests on the per-component Lstat reparse-point rejection).
//
// configRoot is the validated config root (from placer.ConfigRoot()); it is
// used only as a reference point for the ancestor walk. The actual security
// check walks from the configRoot to the dest leaf — both must be under the
// same tree.
func hardenedWriteFile(src []byte, dest, configRoot string, executable bool) error {
	// Verify dest is a descendant of configRoot (must be true for all placer
	// destinations, but guard here defensively).
	cleanDest := filepath.Clean(dest)
	cleanRoot := filepath.Clean(configRoot)
	if !isDescendantOf(cleanDest, cleanRoot) {
		return fmt.Errorf("hardened write: destination %q is not under config root %q", cleanDest, cleanRoot)
	}

	// Per-component Lstat walk from configRoot to dest parent — reject symlinks.
	dir := filepath.Dir(cleanDest)
	if err := lstatWalkForWrite(dir, cleanRoot); err != nil {
		return err
	}

	// Create missing intermediate directories one at a time (NOT MkdirAll).
	if err := mkdirAllSegmented(dir); err != nil {
		return fmt.Errorf("hardened write: create dirs %q: %w", dir, err)
	}

	// Write the leaf file with O_NOFOLLOW on POSIX.
	if err := writeLeafNoFollow(src, cleanDest, executable); err != nil {
		return fmt.Errorf("hardened write: write leaf %q: %w", cleanDest, err)
	}
	return nil
}

// isDescendantOf reports whether candidate is the same as base or a descendant.
// Uses cleaned paths with a trailing-separator prefix to avoid false positives
// where base is "foo" and candidate is "foobar".
func isDescendantOf(candidate, base string) bool {
	if candidate == base {
		return true
	}
	sep := string(filepath.Separator)
	prefix := strings.TrimSuffix(base, sep) + sep
	return strings.HasPrefix(candidate, prefix)
}

// lstatWalkForWrite walks the components of dir from the shallowest ancestor
// (just below configRoot) to the leaf, rejecting any component that is a
// symlink or reparse point (SEC-DR-3). Stops at the first non-existent segment.
func lstatWalkForWrite(dir, configRoot string) error {
	// We only need to walk the portion at-or-below configRoot.
	// Start at the configRoot itself and walk each segment toward dir.
	rel, err := filepath.Rel(configRoot, dir)
	if err != nil {
		// If rel fails (different volumes etc.), skip the walk — the configRoot
		// descendant check above already ran.
		return nil
	}
	if rel == "." {
		// dest is directly in configRoot — no intermediate segments to walk.
		return nil
	}

	current := configRoot
	for _, seg := range strings.Split(rel, string(filepath.Separator)) {
		if seg == "" || seg == "." {
			continue
		}
		current = filepath.Join(current, seg)
		fi, err := os.Lstat(current)
		if err != nil {
			if os.IsNotExist(err) {
				break
			}
			return fmt.Errorf("lstat %q: %w", current, err)
		}
		if fi.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("path component %q is a symbolic link — refusing write (SEC-DR-3)", current)
		}
	}
	return nil
}

// mkdirAllSegmented creates each missing directory segment from the shallowest
// to the deepest, one at a time. This replaces os.MkdirAll which follows
// symlinks. Existing directories are silently skipped.
func mkdirAllSegmented(path string) error {
	// Collect segments from root toward path.
	vol := filepath.VolumeName(path)
	rest := path[len(vol):]
	segs := splitSegmentsPath(rest)

	current := vol + string(filepath.Separator)
	for _, seg := range segs {
		if seg == "" {
			continue
		}
		current = filepath.Join(current, seg)
		fi, err := os.Lstat(current)
		if err == nil {
			// Already exists — check it is not a symlink.
			if fi.Mode()&os.ModeSymlink != 0 {
				return fmt.Errorf("path component %q is a symbolic link — refusing mkdir (SEC-DR-3)", current)
			}
			continue
		}
		if !os.IsNotExist(err) {
			return fmt.Errorf("lstat %q: %w", current, err)
		}
		// Create the single directory level.
		if err := os.Mkdir(current, 0o755); err != nil && !os.IsExist(err) {
			return fmt.Errorf("mkdir %q: %w", current, err)
		}
	}
	return nil
}
