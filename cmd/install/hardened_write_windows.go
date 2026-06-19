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
