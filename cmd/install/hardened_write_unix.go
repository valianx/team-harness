//go:build !windows

package main

import (
	"fmt"
	"os"

	"golang.org/x/sys/unix"
)

// writeLeafNoFollow writes data to dest using O_NOFOLLOW on the leaf open,
// refusing to follow a symlink at the final path component (SEC-DR-3).
func writeLeafNoFollow(data []byte, dest string, executable bool) error {
	mode := os.FileMode(0o644)
	if executable {
		mode = 0o755
	}

	// O_NOFOLLOW: if a symlink was planted at dest between our Lstat walk and
	// this open, the syscall refuses it.
	flags := unix.O_WRONLY | unix.O_CREAT | unix.O_TRUNC | unix.O_NOFOLLOW | unix.O_CLOEXEC
	fd, err := unix.Open(dest, flags, uint32(mode))
	if err != nil {
		return fmt.Errorf("open O_NOFOLLOW %q: %w", dest, err)
	}
	f := os.NewFile(uintptr(fd), dest)
	defer f.Close()

	if _, err := f.Write(data); err != nil {
		return fmt.Errorf("write %q: %w", dest, err)
	}
	return nil
}
