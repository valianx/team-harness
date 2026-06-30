//go:build windows

package main

import (
	"fmt"
	"os"
)

// writeLeafNoFollow writes data to dest on Windows.
// O_NOFOLLOW is a no-op on Windows (documented residual, per-plan SEC-DR-3).
// Protection on Windows rests on the per-component Lstat reparse-point
// rejection that runs in lstatWalkForWrite before this write.
func writeLeafNoFollow(data []byte, dest string, executable bool) error {
	mode := os.FileMode(0o644)
	if executable {
		mode = 0o755
	}
	if err := os.WriteFile(dest, data, mode); err != nil {
		return fmt.Errorf("write %q: %w", dest, err)
	}
	return nil
}

// copyBackupHardened reads src and writes its contents to dest using O_EXCL so
// a pre-created file at the backup path is rejected. O_NOFOLLOW is not available
// on Windows (documented residual — see hardened_write_windows.go); symlink
// protection on Windows rests on the caller's use of Lstat-based checks.
func copyBackupHardened(src, dest string, mode os.FileMode) error {
	data, err := os.ReadFile(src)
	if err != nil {
		return fmt.Errorf("read source %q: %w", src, err)
	}
	out, err := os.OpenFile(dest, os.O_WRONLY|os.O_CREATE|os.O_EXCL, mode)
	if err != nil {
		return fmt.Errorf("open O_EXCL %q: %w", dest, err)
	}
	defer out.Close()
	if _, wErr := out.Write(data); wErr != nil {
		return fmt.Errorf("write %q: %w", dest, wErr)
	}
	return nil
}
